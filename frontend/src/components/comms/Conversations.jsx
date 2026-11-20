import React, { useEffect, useRef, useState } from 'react';
import { Send, Lock, AlertTriangle, ArrowLeft } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, newKey, Unread } from './commsKit';

// One conversation: messages, a box to write in, and the actions the viewer is allowed.
export function Thread({ id, role, onBack, onChanged }) {
  const g = useGet(`/comms/threads/${id}`); const [text, setText] = useState(''); const [tr, setTr] = useState(''); const [urgent, setUrgent] = useState(false); const [why, setWhy] = useState(''); const [busy, setBusy] = useState(false); const [rm, setRm] = useState(null); const [dl, setDl] = useState(null); const key = useRef(newKey()); const end = useRef(null);
  const d = g.data; const t = d?.thread;
  useEffect(() => { apiClient.post(`/comms/threads/${id}/read`).then(() => onChanged && onChanged()).catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: 'end' }); }, [d?.messages?.length]);
  const send = async () => {
    if (!text.trim() || busy) return; setBusy(true);
    const r = await call(() => apiClient.post(`/comms/threads/${id}/messages`, { text, translation: tr || undefined, urgent: urgent || undefined, urgentReason: urgent ? why : undefined, clientKey: key.current }), 'Sent');
    setBusy(false); if (r) { setText(''); setTr(''); setUrgent(false); setWhy(''); key.current = newKey(); await g.reload(); onChanged && onChanged(); }
  };
  const act = (what, ok) => call(() => apiClient.post(`/comms/threads/${id}/${what}`), ok, async () => { await g.reload(); onChanged && onChanged(); });
  return (
    <Loading g={g}>{t && (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {onBack && <button className={btnGhost} onClick={onBack} aria-label="Back to the list"><ArrowLeft className="h-4 w-4" /></button>}
          <div className="min-w-0 flex-1"><div className="truncate font-bold" dir="auto">{t.subject}</div><div className="text-xs text-[#5b6b7b]">{role === 'parent' ? `About ${t.studentName} · ${t.teacherName}` : `${t.parentName} · about ${t.studentName}${t.staffKind === 'teacher' ? ` · ${t.teacherName}` : ''}`}</div></div>
          {t.status === 'closed' && <Pill value="None">Closed</Pill>}
          {role !== 'parent' && t.waitingOn === 'school' && t.status === 'open' && <Pill value={t.overdueAt ? 'Suspended' : 'Pending'}>{t.overdueAt ? 'Reply is late' : 'Needs a reply'}</Pill>}
          {role === 'admin' && <button className={btnGhost} onClick={async () => { const r = await call(() => apiClient.get(`/comms/threads/${id}/deliveries`)); if (r) setDl(r.data.deliveries); }}>Delivery</button>}
          {t.status === 'open' ? <button className={btnGhost} onClick={() => act('close', 'Conversation closed')}>Close</button> : <button className={btnGhost} onClick={() => act('reopen', 'Conversation reopened')}>Reopen</button>}
        </div>
        {role === 'admin' && t.staffKind === 'teacher' && <Note>You are reading a conversation between a teacher and a family. Opening it is recorded in the audit log.</Note>}
        <Card className="max-h-[52vh] overflow-y-auto !p-3" >
          <ul className="grid gap-2" aria-label="Messages">
            {d.messages.map((m) => (
              <li key={m._id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.removed ? 'border border-dashed border-[#e3e7e7] text-[#5b6b7b]' : m.mine ? 'bg-[#2a5cac] text-white' : m.urgent ? 'border border-[#e3b4ac] bg-[#fff1f2]' : 'bg-[#f1f2f2]'}`}>
                  <div className={`mb-0.5 text-[11px] ${m.mine && !m.removed ? 'text-white/80' : 'text-[#5b6b7b]'}`}>{m.fromName || (m.fromRole === 'parent' ? 'Family' : 'School')} · {when(m.at)}{m.urgent && <span className="ms-2 inline-flex items-center gap-1 font-bold"><AlertTriangle className="h-3 w-3" />Urgent</span>}</div>
                  {m.removed ? <i>This message was removed by the school{m.removedWhy ? `: ${m.removedWhy}` : ''}.</i> : <><p dir="auto" className="whitespace-pre-wrap break-words">{m.text}</p>{m.alt && <p dir="auto" className={`mt-1 border-t pt-1 text-xs ${m.mine ? 'border-white/30 text-white/85' : 'border-[#e3e7e7] text-[#5b6b7b]'}`}>{m.alt}</p>}</>}
                  {role === 'admin' && !m.removed && <button className={`mt-1 text-[11px] underline ${m.mine ? 'text-white/80' : 'text-[#9f1239]'}`} onClick={() => setRm(m)}>Remove</button>}
                </div>
              </li>))}
          </ul><div ref={end} />
        </Card>
        {d.canWrite && t.status === 'open' ? (
          <div className="grid gap-2">
            <label className="sr-only" htmlFor="cm-text">Write a message</label>
            <textarea id="cm-text" dir="auto" className={`${inputCls} min-h-[84px]`} maxLength={2000} placeholder={role === 'parent' ? 'Write in English or Urdu' : 'Write your message'} value={text} onChange={(e) => setText(e.target.value)} />
            {role !== 'parent' && <details className="text-sm"><summary className="cursor-pointer text-[#2a5cac]">Add the same message in the other language</summary><textarea dir="auto" aria-label="Same message in the other language" className={`${inputCls} mt-2 min-h-[64px]`} maxLength={2000} value={tr} onChange={(e) => setTr(e.target.value)} /></details>}
            {role === 'admin' && <div className="flex flex-wrap items-center gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />Urgent, send even in quiet hours</label>{urgent && <input aria-label="Why is it urgent" className={`${inputCls} flex-1`} maxLength={200} placeholder="Why is this urgent?" value={why} onChange={(e) => setWhy(e.target.value)} />}</div>}
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-[#5b6b7b]">{text.length}/2000</span><button className={btnPrimary} disabled={busy || !text.trim() || (urgent && why.trim().length < 3)} onClick={send}><Send className="h-4 w-4" />Send</button></div>
          </div>
        ) : <Note>{t.status === 'closed' ? 'This conversation is closed. Reopen it to write again.' : 'You cannot write in this conversation right now.'}</Note>}
        {rm && <RemoveMessage m={rm} id={id} onClose={() => setRm(null)} onDone={() => { setRm(null); g.reload(); }} />}
        {dl && <Modal wide title="Delivery of notifications" onClose={() => setDl(null)}>{dl.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing has been sent for this conversation yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-[#5b6b7b]"><th className="py-1 pe-2">To</th><th className="pe-2">How</th><th className="pe-2">State</th><th>Detail</th></tr></thead><tbody>{dl.map((x) => <tr key={x._id} className="border-t border-[#e3e7e7]"><td className="py-1 pe-2">{x.recipientRole}</td><td className="pe-2">{x.channel === 'push' ? 'Phone alert' : 'In the app'}</td><td className="pe-2"><Pill value={x.state === 'sent' ? 'Active' : x.state === 'deferred' ? 'Pending' : x.state === 'failed' ? 'Suspended' : 'None'}>{{ sent: 'Sent', deferred: 'Held for quiet hours', failed: 'Failed', skipped: 'Not sent' }[x.state] || x.state}</Pill></td><td className="text-xs text-[#5b6b7b]">{x.state === 'deferred' ? `until ${when(x.deferUntil)}` : x.state === 'failed' ? `${x.attempts} tries` : x.reason || (x.bypassedQuiet ? 'sent in quiet hours (urgent)' : '')}</td></tr>)}</tbody></table></div>}</Modal>}
      </div>)}</Loading>
  );
}
function RemoveMessage({ m, id, onClose, onDone }) {
  const [why, setWhy] = useState('');
  return (
    <Modal title="Remove this message" onClose={onClose}>
      <p className="mb-3 rounded-lg bg-[#f1f2f2] p-3 text-sm" dir="auto">{m.text}</p>
      <Field label="Reason (the family can see it)"><input className={inputCls} maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnDanger} disabled={why.trim().length < 3} onClick={() => call(() => apiClient.post(`/comms/threads/${id}/messages/${m._id}/remove`, { reason: why }), 'Message removed', onDone)}>Remove</button></div>
    </Modal>
  );
}

// Start a new conversation. A parent picks the child and who to write to; staff pick the child and the family.
export function Compose({ role, onClose, onStarted, preset }) {
  const kids = useGet(role === 'parent' ? '/comms/family/children' : '/comms/students', role === 'parent' ? undefined : { q: '' }); const [q, setQ] = useState(''); const [found, setFound] = useState([]); const [kid, setKid] = useState(preset?.studentId || ''); const [to, setTo] = useState('office'); const [parentId, setParentId] = useState(''); const [contacts, setContacts] = useState([]); const [subject, setSubject] = useState(''); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const key = useRef(newKey());
  const children = kids.data?.children || [];
  useEffect(() => { if (role === 'parent' && !kid) { const c = children.find((x) => x.canMessage); if (c) setKid(c._id); } }, [children]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (role === 'parent' && kid) apiClient.get('/comms/contacts', { params: { studentId: kid } }).then((r) => { setContacts(r.data.contacts || []); setTo('office'); }).catch(() => setContacts([])); }, [kid, role]);
  const search = async () => { if (q.trim().length < 2) return; const r = await call(() => apiClient.get('/comms/students', { params: { q } })); if (r) setFound(r.data.students || []); };
  const chosen = found.find((s) => s._id === kid);
  const go = async () => {
    setBusy(true);
    const r = await call(() => apiClient.post('/comms/threads', { studentId: kid, to: role === 'parent' ? to : undefined, parentId: role === 'parent' ? undefined : parentId, subject: subject || undefined, text, clientKey: key.current }), (x) => (x.data.existing ? 'Added to your existing conversation' : 'Conversation started'));
    setBusy(false); if (r) onStarted(r.data.thread);
  };
  const ready = kid && text.trim() && (role === 'parent' || parentId);
  return (
    <Modal wide title="New message" onClose={onClose}>
      <div className="grid gap-3">
        {role === 'parent' ? (
          <Loading g={kids}>
            <Field label="About which child"><select className={inputCls} value={kid} onChange={(e) => setKid(e.target.value)}>{children.map((c) => <option key={c._id} value={c._id} disabled={!c.canMessage}>{c.name}{c.className ? ` (${c.className})` : ''}{c.canMessage ? '' : ' — messages are off'}</option>)}</select></Field>
            <Field label="Write to"><select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>{contacts.map((c) => <option key={c.id} value={c.kind === 'office' ? 'office' : c.id}>{c.kind === 'office' ? 'School office' : `Teacher: ${c.name}`}</option>)}</select></Field>
          </Loading>
        ) : (
          <>
            <div className="flex gap-2"><label className="sr-only" htmlFor="cm-find">Find a child</label><input id="cm-find" className={inputCls} placeholder="Find a child by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} /><button className={btnGhost} onClick={search}>Search</button></div>
            {found.length > 0 && <Field label="Child"><select className={inputCls} value={kid} onChange={(e) => { setKid(e.target.value); setParentId(''); }}><option value="">Choose a child</option>{found.map((s) => <option key={s._id} value={s._id}>{s.name}{s.studentId ? ` (${s.studentId})` : ''}</option>)}</select></Field>}
            {chosen && (chosen.parents.length === 0 ? <Note tone="warn">No parent of this child can be messaged. They may have turned messages off or be restricted from contact.</Note> : <Field label="Family member"><select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">Choose who to write to</option>{chosen.parents.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>)}
          </>
        )}
        <Field label="Subject (optional)"><input dir="auto" className={inputCls} maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><textarea dir="auto" className={`${inputCls} min-h-[110px]`} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !ready} onClick={go}><Send className="h-4 w-4" />Send</button></div>
      </div>
    </Modal>
  );
}

// The inbox. Admins can switch between the office inbox and the teachers' conversations (reading those is audited).
export default function Conversations({ role, onChanged }) {
  const [box, setBox] = useState('all'); const [scope, setScope] = useState('office'); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null); const [compose, setCompose] = useState(false);
  const params = { box, q: q || undefined, page, limit: 20, ...(role === 'admin' ? { scope } : {}) };
  const g = useGet('/comms/threads', params); const list = g.data?.threads || []; const total = g.data?.total || 0;
  const refresh = () => { g.reload(); onChanged && onChanged(); };
  if (open) return <Thread id={open} role={role} onBack={() => { setOpen(null); refresh(); }} onChanged={onChanged} />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs label="Inbox" value={box} onChange={(v) => { setBox(v); setPage(1); }} items={[['all', 'Open'], ['unread', 'Unread'], ...(role !== 'parent' ? [['waiting', 'Needs a reply']] : []), ['closed', 'Closed']]} />
        <div className="ms-auto flex gap-2"><label className="sr-only" htmlFor="cm-q">Search conversations</label><input id="cm-q" className={`${inputCls} w-44`} placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><button className={btnPrimary} onClick={() => setCompose(true)}><Send className="h-4 w-4" />New message</button></div>
      </div>
      {role === 'admin' && <div className="flex items-center gap-2 text-sm"><span className="text-[#5b6b7b]">Show</span><Tabs label="Whose conversations" value={scope} onChange={(v) => { setScope(v); setPage(1); }} items={[['office', 'School office'], ['teachers', 'Teachers\' conversations']]} />{scope === 'teachers' && <span className="inline-flex items-center gap-1 text-xs text-[#5b6b7b]"><Lock className="h-3 w-3" />Reading these is recorded</span>}</div>}
      <Loading g={g}>
        {list.length === 0 ? <Card><EmptyState title={box === 'closed' ? 'No closed conversations' : 'Nothing here yet'} text={role === 'parent' ? 'Use New message to write to the school office or a teacher.' : 'Messages from families appear here.'} /></Card> : (
          <ul className="grid gap-2" aria-label="Conversations">
            {list.map((t) => (
              <li key={t._id}><button className="w-full rounded-xl border border-[#e3e7e7] bg-white p-3 text-start hover:bg-[#f7f6f2]" onClick={() => setOpen(t._id)}>
                <div className="flex flex-wrap items-center gap-2"><b className="truncate" dir="auto">{role === 'parent' ? t.teacherName : t.parentName}</b><span className="text-xs text-[#5b6b7b]">about {t.studentName}{role === 'admin' && scope === 'teachers' ? ` · ${t.teacherName}` : ''}</span><span className="ms-auto text-xs text-[#5b6b7b]">{when(t.lastAt)}</span>{t.unread && <Unread n="new" />}</div>
                <div className="mt-0.5 truncate text-sm" dir="auto">{t.subject}</div><div className="truncate text-xs text-[#5b6b7b]" dir="auto">{t.lastPreview}</div>
                {role !== 'parent' && t.waitingOn === 'school' && <div className="mt-1"><Pill value={t.overdueAt ? 'Suspended' : 'Pending'}>{t.overdueAt ? 'Reply is late' : 'Needs a reply'}</Pill></div>}
              </button></li>))}
          </ul>)}
      </Loading>
      {total > 20 && <div className="flex items-center justify-center gap-3 text-sm"><button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / 20)}</span><button className={btnGhost} disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>Next</button></div>}
      {compose && <Compose role={role} onClose={() => setCompose(false)} onStarted={(t) => { setCompose(false); setOpen(t._id); }} />}
    </div>
  );
}
