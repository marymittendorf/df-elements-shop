import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { R, fmtDate, fmtDateTime } from '../lib/format'

// doc = { type: 'invoice'|'packing'|'label', ids: [order ids] }
const LOGO = <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 30 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', background: '#221E1B', color: '#fff', fontSize: 18, marginRight: 10 }}>DF</span>Elements</span>
const addr = o => [o.street, o.suburb, o.city, o.postal_code].filter(Boolean).join(', ')
const who = o => [o.first_name, o.last_name].filter(Boolean).join(' ')
const biz = o => (o.wholesale_clients && o.wholesale_clients.business_name) || ''
const box = <span style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid #3B2A20', borderRadius: 4 }} />

function Invoice({ o, s }) {
  const paid = o.status !== 'awaiting_payment' && o.status !== 'cancelled'
  return (
    <div className="paper">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><div>{LOGO}</div><div className="muted" style={{ lineHeight: 1.6, marginTop: 8, whiteSpace: 'pre-line' }}>{[s.address, [s.email, s.phone].filter(Boolean).join(' · '), s.vat_number ? 'VAT ' + s.vat_number : ''].filter(Boolean).join('\n')}</div></div>
        <div style={{ textAlign: 'right' }}><div className="eyebrow">{paid ? 'Invoice' : 'Pro forma invoice'}</div><h2>{paid ? 'INV ' : 'PF '}{o.order_no}</h2><div>{fmtDate(o.created_at)}</div>
          <span className="pill" style={{ background: paid ? 'var(--surface)' : 'var(--warn-bg)', color: paid ? 'var(--primary-dk)' : 'var(--warn-fg)', marginTop: 6 }}>{paid ? 'PAID · EFT' + (o.paid_at ? ' · ' + fmtDate(o.paid_at) : '') : 'AWAITING PAYMENT'}</span></div>
      </div>
      <div className="grid2" style={{ margin: '28px 0', padding: '18px 22px', borderRadius: 14, background: 'var(--soft)' }}>
        <div><div className="eyebrow">Bill to</div>{biz(o) && <b style={{ display: 'block' }}>{biz(o)}</b>}<b>{who(o)}</b>{o.wholesale_clients && o.wholesale_clients.vat_number ? <div>VAT {o.wholesale_clients.vat_number}</div> : null}<div>{o.email}</div><div>{o.phone}</div></div>
        <div><div className="eyebrow">Deliver to</div><div>{addr(o)}</div><div>{o.delivery_name}</div></div>
      </div>
      <table><thead><tr><th>Item</th><th>Qty</th><th style={{ textAlign: 'right' }}>Unit</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>{o.order_items.map(l => <tr key={l.id}><td><b>{l.name}</b><div className="muted">{l.sku}{l.custom_note ? ' · ' + l.custom_note : ''}</div></td><td>{l.qty}</td><td style={{ textAlign: 'right' }} className="num">{R(l.unit_price)}</td><td style={{ textAlign: 'right' }} className="num">{R(l.unit_price * l.qty)}</td></tr>)}</tbody></table>
      <div className="stack num" style={{ gap: 6, margin: '20px 0 0 auto', width: 'min(300px,100%)' }}>
        <div className="sumrow"><span>Subtotal</span><span>{R(o.subtotal)}</span></div>
        <div className="sumrow"><span>Delivery</span><span>{R(o.delivery_fee)}</span></div>
        <div className="sumrow" style={{ fontWeight: 700, fontSize: 18, borderTop: '2px solid #3B2A20', paddingTop: 8 }}><span>{paid ? 'Total paid' : 'Amount due'}</span><span>{R(o.total)}</span></div>
      </div>
      {!paid && <div className="stack" style={{ gap: 8, marginTop: 24 }}><div className="eyebrow">Pay by EFT · reference {o.order_no}</div>
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--soft)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}><b>Bank</b><span>{s.bank_name}</span><b>Account name</b><span>{s.account_name}</span><b>Account number</b><span>{s.account_number}</span><b>Branch code</b><span>{s.branch_code}</span></div></div>}
      <p className="muted" style={{ marginTop: 36, fontSize: 12 }}>Thank you for supporting a small, local business.</p>
    </div>
  )
}

function Packing({ o, urls }) {
  return (
    <div className="paper">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #3B2A20', paddingBottom: 14 }}><div><div className="eyebrow">Print and packing list</div><h2>Order {o.order_no}</h2></div><div style={{ textAlign: 'right' }}><b>{o.delivery_name}</b><br />{fmtDateTime(o.created_at)}</div></div>
      <div style={{ margin: '18px 0' }}><div className="eyebrow">Ship to</div>{biz(o) && <b style={{ fontSize: 16, display: 'block' }}>{biz(o)}</b>}<b style={{ fontSize: 16 }}>{who(o)}</b><div>{addr(o)}</div><div>{o.phone}</div></div>
      {o.notes && <div className="note" style={{ marginBottom: 14 }}><b>Customer note:</b> {o.notes}</div>}
      <table><thead><tr><th>Printed</th><th>Packed</th><th>Item</th><th>SKU</th>{o.channel === 'wholesale' && <><th>From stock</th><th>To print</th></>}<th>Qty</th></tr></thead>
        <tbody>{o.order_items.map(l => <tr key={l.id}><td>{box}</td><td>{box}</td>
          <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{l.custom_photo_path && urls[l.custom_photo_path] && <img src={urls[l.custom_photo_path]} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />}<span><b>{l.name}</b>{l.is_custom && <div className="muted">Custom{l.custom_note ? ': ' + l.custom_note : ''}{l.custom_photo_path ? '' : ' · photo to follow'}</div>}</span></div></td>
          <td className="muted">{l.sku}</td>{o.channel === 'wholesale' && <><td style={{ fontSize: 16 }}>{l.from_stock_qty}</td><td style={{ fontSize: 16, fontWeight: 700 }}>{l.qty - l.from_stock_qty}</td></>}<td style={{ fontSize: 20, fontWeight: 700 }}>{l.qty}</td></tr>)}</tbody></table>
      <div className="grid2" style={{ marginTop: 24 }}><div className="stack" style={{ gap: 6 }}><div className="eyebrow">Also pack</div><span>☐ Thank you card and invoice</span><span>☐ Wrap each piece to protect the print</span></div><div className="stack" style={{ gap: 6 }}><div className="eyebrow">Parcel</div><span>Weight: ______ kg</span><span>Packed by: __________</span></div></div>
    </div>
  )
}

function Label({ o, s }) {
  return (
    <div className="label">
      <div className="row" style={{ justifyContent: 'space-between', borderBottom: '3px solid #000', paddingBottom: 8 }}><b style={{ fontSize: 18 }}>{o.delivery_name.toUpperCase()}</b></div>
      <div style={{ padding: '8px 0', borderBottom: '1px solid #000', fontSize: 11 }}><b>FROM</b><br />DF Elements{s.address ? ' · ' + s.address : ''}{s.phone ? ' · ' + s.phone : ''}</div>
      <div style={{ padding: '10px 0', borderBottom: '3px solid #000' }}><div style={{ fontSize: 11, fontWeight: 700 }}>DELIVER TO</div><div style={{ fontSize: 20, fontWeight: 900 }}>{(biz(o) ? biz(o) + ' · ' + who(o) : who(o)).toUpperCase()}</div><div style={{ fontSize: 15 }}>{addr(o)}</div><div>Tel {o.phone}</div></div>
      <div style={{ padding: '8px 0', fontSize: 14 }}><b>Ref:</b> {o.order_no} · <b>Parcels:</b> 1 of 1 · <b>FRAGILE PRINT</b></div>
      {o.tracking_number && <div style={{ fontSize: 14 }}><b>Waybill:</b> {o.tracking_number}</div>}
    </div>
  )
}

export function DocsModal({ doc, onClose }) {
  const [orders, setOrders] = useState(null)
  const [s, setS] = useState({})
  const [urls, setUrls] = useState({})
  useEffect(() => {
    (async () => {
      const [{ data: os }, { data: st }] = await Promise.all([
        supabase.from('orders').select('*, order_items(*), wholesale_clients(business_name, vat_number)').in('id', doc.ids).order('created_at'),
        supabase.from('settings').select('*').eq('id', 1).single()
      ])
      setOrders(os || []); setS(st || {})
      const paths = (os || []).flatMap(o => o.order_items.map(i => i.custom_photo_path).filter(Boolean))
      if (paths.length) {
        const { data } = await supabase.storage.from('custom-uploads').createSignedUrls(paths, 3600)
        const m = {}; (data || []).forEach(d => { if (d.signedUrl) m[d.path] = d.signedUrl }); setUrls(m)
      }
    })()
  }, [doc])
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const name = { invoice: 'Invoices', packing: 'Print and packing lists', label: 'Courier labels' }[doc.type]
  return (
    <div className="docmodal" role="dialog" aria-label={name}>
      <div className="docbar noprint"><b style={{ fontSize: 18 }}>{name} · {doc.ids.length} order{doc.ids.length === 1 ? '' : 's'}</b>
        <div className="row"><button className="btn light sm" onClick={() => window.print()}>Print</button><button className="btn light sm" onClick={onClose}>Close</button></div></div>
      <div className="printarea">
        {!orders ? <p style={{ color: '#fff', textAlign: 'center' }}>Loading…</p> : orders.map(o => (
          <div key={o.id} className="pagebreak">{doc.type === 'invoice' ? <Invoice o={o} s={s} /> : doc.type === 'packing' ? <Packing o={o} urls={urls} /> : <Label o={o} s={s} />}</div>
        ))}
      </div>
    </div>
  )
}
