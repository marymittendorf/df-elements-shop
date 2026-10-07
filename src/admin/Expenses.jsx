import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { R, fmtDate } from '../lib/format'
import { downloadCSV, ymd, n2 } from '../lib/csv'

export const PAID_BY = { eft: 'EFT', card: 'Card', cash: 'Cash', debit_order: 'Debit order' }
const today = () => ymd(new Date())
const monthKey = d => d.slice(0, 7)
const monthLabel = k => new Date(k + '-01T12:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
const shiftMonth = (k, n) => { const d = new Date(k + '-01T12:00:00'); d.setMonth(d.getMonth() + n); return ymd(d).slice(0, 7) }
const lastDay = k => { const d = new Date(k + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return ymd(d) }
const vatIn = (amt, rate) => Math.round((Number(amt || 0) * rate / (100 + rate)) * 100) / 100
const findSup = (list, name) => list.find(s => s.name.trim().toLowerCase() === (name || '').trim().toLowerCase())

// Remember the supplier and whether they charge VAT, so the next expense fills itself in
async function rememberSupplier(list, name, charges_vat) {
  const s = findSup(list, name)
  if (!s) return supabase.from('suppliers').insert({ name: name.trim(), charges_vat })
  if (s.charges_vat !== charges_vat) return supabase.from('suppliers').update({ charges_vat }).eq('id', s.id)
}

// Starting VAT answer for the form: unanswered for something new, worked out from the saved VAT when editing
const vatStart = (x, rate) => {
  const known = !!(x.id || x.recurring_id)
  const has = known ? Number(x.vat_amount) > 0 : null
  return { has_vat: has, vat_manual: !!has && Math.abs(Number(x.vat_amount) - vatIn(x.amount, rate)) > 0.01 }
}
const vatOf = (f, rate) => (f.has_vat ? (f.vat_manual ? Number(f.vat_amount || 0) : vatIn(f.amount, rate)) : 0)

// Supplier picked: fill in the VAT answer from the supplier list
const pickSupplier = (setF, list, rate) => v => {
  const s = findSup(list, v)
  setF(x => s ? { ...x, supplier: v, has_vat: s.charges_vat, vat_manual: false } : { ...x, supplier: v })
}

function VatQuestion({ f, setF, rate, id }) {
  const choose = yes => setF(x => ({ ...x, has_vat: yes, vat_manual: false }))
  return (
    <div className="field">
      <span>Did this include VAT?</span>
      <span className="vatin">
        <button type="button" className="chip" aria-pressed={f.has_vat === true} onClick={() => choose(true)}>Yes</button>
        <button type="button" className="chip" aria-pressed={f.has_vat === false} onClick={() => choose(false)}>No</button>
      </span>
      {f.has_vat === true && (f.vat_manual
        ? <span className="vatin"><input id={id} aria-label="VAT amount (R)" type="number" min="0" step="0.01" inputMode="decimal" value={f.vat_amount} onChange={e => setF(x => ({ ...x, vat_amount: e.target.value }))} /><button type="button" className="linkbtn" onClick={() => setF(x => ({ ...x, vat_manual: false }))}>Use {rate}%</button></span>
        : <span className="muted" style={{ fontSize: 13 }}>VAT {R(vatIn(f.amount, rate))} <button type="button" className="linkbtn" onClick={() => setF(x => ({ ...x, vat_manual: true, vat_amount: vatIn(x.amount, rate) }))}>Change</button></span>)}
    </div>
  )
}

// next date a recurring expense will be added
const nextDue = r => {
  const base = r.generated_through ? shiftMonth(monthKey(r.generated_through), 1) : monthKey(r.start_date)
  let k = base
  for (let i = 0; i < 24; i++) {
    const d = k + '-' + String(Math.min(r.day_of_month, Number(lastDay(k).slice(8)))).padStart(2, '0')
    if (d >= r.start_date) return r.end_date && d > r.end_date ? null : d
    k = shiftMonth(k, 1)
  }
  return null
}

function ExpenseForm({ exp, cats, suppliers, rate, onDone, onCancel }) {
  const { toast } = useAdmin()
  const [f, setF] = useState(() => ({ ...exp, ...vatStart(exp, rate) }))
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.supplier.trim() || !f.category_id || !(Number(f.amount) > 0)) { toast('Fill in the supplier, category and amount'); return }
    if (f.has_vat == null) { toast('Choose whether this included VAT'); return }
    const vat = vatOf(f, rate)
    if (vat > Number(f.amount)) { toast('VAT cannot be more than the amount'); return }
    const known = findSup(suppliers, f.supplier)
    const supplier = known ? known.name : f.supplier.trim()
    setBusy(true)
    let receipt_path = f.receipt_path || null
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = f.expense_date.slice(0, 7) + '/' + crypto.randomUUID() + '.' + ext
      const { error } = await supabase.storage.from('expense-receipts').upload(path, file, { contentType: file.type })
      if (error) { setBusy(false); toast('Receipt did not upload: ' + error.message); return }
      receipt_path = path
    }
    const row = { expense_date: f.expense_date, supplier, category_id: Number(f.category_id), description: (f.description || '').trim(), amount: Number(f.amount), vat_amount: vat, paid_by: f.paid_by, receipt_path }
    const { error } = f.id ? await supabase.from('expenses').update(row).eq('id', f.id) : await supabase.from('expenses').insert(row)
    if (!error) await rememberSupplier(suppliers, supplier, !!f.has_vat)
    setBusy(false)
    if (error) { toast(error.message); return }
    toast(f.id ? 'Expense saved' : 'Expense added'); onDone(row.expense_date)
  }
  const del = async () => {
    if (!window.confirm('Delete this expense of ' + R(f.amount) + ' from ' + f.supplier + '?')) return
    if (f.receipt_path) await supabase.storage.from('expense-receipts').remove([f.receipt_path])
    await supabase.from('expenses').delete().eq('id', f.id); toast('Expense deleted'); onDone()
  }
  const openReceipt = async () => { const { data } = await supabase.storage.from('expense-receipts').createSignedUrl(f.receipt_path, 300); if (data) window.open(data.signedUrl, '_blank') }
  return (
    <div className="card panel expform">
      <div className="ahead"><h2 style={{ fontSize: 24 }}>{f.id ? 'Edit expense' : 'New expense'}</h2>{f.recurring_id ? <span className="pill" style={{ background: 'var(--surface)' }}>Added automatically</span> : null}</div>
      <div className="grid3">
        <label className="field" htmlFor="ex-d">Date<input id="ex-d" type="date" value={f.expense_date} onChange={e => set('expense_date', e.target.value)} /></label>
        <label className="field" htmlFor="ex-s">Supplier<input id="ex-s" list="ex-sup" value={f.supplier} onChange={e => pickSupplier(setF, suppliers, rate)(e.target.value)} placeholder="Type or pick a supplier" autoComplete="off" /></label>
        <label className="field" htmlFor="ex-c">Category<select id="ex-c" value={f.category_id || ''} onChange={e => set('category_id', e.target.value)}><option value="">Choose…</option>{cats.filter(c => c.is_active || c.id === Number(f.category_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <datalist id="ex-sup">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
      <label className="field" htmlFor="ex-de">What was it for<input id="ex-de" value={f.description} onChange={e => set('description', e.target.value)} placeholder="For example 50 coaster blanks" /></label>
      <div className="grid3">
        <label className="field" htmlFor="ex-a">Amount paid (R)<input id="ex-a" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} /></label>
        <VatQuestion f={f} setF={setF} rate={rate} id="ex-v" />
        <label className="field" htmlFor="ex-p">Paid by<select id="ex-p" value={f.paid_by} onChange={e => set('paid_by', e.target.value)}>{Object.entries(PAID_BY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="row">
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>{file ? 'Receipt: ' + file.name : f.receipt_path ? 'Replace receipt' : 'Add receipt photo or PDF'}<input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={e => setFile(e.target.files[0] || null)} /></label>
        {f.receipt_path && !file ? <button className="linkbtn" onClick={openReceipt}>View receipt</button> : null}
      </div>
      <div className="row"><button className="btn sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save expense'}</button><button className="btn ghost sm" onClick={onCancel}>Cancel</button>{f.id ? <button className="linkbtn" style={{ color: 'var(--sale)', marginLeft: 'auto' }} onClick={del}>Delete</button> : null}</div>
    </div>
  )
}

function RecurringForm({ r, cats, suppliers, rate, onDone, onCancel }) {
  const { toast } = useAdmin()
  const [f, setF] = useState(() => ({ ...r, ...vatStart(r.id ? { ...r, recurring_id: r.id } : r, rate) }))
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.supplier.trim() || !f.category_id || !(Number(f.amount) > 0)) { toast('Fill in the supplier, category and amount'); return }
    if (f.has_vat == null) { toast('Choose whether this included VAT'); return }
    const vat = vatOf(f, rate)
    if (vat > Number(f.amount)) { toast('VAT cannot be more than the amount'); return }
    const known = findSup(suppliers, f.supplier)
    const supplier = known ? known.name : f.supplier.trim()
    const row = { supplier, category_id: Number(f.category_id), description: (f.description || '').trim(), amount: Number(f.amount), vat_amount: vat, paid_by: f.paid_by, day_of_month: Math.min(31, Math.max(1, Number(f.day_of_month) || 1)), start_date: f.start_date, end_date: f.end_date || null, is_active: f.is_active }
    const { error } = f.id ? await supabase.from('recurring_expenses').update(row).eq('id', f.id) : await supabase.from('recurring_expenses').insert(row)
    if (error) { toast(error.message); return }
    await rememberSupplier(suppliers, supplier, !!f.has_vat)
    toast('Recurring expense saved'); onDone()
  }
  const del = async () => { if (!window.confirm('Stop and delete this recurring expense? Expenses already added stay.')) return; await supabase.from('recurring_expenses').delete().eq('id', f.id); toast('Recurring expense deleted'); onDone() }
  return (
    <div className="card panel expform">
      <h2 style={{ fontSize: 24 }}>{f.id ? 'Edit recurring expense' : 'New recurring expense'}</h2>
      <div className="grid3">
        <label className="field" htmlFor="rc-s">Supplier<input id="rc-s" list="rc-sup" value={f.supplier} onChange={e => pickSupplier(setF, suppliers, rate)(e.target.value)} placeholder="For example Afrihost" autoComplete="off" /></label>
        <label className="field" htmlFor="rc-c">Category<select id="rc-c" value={f.category_id || ''} onChange={e => set('category_id', e.target.value)}><option value="">Choose…</option>{cats.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field" htmlFor="rc-de">What it is for<input id="rc-de" value={f.description} onChange={e => set('description', e.target.value)} /></label>
      </div>
      <div className="grid3">
        <label className="field" htmlFor="rc-a">Amount each month (R)<input id="rc-a" type="number" min="0" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></label>
        <VatQuestion f={f} setF={setF} rate={rate} id="rc-v" />
        <label className="field" htmlFor="rc-p">Paid by<select id="rc-p" value={f.paid_by} onChange={e => set('paid_by', e.target.value)}>{Object.entries(PAID_BY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <datalist id="rc-sup">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
      <div className="grid3">
        <label className="field" htmlFor="rc-day">Day of the month<input id="rc-day" type="number" min="1" max="31" value={f.day_of_month} onChange={e => set('day_of_month', e.target.value)} /></label>
        <label className="field" htmlFor="rc-st">Starts<input id="rc-st" type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></label>
        <label className="field" htmlFor="rc-en">Ends (optional)<input id="rc-en" type="date" value={f.end_date || ''} onChange={e => set('end_date', e.target.value)} /></label>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Day 31 means the last day of each month. Each month's expense is added automatically on that day, the next time you open Expenses.</p>
      <div className="row"><button className="btn sm" onClick={save}>Save</button><button className="btn ghost sm" onClick={onCancel}>Cancel</button>{f.id ? <button className="linkbtn" style={{ color: 'var(--sale)', marginLeft: 'auto' }} onClick={del}>Delete</button> : null}</div>
    </div>
  )
}

export function Expenses() {
  const { toast } = useAdmin()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'list'
  const [month, setMonth] = useState(monthKey(today()))
  const [cats, setCats] = useState(null); const [rows, setRows] = useState([]); const [rec, setRec] = useState([]); const [suppliers, setSuppliers] = useState([])
  const [rate, setRate] = useState(15)
  const [cat, setCat] = useState('')
  const [edit, setEdit] = useState(null); const [redit, setRedit] = useState(null)
  const [newCat, setNewCat] = useState('')

  const load = useCallback(async () => {
    const [{ data: c }, { data: e }, { data: r }, { data: s }, { data: st }] = await Promise.all([
      supabase.from('expense_categories').select('*').order('sort_order').order('name'),
      supabase.from('expenses').select('*').gte('expense_date', month + '-01').lte('expense_date', lastDay(month)).order('expense_date', { ascending: false }).order('id', { ascending: false }),
      supabase.from('recurring_expenses').select('*').order('supplier'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('settings').select('vat_rate').eq('id', 1).single()
    ])
    setCats(c || []); setRows(e || []); setRec(r || []); setSuppliers(s || []); if (st) setRate(Number(st.vat_rate) || 15)
  }, [month])
  useEffect(() => {
    supabase.rpc('generate_recurring_expenses').then(({ data }) => { if (data > 0) toast(data + ' recurring expense' + (data === 1 ? ' was' : 's were') + ' added') ; load() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const C = useMemo(() => Object.fromEntries((cats || []).map(c => [c.id, c])), [cats])
  if (!cats) return <p className="muted">Loading…</p>
  const shown = rows.filter(r => !cat || r.category_id === Number(cat))
  const total = shown.reduce((s, r) => s + Number(r.amount), 0)
  const vat = shown.reduce((s, r) => s + Number(r.vat_amount), 0)
  const budget = cats.filter(c => c.is_active).reduce((s, c) => s + Number(c.monthly_budget || 0), 0)
  const allTotal = rows.reduce((s, r) => s + Number(r.amount), 0)
  const byCat = id => rows.filter(r => r.category_id === id).reduce((s, r) => s + Number(r.amount), 0)
  const openReceipt = async p => { const { data } = await supabase.storage.from('expense-receipts').createSignedUrl(p, 300); if (data) window.open(data.signedUrl, '_blank') }
  const blank = () => ({ expense_date: month === monthKey(today()) ? today() : month + '-01', supplier: '', category_id: cat || '', description: '', amount: '', vat_amount: '', paid_by: 'eft', receipt_path: null })
  const csv = () => downloadCSV('expenses-' + month + '.csv', ['Date', 'Supplier', 'Category', 'Description', 'Paid by', 'Amount', 'VAT', 'Amount excl VAT', 'Receipt'],
    shown.map(r => [r.expense_date, r.supplier, (C[r.category_id] || {}).name, r.description, PAID_BY[r.paid_by], n2(r.amount), n2(r.vat_amount), n2(r.amount - r.vat_amount), r.receipt_path ? 'Yes' : 'No']))

  const saveCat = async (c, patch) => { const { error } = await supabase.from('expense_categories').update(patch).eq('id', c.id); if (error) toast(error.message); else load() }
  const addCat = async () => { const name = newCat.trim(); if (!name) return; const { error } = await supabase.from('expense_categories').insert({ name, sort_order: cats.length + 1 }); if (error) { toast(error.message.includes('duplicate') ? 'That category already exists' : error.message); return } setNewCat(''); load() }

  const saveSup = async (s, patch) => { const { error } = await supabase.from('suppliers').update(patch).eq('id', s.id); if (error) toast(error.message); else load() }
  const renameSup = async (s, value) => {
    const v = value.trim(); if (!v || v === s.name) return
    const other = findSup(suppliers.filter(x => x.id !== s.id), v)
    if (other) { toast('There is already a supplier called ' + other.name); load(); return }
    const { error } = await supabase.from('suppliers').update({ name: v }).eq('id', s.id)
    if (error) { toast(error.message); return }
    if (window.confirm('Also change "' + s.name + '" to "' + v + '" on your past and recurring expenses?')) {
      await supabase.from('expenses').update({ supplier: v }).eq('supplier', s.name)
      await supabase.from('recurring_expenses').update({ supplier: v }).eq('supplier', s.name)
    }
    toast('Supplier renamed'); load()
  }
  const delSup = async s => { if (!window.confirm('Remove ' + s.name + ' from the supplier list? Past expenses keep the name.')) return; await supabase.from('suppliers').delete().eq('id', s.id); load() }

  const tabs = [['list', 'Expenses'], ['budgets', 'Budgets and categories'], ['suppliers', 'Suppliers (' + suppliers.length + ')'], ['recurring', 'Recurring (' + rec.filter(r => r.is_active).length + ')']]
  const monthNav = <div className="monthnav"><button className="btn ghost sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><b>{monthLabel(month)}</b><button className="btn ghost sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthKey(today())}>›</button></div>

  return (
    <>
      <div className="ahead"><div><h1>Expenses</h1><p className="muted">Everything the business spends, with receipts, budgets and monthly costs added for you.</p></div>
        <div className="row">{tab === 'recurring' ? <button className="btn sm" onClick={() => setRedit({ supplier: '', category_id: '', description: '', amount: '', vat_amount: 0, paid_by: 'debit_order', day_of_month: 1, start_date: today(), end_date: '', is_active: true })}>Add a recurring expense</button> : <button className="btn sm" onClick={() => { setSp({}, { replace: true }); setEdit(blank()) }}>Add an expense</button>}</div></div>
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => { setSp(k === 'list' ? {} : { tab: k }, { replace: true }); setEdit(null); setRedit(null) }}>{l}</button>)}</div>

      {tab === 'list' && <>
        {edit && <ExpenseForm key={edit.id || 'new'} exp={edit} cats={cats} suppliers={suppliers} rate={rate} onCancel={() => setEdit(null)} onDone={d => { setEdit(null); if (d && monthKey(d) !== month) setMonth(monthKey(d)); else load() }} />}
        <div className="ahead">{monthNav}
          <div className="row"><label className="field" htmlFor="ex-f" style={{ flexDirection: 'row', alignItems: 'center' }}><span className="sr">Category</span><select id="ex-f" value={cat} onChange={e => setCat(e.target.value)} style={{ minHeight: 40 }}><option value="">All categories</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button className="btn ghost sm" onClick={csv} disabled={!shown.length}>Download CSV</button></div></div>
        <div className="kpis">
          <div className="card kpi"><span style={{ fontWeight: 600 }}>Spent</span><b className="num">{R(total)}</b><span>{shown.length} expense{shown.length === 1 ? '' : 's'}</span></div>
          <div className="card kpi"><span style={{ fontWeight: 600 }}>VAT paid</span><b className="num">{R(vat)}</b><span>Input VAT for your VAT201</span></div>
          <div className="card kpi"><span style={{ fontWeight: 600 }}>Monthly budget</span><b className="num">{budget ? R(budget) : 'Not set'}</b><span>{budget ? (allTotal <= budget ? R(budget - allTotal) + ' left' : R(allTotal - budget) + ' over') : 'Set budgets per category'}</span></div>
          <div className="card kpi"><span style={{ fontWeight: 600 }}>Missing receipts</span><b className="num">{shown.filter(r => !r.receipt_path).length}</b><span>Tap an expense to add one</span></div>
        </div>
        <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t stacktable"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Paid by</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>VAT</th><th>Receipt</th></tr></thead><tbody>
          {shown.length ? shown.map(r => <tr key={r.id} className="click" onClick={() => { setEdit({ ...r }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <td data-l="Date">{fmtDate(r.expense_date + 'T12:00:00')}</td>
            <td data-l="Supplier"><b>{r.supplier}</b>{r.description ? <div className="muted" style={{ fontSize: 13 }}>{r.description}</div> : null}{r.recurring_id ? <div className="muted" style={{ fontSize: 12 }}>Monthly, added automatically</div> : null}</td>
            <td data-l="Category">{(C[r.category_id] || {}).name}</td><td data-l="Paid by">{PAID_BY[r.paid_by]}</td>
            <td data-l="Amount" className="num" style={{ textAlign: 'right' }}><b>{R(r.amount)}</b></td><td data-l="VAT" className="num muted" style={{ textAlign: 'right' }}>{Number(r.vat_amount) ? R(r.vat_amount) : ''}</td>
            <td data-l="Receipt">{r.receipt_path ? <button className="linkbtn" onClick={e => { e.stopPropagation(); openReceipt(r.receipt_path) }}>View</button> : <span className="muted" style={{ fontSize: 13 }}>None</span>}</td></tr>)
            : <tr><td colSpan={7} className="muted" style={{ padding: 20 }}>No expenses in {monthLabel(month)}{cat ? ' for this category' : ''}.</td></tr>}
        </tbody></table></div></div>
      </>}

      {tab === 'budgets' && <>
        <div className="ahead">{monthNav}<span className="muted" style={{ fontSize: 14 }}>Budget per month. Leave empty for no budget.</span></div>
        <div className="card panel budgets">
          {cats.map(c => {
            const spent = byCat(c.id); const b = Number(c.monthly_budget || 0); const pct = b ? Math.min(100, (spent / b) * 100) : 0
            return (
              <div key={c.id} className="budrow" style={{ opacity: c.is_active ? 1 : 0.55 }}>
                <input aria-label="Category name" className="budname" defaultValue={c.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) saveCat(c, { name: v }) }} />
                <div className="budbar"><div className="bartrack" title={b ? Math.round((spent / b) * 100) + '% used' : ''}><i style={{ width: (b ? pct : 0) + '%', background: b && spent > b ? 'var(--sale)' : 'var(--olive)' }} /></div>
                  <span className="muted num" style={{ fontSize: 13 }}>{R(spent)} spent{b ? ' of ' + R(b) : ''}{b && spent > b ? ', ' + R(spent - b) + ' over' : ''}</span></div>
                <label className="budin"><span className="sr">Monthly budget for {c.name}</span>R<input type="number" min="0" step="50" defaultValue={c.monthly_budget ?? ''} placeholder="No budget" onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.monthly_budget == null ? null : Number(c.monthly_budget))) saveCat(c, { monthly_budget: v }) }} /></label>
                <button className="linkbtn" onClick={() => saveCat(c, { is_active: !c.is_active })}>{c.is_active ? 'Hide' : 'Show'}</button>
              </div>
            )
          })}
          <div className="row" style={{ paddingTop: 8 }}><label className="field" htmlFor="nc" style={{ flex: 1, minWidth: 200 }}><span className="sr">New category</span><input id="nc" placeholder="New category name" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} /></label><button className="btn ghost sm" onClick={addCat}>Add category</button></div>
        </div>
      </>}

      {tab === 'suppliers' && <>
        <p className="muted" style={{ fontSize: 14 }}>New suppliers are added here when you save an expense. Fix a spelling or change whether a supplier charges VAT, and the expense form fills itself in from this list.</p>
        <div className="card panel budgets">
          {suppliers.length ? suppliers.map(s => (
            <div key={s.id} className="budrow">
              <input aria-label="Supplier name" className="budname" defaultValue={s.name} onBlur={e => renameSup(s, e.target.value)} />
              <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={s.charges_vat} onChange={e => saveSup(s, { charges_vat: e.target.checked })} />Charges VAT</label>
              <button className="linkbtn" style={{ color: 'var(--sale)' }} onClick={() => delSup(s)}>Remove</button>
            </div>
          )) : <p className="muted">No suppliers yet. They are added automatically when you save an expense.</p>}
        </div>
      </>}

      {tab === 'recurring' && <>
        {redit && <RecurringForm key={redit.id || 'new'} r={redit} cats={cats} suppliers={suppliers} rate={rate} onCancel={() => setRedit(null)} onDone={() => { setRedit(null); supabase.rpc('generate_recurring_expenses').then(() => load()) }} />}
        <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t stacktable"><thead><tr><th>Supplier</th><th>Category</th><th style={{ textAlign: 'right' }}>Each month</th><th>Day</th><th>Next</th><th>On</th></tr></thead><tbody>
          {rec.length ? rec.map(r => { const nx = r.is_active ? nextDue(r) : null; return <tr key={r.id} className="click" onClick={() => setRedit({ ...r, end_date: r.end_date || '' })} style={{ opacity: r.is_active ? 1 : 0.55 }}>
            <td data-l="Supplier"><b>{r.supplier}</b>{r.description ? <div className="muted" style={{ fontSize: 13 }}>{r.description}</div> : null}</td><td data-l="Category">{(C[r.category_id] || {}).name}</td>
            <td data-l="Each month" className="num" style={{ textAlign: 'right' }}><b>{R(r.amount)}</b></td><td data-l="Day">{r.day_of_month === 31 ? 'Last day' : r.day_of_month}</td>
            <td data-l="Next">{nx ? fmtDate(nx + 'T12:00:00') : <span className="muted">{r.is_active ? 'Ended' : 'Paused'}</span>}</td>
            <td data-l="On"><button className="linkbtn" onClick={async e => { e.stopPropagation(); await supabase.from('recurring_expenses').update(r.is_active ? { is_active: false } : { is_active: true, generated_through: !r.generated_through || r.generated_through < today() ? today() : r.generated_through }).eq('id', r.id); load() }}>{r.is_active ? 'Pause' : 'Resume'}</button></td></tr> })
            : <tr><td colSpan={6} className="muted" style={{ padding: 20 }}>No recurring expenses yet. Add things you pay every month, like rent, internet or software.</td></tr>}
        </tbody></table></div></div>
      </>}
    </>
  )
}
