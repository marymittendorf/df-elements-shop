import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'

export function Settings() {
  const { toast } = useAdmin()
  const [s, setS] = useState(null); const [del, setDel] = useState([]); const [themes, setThemes] = useState([])
  const load = useCallback(async () => {
    const [{ data: st }, { data: d }, { data: t }] = await Promise.all([supabase.from('settings').select('*').eq('id', 1).single(), supabase.from('delivery_options').select('*').order('sort_order'), supabase.from('themes').select('*').order('sort_order')])
    setS(st); setDel(d || []); setThemes(t || [])
  }, [])
  useEffect(() => { load() }, [load])
  if (!s) return <p className="muted">Loading…</p>
  const F = (k, l, props = {}) => <label className="field" htmlFor={'st-' + k}>{l}<input id={'st-' + k} value={s[k] || ''} onChange={e => setS({ ...s, [k]: e.target.value })} {...props} /></label>
  const saveS = async () => { const { id, ...row } = s; const { error } = await supabase.from('settings').update(row).eq('id', 1); toast(error ? error.message : 'Settings saved') }
  const saveDel = async d => { const { error } = await supabase.from('delivery_options').update({ name: d.name, description: d.description, rate: Number(d.rate) || 0, is_active: d.is_active }).eq('id', d.id); toast(error ? error.message : 'Saved: ' + d.name); load() }
  const addDel = async () => { await supabase.from('delivery_options').insert({ name: 'New delivery option', rate: 0, sort_order: del.length + 1, is_active: false }); load() }
  const saveTheme = async t => { const { error } = await supabase.from('themes').update({ name: t.name, subtitle: t.subtitle, description: t.description }).eq('id', t.id); toast(error ? error.message : 'Saved: ' + t.name) }
  const addTheme = async () => { await supabase.from('themes').insert({ name: 'New theme ' + (themes.length + 1), sort_order: themes.length + 1 }); load() }
  const upd = (arr, setArr, i, k, v) => setArr(arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const endDate = s.specials_end ? new Date(s.specials_end).toISOString().slice(0, 10) : ''
  return (
    <>
      <div className="ahead"><div><h1>Settings</h1><p className="muted">Your business details appear on invoices. Your bank details are shown to customers after they order.</p></div><button className="btn sm" onClick={saveS}>Save settings</button></div>
      <div className="two" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="card panel"><h2 style={{ fontSize: 26 }}>Bank details for EFT</h2>{F('bank_name', 'Bank')}{F('account_name', 'Account name')}<div className="grid2">{F('account_number', 'Account number')}{F('branch_code', 'Branch code')}</div></div>
        <div className="card panel"><h2 style={{ fontSize: 26 }}>Business details</h2>{F('business_name', 'Business name')}{F('address', 'Business address')}<div className="grid2">{F('email', 'Email')}{F('phone', 'Phone')}</div>{F('vat_number', 'VAT number (if registered)')}
          <div className="row" style={{ alignItems: 'end' }}>
            <button type="button" className="toggle" aria-pressed={!!s.vat_registered} onClick={() => setS({ ...s, vat_registered: !s.vat_registered })}>{s.vat_registered ? 'Charging VAT' : 'Not charging VAT'}<span className="trk"><span className="knob" /></span></button>
            <label className="field" htmlFor="st-vr" style={{ width: 120 }}>VAT rate (%)<input id="st-vr" type="number" min="0" max="50" step="0.5" value={s.vat_rate ?? 15} onChange={e => setS({ ...s, vat_rate: e.target.value })} /></label>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Prices include VAT. When VAT is on, new orders get a tax invoice showing the VAT amount. Orders already placed keep the VAT they were placed with.</p>
          {F('wholesale_free_delivery_from', 'Wholesale: free courier on orders from (R)', { type: 'number', min: 0 })}
          <label className="field" htmlFor="st-se">Specials end date<input id="st-se" type="date" value={endDate} onChange={e => setS({ ...s, specials_end: e.target.value ? new Date(e.target.value + 'T23:59:59+02:00').toISOString() : null })} /></label></div>
      </div>
      <div className="card panel"><div className="ahead"><h2 style={{ fontSize: 26 }}>Delivery options</h2><button className="btn ghost sm" onClick={addDel}>Add an option</button></div>
        {del.map((d, i) => <div key={d.id} className="grid2" style={{ gridTemplateColumns: '2fr 3fr 110px auto auto', alignItems: 'end' }}>
          <label className="field">Name<input value={d.name} onChange={e => upd(del, setDel, i, 'name', e.target.value)} /></label>
          <label className="field">Description<input value={d.description} onChange={e => upd(del, setDel, i, 'description', e.target.value)} /></label>
          <label className="field">Rate (R)<input type="number" min="0" value={d.rate} onChange={e => upd(del, setDel, i, 'rate', e.target.value)} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 48 }}><input type="checkbox" checked={d.is_active} onChange={e => upd(del, setDel, i, 'is_active', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />On</label>
          <button className="btn ghost sm" onClick={() => saveDel(d)}>Save</button>
        </div>)}
      </div>
      <div className="card panel"><div className="ahead"><h2 style={{ fontSize: 26 }}>Themes</h2><button className="btn ghost sm" onClick={addTheme}>Add a theme</button></div>
        {themes.map((t, i) => <div key={t.id} className="grid2" style={{ gridTemplateColumns: '1fr 1fr 2fr auto', alignItems: 'end' }}>
          <label className="field">Name<input value={t.name} onChange={e => upd(themes, setThemes, i, 'name', e.target.value)} /></label>
          <label className="field">Subtitle<input value={t.subtitle || ''} onChange={e => upd(themes, setThemes, i, 'subtitle', e.target.value)} /></label>
          <label className="field">Description<input value={t.description || ''} onChange={e => upd(themes, setThemes, i, 'description', e.target.value)} /></label>
          <button className="btn ghost sm" onClick={() => saveTheme(t)}>Save</button>
        </div>)}
      </div>
    </>
  )
}
