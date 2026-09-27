import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useShop } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icons'
import { ProductCard, SetHero, PageHead, Loading, Price, setFull } from '../components/ShopParts'
import { R, TYPES, typeName, hasPrice, specialOn, nowPrice, fullName } from '../lib/format'

export function Home() {
  const { products, themes, sets, loading, error } = useShop()
  if (loading) return <Loading />
  if (error) return <section><div className="wrap"><p className="muted">The shop could not load right now. Please refresh the page.</p></div></section>
  const fav = products.filter(p => !p.is_custom && (p.is_new || specialOn(p))).slice(0, 4)
  return (
    <>
      <div className="wrap hero">
        <div className="stack">
          <span className="eyebrow">Coasters · Phone stands · Decor boards</span>
          <h1>Little pieces of joy, printed on wood</h1>
          <p>Cheeky Afrikaans donkeys, the Big Five, watercolour wildlife and designs for every hobby, UV printed on MDF so the colour stays bright.</p>
          <div className="row"><Link className="btn" to="/shop">Shop the range</Link><Link className="btn ghost" to="/custom">Print your own photo</Link></div>
        </div>
        <div className="hero-img"><img src="/products/hero.webp" alt="Four DF Elements coasters: a watercolour owl, a donkey in sunglasses, a rainbow hummingbird and a happy sheep" /></div>
      </div>
      <section className="alt"><div className="wrap">
        <div className="sec-head"><div className="stack" style={{ gap: 10 }}><span className="eyebrow">Shop by product</span><h2>What are you looking for?</h2></div></div>
        <div className="types">{TYPES.map(t => {
          const n = products.filter(p => p.type === t.key).length
          return (
            <Link key={t.key} className="card type" to={'/shop?type=' + t.key}>
              <div className="ti">{t.img ? <img src={t.img} alt="" /> : <div className="soon"><span>Coming soon</span><span style={{ fontFamily: 'var(--body)', fontSize: 14, fontWeight: 600 }}>Photos on the way</span></div>}</div>
              <div className="tb"><span className="pcat">{n ? n + ' designs' : 'Launching soon'}</span><h3>{t.label}</h3><p className="muted" style={{ fontSize: 15 }}>{t.blurb}</p></div>
            </Link>)
        })}</div>
        <div className="stack" style={{ gap: 14, marginTop: 36 }}><span className="eyebrow">Or shop by theme</span>
          <div className="themechips">{themes.map(t => <Link key={t.id} to={'/shop?theme=' + t.id}>{t.name} <span className="muted num" style={{ fontWeight: 500 }}>{products.filter(p => p.theme_id === t.id).length}</span></Link>)}</div>
        </div>
      </div></section>
      {fav.length > 0 && <section><div className="wrap">
        <div className="sec-head"><div className="stack" style={{ gap: 10 }}><span className="eyebrow">Just landed and on special</span><h2>Most loved right now</h2></div><Link className="btn ghost sm" to="/shop">Shop all</Link></div>
        <div className="pgrid">{fav.map(p => <ProductCard key={p.id} p={p} />)}</div>
      </div></section>}
      {sets[0] && <section className="alt"><div className="wrap"><div className="card combo-hero" style={{ background: 'var(--bg)' }}><SetHero set={sets[0]} /></div></div></section>}
      <section><div className="wrap"><div className="band" style={{ background: 'var(--olive)' }}>
        <div className="stack" style={{ gap: 10, maxWidth: 560 }}><span className="eyebrow" style={{ color: 'var(--surface)' }}>Make it yours</span><h2>Your pet, your people, printed on wood</h2><p>Upload a photo, add a name or message, and we design a one of a kind coaster or phone stand. We send you a proof before we print.</p></div>
        <Link className="btn light" to="/custom">Start a custom order</Link>
      </div></div></section>
      <section style={{ paddingTop: 0 }}><div className="wrap story">
        <div className="ph"><img src="/products/story.webp" alt="Four donkey coasters from the Plaas Humor range" /></div>
        <div className="stack"><span className="eyebrow">Our story</span><h2 style={{ fontSize: 'clamp(36px,4.6vw,56px)' }}>Designed in house, printed with care</h2>
          <p className="muted" style={{ fontSize: 18, maxWidth: 560 }}>Every DF Elements design is created in house and UV printed onto MDF, then packed by hand and couriered to you anywhere in South Africa.</p>
          <div className="stats"><div><strong>{themes.length}</strong><span className="muted" style={{ fontSize: 14 }}>Themes</span></div><div><strong>{products.length}</strong><span className="muted" style={{ fontSize: 14 }}>Designs</span></div><div><strong>Local</strong><span className="muted" style={{ fontSize: 14 }}>Proudly South African</span></div></div>
        </div>
      </div></section>
    </>
  )
}

export function Shop() {
  const { products, themes, loading, themeName } = useShop()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('best')
  const qRef = useRef()
  const type = sp.get('type') || ''
  const theme = sp.get('theme') ? Number(sp.get('theme')) : null
  useEffect(() => { if (sp.get('focus') === 'search' && qRef.current) qRef.current.focus() }, [sp])
  const setParam = (k, v) => { const n = new URLSearchParams(sp); n.delete('focus'); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }
  const list = useMemo(() => {
    const s = q.toLowerCase().trim()
    let l = products.filter(p => (!type || p.type === type) && (!theme || p.theme_id === theme) && (!s || (p.name + ' ' + p.variant + ' ' + themeName(p.theme_id) + ' ' + p.short_description + ' ' + typeName(p.type)).toLowerCase().includes(s)))
    if (sort === 'low') l = [...l].sort((a, b) => (hasPrice(a) ? nowPrice(a) : 1e9) - (hasPrice(b) ? nowPrice(b) : 1e9))
    if (sort === 'high') l = [...l].sort((a, b) => nowPrice(b) - nowPrice(a))
    if (sort === 'new') l = [...l].sort((a, b) => (b.is_new ? 1 : 0) - (a.is_new ? 1 : 0))
    return l
  }, [products, type, theme, q, sort, themeName])
  if (loading) return <Loading />
  const th = themes.find(t => t.id === theme); const ty = TYPES.find(t => t.key === type)
  const title = th ? th.name : ty ? ty.label : 'Shop all'
  return (
    <>
      <PageHead crumbs={title} eyebrow={th ? th.subtitle : ty ? 'Shop by product' : 'The full range'} title={title} blurb={th ? th.description : ty ? ty.blurb : 'Every coaster and phone stand, across all our themes. Search for a word you love, like donkey or golf.'} />
      <section><div className="wrap shoplay">
        <aside className="card filters">
          <label className="field" htmlFor="shop-q" style={{ fontWeight: 600 }}>Search<input ref={qRef} id="shop-q" type="search" placeholder="e.g. donkey, owl, golf" value={q} onChange={e => setQ(e.target.value)} /></label>
          <fieldset><legend className="eyebrow">Product</legend>
            {[{ key: '', label: 'Everything' }, ...TYPES].map(t => <label key={t.key}><input type="radio" name="ftype" checked={type === t.key} onChange={() => setParam('type', t.key)} /><span>{t.label}</span></label>)}
          </fieldset>
          <fieldset><legend className="eyebrow">Theme</legend>
            <label><input type="radio" name="ftheme" checked={!theme} onChange={() => setParam('theme', '')} /><span>All themes</span></label>
            {themes.map(t => <label key={t.id}><input type="radio" name="ftheme" checked={theme === t.id} onChange={() => setParam('theme', String(t.id))} /><span>{t.name}<br /><small className="muted">{t.subtitle}</small></span></label>)}
          </fieldset>
        </aside>
        <div>
          <div className="toolbar"><span className="muted">Showing {list.length} designs</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Sort by <select value={sort} onChange={e => setSort(e.target.value)}><option value="best">Theme</option><option value="new">Newest</option><option value="low">Price, low to high</option><option value="high">Price, high to low</option></select></label>
          </div>
          {list.length ? <div className="pgrid three">{list.map(p => <ProductCard key={p.id} p={p} />)}</div>
            : type === 'board' ? <div className="card" style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start', background: 'var(--surface)', border: 0 }}><h2 style={{ fontSize: 36 }}>A4 decor boards are coming soon</h2><p className="muted" style={{ maxWidth: 560 }}>The first boards are being photographed. Check back soon.</p><Link className="btn" to="/shop">Shop coasters and stands</Link></div>
              : <p className="muted">No designs match. Try another word or clear the filters.</p>}
        </div>
      </div></section>
    </>
  )
}

function CustomBox({ photo, setPhoto, note, setNote, busy }) {
  return (
    <div className="custombox">
      <b style={{ fontSize: 16 }}>Personalise it</b>
      <label className="up" htmlFor="cz-photo">{photo ? <img src={photo.preview} alt="Your photo" /> : <span className="circle"><Icon.camera /></span>}
        <span>{busy ? 'Uploading your photo…' : photo ? 'Photo added. Tap to change it' : 'Upload your photo'}<br /><small className="muted" style={{ fontWeight: 500 }}>A clear, well lit photo works best</small></span></label>
      <input id="cz-photo" type="file" accept="image/*" hidden onChange={e => e.target.files[0] && setPhoto(e.target.files[0])} />
      <label className="field" htmlFor="cz-note">Name or message (optional)<input id="cz-note" maxLength={40} placeholder="e.g. Bella, or Happy 60th Dad" value={note} onChange={e => setNote(e.target.value)} /></label>
      <span className="muted" style={{ fontSize: 13 }}>We email or WhatsApp you a design proof before we print.</span>
    </div>
  )
}

async function shrink(file, max = 1600) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.88))
  } catch { return file }
}

export function Product() {
  const { id } = useParams()
  const { P, products, sets, loading, addToCart, toast, themeName } = useShop()
  const [qty, setQty] = useState(1)
  const [photo, setPhotoState] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setQty(1); setPhotoState(null); setNote('') }, [id])
  if (loading) return <Loading />
  const p = P(Number(id))
  if (!p) return <section><div className="wrap stack"><h1 style={{ fontSize: 44 }}>We could not find that design</h1><Link className="btn" to="/shop" style={{ alignSelf: 'flex-start' }}>Shop the range</Link></div></section>
  const rel = products.filter(x => x.id !== p.id && x.theme_id === p.theme_id && !x.is_custom).slice(0, 4)
  const set = sets.find(s => s.gift_set_items.some(i => i.product_id === p.id))

  const setPhoto = async file => {
    setBusy(true)
    const blob = await shrink(file)
    const path = 'orders/' + crypto.randomUUID() + '.jpg'
    const { error } = await supabase.storage.from('custom-uploads').upload(path, blob, { contentType: 'image/jpeg' })
    setBusy(false)
    if (error) { toast('Your photo could not upload. Please try a different photo.'); return }
    setPhotoState({ path, preview: URL.createObjectURL(blob) })
  }
  const add = () => {
    if (p.is_custom) {
      if (busy) return
      addToCart('p', p.id, qty, { note: note.trim(), photo: photo ? photo.path : null })
      setPhotoState(null); setNote('')
      toast('Custom order added. We send a proof before printing')
    } else { addToCart('p', p.id, qty); toast(fullName(p) + ' added to your cart') }
  }
  return (
    <>
      <section style={{ paddingTop: 32 }}><div className="wrap">
        <div className="crumbs"><Link to="/">Home</Link> / <Link to={'/shop?type=' + p.type}>{typeName(p.type)}</Link> / {p.name}</div>
        <div className="pdp" style={{ marginTop: 20 }}>
          <div className="main" style={{ background: 'var(--t1)' }}>{p.image_url && <img src={p.image_url} alt={fullName(p)} />}</div>
          <div className="stack">
            <div className="stack" style={{ gap: 10 }}>
              <span className="eyebrow">{themeName(p.theme_id)}{p.size ? ' · ' + p.size : ''}</span>
              <h1>{p.name}</h1>
              {p.variant && <span className="pill" style={{ background: 'rgba(34,30,27,.1)', color: 'var(--primary-dk)', fontSize: 14, padding: '7px 14px', alignSelf: 'flex-start' }}>{p.variant}</span>}
              <div className="row">{hasPrice(p) ? <><span className="bigprice num">{R(nowPrice(p))}</span>{specialOn(p) && <><span className="was num muted" style={{ textDecoration: 'line-through' }}>{R(p.price)}</span><span className="pill" style={{ background: 'var(--sale)', color: '#fff' }}>On special</span></>}</> : <span className="bigprice" style={{ fontSize: 28 }}>Price coming soon</span>}</div>
            </div>
            <p className="muted" style={{ fontSize: 17 }}>{p.short_description}</p>
            {p.is_custom && <CustomBox photo={photo} setPhoto={setPhoto} note={note} setNote={setNote} busy={busy} />}
            {hasPrice(p) && (p.is_custom || p.stock > 0
              ? <div className="row"><div className="qty"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">&minus;</button><span className="num">{qty}</span><button onClick={() => setQty(p.is_custom ? qty + 1 : Math.min(p.stock, qty + 1))} aria-label="Increase quantity">+</button></div><button className="btn" style={{ flex: '1 1 200px' }} onClick={add} disabled={busy}>{p.is_custom ? 'Add custom order to cart' : 'Add to cart'}</button></div>
              : <div className="note" style={{ background: 'var(--warn-bg)' }}>Sold out. Check back soon.</div>)}
            {set && <div className="note"><span className="circle" style={{ width: 40, height: 40 }}><Icon.plus /></span><span>Part of the <b>{set.name}</b> for {R(set.price)}. <button className="linkbtn" onClick={() => { addToCart('s', set.id, 1); toast(set.name + ' added to your cart') }}>Add the set</button></span></div>}
            {hasPrice(p) && <div className="note"><span className="circle" style={{ width: 40, height: 40 }}><Icon.truck /></span><span>{!p.is_custom && p.stock > 0 && p.stock < 6 ? 'Only ' + p.stock + ' left. ' : ''}Delivery options and costs are shown at checkout.</span></div>}
            <div className="acc">
              <details open><summary>Details</summary><p>{p.material}{p.size ? ' Size: ' + p.size + '.' : ''} Each piece is printed to order, so colours may vary slightly from your screen.</p></details>
              <details><summary>Care</summary><p>{p.care}</p></details>
              <details><summary>Delivery and returns</summary><p>Nationwide courier delivery, or collect from a PUDO locker. Custom items are made just for you and cannot be returned unless they arrive damaged.</p></details>
            </div>
          </div>
        </div>
      </div></section>
      {rel.length > 0 && <section className="alt"><div className="wrap"><div className="sec-head"><div className="stack" style={{ gap: 10 }}><span className="eyebrow">More from {themeName(p.theme_id)}</span><h2>You might also love</h2></div></div><div className="pgrid">{rel.map(x => <ProductCard key={x.id} p={x} />)}</div></div></section>}
    </>
  )
}

export function Custom() {
  const { products, loading } = useShop()
  if (loading) return <Loading />
  return (
    <>
      <PageHead crumbs="Make it yours" eyebrow="Custom orders" title="Your photo, printed on wood" blurb="Pets, grandchildren, the family farm or a favourite view. Send us the photo and we turn it into a coaster or phone stand." />
      <section><div className="wrap stack" style={{ gap: 40 }}>
        <div className="steps3">{[['1', 'Choose and upload', 'Pick a coaster or phone stand and upload your photo with an optional name or message.'], ['2', 'We send a proof', 'We design it and send you a proof by email or WhatsApp. Nothing prints until you say yes.'], ['3', 'Printed and couriered', 'We UV print it on MDF, pack it with care and courier it to your door.']].map(s => <div className="card" key={s[0]}><span className="n">{s[0]}</span><h3 style={{ fontSize: 26 }}>{s[1]}</h3><p className="muted">{s[2]}</p></div>)}</div>
        <div className="pgrid three">{products.filter(p => p.is_custom).map(p => <ProductCard key={p.id} p={p} />)}</div>
      </div></section>
    </>
  )
}

function Countdown({ end }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t) }, [])
  if (!end) return null
  let ms = Math.max(0, new Date(end) - Date.now())
  const d = Math.floor(ms / 864e5); ms -= d * 864e5; const h = Math.floor(ms / 36e5); ms -= h * 36e5; const m = Math.floor(ms / 6e4); const s = Math.floor((ms - m * 6e4) / 1000)
  return <div className="timer" aria-label="Time left on specials">{[[d, 'days'], [h, 'hours'], [m, 'mins'], [s, 'secs']].map(([v, l]) => <div key={l}><b className="num">{String(v).padStart(2, '0')}</b><small>{l}</small></div>)}</div>
}

export function Specials() {
  const { products, settings, loading } = useShop()
  if (loading) return <Loading />
  const list = products.filter(p => specialOn(p) && hasPrice(p))
  const max = list.length ? Math.max(...list.map(p => Math.round((1 - p.special_price / p.price) * 100))) : 0
  const ends = list.map(p => p.special_ends).filter(Boolean).sort()[0] || (settings && settings.specials_end)
  return (
    <>
      <section style={{ paddingTop: 40 }}><div className="wrap"><div className="promo">
        <div className="stack" style={{ gap: 12, maxWidth: 620 }}><span className="eyebrow" style={{ color: 'var(--surface)' }}>This month's specials</span><h1>{list.length ? 'Save up to ' + max + '% this month' : 'New specials coming soon'}</h1><p style={{ color: '#F3E3D2', fontSize: 17 }}>Special prices end automatically when the countdown runs out.</p></div>
        {list.length > 0 && <Countdown end={ends} />}
      </div></div></section>
      <section style={{ paddingTop: 8 }}><div className="wrap">
        {list.length > 0 && <><div className="sec-head"><h2>On special now</h2><span className="muted">Prices shown include the discount</span></div><div className="pgrid">{list.map(p => <ProductCard key={p.id} p={p} />)}</div></>}
        <div className="card" style={{ marginTop: 40, padding: 32, background: 'var(--surface)', border: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}><div className="stack" style={{ gap: 6 }}><h2 style={{ fontSize: 32 }}>Save with a gift set</h2><p className="muted">Sets of coasters and matching phone stands at a set price.</p></div><Link className="btn" to="/gift-sets">See gift sets</Link></div>
      </div></section>
    </>
  )
}

export function GiftSets() {
  const { sets, P, loading, addToCart, toast } = useShop()
  if (loading) return <Loading />
  const [f, ...rest] = sets
  return (
    <>
      <PageHead center eyebrow="Better together" title="Gift sets" blurb="Matching coaster sets and stand pairs at one set price. Ready to wrap and give." />
      <section><div className="wrap stack" style={{ gap: 28 }}>
        {f ? <div className="card combo-hero"><SetHero set={f} /></div> : <p className="muted">New gift sets coming soon.</p>}
        <div className="pgrid three">{rest.map(s => {
          const full = setFull(s, P)
          return (
            <div className="card" key={s.id} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="combo-imgs" style={{ gap: 6 }}>{s.gift_set_items.slice(0, 5).map(i => { const p = P(i.product_id); return p ? <div key={i.product_id} className="t" style={{ width: 72, height: 72 }}><img src={p.image_url} alt={fullName(p)} /></div> : null })}</div>
              <h3 style={{ fontSize: 28 }}>{s.name}</h3><p className="muted" style={{ fontSize: 14 }}>{s.description}</p>
              <div className="addrow"><span className="price"><span className="now num">{R(s.price)}</span>{full && full > s.price ? <span className="was num">{R(full)}</span> : null}</span>{full && full > s.price ? <span className="pill" style={{ background: 'var(--surface)', color: 'var(--primary-dk)' }}>Save {R(full - s.price)}</span> : null}</div>
              <button className="btn sm" onClick={() => { addToCart('s', s.id, 1); toast(s.name + ' added to your cart') }}>Add set to cart</button>
            </div>)
        })}</div>
      </div></section>
    </>
  )
}

export function Story() {
  return (
    <>
      <PageHead eyebrow="About us" title="Our story" />
      <section><div className="wrap story">
        <div className="ph"><img src="/products/c_d21.webp" alt="Hemel Op Aarde sheep coaster" /></div>
        <div className="stack"><h2 style={{ fontSize: 40 }}>Designed in house, printed on wood</h2>
          <p className="muted" style={{ fontSize: 18 }}>[YOUR STORY] Tell customers who designs every piece, why the donkeys, and how each order is printed and packed.</p>
          <p className="muted" style={{ fontSize: 18 }}>[DELIVERY, RETURNS, TERMS AND POPIA PRIVACY POLICY] These pages still need to be written and approved before launch.</p>
          <Link className="btn" to="/shop" style={{ alignSelf: 'flex-start' }}>Shop the range</Link></div>
      </div></section>
    </>
  )
}

export function NotFound() {
  const nav = useNavigate()
  return <section><div className="wrap stack" style={{ alignItems: 'center', textAlign: 'center' }}><h1 style={{ fontSize: 48 }}>Page not found</h1><button className="btn" onClick={() => nav('/')}>Go to the home page</button></div></section>
}
