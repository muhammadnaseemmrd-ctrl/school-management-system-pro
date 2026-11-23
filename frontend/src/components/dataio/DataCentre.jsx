// One place to fill any part of the school from a sheet, and to set up a whole school from a
// single workbook.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle, Download, FileSpreadsheet, Loader2, ShieldCheck, Upload } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, btnGhost, btnPrimary, errMsg } from '../ui';
import ImportPanel from './ImportPanel';

const saveFile = (data, name) => {
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ── the whole school from one workbook ── */
function WholeSchool() {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { apiClient.get('/dataio/whole-school/plan').then((r) => setPlan(r.data)).catch(() => {}); }, []);

  const template = async () => {
    setBusy('template');
    try {
      const r = await apiClient.get('/dataio/whole-school/template', { responseType: 'blob' });
      saveFile(r.data, 'aulensia-whole-school-template.xlsx');
    } catch (e) { toast.error(errMsg(e, 'Could not get the workbook')); }
    setBusy('');
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('preview'); setDone(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await apiClient.post('/dataio/whole-school/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data);
    } catch (err) { toast.error(err?.response?.data?.message || 'That workbook could not be read'); }
    setBusy('');
  };

  // sheet by sheet, in the order the parts depend on each other
  const write = async () => {
    if (!preview || !plan) return;
    setBusy('commit');
    const totals = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const failures = []; const credentials = []; const perSheet = [];
    const size = preview.batch || 200;
    try {
      for (const step of plan.steps) {
        const sheet = preview.sheets.find((s) => s.key === step.key);
        if (!sheet || !sheet.rows.length) continue;
        const todo = sheet.rows.filter((r) => r.state === 'create');
        if (!todo.length) continue;
        const mine = { key: step.key, label: step.label, created: 0, failed: 0 };
        for (let i = 0; i < todo.length; i += size) {
          setProgress({ sheet: step.label, at: i, of: todo.length });
          const batch = todo.slice(i, i + size).map((r) => ({ n: r.n, raw: r.raw }));
          const r = await apiClient.post(`/dataio/${step.key}/commit`, { rows: batch });
          Object.keys(totals).forEach((k) => { totals[k] += r.data.tally[k]; });
          mine.created += r.data.tally.created; mine.failed += r.data.tally.failed;
          for (const res of r.data.results) {
            if (res.status === 'failed') failures.push({ sheet: step.label, n: res.n, error: res.error });
            if (res.credential) credentials.push(res.credential);
          }
        }
        perSheet.push(mine);
      }
      setDone({ totals, failures, credentials, perSheet });
      setPreview(null);
      toast.success(`${totals.created} records added`);
    } catch (e) { toast.error(errMsg(e, 'Could not finish')); }
    setProgress(null); setBusy('');
  };

  const downloadCredentials = () => {
    if (!done?.credentials?.length) return;
    const head = 'Role,Name,Sign-in email,First-time password\n';
    const body = done.credentials.flatMap((c) => [
      [c.role, c.name, c.email, c.temporaryPassword],
      ...(c.parent ? [['parent', c.parent.name, c.parent.email, c.parent.temporaryPassword]] : []),
    ]).map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    saveFile(head + body, 'aulensia-first-time-passwords.csv');
  };

  const willWrite = preview ? preview.sheets.reduce((n, s) => n + s.rows.filter((r) => r.state === 'create').length, 0) : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#1b2837]">Set up a whole school from one workbook</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#5b6b7b]">
            One file with a sheet for each part of the school — branches, subjects, teachers, staff and guards, classes,
            children and their guardians, fees, library, transport and the store. The sheets are read in the order they
            depend on each other, so a class may name a teacher from the Teachers sheet and a child may name a class from
            the Classes sheet.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnGhost} disabled={!!busy} onClick={template}>
          {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download the workbook
        </button>
        <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choose a filled workbook
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={pick} />
      </div>

      {plan && !preview && !done && (
        <ol className="mt-4 grid gap-1 text-sm text-[#5b6b7b] sm:grid-cols-2 lg:grid-cols-3">
          {plan.steps.map((s, i) => <li key={s.key}><span className="font-mono text-xs text-[#5b6b7b]">{String(i + 1).padStart(2, '0')}</span> {s.label}</li>)}
        </ol>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-[#1b2837]">{preview.fileName}</p>
          <div className="overflow-auto rounded-xl border border-[#e3e7e7]">
            <table className="w-full text-sm">
              <thead className="bg-[#f7f6f2] text-xs uppercase tracking-wider text-[#4f5f70]">
                <tr><th className="px-3 py-2 text-start">Sheet</th><th className="px-3 py-2 text-end">Rows</th><th className="px-3 py-2 text-end">Will be added</th><th className="px-3 py-2 text-end">Already here</th><th className="px-3 py-2 text-end">Need fixing</th></tr>
              </thead>
              <tbody className="divide-y divide-[#e3e7e7] bg-white">
                {preview.sheets.filter((s) => s.summary.total).map((s) => (
                  <tr key={s.key}>
                    <td className="px-3 py-2 font-semibold text-[#1b2837]">{s.label}{s.blocked && <span className="block text-xs font-normal text-[#9f1239]">{s.blocked}</span>}</td>
                    <td className="px-3 py-2 text-end text-[#5b6b7b]">{s.summary.total}</td>
                    <td className="px-3 py-2 text-end font-bold text-[#1f5e53]">{s.summary.create || ''}</td>
                    <td className="px-3 py-2 text-end text-[#5b6b7b]">{(s.summary.update + s.summary.skip) || ''}</td>
                    <td className="px-3 py-2 text-end font-bold text-[#9f1239]">{s.summary.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!preview.totals.error && (
            <p className="flex items-start gap-2 rounded-xl border border-[#e3b4ac] bg-[#fff1f2] p-3 text-sm text-[#9f1239]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{preview.totals.error} row{preview.totals.error > 1 ? 's' : ''} will be left out. Open the part on its own below to see which, or fix them in the workbook and upload it again.</span>
            </p>
          )}

          {progress && (
            <div className="rounded-xl bg-[#f7f6f2] p-3">
              <p className="text-xs font-semibold text-[#1b2837]">{progress.sheet}: {progress.at} of {progress.of}…</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e3e7e7]">
                <div className="h-full rounded-full bg-[#2a5cac] transition-all" style={{ width: `${Math.round((progress.at / Math.max(1, progress.of)) * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btnGhost} disabled={!!busy} onClick={() => setPreview(null)}>Choose another file</button>
            <button type="button" className={btnPrimary} disabled={!!busy || !willWrite} onClick={write}>
              {busy === 'commit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Set up {willWrite} record{willWrite === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-4 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-4">
          <p className="flex items-center gap-2 font-bold text-[#1f5e53]"><CheckCircle className="h-5 w-5" /> The school is set up</p>
          <ul className="mt-2 grid gap-1 text-sm text-[#1b2837] sm:grid-cols-2 lg:grid-cols-3">
            {done.perSheet.map((s) => <li key={s.key}>{s.label}: <b>{s.created}</b>{s.failed ? <span className="text-[#9f1239]"> ({s.failed} refused)</span> : ''}</li>)}
          </ul>
          {!!done.failures.length && (
            <ul className="mt-2 max-h-32 overflow-auto text-xs text-[#9f1239]">
              {done.failures.slice(0, 30).map((f, i) => <li key={i}>{f.sheet} row {f.n}: {f.error}</li>)}
            </ul>
          )}
          {!!done.credentials.length && (
            <button type="button" className={`${btnGhost} mt-3`} onClick={downloadCredentials}>
              <Download className="h-4 w-4" /> Download the {done.credentials.length} first-time passwords
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── one part at a time ── */
export default function DataCentre() {
  const [groups, setGroups] = useState(null);
  const [limits, setLimits] = useState(null);

  const load = useCallback(() => {
    apiClient.get('/dataio/modules')
      .then((r) => { setGroups(r.data.groups); setLimits(r.data.limits); })
      .catch((e) => toast.error(errMsg(e, 'Could not load the list')));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!groups) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-[#1b2837]">Fill the school from a sheet</h2>
        <p className="mt-1 max-w-3xl text-sm text-[#5b6b7b]">
          Every part of the school can be filled from an Excel file. Download the template for that part, fill it in, and
          upload it. You see exactly what would happen before anything is written.
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3 text-sm text-[#5b6b7b]">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1f5e53]" />
        <span>
          Your file is read in the server's memory and dropped as soon as it has been checked — it is never saved on the
          server. {limits ? `Up to ${limits.maxRows.toLocaleString()} rows and ${Math.round(limits.maxBytes / 1024 / 1024)} MB in one file.` : ''}
        </span>
      </p>

      <WholeSchool />

      {groups.map((g) => (
        <Card key={g.group}>
          <h3 className="text-lg font-black text-[#1b2837]">{g.group}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.modules.map((m) => (
              <div key={m.key} className="flex flex-col rounded-xl border border-[#e3e7e7] bg-white p-4">
                <p className="flex items-center gap-2 font-bold text-[#1b2837]"><FileSpreadsheet className="h-4 w-4 text-[#2a5cac]" /> {m.label}</p>
                <p className="mt-1 flex-1 text-xs leading-5 text-[#5b6b7b]">{m.help}</p>
                <p className="mt-2 text-[11px] text-[#5b6b7b]">Needed: {m.columns.filter((c) => c.required).map((c) => c.label).join(', ') || 'nothing in particular'}</p>
                <div className="mt-3"><ImportPanel module={m.key} title={m.label} /></div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
