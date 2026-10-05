import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { R } from '../lib/format'

const LANG = { af: 'Afrikaans', en: 'English', none: 'No words' }

function DesignEdit({ d, themes, items, onDone, onCancel }) {
  const { toast } = useAdmin()
  const [f, setF] = useState(d)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async checked => {
    const row = { name: f.name.trim(), theme_id: f.theme_id ? Number(f.theme_id) : null, language: f.language, wording: f.wording, description: f.description.trim(), short_description: f.short_description.trim(), gift_for: f.gift_for.trim(), is_active: f.is_active, is_new: f.is_new, needs_review: checked ? false : f.needs_review }
    if (!row.name) { toast('Give the design a name'); return }
    const { error } = await supabase.from('designs').update(row).eq('id', f.id)
    if (error) { toast(error.message); return }
    // keep the products in step with the design
    await supabase.from('products').update({ name: row.name, theme_id: row.theme_id, short_description: row.short_description }).eq('design_id', f.id)
    toast(checked ? 'Checked and saved' : 'Design saved'); onDone()
  }
  return (
    <div className="card panel desedit">
      <div className="ahead"><h2 style={{ fontSize: 24 }}>{d.code}</h2><button className="linkbtn" onClick={onCancel}>Close</button></div>
      <div className="desgrid">
        <div className="stack" style={{ gap: 10 }}>
          {d.page_url && <img src={d.page_url} alt="" style={{ width: '100%', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} />}
          <div className="dthumbs">{items.map(p => <a key={p.id} className="dthumb" href={'/admin/products/' + p.id} title={p.variant}><img src={p.image_url} alt={p.variant} loading="lazy" /></a>)}</div>
          <span className="muted" style={{ fontSize: 13 }}>Tap an item to change its photo or price on its own.</span>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {d.review_notes ? <div className="note" style={{ background: 'var(--warn-bg)' }}><span><b>To check:</b> {d.review_notes}</span></div> : null}
          <label className="field" htmlFor="de-n">Name<input id="de-n" value={f.name} onChange={e => set('name', e.target.value)} /></label>
          <div className="grid2">
            <label className="field" htmlFor="de-t">Theme<select id="de-t" value={f.theme_id || ''} onChange={e => set('theme_id', e.target.value)}><option value="">None</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="field" htmlFor="de-l">Language<select id="de-l" value={f.language} onChange={e => set('language', e.target.value)}>{Object.entries(LANG).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <label className="field" htmlFor="de-w">Wording on the design<input id="de-w" value={f.wording} onChange={e => set('wording', e.target.value)} /></label>
          <label className="field" htmlFor="de-d">Description<textarea id="de-d" rows={5} value={f.description} onChange={e => set('description', e.target.value)} /></label>
          <label className="field" htmlFor="de-s">Short line for the shop card<input id="de-s" value={f.short_description} onChange={e => set('short_description', e.target.value)} /></label>
          <label className="field" htmlFor="de-g">Lovely for<input id="de-g" value={f.gift_for} onChange={e => set('gift_for', e.target.value)} /></label>
          <div className="row">
            {[['is_active', 'Show in the shop'], ['is_new', 'Mark as New']].map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />{l}</label>)}
          </div>
          <div className="row"><button className="btn sm" onClick={() => save(true)}>Save and mark checked</button><button className="btn ghost sm" onClick={() => save(false)}>Save</button></div>
        </div>
      </div>
    </div>
  )
}

// Uploads the brochure photos folder to Supabase storage and points every design and product at it
function PhotoUpload({ onDone }) {
  const { toast } = useAdmin()
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  const run = async files => {
    setErr('')
    const list = [...files].filter(f => /\.webp$/i.test(f.name) && (f.webkitRelativePath || '').includes('designs/'))
    if (!list.length) { toast('Choose the "designs" folder inside public'); return }
    const total = list.length; let done = 0, failed = 0; const ok = new Set(); let firstErr = ''
    setSt({ phase: 'Uploading photos', done, total })
    const queue = [...list]
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift(); const wp = f.webkitRelativePath; const rel = 'designs/' + wp.substring(wp.lastIndexOf('designs/') + 8)
        const { error } = await supabase.storage.from('product-images').upload(rel, f, { contentType: 'image/webp', upsert: false })
        if (error && !/exist|duplicate/i.test(error.message || '')) { failed++; firstErr = firstErr || error.message } else ok.add(rel)
        done++; setSt({ phase: 'Uploading photos', done, total })
      }
    }
    await Promise.all([1, 2, 3, 4, 5, 6].map(worker))
    if (failed) toast(failed + ' photos did not upload: ' + firstErr)
    if (!ok.size) { setSt(null); setErr(firstErr || 'No photos uploaded'); return }
    const base = supabase.storage.from('product-images').getPublicUrl('designs/x').data.publicUrl.replace(/designs\/x$/, '')
    const [{ data: ps }, { data: ds }] = await Promise.all([
      supabase.from('products').select('id, image_url').like('image_url', '/designs/%'),
      supabase.from('designs').select('id, image_url, page_url')
    ])
    const jobs = [
      ...(ps || []).filter(p => ok.has((p.image_url || '').slice(1))).map(p => () => supabase.from('products').update({ image_url: base + p.image_url.slice(1) }).eq('id', p.id)),
      ...(ds || []).filter(d => ok.has((d.image_url || '').slice(1)) || ok.has((d.page_url || '').slice(1))).map(d => () => supabase.from('designs').update({
        image_url: ok.has((d.image_url || '').slice(1)) ? base + d.image_url.slice(1) : d.image_url,
        page_url: ok.has((d.page_url || '').slice(1)) ? base + d.page_url.slice(1) : d.page_url }).eq('id', d.id))
    ]
    let k = 0; setSt({ phase: 'Linking photos', done: 0, total: jobs.length })
    const w2 = async () => { while (jobs.length) { await jobs.shift()(); k++; setSt({ phase: 'Linking photos', done: k, total: k + jobs.length }) } }
    await Promise.all([1, 2, 3, 4, 5, 6].map(w2))
    setSt(null); toast(ok.size + ' photos uploaded and linked'); onDone()
  }
  return (
    <div className="card panel" style={{ gap: 10 }}>
      <h2 style={{ fontSize: 22 }}>Upload brochure photos</h2>
      <p className="muted" style={{ fontSize: 14 }}>Choose a <b>designs</b> folder from <b>brochure photos</b> on your computer. The photos upload and link themselves. If the photos come in two parts, do each part. This box disappears once every photo is linked.</p>
      {err && <div className="note" style={{ background: '#F8D7CF' }}><span><b>Upload stopped:</b> {err}</span></div>}
      {st ? <div className="stack" style={{ gap: 6 }}><b>{st.phase}: {st.done} of {st.total}</b><div className="bartrack"><i style={{ width: (st.total ? (st.done / st.total) * 100 : 0) + '%', background: 'var(--olive)' }} /></div><span className="muted" style={{ fontSize: 13 }}>Keep this page open until it finishes.</span></div>
        : <label className="btn sm" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>Choose the designs folder<input type="file" hidden webkitdirectory="" directory="" multiple onChange={e => e.target.files.length && run(e.target.files)} /></label>}
    </div>
  )
}

function Formats() {
  const { toast } = useAdmin()
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => { const { data } = await supabase.from('formats').select('*').order('sort_order'); setRows(data || []) }, [])
  useEffect(() => { load() }, [load])
  if (!rows) return <p className="muted">Loading…</p>
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const apply = async r => {
    const price = r.price === '' || r.price == null ? null : Number(r.price); const trade = r.trade_price === '' || r.trade_price == null ? null : Number(r.trade_price)
    if (!window.confirm('Set every ' + r.label + ' to R' + (price ?? 0).toFixed(2) + (trade != null ? ' (trade R' + trade.toFixed(2) + ')' : '') + '?')) return
    const { error } = await supabase.from('formats').update({ label: r.label, price, trade_price: trade }).eq('key', r.key)
    if (error) { toast(error.message); return }
    const { data: ps } = await supabase.from('products').select('id').eq('format_key', r.key)
    const ids = (ps || []).map(p => p.id)
    if (ids.length) {
      await supabase.from('products').update({ price, special_price: null, special_ends: null, variant: r.label }).in('id', ids)
      if (trade != null) await supabase.from('wholesale_prices').upsert(ids.map(id => ({ product_id: id, price: trade })), { onConflict: 'product_id' })
    }
    toast(r.label + ': ' + ids.length + ' products updated'); load()
  }
  return (
    <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t rt"><thead><tr><th>Format</th><th>Group</th><th className="r">Retail (R)</th><th className="r">Trade (R)</th><th></th></tr></thead><tbody>
      {rows.map((r, i) => <tr key={r.key}>
        <td><input className="cellin" style={{ width: 200 }} aria-label={'Name for ' + r.label} value={r.label} onChange={e => upd(i, 'label', e.target.value)} /></td>
        <td className="muted" style={{ fontSize: 13 }}>{r.group_name}</td>
        <td className="r"><input className="cellin" type="number" min="0" step="0.5" aria-label={'Retail price for ' + r.label} value={r.price ?? ''} onChange={e => upd(i, 'price', e.target.value)} /></td>
        <td className="r"><input className="cellin" type="number" min="0" step="0.5" aria-label={'Trade price for ' + r.label} value={r.trade_price ?? ''} onChange={e => upd(i, 'trade_price', e.target.value)} /></td>
        <td><button className="btn ghost sm" onClick={() => apply(r)}>Apply to all</button></td>
      </tr>)}
    </tbody></table></div></div>
  )
}

export function Designs() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'designs'
  const [ds, setDs] = useState(null); const [themes, setThemes] = useState([]); const [prods, setProds] = useState([])
  const [q, setQ] = useState(''); const [show, setShow] = useState('all'); const [edit, setEdit] = useState(null)
  const load = useCallback(async () => {
    const [{ data: d }, { data: t }, { data: p }] = await Promise.all([
      supabase.from('designs').select('*').order('sort_order'),
      supabase.from('themes').select('id, name').order('sort_order'),
      supabase.from('products').select('id, design_id, format_key, variant, image_url, price').not('design_id', 'is', null)
    ])
    setDs(d || []); setThemes(t || []); setProds(p || [])
  }, [])
  useEffect(() => { load() }, [load])
  const by = useMemo(() => { const m = {}; prods.forEach(p => { (m[p.design_id] = m[p.design_id] || []).push(p) }); return m }, [prods])
  if (!ds) return <p className="muted">Loading…</p>
  const tn = id => (themes.find(t => t.id === id) || {}).name || ''
  const s = q.toLowerCase().trim()
  const list = ds.filter(d => (show === 'all' || (show === 'check' ? d.needs_review : show === 'hidden' ? !d.is_active : true)) && (!s || (d.code + ' ' + d.name + ' ' + d.wording).toLowerCase().includes(s)))
  const toCheck = ds.filter(d => d.needs_review).length
  return (
    <>
      <div className="ahead"><div><h1>Brochure designs</h1><p className="muted">Each design is one page in the shop, with every format it comes in. {toCheck} still to check.</p></div>
        <div className="chips">{[['designs', 'Designs (' + ds.length + ')'], ['formats', 'Formats and prices']].map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => { setSp(k === 'designs' ? {} : { tab: k }, { replace: true }); setEdit(null) }}>{l}</button>)}</div></div>
      {tab === 'formats' ? <><p className="muted">Change a price and press Apply to all. Every product in that format updates, retail and trade.</p><Formats /></> : <>
        {prods.some(p => (p.image_url || '').startsWith('/designs/')) && <PhotoUpload onDone={load} />}
        {edit && <DesignEdit key={edit.id} d={edit} themes={themes} items={by[edit.id] || []} onCancel={() => setEdit(null)} onDone={() => { setEdit(null); load() }} />}
        <div className="row"><input type="search" aria-label="Search designs" placeholder="Search by name, code or wording" value={q} onChange={e => setQ(e.target.value)} style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--line2)', borderRadius: 'var(--r-sm)', flex: '1 1 240px', background: 'var(--card)' }} />
          <div className="chips">{[['all', 'All'], ['check', 'To check (' + toCheck + ')'], ['hidden', 'Hidden']].map(([k, l]) => <button key={k} className="chip" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}</div></div>
        <div className="desgridlist">{list.map(d => { const its = by[d.id] || []; const main = its.find(p => p.format_key === 'a3') || its[0]; return (
          <button key={d.id} className="card desitem" onClick={() => { setEdit(d); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ opacity: d.is_active ? 1 : 0.55 }}>
            <div className="desimg">{main && <img src={main.image_url} alt="" loading="lazy" />}</div>
            <div className="desbody"><span className="eyebrow">{d.code}</span><b>{d.name}</b><span className="muted" style={{ fontSize: 13 }}>{[tn(d.theme_id), LANG[d.language], its.length + ' items'].filter(Boolean).join(' · ')}</span>
              {d.needs_review ? <span className="pill" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)', alignSelf: 'flex-start' }}>To check</span> : <span className="pill" style={{ background: '#E3EEDC', alignSelf: 'flex-start' }}>Checked</span>}</div>
          </button>) })}</div>
      </>}
    </>
  )
}
