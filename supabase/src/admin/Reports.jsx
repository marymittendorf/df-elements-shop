import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { R, fmtDate, typeName, STATUS } from '../lib/format'
import { Pill } from './Orders'
import { downloadCSV, ymd, n2 } from '../lib/csv'

const COL = { retail: '#3F7A3D', wholesale: '#C98A12' } // validated pair on the card surface
const today = () => ymd(new Date())
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x) }
const monthStart = (d, back = 0) => { const x = new Date(d.slice(0, 7) + '-01T12:00:00'); x.setMonth(x.getMonth() - back); return ymd(x) }
const taxYearStart = d => (Number(d.slice(5, 7)) >= 3 ? d.slice(0, 4) : String(Number(d.slice(0, 4)) - 1)) + '-03-01'
const PRESETS = [
  ['month', 'This month', () => [monthStart(today()), today()]],
  ['last', 'Last month', () => [monthStart(today(), 1), addDays(monthStart(today()), -1)]],
  ['3m', 'Last 3 months', () => [monthStart(today(), 2), today()]],
  ['tax', 'Tax year', () => [taxYearStart(today()), today()]],
  ['12m', 'Last 12 months', () => [monthStart(today(), 11), today()]]
]
const sast = d => (d ? ymd(d) : '')
const net = o => Number(o.total) - Number(o.vat_amount || 0)
const cust = o => (o.wholesale_clients && o.wholesale_clients.business_name) || [o.first_name, o.last_name].filter(Boolean).join(' ')
const short = n => (n >= 1000 ? 'R' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + 'k' : 'R' + Math.round(n))

// Stacked column chart, retail and wholesale per period, with hover tooltip
function SalesChart({ buckets }) {
  const [hov, setHov] = useState(null)
  const W = 760, H = 260, L = 56, B = 28, T = 16
  const max = Math.max(1, ...buckets.map(b => b.retail + b.wholesale))
  const step = Math.pow(10, Math.floor(Math.log10(max))); const nice = [1, 2, 2.5, 5, 10].map(m => m * step).find(v => v * 4 >= max) || step * 10
  const top = nice * 4
  const y = v => T + (H - T - B) * (1 - v / top)
  const slot = (W - L - 8) / Math.max(1, buckets.length)
  const bw = Math.min(24, slot * 0.62)
  const every = Math.ceil(buckets.length / 12)
  const bar = (x, y0, y1, color, roundTop, key) => {
    const h = y0 - y1; if (h <= 0.5) return null
    const r = roundTop ? Math.min(4, h) : 0
    return <path key={key} fill={color} d={`M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z`} />
  }
  return (
    <div className="chartbox">
      <div className="legend"><span><i style={{ background: COL.retail }} />Retail</span><span><i style={{ background: COL.wholesale }} />Wholesale</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales per period, retail and wholesale" onMouseLeave={() => setHov(null)}>
        {[0, 1, 2, 3, 4].map(i => { const v = (top / 4) * i; return <g key={i}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke="#E3D6C1" strokeWidth="1" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="ax">{short(v)}</text></g> })}
        {buckets.map((b, i) => {
          const x = L + slot * i + (slot - bw) / 2
          const yr = y(b.retail), yw = y(b.retail + b.wholesale)
          const gap = b.retail > 0 && b.wholesale > 0 ? 2 : 0
          return (
            <g key={b.key}>
              {hov === i && <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="#221E1B" opacity=".05" />}
              {bar(x, y(0), yr, COL.retail, b.wholesale === 0, 'r')}
              {bar(x, yr - gap, yw, COL.wholesale, true, 'w')}
              {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="ax">{b.label}</text>}
              <rect x={L + slot * i} y={T} width={slot} height={H - T} fill="transparent" onMouseEnter={() => setHov(i)} onClick={() => setHov(i)} />
            </g>
          )
        })}
        <line x1={L} x2={W - 4} y1={y(0)} y2={y(0)} stroke="#A89067" strokeWidth="1" />
      </svg>
      {hov != null && buckets[hov] && (() => { const b = buckets[hov]; const left = ((L + slot * hov + slot / 2) / W) * 100; return (
        <div className="tip" style={{ left: `clamp(80px, ${left}%, calc(100% - 80px))` }}>
          <b>{b.long}</b>
          <div><i style={{ background: COL.retail }} />Retail<span className="num">{R(b.retail)}</span></div>
          <div><i style={{ background: COL.wholesale }} />Wholesale<span className="num">{R(b.wholesale)}</span></div>
          <div className="tt"><span>Total, {b.orders} order{b.orders === 1 ? '' : 's'}</span><span className="num">{R(b.retail + b.wholesale)}</span></div>
        </div>) })()}
    </div>
  )
}

const Bar = ({ v, max, color = 'var(--olive)' }) => <div className="bartrack"><i style={{ width: (max ? Math.max(0, (v / max) * 100) : 0) + '%', background: color }} /></div>

export function Reports() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'overview'
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(PRESETS[0][2]())
  const [channel, setChannel] = useState('all')
  const [group, setGroup] = useState('design')
  const [showTable, setShowTable] = useState(false)
  const [d, setD] = useState(null)
  const [from, to] = range

  const load = useCallback(async () => {
    setD(null)
    const start = new Date(from + 'T00:00:00+02:00').toISOString(), end = new Date(addDays(to, 1) + 'T00:00:00+02:00').toISOString()
    const sel = 'id, order_no, channel, first_name, last_name, email, status, subtotal, delivery_fee, total, vat_rate, vat_amount, paid_at, created_at, wholesale_client_id, wholesale_clients(business_name), order_items(product_id, gift_set_id, name, qty, unit_price, unit_cost)'
    const [paid, created, exp, prods, themes, cats, st] = await Promise.all([
      supabase.from('orders').select(sel).gte('paid_at', start).lt('paid_at', end).neq('status', 'cancelled').order('paid_at'),
      supabase.from('orders').select(sel).gte('created_at', start).lt('created_at', end).order('created_at'),
      supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to),
      supabase.from('products').select('id, name, variant, type, theme_id, is_active, is_custom, cost_price, image_url'),
      supabase.from('themes').select('id, name'),
      supabase.from('expense_categories').select('id, name'),
      supabase.from('settings').select('vat_registered').eq('id', 1).single()
    ])
    setD({ paid: paid.data || [], created: created.data || [], exp: exp.data || [], prods: prods.data || [], themes: themes.data || [], cats: cats.data || [], vatReg: !!(st.data && st.data.vat_registered) })
  }, [from, to])
  useEffect(() => { load() }, [load])

  const r = useMemo(() => {
    if (!d) return null
    const inCh = o => channel === 'all' || o.channel === channel
    const paid = d.paid.filter(inCh)
    const P = Object.fromEntries(d.prods.map(p => [p.id, p])); const TH = Object.fromEntries(d.themes.map(t => [t.id, t.name]))
    const sales = paid.reduce((s, o) => s + Number(o.total), 0)
    const salesNet = paid.reduce((s, o) => s + net(o), 0)
    const delivery = paid.reduce((s, o) => s + Number(o.delivery_fee), 0)
    const items = paid.reduce((s, o) => s + o.order_items.reduce((a, i) => a + i.qty, 0), 0)
    const byCh = ch => paid.filter(o => o.channel === ch).reduce((s, o) => s + Number(o.total), 0)

    // time buckets
    const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1
    const unit = days <= 35 ? 'day' : days <= 120 ? 'week' : 'month'
    const keyOf = ds => { if (unit === 'day') return ds; if (unit === 'month') return ds.slice(0, 7); const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x) }
    const buckets = []; const seen = {}
    for (let ds = from; ds <= to; ds = addDays(ds, 1)) { const k = keyOf(ds); if (!seen[k]) { seen[k] = { key: k, retail: 0, wholesale: 0, orders: 0 }; buckets.push(seen[k]) } }
    buckets.forEach(b => {
      const dt = new Date((b.key.length === 7 ? b.key + '-01' : b.key) + 'T12:00:00')
      b.label = unit === 'month' ? dt.toLocaleDateString('en-ZA', { month: 'short' }) : dt.toLocaleDateString('en-ZA', { day: 'numeric', month: unit === 'day' ? undefined : 'short' })
      b.long = unit === 'month' ? dt.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }) : unit === 'week' ? 'Week of ' + fmtDate(dt) : fmtDate(dt)
    })
    paid.forEach(o => { const b = seen[keyOf(sast(o.paid_at))]; if (b) { b[o.channel] += Number(o.total); b.orders++ } })

    // products
    const lines = {}
    paid.forEach(o => o.order_items.forEach(i => {
      const k = i.product_id ? 'p' + i.product_id : i.gift_set_id ? 's' + i.gift_set_id : 'n' + i.name
      const p = P[i.product_id]
      const l = lines[k] || (lines[k] = { key: k, name: i.name, type: i.gift_set_id ? 'Gift set' : p ? typeName(p.type) : '', theme: p ? TH[p.theme_id] || '' : '', img: p ? p.image_url : null, retail: 0, wholesale: 0, revenue: 0, cost: 0, costKnown: true })
      l[o.channel] += i.qty; l.revenue += i.qty * Number(i.unit_price)
      if (i.unit_cost == null) l.costKnown = false; else l.cost += i.qty * Number(i.unit_cost)
    }))
    let prodRows = Object.values(lines)
    if (group !== 'design') {
      const g = {}
      prodRows.forEach(l => { const k = group === 'theme' ? l.theme || 'No theme' : l.type || 'Other'; const x = g[k] || (g[k] = { key: k, name: k, retail: 0, wholesale: 0, revenue: 0, cost: 0, costKnown: true }); x.retail += l.retail; x.wholesale += l.wholesale; x.revenue += l.revenue; x.cost += l.cost; x.costKnown = x.costKnown && l.costKnown })
      prodRows = Object.values(g)
    }
    prodRows.sort((a, b) => b.revenue - a.revenue)
    const unsold = group === 'design' ? d.prods.filter(p => p.is_active && !p.is_custom && !lines['p' + p.id]) : []

    // invoices
    const invoices = d.created.filter(inCh)
    const live = invoices.filter(o => o.status !== 'cancelled')
    const outVat = paid.reduce((s, o) => s + Number(o.vat_amount || 0), 0)
    const inVat = d.exp.reduce((s, e) => s + Number(e.vat_amount), 0)

    // profit by month
    const expCost = e => Number(e.amount) - (d.vatReg ? Number(e.vat_amount) : 0)
    const months = []; const mm = {}
    for (let ds = from; ds <= to; ds = addDays(ds, 1)) { const k = ds.slice(0, 7); if (!mm[k]) { mm[k] = { key: k, sales: 0, cogs: 0, missing: 0, exp: 0 }; months.push(mm[k]) } }
    paid.forEach(o => { const m = mm[sast(o.paid_at).slice(0, 7)]; if (!m) return; m.sales += net(o); o.order_items.forEach(i => { if (i.unit_cost == null) m.missing += i.qty; else m.cogs += i.qty * Number(i.unit_cost) }) })
    d.exp.forEach(e => { const m = mm[e.expense_date.slice(0, 7)]; if (m) m.exp += expCost(e) })
    const byCat = d.cats.map(c => ({ name: c.name, v: d.exp.filter(e => e.category_id === c.id).reduce((s, e) => s + expCost(e), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)

    // customers
    const cm = {}
    paid.forEach(o => {
      const k = o.channel === 'wholesale' ? 'w' + o.wholesale_client_id : 'r' + (o.email || '').toLowerCase()
      const c = cm[k] || (cm[k] = { key: k, name: cust(o), email: o.email, channel: o.channel, orders: 0, items: 0, spend: 0, last: o.paid_at })
      c.orders++; c.items += o.order_items.reduce((a, i) => a + i.qty, 0); c.spend += Number(o.total); if (o.paid_at > c.last) c.last = o.paid_at
    })
    const customers = Object.values(cm).sort((a, b) => b.spend - a.spend)

    return { paid, sales, salesNet, delivery, items, retail: byCh('retail'), wholesale: byCh('wholesale'), buckets, unit, prodRows, unsold, invoices, live, outVat, inVat, months, byCat, customers }
  }, [d, channel, group, from, to])

  const pick = k => { setPreset(k); const p = PRESETS.find(x => x[0] === k); if (p) setRange(p[2]()) }
  const setTab = k => setSp(k === 'overview' ? {} : { tab: k }, { replace: true })
  const label = fmtDate(from + 'T12:00:00') + ' to ' + fmtDate(to + 'T12:00:00')
  const file = n => n + '-' + from + '-to-' + to + '.csv'

  const tabs = [['overview', 'Sales over time'], ['products', 'Sales by product'], ['invoices', 'Invoice register'], ['profit', 'Profit'], ['customers', 'Customers']]
  return (
    <div className="reports">
      <div className="ahead"><div><h1>Reports</h1><p className="muted">Sales count orders once they are paid, by the date paid. Cancelled orders are left out.</p></div>
        <button className="btn ghost sm noprint" onClick={() => window.print()}>Print</button></div>
      <div className="card rfilters noprint">
        <div className="chips">{PRESETS.map(([k, l]) => <button key={k} className="chip" aria-pressed={preset === k} onClick={() => pick(k)}>{l}</button>)}</div>
        <div className="row">
          <label className="field inl" htmlFor="rf-f">From<input id="rf-f" type="date" value={from} max={to} onChange={e => { setPreset('custom'); setRange([e.target.value, to]) }} /></label>
          <label className="field inl" htmlFor="rf-t">To<input id="rf-t" type="date" value={to} min={from} onChange={e => { setPreset('custom'); setRange([from, e.target.value]) }} /></label>
          <label className="field inl" htmlFor="rf-c">Show<select id="rf-c" value={channel} onChange={e => setChannel(e.target.value)}><option value="all">Retail and wholesale</option><option value="retail">Retail only</option><option value="wholesale">Wholesale only</option></select></label>
        </div>
      </div>
      <div className="chips noprint">{tabs.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="printhead"><b>DF Elements · {tabs.find(t => t[0] === tab)[1]}</b><span>{label}{channel !== 'all' ? ' · ' + channel : ''}</span></div>

      {!r ? <p className="muted">Loading…</p> : <>
        {tab === 'overview' && <>
          <div className="kpis">
            <div className="card kpi"><span style={{ fontWeight: 600 }}>Sales</span><b className="num">{R(r.sales)}</b><span>{d.vatReg ? R(r.salesNet) + ' excl VAT' : 'Including delivery ' + R(r.delivery)}</span></div>
            <div className="card kpi"><span style={{ fontWeight: 600 }}>Paid orders</span><b className="num">{r.paid.length}</b><span>{r.items} items sold</span></div>
            <div className="card kpi"><span style={{ fontWeight: 600 }}>Average order</span><b className="num">{R(r.paid.length ? r.sales / r.paid.length : 0)}</b><span>Per paid order</span></div>
            <div className="card kpi"><span style={{ fontWeight: 600 }}>Retail and wholesale</span><div className="split"><i style={{ flex: r.retail || 0.0001, background: COL.retail }} /><i style={{ flex: r.wholesale || 0.0001, background: COL.wholesale }} /></div><span className="num">{R(r.retail)} retail · {R(r.wholesale)} wholesale</span></div>
          </div>
          <div className="card panel">
            <div className="ahead"><h2 style={{ fontSize: 24 }}>Sales by {r.unit}</h2><div className="row noprint"><button className="linkbtn" onClick={() => setShowTable(!showTable)}>{showTable ? 'Hide table' : 'Show as table'}</button><button className="btn ghost sm" onClick={() => downloadCSV(file('sales'), ['Period', 'Retail', 'Wholesale', 'Total', 'Orders'], r.buckets.map(b => [b.long, n2(b.retail), n2(b.wholesale), n2(b.retail + b.wholesale), b.orders]))}>Download CSV</button></div></div>
            {r.sales ? <SalesChart buckets={r.buckets} /> : <p className="muted">No paid orders in this period.</p>}
            {showTable && r.sales ? <div className="tablewrap"><table className="t rt"><thead><tr><th>Period</th><th className="r">Retail</th><th className="r">Wholesale</th><th className="r">Total</th><th className="r">Orders</th></tr></thead><tbody>
              {r.buckets.filter(b => b.orders).map(b => <tr key={b.key}><td>{b.long}</td><td className="num r">{R(b.retail)}</td><td className="num r">{R(b.wholesale)}</td><td className="num r"><b>{R(b.retail + b.wholesale)}</b></td><td className="num r">{b.orders}</td></tr>)}
            </tbody></table></div> : null}
          </div>
        </>}

        {tab === 'products' && (() => {
          const max = Math.max(0, ...r.prodRows.map(x => x.revenue)); const totRev = r.prodRows.reduce((s, x) => s + x.revenue, 0)
          const anyCost = r.prodRows.some(x => x.cost > 0)
          return <div className="card panel">
            <div className="ahead"><div className="chips noprint">{[['design', 'By design'], ['theme', 'By theme'], ['type', 'By product type']].map(([k, l]) => <button key={k} className="chip" aria-pressed={group === k} onClick={() => setGroup(k)}>{l}</button>)}</div>
              <button className="btn ghost sm noprint" onClick={() => downloadCSV(file('sales-by-' + group), [group === 'design' ? 'Design' : group === 'theme' ? 'Theme' : 'Type', ...(group === 'design' ? ['Type', 'Theme'] : []), 'Retail units', 'Wholesale units', 'Revenue excl delivery', 'Cost', 'Gross profit'], r.prodRows.map(x => [x.name, ...(group === 'design' ? [x.type, x.theme] : []), x.retail, x.wholesale, n2(x.revenue), x.costKnown ? n2(x.cost) : '', x.costKnown ? n2(x.revenue - x.cost) : '']))}>Download CSV</button></div>
            <p className="muted" style={{ fontSize: 13 }}>Revenue is the item prices paid, without delivery. {anyCost ? 'Gross profit uses your cost price per item.' : 'Add your cost per item on each product to see gross profit.'}</p>
            <div className="tablewrap"><table className="t rt stacktable"><thead><tr><th>{group === 'design' ? 'Design' : group === 'theme' ? 'Theme' : 'Type'}</th><th className="r">Retail</th><th className="r">Wholesale</th><th style={{ minWidth: 200 }}>Revenue</th><th className="r">Share</th><th className="r">Gross profit</th></tr></thead><tbody>
              {r.prodRows.length ? r.prodRows.map(x => <tr key={x.key}>
                <td data-l=""><div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>{x.img ? <img src={x.img} alt="" className="rthumb" /> : null}<div><b>{x.name}</b>{group === 'design' && (x.type || x.theme) ? <div className="muted" style={{ fontSize: 12 }}>{[x.type, x.theme].filter(Boolean).join(' · ')}</div> : null}</div></div></td>
                <td data-l="Retail units" className="num r">{x.retail || ''}</td><td data-l="Wholesale units" className="num r">{x.wholesale || ''}</td>
                <td data-l="Revenue"><div className="barcell"><Bar v={x.revenue} max={max} /><b className="num">{R(x.revenue)}</b></div></td>
                <td data-l="Share" className="num r muted">{totRev ? Math.round((x.revenue / totRev) * 100) + '%' : ''}</td>
                <td data-l="Gross profit" className="num r">{x.costKnown ? <span>{R(x.revenue - x.cost)} <span className="muted" style={{ fontSize: 12 }}>{x.revenue ? Math.round(((x.revenue - x.cost) / x.revenue) * 100) + '%' : ''}</span></span> : <span className="muted" style={{ fontSize: 12 }}>Cost not set</span>}</td></tr>)
                : <tr><td colSpan={6} className="muted" style={{ padding: 20 }}>Nothing sold in this period.</td></tr>}
            </tbody></table></div>
            {r.unsold.length > 0 && <details className="unsold"><summary><b>{r.unsold.length} designs with no sales in this period</b></summary><div className="chips" style={{ marginTop: 12 }}>{r.unsold.map(p => <button key={p.id} className="chip" onClick={() => nav('/admin/products/' + p.id)}>{p.name}{p.variant ? ' · ' + p.variant : ''}</button>)}</div></details>}
          </div>
        })()}

        {tab === 'invoices' && (() => {
          const T = k => r.live.reduce((s, o) => s + Number(o[k] || 0), 0)
          const unpaid = r.live.filter(o => o.status === 'awaiting_payment')
          return <>
            <div className="kpis">
              <div className="card kpi"><span style={{ fontWeight: 600 }}>Invoiced</span><b className="num">{R(T('total'))}</b><span>{r.live.length} invoices, cancelled left out</span></div>
              <div className="card kpi"><span style={{ fontWeight: 600 }}>Still unpaid</span><b className="num">{R(unpaid.reduce((s, o) => s + Number(o.total), 0))}</b><span>{unpaid.length} pro forma{unpaid.length === 1 ? '' : 's'} awaiting EFT</span></div>
              <div className="card kpi"><span style={{ fontWeight: 600 }}>VAT on sales</span><b className="num">{R(r.outVat)}</b><span>Output VAT on paid orders</span></div>
              <div className="card kpi"><span style={{ fontWeight: 600 }}>VAT on expenses</span><b className="num">{R(r.inVat)}</b><span>{r.outVat - r.inVat >= 0 ? R(r.outVat - r.inVat) + ' to pay SARS' : R(r.inVat - r.outVat) + ' refund due'}</span></div>
            </div>
            <div className="card panel">
              <div className="ahead"><h2 style={{ fontSize: 24 }}>Invoices dated {label}</h2><button className="btn ghost sm noprint" onClick={() => downloadCSV(file('invoices'), ['Invoice', 'Date', 'Customer', 'Email', 'Channel', 'Status', 'Paid on', 'Items', 'Delivery', 'Excl VAT', 'VAT', 'Total'], r.invoices.map(o => [o.order_no, sast(o.created_at), cust(o), o.email, o.channel, STATUS[o.status][0], sast(o.paid_at), n2(o.subtotal), n2(o.delivery_fee), n2(net(o)), n2(o.vat_amount), n2(o.total)]))}>Download CSV</button></div>
              <div className="tablewrap"><table className="t rt stacktable"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Status</th><th className="r">Excl VAT</th><th className="r">VAT</th><th className="r">Total</th></tr></thead><tbody>
                {r.invoices.length ? r.invoices.map(o => <tr key={o.id} className="click" onClick={() => nav('/admin/orders/' + o.order_no)} style={{ opacity: o.status === 'cancelled' ? 0.5 : 1 }}>
                  <td data-l="Invoice"><b>{o.order_no}</b>{o.channel === 'wholesale' ? <span className="aiflag">Wholesale</span> : null}</td><td data-l="Date">{fmtDate(o.created_at)}</td><td data-l="Customer">{cust(o)}</td><td data-l="Status"><Pill s={o.status} /></td>
                  <td data-l="Excl VAT" className="num r">{R(net(o))}</td><td data-l="VAT" className="num r muted">{Number(o.vat_amount) ? R(o.vat_amount) : ''}</td><td data-l="Total" className="num r"><b style={{ textDecoration: o.status === 'cancelled' ? 'line-through' : 'none' }}>{R(o.total)}</b></td></tr>)
                  : <tr><td colSpan={7} className="muted" style={{ padding: 20 }}>No invoices in this period.</td></tr>}
              </tbody>{r.live.length ? <tfoot><tr><td colSpan={4}><b>Total, excluding cancelled</b></td><td className="num r"><b>{R(T('total') - T('vat_amount'))}</b></td><td className="num r"><b>{R(T('vat_amount'))}</b></td><td className="num r"><b>{R(T('total'))}</b></td></tr></tfoot> : null}</table></div>
            </div>
          </>
        })()}

        {tab === 'profit' && (() => {
          const S = k => r.months.reduce((s, m) => s + m[k], 0)
          const missing = S('missing')
          const maxCat = Math.max(0, ...r.byCat.map(c => c.v))
          return <>
            <div className="kpis">
              <div className="card kpi"><span style={{ fontWeight: 600 }}>Sales{d.vatReg ? ' excl VAT' : ''}</span><b className="num">{R(S('sales'))}</b><span>Paid orders, with delivery</span></div>
              <div className="card kpi"><span style={{ fontWeight: 600 }}>Expenses</span><b className="num">{R(S('exp'))}</b><span>{d.vatReg ? 'Excluding VAT' : 'As paid'}</span></div>
              <div className="card kpi"><span style={{ fontWeight: 600 }}>Profit</span><b className="num" style={{ color: S('sales') - S('exp') < 0 ? 'var(--sale)' : undefined }}>{R(S('sales') - S('exp'))}</b><span>Sales minus expenses</span></div>
              <div className="card kpi"><span style={{ fontWeight: 600 }}>Gross margin</span><b className="num">{S('sales') ? Math.round(((S('sales') - S('cogs')) / S('sales')) * 100) + '%' : 'None'}</b><span>{missing ? missing + ' items without a cost price' : 'After product costs'}</span></div>
            </div>
            <div className="two">
              <div className="card panel">
                <div className="ahead"><h2 style={{ fontSize: 24 }}>By month</h2><button className="btn ghost sm noprint" onClick={() => downloadCSV(file('profit'), ['Month', 'Sales', 'Product cost', 'Gross profit', 'Expenses', 'Profit'], r.months.map(m => [m.key, n2(m.sales), n2(m.cogs), n2(m.sales - m.cogs), n2(m.exp), n2(m.sales - m.exp)]))}>Download CSV</button></div>
                <div className="tablewrap"><table className="t rt stacktable"><thead><tr><th>Month</th><th className="r">Sales</th><th className="r">Gross profit</th><th className="r">Expenses</th><th className="r">Profit</th></tr></thead><tbody>
                  {r.months.map(m => <tr key={m.key}><td data-l="Month"><b>{new Date(m.key + '-01T12:00:00').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}</b></td><td data-l="Sales" className="num r">{R(m.sales)}</td><td data-l="Gross profit" className="num r">{R(m.sales - m.cogs)}</td><td data-l="Expenses" className="num r">{R(m.exp)}</td><td data-l="Profit" className="num r"><b style={{ color: m.sales - m.exp < 0 ? 'var(--sale)' : undefined }}>{R(m.sales - m.exp)}</b></td></tr>)}
                </tbody></table></div>
                <p className="muted" style={{ fontSize: 13 }}>Gross profit is sales minus your cost price per item sold. Profit is sales minus the expenses you recorded. They are shown separately so stock you buy is not counted twice.</p>
              </div>
              <div className="card panel"><h2 style={{ fontSize: 24 }}>Where the money went</h2>
                {r.byCat.length ? r.byCat.map(c => <div key={c.name} className="catrow"><div className="ahead" style={{ alignItems: 'baseline' }}><span>{c.name}</span><b className="num">{R(c.v)}</b></div><Bar v={c.v} max={maxCat} color="var(--sale)" /></div>) : <p className="muted">No expenses recorded in this period.</p>}
              </div>
            </div>
          </>
        })()}

        {tab === 'customers' && (() => {
          const max = Math.max(0, ...r.customers.map(c => c.spend))
          return <div className="card panel">
            <div className="ahead"><h2 style={{ fontSize: 24 }}>Top customers</h2><button className="btn ghost sm noprint" onClick={() => downloadCSV(file('customers'), ['Customer', 'Email', 'Type', 'Orders', 'Items', 'Spend', 'Last order'], r.customers.map(c => [c.name, c.email, c.channel, c.orders, c.items, n2(c.spend), sast(c.last)]))}>Download CSV</button></div>
            <p className="muted" style={{ fontSize: 13 }}>{r.customers.length} customers paid in this period. {r.customers.filter(c => c.orders > 1).length} of them ordered more than once.</p>
            <div className="tablewrap"><table className="t rt stacktable"><thead><tr><th>#</th><th>Customer</th><th className="r">Orders</th><th className="r">Items</th><th style={{ minWidth: 200 }}>Spend</th><th>Last paid</th></tr></thead><tbody>
              {r.customers.length ? r.customers.slice(0, 50).map((c, i) => <tr key={c.key}><td data-l="#" className="muted">{i + 1}</td>
                <td data-l="Customer"><b>{c.name}</b>{c.channel === 'wholesale' ? <span className="aiflag">Wholesale</span> : null}<div className="muted" style={{ fontSize: 12 }}>{c.email}</div></td>
                <td data-l="Orders" className="num r">{c.orders}</td><td data-l="Items" className="num r">{c.items}</td>
                <td data-l="Spend"><div className="barcell"><Bar v={c.spend} max={max} color={COL[c.channel]} /><b className="num">{R(c.spend)}</b></div></td><td data-l="Last paid">{fmtDate(c.last)}</td></tr>)
                : <tr><td colSpan={6} className="muted" style={{ padding: 20 }}>No paid orders in this period.</td></tr>}
            </tbody></table></div>
          </div>
        })()}
      </>}
    </div>
  )
}
