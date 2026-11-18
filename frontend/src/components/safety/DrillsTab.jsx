import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Stat, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { Tbl, Td, Row, Bar, act, Sub } from '../attendance/deskKit';
import { STATUS_TONE, Reason, Banner, dayTime } from './safetyKit';

const KINDS = ['Fire', 'Earthquake', 'Lockdown', 'Evacuation', 'Emergency'];

// A teacher counts their own class: Safe, Missing (with last seen) or handed to a guardian
const CountClass = ({ drill, onChange }) => {
  const [classes, setClasses] = useState([]); const [busy, setBusy] = useState(false); const [miss, setMiss] = useState(null);
  const load = useCallback(async () => { try { setClasses((await apiClient.get(`/safety/drills/${drill._id}/roster`)).data.classes); } catch (e) { toast.error(errMsg(e)); } }, [drill._id]);
  useEffect(() => { load(); }, [load]);
  const mark = async (classId, marks, allSafe) => { setBusy(true); try { await apiClient.post(`/safety/drills/${drill._id}/muster`, { classId, marks, allSafe }); await load(); onChange?.(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  if (!classes.length) return <EmptyState title="You have no class to count." text="Class head masters count their own class. An administrator can count any class." />;
  return (
    <div className="space-y-4">
      <Banner tone="bad"><b>{drill.title}</b> is running{drill.assemblyPoint ? `. Assemble at ${drill.assemblyPoint}` : ''}. Count every student and mark each one.</Banner>
      {classes.map((c) => (
        <Card key={c.classId} className="!p-0">
          <Bar><b>Class {c.label}</b><span className="text-sm text-[#5b6b7b]">{c.students.filter((s) => s.status === 'Safe' || s.status === 'Released').length} of {c.students.length} accounted for</span><button className={btnPrimary} disabled={busy} onClick={() => mark(c.classId, [], true)}>Mark everyone not yet counted as safe</button></Bar>
          <Tbl head={['Student', 'Status', '']}>{c.students.map((s) => (
            <Row key={s._id}><Td>{s.name}{s.note && <Sub>{s.note}</Sub>}</Td><Td><Pill value={s.status === 'Safe' ? 'Approved' : s.status === 'Missing' ? 'Suspended' : s.status === 'Released' ? 'Active' : 'Pending'}>{s.status === 'Expected' ? 'Not counted yet' : s.status}</Pill></Td>
              <Td cls="whitespace-nowrap text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => mark(c.classId, [{ studentId: s.studentId, status: 'Safe' }])} data-line={s._id}>Safe</button>{' '}<button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setMiss({ c, s })}>Missing</button></Td></Row>))}</Tbl>
        </Card>
      ))}
      {miss && <Reason title={`${miss.s.name} is missing`} label="When and where was the student last seen?" cta="Mark missing" danger onClose={() => setMiss(null)} onSubmit={async (note) => { await mark(miss.c.classId, [{ studentId: miss.s.studentId, status: 'Missing', note }]); setMiss(null); }} />}
    </div>
  );
};

const Detail = ({ id, admin, onClose, onChange }) => {
  const [d, setD] = useState(null); const [fb, setFb] = useState(null); const [close, setClose] = useState(false); const [act2, setAct2] = useState(false);
  const load = useCallback(async () => { try { setD((await apiClient.get(`/safety/drills/${id}`)).data); } catch (e) { toast.error(errMsg(e)); } }, [id]);
  useEffect(() => { load(); const h = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000); return () => clearInterval(h); }, [load]);
  if (!d) return <div className="skeleton h-40" />;
  const dr = d.drill; const c = dr.counts || {}; const open = dr.status === 'Open'; const refresh = () => { load(); onChange?.(); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} onClick={onClose}>Back</button><b>{dr.title}</b><Pill value={STATUS_TONE[dr.status]}>{dr.status}</Pill><span className="text-sm text-[#5b6b7b]">Started {dayTime(dr.startedAt)} by {dr.startedByName}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Expected" value={c.expected} /><Stat label="Safe" value={c.safe} tone="text-[#1f5d52]" /><Stat label="Not counted yet" value={c.unknown} /><Stat label="Missing" value={c.missing} tone={c.missing ? 'text-[#9f1239]' : undefined} /><Stat label="Visitors and contractors" value={`${c.othersSafe ?? 0}/${c.others}`} sub="safe / on site" /></div>
      {admin && open && <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={act(async () => { const r = await apiClient.post(`/safety/drills/${id}/notify-families`, {}); toast.success(`${r.data.familiesNotified} families told`); }, '', refresh)}>Tell families their child is safe</button><button className={btnGhost} onClick={async () => { try { setFb((await apiClient.get(`/safety/drills/${id}/fallback`)).data); } catch (e) { toast.error(errMsg(e)); } }}>Phone list</button><button className={btnPrimary} onClick={() => setClose(true)}>Close drill</button></div>}
      {admin && !open && dr.status === 'Closed' && <button className={btnPrimary} onClick={act(() => apiClient.post(`/safety/drills/${id}/sign`, {}), 'Report signed', refresh)}>Sign the report (a different administrator from the one who closed it)</button>}
      <Card className="!p-0"><Bar><b className="text-sm">By class</b></Bar><Tbl head={['Class', 'Expected', 'Safe', 'Missing', 'Not counted', 'Handed to family']}>{d.classes.map((x) => <Row key={x.classId}><Td>{x.label}</Td><Td>{x.expected}</Td><Td>{x.safe}</Td><Td>{x.missing || ''}</Td><Td>{x.unknown || ''}</Td><Td>{x.released || ''}</Td></Row>)}</Tbl></Card>
      {d.notAccountedFor.length > 0 && <Card className="!p-0"><Bar><b className="text-sm">Not accounted for</b></Bar><Tbl head={['Student', 'Class', 'Status']}>{d.notAccountedFor.map((x) => <Row key={x._id}><Td>{x.name}{x.note && <Sub>{x.note}</Sub>}</Td><Td>{x.classLabel}</Td><Td><Pill value={x.status === 'Missing' ? 'Suspended' : 'Pending'}>{x.status === 'Expected' ? 'Not counted' : x.status}</Pill></Td></Row>)}</Tbl></Card>}
      {d.others.length > 0 && <Card className="!p-0"><Bar><b className="text-sm">Visitors and contractors on site</b></Bar><Tbl head={['Name', 'Kind', 'Status', '']}>{d.others.map((x) => <Row key={x._id}><Td>{x.name}</Td><Td>{x.kind}</Td><Td>{x.status}</Td><Td cls="text-end">{open && x.status !== 'Safe' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/drills/${id}/others/${x._id}`, { status: 'Safe' }), 'Marked safe', refresh)}>Safe</button>}</Td></Row>)}</Tbl></Card>}
      {!open && <Card><div className="text-sm"><b>Summary.</b> {dr.summary}{dr.forceReason && <p className="mt-1 text-[#7f2a1c]"><b>Closed with students not accounted for:</b> {dr.forceReason}</p>}<p className="mt-1 text-[#5b6b7b]">Closed by {dr.closedByName} after {Math.round((dr.durationSeconds || 0) / 60)} min{dr.signedByName ? ` · signed by ${dr.signedByName}` : ''}</p></div></Card>}
      {admin && <Card className="!p-0"><Bar><b className="text-sm">Follow-up actions</b>{dr.status !== 'Signed' && <button className={btnGhost} onClick={() => setAct2(true)}>Add action</button>}</Bar>{dr.actions.length ? <Tbl head={['Action', 'Owner', 'Due', '']}>{dr.actions.map((a) => <Row key={a.index}><Td>{a.text}</Td><Td>{a.ownerName}</Td><Td>{a.dueDate}</Td><Td cls="text-end">{a.done ? <Pill value="Approved">Done</Pill> : <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/drills/${id}/actions/${a.index}/done`, {}), 'Done', refresh)}>Mark done</button>}</Td></Row>)}</Tbl> : <p className="p-4 text-sm text-[#5b6b7b]">No follow-up actions.</p>}</Card>}
      {fb && <Modal title="Phone list" onClose={() => setFb(null)} wide><p className="mb-3 text-sm text-[#3b4a5c]">Families of children who are not accounted for, and families who have not opened the notice after {fb.waitMinutes} minutes.</p>{fb.calls.length ? <Tbl head={['Child', 'Parent', 'Phone', 'Why']}>{fb.calls.map((x, i) => <Row key={i}><Td>{x.studentName}<Sub>{x.classLabel}</Sub></Td><Td>{x.parentName}</Td><Td>{x.phone || '—'}</Td><Td>{x.why}</Td></Row>)}</Tbl> : <p className="text-sm">Nobody needs a call right now.</p>}</Modal>}
      {close && <Reason title="Close the drill" label="How did it go? (a short summary)" cta="Close" min={5} onClose={() => setClose(false)} extra={c.unknown + c.missing > 0 ? <div className="mb-3"><Banner tone="bad">{c.unknown + c.missing} not accounted for. Finish the count, or write below why you are closing anyway.</Banner></div> : null} onSubmit={async (summary) => { try { await apiClient.post(`/safety/drills/${id}/close`, { summary, forceReason: c.unknown + c.missing > 0 ? summary : undefined }); setClose(false); refresh(); } catch (e) { toast.error(errMsg(e)); } }} />}
      {act2 && <ActionForm id={id} onClose={() => setAct2(false)} onDone={refresh} />}
    </div>
  );
};
const ActionForm = ({ id, onClose, onDone }) => {
  const [f, setF] = useState({ text: '', ownerName: '', dueDate: '' });
  return <Modal title="Add a follow-up action" onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="What must be done"><input className={inputCls} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} maxLength={300} /></Field></div><Field label="Owner"><input className={inputCls} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></Field><Field label="Due"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={f.text.trim().length < 3} onClick={async () => { try { await apiClient.post(`/safety/drills/${id}/actions`, f); onDone(); onClose(); } catch (e) { toast.error(errMsg(e)); } }}>Add</button></div></Modal>;
};

const DrillsTab = ({ admin }) => {
  const [current, setCurrent] = useState(undefined); const [list, setList] = useState([]); const [open, setOpen] = useState(null); const [start, setStart] = useState(false); const [f, setF] = useState({ kind: 'Fire', title: '', assemblyPoint: '', real: false });
  const load = useCallback(async () => { try { setCurrent((await apiClient.get('/safety/drills/current')).data.drill); if (admin) setList((await apiClient.get('/safety/drills')).data.drills); } catch (e) { toast.error(errMsg(e)); } }, [admin]);
  useEffect(() => { load(); }, [load]);
  if (current === undefined) return <div className="skeleton h-32" />;
  if (open) return <Detail id={open} admin={admin} onClose={() => { setOpen(null); load(); }} onChange={load} />;
  if (!admin) return current ? <CountClass drill={current} onChange={load} /> : <EmptyState title="No drill is running." text="When the school starts a drill or an emergency assembly, you will be asked to count your class here." />;
  return (
    <div className="space-y-4">
      {current ? <Banner tone="bad"><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{current.title}</b> is running: {current.counts.safe} of {current.counts.expected} students counted safe{current.counts.missing ? `, ${current.counts.missing} missing` : ''}.</span><button className={btnPrimary} onClick={() => setOpen(current._id)}>Open head count</button></div></Banner> : <button className={`${btnPrimary} self-start`} onClick={() => setStart(true)}>Start a drill or emergency assembly</button>}
      {current && <CountClass drill={current} onChange={load} />}
      <Card className="!p-0"><Bar><b className="text-sm">Drill history</b></Bar>{list.length ? <Tbl head={['Drill', 'Started', 'Result', 'Report', '']}>{list.map((d) => <Row key={d._id}><Td>{d.title}<Sub>{d.kind}{d.real ? ' · real emergency' : ''}</Sub></Td><Td>{dayTime(d.startedAt)}</Td><Td>{d.counts.safe}/{d.counts.expected} safe{d.counts.unknown + d.counts.missing > 0 ? ` · ${d.counts.unknown + d.counts.missing} unaccounted` : ''}</Td><Td><Pill value={STATUS_TONE[d.status]}>{d.status}</Pill></Td><Td cls="text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setOpen(d._id)}>Open</button></Td></Row>)}</Tbl> : <p className="p-4 text-sm text-[#5b6b7b]">No drills yet.</p>}</Card>
      {start && <Modal title="Start a drill" onClose={() => setStart(false)}>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field><Field label="Assembly point"><input className={inputCls} value={f.assemblyPoint} onChange={(e) => setF({ ...f, assemblyPoint: e.target.value })} maxLength={80} placeholder="e.g. Playground" /></Field><div className="sm:col-span-2"><Field label="Title (optional)"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} /></Field></div><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.real} onChange={(e) => setF({ ...f, real: e.target.checked })} /> This is a real emergency, not practice</label></div>
        <p className="mt-3 text-sm text-[#5b6b7b]">Everyone not marked absent or already collected today goes on the head count. Class teachers are told to count.</p>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setStart(false)}>Cancel</button><button className={btnDanger} onClick={async () => { try { const r = await apiClient.post('/safety/drills', f); setStart(false); await load(); setOpen(r.data.drill._id); } catch (e) { toast.error(errMsg(e)); } }}>Start now</button></div>
      </Modal>}
    </div>
  );
};
export default DrillsTab;
