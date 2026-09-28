import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { Icon } from '../components/Icons'
import { R, STATUS, FLOW, fmtDateTime } from '../lib/format'

export const Pill = ({ s }) => <span className="pill" style={{ background: STATUS[s][1], color: STATUS[s][2] }}>{STATUS[s][0]}</span>
const needsProof = o => o.order_items && o.order_items.some(i => i.is_custom) && !o.proof_approved_at
const NEXT_LABEL = { awaiting_payment: 'EFT received', paid: 'Mark printed and packed', printed_packed: 'Mark as shipped', shipped: 'Mark as delivered' }

// Moves one order to its next step. Returns an error message or null.
export async function advance(o) {
  const i = FLOW.indexOf(o.status)
  if (i < 0 || i >= FLOW.length - 1) return 'This order is already complete'
  if (o.status === 'paid' && needsProof(o)) return o.order_no + ' has a custom item waiting for proof approval'
  const { error } = await supabase.from('orders').update({ status: FLOW[i + 1] }).eq('id', o.id)
  return error ? error.message : null
}

export function Orders() {
  const { toast, setDoc, refreshCounts } = useAdmin()
  const nav = useNavigate()
  const [tab, setTab] = useState('awaiting_payment')
  const [rows, setRows] = useState(null)
  const [counts, setCounts] = useState({})
  const [sel, setSel] = useState({})
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    let query = supabase.from('orders').select('*, order_items(qty, is_custom), wholesale_clients(business_name)').order('created_at', { ascending: false }).limit(300)
    if (tab !== 'all') query = query.eq('status', tab)
    const { data } = await query
    setRows(data || [])
    const { data: all } = await supabase.from('orders').select('status')
    const c = {}; (all || []).forEach(o => { c[o.status] = (c[o.status] || 0) + 1 }); c.all = (all || []).length; setCounts(c)
  }, [tab])
  useEffect(() => { setRows(null); setSel({}); load() }, [load])

  const selected = (rows || []).filter(o => sel[o.id])
  const bulk = async () => {
    let n = 0; const errs = []
    for (const o of selected) { const e = await advance(o); if (e) errs.push(e); else n++ }
    setSel({}); await load(); refreshCounts()
    toast(n + ' order' + (n === 1 ? '' : 's') + ' moved on' + (errs.length ? '. ' + errs.length + ' held back: ' + errs[0] : ''))
  }
  const s = q.toLowerCase().trim()
  const list = (rows || []).filter(o => !s || (o.order_no + ' ' + o.first_name + ' ' + o.last_name + ' ' + o.email).toLowerCase().includes(s))
  const tabs = [['awaiting_payment', 'Awaiting EFT'], ['paid', 'To print'], ['printed_packed', 'Printed and packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']]
  return (
    <>
      <div className="ahead"><h1>Orders</h1><input type="search" aria-label="Search orders" placeholder="Search by order number, name or email" value={q} onChange={e => setQ(e.target.value)} style={{ minHeight: 46, padding: '0 20px', borderRadius: 50, border: '1px solid var(--line2)', background: '#fff', minWidth: 280 }} /></div>
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l} ({counts[k] || 0})</button>)}</div>
      <div className="bulk"><span>{selected.length} order{selected.length === 1 ? '' : 's'} selected</span>
        {[['packing', 'Print and packing lists'], ['label', 'Courier labels'], ['invoice', 'Invoices']].map(([t, l]) => <button key={t} className="btn light sm" disabled={!selected.length} onClick={() => setDoc({ type: t, ids: selected.map(o => o.id) })}>{l}</button>)}
        <button className="btn sm" style={{ borderColor: '#fff' }} disabled={!selected.length || tab === 'all' || tab === 'delivered' || tab === 'cancelled'} onClick={bulk}>{NEXT_LABEL[tab] || 'Move to next step'}</button>
      </div>
      <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t"><thead><tr><th><button className="tick" aria-label="Select all" aria-pressed={list.length > 0 && selected.length === list.length} onClick={() => { const all = selected.length !== list.length; const m = {}; if (all) list.forEach(o => { m[o.id] = true }); setSel(m) }}>{list.length > 0 && selected.length === list.length ? '✓' : ''}</button></th><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Delivery</th><th>Status</th></tr></thead>
        <tbody>{rows === null ? <tr><td colSpan={8} className="muted" style={{ padding: 28 }}>Loading…</td></tr> : list.length ? list.map(o => (
          <tr key={o.id} className="click" onClick={() => nav('/admin/orders/' + o.order_no)}>
            <td><button className="tick" aria-pressed={!!sel[o.id]} aria-label={'Select ' + o.order_no} onClick={e => { e.stopPropagation(); setSel({ ...sel, [o.id]: !sel[o.id] }) }}>{sel[o.id] ? '✓' : ''}</button></td>
            <td><b>{o.order_no}</b>{o.order_items.some(i => i.is_custom) && <> <span className="pill" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)' }}>Custom</span></>}</td>
            <td className="muted" style={{ fontSize: 14 }}>{fmtDateTime(o.created_at)}</td><td>{o.channel === 'wholesale' ? <><b>{o.wholesale_clients ? o.wholesale_clients.business_name : o.first_name}</b> <span className="pill" style={{ background: 'var(--olive)', color: '#fff' }}>Wholesale</span></> : o.first_name + ' ' + o.last_name}</td>
            <td className="num">{o.order_items.reduce((a, i) => a + i.qty, 0)}</td><td className="num"><b>{R(o.total)}</b></td><td style={{ fontSize: 14 }}>{o.delivery_name}</td><td><Pill s={o.status} /></td>
          </tr>)) : <tr><td colSpan={8} className="muted" style={{ padding: 28 }}>No orders here.</td></tr>}</tbody></table></div></div>
    </>
  )
}

export function OrderDetail() {
  const { no } = useParams()
  const { toast, setDoc, refreshCounts } = useAdmin()
  const [o, setO] = useState(null)
  const [urls, setUrls] = useState({})
  const [imgs, setImgs] = useState({})
  const [track, setTrack] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('orders').select('*, order_items(*), wholesale_clients(business_name, contact_name, vat_number)').eq('order_no', no).maybeSingle()
    setO(data || false); if (data) setTrack(data.tracking_number || '')
    const pids = (data ? data.order_items : []).map(i => i.product_id).filter(Boolean)
    if (pids.length) { const { data: ps } = await supabase.from('products').select('id, image_url').in('id', pids); const m = {}; (ps || []).forEach(p => { m[p.id] = p.image_url }); setImgs(m) }
    const paths = (data ? data.order_items : []).map(i => i.custom_photo_path).filter(Boolean)
    if (paths.length) {
      const { data: su } = await supabase.storage.from('custom-uploads').createSignedUrls(paths, 3600)
      const m = {}; (su || []).forEach(d => { if (d.signedUrl) m[d.path] = d.signedUrl }); setUrls(m)
    }
  }, [no])
  useEffect(() => { load() }, [load])
  if (o === null) return <p className="muted">Loading…</p>
  if (o === false) return <p className="muted">Order not found. <Link to="/admin/orders">Back to orders</Link></p>

  const i = FLOW.indexOf(o.status)
  const custom = o.order_items.some(x => x.is_custom)
  const go = async () => {
    if (o.status === 'printed_packed' && track.trim()) await supabase.from('orders').update({ tracking_number: track.trim() }).eq('id', o.id)
    const e = await advance(o); if (e) { toast(e); return }
    await load(); refreshCounts(); toast(o.order_no + ' moved to the next step')
  }
  const proof = async () => { await supabase.from('orders').update({ proof_approved_at: new Date().toISOString() }).eq('id', o.id); load(); toast('Proof approved, ready to print') }
  const saveTrack = async () => { await supabase.from('orders').update({ tracking_number: track.trim() || null }).eq('id', o.id); load(); toast('Tracking number saved') }
  const ws = o.channel === 'wholesale'
  const canSplit = ws && (o.status === 'awaiting_payment' || o.status === 'paid')
  const setSplit = async (l, v) => {
    const n = Math.max(0, Math.min(l.qty, Math.round(Number(v) || 0)))
    if (n === l.from_stock_qty) return
    const { error } = await supabase.from('order_items').update({ from_stock_qty: n }).eq('id', l.id)
    if (error) { toast(error.message); return }
    load(); toast(l.name + ': ' + n + ' from stock, ' + (l.qty - n) + ' to print')
  }
  const cancel = async () => {
    if (!window.confirm('Cancel order ' + o.order_no + '?' + (ws ? (i >= 2 ? ' The from stock pieces go back on the shelf.' : '') : ' The stock goes back on the shelf.') + ' This cannot be undone.')) return
    const { error } = await supabase.rpc('cancel_order', { p_order_id: o.id })
    if (error) { toast(error.message); return }
    load(); refreshCounts(); toast(o.order_no + ' cancelled')
  }
  const steps = [['Order placed', o.created_at], ['EFT received', o.paid_at]].concat(custom ? [['Proof approved', o.proof_approved_at]] : []).concat([['Printed and packed'], ['Handed to courier'], ['Delivered']])
  const reached = o.status === 'cancelled' ? -1 : !custom ? i : i <= 1 ? i + (i === 1 && o.proof_approved_at ? 1 : 0) : i + 1
  return (
    <>
      <div className="ahead">
        <div className="stack" style={{ gap: 6 }}><Link className="linkbtn" style={{ alignSelf: 'flex-start' }} to="/admin/orders">Back to orders</Link><div className="row"><h1>Order {o.order_no}</h1><Pill s={o.status} />{ws && <span className="pill" style={{ background: 'var(--olive)', color: '#fff' }}>Wholesale</span>}</div><span className="muted" style={{ fontSize: 14 }}>{fmtDateTime(o.created_at)} · EFT</span></div>
        <div className="row">{o.status !== 'cancelled' && o.status !== 'delivered' && <button className="btn" onClick={go}>{NEXT_LABEL[o.status]}</button>}</div>
      </div>
      {o.status === 'awaiting_payment' && <div className="note" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}>Check your bank for an EFT with reference <b>&nbsp;{o.order_no}&nbsp;</b> for {R(o.total)} before you print.</div>}
      {custom && !o.proof_approved_at && o.status !== 'cancelled' && <div className="note" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)', justifyContent: 'space-between', flexWrap: 'wrap' }}><span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Icon.brush /><span><b>Custom item.</b> Design it and send the proof to {o.phone} or {o.email} before printing.</span></span><button className="btn sm" onClick={proof}>Proof approved</button></div>}
      {o.notes && <div className="note"><b>Customer note:</b>&nbsp;{o.notes}</div>}
      <div className="doclinks">{[['invoice', o.status === 'awaiting_payment' ? 'Pro forma invoice' : 'Tax invoice', 'Print or save as PDF', <Icon.doc />], ['packing', 'Print and packing list', 'Tick off as you print and pack', <Icon.list />], ['label', 'Courier label', 'Stick on the parcel', <Icon.truck />]].map(d => <button key={d[0]} className="card doclink" onClick={() => setDoc({ type: d[0], ids: [o.id] })}><span className="circle" style={{ width: 44, height: 44 }}>{d[3]}</span><span style={{ display: 'flex', flexDirection: 'column' }}><b>{d[1]}</b><span className="muted" style={{ fontSize: 13 }}>{d[2]}</span></span></button>)}</div>
      {ws && canSplit && <div className="note"><span><b>Stock or print:</b> set how many of each design come from stock. The rest gets printed. The from stock pieces come off your stock count when you mark the order printed and packed.</span></div>}
      <div className="two">
        <div className="card panel"><h2>Items</h2>
          {o.order_items.map(l => (
            <div className="line" key={l.id}>
              <div className="thumb" style={{ width: 52, height: 52 }}>{l.custom_photo_path && urls[l.custom_photo_path] ? <a href={urls[l.custom_photo_path]} target="_blank" rel="noreferrer"><img src={urls[l.custom_photo_path]} alt="Customer photo" /></a> : imgs[l.product_id] ? <img src={imgs[l.product_id]} alt="" /> : null}</div>
              <div className="info"><b>{l.name}</b><span className="muted" style={{ fontSize: 13 }}>{l.sku}{l.custom_note ? ' · ' + l.custom_note : ''}</span>
                {ws && <div className="row" style={{ gap: 8, marginTop: 6, fontSize: 13, flexWrap: 'nowrap' }}><span className="muted">From stock</span>{canSplit ? <input key={l.id + '-' + l.from_stock_qty} className="cellin" style={{ width: 64, minHeight: 34, textAlign: 'center' }} type="number" min="0" max={l.qty} aria-label={'From stock for ' + l.name} defaultValue={l.from_stock_qty} onBlur={e => setSplit(l, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /> : <b className="num">{l.from_stock_qty}</b>}<span className="muted">·</span><span className="muted">To print</span><b className="num">{l.qty - l.from_stock_qty}</b></div>}
                {l.is_custom && <div><span className="pill" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)', marginTop: 4 }}>{l.custom_photo_path ? 'Customer photo attached, tap to open' : 'Photo to follow'}</span></div>}</div>
              <span className="num">x {l.qty}</span><b className="num" style={{ minWidth: 100, textAlign: 'right' }}>{R(l.unit_price * l.qty)}</b>
            </div>))}
          <div className="stack num" style={{ gap: 8, marginLeft: 'auto', width: 'min(320px,100%)', fontSize: 15 }}>
            <div className="sumrow"><span>Subtotal</span><span>{R(o.subtotal)}</span></div><div className="sumrow"><span>{o.delivery_name}</span><span>{R(o.delivery_fee)}</span></div>
            <div className="sumrow" style={{ fontWeight: 700, fontSize: 18, borderTop: '1px solid #EADFD2', paddingTop: 8 }}><span>Total</span><span>{R(o.total)}</span></div>
          </div>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <div className="card panel" style={{ gap: 6 }}><h2 style={{ fontSize: 24 }}>{ws ? 'Wholesale client' : 'Customer'}</h2>{ws && o.wholesale_clients && <b style={{ fontSize: 17 }}>{o.wholesale_clients.business_name}</b>}<b>{o.first_name} {o.last_name}</b>{ws && o.wholesale_clients && o.wholesale_clients.vat_number ? <span className="muted">VAT {o.wholesale_clients.vat_number}</span> : null}<a href={'mailto:' + o.email}>{o.email}</a><a href={'tel:' + o.phone}>{o.phone}</a><span className="muted">{[o.street, o.suburb, o.city, o.postal_code].filter(Boolean).join(', ')}</span>
            {!ws && <span className="pill" style={{ background: o.customer_id ? 'var(--surface)' : 'var(--grey-bg)', color: o.customer_id ? 'var(--primary-dk)' : 'var(--muted2)', alignSelf: 'flex-start', marginTop: 6 }}>{o.customer_id ? 'Account holder' : 'Guest checkout'}</span>}</div>
          <div className="card panel"><h2 style={{ fontSize: 24 }}>Courier</h2>
            <label className="field" htmlFor="od-track">Tracking or waybill number<input id="od-track" value={track} onChange={e => setTrack(e.target.value)} placeholder="Add when you book the courier" /></label>
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={saveTrack}>Save tracking number</button></div>
          <div className="card panel"><h2 style={{ fontSize: 24 }}>Timeline</h2><div className="tl">{steps.map((st, k) => <div key={st[0]} className={k <= reached ? 'done' : 'todo'}><i />{st[0]}{st[1] ? <span className="muted" style={{ fontSize: 12 }}>&nbsp;· {fmtDateTime(st[1])}</span> : null}</div>)}</div>
            {o.status !== 'cancelled' && o.status !== 'delivered' && <button className="linkbtn" style={{ alignSelf: 'flex-start', color: 'var(--sale)' }} onClick={cancel}>Cancel this order</button>}</div>
        </div>
      </div>
    </>
  )
}
