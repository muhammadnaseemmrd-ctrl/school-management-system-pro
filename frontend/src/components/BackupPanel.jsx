import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Loader2, ShieldCheck, Trash2, CalendarClock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../utils/apiClient';

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);
const fmtDate = (d) => new Date(d).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

// A failed download comes back as a Blob, so read the message out of it
const errorText = async (e) => {
  const d = e.response?.data;
  if (d instanceof Blob) { try { return JSON.parse(await d.text()).message; } catch { return 'Download failed'; } }
  return d?.message || e.message || 'Request failed';
};

const saveBlob = (res, fallback) => {
  const name = /filename="?([^";]+)"?/i.exec(res.headers['content-disposition'] || '')?.[1] || fallback;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  const note = decodeURIComponent(res.headers['x-backup-notes'] || '');
  if (note) toast(note, { icon: 'ℹ️', duration: 9000 });
};

/**
 * Backup & export card. `base` is the API root: '/backup' for a school admin, or
 * `/superadmin/schools/<id>/backups` for the platform owner.
 */
const BackupPanel = ({ base, title = 'Backup & export' }) => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [withFiles, setWithFiles] = useState(false);

  const load = useCallback(async () => {
    try { setData((await apiClient.get(base)).data); } catch (e) { toast.error(e.response?.data?.message || 'Could not load backups'); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const download = async (url, key, fallback, params) => {
    setBusy(key);
    try { saveBlob(await apiClient.get(url, { responseType: 'blob', params }), fallback); toast.success('Backup downloaded'); }
    catch (e) { toast.error(await errorText(e)); }
    finally { setBusy(''); }
  };
  const makeNow = async () => {
    setBusy('make');
    try { await apiClient.post(base, {}); toast.success('Backup saved'); await load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Backup failed'); }
    finally { setBusy(''); }
  };
  const remove = async (b) => {
    if (!window.confirm('Delete this saved backup?')) return;
    try { await apiClient.delete(`${base}/${b._id}`); setData((d) => ({ ...d, backups: d.backups.filter((x) => x._id !== b._id) })); }
    catch (e) { toast.error(e.response?.data?.message || 'Delete failed'); }
  };

  const last = data?.backups?.[0];
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-[#cfe0d6] bg-[#fbfdfb] p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-[#0f6b4f]/10 p-3 text-[#0f6b4f]"><ShieldCheck className="h-6 w-6" /></span>
          <div>
            <h2 className="text-xl font-black text-[#0c2f25]">{title}</h2>
            <p className="mt-1 text-sm text-[#355e4d]">A copy of all school data is saved automatically every week (the latest 4 are kept). You can also download everything to keep on your own computer.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e1eee6] bg-white p-3"><p className="text-[11px] font-bold uppercase text-[#4f7262]">Last backup</p><p className="mt-1 text-sm font-black text-[#0c2f25]">{last ? fmtDate(last.createdAt) : 'None yet'}</p></div>
          <div className="rounded-2xl border border-[#e1eee6] bg-white p-3"><p className="text-[11px] font-bold uppercase text-[#4f7262]">Automatic schedule</p><p className="mt-1 flex items-center gap-1.5 text-sm font-black text-[#0c2f25]"><CalendarClock className="h-4 w-4 text-[#0f6b4f]" />Every week</p></div>
          <div className="rounded-2xl border border-[#e1eee6] bg-white p-3"><p className="text-[11px] font-bold uppercase text-[#4f7262]">Saved copies</p><p className="mt-1 text-sm font-black text-[#0c2f25]">{data ? data.backups.length : '…'}</p></div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={!!busy} onClick={() => download(`${base}/download`, 'full', 'backup.zip', withFiles ? { includeFiles: 1 } : undefined)} className="inline-flex items-center gap-2 rounded-xl bg-[#0f6b4f] px-5 py-2.5 text-xs font-bold text-[#edf5f0] hover:bg-[#0b5340] disabled:opacity-50">
            {busy === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download full backup (.zip)
          </button>
          <button disabled={!!busy} onClick={makeNow} className="inline-flex items-center gap-2 rounded-xl border border-[#0f6b4f] bg-white px-5 py-2.5 text-xs font-bold text-[#0f6b4f] hover:bg-[#e9f2ed] disabled:opacity-50">
            {busy === 'make' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Save a backup now
          </button>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#355e4d]"><input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />Also include uploaded documents &amp; payment screenshots</label>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#4f7262]">The ZIP has an Excel workbook (one sheet per table) and the full data file. Passwords are never included. It contains personal data of students and staff (CNIC / B-Form numbers, phone numbers), so keep it private.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[#cfe0d6] bg-[#fbfdfb] shadow-sm">
        <div className="border-b border-[#e1eee6] px-5 py-3"><h3 className="text-sm font-black uppercase tracking-wide text-[#4f7262]">Saved backups</h3></div>
        {!data && <p className="p-5 text-sm text-[#4f7262]">Loading…</p>}
        {data && data.backups.length === 0 && <p className="p-5 text-sm italic text-[#4f7262]">No saved backups yet. The first automatic one is made within a week, or press “Save a backup now”.</p>}
        <ul className="divide-y divide-[#e1eee6]">
          {data?.backups.map((b) => (
            <li key={b._id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#0c2f25]">{fmtDate(b.createdAt)}</p>
                <p className="text-[11px] text-[#4f7262]">{b.counts?.Student ?? 0} students · {b.counts?.Teacher ?? 0} teachers · {fmtSize(b.size)}{b.createdByName ? ` · ${b.createdByName}` : ''}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${b.kind === 'auto' ? 'bg-emerald-50 text-emerald-800' : 'bg-[#0f6b4f]/10 text-[#0f6b4f]'}`}>{b.kind === 'auto' ? 'Weekly' : 'Manual'}</span>
              <button disabled={!!busy} onClick={() => download(`${base}/${b._id}/download`, b._id, 'backup.zip')} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cfe0d6] bg-white px-3 py-1.5 text-xs font-bold text-[#0f6b4f] hover:bg-[#e9f2ed] disabled:opacity-50">{busy === b._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download</button>
              <button title="Delete" onClick={() => remove(b)} className="rounded-lg border border-[#cfe0d6] bg-white p-1.5 text-[#be123c] hover:bg-[#fff1f2]"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default BackupPanel;
