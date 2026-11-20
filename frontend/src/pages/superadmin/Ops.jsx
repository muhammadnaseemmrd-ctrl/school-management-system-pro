import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, MinusCircle, PlayCircle } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Pill, Pager, Modal, TableSkeleton, EmptyState, btnGhost, btnPrimary, errMsg } from '../../components/ui';

const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (d) => { if (!d) return 'never'; const h = (Date.now() - new Date(d).getTime()) / 36e5; return h < 1 ? 'just now' : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; };
const TONE = { Healthy: 'Active', Proven: 'Active', 'No backup': 'Suspended', Stale: 'Suspended', 'Never proven': 'Pending', 'Proof is old': 'Pending', 'Waiting for first backup': 'None' };

const useList = (path, key, params = {}) => {
  const [s, setS] = useState({ rows: [], pagination: null, loading: true, error: '' });
  const [page, setPage] = useState(1);
  const q = JSON.stringify(params);
  const load = useCallback(async () => {
    setS((x) => ({ ...x, loading: true, error: '' }));
    try { const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } }); setS({ rows: r.data[key] || [], pagination: r.data.pagination, loading: false, error: '' }); }
    catch (e) { setS((x) => ({ ...x, loading: false, error: errMsg(e, 'Could not load') })); }
  }, [path, key, page, q]);
  useEffect(() => { load(); }, [load]);
  return { ...s, setPage, reload: load };
};

const CheckIcon = ({ c }) => (c.ok === true ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2c776c]" /> : c.ok === false ? (c.warn ? <AlertTriangle className="h-4 w-4 shrink-0 text-[#8a4636]" /> : <XCircle className="h-4 w-4 shrink-0 text-[#b3261e]" />) : <MinusCircle className="h-4 w-4 shrink-0 text-[#5b6b7b]" />);

const DrillModal = ({ drill, onClose }) => (
  <Modal title={`Restore drill · ${drill.schoolName}`} onClose={onClose} wide>
    <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${drill.status === 'Passed' ? 'bg-[#edf5f3] text-[#215a52]' : 'bg-[#fff1f2] text-[#9f1239]'}`}>
      <b>{drill.status === 'Passed' ? (drill.limited ? 'Passed with limits' : 'Passed') : 'FAILED. Do not rely on this backup.'}</b>
      <span className="ms-2">Backup from {when(drill.backupCreatedAt)} · {drill.rowsRestored} rows restored in {drill.durationMs} ms</span>
    </div>
    <ul className="divide-y divide-[#e3e7e7]">
      {drill.checks.map((c) => (
        <li key={c.name} className="flex gap-3 py-2.5 text-sm"><CheckIcon c={c} /><div><p className="font-semibold">{c.name}{c.warn && <span className="ms-2 text-xs font-normal text-[#8a4636]">warning only</span>}</p><p className="text-xs text-[#5b6b7b]">{c.detail}</p></div></li>))}
    </ul>
    <p className="mt-4 text-xs text-[#5b6b7b]">The backup was loaded into temporary tables that exist only for this check and were then discarded. Live data was not touched.</p>
  </Modal>
);

export const OperationsTab = ({ onChanged }) => {
  const [h, setH] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);
  const runs = useList('/superadmin/ops/backup-runs', 'runs');
  const drills = useList('/superadmin/ops/restore-drills', 'drills');
  const load = useCallback(() => apiClient.get('/superadmin/ops/health').then((r) => { setH(r.data); setErr(''); }).catch((e) => setErr(errMsg(e, 'Could not load'))), []);
  useEffect(() => { load(); }, [load]);

  const refreshAll = () => { load(); runs.reload(); drills.reload(); onChanged?.(); };
  const backupNow = async (s) => {
    setBusy(`b${s.schoolId}`);
    try { await apiClient.post(`/superadmin/schools/${s.schoolId}/backups`); toast.success('Backup made'); refreshAll(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const drill = async (s) => {
    setBusy(`d${s.schoolId}`);
    try { const r = await apiClient.post(`/superadmin/schools/${s.schoolId}/restore-drill`, {}); setOpen(r.data.drill); refreshAll(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  if (err) return <EmptyState title={err} action={<button onClick={load} className={btnGhost}>Try again</button>} />;
  if (!h) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>;
  const errors = h.alerts.filter((a) => a.level === 'error'); const warns = h.alerts.filter((a) => a.level === 'warn');
  return (
    <div className="page-ready space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {h.ok ? <ShieldCheck className="h-6 w-6 text-[#2c776c]" /> : <AlertTriangle className="h-6 w-6 text-[#b3261e]" />}
          <div className="flex-1">
            <h3 className="font-semibold">{h.ok ? (warns.length ? 'Backups are running, some are not yet proven' : 'Every school has a recent, proven backup') : `${errors.length} problem${errors.length === 1 ? '' : 's'} need attention`}</h3>
            <p className="text-xs text-[#5b6b7b]">A backup only counts once a restore drill has shown it can be restored. Last backup job: {ago(h.lastBackupRunAt)}. Backups older than {h.thresholds.staleBackupDays} days are flagged; proof should be refreshed every {h.thresholds.drillDays} days.</p>
          </div>
        </div>
        {h.alerts.length > 0 && <ul className="mt-4 space-y-2">{h.alerts.map((a, i) => (
          <li key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${a.level === 'error' ? 'bg-[#fff1f2] text-[#9f1239]' : 'bg-[#fbf0ec] text-[#8a4636]'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a.message}</li>))}</ul>}
      </Card>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{['School', 'Latest backup', 'Backup status', 'Restore proof', ''].map((x) => <th key={x} className="px-4 py-3 text-start font-semibold">{x}</th>)}</tr></thead>
          <tbody className="stagger">{h.schools.map((s) => (
            <tr key={String(s.schoolId)} className="border-b border-[#e3e7e7]/60 last:border-0">
              <td className="px-4 py-3"><p className="font-semibold">{s.name}</p><p className="font-mono text-xs text-[#5b6b7b]">{s.code}</p></td>
              <td className="px-4 py-3">{when(s.lastBackupAt)}<p className="text-xs text-[#5b6b7b]">{ago(s.lastBackupAt)}</p></td>
              <td className="px-4 py-3"><Pill value={TONE[s.backup] || 'None'}>{s.backup}</Pill></td>
              <td className="px-4 py-3"><Pill value={TONE[s.proof] || 'None'}>{s.proof}</Pill><p className="mt-1 text-xs text-[#5b6b7b]">{s.lastProofAt ? `proved ${ago(s.lastProofAt)}` : ''}</p></td>
              <td className="px-4 py-3"><div className="flex gap-1.5">
                <button disabled={busy === `b${s.schoolId}`} onClick={() => backupNow(s)} className={`${btnGhost} !px-3 !py-1.5 !text-xs`}>{busy === `b${s.schoolId}` ? 'Backing up…' : 'Back up now'}</button>
                <button disabled={busy === `d${s.schoolId}` || !s.lastBackupAt} onClick={() => drill(s)} className={`${btnPrimary} !px-3 !py-1.5 !text-xs`}><PlayCircle className="h-3.5 w-3.5" />{busy === `d${s.schoolId}` ? 'Testing…' : 'Run restore drill'}</button>
              </div></td>
            </tr>))}</tbody>
        </table>
      </Card>

      <div>
        <h3 className="mb-2 font-semibold">Restore drills</h3>
        <Card className="overflow-hidden !p-0">
          {drills.loading ? <TableSkeleton cols={5} rows={3} /> : drills.rows.length === 0
            ? <EmptyState title="No restore drills yet" text="Run a drill on a school above. It restores the latest backup into an isolated sandbox and compares every row." />
            : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-start text-sm"><tbody>{drills.rows.map((d) => (
              <tr key={d._id || d.id} className="border-b border-[#e3e7e7]/60 last:border-0">
                <td className="px-4 py-3">{when(d.startedAt)}</td><td className="px-4 py-3 font-semibold">{d.schoolName}</td>
                <td className="px-4 py-3"><Pill value={d.status === 'Passed' ? 'Active' : 'Suspended'}>{d.status}{d.limited ? ' (limited)' : ''}</Pill></td>
                <td className="px-4 py-3 text-xs text-[#5b6b7b]">{d.rowsRestored} rows · {d.trigger}</td>
                <td className="px-4 py-3"><button onClick={() => setOpen(d)} className={`${btnGhost} !px-3 !py-1.5 !text-xs`}>Details</button></td></tr>))}</tbody></table></div>}
          <Pager pagination={drills.pagination} onPage={drills.setPage} />
        </Card>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Backup jobs</h3>
        <Card className="overflow-hidden !p-0">
          {runs.loading ? <TableSkeleton cols={5} rows={3} /> : runs.rows.length === 0
            ? <EmptyState title="No backup jobs yet" text="Each weekly or manual backup is listed here, including any that failed." />
            : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-start text-sm"><tbody>{runs.rows.map((r) => (
              <tr key={r._id || r.id} className="border-b border-[#e3e7e7]/60 last:border-0">
                <td className="px-4 py-3">{when(r.startedAt)}</td><td className="px-4 py-3 font-semibold">{r.schoolName}</td>
                <td className="px-4 py-3"><Pill value={r.status === 'Succeeded' ? 'Active' : r.status === 'Failed' ? 'Suspended' : 'Pending'}>{r.status}</Pill></td>
                <td className="px-4 py-3 text-xs text-[#5b6b7b]">{r.status === 'Failed' ? r.error : `${r.rowCount ?? 0} rows · ${((r.sizeBytes || 0) / 1024).toFixed(0)} KB · ${r.durationMs ?? 0} ms`}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#5b6b7b]">{(r.checksum || '').slice(0, 12)}</td></tr>))}</tbody></table></div>}
          <Pager pagination={runs.pagination} onPage={runs.setPage} />
        </Card>
      </div>
      {open && <DrillModal drill={open} onClose={() => setOpen(null)} />}
    </div>
  );
};
