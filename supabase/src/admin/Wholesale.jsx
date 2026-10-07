import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { Pill } from './Orders'
import { R, fmtDate, fmtDateTime, typeName } from '../lib/format'

const CSTAT = { pending: ['New application', 'var(--warn-bg)', 'var(--warn-fg)'], approved: ['Approved', 'var(--surface)', 'var(--primary-dk)'], declined: ['Declined', 'var(--grey-bg)', 'var(--muted2)'], suspended: ['Paused', '#F8D7CF', '#6B2413'] }
const RSTAT = { new: ['New request', 'var(--warn-bg)', 'var(--warn-fg)'], quoted: ['Quote sent', 'var(--info-bg)', 'var(--info-fg)'], accepted: ['Accepted', 'var(--surface)', 'var(--primary-dk)'], declined: ['Declined', 'var(--grey-bg)', 'var(--muted2)'] }
const P = ({ m, s }) => <span className="pill" style={{ background: m[s][1], color: m[s][2] }}>{m[s][0]}</span>
const addr = c => [c.street, c.suburb, c.city, c.postal_code].filter(Boolean).join(', ')
const FIELDS = [['business_name', 'Business name'], ['contact_name', 'Contact person'], ['email', 'Email'], ['phone', 'Phone'], ['business_type', 'Type of business'], ['vat_number', 'VAT number'], ['street', 'Street address'], ['suburb', 'Suburb'], ['city', 'Town or city'], ['postal_code', 'Postal code']]

export function WholesaleAdmin() {
  const { toast, refreshCounts } = useAdmin()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'applications'
  const [clients, setClients] = useState(null); const [orders, setOrders] = useState([]); const [reqs, setReqs] = useState([]); const [logos, setLogos] = useState({})
  const [edit, setEdit] = useState(null)

  const load = useCallback(async () => {
    const [{ data: cs }, { data: os }, { data: rq }] = await Promise.all([
      supabase.from('wholesale_clients').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('id, order_no, created_at, total, status, wholesale_client_id, order_items(qty)').eq('channel', 'wholesale').order('created_at', { ascending: false }).limit(300),
      supabase.from('branding_requests').select('*').order('created_at', { ascending: false })
    ])
    setClients(cs || []); setOrders(os || []); setReqs(rq || [])
    const paths = (rq || []).map(r => r.logo_path).filter(Boolean)
    if (paths.length) {
      const { data } = await supabase.storage.from('wholesale-logos').createSignedUrls(paths, 3600)
      const m = {}; (data || []).forEach(d => { if (d.signedUrl) m[d.path] = d.signedUrl }); setLogos(m)
    }
  }, [])
  useEffect(() => { load() }, [load])
  if (!clients) return <p className="muted">Loading…</p>

  const C = id => clients.find(c => c.id === id) || {}
  const setStatus = async (c, status, msg) => {
    const { error } = await supabase.from('wholesale_clients').update({ status }).eq('id', c.id)
    if (error) { toast(error.message); return }
    load(); refreshCounts(); toast(msg)
  }
  const saveClient = async () => {
    const row = {}; FIELDS.forEach(([k]) => { row[k] = (edit[k] || '').trim() }); row.admin_notes = edit.admin_notes || ''
    const { error } = await supabase.from('wholesale_clients').update(row).eq('id', edit.id)
    if (error) { toast(error.message); return }
    setEdit(null); load(); toast('Client details saved')
  }
  const setReq = async (r, patch, msg) => {
    const { error } = await supabase.from('branding_requests').update(patch).eq('id', r.id)
    if (error) { toast(error.message); return }
    load(); refreshCounts(); if (msg) toast(msg)
  }

  const pending = clients.filter(c => c.status === 'pending')
  const others = clients.filter(c => c.status !== 'pending')
  const newReqs = reqs.filter(r => r.status === 'new').length
  const tabs = [['applications', 'Applications (' + pending.length + ')'], ['clients', 'Clients (' + others.length + ')'], ['orders', 'Wholesale orders (' + orders.length + ')'], ['branding', 'Branding requests (' + newReqs + ' new)']]

  return (
    <>
      <div className="ahead"><div><h1>Wholesale</h1><p className="muted">Approve new trade clients, see their orders and quote on custom branding. Wholesale orders are managed in Orders like any other order.</p></div></div>
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setSp({ tab: k }, { replace: true })}>{l}</button>)}</div>

      {tab === 'applications' && (pending.length ? <div className="pgrid three">{pending.map(c => (
        <div className="card panel" key={c.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}><P m={CSTAT} s="pending" /><span className="muted" style={{ fontSize: 13 }}>{fmtDate(c.created_at)}</span></div>
          <h2 style={{ fontSize: 26 }}>{c.business_name}</h2>
          <span className="muted" style={{ fontSize: 14 }}>{[c.business_type, c.city].filter(Boolean).join(' · ')}</span>
          <span style={{ fontSize: 14 }}>{c.contact_name}<br /><a href={'mailto:' + c.email}>{c.email}</a><br /><a href={'tel:' + c.phone}>{c.phone}</a></span>
          <span className="muted" style={{ fontSize: 13 }}>{addr(c)}{c.vat_number ? ' · VAT ' + c.vat_number : ''}</span>
          {c.message && <p className="muted" style={{ fontSize: 14, padding: 12, background: 'var(--soft)' }}>{c.message}</p>}
          <div className="row"><button className="btn sm" onClick={() => setStatus(c, 'approved', c.business_name + ' approved. Let them know they can sign in and order.')}>Approve</button><button className="btn ghost sm" onClick={() => setStatus(c, 'declined', 'Application from ' + c.business_name + ' declined')}>Decline</button></div>
        </div>))}</div> : <p className="muted">No applications waiting.</p>)}

      {tab === 'clients' && <>
        {edit && <div className="card panel">
          <div className="ahead"><h2 style={{ fontSize: 26 }}>Edit {edit.business_name}</h2><div className="row"><button className="btn sm" onClick={saveClient}>Save</button><button className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button></div></div>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>{FIELDS.map(([k, l]) => <label key={k} className="field" htmlFor={'wc-' + k}>{l}<input id={'wc-' + k} value={edit[k] || ''} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></label>)}</div>
          <label className="field" htmlFor="wc-notes">Your private notes<textarea id="wc-notes" rows={2} value={edit.admin_notes || ''} onChange={e => setEdit({ ...edit, admin_notes: e.target.value })} /></label>
        </div>}
        <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t" style={{ minWidth: 900 }}>
          <thead><tr><th>Business</th><th>Contact</th><th>Town</th><th>Orders</th><th>Total ordered</th><th>Status</th><th></th></tr></thead>
          <tbody>{others.length ? others.map(c => {
            const os = orders.filter(o => o.wholesale_client_id === c.id && o.status !== 'cancelled')
            return (
              <tr key={c.id}>
                <td><b>{c.business_name}</b><div className="muted" style={{ fontSize: 13 }}>{c.business_type}{c.approved_at ? ' · since ' + fmtDate(c.approved_at) : ''}</div>{c.admin_notes && <div style={{ fontSize: 12 }} className="muted">Note: {c.admin_notes}</div>}</td>
                <td style={{ fontSize: 14 }}>{c.contact_name}<div className="muted">{c.email}</div><div className="muted">{c.phone}</div></td>
                <td style={{ fontSize: 14 }}>{c.city}</td><td className="num">{os.length}</td><td className="num"><b>{R(os.reduce((a, o) => a + Number(o.total), 0))}</b></td>
                <td><P m={CSTAT} s={c.status} /></td>
                <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                  <button className="linkbtn" onClick={() => setEdit({ ...c })}>Edit</button>
                  {c.status === 'approved' ? <button className="linkbtn" onClick={() => setStatus(c, 'suspended', c.business_name + ' paused. They can no longer order.')}>Pause</button> : <button className="linkbtn" onClick={() => setStatus(c, 'approved', c.business_name + ' approved')}>Approve</button>}
                </div></td>
              </tr>)
          }) : <tr><td colSpan={7} className="muted" style={{ padding: 24 }}>No clients yet.</td></tr>}</tbody></table></div></div>
      </>}

      {tab === 'orders' && <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t" style={{ minWidth: 720 }}>
        <thead><tr><th>Order</th><th>Date</th><th>Client</th><th>Units</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>{orders.length ? orders.map(o => <tr key={o.id} className="click" onClick={() => nav('/admin/orders/' + o.order_no)}><td><b>{o.order_no}</b></td><td className="muted" style={{ fontSize: 14 }}>{fmtDateTime(o.created_at)}</td><td>{C(o.wholesale_client_id).business_name}</td><td className="num">{o.order_items.reduce((a, i) => a + i.qty, 0)}</td><td className="num"><b>{R(o.total)}</b></td><td><Pill s={o.status} /></td></tr>)
          : <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>No wholesale orders yet.</td></tr>}</tbody></table></div></div>}

      {tab === 'branding' && <div className="stack" style={{ gap: 16 }}>{reqs.length ? reqs.map(r => (
        <div className="card panel" key={r.id} style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ width: 120, height: 120, background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            {r.logo_path ? (logos[r.logo_path] ? (/\.pdf$/i.test(r.logo_path) ? <a href={logos[r.logo_path]} target="_blank" rel="noreferrer">Open PDF</a> : <a href={logos[r.logo_path]} target="_blank" rel="noreferrer"><img src={logos[r.logo_path]} alt="Client logo" style={{ maxWidth: 120, maxHeight: 120, objectFit: 'contain' }} /></a>) : '…') : <span className="muted" style={{ fontSize: 12, textAlign: 'center' }}>No logo uploaded</span>}
          </div>
          <div className="stack" style={{ gap: 6, flex: '1 1 320px' }}>
            <div className="row"><b style={{ fontSize: 18 }}>{C(r.client_id).business_name}</b><P m={RSTAT} s={r.status} /></div>
            <span><b>{r.quantity} x {typeName(r.product_type)}</b> <span className="muted">· {fmtDate(r.created_at)}</span></span>
            <p style={{ fontSize: 15 }}>{r.notes}</p>
            <span className="muted" style={{ fontSize: 13 }}>{C(r.client_id).contact_name} · {C(r.client_id).email} · {C(r.client_id).phone}</span>
          </div>
          <div className="stack" style={{ gap: 8, flex: '1 1 280px' }}>
            <label className="field" htmlFor={'rq-' + r.id}>Quote or note for the client<textarea id={'rq-' + r.id} rows={2} defaultValue={r.quote_notes} onBlur={e => e.target.value !== r.quote_notes && setReq(r, { quote_notes: e.target.value }, 'Note saved')} placeholder="e.g. R42 each for 40, proof sent by email" /></label>
            <div className="row">
              {r.status === 'new' && <button className="btn sm" onClick={() => setReq(r, { status: 'quoted' }, 'Marked as quote sent')}>Quote sent</button>}
              {r.status === 'quoted' && <><button className="btn sm" onClick={() => setReq(r, { status: 'accepted' }, 'Marked as accepted')}>Client accepted</button><button className="btn ghost sm" onClick={() => setReq(r, { status: 'declined' }, 'Marked as declined')}>Declined</button></>}
            </div>
          </div>
        </div>)) : <p className="muted">No branding requests yet.</p>}</div>}
    </>
  )
}
