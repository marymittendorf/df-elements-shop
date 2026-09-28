import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { nowPrice, fullName, setTypes } from './format'

const Ctx = createContext(null)
export const useShop = () => useContext(Ctx)

const CART_KEY = 'dfe-cart-v1'
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || [] } catch { return [] } }

export function ShopProvider({ children }) {
  const [catalog, setCatalog] = useState({ loading: true, error: null, themes: [], products: [], sets: [], delivery: [], settings: null })
  const [cart, setCart] = useState(readCart)
  const [drawer, setDrawer] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [session, setSession] = useState(null)
  const [customer, setCustomer] = useState(undefined) // undefined = still loading, null = none
  const tRef = useRef()

  const loadCatalog = useCallback(async () => {
    const [th, pr, gs, dl, st, ty] = await Promise.all([
      supabase.from('themes').select('*').order('sort_order'),
      supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('gift_sets').select('*, gift_set_items(product_id, qty)').eq('is_active', true).order('sort_order'),
      supabase.from('delivery_options').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('product_types').select('*').eq('is_active', true).order('sort_order')
    ])
    setTypes(ty.data)
    const err = th.error || pr.error || gs.error || dl.error || st.error
    setCatalog({ loading: false, error: err ? err.message : null, themes: th.data || [], products: pr.data || [], sets: gs.data || [], delivery: dl.data || [], settings: st.data })
  }, [])

  useEffect(() => { loadCatalog() }, [loadCatalog])
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* private mode */ } }, [cart])

  const loadCustomer = useCallback(async (s) => {
    if (!s) { setCustomer(null); return }
    setCustomer(c => (c && c.id === s.user.id ? c : undefined))
    const { data } = await supabase.from('customers').select('*').eq('id', s.user.id).maybeSingle()
    setCustomer(data || null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); loadCustomer(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); loadCustomer(s) })
    return () => sub.subscription.unsubscribe()
  }, [loadCustomer])

  const toast = useCallback(msg => {
    setToastMsg(msg); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToastMsg(''), 2600)
  }, [])

  const P = useCallback(id => catalog.products.find(p => p.id === id), [catalog.products])
  const SET = useCallback(id => catalog.sets.find(s => s.id === id), [catalog.sets])
  const themeName = useCallback(id => (catalog.themes.find(t => t.id === id) || {}).name || '', [catalog.themes])

  // cart line: {k, t:'p'|'s', id, qty, note?, photo?}
  const addToCart = useCallback((t, id, qty = 1, extra) => {
    setCart(c => {
      if (extra) return [...c, { k: crypto.randomUUID(), t, id, qty, ...extra }]
      const f = c.find(l => l.t === t && l.id === id && !l.photo && !l.note)
      if (f) return c.map(l => (l === f ? { ...l, qty: l.qty + qty } : l))
      return [...c, { k: crypto.randomUUID(), t, id, qty }]
    })
  }, [])
  const setQty = useCallback((k, qty) => setCart(c => (qty < 1 ? c.filter(l => l.k !== k) : c.map(l => (l.k === k ? { ...l, qty } : l)))), [])
  const clearCart = useCallback(() => setCart([]), [])

  const lines = useMemo(() => cart.map(l => {
    if (l.t === 'p') {
      const p = P(l.id); if (!p) return null
      return { ...l, name: fullName(p), meta: p.is_custom ? 'Made to order' + (l.note ? ' · ' + l.note : '') : p.size || '', unit: nowPrice(p), img: p.image_url, product: p }
    }
    const s = SET(l.id); if (!s) return null
    const first = P((s.gift_set_items[0] || {}).product_id)
    return { ...l, name: s.name, meta: 'Set of ' + s.gift_set_items.length, unit: Number(s.price), img: first ? first.image_url : null }
  }).filter(Boolean), [cart, P, SET])

  const count = lines.reduce((s, l) => s + l.qty, 0)
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0)

  const value = {
    ...catalog, loadCatalog, P, SET, themeName,
    cart, lines, count, subtotal, addToCart, setQty, clearCart, drawer, setDrawer,
    toast, toastMsg, session, customer, setCustomer, loadCustomer
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
