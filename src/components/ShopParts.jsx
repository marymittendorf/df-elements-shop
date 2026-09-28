import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useShop } from '../lib/store'
import { Icon, Logo } from './Icons'
import { R, hasPrice, specialOn, nowPrice, fullName, typeName, TYPES, inStock } from '../lib/format'

const NAV = [
  ['/shop', 'Shop all'], ['/shop?type=coaster', 'Coasters'], ['/shop?type=stand', 'Phone stands'],
  ['/custom', 'Make it yours'], ['/specials', 'Specials'], ['/gift-sets', 'Gift sets'], ['/wholesale', 'Wholesale'], ['/help', 'Help']
]

export function Header() {
  const { count, setDrawer } = useShop()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname, loc.search])
  const cur = to => (loc.pathname + loc.search === to) || (to === '/shop' && loc.pathname === '/shop' && !loc.search)
  const links = NAV.map(([to, l]) => <Link key={to} to={to} aria-current={cur(to) ? 'page' : undefined}>{l}</Link>)
  return (
    <>
      <div className="topbar">Designed and UV printed in South Africa · Nationwide courier delivery</div>
      <header className="hdr">
        <div className="wrap">
          <button className="iconbtn menubtn" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}><Icon.menu /></button>
          <Link className="logo" to="/" aria-label="DF Elements home"><Logo /></Link>
          <nav className="nav" aria-label="Main">{links}</nav>
          <div className="hdr-actions">
            <Link className="iconbtn" to="/shop?focus=search" aria-label="Search products"><Icon.search /></Link>
            <Link className="iconbtn" to="/account" aria-label="My account"><Icon.user /></Link>
            <button className="cartbtn" onClick={() => setDrawer(true)} aria-label={'Cart, ' + count + ' items'}><Icon.bag /><span className="lbl">Cart</span> <span className="num">({count})</span></button>
          </div>
        </div>
        <nav className={'mobnav' + (open ? ' open' : '')} aria-label="Mobile">{links}<Link to="/story">Our story</Link><Link to="/account">My account</Link></nav>
      </header>
    </>
  )
}

export function Footer() {
  const { themes } = useShop()
  return (
    <footer className="site"><div className="wrap">
      <div className="cols">
        <div><div className="logo" style={{ color: '#fff', cursor: 'default' }}><Logo dark /></div><p style={{ marginTop: 14, maxWidth: 300, fontSize: 14 }}>Coasters, phone stands and decor boards, designed in house and UV printed on MDF in South Africa.</p></div>
        <div><h4>Shop</h4>{TYPES.map(t => <Link key={t.key} to={'/shop?type=' + t.key}>{t.label}</Link>)}<Link to="/custom">Make it yours</Link><Link to="/gift-sets">Gift sets</Link></div>
        <div><h4>Themes</h4>{themes.map(t => <Link key={t.id} to={'/shop?theme=' + t.id}>{t.name}</Link>)}</div>
        <div><h4>Help</h4><Link to="/help">Questions and answers</Link><Link to="/account">My account</Link><Link to="/wholesale">Wholesale login</Link><Link to="/story">Delivery and returns</Link><Link to="/story">Terms and conditions</Link><Link to="/story">Privacy policy (POPIA)</Link></div>
      </div>
      <div className="base"><span>© {new Date().getFullYear()} DF Elements. All rights reserved.</span><span>Pay safely by EFT · <Link to="/admin" style={{ color: 'inherit' }}>Staff login</Link></span></div>
    </div></footer>
  )
}

export function Badge({ p }) {
  if (specialOn(p) && hasPrice(p)) return <span className="pill badge" style={{ background: 'var(--sale)', color: '#fff' }}>{Math.round((1 - p.special_price / p.price) * 100)}% off</span>
  if (p.is_custom) return <span className="pill badge" style={{ background: 'var(--olive)', color: '#fff', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>Made to order</span>
  if (p.is_new) return <span className="pill badge" style={{ background: 'var(--primary)', color: '#fff', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>New</span>
  return null
}

export function Price({ p }) {
  if (!hasPrice(p)) return <span className="price"><span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>Price coming soon</span></span>
  if (specialOn(p)) return <span className="price"><span className="now sale num">{R(p.special_price)}</span><span className="was num">{R(p.price)}</span></span>
  return <span className="price"><span className="now num">{p.is_custom ? 'From ' : ''}{R(p.price)}</span></span>
}

export function ProductCard({ p }) {
  const { addToCart, toast, themeName } = useShop()
  const nav = useNavigate()
  const canAdd = hasPrice(p) && inStock(p) && !p.is_custom
  return (
    <article className="card pcard" onClick={() => nav('/product/' + p.id)}>
      <div className="pimg">{p.image_url ? <img src={p.image_url} alt={fullName(p)} loading="lazy" /> : <div className="noimg"><b>{p.name}</b><span>Photo coming soon</span></div>}<Badge p={p} /></div>
      <div className="pbody">
        <span className="pcat">{[typeName(p.type), themeName(p.theme_id)].filter(Boolean).join(' · ')}</span>
        <h3><Link to={'/product/' + p.id} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{p.name}</Link></h3>
        {p.variant && <span className="muted" style={{ fontSize: 14, marginTop: -2 }}>{p.variant}</span>}
        <div className="addrow">
          <Price p={p} />
          {canAdd && <button className="plus" aria-label={'Add ' + fullName(p) + ' to cart'} onClick={e => { e.stopPropagation(); addToCart('p', p.id, 1); toast(fullName(p) + ' added to your cart') }}><Icon.plus /></button>}
          {hasPrice(p) && !inStock(p) && <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Sold out</span>}
        </div>
      </div>
    </article>
  )
}

export function setFull(set, P) {
  const ps = set.gift_set_items.map(i => P(i.product_id))
  if (ps.some(p => !p || !hasPrice(p))) return null
  return set.gift_set_items.reduce((s, i) => s + Number(P(i.product_id).price) * i.qty, 0)
}

export function SetHero({ set }) {
  const { P, addToCart, toast } = useShop()
  if (!set) return null
  const full = setFull(set, P)
  return (
    <>
      <div className="combo-imgs">{set.gift_set_items.slice(0, 5).map(i => { const p = P(i.product_id); return p ? <div key={i.product_id} className="t" style={{ width: 120, height: 120 }}><img src={p.image_url} alt={fullName(p)} /></div> : null })}</div>
      <div className="stack" style={{ gap: 10, flex: '1 1 300px' }}>
        <span className="pill" style={{ background: 'var(--sale)', color: '#fff', alignSelf: 'flex-start' }}>Gift set{full && full > set.price ? ' · save ' + R(full - set.price) : ''}</span>
        <h2 style={{ fontSize: 'clamp(32px,3.6vw,42px)' }}>{set.name}</h2>
        <p className="muted">{set.description}</p>
        <div className="price"><span className="now num" style={{ fontFamily: 'var(--display)', fontSize: 38 }}>{R(set.price)}</span>{full && full > set.price ? <span className="was num">{R(full)}</span> : null}</div>
        <div className="row"><button className="btn" onClick={() => { addToCart('s', set.id, 1); toast(set.name + ' added to your cart') }}>Add set to cart</button><Link className="btn ghost" to="/gift-sets">See all gift sets</Link></div>
      </div>
    </>
  )
}

export function CartDrawer() {
  const { drawer, setDrawer, lines, setQty, subtotal } = useShop()
  const nav = useNavigate()
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k)
  }, [setDrawer])
  if (!drawer) return null
  return (
    <>
      <div className="scrim" onClick={() => setDrawer(false)} />
      <aside className="drawer" role="dialog" aria-label="Your cart">
        <header><h2 style={{ fontSize: 30 }}>Your cart</h2><button className="iconbtn" onClick={() => setDrawer(false)} aria-label="Close cart"><Icon.x /></button></header>
        <div className="items">
          {lines.length ? lines.map(l => (
            <div className="line" key={l.k}>
              <div className="thumb">{l.img && <img src={l.img} alt="" />}</div>
              <div className="info"><b>{l.name}</b><span className="muted" style={{ fontSize: 13 }}>{l.meta}{l.photo ? ' · photo added' : ''}</span>
                <div className="mini-qty"><button onClick={() => setQty(l.k, l.qty - 1)} aria-label="Less">&minus;</button><span className="num" style={{ minWidth: 24, textAlign: 'center' }}>{l.qty}</span><button onClick={() => setQty(l.k, l.qty + 1)} aria-label="More">+</button></div>
              </div>
              <b className="num">{R(l.unit * l.qty)}</b>
            </div>
          )) : <p className="muted" style={{ padding: '24px 0' }}>Your cart is empty.</p>}
        </div>
        <footer>
          <div className="sumrow num"><b>Subtotal</b><b>{R(subtotal)}</b></div>
          <span className="muted" style={{ fontSize: 13 }}>Delivery is added at checkout.</span>
          <button className="btn block" disabled={!lines.length} onClick={() => { setDrawer(false); nav('/checkout') }}>Checkout</button>
          <button className="btn ghost block" onClick={() => setDrawer(false)}>Continue shopping</button>
        </footer>
      </aside>
    </>
  )
}

export function Toast() {
  const { toastMsg } = useShop()
  return toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null
}

export function PageHead({ crumbs, eyebrow, title, blurb, center, style }) {
  return (
    <div className="phead" style={{ ...(center ? { textAlign: 'center' } : {}), ...style }}><div className="wrap">
      {crumbs && <div className="crumbs"><Link to="/">Home</Link> / {crumbs}</div>}
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {blurb && <p className="muted" style={{ marginTop: 10, maxWidth: 640, fontSize: 17, marginInline: center ? 'auto' : undefined }}>{blurb}</p>}
    </div></div>
  )
}

export function Loading() { return <section><div className="wrap"><p className="muted">Loading…</p></div></section> }

export { nowPrice }
