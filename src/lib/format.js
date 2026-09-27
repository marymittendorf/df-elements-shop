export const R = n => 'R ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const hasPrice = p => p && p.price !== null && p.price !== undefined && p.price !== ''

export const specialOn = p => p && p.special_price != null && (!p.special_ends || new Date(p.special_ends) > new Date())

export const nowPrice = p => (specialOn(p) ? Number(p.special_price) : Number(p.price || 0))

export const fullName = p => p.name + (p.variant ? ' · ' + p.variant : '')

export const TYPES = [
  { key: 'coaster', label: 'Coasters', blurb: 'Square MDF coasters, UV printed edge to edge. Buy singles or save with a gift set.', img: '/products/c_d01.webp' },
  { key: 'stand', label: 'Phone stands', blurb: 'Two piece MDF phone stands that hold your phone upright on a desk or bedside table.', img: '/products/s_born.webp' },
  { key: 'board', label: 'A4 decor boards', blurb: 'Printed MDF boards for walls, shelves and gifting.', img: null }
]
export const typeName = t => (TYPES.find(x => x.key === t) || { label: 'Product' }).label

export const STATUS = {
  awaiting_payment: ['Awaiting EFT', 'var(--warn-bg)', 'var(--warn-fg)'],
  paid: ['Paid, to print', 'var(--surface)', 'var(--primary-dk)'],
  printed_packed: ['Printed and packed', 'var(--info-bg)', 'var(--info-fg)'],
  shipped: ['Shipped', 'var(--info-bg)', 'var(--info-fg)'],
  delivered: ['Delivered', 'var(--grey-bg)', 'var(--muted2)'],
  cancelled: ['Cancelled', '#F8D7CF', '#6B2413']
}
export const FLOW = ['awaiting_payment', 'paid', 'printed_packed', 'shipped', 'delivered']

export const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
export const fmtDateTime = d => (d ? fmtDate(d) + ', ' + new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '')
