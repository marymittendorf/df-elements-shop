import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useShop } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icons'
import { PageHead, Loading } from '../components/ShopParts'
import { R, STATUS, fmtDate } from '../lib/format'

const FIELDS = [['first_name', 'First name'], ['last_name', 'Surname'], ['email', 'Email', 'email'], ['phone', 'Mobile number', 'tel']]
const ADDR = [['street', 'Street address'], ['suburb', 'Suburb'], ['city', 'City or town'], ['postal_code', 'Postal code']]
const REQUIRED = { first_name: 'first name', last_name: 'surname', email: 'email', phone: 'mobile number', street: 'street address', city: 'city or town' }

export function Checkout() {
  const { lines, subtotal, delivery, loading, customer, session, clearCart, loadCatalog, toast } = useShop()
  const nav = useNavigate()
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', street: '', suburb: '', city: '', postal_code: '' })
  const [del, setDel] = useState(null)
  const [notes, setNotes] = useState('')
  const [saveMe, setSaveMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bad, setBad] = useState('')

  useEffect(() => { if (customer) setF(x => { const n = { ...x }; Object.keys(n).forEach(k => { if (!n[k] && customer[k]) n[k] = customer[k] }); return n }) }, [customer])
  useEffect(() => { if (!del && delivery[0]) setDel(delivery[0].id) }, [delivery, del])

  if (loading) return <Loading />
  if (!lines.length) return <section><div className="wrap stack" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 40 }}><h1 style={{ fontSize: 48 }}>Your cart is empty</h1><p className="muted">Add something lovely and come back here to check out.</p><Link className="btn" to="/shop">Shop the range</Link></div></section>

  const d = delivery.find(x => x.id === del)
  const fee = d ? Number(d.rate) : 0
  const inp = ([k, label, type]) => (
    <label key={k} className="field" htmlFor={'co-' + k}>{label}<input id={'co-' + k} type={type || 'text'} value={f[k]} style={bad === k ? { borderColor: 'var(--sale)' } : undefined}
      autoComplete={{ first_name: 'given-name', last_name: 'family-name', email: 'email', phone: 'tel', street: 'address-line1', suburb: 'address-level3', city: 'address-level2', postal_code: 'postal-code' }[k]}
      onChange={e => { setF({ ...f, [k]: e.target.value }); if (bad === k) setBad('') }} /></label>)

  const place = async () => {
    setErr('')
    const miss = Object.keys(REQUIRED).find(k => !f[k].trim())
    if (miss) { setBad(miss); document.getElementById('co-' + miss)?.focus(); toast('Please fill in your ' + REQUIRED[miss]); return }
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setBad('email'); toast('Please check your email address'); return }
    if (!d) { toast('Please choose a delivery option'); return }
    setBusy(true)
    const items = lines.map(l => l.t === 's' ? { gift_set_id: l.id, qty: l.qty } : { product_id: l.id, qty: l.qty, custom_note: l.note || '', custom_photo_path: l.photo || null })
    const { data, error } = await supabase.rpc('place_order', { p_order: { customer: f, delivery_option_id: d.id, items, notes } })
    if (error) { setBusy(false); setErr(error.message); loadCatalog(); return }
    if (session && customer && saveMe) {
      await supabase.from('customers').update({ first_name: f.first_name, last_name: f.last_name, phone: f.phone, street: f.street, suburb: f.suburb, city: f.city, postal_code: f.postal_code }).eq('id', session.user.id)
    }
    clearCart(); loadCatalog()
    nav('/order/' + data.order_no, { state: { order: data } })
  }

  return (
    <>
      <PageHead crumbs="Checkout" title="Checkout" style={{ paddingBlock: 40 }} />
      <section style={{ paddingTop: 40 }}><div className="wrap co">
        <div className="stack" style={{ gap: 20 }}>
          <div className="card step">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>1. Your details</h2>{customer ? <span className="pill" style={{ background: 'var(--surface)', color: 'var(--primary-dk)' }}>Signed in</span> : <span className="muted" style={{ fontSize: 14 }}>Have an account? <Link className="linkbtn" to="/account?next=checkout">Sign in</Link></span>}</div>
            <div className="grid2">{FIELDS.map(inp)}</div>
          </div>
          <div className="card step"><h2>2. Delivery address</h2><div className="grid2">{ADDR.map(inp)}</div>
            {customer && <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }} className="muted"><input type="checkbox" checked={saveMe} onChange={e => setSaveMe(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />Save these details to my account</label>}
          </div>
          <div className="card step"><h2>3. Delivery option</h2>
            {delivery.map(o => <button key={o.id} type="button" className="opt" aria-pressed={del === o.id} onClick={() => setDel(o.id)}><span className="radio" /><span className="t"><b>{o.name}</b><small>{o.description}</small></span><b className="num">{R(o.rate)}</b></button>)}
          </div>
          <div className="card step"><h2>4. Payment by EFT</h2>
            <p className="muted">After you place your order you get our bank details and your order number to use as the payment reference. We start printing as soon as your payment reflects.</p>
            <label className="field" htmlFor="co-notes">Note for your order (optional)<textarea id="co-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. It is a gift, please do not include the invoice" /></label>
          </div>
        </div>
        <aside className="summary"><span className="eyebrow">Summary</span><h2 style={{ fontSize: 32 }}>Your order</h2>
          {lines.map(l => <div className="line" key={l.k} style={{ borderColor: '#E2CDB6' }}><div className="thumb">{l.img && <img src={l.img} alt="" />}</div><div className="info"><b>{l.name}</b><span className="muted" style={{ fontSize: 13 }}>{l.meta} · Qty {l.qty}</span></div><b className="num">{R(l.unit * l.qty)}</b></div>)}
          {lines.some(l => l.product && l.product.is_custom) && <div className="note" style={{ background: 'var(--bg)' }}><Icon.brush /><span style={{ fontSize: 14 }}>Your order has a custom item. We send a proof before printing.</span></div>}
          <div className="stack num" style={{ gap: 8, fontSize: 15, borderTop: '1px solid #D9C2A8', paddingTop: 14 }}>
            <div className="sumrow"><span>Subtotal</span><span>{R(subtotal)}</span></div>
            <div className="sumrow"><span>Delivery</span><span>{R(fee)}</span></div>
            <div className="sumrow" style={{ alignItems: 'baseline' }}><b>Total</b><span className="total">{R(subtotal + fee)}</span></div>
          </div>
          {err && <div className="note" style={{ background: '#F8D7CF', color: '#6B2413' }}>{err}</div>}
          <button className="btn block" onClick={place} disabled={busy}>{busy ? 'Placing your order…' : 'Place order'}</button>
          <p className="muted" style={{ fontSize: 13 }}>Prices are checked again when you place your order.</p>
        </aside>
      </div></section>
    </>
  )
}

export function BankBox({ bank }) {
  const b = bank || {}
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--soft)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 15, textAlign: 'left' }}>
      <b>Bank</b><span>{b.bank_name || 'To be confirmed'}</span><b>Account name</b><span>{b.account_name}</span><b>Account number</b><span className="num">{b.account_number || 'To be confirmed'}</span><b>Branch code</b><span className="num">{b.branch_code || 'To be confirmed'}</span>
    </div>
  )
}

export function OrderDone() {
  const { state } = useLocation()
  const o = state && state.order
  if (!o) return <section><div className="wrap stack" style={{ alignItems: 'center', textAlign: 'center' }}><h1 style={{ fontSize: 44 }}>Thank you for your order</h1><p className="muted">Signed in customers can see all their orders and their status under My account.</p><Link className="btn" to="/account">My account</Link></div></section>
  return (
    <section><div className="wrap stack" style={{ maxWidth: 720, textAlign: 'center', alignItems: 'center' }}>
      <span className="circle" style={{ width: 72, height: 72 }}><Icon.check /></span>
      <span className="eyebrow">Order placed</span>
      <h1 style={{ fontSize: 'clamp(40px,6vw,64px)' }}>Thank you, {o.first_name}</h1>
      <p className="muted" style={{ fontSize: 18 }}>Your order number is <b>{o.order_no}</b>. Please pay <b>{R(o.total)}</b> by EFT and use <b>{o.order_no}</b> as your payment reference.{o.has_custom ? ' We will also send you a design proof for your custom item.' : ''}</p>
      <div style={{ width: '100%', maxWidth: 480 }}><BankBox bank={o.bank} /></div>
      <p className="muted" style={{ fontSize: 14 }}>We start printing as soon as your payment reflects and email you when it ships.</p>
      <div className="row" style={{ justifyContent: 'center' }}><Link className="btn" to="/shop">Keep shopping</Link><button className="btn ghost" onClick={() => window.print()}>Print this page</button></div>
    </div></section>
  )
}

export function Account() {
  const { session, customer, setCustomer, loadCustomer, toast } = useShop()
  const nav = useNavigate()
  const loc = useLocation()
  const next = new URLSearchParams(loc.search).get('next')
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [name, setName] = useState({ first: '', last: '' })
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const [orders, setOrders] = useState(null)
  const [edit, setEdit] = useState(null)

  useEffect(() => {
    if (!session) { setOrders(null); return }
    supabase.from('orders').select('id, order_no, created_at, total, status').eq('customer_id', session.user.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setOrders(data || []))
  }, [session, customer])

  // A signed in person without a customer row (just confirmed their email): create it
  useEffect(() => {
    if (session && customer === null) {
      const m = session.user.user_metadata || {}
      supabase.from('customers').insert({ id: session.user.id, email: session.user.email, first_name: m.first_name || '', last_name: m.last_name || '' }).then(() => loadCustomer(session))
    }
  }, [session, customer, loadCustomer])

  const signIn = async e => {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) { setMsg('That email and password do not match.'); return }
    toast('Signed in'); if (next === 'checkout') nav('/checkout')
  }
  const signUp = async e => {
    e.preventDefault(); setMsg('')
    if (pw.length < 8) { setMsg('Please choose a password of at least 8 characters.'); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { first_name: name.first, last_name: name.last }, emailRedirectTo: window.location.origin + '/account' } })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    if (!data.session) setMsg('Almost done. We sent you an email, click the link in it to confirm your account.')
    else toast('Welcome to DF Elements')
  }
  const reset = async () => {
    if (!email.trim()) { setMsg('Type your email address first, then press Forgot your password.'); return }
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/account' })
    setMsg('If that email has an account, we sent a link to reset your password.')
  }
  const saveDetails = async () => {
    const { data, error } = await supabase.from('customers').update(edit).eq('id', session.user.id).select().single()
    if (error) { toast('Could not save, please try again'); return }
    setCustomer(data); setEdit(null); toast('Details saved')
  }

  if (!session) return (
    <>
      <PageHead eyebrow="Welcome" title="Your account" />
      <section><div className="wrap acct3">
        <form className="card" onSubmit={mode === 'in' ? signIn : signUp}>
          <h2 style={{ fontSize: 32 }}>{mode === 'in' ? 'Sign in' : 'Create an account'}</h2>
          {mode === 'up' && <div className="grid2"><label className="field" htmlFor="ac-f">First name<input id="ac-f" value={name.first} onChange={e => setName({ ...name, first: e.target.value })} /></label><label className="field" htmlFor="ac-l">Surname<input id="ac-l" value={name.last} onChange={e => setName({ ...name, last: e.target.value })} /></label></div>}
          <label className="field" htmlFor="ac-e">Email<input id="ac-e" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label className="field" htmlFor="ac-p">Password<input id="ac-p" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} required /></label>
          {msg && <div className="note">{msg}</div>}
          <button className="btn" type="submit" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create my account'}</button>
          {mode === 'in' && <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={reset}>Forgot your password?</button>}
        </form>
        <div className="rcard"><span className="eyebrow" style={{ color: 'var(--surface)' }}>{mode === 'in' ? 'New here?' : 'Already have an account?'}</span><h2 style={{ fontSize: 32 }}>{mode === 'in' ? 'Create an account' : 'Sign in instead'}</h2>
          {['Check out faster with your saved address', 'See all your orders and their status', 'Order again in a click'].map(t => <div key={t} className="row" style={{ gap: 10, fontSize: 15, flexWrap: 'nowrap' }}><span className="pill" style={{ background: 'var(--surface)', color: 'var(--primary-dk)', width: 24, height: 24, padding: 0, justifyContent: 'center', flexShrink: 0 }}><Icon.check size={14} /></span>{t}</div>)}
          <button className="btn light" style={{ marginTop: 'auto' }} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }}>{mode === 'in' ? 'Create my account' : 'Sign in'}</button></div>
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 30, display: 'flex', flexDirection: 'column', gap: 14 }}><h2 style={{ fontSize: 32 }}>Just want to shop?</h2><p className="muted">No account needed. Check out as a guest and we will email your order details.</p><Link className="btn ghost" style={{ marginTop: 'auto' }} to="/checkout">Continue as guest</Link></div>
      </div></section>
    </>
  )

  const c = customer || {}
  return (
    <>
      <div className="phead"><div className="wrap ahead"><div><span className="eyebrow">My account</span><h1>Welcome{c.first_name ? ', ' + c.first_name : ''}</h1></div><button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>
      <section><div className="wrap acctgrid">
        <div className="card panel">
          <h2 style={{ fontSize: 28 }}>My details</h2>
          {edit ? <>
            <div className="grid2">{[...FIELDS.filter(x => x[0] !== 'email'), ...ADDR].map(([k, l]) => <label key={k} className="field" htmlFor={'me-' + k}>{l}<input id={'me-' + k} value={edit[k] || ''} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></label>)}</div>
            <div className="row"><button className="btn sm" onClick={saveDetails}>Save</button><button className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button></div>
          </> : <>
            <b>{[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Add your name'}</b>
            <span className="muted">{session.user.email}{c.phone ? ' · ' + c.phone : ''}</span>
            <span className="muted">{[c.street, c.suburb, c.city, c.postal_code].filter(Boolean).join(', ') || 'No address saved yet'}</span>
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, street: c.street, suburb: c.suburb, city: c.city, postal_code: c.postal_code })}>Edit my details</button>
          </>}
        </div>
        <div className="card panel"><h2>My orders</h2>
          {orders === null ? <p className="muted">Loading…</p> : orders.length === 0 ? <p className="muted">No orders yet. <Link to="/shop">Start shopping</Link></p> :
            <div className="tablewrap"><table className="t" style={{ minWidth: 480 }}><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>
              {orders.map(o => <tr key={o.id}><td><b>{o.order_no}</b></td><td className="muted">{fmtDate(o.created_at)}</td><td className="num">{R(o.total)}</td><td><span className="pill" style={{ background: STATUS[o.status][1], color: STATUS[o.status][2] }}>{STATUS[o.status][0]}</span></td></tr>)}
            </tbody></table></div>}
          {orders && orders.some(o => o.status === 'awaiting_payment') && <p className="muted" style={{ fontSize: 14 }}>Orders awaiting EFT start printing as soon as your payment reflects. Use the order number as your reference.</p>}
        </div>
      </div></section>
    </>
  )
}
