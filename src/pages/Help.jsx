import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useShop } from '../lib/store'
import { PageHead, Loading } from '../components/ShopParts'
import { Icon } from '../components/Icons'

export function Help() {
  const { settings } = useShop()
  const [faqs, setFaqs] = useState(null)
  const [group, setGroup] = useState('All')
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('faqs').select('id, question, answer, group_name, sort_order').eq('is_active', true).order('group_name').order('sort_order')
      .then(({ data }) => setFaqs(data || []))
  }, [])
  const groups = useMemo(() => [...new Set((faqs || []).map(f => f.group_name))], [faqs])
  const shown = (faqs || []).filter(f => (group === 'All' || f.group_name === group) &&
    (!q.trim() || (f.question + ' ' + f.answer).toLowerCase().includes(q.trim().toLowerCase())))
  const byGroup = groups.map(g => [g, shown.filter(f => f.group_name === g)]).filter(([, l]) => l.length)

  return (
    <>
      <PageHead eyebrow="Help" title="Questions and answers" blurb="Everything you need to know about ordering, paying, delivery and custom prints." />
      <section style={{ paddingTop: 40 }}><div className="wrap faqwrap">
        <div className="faqtools">
          <label className="faqsearch" htmlFor="faq-q"><Icon.search /><span className="sr">Search questions</span>
            <input id="faq-q" type="search" placeholder="Search questions" value={q} onChange={e => setQ(e.target.value)} /></label>
          <div className="chips">{['All', ...groups].map(g => <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}</div>
        </div>
        {faqs == null ? <Loading /> : byGroup.length === 0
          ? <div className="card panel"><b>No answers match your search.</b><span className="muted">Try another word, or ask us directly.</span></div>
          : byGroup.map(([g, list]) => (
            <div key={g} className="faqgroup">
              <h2>{g}</h2>
              <div className="card faqlist">
                {list.map(f => <details key={f.id} className="faq"><summary><span>{f.question}</span><i aria-hidden="true">+</i></summary><p>{f.answer}</p></details>)}
              </div>
            </div>
          ))}
        <div className="band faqband">
          <div><h2 style={{ fontSize: 30, color: '#fff' }}>Still need help?</h2><p style={{ color: '#EADDC7', marginTop: 6 }}>Send us a message and we will get back to you.</p></div>
          <div className="row">
            {settings && settings.email ? <a className="btn light" href={'mailto:' + settings.email}>Email us</a> : null}
            {settings && settings.phone ? <a className="btn light" href={'tel:' + settings.phone.replace(/\s/g, '')}>Call {settings.phone}</a> : null}
            <Link className="btn light" to="/shop">Back to the shop</Link>
          </div>
        </div>
      </div></section>
    </>
  )
}
