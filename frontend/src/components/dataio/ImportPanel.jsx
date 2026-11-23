// Filling one module from a sheet: download the template, upload the filled file, look at what
// would happen, then write it.
//
// The checked rows stay in this browser between the look and the writing, and go back to the
// server in small batches. The server holds no file and no half-finished job, so a big file costs
// the school nothing while somebody reads the preview and makes up their mind.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Modal, btnGhost, btnPrimary, errMsg } from '../ui';

const STATE_LABEL = { create: 'Will be added', update: 'Will be updated', skip: 'Left as it is', error: 'Needs fixing' };
const STATE_TONE = {
  create: 'bg-[#e1f1ec] text-[#1f5e53]',
  update: 'bg-[#e8eefb] text-[#234c91]',
  skip: 'bg-[#f1f1ee] text-[#5b6b7b]',
  error: 'bg-[#fff1f2] text-[#9f1239]',
};

const saveFile = (data, name) => {
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ImportPanel({ module: moduleKey, title, onDone, compact }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(null);
  const [filter, setFilter] = useState('all');
  const fileRef = useRef(null);

  const reset = () => { setPreview(null); setDone(null); setProgress(null); setFilter('all'); setUpdateExisting(false); };
  const close = () => { setOpen(false); reset(); };

  const template = async () => {
    setBusy('template');
    try {
      const r = await apiClient.get(`/dataio/${moduleKey}/template`, { responseType: 'blob' });
      saveFile(r.data, `aulensia-${moduleKey}-template.xlsx`);
    } catch (e) { toast.error(errMsg(e, 'Could not get the template')); }
    setBusy('');
  };

  const exportNow = async () => {
    setBusy('export');
    try {
      const r = await apiClient.get(`/dataio/${moduleKey}/export`, { responseType: 'blob' });
      saveFile(r.data, `aulensia-${moduleKey}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { toast.error(errMsg(e, 'Could not make the file')); }
    setBusy('');
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('preview'); setDone(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiClient.post(`/dataio/${moduleKey}/preview`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data);
      setFilter(r.data.summary.error ? 'error' : 'all');
    } catch (err) {
      const d = err?.response?.data;
      toast.error(d?.message || 'That file could not be read');
      if (d?.unknown?.length) toast(`Columns we did not recognise: ${d.unknown.join(', ')}`, { icon: 'ℹ️' });
    }
    setBusy('');
  };

  const write = async () => {
    if (!preview) return;
    const todo = preview.rows.filter((r) => r.state === 'create' || (r.state === 'update' && updateExisting));
    if (!todo.length) { toast.error('There is nothing to write.'); return; }
    const size = preview.batch || 200;
    setBusy('commit');
    const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const failures = []; const credentials = [];
    try {
      for (let i = 0; i < todo.length; i += size) {
        setProgress({ at: i, of: todo.length });
        const batch = todo.slice(i, i + size).map((r) => ({ n: r.n, raw: r.raw }));
        const r = await apiClient.post(`/dataio/${moduleKey}/commit`, { rows: batch, updateExisting });
        Object.keys(tally).forEach((k) => { tally[k] += r.data.tally[k]; });
        for (const res of r.data.results) {
          if (res.status === 'failed') failures.push({ n: res.n, error: res.error });
          if (res.credential) credentials.push(res.credential);
        }
      }
      setDone({ tally, failures, credentials });
      setPreview(null);
      if (tally.created || tally.updated) toast.success(`${tally.created} added, ${tally.updated} updated`);
      if (onDone) onDone(tally);
    } catch (e) { toast.error(errMsg(e, 'Could not finish writing')); }
    setProgress(null); setBusy('');
  };

  const downloadCredentials = () => {
    if (!done?.credentials?.length) return;
    const head = 'Role,Name,Sign-in email,First-time password\n';
    const body = done.credentials.flatMap((c) => [
      [c.role, c.name, c.email, c.temporaryPassword],
      ...(c.parent ? [['parent', c.parent.name, c.parent.email, c.parent.temporaryPassword]] : []),
    ]).map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    saveFile(head + body, `aulensia-${moduleKey}-first-time-passwords.csv`);
  };

  const rows = preview ? preview.rows.filter((r) => filter === 'all' || r.state === filter) : [];
  const s = preview?.summary;
  const willWrite = preview ? preview.rows.filter((r) => r.state === 'create' || (r.state === 'update' && updateExisting)).length : 0;

  return (
    <>
      <button type="button" className={compact ? btnGhost : btnGhost} onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-4 w-4" /> Import / template
      </button>

      {open && (
        <Modal title={`${title || 'Load from a file'}`} onClose={close} wide>
          <div className="space-y-4">
            <p className="text-sm text-[#5b6b7b]">
              Download the template, fill it in, then upload it. Nothing is written until you have seen what would happen.
              Your file is read and then dropped — it is never stored on the server.
            </p>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnGhost} disabled={!!busy} onClick={template}>
                {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download template
              </button>
              <button type="button" className={btnGhost} disabled={!!busy} onClick={exportNow}>
                {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download what is here
              </button>
              <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choose a filled file
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={pick} />
            </div>

            {done && (
              <div className="rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-4">
                <p className="flex items-center gap-2 font-bold text-[#1f5e53]"><CheckCircle className="h-5 w-5" /> Finished</p>
                <p className="mt-1 text-sm text-[#1b2837]">
                  {done.tally.created} added, {done.tally.updated} updated, {done.tally.skipped} left alone
                  {done.tally.failed ? `, ${done.tally.failed} could not be written` : ''}.
                </p>
                {!!done.failures.length && (
                  <ul className="mt-2 max-h-32 overflow-auto text-xs text-[#9f1239]">
                    {done.failures.slice(0, 20).map((f) => <li key={f.n}>Row {f.n}: {f.error}</li>)}
                  </ul>
                )}
                {!!done.credentials.length && (
                  <button type="button" className={`${btnGhost} mt-3`} onClick={downloadCredentials}>
                    <Download className="h-4 w-4" /> Download the {done.credentials.length} first-time password{done.credentials.length > 1 ? 's' : ''}
                  </button>
                )}
                <p className="mt-2 text-[11px] text-[#5b6b7b]">First-time passwords are shown once. Save the file and hand them out, then ask people to change them.</p>
              </div>
            )}

            {preview && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3">
                  <span className="text-sm font-semibold text-[#1b2837]">{preview.fileName}</span>
                  <span className="text-xs text-[#5b6b7b]">sheet "{preview.sheetName}" · {s.total} rows</span>
                  {preview.truncated && <span className="rounded-full bg-[#fff6e5] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">Only the first rows were read — split the file</span>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {['all', 'create', 'update', 'skip', 'error'].map((k) => {
                    const n = k === 'all' ? s.total : s[k];
                    if (k !== 'all' && !n) return null;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setFilter(k)}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${filter === k ? 'bg-[#1b2837] text-white' : STATE_TONE[k] || 'bg-[#f1f1ee] text-[#5b6b7b]'}`}
                      >
                        {k === 'all' ? 'All' : STATE_LABEL[k]} ({n})
                      </button>
                    );
                  })}
                </div>

                {!!s.error && (
                  <p className="flex items-start gap-2 rounded-xl border border-[#e3b4ac] bg-[#fff1f2] p-3 text-sm text-[#9f1239]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{s.error} row{s.error > 1 ? 's need' : ' needs'} fixing and will be left out. Correct them in your file and upload it again.</span>
                  </p>
                )}

                <div className="max-h-72 overflow-auto rounded-xl border border-[#e3e7e7]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#f7f6f2] text-xs uppercase tracking-wider text-[#4f5f70]">
                      <tr><th className="px-3 py-2 text-start">Row</th><th className="px-3 py-2 text-start">What</th><th className="px-3 py-2 text-start">Outcome</th><th className="px-3 py-2 text-start">Notes</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e7e7] bg-white">
                      {rows.slice(0, 300).map((r) => (
                        <tr key={r.n}>
                          <td className="px-3 py-2 text-[#5b6b7b]">{r.n}</td>
                          <td className="px-3 py-2 font-semibold text-[#1b2837]">{r.label || r.match?.label || Object.values(r.raw || {})[0] || '—'}</td>
                          <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_TONE[r.state]}`}>{STATE_LABEL[r.state]}</span></td>
                          <td className="px-3 py-2 text-xs text-[#5b6b7b]">
                            {r.errors?.length ? <span className="text-[#9f1239]">{r.errors.join(' · ')}</span> : null}
                            {r.warnings?.length ? <span className="block text-[#8a5a00]">{r.warnings.join(' · ')}</span> : null}
                            {r.skipReason ? <span>{r.skipReason}</span> : null}
                            {r.changes?.length ? <span className="block">{r.changes.map((c) => `${c.field}: ${c.from || '—'} → ${c.to}`).join(' · ')}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 300 && <p className="bg-[#f7f6f2] px-3 py-2 text-xs text-[#5b6b7b]">Showing the first 300 of {rows.length}. All of them are written.</p>}
                </div>

                {!!s.update && (
                  <label className="flex items-center gap-2 text-sm text-[#1b2837]">
                    <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                    Also update the {s.update} record{s.update > 1 ? 's' : ''} that {s.update > 1 ? 'are' : 'is'} already here
                  </label>
                )}

                {progress && (
                  <div className="rounded-xl bg-[#f7f6f2] p-3">
                    <p className="text-xs font-semibold text-[#1b2837]">Writing {progress.at} of {progress.of}…</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e3e7e7]">
                      <div className="h-full rounded-full bg-[#2a5cac] transition-all" style={{ width: `${Math.round((progress.at / Math.max(1, progress.of)) * 100)}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className={btnGhost} disabled={!!busy} onClick={reset}><X className="h-4 w-4" /> Choose another file</button>
                  <button type="button" className={btnPrimary} disabled={!!busy || !willWrite} onClick={write}>
                    {busy === 'commit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {willWrite ? `Write ${willWrite} row${willWrite > 1 ? 's' : ''}` : 'Nothing to write'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
