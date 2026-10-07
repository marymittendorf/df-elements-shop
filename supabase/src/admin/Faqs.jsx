import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdmin } from './AdminApp'

const BLANK = { question: '', answer: '', group_name: 'Ordering' }

export function Faqs() {
  const { toast } = useAdmin()
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null) // row being edited, or BLANK copy for a new one
  const load = useCallback(async () => {
    const { data } = await supabase.from('faqs').select('*').order('group_name').order('sort_order').order('id')
    setList(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  if (!list) return <p className="muted">Loading…</p>

  const groups = [...new Set(list.map(f => f.group_name))]
  const save = async () => {
    const row = { question: edit.question.trim(), answer: edit.answer.trim(), group_name: edit.group_name.trim() || 'Other' }
    if (!row.question || !row.answer) { toast('Fill in the question and the answer'); return }
    const { error } = edit.id
      ? await supabase.from('faqs').update(row).eq('id', edit.id)
      : await supabase.from('faqs').insert({ ...row, sort_order: list.filter(f => f.group_name === row.group_name).length + 1 })
    if (error) { toast(error.message); return }
    toast(edit.id ? 'Answer saved' : 'Question added'); setEdit(null); load()
  }
  const toggle = async f => { await supabase.from('faqs').update({ is_active: !f.is_active }).eq('id', f.id); load() }
  const del = async f => { if (!window.confirm('Delete this question?\n\n' + f.question)) return; await supabase.from('faqs').delete().eq('id', f.id); toast('Question deleted'); setEdit(null); load() }
  const move = async (g, i, dir) => {
    const items = list.filter(f => f.group_name === g); const j = i + dir
    if (j < 0 || j >= items.length) return
    const a = items[i], b = items[j]
    const order = items.map((f, k) => (f === a ? { ...b, k } : f === b ? { ...a, k } : { ...f, k }))
    await Promise.all(order.map(f => supabase.from('faqs').update({ sort_order: f.k + 1 }).eq('id', f.id)))
    load()
  }

  const form = edit && (
    <div className="card panel faqedit">
      <h2 style={{ fontSize: 24 }}>{edit.id ? 'Edit question' : 'New question'}</h2>
      <label className="field" htmlFor="fq-g">Group<input id="fq-g" list="fq-groups" value={edit.group_name} onChange={e => setEdit({ ...edit, group_name: e.target.value })} /></label>
      <datalist id="fq-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
      <label className="field" htmlFor="fq-q">Question<input id="fq-q" value={edit.question} onChange={e => setEdit({ ...edit, question: e.target.value })} /></label>
      <label className="field" htmlFor="fq-a">Answer<textarea id="fq-a" rows={5} value={edit.answer} onChange={e => setEdit({ ...edit, answer: e.target.value })} /></label>
      <div className="row"><button className="btn sm" onClick={save}>Save</button><button className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button>{edit.id ? <button className="linkbtn" style={{ color: 'var(--sale)', marginLeft: 'auto' }} onClick={() => del(edit)}>Delete</button> : null}</div>
    </div>
  )

  return (
    <>
      <div className="ahead"><div><h1>Q and A</h1><p className="muted">These questions show on the Help page of your shop. Hidden ones stay here for later.</p></div>
        <div className="row"><a className="btn ghost sm" href="/help" target="_blank" rel="noreferrer">View the page</a><button className="btn sm" onClick={() => setEdit({ ...BLANK, group_name: groups[0] || 'Ordering' })}>Add a question</button></div></div>
      {edit && !edit.id && form}
      {groups.map(g => {
        const items = list.filter(f => f.group_name === g)
        return (
          <div key={g} className="card panel">
            <div className="ahead"><h2 style={{ fontSize: 24 }}>{g}</h2><span className="muted" style={{ fontSize: 14 }}>{items.filter(f => f.is_active).length} of {items.length} showing</span></div>
            {items.map((f, i) => edit && edit.id === f.id ? <div key={f.id}>{form}</div> : (
              <div key={f.id} className="faqrow" style={{ opacity: f.is_active ? 1 : 0.55 }}>
                <div className="updown"><button aria-label="Move up" disabled={i === 0} onClick={() => move(g, i, -1)}>▲</button><button aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(g, i, 1)}>▼</button></div>
                <div className="info"><b>{f.question}</b><p className="muted">{f.answer}</p></div>
                <div className="acts"><button className="linkbtn" onClick={() => setEdit({ ...f })}>Edit</button><button className="linkbtn" onClick={() => toggle(f)}>{f.is_active ? 'Hide' : 'Show'}</button></div>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
