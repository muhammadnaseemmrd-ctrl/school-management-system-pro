import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Pill, Field, EmptyState, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { dayTime } from '../safety/safetyKit';
import { setOpenConflicts } from '../../utils/syncQueue';

const STATUSES = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];
const Side = ({ title, tone, kind, v, extra }) => (
  <div className={`rounded-xl border p-3 text-sm ${tone}`}>
    <div className="mb-1 text-xs font-semibold uppercase tracking-wide">{title}</div>
    {kind === 'draft' && <><div className="font-semibold">{v?.title || '(no title)'}</div><div className="whitespace-pre-wrap text-[#3b4a5c]">{v?.body}</div></>}
    {kind === 'marks' && <><div className="text-xl font-bold">{v?.marks}<span className="text-sm font-normal"> / {v?.outOfMarks}</span></div>{v?.remarks && <div className="text-[#3b4a5c]">{v.remarks}</div>}</>}
    {(kind === 'attendance' || kind === 'period') && <div className="text-lg font-bold">{v?.status}</div>}
    {extra}
  </div>
);
const Merge = ({ c, onDone, onCancel }) => {
  const [v, setV] = useState(c.kind === 'draft' ? { title: c.mine.title, body: c.mine.body } : c.kind === 'marks' ? { marks: c.mine.marks, remarks: c.mine.remarks || '' } : { status: c.mine.status });
  return (
    <div className="mt-3 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3">
      <div className="mb-2 text-sm font-semibold">Combine the two</div>
      {c.kind === 'draft' && <div className="space-y-2"><Field label="Title"><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={120} /></Field><Field label="Text"><textarea className={inputCls} rows={4} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} maxLength={4000} /></Field></div>}
      {c.kind === 'marks' && <div className="grid gap-2 sm:grid-cols-2"><Field label={`Marks (out of ${c.mine.outOfMarks})`}><input type="number" className={inputCls} value={v.marks} min="0" max={c.mine.outOfMarks} onChange={(e) => setV({ ...v, marks: e.target.value })} /></Field><Field label="Remark"><input className={inputCls} value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} maxLength={300} /></Field></div>}
      {(c.kind === 'attendance' || c.kind === 'period') && <Field label="Status"><select className={inputCls} value={v.status} onChange={(e) => setV({ status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>}
      <div className="mt-3 flex justify-end gap-2"><button className={btnGhost} onClick={onCancel}>Back</button><button className={btnPrimary} onClick={() => onDone(v)}>Save combined</button></div>
    </div>
  );
};

// The place where a queued change that met a newer one waits for a person's choice (nothing is overwritten silently)
const ConflictInbox = ({ admin, onChanged }) => {
  const [rows, setRows] = useState(null); const [hist, setHist] = useState(false); const [merge, setMerge] = useState(null); const [hand, setHand] = useState(null); const [mates, setMates] = useState([]); const [note, setNote] = useState({}); const [busy, setBusy] = useState('');
  const load = async () => { try { const r = await apiClient.get('/sync/conflicts', { params: { status: hist ? 'Resolved' : 'Open' } }); setRows(r.data.conflicts); if (!hist) setOpenConflicts(r.data.conflicts.length); } catch (e) { setRows([]); toast.error(errMsg(e)); } };
  useEffect(() => { load(); }, [hist]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!admin) apiClient.get('/timetable-ops/colleagues').then((r) => setMates(r.data.teachers)).catch(() => {}); }, [admin]);
  const resolve = async (c, resolution, value) => { setBusy(c._id); try { const r = await apiClient.post(`/sync/conflicts/${c._id}/resolve`, { resolution, value, note: note[c._id] || '' }); toast.success(r.data.message); setMerge(null); await load(); onChanged && onChanged(); } catch (e) { toast.error(errMsg(e)); } setBusy(''); };
  const delegate = async (c, body) => { try { const r = await apiClient.post(`/sync/conflicts/${c._id}/delegate`, body); toast.success(r.data.message); setHand(null); load(); } catch (e) { toast.error(errMsg(e)); } };
  if (!rows) return <div className="skeleton h-32" />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-[#3b4a5c]">{hist ? 'Settled clashes, with who decided and why.' : 'A change saved on a device met a newer change on the server. Choose which to keep; nothing is overwritten until you do.'}</p><button className={btnGhost} onClick={() => setHist(!hist)}>{hist ? 'Show open' : 'Show settled'}</button></div>
      {rows.length === 0 && <Card><EmptyState title={hist ? 'Nothing settled yet' : 'No clashes'} text={hist ? '' : 'Everything saved on a device has matched the server.'} /></Card>}
      {rows.map((c) => (
        <Card key={c._id}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{c.label}</div><div className="text-xs text-[#5b6b7b]">{admin && `${c.ownerName} · `}{dayTime(c.createdAt)}{c.serverChangedBy && ` · the saved version came from ${c.serverChangedBy}`}</div></div>
            {c.assignedToName && <Pill value="Pending">With {c.assignedToName}</Pill>}{c.status === 'Resolved' && <Pill value="Approved">{c.resolution === 'mine' ? 'Kept the device version' : c.resolution === 'server' ? 'Kept the saved version' : 'Combined'}</Pill>}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><Side title="Saved on the device" tone="border-[#cfe0f5] bg-[#f3f8fe]" kind={c.kind} v={c.mine} /><Side title="Saved on the server" tone="border-[#e3e7e7] bg-white" kind={c.kind} v={c.server} /></div>
          {c.status === 'Resolved' ? <p className="mt-2 text-xs text-[#5b6b7b]">Decided by {c.resolvedByName} ({c.resolvedByRole}) on {dayTime(c.resolvedAt)}{c.resolutionNote ? `: ${c.resolutionNote}` : ''}</p> : (
            <>
              <div className="mt-3"><input className={inputCls} placeholder="Why (optional, kept in the record)" value={note[c._id] || ''} onChange={(e) => setNote({ ...note, [c._id]: e.target.value })} maxLength={300} /></div>
              {merge === c._id ? <Merge c={c} onCancel={() => setMerge(null)} onDone={(v) => resolve(c, 'merged', v)} /> : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={btnPrimary} disabled={busy === c._id} onClick={() => resolve(c, 'mine')}>Keep the device version</button>
                  <button className={btnGhost} disabled={busy === c._id} onClick={() => resolve(c, 'server')}>Keep the saved version</button>
                  <button className={btnGhost} onClick={() => setMerge(c._id)}>Combine</button>
                  {!admin && <button className={btnGhost} onClick={() => setHand(hand === c._id ? null : c._id)}>Hand over</button>}
                </div>)}
              {hand === c._id && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#f7f6f2] p-3 text-sm"><button className={btnGhost} onClick={() => delegate(c, { to: 'office' })}>The school office</button>{mates.length > 0 && <select className={`${inputCls} !w-52`} defaultValue="" onChange={(e) => e.target.value && delegate(c, { teacherId: e.target.value })} aria-label="Colleague"><option value="">A colleague…</option>{mates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select>}</div>}
            </>)}
        </Card>))}
    </div>
  );
};
export default ConflictInbox;
