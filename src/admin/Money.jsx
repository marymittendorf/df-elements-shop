import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'
import { R, fmtDate, fmtDateTime } from '../lib/format'
import { downloadCSV, ymd, n2 } from '../lib/csv'

const today = () => ymd(new Date())
const KIND = { transfer: 'Moved', money_in: 'Money in', money_out: 'Money out', adjustment: 'Correction' }
const round2 = v => Math.round(Number(v || 0) * 100) / 100

// Does this expense change the account's balance? Only expenses recorded after the starting balance,
// and not dated before it (an old receipt typed in late was already in the starting balance).
const after = (x, y) => new Date(x) >= new Date(y)
export const countsFor = (a, e) => e.account_id === a.id && after(e.created_at, a.opening_at) && e.expense_date >= ymd(a.opening_at)
const orderCounts = (a, o) => a.receives_sales && o.paid_at && after(o.paid_at, a.opening_at) && o.status !== 'cancelled'

// Every line for one account, oldest first, with the running balance
function ledger(a, accounts, exps, orders, moves) {
  const A = Object.fromEntries(accounts.map(x => [x.id, x]))
  const lines = []
  exps.filter(e => countsFor(a, e)).forEach(e => lines.push({ key: 'e' + e.id, date: e.expense_date, at: e.created_at, what: e.supplier, sub: e.description || 'Expense', amt: -Number(e.amount), type: 'expense' }))
  orders.filter(o => orderCounts(a, o)).forEach(o => lines.push({ key: 'o' + o.id, date: ymd(o.paid_at), at: o.paid_at, what: 'Order ' + o.order_no, sub: o.first_name + ' ' + o.last_name, amt: Number(o.total), type: 'order', order_no: o.order_no }))
  moves.filter(m => m.from_account_id === a.id || m.to_account_id === a.id).forEach(m => {
    const out = m.from_account_id === a.id
    const other = A[out ? m.to_account_id : m.from_account_id]
    const what = m.kind === 'transfer' ? (out ? 'Moved to ' : 'Moved from ') + (other ? other.name : 'another account') : KIND[m.kind]
    lines.push({ key: 'm' + m.id, date: m.moved_on, at: m.created_at, what, sub: m.note, amt: out ? -Number(m.amount) : Number(m.amount), type: 'move', move: m })
  })
  lines.sort((x, y) => (x.date === y.date ? (x.at < y.at ? -1 : 1) : x.date < y.date ? -1 : 1))
  let bal = Number(a.opening_balance)
  lines.forEach(l => { bal = round2(bal + l.amt); l.bal = bal })
  return { lines, balance: bal }
}

function MoveForm({ mode, acct, accounts, balance, onDone, onCancel }) {
  const { toast } = useAdmin()
  const active = accounts.filter(a => a.is_active)
  const bank = active.find(a => a.kind === 'bank') || active[0]
  const cash = active.find(a => a.kind === 'cash')
  const [f, setF] = useState(() => ({
    from: mode === 'transfer' ? (acct.kind === 'cash' && bank ? bank.id : acct.id) : acct.id,
    to: mode === 'transfer' ? (acct.kind === 'cash' ? acct.id : (cash || active.find(a => a.id !== acct.id) || {}).id) : acct.id,
    amount: '', actual: '', moved_on: today(), note: ''
  }))
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const diff = mode === 'adjustment' && f.actual !== '' ? round2(Number(f.actual) - balance) : 0
  const title = { transfer: 'Move money between accounts', money_in: 'Money in to ' + acct.name, money_out: 'Money out of ' + acct.name, adjustment: 'Check ' + acct.name + ' against ' + (acct.kind === 'cash' ? 'the cash you counted' : 'your bank statement') }[mode]
  const save = async () => {
    let row
    if (mode === 'adjustment') {
      if (f.actual === '') { toast('Type in the actual balance'); return }
      if (!diff) { toast('It already matches, nothing to correct'); onCancel(); return }
      row = { kind: 'adjustment', amount: Math.abs(diff), from_account_id: diff < 0 ? acct.id : null, to_account_id: diff > 0 ? acct.id : null, moved_on: f.moved_on, note: f.note.trim() || 'Matched to actual balance of ' + R(f.actual) }
    } else {
      if (!(Number(f.amount) > 0)) { toast('Type in the amount'); return }
      if (mode === 'transfer' && Number(f.from) === Number(f.to)) { toast('Choose two different accounts'); return }
      if (mode !== 'transfer' && !f.note.trim()) { toast('Add a short note so you know what it was'); return }
      row = { kind: mode, amount: round2(f.amount), moved_on: f.moved_on, note: f.note.trim(),
        from_account_id: mode === 'transfer' ? Number(f.from) : mode === 'money_out' ? acct.id : null,
        to_account_id: mode === 'transfer' ? Number(f.to) : mode === 'money_in' ? acct.id : null }
    }
    setBusy(true)
    const { error } = await supabase.from('account_movements').insert(row)
    setBusy(false)
    if (error) { toast(error.message); return }
    toast('Saved'); onDone()
  }
  const sel = (id, k, label) => <label className="field" htmlFor={id}>{label}<select id={id} value={f[k] || ''} onChange={e => set(k, Number(e.target.value))}>{active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  return (
    <div className="card panel expform">
      <h2 style={{ fontSize: 24 }}>{title}</h2>
      {mode === 'transfer' && <div className="grid3">{sel('mv-f', 'from', 'From')}{sel('mv-t', 'to', 'To')}<label className="field" htmlFor="mv-a">Amount (R)<input id="mv-a" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} /></label></div>}
      {(mode === 'money_in' || mode === 'money_out') && <div className="grid3"><label className="field" htmlFor="mv-a">Amount (R)<input id="mv-a" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} /></label></div>}
      {mode === 'adjustment' && <>
        <div className="grid3">
          <div className="field"><span>The shop thinks</span><b className="num" style={{ fontSize: 22, minHeight: 48, display: 'flex', alignItems: 'center' }}>{R(balance)}</b></div>
          <label className="field" htmlFor="mv-act">{acct.kind === 'cash' ? 'Cash you counted (R)' : 'Balance on your statement (R)'}<input id="mv-act" type="number" step="0.01" inputMode="decimal" value={f.actual} onChange={e => set('actual', e.target.value)} /></label>
          <div className="field"><span>Difference</span><b className="num" style={{ fontSize: 22, minHeight: 48, display: 'flex', alignItems: 'center', color: diff < 0 ? 'var(--sale)' : diff > 0 ? 'var(--olive)' : 'var(--muted)' }}>{f.actual === '' ? '' : diff === 0 ? 'Matches' : (diff > 0 ? '+ ' : '− ') + R(Math.abs(diff))}</b></div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Before correcting, check for anything not recorded yet, like bank charges or an expense you still need to add. Adding those as expenses is better than a correction.</p>
      </>}
      <div className="grid3">
        <label className="field" htmlFor="mv-d">Date<input id="mv-d" type="date" value={f.moved_on} onChange={e => set('moved_on', e.target.value)} /></label>
        <label className="field" htmlFor="mv-n" style={{ gridColumn: 'span 2' }}>Note{mode === 'transfer' || mode === 'adjustment' ? ' (optional)' : ''}<input id="mv-n" value={f.note} onChange={e => set('note', e.target.value)} placeholder={mode === 'money_in' ? 'For example I put in money of my own' : mode === 'money_out' ? 'For example I took money out for myself' : mode === 'transfer' ? 'For example top up petty cash' : 'For example bank interest'} /></label>
      </div>
      <div className="row"><button className="btn sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button><button className="btn ghost sm" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

function AccountsSetup({ accounts, onChange }) {
  const { toast } = useAdmin()
  const [n, setN] = useState({ name: '', kind: 'bank', opening_balance: '' })
  const save = async (a, patch) => { const { error } = await supabase.from('money_accounts').update(patch).eq('id', a.id); if (error) toast(error.message); else onChange() }
  const salesTo = async a => {
    const cur = accounts.find(x => x.receives_sales)
    if (cur) await supabase.from('money_accounts').update({ receives_sales: false }).eq('id', cur.id)
    await save(a, { receives_sales: true })
  }
  const add = async () => {
    if (!n.name.trim()) { toast('Give the account a name'); return }
    const { error } = await supabase.from('money_accounts').insert({ name: n.name.trim(), kind: n.kind, opening_balance: round2(n.opening_balance), sort_order: accounts.length + 1 })
    if (error) { toast(error.message.includes('duplicate') ? 'There is already an account with that name' : error.message); return }
    setN({ name: '', kind: 'bank', opening_balance: '' }); toast('Account added'); onChange()
  }
  return (
    <div className="card panel">
      <h2 style={{ fontSize: 22 }}>Accounts</h2>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>The starting balance is what was in the account at the start time. Money recorded after that moment is added or taken off.</p>
      {accounts.map(a => (
        <div key={a.id} className="acctrow" style={{ opacity: a.is_active ? 1 : 0.55 }}>
          <input aria-label="Account name" className="budname" defaultValue={a.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== a.name) save(a, { name: v }) }} />
          <span className="muted" style={{ fontSize: 13 }}>{a.kind === 'cash' ? 'Cash' : 'Bank'} · started {fmtDateTime(a.opening_at)}</span>
          <label className="budin"><span className="sr">Starting balance for {a.name}</span>R<input type="number" step="0.01" defaultValue={a.opening_balance} onBlur={e => { const v = round2(e.target.value); if (v !== Number(a.opening_balance)) save(a, { opening_balance: v }) }} /></label>
          {a.receives_sales ? <span className="pill" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)' }}>Shop sales go here</span> : a.kind === 'bank' && a.is_active ? <button className="linkbtn" onClick={() => salesTo(a)}>Send shop sales here</button> : <span />}
          <button className="linkbtn" onClick={() => save(a, a.is_active ? { is_active: false, receives_sales: false } : { is_active: true })}>{a.is_active ? 'Hide' : 'Show'}</button>
        </div>
      ))}
      <div className="row" style={{ paddingTop: 6 }}>
        <label className="field" htmlFor="na-n" style={{ flex: 2, minWidth: 180 }}><span className="sr">New account name</span><input id="na-n" placeholder="New account name" value={n.name} onChange={e => setN({ ...n, name: e.target.value })} /></label>
        <label className="field" htmlFor="na-k" style={{ flex: 1, minWidth: 120 }}><span className="sr">Type</span><select id="na-k" value={n.kind} onChange={e => setN({ ...n, kind: e.target.value })}><option value="bank">Bank</option><option value="cash">Cash</option></select></label>
        <label className="field" htmlFor="na-b" style={{ flex: 1, minWidth: 140 }}><span className="sr">Starting balance</span><input id="na-b" type="number" step="0.01" placeholder="Starting R" value={n.opening_balance} onChange={e => setN({ ...n, opening_balance: e.target.value })} /></label>
        <button className="btn ghost sm" onClick={add}>Add account</button>
      </div>
    </div>
  )
}

export function Money() {
  const { toast } = useAdmin()
  const [accounts, setAccounts] = useState(null)
  const [exps, setExps] = useState([]); const [orders, setOrders] = useState([]); const [moves, setMoves] = useState([])
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  const [setup, setSetup] = useState(false)
  const [all, setAll] = useState(false)

  const load = useCallback(async () => {
    const { data: acc, error } = await supabase.from('money_accounts').select('*').order('sort_order').order('id')
    if (error) { toast(error.message); setAccounts([]); return }
    const list = acc || []
    const start = list.length ? new Date(Math.min(...list.map(a => new Date(a.opening_at).getTime()))).toISOString() : new Date().toISOString()
    const [{ data: e }, { data: o }, { data: m }] = await Promise.all([
      supabase.from('expenses').select('id, expense_date, supplier, description, amount, account_id, created_at').not('account_id', 'is', null).gte('created_at', start),
      supabase.from('orders').select('id, order_no, first_name, last_name, total, status, paid_at').gte('paid_at', start).neq('status', 'cancelled'),
      supabase.from('account_movements').select('*')
    ])
    setAccounts(list); setExps(e || []); setOrders(o || []); setMoves(m || [])
    setSel(s => s && list.some(a => a.id === s) ? s : (list.find(a => a.is_active) || {}).id)
  }, [toast])
  useEffect(() => { load() }, [load])

  const books = useMemo(() => Object.fromEntries((accounts || []).map(a => [a.id, ledger(a, accounts, exps, orders, moves)])), [accounts, exps, orders, moves])
  if (!accounts) return <p className="muted">Loading…</p>
  if (!accounts.length) return <><h1>Bank and cash</h1><p className="muted">No accounts yet. Run 16_bank_and_cash.sql in Supabase first.</p></>

  const acct = accounts.find(a => a.id === sel) || accounts[0]
  const { lines, balance } = books[acct.id]
  const shown = [...lines].reverse()
  const visible = all ? shown : shown.slice(0, 40)
  const active = accounts.filter(a => a.is_active)
  const total = active.reduce((s, a) => s + books[a.id].balance, 0)
  const mIn = lines.filter(l => l.amt > 0 && l.date.slice(0, 7) === today().slice(0, 7)).reduce((s, l) => s + l.amt, 0)
  const mOut = lines.filter(l => l.amt < 0 && l.date.slice(0, 7) === today().slice(0, 7)).reduce((s, l) => s - l.amt, 0)
  const delMove = async m => {
    if (!window.confirm('Delete this ' + KIND[m.kind].toLowerCase() + ' of ' + R(m.amount) + '?')) return
    const { error } = await supabase.from('account_movements').delete().eq('id', m.id)
    if (error) toast(error.message); else { toast('Deleted'); load() }
  }
  const csv = () => downloadCSV(acct.name.replace(/\W+/g, '-').toLowerCase() + '-' + today() + '.csv', ['Date', 'What', 'Details', 'In', 'Out', 'Balance'],
    [['', 'Starting balance', fmtDateTime(acct.opening_at), '', '', n2(acct.opening_balance)], ...lines.map(l => [l.date, l.what, l.sub, l.amt > 0 ? n2(l.amt) : '', l.amt < 0 ? n2(-l.amt) : '', n2(l.bal)])])
  const open = mode => { setForm(mode); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <>
      <div className="ahead"><div><h1>Bank and cash</h1><p className="muted">What is in each account, worked out from your shop sales, expenses and the money you move.</p></div>
        <div className="row"><button className="btn ghost sm" onClick={() => setSetup(s => !s)}>{setup ? 'Close accounts' : 'Accounts'}</button></div></div>

      {setup && <AccountsSetup accounts={accounts} onChange={load} />}

      <div className="acctcards">
        {active.map(a => {
          const b = books[a.id].balance
          return (
            <button key={a.id} className="card acctcard" aria-pressed={a.id === acct.id} onClick={() => { setSel(a.id); setForm(null) }}>
              <span className="eyebrow">{a.kind === 'cash' ? 'Cash' : 'Bank'}{a.receives_sales ? ' · shop sales' : ''}</span>
              <span className="acctname">{a.name}</span>
              <b className="num" style={{ color: b < 0 ? 'var(--sale)' : undefined }}>{R(b)}</b>
              <span className="muted" style={{ fontSize: 13 }}>Started at {R(a.opening_balance)} on {fmtDate(a.opening_at)}</span>
            </button>
          )
        })}
        {active.length > 1 && <div className="card acctcard total"><span className="eyebrow">All together</span><span className="acctname">Total</span><b className="num">{R(total)}</b><span className="muted" style={{ fontSize: 13 }}>{active.length} accounts</span></div>}
      </div>

      <div className="ahead">
        <div className="row">
          <button className="btn sm" onClick={() => open('transfer')}>{acct.kind === 'cash' ? 'Top up ' + acct.name : 'Move money'}</button>
          <button className="btn ghost sm" onClick={() => open('money_in')}>Money in</button>
          <button className="btn ghost sm" onClick={() => open('money_out')}>Money out</button>
          <button className="btn ghost sm" onClick={() => open('adjustment')}>{acct.kind === 'cash' ? 'Count the cash' : 'Check against statement'}</button>
        </div>
        <button className="btn ghost sm" onClick={csv} disabled={!lines.length}>Download CSV</button>
      </div>

      {form && <MoveForm key={form + acct.id} mode={form} acct={acct} accounts={accounts} balance={balance} onCancel={() => setForm(null)} onDone={() => { setForm(null); load() }} />}

      <div className="kpis">
        <div className="card kpi"><span style={{ fontWeight: 600 }}>{acct.name} now</span><b className="num">{R(balance)}</b><span>{lines.length} line{lines.length === 1 ? '' : 's'} since the start</span></div>
        <div className="card kpi"><span style={{ fontWeight: 600 }}>In this month</span><b className="num">{R(mIn)}</b><span>{acct.receives_sales ? 'Paid orders and money in' : 'Top ups and money in'}</span></div>
        <div className="card kpi"><span style={{ fontWeight: 600 }}>Out this month</span><b className="num">{R(mOut)}</b><span>Expenses and money out</span></div>
        <div className="card kpi"><span style={{ fontWeight: 600 }}>Expenses paid from here</span><b className="num">{lines.filter(l => l.type === 'expense').length}</b><span><Link to="/admin/expenses" className="linkbtn" style={{ padding: 0 }}>Go to Expenses</Link></span></div>
      </div>

      <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t stacktable"><thead><tr><th>Date</th><th>What</th><th style={{ textAlign: 'right' }}>In</th><th style={{ textAlign: 'right' }}>Out</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr></thead><tbody>
        {visible.map(l => (
          <tr key={l.key}>
            <td data-l="Date">{fmtDate(l.date + 'T12:00:00')}</td>
            <td data-l="What"><b>{l.type === 'order' ? <Link to={'/admin/orders/' + l.order_no} className="linkbtn" style={{ padding: 0 }}>{l.what}</Link> : l.what}</b>{l.sub ? <div className="muted" style={{ fontSize: 13 }}>{l.sub}</div> : null}</td>
            <td data-l="In" className="num" style={{ textAlign: 'right', color: 'var(--olive)' }}>{l.amt > 0 ? R(l.amt) : ''}</td>
            <td data-l="Out" className="num" style={{ textAlign: 'right' }}>{l.amt < 0 ? R(-l.amt) : ''}</td>
            <td data-l="Balance" className="num" style={{ textAlign: 'right' }}><b>{R(l.bal)}</b></td>
            <td>{l.type === 'move' ? <button className="linkbtn" style={{ color: 'var(--sale)' }} onClick={() => delMove(l.move)}>Delete</button> : null}</td>
          </tr>
        ))}
        {(all || shown.length <= 40) && <tr><td data-l="Date">{fmtDate(acct.opening_at)}</td><td data-l="What"><b>Starting balance</b><div className="muted" style={{ fontSize: 13 }}>{fmtDateTime(acct.opening_at)}</div></td><td /><td /><td data-l="Balance" className="num" style={{ textAlign: 'right' }}><b>{R(acct.opening_balance)}</b></td><td /></tr>}
      </tbody></table></div>
        {shown.length > 40 && !all ? <div style={{ padding: '10px 0' }}><button className="linkbtn" onClick={() => setAll(true)}>Show all {shown.length} lines</button></div> : null}
      </div>
    </>
  )
}
