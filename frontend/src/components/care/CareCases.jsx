import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, day, errText, CATS, CAT_WORD, LEVELS, LEVEL_WORD, LEVEL_TONE, CASE_TONE, StudentPicker, StaffSelect } from './careKit';

function OpenCase({ caps, onClose, onSaved, preset }) {
  const staff = useGet('/care/staff'); const [st, setSt] = useState(preset?.student || null);
  const [f, setF] = useState({ category: preset?.category || 'wellbeing', level: preset?.level || 'support', title: preset?.title || '', summary: preset?.summary || '', leadId: '', circle: [] });
  const cats = CATS.filter(([k]) => caps.dsl || !['bullying', 'safeguarding'].includes(k));
  const secret = ['bullying', 'safeguarding'].includes(f.category);
  return (
    <Modal wide title="Open a support case" onClose={onClose}>
      <div className="grid gap-3">
        <StudentPicker value={st} onPick={setSt} autoFocus />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="What is it about?"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="How much support?"><select className={inputCls} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{LEVELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        {secret && <Note tone="warn">This will be a confidential case. Only the people you add, and the safeguarding leads, will be able to open it.</Note>}
        <Field label="Short title"><input className={inputCls} maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="What has happened so far"><textarea className={`${inputCls} min-h-[80px]`} maxLength={2000} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <StaffSelect staff={staff.data?.staff} value={f.leadId} onChange={(v) => setF({ ...f, leadId: v })} label="Who leads this case?" />
        <fieldset className="grid gap-1"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Others who can see this case</legend><div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{(staff.data?.staff || []).map((p) => <label key={p.id} className="flex items-center gap-1 rounded-lg border border-[#e3e7e7] px-2 py-1 text-xs"><input type="checkbox" checked={f.circle.includes(p.id)} onChange={() => setF({ ...f, circle: f.circle.includes(p.id) ? f.circle.filter((x) => x !== p.id) : [...f.circle, p.id] })} />{p.name}</label>)}</div></fieldset>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!st || f.title.trim().length < 4} onClick={() => call(() => apiClient.post('/care/cases', { ...f, leadId: f.leadId || undefined, studentId: st._id, fromReportId: preset?.fromReportId }), 'Case opened', (r) => onSaved(r.data._id))}>Open case</button></div>
      </div>
    </Modal>
  );
}

function CloseForm({ k, onClose, onDone }) {
  const [outcome, setOutcome] = useState('');
  return (
    <Modal title={`Close ${k.number}`} onClose={onClose}>
      <div className="grid gap-3">
        {k.confidential && <Note>A second safeguarding lead will be asked to sign off. If you are the only lead, this is recorded as a sole sign-off.</Note>}
        <Field label="What was the outcome?" hint={k.confidential ? 'At least 20 characters.' : 'At least 10 characters.'}><textarea className={`${inputCls} min-h-[90px]`} maxLength={1000} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={outcome.trim().length < (k.confidential ? 20 : 10)} onClick={() => call(() => apiClient.post(`/care/cases/${k._id}/close`, { outcome }), (r) => (r.data.closed ? 'Case closed' : 'Sent for a second sign-off'), onDone)}>Close case</button></div>
      </div>
    </Modal>
  );
}

export function CaseView({ id, caps, onBack, onChanged }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [tab, setTab] = useState('timeline'); const staff = useGet('/care/staff');
  const [note, setNote] = useState({ body: '', kind: 'note', priv: false }); const [act, setAct] = useState({ text: '', ownerId: '', dueAt: '' }); const [ref, setRef] = useState({ to: '', reason: '', reference: '' }); const [circ, setCirc] = useState(''); const [closing, setClosing] = useState(false);
  const load = useCallback(async () => { try { const r = await apiClient.get(`/care/cases/${id}`); setD(r.data); setErr(''); } catch (e) { setErr(errText(e, 'Could not open the case')); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const done = async () => { await load(); onChanged && onChanged(); };
  if (err) return <div className="grid gap-3"><button className={btnGhost} onClick={onBack}>Back</button><Note tone="warn">{err}</Note></div>;
  if (!d) return <div className="p-6 text-sm text-[#5b6b7b]" role="status">Loading…</div>;
  const k = d.case; const w = d.access.canWrite; const closed = k.status === 'Closed'; const base = `/care/cases/${id}`;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnGhost} onClick={onBack}>Back</button>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-bold">{k.confidential && <Lock className="h-4 w-4 text-[#9f1239]" aria-label="Confidential" />}<span dir="auto" className="truncate">{k.number} · {k.title}</span></div><div className="text-xs text-[#5b6b7b]">{d.student?.name}{d.student?.className ? ` · ${d.student.className}` : ''} · opened by {k.openedByName || 'staff'} · {when(k.createdAt)}</div></div>
        <Pill value={CASE_TONE[k.status]}>{k.status}</Pill><Pill value={LEVEL_TONE[k.level]}>{LEVEL_WORD[k.level]}</Pill><Pill>{CAT_WORD[k.category]}</Pill>
      </div>
      {d.access.via === 'break-glass' && <Note tone="warn">You are reading this under emergency access. It is read-only and every read is recorded.</Note>}
      {k.closeRequest && k.closeRequest.at && <Card className="!p-3"><div className="text-sm"><b>{k.closeRequest.byName}</b> proposed closing this case: <span dir="auto">{k.closeRequest.outcome}</span></div>{d.canApproveClose ? <div className="mt-2 flex gap-2"><button className={btnPrimary} onClick={() => call(() => apiClient.post(`${base}/close/approve`, {}), 'Case closed', done)}>Sign off closure</button><button className={btnGhost} onClick={() => call(() => apiClient.post(`${base}/close/approve`, { approve: false, note: 'Needs more work' }), 'Closure declined', done)}>Not yet</button></div> : <div className="mt-1 text-xs text-[#5b6b7b]">Waiting for a second safeguarding lead.</div>}</Card>}
      <Card className="!p-3"><div className="grid gap-1 text-sm"><div><b>Lead:</b> {k.leadName || 'Nobody yet'} · <b>Review by:</b> {day(k.reviewOn)}</div>{k.summary && <p dir="auto" className="whitespace-pre-wrap break-words text-[#3b4a5c]">{k.summary}</p>}
        {w && !closed && <div className="mt-2 flex flex-wrap items-end gap-2">
          <StaffSelect staff={staff.data?.staff} value={k.leadId} label="Change lead" onChange={(v) => v && call(() => apiClient.patch(base, { leadId: v }), 'Lead changed', done)} />
          <Field label="Level"><select className={`${inputCls} w-44`} value={k.level} onChange={(e) => call(() => apiClient.patch(base, { level: e.target.value }), 'Level changed', done)}>{LEVELS.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
          {k.status !== 'Active' && <button className={btnGhost} onClick={() => call(() => apiClient.post(`${base}/status`, { status: 'Active' }), 'Case is active', done)}>Mark active</button>}
          {k.status === 'Active' && <button className={btnGhost} onClick={() => call(() => apiClient.post(`${base}/status`, { status: 'Review' }), 'Case is in review', done)}>Move to review</button>}
          <button className={btnPrimary} onClick={() => setClosing(true)}>Close case</button></div>}
        {w && closed && (caps.work || caps.dsl) && <div className="mt-2"><button className={btnGhost} onClick={() => call(() => apiClient.post(`${base}/reopen`, { reason: 'Reopened from the case screen' }), 'Case reopened', done)}>Reopen</button></div>}
        {closed && <p className="text-xs text-[#5b6b7b]">Closed {when(k.closedAt)} by {k.closedByName}. Outcome: <span dir="auto">{k.outcome}</span> · Signed off: {k.closeApprovedBy}</p>}
      </div></Card>
      <Tabs label="Case" value={tab} onChange={setTab} items={[['timeline', 'Timeline'], ['notes', 'Notes', d.notes.length], ['actions', 'Actions', (k.actions || []).filter((a) => a.status === 'Open').length], ['referrals', 'Referrals', (k.referrals || []).length], ['people', 'Who can see it', (k.circle || []).length]]} />
      {tab === 'timeline' && <Card className="!p-3"><ul className="grid gap-1.5 text-sm" aria-label="Timeline">{[...k.events].reverse().map((e) => <li key={e._id} className="flex gap-2"><span className="w-32 shrink-0 text-xs text-[#5b6b7b]">{when(e.at)}</span><span dir="auto"><b className="text-xs">{e.byName || 'System'}</b> {e.text}</span></li>)}</ul></Card>}
      {tab === 'notes' && <div className="grid gap-2">
        {w && !closed && <Card className="!p-3"><div className="grid gap-2"><textarea dir="auto" className={`${inputCls} min-h-[70px]`} maxLength={4000} placeholder="Write a note" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2"><select className={`${inputCls} w-40`} aria-label="Kind" value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })}><option value="note">Note</option><option value="meeting">Meeting</option><option value="contact">Contact with family</option><option value="counselling">Session note</option></select>
            {caps.counsel && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={note.priv} onChange={(e) => setNote({ ...note, priv: e.target.checked })} />Private to me (counselling)</label>}
            <button className={btnPrimary} disabled={note.body.trim().length < 3} onClick={() => call(() => apiClient.post(`${base}/notes`, { body: note.body, kind: note.kind, visibility: note.priv ? 'author' : 'circle' }), 'Note added', async () => { setNote({ body: '', kind: 'note', priv: false }); await done(); })}>Add note</button></div></div></Card>}
        {d.notes.length === 0 ? <EmptyState title="No notes yet" text="Notes are only seen by the people on this case." /> : d.notes.map((n) => <Card key={n._id} className="!p-3"><div className="mb-0.5 text-[11px] text-[#5b6b7b]">{n.authorName} · {when(n.createdAt)} · {n.kind}{n.visibility === 'author' && ' · private'}</div><p dir="auto" className="whitespace-pre-wrap break-words text-sm">{n.body}</p></Card>)}</div>}
      {tab === 'actions' && <div className="grid gap-2">
        {w && !closed && <Card className="!p-3"><div className="flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Field label="What needs to happen?"><input dir="auto" className={inputCls} maxLength={300} value={act.text} onChange={(e) => setAct({ ...act, text: e.target.value })} /></Field></div><StaffSelect staff={staff.data?.staff} value={act.ownerId} onChange={(v) => setAct({ ...act, ownerId: v })} label="Who does it?" empty="Nobody yet" /><Field label="By"><input type="date" className={inputCls} value={act.dueAt} onChange={(e) => setAct({ ...act, dueAt: e.target.value })} /></Field>
          <button className={btnPrimary} disabled={act.text.trim().length < 3} onClick={() => call(() => apiClient.post(`${base}/actions`, { text: act.text, ownerId: act.ownerId || undefined, dueAt: act.dueAt || undefined }), 'Action added', async () => { setAct({ text: '', ownerId: '', dueAt: '' }); await done(); })}>Add</button></div></Card>}
        {(k.actions || []).length === 0 ? <EmptyState title="No actions" text="Add the next steps and who owns them." /> : <ul className="grid gap-2">{k.actions.map((a) => <li key={a._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><Pill value={a.status === 'Open' ? 'Pending' : a.status === 'Done' ? 'Active' : 'None'}>{a.status}</Pill><span dir="auto" className="min-w-0 flex-1">{a.text}{a.ownerName && <span className="text-xs text-[#5b6b7b]"> · {a.ownerName}</span>}{a.dueAt && <span className="text-xs text-[#5b6b7b]"> · by {day(a.dueAt)}</span>}</span>
          {w && !closed && a.status === 'Open' && <><button className={btnGhost} onClick={() => call(() => apiClient.post(`${base}/actions/${a._id}`, { status: 'Done', outcome: 'Done' }), 'Marked done', done)}>Done</button><button className={btnGhost} onClick={() => call(() => apiClient.post(`${base}/actions/${a._id}`, { status: 'Dropped' }), 'Dropped', done)}>Drop</button></>}</li>)}</ul>}</div>}
      {tab === 'referrals' && <div className="grid gap-2">
        {w && !closed && <Card className="!p-3"><div className="flex flex-wrap items-end gap-2"><Field label="Referred to"><input className={inputCls} maxLength={120} value={ref.to} onChange={(e) => setRef({ ...ref, to: e.target.value })} placeholder="e.g. District child protection" /></Field><div className="min-w-[200px] flex-1"><Field label="Why"><input dir="auto" className={inputCls} maxLength={500} value={ref.reason} onChange={(e) => setRef({ ...ref, reason: e.target.value })} /></Field></div><Field label="Their reference"><input className={inputCls} maxLength={80} value={ref.reference} onChange={(e) => setRef({ ...ref, reference: e.target.value })} /></Field>
          <button className={btnPrimary} disabled={ref.to.trim().length < 3} onClick={() => call(() => apiClient.post(`${base}/referrals`, ref), 'Referral recorded', async () => { setRef({ to: '', reason: '', reference: '' }); await done(); })}>Record</button></div></Card>}
        {(k.referrals || []).length === 0 ? <EmptyState title="No referrals" text="Record anything passed on to another service." /> : <ul className="grid gap-2">{k.referrals.map((r) => <li key={r._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><Pill value={r.status === 'Accepted' ? 'Active' : r.status === 'Declined' ? 'Suspended' : 'Pending'}>{r.status}</Pill><span dir="auto" className="min-w-0 flex-1"><b>{r.to}</b>{r.reason && ` — ${r.reason}`}{r.reference && <span className="text-xs text-[#5b6b7b]"> · ref {r.reference}</span>}<span className="text-xs text-[#5b6b7b]"> · {when(r.at)}</span></span>
          {w && !closed && <select aria-label="Referral status" className={`${inputCls} w-32`} value={r.status} onChange={(e) => call(() => apiClient.post(`${base}/referrals/${r._id}`, { status: e.target.value }), 'Updated', done)}>{['Made', 'Accepted', 'Declined', 'Closed'].map((s) => <option key={s}>{s}</option>)}</select>}</li>)}</ul>}</div>}
      {tab === 'people' && <div className="grid gap-2">
        {w && !closed && (caps.work || caps.dsl) && <Card className="!p-3"><div className="flex flex-wrap items-end gap-2"><StaffSelect staff={(staff.data?.staff || []).filter((p) => !(k.circle || []).some((c) => String(c.id) === String(p.id)))} value={circ} onChange={setCirc} label="Add someone" empty="Choose…" /><button className={btnPrimary} disabled={!circ} onClick={() => call(() => apiClient.post(`${base}/circle`, { personId: circ }), 'Added', async () => { setCirc(''); await done(); })}>Add</button></div>{k.confidential && <p className="mt-1 text-xs text-[#5b6b7b]">Teachers need current safeguarding training before they can join a confidential case.</p>}</Card>}
        <ul className="grid gap-2">{(k.circle || []).map((c) => <li key={String(c.id)} className="flex items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><span className="min-w-0 flex-1">{c.name}{String(c.id) === String(k.leadId) && <span className="text-xs text-[#5b6b7b]"> · lead</span>}</span>{w && !closed && (caps.work || caps.dsl) && String(c.id) !== String(k.leadId) && <button className={btnDanger} onClick={() => call(() => apiClient.delete(`${base}/circle/${c.id}`), 'Removed', done)}>Remove</button>}</li>)}</ul></div>}
      {closing && <CloseForm k={k} onClose={() => setClosing(false)} onDone={async () => { setClosing(false); await done(); }} />}
    </div>
  );
}

export default function CareCases({ caps, preset, onPresetUsed }) {
  const [f, setF] = useState({ status: 'open', category: '', q: '', mine: false }); const g = useGet('/care/cases', { status: f.status || undefined, category: f.category || undefined, q: f.q.length >= 2 ? f.q : undefined, mine: f.mine ? '1' : undefined, limit: 50 });
  const [open, setOpen] = useState(null); const [form, setForm] = useState(false);
  useEffect(() => { if (preset) setForm(true); }, [preset]);
  if (open) return <CaseView id={open} caps={caps} onBack={() => setOpen(null)} onChanged={g.reload} />;
  const rows = g.data?.cases || [];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Show"><select className={`${inputCls} w-36`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="open">Open cases</option><option value="Closed">Closed</option><option value="">All</option></select></Field>
        <Field label="About"><select className={`${inputCls} w-40`} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Anything</option>{CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Student"><input className={`${inputCls} w-44`} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name" /></Field>
        <label className="mb-2 flex items-center gap-1 text-sm"><input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} />Mine only</label>
        <div className="flex-1" />{(caps.work || caps.dsl) && <button className={btnPrimary} onClick={() => setForm(true)}><Plus className="h-4 w-4" />Open a case</button>}
      </div>
      <Loading g={g}>{rows.length === 0 ? <EmptyState title="No cases" text={caps.work || caps.dsl ? 'Open a case when a child needs coordinated support.' : 'You will see cases you lead or have been added to.'} /> : (
        <ul className="grid gap-2" aria-label="Cases">{rows.map((c) => <li key={c._id}><button className="w-full rounded-xl border border-[#e3e7e7] bg-white p-3 text-start hover:bg-[#f7f6f2]" onClick={() => setOpen(c._id)}>
          <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{c.number}</b>{c.confidential && <Lock className="h-3.5 w-3.5 text-[#9f1239]" aria-label="Confidential" />}<span className="min-w-0 flex-1 truncate" dir="auto">{c.confidential && !caps.dsl ? c.title : c.title}</span><Pill value={CASE_TONE[c.status]}>{c.status}</Pill><Pill value={LEVEL_TONE[c.level]}>{LEVEL_WORD[c.level]}</Pill>{c.closePending && <Pill value="Pending">Closure waiting</Pill>}</div>
          <div className="mt-1 text-xs text-[#5b6b7b]">{c.studentName} · {CAT_WORD[c.category]} · lead {c.leadName || 'none'}{c.openActions ? ` · ${c.openActions} open actions` : ''}{c.reviewOn ? ` · review ${day(c.reviewOn)}` : ''}</div></button></li>)}</ul>)}</Loading>
      {form && <OpenCase caps={caps} preset={preset} onClose={() => { setForm(false); onPresetUsed && onPresetUsed(); }} onSaved={(id) => { setForm(false); onPresetUsed && onPresetUsed(); g.reload(); setOpen(id); }} />}
    </div>
  );
}
