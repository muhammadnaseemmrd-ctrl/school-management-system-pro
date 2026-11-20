import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs } from '../early/earlyKit';

const when = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const TONE = { granted: 'Approved', withdrawn: 'Suspended', expired: 'Pending', none: 'None' };
const WORD = { granted: 'Given', withdrawn: 'Withdrawn', expired: 'Ended', none: 'No answer' };
const METHOD = { portal: 'Parent portal', paper: 'Paper form', 'in-person': 'In person', phone: 'By phone' };

function ChildPicker({ onPick }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]);
  const find = async (v) => { setQ(v); if (v.trim().length < 2) { setRows([]); return; } try { const r = await apiClient.get('/students', { params: { search: v.trim(), limit: 8 } }); setRows(r.data.students || []); } catch { setRows([]); } };
  return (<Field label="Child" hint="Type at least two letters of the name"><div><input autoFocus className={inputCls} value={q} onChange={(e) => find(e.target.value)} />
    {rows.length > 0 && <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[#e3e7e7]">{rows.map((c) => <li key={c._id}><button type="button" className="w-full px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]" onClick={() => onPick(c)}>{c.name}{c.classId?.standard ? ` · ${c.classId.standard}-${c.classId.division}` : ''}</button></li>)}</ul>}</div></Field>);
}

// School office view of the consent register (PRD E01).
export default function Consents() {
  const [view, setView] = useState('summary'); const [purpose, setPurpose] = useState(''); const [form, setForm] = useState(null); const [hist, setHist] = useState(null); const [busy, setBusy] = useState(false);
  const sum = useGet('/consents/summary'); const list = useGet('/consents', { purpose: purpose || undefined, limit: 50 }); const pend = useGet('/consents/pending', { purpose: purpose || 'photo_media' });
  const pur = useGet('/consents/purposes');
  const reload = () => { sum.reload(); list.reload(); pend.reload(); };
  const childPurposes = (pur.data?.purposes || []).filter((p) => p.subjects.includes('student'));
  const openForm = (over = {}) => setForm({ subjectType: 'student', subjectId: '', purpose: purpose || 'photo_media', givenByName: '', givenByRelation: 'parent', method: 'paper', evidenceNote: '', ...over });
  const save = async () => { setBusy(true); const r = await call(() => apiClient.post('/consents', form), 'Consent recorded', reload); setBusy(false); if (r) setForm(null); };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5" /> Consent register</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#5b6b7b]">Who agreed to what, on which wording, when, and how. Nothing is ever overwritten: a new answer adds a row and the old one stays as history. No answer always means no.</p></div>
          <button className={btnPrimary} onClick={() => openForm()}>Record a consent</button>
        </div>
      </Card>
      <Tabs label="Consent views" value={view} onChange={setView} items={[['summary', 'Overview'], ['register', 'Register'], ['pending', 'Not answered yet']]} />

      {view === 'summary' && <Loading g={sum}><div className="grid gap-3 md:grid-cols-2">
        {(sum.data?.purposes || []).map((p) => (
          <Card key={p.key}><p className="font-semibold">{p.label}</p><p className="text-xs text-[#5b6b7b]">Wording version {p.version} · asked about {p.subjects.join(' / ')}s</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm"><Pill value="Approved">{p.granted} given</Pill><Pill value="Suspended">{p.withdrawn} withdrawn</Pill>{p.expired > 0 && <Pill value="Pending">{p.expired} ended</Pill>}{p.unanswered != null && <Pill value="None">{p.unanswered} not answered</Pill>}</div>
            <div className="mt-3 flex gap-2"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => { setPurpose(p.key); setView('register'); }}>See the register</button>
              {p.unanswered > 0 && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => { setPurpose(p.key); setView('pending'); }}>Who has not answered</button>}</div></Card>))}
      </div></Loading>}

      {view === 'register' && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-semibold" htmlFor="cpur">Show</label>
          <select id="cpur" className={`${inputCls} !w-auto`} value={purpose} onChange={(e) => setPurpose(e.target.value)}><option value="">Every purpose</option>{(pur.data?.purposes || []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
        <Card className="overflow-x-auto !p-0"><Loading g={list}>
          {(list.data?.consents || []).length === 0 ? <EmptyState title="Nothing recorded yet" text="Record a consent from a paper form, or ask parents to answer in their portal." /> : (
            <table className="w-full min-w-[720px] text-start text-sm"><tbody>{list.data.consents.map((c) => (
              <tr key={c._id} className="border-b border-[#e3e7e7]/60 last:border-0">
                <td className="px-4 py-3"><p className="font-semibold">{c.subjectName}</p><p className="text-xs text-[#5b6b7b]">{c.label}</p></td>
                <td className="px-4 py-3"><Pill value={TONE[c.state]}>{WORD[c.state]}</Pill></td>
                <td className="px-4 py-3 text-xs">{when(c.createdAt)} · {METHOD[c.method] || c.method}<p className="text-[#5b6b7b]">{c.givenByName}{c.givenByRelation ? ` (${c.givenByRelation})` : ''} · wording {c.version}</p>{c.reason && <p className="text-[#5b6b7b]">Reason: {c.reason}</p>}</td>
                <td className="px-4 py-3 text-end"><div className="flex justify-end gap-1">
                  <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={async () => { const r = await call(() => apiClient.get('/consents/history', { params: { subjectType: c.subjectType, subjectId: c.subjectId, purpose: c.purpose } })); if (r) setHist(r.data); }}>History</button>
                  {c.state === 'granted' && <button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setForm({ withdraw: true, subjectType: c.subjectType, subjectId: c.subjectId, subjectName: c.subjectName, purpose: c.purpose, method: 'in-person', reason: '' })}>Withdraw</button>}</div></td></tr>))}</tbody></table>)}
        </Loading></Card></div>}

      {view === 'pending' && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-semibold" htmlFor="ppur">Purpose</label>
          <select id="ppur" className={`${inputCls} !w-auto`} value={purpose || 'photo_media'} onChange={(e) => setPurpose(e.target.value)}>{childPurposes.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
        <Card className="!p-0"><Loading g={pend}>{(pend.data?.students || []).length === 0 ? <EmptyState title="Every child has an answer" /> : (
          <><p className="border-b border-[#e3e7e7] px-4 py-3 text-sm font-semibold">{pend.data.total} {pend.data.total === 1 ? 'child has' : 'children have'} not answered{pend.data.total > pend.data.students.length ? ` (first ${pend.data.students.length} shown)` : ''}</p>
            <ul className="divide-y divide-[#e3e7e7]/60">{pend.data.students.map((s) => (
              <li key={s._id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm"><span><b>{s.name}</b> <span className="text-xs text-[#5b6b7b]">{s.className}</span></span>
                <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => openForm({ subjectId: s._id, subjectName: s.name, purpose: purpose || 'photo_media' })}>Record answer</button></li>))}</ul></>)}</Loading></Card></div>}

      {form && !form.withdraw && <Modal title="Record a consent" onClose={() => setForm(null)}>
        <div className="space-y-3">
          <p className="rounded-lg bg-[#eef2f8] px-3 py-2 text-xs text-[#234c91]">Use this for an answer you received on paper, in person or by phone. Answers parents give in their portal are recorded automatically.</p>
          {form.subjectName && <p className="text-sm">For <b>{form.subjectName}</b></p>}
          {!form.subjectId && <ChildPicker onPick={(c) => setForm({ ...form, subjectId: c._id, subjectName: c.name })} />}
          <Field label="What for"><select className={inputCls} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>{childPurposes.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
          <p className="text-xs text-[#5b6b7b]">{childPurposes.find((p) => p.key === form.purpose)?.detail}</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Who agreed"><input className={inputCls} value={form.givenByName} onChange={(e) => setForm({ ...form, givenByName: e.target.value })} /></Field>
            <Field label="Relation"><input className={inputCls} value={form.givenByRelation} onChange={(e) => setForm({ ...form, givenByRelation: e.target.value })} /></Field></div>
          <Field label="How"><select className={inputCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="paper">Paper form</option><option value="in-person">In person</option><option value="phone">By phone</option></select></Field>
          <Field label="Note" hint="For example the form number"><input className={inputCls} value={form.evidenceNote} onChange={(e) => setForm({ ...form, evidenceNote: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setForm(null)}>Cancel</button><button disabled={busy || !form.subjectId || form.givenByName.trim().length < 2} className={btnPrimary} onClick={save}>Save consent</button></div>
        </div></Modal>}

      {form && form.withdraw && <Modal title="Withdraw consent" onClose={() => setForm(null)}>
        <p className="mb-3 text-sm">Withdrawing takes effect straight away for <b>{form.subjectName}</b>. The earlier record stays as history.</p>
        <div className="space-y-3"><Field label="How was it withdrawn"><select className={inputCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="in-person">In person</option><option value="phone">By phone</option><option value="paper">Paper form</option></select></Field>
          <Field label="Reason (optional)"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field></div>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setForm(null)}>Cancel</button>
          <button disabled={busy} className={btnDanger} onClick={async () => { setBusy(true); const r = await call(() => apiClient.post('/consents/withdraw', { subjectType: form.subjectType, subjectId: form.subjectId, purpose: form.purpose, method: form.method, reason: form.reason }), 'Consent withdrawn', reload); setBusy(false); if (r) setForm(null); }}>Withdraw</button></div></Modal>}

      {hist && <Modal title={`History: ${hist.subject.name}`} onClose={() => setHist(null)} wide>
        <ul className="divide-y divide-[#e3e7e7]">{hist.history.map((h) => (
          <li key={h._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-semibold">{h.label} <Pill value={TONE[h.state]}>{h.status === 'withdrawn' ? 'Withdrawn' : h.isCurrent ? WORD[h.state] : 'Replaced'}</Pill></p>
            <p className="text-xs text-[#5b6b7b]">{when(h.createdAt)} · {METHOD[h.method] || h.method} · {h.givenByName || 'unknown'} · wording {h.version}{h.evidenceNote ? ` · ${h.evidenceNote}` : ''}{h.reason ? ` · ${h.reason}` : ''}</p></div>
            <span className="text-xs text-[#5b6b7b]">recorded by {h.recordedByName || 'system'}</span></li>))}</ul>
        <div className="mt-4 flex justify-end"><button className={btnGhost} onClick={() => setHist(null)}>Close</button></div></Modal>}
      {list.error && <Note tone="warn">{list.error}</Note>}
    </div>
  );
}

// What a parent sees: each child and themselves, with a clear way to say yes or take it back.
export function FamilyConsent() {
  const g = useGet('/consents/mine'); const [busy, setBusy] = useState(false);
  const act = async (fn, ok) => { setBusy(true); await call(fn, ok, g.reload); setBusy(false); };
  return (
    <Loading g={g}><div className="space-y-5">
      <Card><h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5" /> Permissions and consent</h2>
        <p className="mt-1 text-sm text-[#5b6b7b]">You decide what the school may do. If you have not answered, the school treats it as no. You can change your mind at any time and it takes effect straight away.</p></Card>
      {(g.data?.people || []).map((p) => (
        <Card key={`${p.type}-${p._id}`}><h3 className="font-bold">{p.type === 'parent' ? 'For you' : p.name}</h3>
          <ul className="mt-2 divide-y divide-[#e3e7e7]/70">{p.answers.map((a) => {
            const d = g.data.purposes.find((x) => x.key === a.purpose);
            return (<li key={a.purpose} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="max-w-md"><p className="font-semibold">{a.label}</p><p className="text-xs text-[#5b6b7b]">{d?.detail}</p>
                <p className="mt-1 text-xs"><Pill value={TONE[a.state]}>{WORD[a.state]}</Pill>{a.since ? <span className="ms-2 text-[#5b6b7b]">since {when(a.since)}</span> : null}{a.state === 'granted' && a.version !== a.currentVersion ? <span className="ms-2 text-[#8a4636]">the wording has changed since</span> : null}</p></div>
              {g.data.canAnswer && (a.state === 'granted'
                ? <button disabled={busy} className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => act(() => apiClient.post('/consents/mine/withdraw', { subjectType: p.type, subjectId: p._id, purpose: a.purpose }), 'Taken back')}>Take back</button>
                : <button disabled={busy} className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => act(() => apiClient.post('/consents/mine', { subjectType: p.type, subjectId: p._id, purpose: a.purpose }), 'Thank you, saved')}>{a.state === 'none' ? 'Allow' : 'Allow again'}</button>)}</li>);
          })}</ul></Card>))}
      {(g.data?.people || []).length === 0 && !g.loading && <EmptyState title="Nothing to answer yet" />}
    </div></Loading>
  );
}
