import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { R, fullName, typeName } from '../lib/format'

// Validated categorical order (reference palette, adjacent pairs)
const PARTS = [['mdf', 'MDF', '#2a78d6'], ['ink', 'Ink', '#eb6834'], ['laser', 'Laser', '#1baf7a'], ['pack', 'Packaging', '#eda100'], ['extras', 'Extras', '#e87ba4']]
const n = v => (v === '' || v == null ? 0 : Number(v))
const pct = v => (isFinite(v) ? Math.round(v) + '%' : '')

// How many rectangles fit on the sheet, trying both ways round
export function fitOnSheet(s, w, h) {
  if (!(w > 0 && h > 0)) return 0
  const W = n(s.sheet_w_mm), H = n(s.sheet_h_mm), g = n(s.gap_mm)
  const f = (a, b) => Math.floor((W + g) / (a + g)) * Math.floor((H + g) / (b + g))
  return Math.max(f(w, h), f(h, w))
}

export function costOf(s, it) {
  const auto = fitOnSheet(s, n(it.width_mm), n(it.height_mm))
  const pieces = n(it.pieces_override) || auto
  const sheet = n(s.board_price) / Math.max(1, n(s.sheets_per_board))
  const area = it.print_cm2_override != null && it.print_cm2_override !== '' ? n(it.print_cm2_override) : (n(it.width_mm) * n(it.height_mm)) / 100
  const perMin = (n(s.laser_watts) / 1000) * n(s.power_rate) / 60 + n(s.tube_price) / Math.max(1, n(s.tube_hours)) / 60
  const parts = {
    mdf: pieces ? sheet / pieces : 0,
    ink: (area / 10000) * n(s.ink_ml_m2) * (1 + n(s.ink_waste_pct) / 100) * n(s.ink_price_litre) / 1000,
    laser: pieces ? (n(it.cut_minutes) * perMin) / pieces : 0,
    pack: n(it.packaging_each),
    extras: n(it.extras_each)
  }
  const total = Object.values(parts).reduce((a, b) => a + b, 0)
  return { pieces, auto, area, parts, total, sheet, perMin }
}

function Money({ label, v, hint }) {
  return <div className="cmoney"><span>{label}</span><b className="num">{v}</b>{hint ? <small>{hint}</small> : null}</div>
}

function ItemEditor({ it, s, onSave, onCancel, onDelete }) {
  const [f, setF] = useState(it)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const c = costOf(s, f)
  const inp = (k, l, props = {}) => <label className="field" htmlFor={'ci-' + k}>{l}<input id={'ci-' + k} type="number" min="0" step="0.1" inputMode="decimal" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} {...props} /></label>
  return (
    <div className="card panel costedit">
      <h2 style={{ fontSize: 22 }}>{f.id ? 'Edit ' + f.name : 'New costing card'}</h2>
      <label className="field" htmlFor="ci-name">Name<input id="ci-name" value={f.name} onChange={e => set('name', e.target.value)} placeholder="For example Key ring" /></label>
      <div className="grid3">{inp('width_mm', 'Width (mm)')}{inp('height_mm', 'Height (mm)')}{inp('pieces_override', 'Pieces per sheet', { placeholder: c.auto ? 'Worked out: ' + c.auto : 'Enter a number', step: 1 })}</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>{c.auto ? c.auto + ' fit on a ' + n(s.sheet_w_mm) + ' x ' + n(s.sheet_h_mm) + ' sheet as rectangles. For shaped items that nest differently, type the real number you get.' : 'Enter the size, or the pieces per sheet.'}</p>
      <div className="grid3">{inp('print_cm2_override', 'Printed area (cm²)', { placeholder: 'Worked out: ' + Math.round(c.area) })}{inp('cut_minutes', 'Minutes to cut a sheet')}{inp('packaging_each', 'Packaging each (R)', { step: 0.01 })}</div>
      <div className="grid3">{inp('extras_each', 'Extras each (R)', { step: 0.01 })}<label className="field" htmlFor="ci-notes" style={{ gridColumn: 'span 2' }}>Notes<input id="ci-notes" value={f.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="For example ring and chain R1,20" /></label></div>
      <div className="note"><b>Cost each: {R(c.total)}</b><span className="muted">{c.pieces || 0} per sheet</span></div>
      <div className="row"><button className="btn sm" onClick={() => onSave(f)}>Save</button><button className="btn ghost sm" onClick={onCancel}>Cancel</button>{f.id ? <button className="linkbtn" style={{ color: 'var(--sale)', marginLeft: 'auto' }} onClick={() => onDelete(f)}>Delete</button> : null}</div>
    </div>
  )
}

export function Costing() {
  const { toast } = useAdmin()
  const [s, setS] = useState(null); const [saved, setSaved] = useState(null)
  const [items, setItems] = useState([]); const [prods, setProds] = useState([]); const [trade, setTrade] = useState({})
  const [edit, setEdit] = useState(null)
  const [orderNo, setOrderNo] = useState(''); const [chk, setChk] = useState(null); const [courier, setCourier] = useState('')

  const load = useCallback(async () => {
    const [{ data: st }, { data: ci }, { data: p }, { data: wp }] = await Promise.all([
      supabase.from('costing_settings').select('*').eq('id', 1).single(),
      supabase.from('cost_items').select('*').order('sort_order').order('id'),
      supabase.from('products').select('id, sku, name, variant, type, price, special_price, cost_price, cost_item_id, is_active, is_custom').order('sort_order'),
      supabase.from('wholesale_prices').select('*')
    ])
    setS(st); setSaved(st); setItems(ci || []); setProds(p || []); setTrade(Object.fromEntries((wp || []).map(w => [w.product_id, Number(w.price)])))
  }, [])
  useEffect(() => { load() }, [load])

  const costs = useMemo(() => (s ? Object.fromEntries(items.map(it => [it.id, costOf(s, it)])) : {}), [s, items])
  if (!s) return <p className="muted">Loading…</p>

  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const F = (k, l, hint, step = 0.01) => <label className="field" htmlFor={'cs-' + k}>{l}<input id={'cs-' + k} type="number" min="0" step={step} inputMode="decimal" value={s[k] ?? ''} onChange={e => setS({ ...s, [k]: e.target.value })} />{hint ? <small className="muted">{hint}</small> : null}</label>
  const saveSettings = async () => {
    const { id, updated_at, ...row } = s
    Object.keys(row).forEach(k => { row[k] = n(row[k]) })
    const { error } = await supabase.from('costing_settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1)
    toast(error ? error.message : 'Running costs saved'); if (!error) load()
  }
  const saveItem = async f => {
    if (!f.name || !f.name.trim()) { toast('Give the card a name'); return }
    const num = k => (f[k] === '' || f[k] == null ? null : Number(f[k]))
    const row = { name: f.name.trim(), width_mm: num('width_mm'), height_mm: num('height_mm'), pieces_override: f.pieces_override ? Math.round(Number(f.pieces_override)) : null, print_cm2_override: num('print_cm2_override'), cut_minutes: n(f.cut_minutes), packaging_each: n(f.packaging_each), extras_each: n(f.extras_each), notes: f.notes || '' }
    if (!row.pieces_override && !fitOnSheet(s, row.width_mm, row.height_mm)) { toast('Enter the size or the pieces per sheet'); return }
    const { error } = f.id ? await supabase.from('cost_items').update(row).eq('id', f.id) : await supabase.from('cost_items').insert({ ...row, sort_order: items.length + 1 })
    if (error) { toast(error.message); return }
    toast('Saved: ' + row.name); setEdit(null); load()
  }
  const delItem = async f => { if (!window.confirm('Delete the ' + f.name + ' card? Products linked to it will need a new card.')) return; await supabase.from('cost_items').delete().eq('id', f.id); setEdit(null); load() }
  const link = async (p, id) => { await supabase.from('products').update({ cost_item_id: id ? Number(id) : null }).eq('id', p.id); load() }
  const applyAll = async () => {
    const res = await Promise.all(items.map(it => supabase.from('products').update({ cost_price: Math.round(costs[it.id].total * 100) / 100 }).eq('cost_item_id', it.id)))
    const err = res.find(r => r.error)
    toast(err ? err.error.message : 'Cost prices updated on ' + prods.filter(p => p.cost_item_id).length + ' products'); load()
  }
  const checkOrder = async () => {
    const no = orderNo.trim().toUpperCase(); if (!no) return
    const { data: o } = await supabase.from('orders').select('order_no, channel, total, subtotal, delivery_fee, status, order_items(product_id, gift_set_id, name, qty, unit_price)').eq('order_no', no).maybeSingle()
    if (!o) { toast('Order ' + no + ' not found'); setChk(null); return }
    const setItemsQ = await Promise.all(o.order_items.filter(i => i.gift_set_id).map(i => supabase.from('gift_set_items').select('product_id, qty').eq('gift_set_id', i.gift_set_id).then(r => ({ i, rows: r.data || [] }))))
    const P = Object.fromEntries(prods.map(p => [p.id, p]))
    const unitCost = pid => { const p = P[pid]; return p && p.cost_item_id && costs[p.cost_item_id] ? costs[p.cost_item_id].total : null }
    let make = 0; let missing = 0; let count = 0
    const lines = o.order_items.map(i => {
      let c = null
      if (i.gift_set_id) { const g = setItemsQ.find(x => x.i === i); const parts = (g ? g.rows : []).map(r => (unitCost(r.product_id) == null ? null : unitCost(r.product_id) * r.qty)); c = parts.length && parts.every(v => v != null) ? parts.reduce((a, b) => a + b, 0) : null; count += (g ? g.rows.reduce((a, r) => a + r.qty, 0) : 0) * i.qty }
      else { c = unitCost(i.product_id); count += i.qty }
      if (c == null) missing += i.qty; else make += c * i.qty
      return { ...i, cost: c }
    })
    setChk({ o, lines, make, missing, count }); setCourier(String(count >= 40 ? n(s.courier_box) : n(s.courier_small)))
  }

  const unlinked = prods.filter(p => !p.cost_item_id && p.is_active)
  const typical = list => { const m = {}; list.forEach(v => { if (v != null) m[v] = (m[v] || 0) + 1 }); const k = Object.keys(m).sort((a, b) => m[b] - m[a])[0]; return k == null ? null : Number(k) }
  const sheetCost = n(s.board_price) / Math.max(1, n(s.sheets_per_board))
  const perMin = costOf(s, {}).perMin

  return (
    <div className="costing">
      <div className="ahead"><div><h1>Costing</h1><p className="muted">What each item really costs you to make, and what you keep at retail and trade prices.</p></div>
        <button className="btn sm" onClick={applyAll}>Copy costs to products</button></div>

      <div className="card panel">
        <div className="ahead"><h2 style={{ fontSize: 24 }}>Your running costs</h2>{dirty ? <button className="btn sm" onClick={saveSettings}>Save running costs</button> : <span className="muted" style={{ fontSize: 13 }}>Change a figure and save. Every item updates.</span>}</div>
        <div className="costgrid">
          <div className="cgroup"><h3>MDF</h3>{F('board_price', 'Price of one board (R)')}{F('sheets_per_board', 'Sheets you cut from it', null, 1)}<div className="grid2">{F('sheet_w_mm', 'Sheet width (mm)', null, 1)}{F('sheet_h_mm', 'Sheet height (mm)', null, 1)}</div>{F('gap_mm', 'Gap between pieces (mm)', 'Leave at 0 if pieces share cut lines', 0.5)}<Money label="One sheet costs" v={R(sheetCost)} /></div>
          <div className="cgroup"><h3>Ink</h3>{F('ink_price_litre', 'Price per litre (R)')}{F('ink_ml_m2', 'Ink per m² (ml)', 'White, colour and gloss together. Estimate until you measure it.', 1)}{F('ink_waste_pct', 'Cleaning and waste (%)', null, 1)}<Money label="Ink per 100 x 100 mm" v={R((0.01 * n(s.ink_ml_m2) * (1 + n(s.ink_waste_pct) / 100) * n(s.ink_price_litre)) / 1000)} /></div>
          <div className="cgroup"><h3>Laser</h3>{F('laser_watts', 'Power from the wall (W)', 'Machine, chiller and extraction together. Estimate.', 50)}{F('power_rate', 'Electricity per kWh (R)', 'Estimate. Check your municipal bill.')}<div className="grid2">{F('tube_price', 'Tube price (R)')}{F('tube_hours', 'Tube life (hours)', 'Estimate', 100)}</div><Money label="Laser running cost" v={R(perMin) + ' a minute'} hint={R(perMin * 60) + ' an hour'} /></div>
          <div className="cgroup"><h3>Courier</h3>{F('courier_box', 'Big box, about 10 kg (R)')}{F('courier_small', 'Small parcel (R)', 'Estimate until you check the price.')}<Money label="Keimoes box of 143 items" v={R(n(s.courier_box) / 143) + ' an item'} /></div>
        </div>
      </div>

      <div className="ahead"><h2 style={{ fontSize: 26 }}>Cost per item</h2><div className="row"><div className="legend">{PARTS.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}</div><button className="btn ghost sm" onClick={() => setEdit({ name: '', width_mm: '', height_mm: '', pieces_override: '', print_cm2_override: '', cut_minutes: 15, packaging_each: 0, extras_each: 0, notes: '' })}>Add a costing card</button></div></div>
      {edit && !edit.id && <ItemEditor it={edit} s={s} onSave={saveItem} onCancel={() => setEdit(null)} />}
      <div className="costlist">
        {items.map(it => {
          if (edit && edit.id === it.id) return <ItemEditor key={it.id} it={edit} s={s} onSave={saveItem} onCancel={() => setEdit(null)} onDelete={delItem} />
          const c = costs[it.id]; const linked = prods.filter(p => p.cost_item_id === it.id)
          const retail = typical(linked.map(p => (p.price == null ? null : Number(p.price)))); const tr = typical(linked.map(p => trade[p.id] ?? null))
          const row = (label, price) => { if (price == null) return <div className="cprofit muted"><span>{label}</span><span>No price</span></div>; const pr = price - c.total; const m = (pr / price) * 100; return <div className={'cprofit' + (pr < 0 ? ' loss' : m < 40 ? ' thin' : '')}><span>{label} <b className="num">{R(price)}</b></span><span><b className="num">{pr < 0 ? 'Loss ' + R(-pr) : R(pr) + ' profit'}</b> <small>{pct(m)}</small></span></div> }
          return (
            <div key={it.id} className="card costcard">
              <div className="cc-head"><div><h3>{it.name}</h3><span className="muted">{it.width_mm && it.height_mm ? n(it.width_mm) + ' x ' + n(it.height_mm) + ' mm · ' : ''}{c.pieces} per sheet · {n(it.cut_minutes)} min to cut</span></div><div className="cc-total"><small>Costs you</small><b className="num">{R(c.total)}</b></div></div>
              <div className="cbar" role="img" aria-label={PARTS.map(([k, l]) => l + ' ' + R(c.parts[k])).join(', ')}>{PARTS.map(([k, l, col]) => c.parts[k] > 0 ? <i key={k} title={l + ' ' + R(c.parts[k])} style={{ flex: c.parts[k], background: col }} /> : null)}</div>
              <div className="cparts">{PARTS.map(([k, l, col]) => c.parts[k] > 0 ? <span key={k}><i style={{ background: col }} />{l} <b className="num">{R(c.parts[k])}</b></span> : null)}</div>
              {row('Retail', retail)}{row('Trade', tr)}
              <div className="cc-foot"><span className="muted">{linked.length} product{linked.length === 1 ? '' : 's'} linked{it.notes ? ' · ' + it.notes : ''}</span><button className="linkbtn" onClick={() => setEdit({ ...it, pieces_override: it.pieces_override ?? '', print_cm2_override: it.print_cm2_override ?? '' })}>Edit</button></div>
            </div>
          )
        })}
      </div>

      <div className="two">
        <div className="card panel">
          <h2 style={{ fontSize: 24 }}>Check an order</h2>
          <p className="muted" style={{ fontSize: 14 }}>See what an order cost you to make and send, and what you kept.</p>
          <div className="row"><label className="field" htmlFor="co-no" style={{ flex: 1, minWidth: 160 }}><span className="sr">Order number</span><input id="co-no" placeholder="Order number, for example WS1001" value={orderNo} onChange={e => setOrderNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkOrder()} /></label><button className="btn ghost sm" onClick={checkOrder}>Check</button></div>
          {chk && (() => {
            const cour = n(courier); const charged = Number(chk.o.total) ; const kept = charged - chk.make - cour
            return <div className="stack" style={{ gap: 10 }}>
              <div className="tablewrap"><table className="t rt"><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Sold at</th><th className="r">Costs you</th></tr></thead><tbody>
                {chk.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="num r">{l.qty}</td><td className="num r">{R(l.unit_price * l.qty)}</td><td className="num r">{l.cost == null ? <span className="muted">No card</span> : R(l.cost * l.qty)}</td></tr>)}
              </tbody></table></div>
              <label className="field inl" htmlFor="co-cour">Courier you paid (R)<input id="co-cour" type="number" min="0" value={courier} onChange={e => setCourier(e.target.value)} style={{ width: 120 }} /></label>
              <div className="orderres">
                <Money label="Customer paid" v={R(charged)} hint={'Includes ' + R(chk.o.delivery_fee) + ' delivery'} />
                <Money label="Making cost" v={R(chk.make)} hint={chk.missing ? chk.missing + ' items without a costing card' : chk.count + ' items'} />
                <Money label="Courier" v={R(cour)} hint={chk.count ? R(cour / chk.count) + ' an item' : ''} />
                <div className={'cmoney big' + (kept < 0 ? ' loss' : '')}><span>You kept</span><b className="num">{R(kept)}</b><small>{charged ? pct((kept / charged) * 100) + ' of the order' : ''}</small></div>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>Your own time is not included.</p>
            </div>
          })()}
        </div>
        <div className="card panel">
          <h2 style={{ fontSize: 24 }}>Products without a card</h2>
          {unlinked.length ? <div className="stack" style={{ gap: 6 }}>{unlinked.map(p => <div key={p.id} className="linkrow"><div><b style={{ fontSize: 14 }}>{fullName(p)}</b><div className="muted" style={{ fontSize: 12 }}>{typeName(p.type)}</div></div>
            <select aria-label={'Costing card for ' + fullName(p)} value="" onChange={e => link(p, e.target.value)}><option value="">Choose a card</option>{items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}</select></div>)}</div>
            : <p className="muted">Every product has a costing card.</p>}
          <p className="muted" style={{ fontSize: 13 }}>To change a product's card later, open it in <Link to="/admin/products">Products</Link>.</p>
        </div>
      </div>
    </div>
  )
}
