import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { Pill } from './Orders'
import { Icon } from '../components/Icons'
import { R, fullName } from '../lib/format'

export function Dashboard() {
  const { me } = useAdmin()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  useEffect(() => {
    (async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const [open, latest, month, low, special, apps, brand] = await Promise.all([
        supabase.from('orders').select('id, order_no, status, proof_approved_at, order_items(name, qty, is_custom, from_stock_qty)').in('status', ['awaiting_payment', 'paid']),
        supabase.from('orders').select('id, order_no, first_name, last_name, total, status, order_items(is_custom)').order('created_at', { ascending: false }).limit(6),
        supabase.from('orders').select('total').gte('paid_at', monthStart.toISOString()).neq('status', 'cancelled'),
        supabase.from('products').select('id, name, variant, stock, image_url').eq('is_custom', false).eq('is_active', true).lt('stock', 6).order('stock').limit(8),
        supabase.from('products').select('id', { count: 'exact', head: true }).not('special_price', 'is', null),
        supabase.from('wholesale_clients').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('branding_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')
      ])
      const o = open.data || []
      const queue = {}
      o.filter(x => x.status === 'paid').forEach(x => x.order_items.forEach(it => { const k = it.name + (it.is_custom ? ' (custom)' : ''); const n = it.qty - (it.from_stock_qty || 0); if (n > 0) queue[k] = (queue[k] || 0) + n }))
      setD({
        awaiting: o.filter(x => x.status === 'awaiting_payment').length,
        toPrint: o.filter(x => x.status === 'paid').length,
        proofs: o.filter(x => x.order_items.some(i => i.is_custom) && !x.proof_approved_at).length,
        sales: (month.data || []).reduce((s, x) => s + Number(x.total), 0),
        queue, latest: latest.data || [], low: low.data || [], specials: special.count || 0, apps: apps.count || 0, brand: brand.count || 0
      })
    })()
  }, [])
  const hour = new Date().getHours()
  if (!d) return <p className="muted">Loading…</p>
  return (
    <>
      <div className="ahead"><div><div className="muted" style={{ fontSize: 14 }}>{new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}{me && me.full_name ? ', ' + me.full_name.split(' ')[0] : ''}</h1></div>
        <div className="row"><Link className="btn ghost sm" to="/admin/orders">Orders</Link><Link className="btn sm" to="/admin/products/new">Add a product</Link></div></div>
      <div className="kpis">{[['Awaiting EFT', d.awaiting, 'Check your bank'], ['Orders to print', d.toPrint, 'Paid and waiting'], ['Custom proofs to send', d.proofs, 'Waiting on your design'], ['Paid this month', R(d.sales), 'By date paid']].map(k => <div key={k[0]} className="card kpi"><span style={{ fontWeight: 600, color: 'var(--muted)' }}>{k[0]}</span><b className="num">{k[1]}</b><span>{k[2]}</span></div>)}</div>
      <div className="two">
        <div className="stack" style={{ gap: 20 }}>
          <div className="card panel"><div className="ahead"><h2>Print queue</h2><span className="muted" style={{ fontSize: 14 }}>Everything paid and not yet printed</span></div>
            {Object.keys(d.queue).length ? Object.entries(d.queue).map(([n, q]) => <div className="line" key={n}><span className="circle" style={{ width: 40, height: 40 }}><Icon.printer /></span><div className="info"><b>{n}</b></div><b className="num" style={{ fontSize: 18 }}>x {q}</b></div>) : <p className="muted">Nothing waiting to print.</p>}</div>
          <div className="card panel"><div className="ahead"><h2>Latest orders</h2><Link className="linkbtn" to="/admin/orders">View all</Link></div>
            <div className="tablewrap"><table className="t" style={{ minWidth: 480 }}><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>
              {d.latest.length ? d.latest.map(o => <tr key={o.id} className="click" onClick={() => nav('/admin/orders/' + o.order_no)}><td><b>{o.order_no}</b></td><td>{o.first_name} {o.last_name}</td><td className="num">{R(o.total)}</td><td><Pill s={o.status} /></td></tr>) : <tr><td colSpan={4} className="muted" style={{ padding: 20 }}>No orders yet.</td></tr>}
            </tbody></table></div></div>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <div className="card panel"><h2 style={{ fontSize: 26 }}>Low stock</h2>
            {d.low.length ? d.low.map(p => <Link key={p.id} to={'/admin/products/' + p.id} className="row" style={{ flexWrap: 'nowrap', textDecoration: 'none', color: 'inherit' }}><div className="thumb" style={{ width: 44, height: 44 }}>{p.image_url && <img src={p.image_url} alt="" />}</div><b style={{ flex: 1, fontSize: 14 }}>{fullName(p)}</b><b style={{ color: 'var(--sale)', fontSize: 13 }}>{p.stock} left</b></Link>) : <p className="muted">Everything is well stocked.</p>}</div>
          {(d.apps > 0 || d.brand > 0) && <div className="card panel" style={{ gap: 8 }}><h2 style={{ fontSize: 26 }}>Wholesale</h2>{d.apps > 0 && <Link to="/admin/wholesale">{d.apps} new application{d.apps === 1 ? '' : 's'} to approve</Link>}{d.brand > 0 && <Link to="/admin/wholesale?tab=branding">{d.brand} branding request{d.brand === 1 ? '' : 's'} to quote</Link>}</div>}
          <div className="ai" style={{ gap: 8 }}><span className="eyebrow" style={{ color: 'var(--surface)' }}>Running now</span><h2 style={{ fontSize: 26 }}>{d.specials} designs on special</h2><Link className="linkbtn" style={{ color: '#fff', alignSelf: 'flex-start' }} to="/admin/promos">Manage specials and sets</Link></div>
        </div>
      </div>
    </>
  )
}
