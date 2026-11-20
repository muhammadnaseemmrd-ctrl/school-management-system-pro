import React, { useState } from 'react';
import { Send, Star, Lock } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, Stat, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, mins, CATS, CAT_WORD, PRIORITIES, TICKET_TONE, TICKET_WORD, PRI_TONE, SlaBadge } from './commsKit';

const NEXT = { Open: ['In progress', 'Waiting on family', 'Resolved'], 'In progress': ['Waiting on family', 'Resolved'], 'Waiting on family': ['In progress', 'Resolved'], Resolved: ['Closed', 'In progress'], Closed: ['In progress'] };
const NEXT_WORD = { 'In progress': 'Start working on it', 'Waiting on family': 'Ask the family for something', Resolved: 'Mark resolved', Closed: 'Close it', 'In progress*': 'Reopen' };
const NEEDS_TEXT = new Set(['Waiting on family', 'Resolved']);

const Row = ({ t, onOpen, admin }) => (
  <li><button className="w-full rounded-xl border border-[#e3e7e7] bg-white p-3 text-start hover:bg-[#f7f6f2]" onClick={() => onOpen(t._id)}>
    <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{t.number}</b><span className="min-w-0 flex-1 truncate" dir="auto">{t.subject}</span>{t.unread && <span className="rounded-full bg-[#9f1239] px-1.5 text-[11px] font-bold text-white">new</span>}<Pill value={TICKET_TONE[t.status]}>{TICKET_WORD[t.status]}</Pill></div>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5b6b7b]"><span>{CAT_WORD[t.category]}</span>{admin && <span>· {t.parentName}</span>}{t.studentName && <span>· about {t.studentName}</span>}<span>· {when(t.lastAt || t.createdAt)}</span>{admin && t.priority !== 'normal' && <Pill value={PRI_TONE[t.priority]}>{t.priority === 'urgent' ? 'Urgent' : 'High priority'}</Pill>}{admin && t.restricted && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Administrators only</span>}{admin && !t.assigneeName && ['Open', 'In progress'].includes(t.status) && <span>· nobody has taken it</span>}<span className="ms-auto"><SlaBadge sla={t.sla} school={admin} /></span></div>
  </button></li>
);

function AssignSelect({ t, onAssign }) {
  const admins = useGet('/comms/helpdesk/admins');
  return <Field label="Taken by"><select className={`${inputCls} w-48`} value={t.assigneeId || ''} onChange={(e) => e.target.value && onAssign(e.target.value)}><option value="">Nobody yet</option>{(admins.data?.admins || []).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</select></Field>;
}
function CannedPicker({ onPick }) {
  const canned = useGet('/comms/canned'); const list = canned.data?.replies || [];
  if (!list.length) return null;
  return <label className="flex items-center gap-2 text-sm">Ready-made reply<select className={`${inputCls} w-64`} value="" onChange={(e) => { const r = list.find((x) => x._id === e.target.value); if (r) onPick(r); }}><option value="">Insert…</option>{list.map((r) => <option key={r._id} value={r._id}>{r.title}</option>)}</select></label>;
}

// The conversation on one request. Admins see internal notes and the controls; families see the shared history.
export function TicketView({ id, admin, onBack, onChanged }) {
  const g = useGet(`/comms/tickets/${id}`);
  const [text, setText] = useState(''); const [tr, setTr] = useState(''); const [note, setNote] = useState(false); const [st, setSt] = useState(null); const [pri, setPri] = useState(null); const [rate, setRate] = useState(0); const [rateNote, setRateNote] = useState('');
  const d = g.data; const t = d?.ticket; const done = async () => { await g.reload(); onChanged && onChanged(); };
  const lang = d?.lang || 'en';
  const reply = () => call(() => apiClient.post(`/comms/tickets/${id}/comments`, { text, translation: tr || undefined, internal: note || undefined }), note ? 'Note added' : 'Sent', async () => { setText(''); setTr(''); setNote(false); await done(); });
  return (
    <Loading g={g}>{t && (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnGhost} onClick={onBack}>Back</button>
          <div className="min-w-0 flex-1"><div className="font-bold" dir="auto">{t.number} · {t.subject}</div><div className="text-xs text-[#5b6b7b]">{CAT_WORD[t.category]}{admin ? ` · ${t.parentName}` : ''}{t.studentName ? ` · about ${t.studentName}` : ''} · opened {when(t.createdAt)}</div></div>
          <Pill value={TICKET_TONE[t.status]}>{TICKET_WORD[t.status]}</Pill>{admin && <Pill value={PRI_TONE[t.priority]}>{t.priority}</Pill>}<SlaBadge sla={t.sla} school={admin} />
        </div>
        {t.sla && (t.sla.firstDueAt || t.sla.resolveDueAt) && <div className="text-xs text-[#5b6b7b]">{!t.firstResponseAt && t.sla.firstDueAt && <>First reply by {when(t.sla.firstDueAt)} · </>}{t.sla.resolveDueAt && <>We aim to resolve this by {when(t.sla.resolveDueAt)}</>}{t.sla.state === 'paused' && ' (the clock is paused while we wait for you)'}</div>}
        {admin && <Card className="!p-3"><div className="flex flex-wrap items-end gap-2">
          <AssignSelect t={t} onAssign={(v) => call(() => apiClient.post(`/comms/tickets/${id}/assign`, { assigneeId: v }), 'Assigned', done)} />
          <button className={btnGhost} onClick={() => setPri({ priority: t.priority, reason: '' })}>Change priority</button>
          {(NEXT[t.status] || []).map((s) => <button key={s} className={s === 'Resolved' ? btnPrimary : btnGhost} onClick={() => (NEEDS_TEXT.has(s) ? setSt({ status: s, text: '' }) : call(() => apiClient.post(`/comms/tickets/${id}/status`, { status: s }), 'Updated', done))}>{t.status === 'Resolved' && s === 'In progress' || t.status === 'Closed' ? 'Reopen' : NEXT_WORD[s]}</button>)}
        </div></Card>}
        {!admin && t.status === 'Resolved' && <Card className="!p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-sm">Is this sorted?</span><button className={btnPrimary} onClick={() => call(() => apiClient.post(`/comms/tickets/${id}/status`, { status: 'Closed' }), 'Closed. Thank you.', done)}>Yes, close it</button><span className="text-xs text-[#5b6b7b]">Or write below and we will pick it up again.</span></div></Card>}
        <Card className="max-h-[50vh] overflow-y-auto !p-3"><ul className="grid gap-2" aria-label="History">
          <li className="rounded-xl bg-[#f7f6f2] p-3 text-sm"><div className="mb-0.5 text-[11px] text-[#5b6b7b]">{admin ? t.parentName : 'You'} · {when(t.createdAt)}</div><p dir="auto" className="whitespace-pre-wrap break-words">{t.body}</p></li>
          {d.events.filter((e, i) => !(i === 0 && e.kind === 'comment' && e.byRole === 'parent' && (e.en === t.body || e.ur === t.body))).map((e) => {
            const shown = e[lang] || e.en || e.ur || ''; const alt = e[lang] && (lang === 'ur' ? e.en : e.ur);
            return e.kind === 'status' || e.kind === 'sla' || e.kind === 'assign' || e.kind === 'priority' || e.kind === 'rating'
              ? <li key={e._id} className="text-center text-xs text-[#5b6b7b]">{when(e.at)} · <span dir="auto">{e.kind === 'status' && e.data?.to && shown !== TICKET_WORD[e.data.to] ? `${TICKET_WORD[e.data.to]} · ${shown}` : shown}</span></li>
              : <li key={e._id} className={`flex ${e.byRole === 'parent' ? (admin ? 'justify-start' : 'justify-end') : (admin ? 'justify-end' : 'justify-start')}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${e.kind === 'note' ? 'border border-dashed border-[#d6b95e] bg-[#fffbea]' : e.byRole === 'parent' ? 'bg-[#f1f2f2]' : 'bg-[#eef2f8]'}`}><div className="mb-0.5 text-[11px] text-[#5b6b7b]">{e.kind === 'note' ? 'Internal note · ' : ''}{e.byName || (e.byRole === 'parent' ? 'Family' : 'School')} · {when(e.at)}</div><p dir="auto" className="whitespace-pre-wrap break-words">{shown}</p>{alt && <p dir="auto" className="mt-1 border-t border-[#e3e7e7] pt-1 text-xs text-[#5b6b7b]">{alt}</p>}</div></li>;
          })}
        </ul></Card>
        {d.canReply && t.status !== 'Closed' || (!admin && d.canReopen) ? (
          <div className="grid gap-2">
            {admin && <CannedPicker onPick={(r) => { setText(r.en || r.ur); setTr(r.en && r.ur ? r.ur : ''); }} />}
            <label className="sr-only" htmlFor="tk-text">Write a reply</label>
            <textarea id="tk-text" dir="auto" className={`${inputCls} min-h-[90px]`} maxLength={3000} placeholder={note ? 'Only the school will see this note' : admin ? 'Reply to the family' : t.status === 'Closed' || t.status === 'Resolved' ? 'Write here to reopen this request' : 'Write a reply'} value={text} onChange={(e) => setText(e.target.value)} />
            {admin && !note && <details className="text-sm"><summary className="cursor-pointer text-[#2a5cac]">Add the same reply in the other language</summary><textarea dir="auto" aria-label="Same reply in the other language" className={`${inputCls} mt-2 min-h-[64px]`} maxLength={3000} value={tr} onChange={(e) => setTr(e.target.value)} /></details>}
            <div className="flex flex-wrap items-center justify-between gap-2">{admin ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />Internal note, the family will not see it</label> : <span />}<button className={btnPrimary} disabled={!text.trim()} onClick={reply}><Send className="h-4 w-4" />{note ? 'Add note' : 'Send'}</button></div>
          </div>
        ) : t.status === 'Closed' ? <Note>This request is closed.{!admin && ' If you still need help, please start a new request.'}</Note> : null}
        {!admin && ['Resolved', 'Closed'].includes(t.status) && !t.rating && <Card className="!p-3"><div className="text-sm font-semibold">How was our help?</div><div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rate === n} aria-label={`${n} of 5`} className={`rounded p-1 ${rate >= n ? 'text-[#d6a516]' : 'text-[#b8c0c0]'}`} onClick={() => setRate(n)}><Star className="h-6 w-6" fill={rate >= n ? 'currentColor' : 'none'} /></button>)}</div><input className={`${inputCls} mt-2`} aria-label="Anything to add" maxLength={300} placeholder="Anything to add? (optional)" value={rateNote} onChange={(e) => setRateNote(e.target.value)} /><div className="mt-2 flex justify-end"><button className={btnPrimary} disabled={!rate} onClick={() => call(() => apiClient.post(`/comms/tickets/${id}/rate`, { rating: rate, note: rateNote || undefined }), 'Thank you', done)}>Send rating</button></div></Card>}
        {t.rating ? <div className="text-xs text-[#5b6b7b]">{admin ? 'The family rated this' : 'You rated this'} {t.rating} of 5.</div> : null}
        {st && <Modal title={st.status === 'Resolved' ? 'Mark as resolved' : 'Ask the family'} onClose={() => setSt(null)}><Field label={st.status === 'Resolved' ? 'What was done (the family sees this)' : 'What do you need from them (the family sees this)'}><textarea dir="auto" className={`${inputCls} min-h-[90px]`} maxLength={1000} value={st.text} onChange={(e) => setSt({ ...st, text: e.target.value })} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setSt(null)}>Cancel</button><button className={btnPrimary} disabled={st.text.trim().length < 3} onClick={() => call(() => apiClient.post(`/comms/tickets/${id}/status`, { status: st.status, text: st.text }), 'Updated', async () => { setSt(null); await done(); })}>Confirm</button></div></Modal>}
        {pri && <Modal title="Change priority" onClose={() => setPri(null)}><Field label="Priority"><select className={inputCls} value={pri.priority} onChange={(e) => setPri({ ...pri, priority: e.target.value })}>{PRIORITIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><div className="mt-3"><Field label="Why (kept in the history)" hint="Changing the priority recalculates the deadlines."><input className={inputCls} maxLength={200} value={pri.reason} onChange={(e) => setPri({ ...pri, reason: e.target.value })} /></Field></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setPri(null)}>Cancel</button><button className={btnPrimary} disabled={pri.reason.trim().length < 3 || pri.priority === t.priority} onClick={() => call(() => apiClient.post(`/comms/tickets/${id}/priority`, pri), 'Priority changed', async () => { setPri(null); await done(); })}>Save</button></div></Modal>}
      </div>)}</Loading>
  );
}

function Canned() {
  const g = useGet('/comms/canned'); const [e, setE] = useState(null);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">Short answers you use again and again. Add both languages so every family can read them.</p><button className={btnPrimary} onClick={() => setE({ title: '', category: '', en: '', ur: '' })}>New reply</button></div>
      <Loading g={g}>{(g.data?.replies || []).length === 0 ? <Card><EmptyState title="No ready-made replies" text="Add one for questions you answer often, such as how to get a fee challan copy." /></Card> : (
        <ul className="grid gap-2 sm:grid-cols-2">{g.data.replies.map((r) => <li key={r._id}><Card className="!p-3"><div className="flex items-center gap-2"><b className="flex-1 text-sm">{r.title}</b>{r.category && <Pill value="None">{CAT_WORD[r.category]}</Pill>}</div><p className="mt-1 line-clamp-3 text-xs text-[#5b6b7b]">{r.en || r.ur}</p><div className="mt-2 flex gap-2"><button className={btnGhost} onClick={() => setE(r)}>Edit</button><button className={btnDanger} onClick={() => call(() => apiClient.delete(`/comms/canned/${r._id}`), 'Removed', g.reload)}>Remove</button></div></Card></li>)}</ul>)}</Loading>
      {e && <Modal wide title={e._id ? 'Edit reply' : 'New reply'} onClose={() => setE(null)}><div className="grid gap-3"><Field label="Title"><input className={inputCls} maxLength={80} value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></Field><Field label="For which kind of request"><select className={inputCls} value={e.category || ''} onChange={(x) => setE({ ...e, category: x.target.value })}><option value="">Any</option>{CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="English"><textarea className={`${inputCls} min-h-[80px]`} maxLength={1500} value={e.en || ''} onChange={(x) => setE({ ...e, en: x.target.value })} /></Field><Field label="اردو"><textarea dir="rtl" className={`${inputCls} min-h-[80px]`} maxLength={1500} value={e.ur || ''} onChange={(x) => setE({ ...e, ur: x.target.value })} /></Field></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setE(null)}>Cancel</button><button className={btnPrimary} disabled={e.title.trim().length < 2 || !(e.en || e.ur)} onClick={() => call(() => (e._id ? apiClient.put(`/comms/canned/${e._id}`, e) : apiClient.post('/comms/canned', e)), 'Saved', async () => { setE(null); await g.reload(); })}>Save</button></div></Modal>}
    </div>
  );
}

function Report() {
  const [days, setDays] = useState(30); const g = useGet('/comms/helpdesk/report', { days }); const r = g.data;
  return (
    <div className="grid gap-3"><label className="flex items-center gap-2 text-sm">Period<select className={`${inputCls} w-40`} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 180].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select></label>
      <Loading g={g}>{r && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Requests" value={r.total} /><Stat label="Deadlines met" value={r.metPct == null ? '—' : `${r.metPct}%`} sub={`${r.judged} finished`} /><Stat label="Median first reply" value={mins(r.medianFirstReplyMinutes)} sub="working time" /><Stat label="Median to resolve" value={mins(r.medianResolveMinutes)} sub="working time" /><Stat label="Past deadline" value={r.breached} /><Stat label="Reopened" value={r.reopened} /><Stat label="Average rating" value={r.ratingAvg == null ? '—' : `${r.ratingAvg} / 5`} sub={`${r.rated} rated`} /><Stat label="Oldest open" value={r.oldestOpen ? when(r.oldestOpen) : '—'} /></div>
        <div className="grid gap-3 sm:grid-cols-3">{[['By kind', r.byCategory, (k) => CAT_WORD[k] || k], ['By state', r.byStatus, (k) => TICKET_WORD[k] || k], ['By priority', r.byPriority, (k) => k]].map(([h, o, f]) => <Card key={h} className="!p-3"><div className="mb-1 text-xs font-semibold text-[#5b6b7b]">{h}</div>{Object.keys(o || {}).length === 0 ? <div className="text-sm text-[#5b6b7b]">Nothing in this period.</div> : <ul className="grid gap-1 text-sm">{Object.entries(o).map(([k, v]) => <li key={k} className="flex justify-between"><span>{f(k)}</span><b>{v}</b></li>)}</ul>}</Card>)}</div>
      </>}</Loading>
    </div>
  );
}

// The administrator's help desk
export default function HelpDeskAdmin({ onChanged }) {
  const [tab, setTab] = useState('requests'); const [open, setOpen] = useState(null); const [status, setStatus] = useState('open'); const [f, setF] = useState({ category: '', priority: '', assignee: '', q: '', breach: '' });
  const g = useGet('/comms/tickets', { status, limit: 50, category: f.category || undefined, priority: f.priority || undefined, assignee: f.assignee || undefined, q: f.q || undefined, breach: f.breach || undefined });
  if (open) return <TicketView id={open} admin onBack={() => { setOpen(null); g.reload(); }} onChanged={onChanged} />;
  const rows = g.data?.tickets || [];
  return (
    <div className="grid gap-3"><Tabs label="Help desk" value={tab} onChange={setTab} items={[['requests', 'Requests'], ['canned', 'Ready-made replies'], ['report', 'Report']]} />
      {tab === 'canned' ? <Canned /> : tab === 'report' ? <Report /> : <>
        <div className="flex flex-wrap items-end gap-2">
          <Tabs label="State" value={status} onChange={setStatus} items={[['open', 'Open'], ['Waiting on family', 'Waiting on family'], ['done', 'Resolved or closed']]} />
          <label className="sr-only" htmlFor="hd-q">Search requests</label><input id="hd-q" className={`${inputCls} w-44`} placeholder="Number, name, subject" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select aria-label="Kind" className={`${inputCls} w-36`} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Any kind</option>{CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Priority" className={`${inputCls} w-32`} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any priority</option>{PRIORITIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Taken by" className={`${inputCls} w-36`} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">Anyone</option><option value="me">Mine</option><option value="none">Nobody yet</option></select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.breach === '1'} onChange={(e) => setF({ ...f, breach: e.target.checked ? '1' : '' })} />Past deadline</label>
        </div>
        <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No requests here" text="Requests that families raise from their Messages and help page appear here." /></Card> : <ul className="grid gap-2" aria-label="Requests">{rows.map((t) => <Row key={t._id} t={t} admin onOpen={setOpen} />)}</ul>}</Loading>
      </>}
    </div>
  );
}

// A parent's own requests
export function FamilyHelp({ onChanged }) {
  const g = useGet('/comms/tickets', { status: 'all', limit: 50 }); const kids = useGet('/comms/family/children'); const [open, setOpen] = useState(null); const [mk, setMk] = useState(false); const [f, setF] = useState({ category: 'other', subject: '', text: '', studentId: '' });
  const rows = g.data?.tickets || []; const children = (kids.data?.children || []).filter((c) => c.canHelp);
  if (open) return <TicketView id={open} onBack={() => { setOpen(null); g.reload(); }} onChanged={onChanged} />;
  const needsChild = ['fees', 'academics', 'attendance'].includes(f.category);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">Ask the school about fees, documents, transport or anything else. We tell you when to expect a reply.</p><button className={btnPrimary} onClick={() => setMk(true)}>New request</button></div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No requests yet" text="Start one when you need help from the office." /></Card> : <ul className="grid gap-2" aria-label="My requests">{rows.map((t) => <Row key={t._id} t={t} onOpen={setOpen} />)}</ul>}</Loading>
      {mk && <Modal wide title="New request" onClose={() => setMk(false)}><div className="grid gap-3">
        <Field label="What is it about"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {f.category === 'safety' && <Note tone="warn">A safety concern goes straight to the school leadership as urgent. If a child is in danger right now, please call the school.</Note>}
        {children.length > 0 && <Field label={needsChild ? 'About which child' : 'About which child (optional)'}><select className={inputCls} value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">{needsChild ? 'Choose a child' : 'Not about one child'}</option>{children.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>}
        <Field label="Title"><input dir="auto" className={inputCls} maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Tell us more"><textarea dir="auto" className={`${inputCls} min-h-[110px]`} maxLength={3000} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setMk(false)}>Cancel</button><button className={btnPrimary} disabled={f.subject.trim().length < 3 || !f.text.trim() || (needsChild && !f.studentId)} onClick={() => call(() => apiClient.post('/comms/tickets', { ...f, studentId: f.studentId || undefined }), (r) => `Request ${r.data.ticket.number} sent`, async (r) => { setMk(false); setF({ category: 'other', subject: '', text: '', studentId: '' }); await g.reload(); onChanged && onChanged(); setOpen(r.data.ticket._id); })}>Send request</button></div>
      </div></Modal>}
    </div>
  );
}
