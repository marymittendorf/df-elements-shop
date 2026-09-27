import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Dashboard } from './Dashboard'
import { Orders, OrderDetail } from './Orders'
import { Products, ProductEdit } from './Products'
import { Promos } from './Promos'
import { Settings } from './Settings'
import { DocsModal } from './Docs'

const ACtx = createContext(null)
export const useAdmin = () => useContext(ACtx)

function Login({ onDone }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const go = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { data: email } = await supabase.rpc('get_email_for_username', { p_username: u })
    const { error } = email ? await supabase.auth.signInWithPassword({ email, password: p }) : { error: true }
    setBusy(false)
    if (error) { setErr('Invalid username or password'); return }
    onDone()
  }
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--admin-bg)', padding: 16 }}>
      <form className="card panel" onSubmit={go} style={{ width: 'min(420px,100%)', padding: 32 }}>
        <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 700, fontSize: 34, color: 'var(--primary-dk)' }}>DF Elements</div>
        <span className="eyebrow">Shop admin</span>
        <label className="field" htmlFor="al-u">Username<input id="al-u" autoComplete="username" value={u} onChange={e => setU(e.target.value)} required /></label>
        <label className="field" htmlFor="al-p">Password<input id="al-p" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} required /></label>
        {err && <div className="note" style={{ background: '#F8D7CF', color: '#6B2413' }}>{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/" className="linkbtn" style={{ alignSelf: 'flex-start' }}>Back to the shop</Link>
      </form>
    </div>
  )
}

const NAV = [['/admin', 'Dashboard', true], ['/admin/orders', 'Orders'], ['/admin/products', 'Products'], ['/admin/promos', 'Specials and sets'], ['/admin/settings', 'Settings']]

export default function AdminApp() {
  const [state, setState] = useState('checking') // checking | login | ok
  const [me, setMe] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const [doc, setDoc] = useState(null)
  const [toPrint, setToPrint] = useState(0)
  const tRef = useRef()
  const nav = useNavigate()

  const check = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) { setState('login'); return }
    const { data: ok } = await supabase.rpc('is_staff')
    if (!ok) { setState('login'); return }
    const { data } = await supabase.from('staff_users').select('*').eq('id', s.session.user.id).maybeSingle()
    setMe(data); setState('ok')
  }, [])
  useEffect(() => { check() }, [check])

  const refreshCounts = useCallback(async () => {
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['awaiting_payment', 'paid'])
    setToPrint(count || 0)
  }, [])
  useEffect(() => { if (state === 'ok') refreshCounts() }, [state, refreshCounts])

  const toast = useCallback(m => { setToastMsg(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToastMsg(''), 2600) }, [])

  if (state === 'checking') return <div style={{ padding: 40 }} className="muted">Loading…</div>
  if (state === 'login') return <Login onDone={check} />

  const signOut = async () => { await supabase.auth.signOut(); setState('login'); nav('/admin') }
  return (
    <ACtx.Provider value={{ toast, setDoc, me, refreshCounts }}>
      <div className="admin">
        <nav className="side" aria-label="Admin">
          <div className="brand"><div>DF Elements</div><div className="eyebrow" style={{ color: '#D9B79C' }}>Shop admin</div></div>
          {NAV.map(([to, l, end]) => <NavLink key={to} to={to} end={end}><span className="dot" />{l}{to === '/admin/orders' && toPrint ? <span className="cnt">{toPrint}</span> : null}</NavLink>)}
          <a href="/" target="_blank" rel="noreferrer"><span className="dot" />View live shop</a>
          <div className="foot" style={{ marginTop: 'auto', padding: '16px 12px 0', borderTop: '1px solid #7A4A33', fontSize: 13 }}>Signed in as {me ? me.username : ''}<br /><button className="linkbtn" style={{ color: '#F1E4D3' }} onClick={signOut}>Sign out</button></div>
        </nav>
        <main className="amain" id="main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:no" element={<OrderDetail />} />
            <Route path="products" element={<Products />} />
            <Route path="products/:id" element={<ProductEdit />} />
            <Route path="promos" element={<Promos />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
      {doc && <DocsModal doc={doc} onClose={() => setDoc(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </ACtx.Provider>
  )
}
