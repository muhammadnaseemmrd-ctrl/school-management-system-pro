import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { UserPlus, CalendarClock, AlertTriangle, CheckCircle2, Circle, Copy } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, Stat, EmptyState, TableSkeleton, btnGhost, btnPrimary, btnDanger, inputCls, fmtDate, errMsg } from '../../components/ui';

const STAGE_TONE = { New: 'Pending', Documents: 'Pending', Interview: 'Pending', Waitlisted: 'None', Offered: 'Active', Accepted: 'Active', Enrolled: 'Active', Rejected: 'Suspended', Withdrawn: 'Suspended' };
const SOURCES = ['walk-in', 'phone', 'website', 'referral', 'social', 'event', 'other'];
const yearNow = () => { const d = new Date(); return d.getMonth() >= 6 ? `${d.getFullYear()}-${d.getFullYear() + 1}` : `${d.getFullYear() - 1}-${d.getFullYear()}`; };
const useList = (path, key, params) => {
  const [s, setS] = useState({ rows: [], pagination: null, loading: true, error: '' }); const [page, setPage] = useState(1); const q = JSON.stringify(params || {});
  const load = useCallback(async () => { setS((x) => ({ ...x, loading: true })); try { const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } }); setS({ rows: r.data[key] || [], pagination: r.data.pagination, loading: false, error: '' }); } catch (e) { setS((x) => ({ ...x, loading: false, error: errMsg(e, 'Could not load') })); } }, [path, key, page, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);
  return { ...s, setPage, reload: load };
};

const NewApplication = ({ onClose, onDone, inquiry }) => {
  const [f, setF] = useState({ name: '', dob: '', gender: '', grade: '', year: yearNow(), gName: inquiry?.contactName || '', gPhone: inquiry?.phone || '', gEmail: inquiry?.email || '', rel: 'Father', source: 'walk-in', prev: '' });
  const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post('/admissions/applications', { inquiryId: inquiry?._id, academicYear: f.year, gradeSought: f.grade, source: f.source, child: { name: f.name, dateOfBirth: f.dob || undefined, gender: f.gender, previousSchool: f.prev }, guardian: { name: f.gName, phone: f.gPhone, email: f.gEmail, relationship: f.rel } });
      toast.success(r.data.possibleDuplicates ? `Saved. ${r.data.possibleDuplicates} possible duplicate to check.` : 'Application saved'); onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={inquiry ? `Application for ${inquiry.contactName}'s family` : 'New application'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Child's full name"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Date of birth"><input type="date" className={inputCls} value={f.dob} onChange={set('dob')} /></Field>
        <Field label="Grade applied for"><input className={inputCls} value={f.grade} onChange={set('grade')} placeholder="For example 1 or Nursery" /></Field>
        <Field label="Academic year"><input className={inputCls} value={f.year} onChange={set('year')} /></Field>
        <Field label="Gender"><select className={inputCls} value={f.gender} onChange={set('gender')}><option value="">Not stated</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
        <Field label="Previous school"><input className={inputCls} value={f.prev} onChange={set('prev')} /></Field>
        <Field label="Guardian name"><input className={inputCls} value={f.gName} onChange={set('gName')} /></Field>
        <Field label="Relationship"><select className={inputCls} value={f.rel} onChange={set('rel')}><option>Father</option><option>Mother</option><option>Guardian</option></select></Field>
        <Field label="Guardian phone"><input className={inputCls} value={f.gPhone} onChange={set('gPhone')} /></Field>
        <Field label="Guardian email" hint="Used to create the parent login at enrollment"><input type="email" className={inputCls} value={f.gEmail} onChange={set('gEmail')} /></Field>
        {!inquiry && <Field label="How did they hear about the school?"><select className={inputCls} value={f.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button disabled={busy || !f.name.trim() || !f.grade.trim()} className={btnPrimary} onClick={save}>Save application</button></div>
    </Modal>
  );
};

const Detail = ({ id, onClose, onChanged }) => {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null); const [done, setDone] = useState(null);
  const load = useCallback(() => apiClient.get(`/admissions/applications/${id}`).then((r) => { setD(r.data); setErr(''); }).catch((e) => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); if (ok) toast.success(ok); await load(); onChanged(); return r; } catch (e) { toast.error(errMsg(e)); return null; } finally { setBusy(false); } };
  if (err) return <Modal title="Application" onClose={onClose}><EmptyState title={err} /></Modal>;
  if (!d) return <Modal title="Application" onClose={onClose} wide><div className="skeleton h-40" /></Modal>;
  const a = d.application; const open = !['Enrolled', 'Rejected', 'Withdrawn'].includes(a.stage);
  const pending = a.duplicateFlags.filter((x) => x.resolution === 'pending');
  const stage = (to, extra = {}) => run(() => apiClient.post(`/admissions/applications/${id}/stage`, { stage: to, version: a.version, ...extra }), `Moved to ${to}`);
  return (
    <Modal title={`${a.child.name} · grade ${a.gradeSought}`} onClose={onClose} wide>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-3"><Pill value={STAGE_TONE[a.stage]}>{a.stage}</Pill><span className="text-xs text-[#5b6b7b]">{a.academicYear} · from {d.source ? `${d.source.source}${d.source.sourceDetail ? ` (${d.source.sourceDetail})` : ''}, ${fmtDate(d.source.createdAt)}` : 'unknown source'}</span>
          {a.admissionNumber && <span className="rounded bg-[#edf5f3] px-2 py-0.5 font-mono text-xs text-[#215a52]">{a.admissionNumber}</span>}</div>
        <div className="grid gap-2 rounded-xl bg-[#f7f6f2] p-4 text-xs sm:grid-cols-2">
          <p><b>Guardian:</b> {a.guardian.name} ({a.guardian.relationship})</p><p><b>Phone:</b> {a.guardian.phone || '—'} · <b>Email:</b> {a.guardian.email || '—'}</p>
          <p><b>Born:</b> {a.child.dateOfBirth ? fmtDate(a.child.dateOfBirth) : '—'} · {a.child.gender || 'gender not stated'}</p><p><b>Interview:</b> {a.interviewAt ? new Date(a.interviewAt).toLocaleString('en-GB') : 'not booked'}</p>
        </div>

        {pending.length > 0 && <div className="rounded-xl border border-[#ecc7b9] bg-[#fbf0ec] p-4"><p className="mb-2 flex items-center gap-2 font-semibold text-[#8a4636]"><AlertTriangle className="h-4 w-4" /> Possible duplicate. A person must decide before an offer.</p>
          {pending.map((x) => (<div key={x.kind + x.refId} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ecc7b9] py-2 first:border-0"><p className="text-xs"><b>{x.refName}</b> ({x.kind}). {x.reason}</p>
            <div className="flex gap-1.5"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setAsk({ title: 'This is a different child', body: { kind: x.kind, refId: x.refId, resolution: 'not-duplicate' } })}>Different child</button>
              <button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setAsk({ title: 'Same child, merge and withdraw this application', body: { kind: x.kind, refId: x.refId, resolution: 'duplicate' } })}>Same child</button></div></div>))}</div>}

        <section><h4 className="mb-2 font-semibold">Documents</h4>
          <ul className="divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7]">{a.checklist.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2 px-3 py-2"><span className="flex items-center gap-2 text-xs">{c.verifiedAt ? <CheckCircle2 className="h-4 w-4 text-[#2c776c]" /> : <Circle className="h-4 w-4 text-[#8a97a3]" />}{c.label}{c.required ? '' : <i className="text-[#5b6b7b]"> optional</i>}{c.verifiedAt && <span className="text-[#5b6b7b]">· checked by {c.verifiedByName || 'staff'}</span>}</span>
              {open && <button className={`${btnGhost} !px-2.5 !py-1 !text-[11px]`} disabled={busy} onClick={() => run(() => apiClient.post(`/admissions/applications/${id}/checklist/${c.key}`, { verified: !c.verifiedAt }))}>{c.verifiedAt ? 'Undo' : 'Mark checked'}</button>}</li>))}</ul></section>

        <section><h4 className="mb-2 font-semibold">Seats for grade {a.gradeSought}</h4>
          <p className="text-xs text-[#3b4a5c]">{d.seats.limited ? `${d.seats.used} of ${d.seats.seats} seats are held · ${d.seats.available} free` : 'No seat limit has been set for this grade.'}{d.seats.queuePosition ? ` · waitlist position ${d.seats.queuePosition} of ${d.seats.waiting}` : ''}</p>
          {d.feePreview && <p className="mt-1 text-xs text-[#3b4a5c]">First-fee preview: Rs {d.feePreview.totalAmount.toLocaleString('en-PK')} a year, {d.feePreview.installments} installments of Rs {d.feePreview.perInstallment.toLocaleString('en-PK')}.</p>}</section>

        <section><h4 className="mb-2 font-semibold">What happens next</h4>
          <div className="flex flex-wrap gap-2">
            {d.nextStages.filter((s) => !['Rejected', 'Withdrawn'].includes(s)).map((s) => (
              <button key={s} disabled={busy} className={s === 'Waitlisted' ? btnGhost : btnPrimary} onClick={() => (s === 'Interview' ? setAsk({ title: 'Book the interview', stage: s, withTime: true }) : s === 'Offered' && a.stage === 'Waitlisted' ? setAsk({ title: 'Offer a seat', stage: s, skip: true }) : stage(s))}>{s === 'Offered' ? 'Offer a seat' : s === 'Interview' ? 'Book interview' : s === 'Accepted' ? 'Family accepted' : s === 'Waitlisted' ? 'Join waitlist' : `Move to ${s}`}</button>))}
            {a.stage === 'Accepted' && <button disabled={busy} className={btnPrimary} onClick={async () => { const r = await run(() => apiClient.post(`/admissions/applications/${id}/enroll`, {}), 'Enrolled'); if (r) setDone(r.data); }}><UserPlus className="h-4 w-4" /> Enroll</button>}
            {d.nextStages.includes('Rejected') && <button className={btnDanger} onClick={() => setAsk({ title: 'Reject this application', stage: 'Rejected', need: true })}>Reject</button>}
            {d.nextStages.includes('Withdrawn') && <button className={btnDanger} onClick={() => setAsk({ title: 'Withdraw this application', stage: 'Withdrawn', need: true })}>Withdraw</button>}
            {!d.nextStages.length && <p className="text-xs text-[#5b6b7b]">This application is finished.</p>}
          </div></section>

        <section><h4 className="mb-2 font-semibold">History</h4><ul className="space-y-1 text-xs text-[#3b4a5c]">{[...a.stageHistory].reverse().map((h, i) => <li key={i}><b>{h.stage}</b> · {new Date(h.at).toLocaleString('en-GB')}{h.byName ? ` · ${h.byName}` : ''}{h.note ? `. ${h.note}` : ''}</li>)}</ul></section>
      </div>

      {ask && <AskModal ask={ask} onClose={() => setAsk(null)} onGo={async ({ note, at, skip }) => {
        const r = ask.body ? await run(() => apiClient.post(`/admissions/applications/${id}/duplicates`, { ...ask.body, note }), 'Decision saved') : await run(() => apiClient.post(`/admissions/applications/${id}/stage`, { stage: ask.stage, version: a.version, note, interviewAt: at || undefined, skipQueueReason: skip || undefined }), `Moved to ${ask.stage}`);
        if (r) { setAsk(null); if (r.data?.nextInLine) toast(`${r.data.nextInLine} is next on the waitlist`); } }} />}
      {done && <Modal title="Enrolled" onClose={() => setDone(null)}>
        <p className="text-sm">{done.student.name} is now in class {done.student.class} with admission number <b>{done.student.admissionNumber}</b>.</p>
        <div className="mt-3 space-y-2 rounded-xl bg-[#f7f6f2] p-4 font-mono text-xs"><p>Student login: {done.student.email}</p><p>Password: {done.student.temporaryPassword}</p>{done.guardian && <><p>Parent login: {done.guardian.email}</p><p>{done.guardian.temporaryPassword ? `Password: ${done.guardian.temporaryPassword}` : 'Existing parent account linked'}</p></>}</div>
        <p className="mt-3 text-xs text-[#8a4636]">Write these down or send them now. They are not shown again.</p>
        <div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={() => setDone(null)}>Done</button></div></Modal>}
    </Modal>
  );
};

const AskModal = ({ ask, onClose, onGo }) => {
  const [note, setNote] = useState(''); const [at, setAt] = useState(''); const [skip, setSkip] = useState('');
  return (
    <Modal title={ask.title} onClose={onClose}>
      <div className="space-y-3">
        {ask.withTime && <Field label="Interview date and time"><input type="datetime-local" className={inputCls} value={at} onChange={(e) => setAt(e.target.value)} /></Field>}
        {ask.skip && <Field label="Skipping the waitlist order? Write why" hint="Leave empty if this child is first in line"><input className={inputCls} value={skip} onChange={(e) => setSkip(e.target.value)} /></Field>}
        <Field label={ask.need || ask.body ? 'Reason or how you checked' : 'Note (optional)'}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={ask.need ? btnDanger : btnPrimary} disabled={(ask.need || ask.body) && note.trim().length < 3} onClick={() => onGo({ note, at: at ? new Date(at).toISOString() : '', skip })}>Confirm</button></div>
      </div>
    </Modal>
  );
};

const Seats = () => {
  const [year, setYear] = useState(yearNow()); const [d, setD] = useState(null); const [err, setErr] = useState(''); const [edit, setEdit] = useState({});
  const load = useCallback(() => apiClient.get('/admissions/capacity', { params: { year } }).then((r) => { setD(r.data); setErr(''); }).catch((e) => setErr(errMsg(e))), [year]);
  useEffect(() => { load(); }, [load]);
  const save = async (grade) => { try { await apiClient.put('/admissions/capacity', { academicYear: year, gradeSought: grade, seats: Number(edit[grade]) }); toast.success('Seats saved'); setEdit({ ...edit, [grade]: undefined }); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (err) return <EmptyState title={err} />;
  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between gap-3 border-b border-[#e3e7e7] p-4"><div><h3 className="font-semibold">Seats by grade</h3><p className="text-xs text-[#5b6b7b]">A seat is held from the moment an offer is made. With no limit set, any number can be offered.</p></div>
        <input className={`${inputCls} !w-36`} value={year} onChange={(e) => setYear(e.target.value)} /></div>
      {!d ? <TableSkeleton cols={5} rows={3} /> : d.grades.length === 0 ? <EmptyState title="No grades yet" text="Create classes or take an application and the grades will appear here." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-start text-sm"><thead className="bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{['Grade', 'Seats', 'Held', 'Free', 'Waiting', 'Open applications'].map((h) => <th key={h} className="px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody>{d.grades.map((g) => (<tr key={g.grade} className="border-b border-[#e3e7e7]/60 last:border-0"><td className="px-4 py-2.5 font-semibold">{g.grade}</td>
            <td className="px-4 py-2.5"><div className="flex items-center gap-2"><input type="number" min="0" className={`${inputCls} !w-20 !py-1.5`} placeholder="no limit" value={edit[g.grade] ?? (g.seats ?? '')} onChange={(e) => setEdit({ ...edit, [g.grade]: e.target.value })} />{edit[g.grade] !== undefined && edit[g.grade] !== '' && <button className={`${btnPrimary} !px-2.5 !py-1 !text-xs`} onClick={() => save(g.grade)}>Save</button>}</div></td>
            <td className="px-4 py-2.5">{g.used}</td><td className="px-4 py-2.5">{g.available ?? '—'}</td><td className="px-4 py-2.5">{g.waiting}</td><td className="px-4 py-2.5">{g.open}</td></tr>))}</tbody></table></div>)}
    </Card>
  );
};

const Admissions = () => {
  const [tab, setTab] = useState('applications'); const [stage, setStage] = useState(''); const [search, setSearch] = useState('');
  const [sum, setSum] = useState(null); const [openId, setOpenId] = useState(null); const [newApp, setNewApp] = useState(null); const [newInq, setNewInq] = useState(false);
  const apps = useList('/admissions/applications', 'applications', { stage: stage || undefined, search: search || undefined });
  const inqs = useList('/admissions/inquiries', 'inquiries', { search: search || undefined });
  const loadSum = useCallback(() => apiClient.get('/admissions/summary').then((r) => setSum(r.data)).catch(() => {}), []);
  useEffect(() => { loadSum(); }, [loadSum]);
  const refresh = () => { apps.reload(); inqs.reload(); loadSum(); };
  const [f, setF] = useState({ contactName: '', phone: '', email: '', source: 'walk-in', note: '', nextFollowUpOn: '' });

  return (
    <div className="page-ready space-y-6">
      <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><UserPlus className="h-5 w-5" /> Admissions</h2><p className="mt-1 max-w-2xl text-sm text-[#5b6b7b]">From first inquiry to enrolled student. Every application keeps its source, possible duplicates need a person's decision, and a seat is held from the moment an offer is made.</p></div>
        <div className="flex gap-2"><button className={btnGhost} onClick={() => setNewInq(true)}>New inquiry</button><button className={btnPrimary} onClick={() => setNewApp({})}>New application</button></div></div></Card>

      {sum && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Open inquiries" value={sum.openInquiries} /><Stat label="In progress" value={['New', 'Documents', 'Interview', 'Offered', 'Accepted'].reduce((n, s) => n + sum.stages[s], 0)} /><Stat label="Waitlisted" value={sum.stages.Waitlisted} /><Stat label="Enrolled" value={sum.stages.Enrolled} /></div>}
      {sum && sum.followUpsDue.length > 0 && <Card><h3 className="mb-2 flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" /> Follow-ups due</h3><ul className="divide-y divide-[#e3e7e7] text-sm">{sum.followUpsDue.slice(0, 6).map((x) => <li key={x.kind + x.id} className="flex justify-between py-2"><span><b>{x.name}</b> <span className="text-xs text-[#5b6b7b]">{x.kind} · {x.phone}</span></span><span className="text-xs text-[#8a4636]">due {fmtDate(x.due)}</span></li>)}</ul></Card>}

      <div className="flex flex-wrap items-center gap-2">{[['applications', 'Applications'], ['inquiries', 'Inquiries'], ['seats', 'Seats']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>{l}</button>)}
        {tab !== 'seats' && <input className={`${inputCls} !w-60`} placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />}
        {tab === 'applications' && <select className={`${inputCls} !w-40`} value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{Object.keys(STAGE_TONE).map((s) => <option key={s}>{s}</option>)}</select>}</div>

      {tab === 'applications' && <Card className="overflow-hidden !p-0">{apps.loading ? <TableSkeleton cols={5} /> : apps.error ? <EmptyState title={apps.error} action={<button className={btnGhost} onClick={apps.reload}>Try again</button>} /> : apps.rows.length === 0 ? <EmptyState title="No applications yet" text="Record an inquiry, then start an application from it, or press New application." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-start text-sm"><tbody>{apps.rows.map((a) => (
          <tr key={a._id} className="cursor-pointer border-b border-[#e3e7e7]/60 last:border-0 hover:bg-[#f7f6f2]" onClick={() => setOpenId(a._id)}>
            <td className="px-4 py-3"><p className="font-semibold">{a.child.name}</p><p className="text-xs text-[#5b6b7b]">Grade {a.gradeSought} · {a.academicYear}</p></td>
            <td className="px-4 py-3 text-xs">{a.guardian.name}<p className="text-[#5b6b7b]">{a.guardian.phone}</p></td>
            <td className="px-4 py-3"><Pill value={STAGE_TONE[a.stage]}>{a.stage}</Pill></td>
            <td className="px-4 py-3 text-xs">{a.pendingDuplicates > 0 && <span className="me-2 inline-flex items-center gap-1 text-[#8a4636]"><Copy className="h-3 w-3" />duplicate?</span>}{['New', 'Documents', 'Interview'].includes(a.stage) && a.missingDocs > 0 && <span className="text-[#5b6b7b]">{a.missingDocs} documents to check</span>}</td>
            <td className="px-4 py-3 text-xs text-[#5b6b7b]">{fmtDate(a.createdAt)}</td></tr>))}</tbody></table></div>)}<Pager pagination={apps.pagination} onPage={apps.setPage} /></Card>}

      {tab === 'inquiries' && <Card className="overflow-hidden !p-0">{inqs.loading ? <TableSkeleton cols={5} /> : inqs.rows.length === 0 ? <EmptyState title="No inquiries yet" text="Phone calls, walk-ins and website messages appear here." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-start text-sm"><tbody>{inqs.rows.map((r) => (
          <tr key={r._id} className="border-b border-[#e3e7e7]/60 last:border-0"><td className="px-4 py-3"><p className="font-semibold">{r.contactName}</p><p className="text-xs text-[#5b6b7b]">{r.phone} {r.email}</p></td>
            <td className="px-4 py-3 text-xs">{r.source}{r.sourceDetail ? ` · ${r.sourceDetail}` : ''}<p className="text-[#5b6b7b]">{fmtDate(r.createdAt)}</p></td>
            <td className="px-4 py-3 text-xs">{r.note}</td><td className="px-4 py-3"><Pill value={r.status === 'Open' ? 'Pending' : r.status === 'Applied' ? 'Active' : 'None'}>{r.status}</Pill><p className="text-xs text-[#5b6b7b]">{r.applications} application{r.applications === 1 ? '' : 's'}</p></td>
            <td className="px-4 py-3">{r.status !== 'Closed' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setNewApp(r)}>Add a child</button>}</td></tr>))}</tbody></table></div>)}<Pager pagination={inqs.pagination} onPage={inqs.setPage} /></Card>}

      {tab === 'seats' && <Seats />}

      {newApp && <NewApplication inquiry={newApp._id ? newApp : null} onClose={() => setNewApp(null)} onDone={refresh} />}
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {newInq && <Modal title="New inquiry" onClose={() => setNewInq(false)}><div className="space-y-3">
        <Field label="Contact person"><input className={inputCls} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Source"><select className={inputCls} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Follow up on"><input type="date" className={inputCls} value={f.nextFollowUpOn} onChange={(e) => setF({ ...f, nextFollowUpOn: e.target.value })} /></Field></div>
        <Field label="What did they ask?"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setNewInq(false)}>Cancel</button><button className={btnPrimary} disabled={!f.contactName.trim() || (!f.phone.trim() && !f.email.trim())} onClick={async () => { try { await apiClient.post('/admissions/inquiries', { ...f, nextFollowUpOn: f.nextFollowUpOn || undefined }); toast.success('Inquiry saved'); setNewInq(false); setF({ contactName: '', phone: '', email: '', source: 'walk-in', note: '', nextFollowUpOn: '' }); refresh(); } catch (e) { toast.error(errMsg(e)); } }}>Save</button></div></div></Modal>}
    </div>
  );
};

export default Admissions;
