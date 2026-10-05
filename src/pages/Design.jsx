import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useShop } from '../lib/store'
import { DesignCard, Loading } from '../components/ShopParts'
import { Icon } from '../components/Icons'
import { R, hasPrice, nowPrice, specialOn } from '../lib/format'

const GROUPS = ['Boards', 'Coasters', 'Keyrings and buttons', 'Other']

export function Design() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const { designs, products, formats, loading, addToCart, toast, themeName } = useShop()
  const [qty, setQty] = useState(1)
  const [page, setPage] = useState(false)
  const d = (designs || []).find(x => x.id === Number(id))
  const F = useMemo(() => Object.fromEntries((formats || []).map(f => [f.key, f])), [formats])
  const items = useMemo(() => (d ? products.filter(p => p.design_id === d.id && F[p.format_key]).sort((a, b) => F[a.format_key].sort_order - F[b.format_key].sort_order) : []), [d, products, F])
  const cur = items.find(p => p.format_key === sp.get('f')) || items[0]
  useEffect(() => { setQty(1) }, [cur && cur.id])
  useEffect(() => { window.scrollTo(0, 0) }, [id])
  if (loading) return <Loading />
  if (!d || !cur) return <section><div className="wrap stack"><h1 style={{ fontSize: 44 }}>We could not find that design</h1><Link className="btn" to="/shop" style={{ alignSelf: 'flex-start' }}>Shop the range</Link></div></section>

  const pick = p => setSp({ f: p.format_key }, { replace: true })
  const add = () => { addToCart('p', cur.id, qty); toast(d.name + ', ' + F[cur.format_key].label + ' added to your cart') }
  const rel = (designs || []).filter(x => x.id !== d.id && x.theme_id === d.theme_id).slice(0, 4)
  const relItems = x => products.filter(p => p.design_id === x.id)

  return (
    <>
      <section style={{ paddingTop: 32 }}><div className="wrap">
        <div className="crumbs"><Link to="/">Home</Link> / {d.theme_id ? <><Link to={'/shop?theme=' + d.theme_id}>{themeName(d.theme_id)}</Link> / </> : null}{d.name}</div>
        <div className="pdp" style={{ marginTop: 20 }}>
          <div className="stack" style={{ gap: 14 }}>
            <div className="main dmain" style={{ background: 'var(--t1)' }}><img key={cur.image_url} src={cur.image_url} alt={d.name + ', ' + F[cur.format_key].label} /></div>
            <div className="dthumbs" role="list" aria-label="All items in this design">
              {items.map(p => <button key={p.id} role="listitem" className="dthumb" aria-pressed={p.id === cur.id} title={F[p.format_key].label} onClick={() => pick(p)}><img src={p.image_url} alt={F[p.format_key].label} loading="lazy" /></button>)}
            </div>
          </div>
          <div className="stack">
            <div className="stack" style={{ gap: 10 }}>
              <span className="eyebrow">{[themeName(d.theme_id), 'Code ' + d.code].filter(Boolean).join(' · ')}</span>
              <h1>{d.name}</h1>
              <div className="row"><span className="bigprice num">{hasPrice(cur) ? R(nowPrice(cur)) : 'Price coming soon'}</span>{specialOn(cur) && <span className="was num muted" style={{ textDecoration: 'line-through' }}>{R(cur.price)}</span>}<span className="pill" style={{ background: 'rgba(34,30,27,.1)', color: 'var(--primary-dk)', fontSize: 14, padding: '7px 14px' }}>{F[cur.format_key].label}</span></div>
            </div>
            <p className="muted" style={{ fontSize: 17 }}>{d.description}</p>
            <div className="fmtpick">
              {GROUPS.map(g => { const list = items.filter(p => F[p.format_key].group_name === g); return list.length ? (
                <div key={g}><span className="eyebrow">{g}</span><div className="chips">{list.map(p => <button key={p.id} className="chip" aria-pressed={p.id === cur.id} onClick={() => pick(p)}>{F[p.format_key].label}<span className="num muted"> {R(nowPrice(p))}</span></button>)}</div></div>) : null })}
            </div>
            {hasPrice(cur) && <div className="row"><div className="qty"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">&minus;</button><span className="num">{qty}</span><button onClick={() => setQty(qty + 1)} aria-label="Increase quantity">+</button></div><button className="btn" style={{ flex: '1 1 200px' }} onClick={add}>Add to cart</button></div>}
            <div className="note"><span className="circle" style={{ width: 40, height: 40 }}><Icon.truck /></span><span>Made to order for you. Delivery options and costs are shown at checkout.</span></div>
            <div className="acc">
              {d.gift_for && <details open><summary>Lovely for</summary><p>{d.gift_for}</p></details>}
              <details><summary>Details</summary><p>MDF, UV printed. Each piece is made to order, so colours may vary slightly from your screen.</p></details>
              <details><summary>Care</summary><p>{cur.care}</p></details>
              {d.page_url && <details onToggle={e => setPage(e.target.open)}><summary>See the whole range</summary>{page && <img src={d.page_url} alt={'Every item in the ' + d.name + ' range'} style={{ width: '100%', borderRadius: 'var(--r-sm)', marginTop: 8 }} loading="lazy" />}</details>}
            </div>
          </div>
        </div>
      </div></section>
      {rel.length > 0 && <section className="alt"><div className="wrap"><div className="sec-head"><div className="stack" style={{ gap: 10 }}><span className="eyebrow">More from {themeName(d.theme_id)}</span><h2>You might also love</h2></div></div><div className="pgrid">{rel.map(x => <DesignCard key={x.id} d={x} items={relItems(x)} fmt="a3" />)}</div></div></section>}
    </>
  )
}
