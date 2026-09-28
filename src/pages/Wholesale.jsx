import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useShop } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icons'
import { PageHead, Loading } from '../components/ShopParts'
import { BankBox } from './Buy'
import { DocsModal } from '../admin/Docs'
import { R, TYPES, typeName, fullName, fmtDate, STATUS } from '../lib/format'

const BIZ_TYPES = ['Gift shop', 'Curio shop', 'Guest house or lodge', 'Farm stall', 'Coffee shop', 'Corporate gifts', 'Other']
const RSTAT = { new: ['Waiting for a quote', 'var(--warn-bg)', 'var(--warn-fg)'], quoted: ['Quote sent', 'var(--info-bg)', 'var(--info-fg)'], accepted: ['Accepted', 'var(--surface)', 'var(--primary-dk)'], declined: ['Declined', 'var(--grey-bg)', 'var(--muted2)'] }
const Pill = ({ m, s }) => <span className="pill" style={{ background: m[s][1], color: m[s][2] }}>{m[s][0]}</span>
const selS = { minHeight: 46, padding: '0 16px', border: '1px solid var(--line2)', background: 'var(--card)' }
const EMPTY = { business_name: '', contact_name: '', phone: '', business_type: '', vat_number: '', street: '', suburb: '', city: '', postal_code: '', message: '' }

function DetailsFields({ f, setF, bad }) {
  const inp = (k, l, props = {}) => <label key={k} className="field" htmlFor={'wa-' + k}>{l}<input id={'wa-' + k} value={f[k] || ''} style={bad === k ? { borderColor: 'var(--sale)' } : undefined} onChange={e => setF({ ...f, [k]: e.target.value })} {...props} /></label>
  return (
    <>
      <div className="grid2">{inp('business_name', 'Business name')}{inp('contact_name', 'Contact person')}{inp('phone', 'Phone', { type: 'tel' })}
        <label className="field" htmlFor="wa-type">Type of business<select id="wa-type" value={f.business_type} onChange={e => setF({ ...f, business_type: e.target.value })}><option value="">Choose</option>{BIZ_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      <b style={{ fontSize: 14 }}>Delivery address</b>
      <div className="grid2">{inp('street', 'Street address')}{inp('suburb', 'Suburb')}{inp('city', 'Town or city')}{inp('postal_code', 'Postal code')}</div>
      {inp('vat_number', 'VAT number (if registered)')}
      <label className="field" htmlFor="wa-msg">What would you like to stock?<textarea id="wa-msg" rows={3} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} placeholder="e.g. The Big Five range for tourists, and coasters with our logo" /></label>
    </>
  )
}
const REQ = { business_name: 'business name', contact_name: 'contact person', phone: 'phone', street: 'street address', city: 'town or city' }
const missing = f => Object.keys(REQ).find(k => !String(f[k] || '').trim())

function Steps() {
  return <div className="steps3">{[['1', 'Apply for an account', 'Tell us about your business. We check every application and let you know once you are approved.'], ['2', 'Order at trade prices', 'Sign in to see trade prices on every design and order any quantity you need.'], ['3', 'Pay by EFT, we deliver', 'You get a pro forma invoice straight away. We print and pack as soon as your payment reflects.']].map(s => <div className="card" key={s[0]}><span className="n">{s[0]}</span><h3 style={{ fontSize: 26 }}>{s[1]}</h3><p className="muted">{s[2]}</p></div>)}</div>
}

function SignedOut() {
  const { toast } = useShop()
  const [em, setEm] = useState(''); const [pw, setPw] = useState(''); const [msg, setMsg] = useState('')
  const [f, setF] = useState(EMPTY); const [ae, setAe] = useState(''); const [ap, setAp] = useState(''); const [bad, setBad] = useState(''); const [amsg, setAmsg] = useState(''); const [busy, setBusy] = useState(false)
  const signIn = async e => {
    e.preventDefault(); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: em.trim(), password: pw })
    if (error) setMsg('That email and password do not match.')
  }
  const reset = async () => {
    if (!em.trim()) { setMsg('Type your email address first, then press Forgot your password.'); return }
    await supabase.auth.resetPasswordForEmail(em.trim(), { redirectTo: window.location.origin + '/wholesale' })
    setMsg('If that email has an account, we sent a link to reset your password.')
  }
  const apply = async e => {
    e.preventDefault(); setAmsg('')
    const m = missing(f); if (m) { setBad(m); toast('Please fill in your ' + REQ[m]); return }
    if (!/^\S+@\S+\.\S+$/.test(ae.trim())) { setBad('email'); toast('Please check your email address'); return }
    if (ap.length < 8) { setAmsg('Please choose a password of at least 8 characters.'); return }
    setBusy(true)
    const app = { ...f }
    const { data, error } = await supabase.auth.signUp({ email: ae.trim(), password: ap, options: { data: { ws_application: app }, emailRedirectTo: window.location.origin + '/wholesale' } })
    setBusy(false)
    if (error) { setAmsg(error.message); return }
    if (!data.session) setAmsg('Almost done. We sent you an email. Click the link in it to confirm your email address, and your application is sent.')
  }
  return (
    <>
      <PageHead crumbs="Wholesale" eyebrow="For shops, guest houses and farm stalls" title="Stock DF Elements" blurb="Coasters and phone stands at trade prices, printed and couriered to your door. Free courier on orders of R1 500 or more. We can also print your own logo or designs." />
      <section><div className="wrap stack" style={{ gap: 40 }}>
        <Steps />
        <div className="grid2" style={{ gap: 24, alignItems: 'start' }}>
          <form className="card panel" onSubmit={signIn}>
            <span className="eyebrow">Existing clients</span><h2 style={{ fontSize: 34 }}>Wholesale sign in</h2>
            <label className="field" htmlFor="wl-e">Email<input id="wl-e" type="email" autoComplete="email" value={em} onChange={e => setEm(e.target.value)} required /></label>
            <label className="field" htmlFor="wl-p">Password<input id="wl-p" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required /></label>
            {msg && <div className="note">{msg}</div>}
            <button className="btn" type="submit">Sign in to order</button>
            <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={reset}>Forgot your password?</button>
          </form>
          <form className="card panel" onSubmit={apply} style={{ background: 'var(--surface)' }}>
            <span className="eyebrow">New to DF Elements?</span><h2 style={{ fontSize: 34 }}>Apply for a wholesale account</h2>
            <DetailsFields f={f} setF={setF} bad={bad} />
            <div className="grid2">
              <label className="field" htmlFor="wa-email">Email<input id="wa-email" type="email" autoComplete="email" value={ae} onChange={e => setAe(e.target.value)} style={bad === 'email' ? { borderColor: 'var(--sale)' } : undefined} /></label>
              <label className="field" htmlFor="wa-pw">Choose a password<input id="wa-pw" type="password" autoComplete="new-password" value={ap} onChange={e => setAp(e.target.value)} /></label>
            </div>
            {amsg && <div className="note">{amsg}</div>}
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send my application'}</button>
          </form>
        </div>
      </div></section>
    </>
  )
}

function ApplyWhileSignedIn({ session, onDone }) {
  const { toast } = useShop()
  const [f, setF] = useState(EMPTY); const [bad, setBad] = useState('')
  const send = async e => {
    e.preventDefault()
    const m = missing(f); if (m) { setBad(m); toast('Please fill in your ' + REQ[m]); return }
    const { error } = await supabase.from('wholesale_clients').insert({ id: session.user.id, email: session.user.email, ...f })
    if (error) { toast(error.message); return }
    onDone()
  }
  return (
    <>
      <PageHead crumbs="Wholesale" eyebrow="Wholesale" title="Apply for a wholesale account" blurb={'You are signed in as ' + session.user.email + '. Add your business details to apply.'} />
      <section><div className="wrap"><form className="card panel" onSubmit={send} style={{ maxWidth: 760 }}><DetailsFields f={f} setF={setF} bad={bad} /><button className="btn" type="submit" style={{ alignSelf: 'flex-start' }}>Send my application</button></form></div></section>
    </>
  )
}

function Waiting({ c }) {
  const text = { pending: ['Thank you, your application is in', 'We check every application and let you know as soon as your account is approved. Once it is, sign in here to see trade prices and order.'], declined: ['We cannot open an account right now', 'Thank you for your interest. Please contact us if you have any questions.'], suspended: ['Your wholesale account is paused', 'Please contact us to reactivate it.'] }[c.status]
  return (
    <section><div className="wrap stack" style={{ maxWidth: 720, alignItems: 'center', textAlign: 'center' }}>
      <span className="circle" style={{ width: 72, height: 72 }}><Icon.check /></span>
      <span className="eyebrow">{c.business_name}</span><h1 style={{ fontSize: 'clamp(36px,5vw,56px)' }}>{text[0]}</h1><p className="muted" style={{ fontSize: 18 }}>{text[1]}</p>
      <div className="row" style={{ justifyContent: 'center' }}><Link className="btn" to="/shop">Browse the range</Link><button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    </div></section>
  )
}

function OrderTab({ c, prices, reload, goOrders }) {
  const { products, themes, delivery, settings, toast, themeName } = useShop()
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [theme, setTheme] = useState('')
  const [qty, setQty] = useState(() => { try { return JSON.parse(localStorage.getItem('dfe-ws-cart')) || {} } catch { return {} } })
  const [del, setDel] = useState(null); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(null)
  useEffect(() => { try { localStorage.setItem('dfe-ws-cart', JSON.stringify(qty)) } catch { /* ignore */ } }, [qty])
  useEffect(() => { if (!del && delivery[0]) setDel(delivery[0].id) }, [delivery, del])
  const items = useMemo(() => products.filter(p => !p.is_custom), [products])
  const s = q.toLowerCase().trim()
  const list = items.filter(p => (!type || p.type === type) && (!theme || String(p.theme_id) === theme) && (!s || (p.name + ' ' + p.variant + ' ' + themeName(p.theme_id)).toLowerCase().includes(s)))
  const lines = items.filter(p => qty[p.id] > 0 && prices[p.id]).map(p => ({ p, n: qty[p.id], unit: prices[p.id] }))
  const sub = lines.reduce((a, l) => a + l.unit * l.n, 0)
  const units = lines.reduce((a, l) => a + l.n, 0)
  const free = Number(settings ? settings.wholesale_free_delivery_from : 1500)
  const d = delivery.find(x => x.id === del)
  const fee = !lines.length || !d ? 0 : sub >= free ? 0 : Number(d.rate)
  const setN = (id, n) => setQty(x => ({ ...x, [id]: Math.max(0, Math.min(5000, n || 0)) }))
  const place = async () => {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.rpc('place_wholesale_order', { p_order: { delivery_option_id: del, notes, items: lines.map(l => ({ product_id: l.p.id, qty: l.n })) } })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setQty({}); setNotes(''); setDone(data); reload(); toast('Order ' + data.order_no + ' placed')
  }
  if (done) return (
    <div className="card panel" style={{ maxWidth: 720, alignItems: 'center', textAlign: 'center', margin: '0 auto' }}>
      <span className="circle" style={{ width: 64, height: 64 }}><Icon.check /></span>
      <h2>Order {done.order_no} placed</h2>
      <p className="muted" style={{ fontSize: 17 }}>Please pay <b>{R(done.total)}</b> by EFT and use <b>{done.order_no}</b> as your reference. We start as soon as your payment reflects.</p>
      <div style={{ width: '100%', maxWidth: 480 }}><BankBox bank={done.bank} /></div>
      <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => goOrders(done.order_id)}>View pro forma invoice</button><button className="btn ghost" onClick={() => setDone(null)}>Place another order</button></div>
    </div>
  )
  return (
    <div className="co wsgrid">
      <div className="stack" style={{ gap: 16 }}>
        <div className="row">
          <input type="search" aria-label="Search designs" placeholder="Search designs" value={q} onChange={e => setQ(e.target.value)} style={{ ...selS, flex: '1 1 220px', padding: '0 20px' }} />
          <select aria-label="Product" value={type} onChange={e => setType(e.target.value)} style={selS}><option value="">All products</option>{TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
          <select aria-label="Theme" value={theme} onChange={e => setTheme(e.target.value)} style={selS}><option value="">All themes</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t wstable">
          <thead><tr><th className="hide-sm"></th><th>Design</th><th className="hide-sm">Retail</th><th>Your price</th><th>Quantity</th><th className="hide-sm" style={{ textAlign: 'right' }}>Line total</th></tr></thead>
          <tbody>{list.map(p => {
            const n = qty[p.id] || 0; const tp = prices[p.id]
            return (
              <tr key={p.id} style={n ? { background: 'var(--soft)' } : undefined}>
                <td className="hide-sm"><div className="thumb" style={{ width: 52, height: 52 }}>{p.image_url && <img src={p.image_url} alt="" />}</div></td>
                <td className="c-name"><b>{p.name}</b><div className="muted" style={{ fontSize: 13 }}>{[typeName(p.type), p.variant, themeName(p.theme_id)].filter(Boolean).join(' · ')}</div><div className="muted" style={{ fontSize: 12 }}>{p.stock > 0 ? p.stock + ' in stock, extras printed to order' : 'Printed to order'}</div></td>
                <td className="num muted hide-sm">{p.price != null ? R(p.price) : ''}</td>
                <td className="num c-price"><b>{tp ? R(tp) : <span className="muted" style={{ fontWeight: 500 }}>On request</span>}</b></td>
                <td className="c-qty">{tp ? <div className="mini-qty" style={{ margin: 0 }}><button onClick={() => setN(p.id, n - 1)} aria-label={'One less ' + fullName(p)}>&minus;</button><input className="cellin" style={{ width: 64, textAlign: 'center' }} type="number" min="0" step="1" aria-label={'Quantity of ' + fullName(p)} value={n || ''} placeholder="0" onChange={e => setN(p.id, parseInt(e.target.value, 10))} /><button onClick={() => setN(p.id, n + 1)} aria-label={'One more ' + fullName(p)}>+</button></div> : null}</td>
                <td className="num hide-sm" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{n && tp ? <b>{R(n * tp)}</b> : ''}</td>
              </tr>)
          })}</tbody></table></div></div>
      </div>
      <aside className="summary"><span className="eyebrow">Your order</span><h2 style={{ fontSize: 30 }}>{units} units</h2>
        {lines.length ? lines.map(l => <div key={l.p.id} className="sumrow" style={{ fontSize: 14 }}><span>{fullName(l.p)} <span className="muted">x {l.n}</span></span><span className="num">{R(l.unit * l.n)}</span></div>) : <p className="muted" style={{ fontSize: 14 }}>Type a quantity next to any design to start your order.</p>}
        <b style={{ fontSize: 14, marginTop: 6 }}>Delivery</b>
        {delivery.map(o => <button key={o.id} type="button" className="opt" aria-pressed={del === o.id} onClick={() => setDel(o.id)} style={{ minHeight: 54, padding: '8px 12px' }}><span className="radio" /><span className="t"><b style={{ fontSize: 14 }}>{o.name}</b></span><b className="num" style={{ fontSize: 14 }}>{sub >= free ? 'Free' : R(o.rate)}</b></button>)}
        <span className="muted" style={{ fontSize: 13 }}>{sub >= free ? 'Free courier on this order.' : 'Free courier on orders of ' + R(free) + ' or more. Add ' + R(free - sub) + ' more to qualify.'}</span>
        <div className="stack num" style={{ gap: 8, fontSize: 15, borderTop: '1px solid var(--line2)', paddingTop: 14 }}>
          <div className="sumrow"><span>Subtotal</span><span>{R(sub)}</span></div><div className="sumrow"><span>Courier</span><span>{fee ? R(fee) : 'Free'}</span></div>
          <div className="sumrow" style={{ alignItems: 'baseline' }}><b>Total</b><span className="total">{R(sub + fee)}</span></div>
        </div>
        <label className="field" htmlFor="wo-note">Note for this order (optional)<textarea id="wo-note" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Please deliver before 15 November" /></label>
        {err && <div className="note err">{err}</div>}
        <button className="btn block" disabled={!lines.length || busy} onClick={place}>{busy ? 'Placing your order…' : 'Place order and get pro forma'}</button>
        <p className="muted" style={{ fontSize: 13 }}>Delivering to {[c.street, c.city].filter(Boolean).join(', ')}. You pay by EFT using the pro forma.</p>
      </aside>
    </div>
  )
}

function OrdersTab({ orders, setDoc, settings, reorder }) {
  return (
    <>
      <div className="card" style={{ padding: '6px 20px' }}><div className="tablewrap"><table className="t" style={{ minWidth: 640 }}>
        <thead><tr><th>Order</th><th>Date</th><th>Units</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>{orders.length ? orders.map(o => <tr key={o.id}><td><b>{o.order_no}</b></td><td className="muted">{fmtDate(o.created_at)}</td><td className="num">{o.order_items.reduce((a, i) => a + i.qty, 0)}</td><td className="num"><b>{R(o.total)}</b></td><td><Pill m={STATUS} s={o.status} /></td>
          <td><div className="row" style={{ gap: 12 }}>{o.status !== 'cancelled' && <button className="linkbtn" onClick={() => setDoc({ type: 'invoice', ids: [o.id] })}>{o.status === 'awaiting_payment' ? 'Pro forma' : 'Invoice'}</button>}<button className="linkbtn" onClick={() => reorder(o)}>Order again</button></div></td></tr>)
          : <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>No orders yet.</td></tr>}</tbody></table></div></div>
      {orders.some(o => o.status === 'awaiting_payment') && <><div className="note" style={{ background: 'var(--warn-bg)', color: 'var(--warn-fg)' }}>You have an order waiting for payment. Pay by EFT with the order number as your reference.</div><div style={{ maxWidth: 480 }}><BankBox bank={settings} /></div></>}
    </>
  )
}

function BrandTab({ session, requests, reload }) {
  const { toast } = useShop()
  const [b, setB] = useState({ product_type: 'coaster', quantity: 50, notes: '' }); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false)
  const send = async e => {
    e.preventDefault()
    if (!b.notes.trim()) { toast('Tell us a little about what you would like'); return }
    setBusy(true)
    let logo_path = null
    if (file) {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      logo_path = session.user.id + '/' + crypto.randomUUID() + '.' + ext
      const { error } = await supabase.storage.from('wholesale-logos').upload(logo_path, file, { contentType: file.type })
      if (error) { setBusy(false); toast('Your logo could not upload: ' + error.message); return }
    }
    const { error } = await supabase.from('branding_requests').insert({ client_id: session.user.id, product_type: b.product_type, quantity: Math.max(1, parseInt(b.quantity, 10) || 1), notes: b.notes.trim(), logo_path })
    setBusy(false)
    if (error) { toast(error.message); return }
    setB({ product_type: 'coaster', quantity: 50, notes: '' }); setFile(null); reload(); toast('Request sent. We will send you a proof and a quote')
  }
  return (
    <div className="two wsgrid">
      <form className="card panel" onSubmit={send}>
        <span className="eyebrow">Your logo, your designs</span><h2>Request custom branded stock</h2>
        <p className="muted">Guest house coasters, wine farm phone stands, corporate gifts. Tell us what you need and we send you a design proof and a quote.</p>
        <div className="grid2">
          <label className="field" htmlFor="wb-type">Product<select id="wb-type" value={b.product_type} onChange={e => setB({ ...b, product_type: e.target.value })}>{TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          <label className="field" htmlFor="wb-qty">Quantity<input id="wb-qty" type="number" min="1" value={b.quantity} onChange={e => setB({ ...b, quantity: e.target.value })} /></label>
        </div>
        <label className="field" htmlFor="wb-notes">Describe what you would like<textarea id="wb-notes" rows={4} value={b.notes} onChange={e => setB({ ...b, notes: e.target.value })} placeholder="e.g. Our logo in the middle with the farm name underneath, on a cream background" /></label>
        <label className="custombox" htmlFor="wb-logo" style={{ cursor: 'pointer' }}><span className="up"><span className="circle"><Icon.camera /></span><span>{file ? file.name + ' added. Tap to change it' : 'Upload your logo or artwork'}<br /><small className="muted" style={{ fontWeight: 500 }}>JPG, PNG, SVG or PDF up to 10 MB</small></span></span></label>
        <input id="wb-logo" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf" hidden onChange={e => setFile(e.target.files[0] || null)} />
        <button className="btn" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Sending…' : 'Send request'}</button>
      </form>
      <div className="card panel"><h2 style={{ fontSize: 26 }}>Your requests</h2>
        {requests.length ? requests.map(r => <div className="line" key={r.id}><span className="circle" style={{ width: 44, height: 44 }}><Icon.brush /></span><div className="info"><b style={{ fontSize: 14 }}>{r.quantity} x {typeName(r.product_type)}</b><span className="muted" style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</span>{r.quote_notes && <div style={{ fontSize: 13, marginTop: 4 }}>{r.quote_notes}</div>}</div><Pill m={RSTAT} s={r.status} /></div>) : <p className="muted">No requests yet.</p>}
      </div>
    </div>
  )
}

function AccountTab({ c, settings }) {
  const rows = [['Business', c.business_name], ['Type', c.business_type], ['Contact', c.contact_name], ['Email', c.email], ['Phone', c.phone], ['Delivery address', [c.street, c.suburb, c.city, c.postal_code].filter(Boolean).join(', ')], ['VAT number', c.vat_number], ['Client since', fmtDate(c.approved_at || c.created_at)]]
  return (
    <div className="grid2" style={{ gap: 24, alignItems: 'start' }}>
      <div className="card panel"><h2 style={{ fontSize: 28 }}>Business details</h2>
        {rows.filter(r => r[1]).map(r => <div key={r[0]} className="sumrow" style={{ fontSize: 15, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}><span className="muted">{r[0]}</span><b style={{ textAlign: 'right' }}>{r[1]}</b></div>)}
        <span className="muted" style={{ fontSize: 13 }}>Need to change something? Contact us and we update it for you.</span></div>
      <div className="card panel"><h2 style={{ fontSize: 28 }}>Paying by EFT</h2><p className="muted">Use your order number as the payment reference. We start as soon as your payment reflects.</p><BankBox bank={settings} /></div>
    </div>
  )
}

export function Wholesale() {
  const { session, settings, toast } = useShop()
  const [c, setC] = useState(undefined)
  const [prices, setPrices] = useState({}); const [orders, setOrders] = useState([]); const [requests, setRequests] = useState([])
  const [tab, setTab] = useState('order'); const [doc, setDoc] = useState(null)

  const load = useCallback(async () => {
    if (!session) { setC(null); return }
    setC(x => (x && x.id === session.user.id ? x : null))
    const { data } = await supabase.from('wholesale_clients').select('*').eq('id', session.user.id).maybeSingle()
    let client = data
    const app = session.user.user_metadata && session.user.user_metadata.ws_application
    if (!client && app) { // application sent before the email was confirmed
      const { data: ins } = await supabase.from('wholesale_clients').insert({ id: session.user.id, email: session.user.email, ...app }).select().maybeSingle()
      client = ins
    }
    setC(client || false)
    if (client && client.status === 'approved') {
      const [{ data: pr }, { data: os }, { data: rq }] = await Promise.all([
        supabase.from('wholesale_prices').select('*'),
        supabase.from('orders').select('id, order_no, created_at, total, status, order_items(product_id, qty)').eq('wholesale_client_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('branding_requests').select('*').eq('client_id', session.user.id).order('created_at', { ascending: false })
      ])
      const m = {}; (pr || []).forEach(x => { m[x.product_id] = Number(x.price) }); setPrices(m)
      setOrders(os || []); setRequests(rq || [])
    }
  }, [session])
  useEffect(() => { load() }, [load])

  if (!session) return <SignedOut />
  if (c == null) return <Loading />
  if (c === false) return <ApplyWhileSignedIn session={session} onDone={load} />
  if (c.status !== 'approved') return <Waiting c={c} />

  const reorder = o => {
    const q = {}; o.order_items.forEach(i => { if (i.product_id) q[i.product_id] = (q[i.product_id] || 0) + i.qty })
    try { localStorage.setItem('dfe-ws-cart', JSON.stringify(q)) } catch { /* ignore */ }
    setTab('reload'); setTimeout(() => setTab('order'), 0); window.scrollTo(0, 0); toast('Quantities copied from ' + o.order_no + '. Check them and place the order')
  }
  const tabs = [['order', 'Order stock'], ['orders', 'My orders (' + orders.length + ')'], ['brand', 'Custom branding'], ['acct', 'Account']]
  return (
    <>
      <div className="phead" style={{ paddingBlock: 40, background: 'var(--primary-dk)', color: '#fff' }}><div className="wrap ahead">
        <div className="stack" style={{ gap: 6 }}><span className="eyebrow" style={{ color: '#E0A526' }}>Wholesale portal</span><h1 style={{ color: '#fff' }}>{c.business_name}</h1><span style={{ color: '#E6D3C0' }}>{[c.contact_name, c.city].filter(Boolean).join(' · ')}</span></div>
        <button className="btn light sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div></div>
      <section style={{ paddingTop: 28 }}><div className="wrap stack" style={{ gap: 24 }}>
        <div className="chips">{tabs.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'order' && <OrderTab c={c} prices={prices} reload={load} goOrders={id => { setTab('orders'); setDoc({ type: 'invoice', ids: [id] }) }} />}
        {tab === 'orders' && <OrdersTab orders={orders} setDoc={setDoc} settings={settings} reorder={reorder} />}
        {tab === 'brand' && <BrandTab session={session} requests={requests} reload={load} />}
        {tab === 'acct' && <AccountTab c={c} settings={settings} />}
      </div></section>
      {doc && <DocsModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  )
}
