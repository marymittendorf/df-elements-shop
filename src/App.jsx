import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ShopProvider } from './lib/store'
import { Header, Footer, CartDrawer, Toast } from './components/ShopParts'
import { Home, Shop, Product, Custom, Specials, GiftSets, Story, NotFound } from './pages/Browse'
import { Checkout, OrderDone, Account } from './pages/Buy'
import { Wholesale } from './pages/Wholesale'

const AdminApp = lazy(() => import('./admin/AdminApp'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function ShopLayout({ children }) {
  return (<><Header /><main id="main">{children}</main><Footer /><CartDrawer /><Toast /></>)
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><AdminApp /></Suspense>} />
        <Route path="*" element={
          <ShopProvider>
            <ShopLayout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/product/:id" element={<Product />} />
                <Route path="/custom" element={<Custom />} />
                <Route path="/specials" element={<Specials />} />
                <Route path="/gift-sets" element={<GiftSets />} />
                <Route path="/story" element={<Story />} />
                <Route path="/account" element={<Account />} />
                <Route path="/wholesale" element={<Wholesale />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order/:no" element={<OrderDone />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ShopLayout>
          </ShopProvider>
        } />
      </Routes>
    </>
  )
}
