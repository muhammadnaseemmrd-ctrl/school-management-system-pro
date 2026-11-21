import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, Field, inputCls, btnPrimary, btnGhost, btnDanger } from '../ui';
import apiClient from '../../utils/apiClient';
import { Tabs, Loading, Note, Table, Td, Tag, useGet, call, dt, DStatus, Sev, KIND_WORD, lines, Reason, download } from './asKit';
import DraftView from './DraftView';
import Rules from './Rules';

const Tile = ({ label, value, tone }) => <div className="rounded-xl border border-[#e3e7e7] bg-white p-4"><p className="text-xs font-semibold text-[#5b6b7b]">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${tone || 'text-[#1b2837]'}`} dir="ltr">{value}</p></div>;

function Write({ me, onMade }) {
  const on = me.kinds.filter((k) => k.on); const [kind, setKind] = useState(on[0]?.key || ''); const [f, setF] = useState({ minutes: 40, count: 5, difficulty: 'Medium', kinds: ['mcq', 'tf', 'short'], audience: 'Class Specific', noticeType: 'general', tone: 'encouraging', from: 'en', facts: {}, sourceIds: [], levels: {} });
  const src = useGet('/ai/sources', { state: 'Approved' }); const cls = useGet('/classes', { limit: 100 }); const rubs = useGet('/assess/rubrics'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v })); const fact = (k, v) => setF((x) => ({ ...x, facts: { ...x.facts, [k]: v } }));
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  if (!me.enabled) return <Note>The writing assistant is switched off for this school. An administrator can switch it on under Rules.</Note>;
  if (!on.length) return <Note>No kind of writing is allowed yet. An administrator can allow some under Rules.</Note>;
  const rubric = (rubs.data?.rubrics || []).find((r) => r._id === f.rubricId);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const body = { kind, ...f, objectives: lines(f.objectives), minutes: Number(f.minutes), count: Number(f.count) };
    try { const r = await apiClient.post('/ai/drafts', body); toast.success('Draft ready. Read it carefully before you use it.'); onMade(r.data.draft._id); } catch (x) { setErr(x.response?.data?.message || 'The draft could not be made.'); }
    setBusy(false);
  };
  const SourcePick = () => (
    <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[#1b2837]">Teaching sources {kind === 'question_set' ? '(needed)' : '(optional)'}</legend>
      {src.data && src.data.sources.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">No approved sources yet. Add one under Sources.</p> : <ul className="mt-1 grid gap-1 sm:grid-cols-2">{(src.data?.sources || []).map((s) => <li key={s._id}><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={f.sourceIds.includes(s._id)} onChange={() => set('sourceIds', toggle(f.sourceIds, s._id))} /> <span>{s.title} <span className="text-xs text-[#5b6b7b]">· {s.license.kind}</span></span></label></li>)}</ul>}
    </fieldset>
  );
  return (
    <Card>
      <form onSubmit={go} className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm text-[#5b6b7b] sm:col-span-2">The assistant makes a first draft. You must read and change it. Nothing reaches students or families until a person approves it. Do not type children&apos;s names, admission numbers or care matters: they are blocked.</p>
        <Field label="What do you want to write?"><select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>{on.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
        <p className="self-end text-xs text-[#5b6b7b]">{on.find((k) => k.key === kind)?.help}</p>
        {(kind === 'lesson_plan' || kind === 'question_set') && <>
          <Field label="Topic"><input className={inputCls} required minLength={3} maxLength={200} value={f.topic || ''} onChange={(e) => set('topic', e.target.value)} /></Field>
          {kind === 'lesson_plan' && <><Field label="Subject"><input className={inputCls} value={f.subject || ''} onChange={(e) => set('subject', e.target.value)} /></Field><Field label="Grade"><input className={inputCls} value={f.grade || ''} onChange={(e) => set('grade', e.target.value)} /></Field><Field label="Lesson length (minutes)"><input type="number" className={inputCls} min={10} max={120} value={f.minutes} onChange={(e) => set('minutes', e.target.value)} /></Field><Field label="What should students be able to do? (one per line)"><textarea className={inputCls} rows={3} value={f.objectives || ''} onChange={(e) => set('objectives', e.target.value)} /></Field></>}
          {kind === 'question_set' && <><Field label="How many questions"><input type="number" className={inputCls} min={1} max={20} value={f.count} onChange={(e) => set('count', e.target.value)} /></Field><Field label="Difficulty"><select className={inputCls} value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select></Field>
            <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[#1b2837]">Kinds of question</legend><div className="mt-1 flex flex-wrap gap-4">{[['mcq', 'Multiple choice'], ['tf', 'True or false'], ['short', 'Short answer']].map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.kinds.includes(k)} onChange={() => set('kinds', toggle(f.kinds, k))} /> {l}</label>)}</div></fieldset></>}
          <SourcePick />
        </>}
        {kind === 'notice' && <>
          <Field label="Kind of notice"><select className={inputCls} value={f.noticeType} onChange={(e) => set('noticeType', e.target.value)}>{[['general', 'General'], ['event', 'Event'], ['reminder', 'Reminder'], ['closure', 'Closure'], ['exam', 'Exam']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Who is it for?"><select className={inputCls} value={f.audience} onChange={(e) => set('audience', e.target.value)}><option value="Class Specific">One class</option>{admin(me) && ['All', 'Students', 'Teachers'].map((a) => <option key={a}>{a}</option>)}</select></Field>
          {f.audience === 'Class Specific' && <Field label="Class"><select className={inputCls} required value={f.classId || ''} onChange={(e) => set('classId', e.target.value)}><option value="">Choose…</option>{(cls.data?.classes || []).map((c) => <option key={c._id} value={c._id}>{c.standard}-{c.division}</option>)}</select></Field>}
          <Field label="Title (optional)"><input className={inputCls} maxLength={120} value={f.title || ''} onChange={(e) => set('title', e.target.value)} /></Field>
          {[['what', 'What is it about? (needed)'], ['date', 'Date (YYYY-MM-DD)'], ['time', 'Time'], ['place', 'Place'], ['who', 'Who must come or act'], ['action', 'What to do'], ['deadline', 'Deadline'], ['contact', 'Who to ask']].map(([k, l]) => <Field key={k} label={l}><input className={inputCls} value={f.facts[k] || ''} maxLength={200} onChange={(e) => fact(k, e.target.value)} /></Field>)}
        </>}
        {kind === 'rubric_feedback' && <>
          <Field label="Rubric"><select className={inputCls} required value={f.rubricId || ''} onChange={(e) => { set('rubricId', e.target.value); set('levels', {}); }}><option value="">Choose…</option>{(rubs.data?.rubrics || []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></Field>
          <Field label="Tone"><select className={inputCls} value={f.tone} onChange={(e) => set('tone', e.target.value)}><option value="encouraging">Encouraging</option><option value="neutral">Neutral</option></select></Field>
          {rubric && rubric.criteria.map((c) => <Field key={c.id} label={c.name}><select className={inputCls} value={f.levels[c.id] ?? 0} onChange={(e) => set('levels', { ...f.levels, [c.id]: Number(e.target.value) })}>{c.levels.map((l, i) => <option key={i} value={i}>{l.name || l.label || `Level ${i + 1}`}</option>)}</select></Field>)}
          <Field label="What went well (your words)"><textarea className={inputCls} rows={2} maxLength={500} value={f.strengths || ''} onChange={(e) => set('strengths', e.target.value)} /></Field><Field label="What to do next"><textarea className={inputCls} rows={2} maxLength={500} value={f.nextSteps || ''} onChange={(e) => set('nextSteps', e.target.value)} /></Field>
          <p className="text-xs text-[#5b6b7b] sm:col-span-2">Do not name the student. Comments are about the work, never about the child.</p>
        </>}
        {kind === 'translation' && <>
          <Field label="From"><select className={inputCls} value={f.from} onChange={(e) => set('from', e.target.value)}><option value="en">English to Urdu</option><option value="ur">Urdu to English</option></select></Field>
          <Field label="Text to translate"><textarea className={inputCls} required rows={4} minLength={3} maxLength={3000} value={f.text || ''} onChange={(e) => set('text', e.target.value)} /></Field>
        </>}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Drafting…' : 'Make a draft'}</button></div>
      </form>
    </Card>
  );
}
const admin = (me) => me.level === 'admin';

function Drafts({ scope, me, onOpen, version }) {
  const [st, setSt] = useState(scope === 'review' ? 'Review' : ''); const g = useGet('/ai/drafts', { scope, status: st || undefined, v: version });
  return (
    <div className="space-y-3">
      {scope !== 'review' && <div className="flex flex-wrap items-end gap-3"><Field label="Show"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value)}><option value="">All</option>{['Draft', 'Review', 'Approved', 'Rejected', 'Withdrawn', 'Expired'].map((s) => <option key={s}>{s}</option>)}</select></Field></div>}
      <Loading g={g}>{g.data && (g.data.drafts.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">{scope === 'review' ? 'Nothing is waiting for review.' : 'You have no drafts yet.'}</p></Card> : (
        <Table label={scope === 'review' ? 'Drafts waiting for review' : 'Your drafts'} head={['No.', 'What', 'Title', 'By', 'Status', 'Checks', '']} min={760}>
          {g.data.drafts.map((d) => <tr key={d._id}><Td><span dir="ltr">{d.no}</span></Td><Td>{KIND_WORD[d.kind] || d.kind}</Td><Td>{d.title}</Td><Td>{d.requesterName}</Td><Td><DStatus s={d.status} /></Td><Td>{(d.flags || []).filter((x) => x.severity === 'block').length ? <Sev s="block" /> : (d.flags || []).filter((x) => x.severity === 'warn').length ? <Sev s="warn" /> : '—'}</Td><Td><button className={btnGhost} onClick={() => onOpen(d._id)} aria-label={`Open ${d.no}`}>Open</button></Td></tr>)}
        </Table>))}</Loading>
    </div>
  );
}

function Sources({ me, version, bump }) {
  const [st, setSt] = useState(''); const g = useGet('/ai/sources', { state: st || undefined, v: version }); const [add, setAdd] = useState(false); const [act, setAct] = useState(null); const [form, setForm] = useState({ title: '', subject: '', grade: '', text: '', kind: 'original', source: '', holder: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/ai/sources', { title: form.title, subject: form.subject, grade: form.grade, text: form.text, license: { kind: form.kind, source: form.source, holder: form.holder } }); toast.success('Added. It waits for approval.'); setAdd(false); setForm({ title: '', subject: '', grade: '', text: '', kind: 'original', source: '', holder: '' }); bump(); } catch (x) { setErr(x.response?.data?.message || 'That did not work.'); } setBusy(false); };
  const decide = async (s, decision, note) => { await apiClient.post(`/ai/sources/${s._id}/decide`, { decision, note }); toast.success(decision === 'approve' ? 'Approved.' : 'Turned down.'); setAct(null); bump(); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Show"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value)}><option value="">All</option><option>Pending</option><option>Approved</option><option>Retired</option></select></Field><button className={btnPrimary} onClick={() => setAdd(!add)}>{add ? 'Close' : 'Add a source'}</button></div>
      <Note>The assistant quotes only from sources a reviewer approved. Add text you wrote, or text the school may use, and say where it comes from.</Note>
      {add && <Card><form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Title"><input className={inputCls} required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="Subject"><input className={inputCls} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
        <Field label="Grade"><input className={inputCls} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></Field>
        <Field label="Who may use this text?"><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="original">I or the school wrote it</option><option value="open">It has an open licence</option><option value="licensed">The school has a licence</option></select></Field>
        {form.kind !== 'original' && <><Field label="Where it comes from"><input className={inputCls} required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field><Field label="Who holds the copyright"><input className={inputCls} value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} /></Field></>}
        <div className="sm:col-span-2"><Field label="The text (at least a few sentences)"><textarea className={inputCls} required rows={8} minLength={80} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field></div>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}<div className="flex justify-end sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Add it'}</button></div></form></Card>}
      <Loading g={g}>{g.data && (g.data.sources.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">No sources yet.</p></Card> : (
        <Table label="Teaching sources" head={['Title', 'Subject', 'Licence', 'Status', 'Used', 'Added by', '']} min={760}>
          {g.data.sources.map((s) => <tr key={s._id}><Td><span className="font-semibold">{s.title}</span></Td><Td>{[s.subject, s.grade].filter(Boolean).join(' · ') || '—'}</Td><Td>{s.license.kind}</Td><Td><Tag tone={s.state === 'Approved' ? 'good' : s.state === 'Pending' ? 'warn' : 'none'}>{s.state === 'Pending' ? 'Waiting for approval' : s.state === 'Retired' ? 'Not in use' : 'Approved'}</Tag></Td><Td>{s.uses}</Td><Td>{s.addedByName}</Td>
            <Td><div className="flex gap-2">{s.state === 'Pending' && me.canReview && <><button className={btnPrimary} onClick={() => decide(s, 'approve', '')} aria-label={`Approve ${s.title}`}>Approve</button><button className={btnGhost} onClick={() => setAct(s)} aria-label={`Turn down ${s.title}`}>Turn down</button></>}{s.state !== 'Retired' && <button className={btnGhost} onClick={() => call(() => apiClient.post(`/ai/sources/${s._id}/retire`), 'Not in use any more', bump)} aria-label={`Retire ${s.title}`}>Retire</button>}</div></Td></tr>)}
        </Table>))}</Loading>
      {act && <Reason title={`Turn down ${act.title}`} confirm="Turn down" onClose={() => setAct(null)} onDone={(n) => decide(act, 'reject', n)} />}
    </div>
  );
}

function Trail({ me }) {
  const [p, setP] = useState(1); const [action, setAction] = useState(''); const g = useGet('/ai/audit', { page: p, limit: 25, action: action || undefined });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Action"><select className={inputCls} value={action} onChange={(e) => { setAction(e.target.value); setP(1); }}><option value="">All</option>{['generate', 'edit', 'submit', 'approve', 'reject', 'return', 'publish', 'withdraw', 'refused', 'policy', 'source', 'glossary', 'test', 'fee_check'].map((a) => <option key={a}>{a}</option>)}</select></Field>{me.level === 'admin' && <button className={btnGhost} onClick={() => download('/ai/audit?format=csv', 'ai-trail.csv')}>Download as a spreadsheet</button>}</div>
      <Note>{me.level === 'teacher' ? 'This is your own trail.' : 'Every draft, change, approval and refusal. Prompts are shown for 180 days; fingerprints stay.'}</Note>
      <Loading g={g}>{g.data && (<><Table label="Assistant trail" head={['When', 'Who', 'Action', 'Draft', 'Drafter', 'Warnings', 'Worked', 'Detail']} min={860}>
        {g.data.rows.map((r) => <tr key={r._id}><Td>{dt(r.at)}</Td><Td>{r.actorName}</Td><Td>{r.action}</Td><Td><span dir="ltr">{r.draftNo || '—'}</span></Td><Td>{r.provider ? `${r.provider}${r.model ? ` · ${r.model}` : ''}` : '—'}</Td><Td>{r.flags || 0}</Td><Td>{r.ok ? 'Yes' : <span className="text-[#9f1239]">No</span>}</Td><Td className="max-w-xs break-words text-xs text-[#5b6b7b]">{r.reason || (r.removed && Object.keys(r.removed).length ? `Removed before sending: ${Object.entries(r.removed).map(([k, v]) => `${k} ×${v}`).join(', ')}` : '')}</Td></tr>)}</Table>
        <div className="flex items-center justify-between text-xs text-[#3b4a5c]"><span>{g.data.total} in all</span><span className="flex gap-2"><button className={btnGhost} disabled={p <= 1} onClick={() => setP(p - 1)}>Previous</button><button className={btnGhost} disabled={p * 25 >= g.data.total} onClick={() => setP(p + 1)}>Next</button></span></div></>)}</Loading>
    </div>
  );
}

function Glossary() {
  const g = useGet('/ai/glossary'); const [text, setText] = useState(null);
  const shown = text ?? (g.data ? g.data.entries.map((e) => `${e.en} = ${e.ur}`).join('\n') : '');
  const save = () => call(() => apiClient.put('/ai/glossary', { entries: lines(shown).map((l) => { const [en, ...ur] = l.split('='); return { en: (en || '').trim(), ur: ur.join('=').trim() }; }) }), 'Glossary saved');
  return <Loading g={g}>{g.data && <Card><h2 className="text-sm font-bold text-[#1b2837]">The school&apos;s own Urdu words</h2><p className="mt-1 text-sm text-[#5b6b7b]">The built-in drafter already knows {g.data.builtin} common school words. Add the school&apos;s own, one per line, like <span dir="ltr">timetable = ٹائم ٹیبل</span>. These are used before the built-in ones.</p><label className="mt-3 block text-sm font-semibold text-[#1b2837]" htmlFor="gl">Words, one per line</label><textarea id="gl" className={`${inputCls} mt-1`} rows={10} value={shown} onChange={(e) => setText(e.target.value)} /><div className="mt-3 flex justify-end"><button className={btnPrimary} onClick={save}>Save the words</button></div></Card>}</Loading>;
}

function Report() {
  const [days, setDays] = useState(30); const g = useGet('/ai/report', { days });
  return <Loading g={g}>{g.data && (<div className="space-y-3"><div className="flex items-end gap-3"><Field label="Last"><select className={inputCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Tile label="Drafts made" value={g.data.drafts} /><Tile label="Approved of those reviewed" value={g.data.approvalRate === null ? '—' : `${g.data.approvalRate}%`} /><Tile label="Median wait for review" value={g.data.medianReviewHours === null ? '—' : `${g.data.medianReviewHours} h`} /><Tile label="Model errors" value={g.data.modelErrors} tone={g.data.modelErrors ? 'text-[#9f1239]' : ''} /></div>
    <Table label="By kind of writing" head={['Kind', 'Made', 'Approved', 'Turned down', 'With warnings', 'Edited by a person']} min={620}>{Object.entries(g.data.byKind).map(([k, v]) => <tr key={k}><Td>{KIND_WORD[k] || k}</Td><Td>{v.made}</Td><Td>{v.approved}</Td><Td>{v.rejected}</Td><Td>{v.flagged}</Td><Td>{v.edited}</Td></tr>)}</Table>
    {Object.keys(g.data.refused).length > 0 && <Card><h2 className="text-sm font-bold text-[#1b2837]">Stopped before drafting</h2><ul className="mt-2 text-sm text-[#3b4a5c]">{Object.entries(g.data.refused).map(([k, v]) => <li key={k}>{k.replace(/_/g, ' ')}: {v}</li>)}</ul></Card>}</div>)}</Loading>;
}

function FeeChecks() {
  const [v, setV] = useState(0); const g = useGet('/ai/fee-checks', { v }); const [act, setAct] = useState(null);
  return <Loading g={g}>{g.data && (<div className="space-y-3"><Note>These checks only read the fee records. They point at things worth a look. They change nothing, and they are not a finding of wrongdoing.</Note>
    {g.data.exceptions.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">Nothing unusual in the last {g.data.days} days.</p></Card> : <Table label="Fee records to look at" head={['What', 'Detail', 'When', '']} min={640}>{g.data.exceptions.map((x) => <tr key={x.key}><Td>{x.label}</Td><Td className="max-w-md text-[#3b4a5c]">{x.detail}</Td><Td>{dt(x.at)}</Td><Td>{x.checked ? <Tag tone="good">Looked at</Tag> : <button className={btnGhost} onClick={() => setAct(x)} aria-label={`Mark ${x.label} as looked at`}>Looked at</button>}</Td></tr>)}</Table>}
    {act && <Reason title="Mark as looked at" text="Write what you found. It is added to the trail." confirm="Save" danger={false} onClose={() => setAct(null)} onDone={async (n) => { await apiClient.post(`/ai/fee-checks/${act.key}/checked`, { note: n }); toast.success('Saved.'); setAct(null); setV(v + 1); }} />}</div>)}</Loading>;
}

// The writing assistant (PRD E31): drafts that a person must read and approve, with a trail of what went in and out.
export default function AssistantHub({ admin: isAdmin }) {
  const [tab, setTab] = useState('write'); const [open, setOpen] = useState(null); const [v, setV] = useState(0); const me = useGet('/ai/me'); const bump = () => setV((x) => x + 1);
  if (open) return <DraftView id={open} onBack={() => { setOpen(null); bump(); }} me={me.data} />;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-[#1b2837]">Writing assistant</h1><p className="mt-1 text-sm text-[#5b6b7b]">Helps you start a lesson plan, notice, set of questions, feedback comment or translation. Everything is a draft until a person reads and approves it. Children&apos;s data is never sent, and is never used to train a model.</p></div>
      <Loading g={me}>{me.data && (<>
        <Tabs label="Assistant sections" value={tab} onChange={setTab} items={[['write', 'Write'], ['drafts', 'My drafts'], ...(me.data.canReview ? [['review', 'To review']] : []), ['sources', 'Sources'], ['trail', 'Trail'], ...(isAdmin && me.data.wide ? [['report', 'Report'], ['rules', 'Rules'], ['glossary', 'Urdu words'], ['fees', 'Fee checks']] : [])]} />
        <p className="text-xs text-[#5b6b7b]" role="status">{me.data.enabled ? `On · ${me.data.provider} · you have made ${me.data.limits.usedHour} of ${me.data.limits.perHour} drafts this hour` : 'Switched off'}{me.data.pendingPolicy ? ' · a change to the rules waits for a second administrator' : ''}</p>
        <div key={tab}>
          {tab === 'write' && <Write me={me.data} onMade={setOpen} />}
          {tab === 'drafts' && <Drafts scope="mine" me={me.data} onOpen={setOpen} version={v} />}
          {tab === 'review' && <Drafts scope="review" me={me.data} onOpen={setOpen} version={v} />}
          {tab === 'sources' && <Sources me={me.data} version={v} bump={bump} />}
          {tab === 'trail' && <Trail me={me.data} />}
          {tab === 'report' && <Report />}
          {tab === 'rules' && <Rules onChanged={() => { me.reload(); bump(); }} />}
          {tab === 'glossary' && <Glossary />}
          {tab === 'fees' && <FeeChecks />}
        </div></>)}</Loading>
    </div>
  );
}
