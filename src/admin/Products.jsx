import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { TYPES, typeName, fullName, specialOn } from '../lib/format'

const inputS = { minHeight: 46, padding: '0 16px', borderRadius: 50, border: '1px solid var(--line2)', background: '#fff' }
const filters = () => ({
  All: () => true, ...Object.fromEntries(TYPES.map(t => [t.label, p => p.type === t.key])),
  'On special': p => specialOn(p), New: p => p.is_new, 'Made to order': p => p.made_to_order, 'Low stock': p => !p.is_custom && !p.made_to_order && p.stock < 6, Hidden: p => !p.is_active,
  'Price needed': p => p.price == null, 'Trade price needed': p => !p.is_custom && p.wholesale_price == null, 'Name check': p => p.needs_review
})
// Trade prices live in their own table: an empty price removes it
export const saveWholesale = (id, price) => (price == null || price <= 0
  ? supabase.from('wholesale_prices').delete().eq('product_id', id)
  : supabase.from('wholesale_prices').upsert({ product_id: id, price }, { onConflict: 'product_id' }))
const num = v => (String(v).trim() === '' ? null : Math.max(0, Number(String(v).replace(',', '.'))))

export function Products() {
  const { toast } = useAdmin()
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [themes, setThemes] = useState([])
  const [tab, setTab] = useState('All'); const [q, setQ] = useState(''); const [theme, setTheme] = useState('')
  const load = useCallback(async () => {
    const [{ data }, { data: th }, { data: wp }] = await Promise.all([supabase.from('products').select('*').order('sort_order').order('id'), supabase.from('themes').select('*').order('sort_order'), supabase.from('wholesale_prices').select('*')])
    const m = {}; (wp || []).forEach(x => { m[x.product_id] = Number(x.price) })
    setRows((data || []).map(p => ({ ...p, wholesale_price: m[p.id] ?? null }))); setThemes(th || [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (p, patch) => {
    const next = { ...p, ...patch }
    if (next.special_price != null && (next.price == null || Number(next.special_price) >= Number(next.price))) { toast('A special price must be lower than the normal price'); load(); return }
    const { error } = 'wholesale_price' in patch ? await saveWholesale(p.id, patch.wholesale_price) : await supabase.from('products').update(patch).eq('id', p.id)
    if (error) { toast(error.message); load(); return }
    setRows(rs => rs.map(r => (r.id === p.id ? next : r))); toast('Saved: ' + fullName(p))
  }
  if (!rows) return <p className="muted">Loading…</p>
  const s = q.toLowerCase().trim()
  const FILTERS = filters()
  const list = rows.filter(p => FILTERS[tab](p) && (!theme || String(p.theme_id) === theme) && (!s || ((p.sku || '') + ' ' + p.name + ' ' + p.variant).toLowerCase().includes(s)))
  const tn = id => (themes.find(t => t.id === id) || {}).name || ''
  const cell = (p, k, label, style) => <input key={p.id + k + p[k]} className="cellin" type="number" min="0" step="0.01" inputMode="decimal" aria-label={label + ' for ' + fullName(p)} defaultValue={p[k] ?? ''} placeholder={k === 'price' ? 'Needed' : 'None'} style={style} onBlur={e => { const v = num(e.target.value); if (v !== (p[k] == null ? null : Number(p[k]))) save(p, { [k]: v }) }} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
  return (
    <>
      <div className="ahead"><div><h1>Products</h1><p className="muted">Type a new price or stock count straight into the table. It saves when you click away. Tap a design to edit everything else.</p></div><Link className="btn sm" to="/admin/products/new">Add a product</Link></div>
      <div className="row"><input type="search" aria-label="Search products" placeholder="Search by name or SKU" value={q} onChange={e => setQ(e.target.value)} style={{ ...inputS, padding: '0 20px', flex: '1 1 240px' }} />
        <select aria-label="Theme" value={theme} onChange={e => setTheme(e.target.value)} style={inputS}><option value="">All themes</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div className="chips">{Object.keys(FILTERS).map(t => <button key={t} className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>{t} ({rows.filter(FILTERS[t]).length})</button>)}</div>
      <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t" style={{ minWidth: 1120 }}>
        <thead><tr><th></th><th>SKU</th><th>Design</th><th>Theme</th><th>Price (R)</th><th>Special (R)</th><th>Wholesale (R)</th><th>Stock</th><th>Shown</th></tr></thead>
        <tbody>{list.map(p => (
          <tr key={p.id}>
            <td><button className="thumb" style={{ width: 48, height: 48, border: 0, padding: 0, cursor: 'pointer' }} onClick={() => nav('/admin/products/' + p.id)} aria-label={'Edit ' + fullName(p)}>{p.image_url && <img src={p.image_url} alt="" />}</button></td>
            <td className="muted" style={{ fontSize: 13 }}>{p.sku}</td>
            <td><Link to={'/admin/products/' + p.id} style={{ color: 'inherit' }}><b>{p.name}</b></Link><div className="muted" style={{ fontSize: 13 }}>{[typeName(p.type), p.variant].filter(Boolean).join(' · ')}</div>{p.needs_review && <span className="pill" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)', marginTop: 4 }}>Check the name</span>}</td>
            <td style={{ fontSize: 14 }}>{tn(p.theme_id)}</td>
            <td>{cell(p, 'price', 'Price', p.price == null ? { borderColor: 'var(--warn-fg)', background: 'var(--warn-bg)' } : undefined)}</td>
            <td>{cell(p, 'special_price', 'Special price')}</td>
            <td>{p.is_custom ? <span className="muted" style={{ fontSize: 13 }}>Retail only</span> : cell(p, 'wholesale_price', 'Wholesale price', { borderColor: 'var(--olive)' })}</td>
            <td>{p.is_custom || p.made_to_order ? <span className="muted" style={{ fontSize: 13 }}>Made to order</span> : <div className="mini-qty" style={{ margin: 0 }}><button onClick={() => save(p, { stock: Math.max(0, p.stock - 1) })} aria-label="One less">&minus;</button><input key={p.id + 's' + p.stock} className="cellin" style={{ width: 64, textAlign: 'center' }} type="number" min="0" step="1" aria-label={'Stock for ' + fullName(p)} defaultValue={p.stock} onBlur={e => { const v = Math.round(num(e.target.value) || 0); if (v !== p.stock) save(p, { stock: v }) }} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /><button onClick={() => save(p, { stock: p.stock + 1 })} aria-label="One more">+</button></div>}</td>
            <td><div className="chips" style={{ gap: 4 }}>
              <button className="pill" style={{ border: 0, cursor: 'pointer', background: p.is_active ? 'var(--grey-bg)' : '#F8D7CF', color: p.is_active ? 'var(--muted2)' : '#6B2413' }} aria-pressed={p.is_active} onClick={() => save(p, { is_active: !p.is_active })}>{p.is_active ? 'In shop' : 'Hidden'}</button>
              <button className="pill" style={{ border: 0, cursor: 'pointer', background: p.is_new ? 'var(--surface)' : '#fff', color: 'var(--primary-dk)', outline: '1px solid var(--line2)' }} aria-pressed={p.is_new} onClick={() => save(p, { is_new: !p.is_new })}>New</button>
            </div></td>
          </tr>))}
          {!list.length && <tr><td colSpan={9} className="muted" style={{ padding: 24 }}>No products match.</td></tr>}</tbody></table></div></div>
    </>
  )
}

const BLANK = { sku: '', name: '', variant: '', type: 'coaster', theme_id: null, short_description: '', care: 'Place on any flat surface. Wipe clean with a damp cloth and let it dry. Keep out of standing water and the dishwasher.', material: 'MDF, UV printed on the top face.', size: '', price: null, special_price: null, special_ends: null, wholesale_price: null, cost_price: null, stock: 0, made_to_order: false, cost_item_id: null, is_new: true, is_custom: false, is_active: true, needs_review: false, image_url: '', sort_order: 999 }

export function ProductEdit() {
  const { id } = useParams()
  const isNew = id === 'new'
  const { toast } = useAdmin()
  const nav = useNavigate()
  const [p, setP] = useState(null); const [themes, setThemes] = useState([]); const [cards, setCards] = useState([]); const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('themes').select('*').order('sort_order').then(({ data }) => setThemes(data || []))
    supabase.from('cost_items').select('id, name').order('sort_order').then(({ data }) => setCards(data || []))
    if (isNew) setP({ ...BLANK }); else Promise.all([supabase.from('products').select('*').eq('id', id).maybeSingle(), supabase.from('wholesale_prices').select('price').eq('product_id', id).maybeSingle()]).then(([{ data }, { data: wp }]) => setP(data ? { ...data, wholesale_price: wp ? Number(wp.price) : null } : false))
  }, [id, isNew])
  if (p === null) return <p className="muted">Loading…</p>
  if (p === false) return <p className="muted">Product not found. <Link to="/admin/products">Back to products</Link></p>
  const set = (k, v) => setP({ ...p, [k]: v })
  const F = (k, label, props = {}) => <label className="field" htmlFor={'pe-' + k}>{label}<input id={'pe-' + k} value={p[k] ?? ''} onChange={e => set(k, e.target.value)} {...props} /></label>
  const N = (k, label) => F(k, label, { type: 'number', min: 0, step: k === 'stock' ? 1 : 0.01, inputMode: 'decimal' })

  const upload = async file => {
    setBusy(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = 'products/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext
    const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type })
    setBusy(false)
    if (error) { toast('Upload failed: ' + error.message); return }
    set('image_url', supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl)
  }
  const save = async () => {
    if (!p.name.trim()) { toast('Give the design a name'); return }
    const row = { ...p }
    ;['price', 'special_price', 'wholesale_price', 'cost_price'].forEach(k => { row[k] = row[k] === '' || row[k] == null ? null : Number(row[k]) })
    row.stock = Math.round(Number(row.stock) || 0); row.theme_id = row.theme_id ? Number(row.theme_id) : null; row.cost_item_id = row.cost_item_id ? Number(row.cost_item_id) : null
    row.special_ends = row.special_ends || null
    if (row.special_price != null && (row.price == null || row.special_price >= row.price)) { toast('A special price must be lower than the normal price'); return }
    if (!row.sku) delete row.sku
    const trade = row.is_custom ? null : row.wholesale_price
    delete row.id; delete row.created_at; delete row.wholesale_price
    setBusy(true)
    const res = isNew ? await supabase.from('products').insert(row).select().single() : await supabase.from('products').update(row).eq('id', id).select().single()
    setBusy(false)
    if (res.error) { toast(res.error.message); return }
    const wr = await saveWholesale(res.data.id, trade)
    if (wr.error) { toast('Saved, but the trade price did not save: ' + wr.error.message); return }
    if (isNew && !res.data.sku) {
      const sku = (({ coaster: 'CST', stand: 'STD', board: 'BRD', home: 'HOM', gifts: 'GFT' }[res.data.type]) || res.data.type.slice(0, 3).toUpperCase()) + String(res.data.id).padStart(3, '0')
      await supabase.from('products').update({ sku }).eq('id', res.data.id)
    }
    toast(isNew ? 'Product added' : 'Saved'); nav('/admin/products')
  }
  const dt = p.special_ends ? new Date(p.special_ends).toISOString().slice(0, 10) : ''
  return (
    <>
      <div className="ahead"><div className="stack" style={{ gap: 4 }}><Link className="linkbtn" style={{ alignSelf: 'flex-start' }} to="/admin/products">Back to products</Link><h1>{isNew ? 'Add a product' : p.name}</h1></div>
        <div className="row">{!isNew && <a className="btn ghost sm" href={'/product/' + id} target="_blank" rel="noreferrer">View in shop</a>}<button className="btn sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div></div>
      <div className="two" style={{ gridTemplateColumns: '360px minmax(0,1fr)' }}>
        <div className="card panel">
          <b>Product photo</b>
          <label htmlFor="pe-img" style={{ cursor: 'pointer', borderRadius: 16, overflow: 'hidden', aspectRatio: '1/1', background: 'var(--t1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--line2)' }}>
            {p.image_url ? <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="muted">{busy ? 'Uploading…' : 'Tap to upload a photo'}</span>}
          </label>
          <input id="pe-img" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => e.target.files[0] && upload(e.target.files[0])} />
          <span className="muted" style={{ fontSize: 13 }}>Square photos look best. JPG, PNG or WebP up to 5 MB.</span>
          <div className="stack" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            {[['is_active', 'Show in the shop'], ['is_new', 'Mark as New'], ['made_to_order', 'Made to order (never sold out, stock not counted)'], ['is_custom', 'Custom photo product (customer uploads a photo)'], ['needs_review', 'Flag: check the name']].map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}><input type="checkbox" checked={!!p[k]} onChange={e => set(k, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />{l}</label>)}
          </div>
        </div>
        <div className="card panel">
          <div className="grid2">{F('name', 'Design name')}{F('variant', 'Variant (optional)', { placeholder: 'e.g. Sepia' })}</div>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <label className="field" htmlFor="pe-type">Product<select id="pe-type" value={p.type} onChange={e => set('type', e.target.value)}>{TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            <label className="field" htmlFor="pe-theme">Theme<select id="pe-theme" value={p.theme_id || ''} onChange={e => set('theme_id', e.target.value)}><option value="">None</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            {F('sku', 'SKU', { placeholder: 'Made for you if blank' })}
          </div>
          <label className="field" htmlFor="pe-short">Description<textarea id="pe-short" rows={3} value={p.short_description} onChange={e => set('short_description', e.target.value)} /></label>
          <div className="grid2">{F('material', 'Material')}{F('size', 'Size', { placeholder: 'e.g. 100 x 100 mm' })}</div>
          <label className="field" htmlFor="pe-care">Care<textarea id="pe-care" rows={2} value={p.care} onChange={e => set('care', e.target.value)} /></label>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>{N('price', 'Price (R)')}{N('special_price', 'Special (R)')}{N('wholesale_price', 'Wholesale (R)')}{N('cost_price', 'Your cost (R)')}{p.made_to_order || p.is_custom ? null : N('stock', 'Stock')}</div>
          <div className="grid2" style={{ alignItems: 'end' }}><label className="field" htmlFor="pe-card">Costing card<select id="pe-card" value={p.cost_item_id || ''} onChange={e => set('cost_item_id', e.target.value)}><option value="">None</option>{cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <p className="muted" style={{ fontSize: 13 }}>Your cost is private and used for the profit report. With a costing card, <Link to="/admin/costing">Costing</Link> works it out and fills it in for you.</p></div>
          <div className="grid2"><label className="field" htmlFor="pe-se">Special ends (optional)<input id="pe-se" type="date" value={dt} onChange={e => set('special_ends', e.target.value ? new Date(e.target.value + 'T23:59:59+02:00').toISOString() : null)} /></label>{N('sort_order', 'Display order (lower shows first)')}</div>
        </div>
      </div>
    </>
  )
}
