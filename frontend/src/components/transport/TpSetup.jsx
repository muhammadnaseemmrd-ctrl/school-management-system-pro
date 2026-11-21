import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, dt } from './tpKit';

const NUM = [['lateNoticeMin', 'Tell families when the bus is this many minutes late', 3, 120], ['earliestStartMin', 'A trip may start this many minutes before its time', 5, 240], ['latestStartMin', 'A trip that has not started this long after its time is marked “did not run”', 15, 600], ['staleActiveHours', 'Close a trip still open after this many hours', 1, 24], ['pingMinSeconds', 'Ignore bus positions closer together than this many seconds', 1, 120], ['incidentPingDays', 'Keep a bus track for an incident at most this many days', 1, 90], ['inspectionEveryDays', 'Inspect each bus every this many days', 7, 365], ['documentWarnDays', 'Warn this many days before papers run out', 1, 120]];

function ListEditor({ label, rows, onChange }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <fieldset className="space-y-2"><legend className="mb-1 text-sm font-semibold text-[#1b2837]">{label}</legend>
      {rows.map((r, i) => <div key={i} className="grid grid-cols-12 items-center gap-2"><input className={`${inputCls} col-span-8`} value={r.label} onChange={(e) => set(i, 'label', e.target.value)} aria-label={`${label} line ${i + 1}`} /><label className="col-span-3 flex items-center gap-1 text-xs"><input type="checkbox" checked={!!r.critical} onChange={(e) => set(i, 'critical', e.target.checked)} /> Critical</label><button type="button" className="col-span-1 text-xs font-semibold text-[#9f1239]" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove line ${i + 1}`}>×</button></div>)}
      <button type="button" className={`${btnGhost} !text-xs`} onClick={() => onChange([...rows, { key: `n${Date.now().toString(36)}`, label: '', critical: false }])}>Add a line</button>
    </fieldset>
  );
}

export default function TpSetup({ admin }) {
  const g = useGet('/transport/settings'); const [f, setF] = useState(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const cur = f || g.data?.settings;
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.put('/transport/settings', { reason, settings: f }); toast.success('Rules saved as a new version.'); setF(null); setReason(''); g.reload(); } catch (x) { setErr(errMsg(x)); } setBusy(false); };
  return (
    <Loading g={g}>{cur && (
      <form onSubmit={save} className="space-y-4">
        <Note>{admin ? 'These rules apply to every trip. Each change is kept as a new version with a reason.' : 'Only an administrator can change these rules.'} Version {g.data.version}.</Note>
        <Card><div className="grid gap-3 sm:grid-cols-2">{NUM.map(([k, l, lo, hi]) => <Field key={k} label={l}><input type="number" min={lo} max={hi} className={inputCls} value={cur[k]} disabled={!admin} onChange={(e) => setF({ ...cur, [k]: Number(e.target.value) })} /></Field>)}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!cur.approachNotice} disabled={!admin} onChange={(e) => setF({ ...cur, approachNotice: e.target.checked })} /> Tell families when the bus reaches their stop</label></div></Card>
        <Card><ListEditor label="Driver’s checklist before each trip" rows={cur.checklist} onChange={(v) => admin && setF({ ...cur, checklist: v })} /><p className="mt-2 text-xs text-[#5b6b7b]">A failed critical line stops the trip from starting and tells the office.</p></Card>
        <Card><ListEditor label="Vehicle inspection lines" rows={cur.inspection} onChange={(v) => admin && setF({ ...cur, inspection: v })} /></Card>
        {admin && f && <Card><Field label="Why are you changing the rules? (kept in the record)"><textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} /></Field>{err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}<div className="mt-3 flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => { setF(null); setReason(''); }}>Undo my changes</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save as a new version'}</button></div></Card>}
        {g.data.history.length > 0 && <Card><h3 className="mb-2 text-sm font-semibold">Earlier versions</h3><ol className="space-y-1 text-xs text-[#3b4a5c]">{g.data.history.slice().reverse().map((h) => <li key={h.version}><b>Version {h.version}</b> · {h.byName || 'System'} · {dt(h.at)}{h.reason ? ` — ${h.reason}` : ''}</li>)}</ol></Card>}
      </form>
    )}</Loading>
  );
}
