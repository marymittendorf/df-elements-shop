import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { R, fullName, typeName, specialOn, fmtDate } from '../lib/format'

export function Promos() {
  const { toast } = useAdmin()
  const [tab, setTab] = useState('sets')
  const [products, setProducts] = useState([]); const [sets, setSets] = useState([]); const [settings, setSettings] = useState(null)
  const [pct, setPct] = useState(15)
  const [b, setB] = useState({ name: '', description: '', pick: {}, disc: 15, price: '' })
  const load = useCallback(async () => {
    const [{ data: p }, { data: s }, { data: st }] = await Promise.all([
      supabase.from('products').select('*').eq('is_custom', false).order('sort_order'),
      supabase.from('gift_sets').select('*, gift_set_items(product_id, qty)').order('sort_order'),
      supabase.from('settings').select('*').eq('id', 1).single()
    ])
    setProducts(p || []); setSets(s || []); setSettings(st)
  }, [])
  useEffect(() => { load() }, [load])
  const P = id => products.find(p => p.id === id)

  const mkSpecial = async p => {
    const sp = Math.round(Number(p.price) * (1 - pct / 100))
    const { error } = await supabase.from('products').update({ special_price: sp, special_ends: settings && settings.specials_end ? settings.specials_end : null }).eq('id', p.id)
    if (error) { toast(error.message); return }
    toast(fullName(p) + ' is on special for ' + R(sp)); load()
  }
  const endSpecial = async p => { await supabase.from('products').update({ special_price: null, special_ends: null }).eq('id', p.id); load() }

  const picks = products.filter(p => b.pick[p.id] && p.price != null)
  const full = picks.reduce((s, p) => s + Number(p.price), 0)
  const price = b.price !== '' ? Number(b.price) : Math.round(full * (1 - b.disc / 100))
  const publish = async () => {
    if (!b.name.trim()) { toast('Give the set a name'); return }
    const { data, error } = await supabase.from('gift_sets').insert({ name: b.name.trim(), description: b.description.trim(), price, sort_order: 0 }).select().single()
    if (error) { toast(error.message); return }
    const { error: e2 } = await supabase.from('gift_set_items').insert(picks.map(p => ({ gift_set_id: data.id, product_id: p.id, qty: 1 })))
    if (e2) { toast(e2.message); return }
    setB({ name: '', description: '', pick: {}, disc: 15, price: '' }); toast('Gift set published'); load()
  }
  const toggleSet = async s => { await supabase.from('gift_sets').update({ is_active: !s.is_active }).eq('id', s.id); load() }
  const setPrice = async (s, v) => { const n = Number(v); if (!n || n === Number(s.price)) return; await supabase.from('gift_sets').update({ price: n }).eq('id', s.id); toast('Set price saved'); load() }
  const delSet = async s => { if (!window.confirm('Delete the ' + s.name + '? Past orders keep their details.')) return; await supabase.from('gift_sets').delete().eq('id', s.id); load() }

  const tabs = <div className="chips">{[['sets', 'Gift sets'], ['special', 'Specials']].map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
  if (tab === 'special') return (
    <>
      <div className="ahead"><div><h1>Specials and sets</h1><p className="muted">Specials end on {settings && settings.specials_end ? fmtDate(settings.specials_end) : 'the date you set in Settings'}. Change the date in Settings.</p></div>{tabs}</div>
      <div className="row"><b style={{ fontSize: 14 }}>Discount for new specials</b>{[10, 15, 20, 25].map(v => <button key={v} className="chip" aria-pressed={pct === v} onClick={() => setPct(v)}>{v}% off</button>)}</div>
      <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t"><thead><tr><th>Design</th><th>Normal price</th><th>Special price</th><th>Ends</th><th></th></tr></thead><tbody>
        {products.filter(p => p.price != null && p.is_active).map(p => <tr key={p.id}><td><b>{fullName(p)}</b><div className="muted" style={{ fontSize: 13 }}>{typeName(p.type)}</div></td><td className="num">{R(p.price)}</td>
          <td className="num">{p.special_price != null ? <b style={{ color: specialOn(p) ? 'var(--sale)' : 'var(--muted)' }}>{R(p.special_price)}{specialOn(p) ? '' : ' (ended)'}</b> : <span className="muted">None</span>}</td>
          <td className="muted" style={{ fontSize: 14 }}>{p.special_price != null ? (p.special_ends ? fmtDate(p.special_ends) : 'Until you end it') : ''}</td>
          <td>{p.special_price != null ? <button className="linkbtn" onClick={() => endSpecial(p)}>End special</button> : <button className="linkbtn" onClick={() => mkSpecial(p)}>Put on special ({pct}% off)</button>}</td></tr>)}
      </tbody></table></div></div>
    </>
  )
  return (
    <>
      <div className="ahead"><h1>Specials and sets</h1>{tabs}</div>
      <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t"><thead><tr><th>Set</th><th>Designs</th><th>Set price (R)</th><th>Shown</th><th></th></tr></thead><tbody>
        {sets.map(s => <tr key={s.id}><td><b>{s.name}</b><div className="muted" style={{ fontSize: 13 }}>{s.description}</div></td>
          <td><div style={{ display: 'flex', gap: 4 }}>{s.gift_set_items.map(i => { const p = P(i.product_id); return p ? <div key={i.product_id} className="thumb" style={{ width: 36, height: 36 }} title={fullName(p)}><img src={p.image_url} alt={fullName(p)} /></div> : null })}</div></td>
          <td><input key={s.id + s.price} className="cellin" type="number" min="0" aria-label={'Price for ' + s.name} defaultValue={s.price} onBlur={e => setPrice(s, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /></td>
          <td><button className="pill" style={{ border: 0, cursor: 'pointer', background: s.is_active ? 'var(--grey-bg)' : '#F8D7CF', color: s.is_active ? 'var(--muted2)' : '#6B2413' }} onClick={() => toggleSet(s)}>{s.is_active ? 'In shop' : 'Hidden'}</button></td>
          <td><button className="linkbtn" style={{ color: 'var(--sale)' }} onClick={() => delSet(s)}>Delete</button></td></tr>)}
      </tbody></table></div></div>
      <div className="two" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
        <div className="card panel"><h2>Build a new gift set</h2>
          <div className="grid2"><label className="field" htmlFor="gb-n">Set name<input id="gb-n" value={b.name} onChange={e => setB({ ...b, name: e.target.value })} placeholder="e.g. Owl and Hummingbird Set" /></label><label className="field" htmlFor="gb-d">Short description<input id="gb-d" value={b.description} onChange={e => setB({ ...b, description: e.target.value })} /></label></div>
          <b style={{ fontSize: 14 }}>Tap designs to add them</b>
          <div style={{ maxHeight: 520, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>{products.filter(p => p.price != null && p.is_active).map(p => <button key={p.id} type="button" className="opt" aria-pressed={!!b.pick[p.id]} onClick={() => setB({ ...b, pick: { ...b.pick, [p.id]: !b.pick[p.id] } })} style={{ minHeight: 60, padding: '8px 14px' }}><span className="tick" aria-hidden="true" style={{ pointerEvents: 'none', background: b.pick[p.id] ? 'var(--primary)' : undefined }}>{b.pick[p.id] ? '✓' : ''}</span><div className="thumb" style={{ width: 44, height: 44 }}><img src={p.image_url} alt="" /></div><span className="t"><b style={{ fontSize: 15 }}>{fullName(p)}</b><small>{typeName(p.type)}</small></span><span className="num">{R(p.price)}</span></button>)}</div>
        </div>
        <div className="summary" style={{ top: 24 }}><span className="eyebrow">Set summary</span>
          <div className="sumrow num"><span>{picks.length} designs bought separately</span><span style={{ textDecoration: 'line-through' }}>{R(full)}</span></div>
          <b style={{ fontSize: 14 }}>Set discount</b>
          <div className="chips">{[10, 15, 20, 25].map(v => <button key={v} className="chip" aria-pressed={b.price === '' && b.disc === v} onClick={() => setB({ ...b, disc: v, price: '' })}>{v}% off</button>)}</div>
          <label className="field" htmlFor="gb-p">Or type your own set price (R)<input id="gb-p" type="number" min="0" value={b.price} onChange={e => setB({ ...b, price: e.target.value })} /></label>
          <div className="sumrow" style={{ alignItems: 'baseline', borderTop: '1px solid #D9C2A8', paddingTop: 12 }}><b>Set price</b><span className="total num">{R(price)}</span></div>
          {full > price && <div className="pill" style={{ background: 'var(--primary)', color: '#fff', justifyContent: 'center', padding: 10, fontSize: 14 }}>Customers save {R(full - price)}</div>}
          <button className="btn block" onClick={publish} disabled={picks.length < 2}>Publish set to shop</button>
          <span className="muted" style={{ fontSize: 12 }}>Stock is taken from each design when a set sells.</span>
        </div>
      </div>
    </>
  )
}
