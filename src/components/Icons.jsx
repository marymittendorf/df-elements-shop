const S = ({ size = 20, sw = 1.7, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const Icon = {
  search: () => <S><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></S>,
  user: () => <S><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></S>,
  bag: () => <S size={18}><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></S>,
  menu: () => <S size={22}><path d="M4 7h16M4 12h16M4 17h16" /></S>,
  plus: () => <S size={16} sw={2.2}><path d="M12 5v14M5 12h14" /></S>,
  truck: () => <S sw={1.6}><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></S>,
  doc: () => <S sw={1.6}><path d="M6 3h9l3 3v15H6z" /><path d="M9 9h6M9 13h6M9 17h4" /></S>,
  list: () => <S sw={1.6}><path d="M9 5h10M9 12h10M9 19h10" /><path d="M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" /></S>,
  x: () => <S size={22} sw={1.8}><path d="M6 6l12 12M18 6L6 18" /></S>,
  brush: () => <S size={24} sw={1.5}><path d="M14 4l6 6-8 8H6v-6z" /><path d="M4 20l2-2" /></S>,
  camera: () => <S size={24} sw={1.6}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></S>,
  printer: () => <S sw={1.6}><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></S>,
  check: ({ size = 20 }) => <S size={size} sw={1.8}><path d="M5 12l5 5 9-10" /></S>
}

export const Logo = ({ dark }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    <span className="mono">DF</span>
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, alignItems: 'flex-start', color: dark ? '#fff' : undefined }}>
      Elements
      <span style={{ fontFamily: 'var(--body)', fontStyle: 'normal', fontSize: 10, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.75, marginTop: 4 }}>Printed on wood</span>
    </span>
  </span>
)
