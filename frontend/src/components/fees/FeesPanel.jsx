import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, XCircle, Wallet, X, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { compressImage } from '../../utils/imageCompress';
import { useLang } from '../../i18n/LanguageContext';

export const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const METHODS = ['Bank transfer', 'JazzCash', 'Easypaisa', 'Cash deposit', 'Other'];
const CHIP = {
  Paid: ['bg-emerald-50 text-emerald-800 border-emerald-200', CheckCircle2],
  'Under review': ['bg-amber-50 text-amber-800 border-amber-200', Clock],
  Rejected: ['bg-rose-50 text-rose-800 border-rose-200', XCircle],
  Unpaid: ['bg-white text-[#6d4c35] border-[#d9c5b0]', Wallet],
};
export const StatusPill = ({ status }) => {
  const { t } = useLang();
  const [cls, Icon] = CHIP[status] || CHIP.Unpaid;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${cls}`}><Icon className="h-3.5 w-3.5" />{t(status)}</span>;
};

// Students and parents can only SEND a payment screenshot here. The school decides if it is Paid.
const FeesPanel = ({ studentId, studentName }) => {
  const { t, fmtDate } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ method: 'JazzCash', reference: '', note: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiClient.get(studentId ? `/fees/summary/${studentId}` : '/fees/summary');
      setData(r.data);
    } catch (e) {
      setData(null);
      toast.error(e.response?.data?.message || t('Could not load fees'));
    } finally { setLoading(false); }
  }, [studentId, t]);
  useEffect(() => { setPicked([]); setOpen(false); load(); }, [load]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const payable = useMemo(() => (data?.items || []).filter((i) => i.status === 'Unpaid' || i.status === 'Rejected'), [data]);
  const total = useMemo(() => payable.filter((i) => picked.includes(i.key)).reduce((s, i) => s + i.amount, 0), [payable, picked]);
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const chooseFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/|application\/pdf/.test(f.type)) return toast.error(t('Please choose a photo, screenshot or PDF'));
    const small = await compressImage(f);
    if (small.size > 4 * 1024 * 1024) return toast.error(t('File is too large (max 4 MB)'));
    setFile(small);
    setPreview(small.type.startsWith('image/') ? URL.createObjectURL(small) : '');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!picked.length) return toast.error(t('Choose which fees you paid'));
    if (!file) return toast.error(t('Please add the payment screenshot'));
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append('file', file);
      const up = await apiClient.post('/upload?purpose=payment', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await apiClient.post('/fees/proofs', { studentId, itemKeys: picked, method: form.method, reference: form.reference, note: form.note, screenshotUrl: up.data.url });
      toast.success(t('Sent! The school will check it and mark the fee as paid.'));
      setPicked([]); setFile(null); setPreview(''); setOpen(false); setForm({ method: 'JazzCash', reference: '', note: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || t('Could not send the payment')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-[#7a4e2d] border-t-transparent" /></div>;
  if (!data) return null;
  const { totals } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Due', totals.due, 'text-[#be123c]'], ['Under review', totals.underReview, 'text-amber-700'], ['Paid', totals.paid, 'text-emerald-700']].map(([l, v, c]) => (
          <div key={l} className="rounded-2xl border border-[#d9c5b0] bg-white px-2 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a6a50]">{t(l)}</p><p className={`text-base font-black sm:text-lg ${c}`}>{rs(v)}</p></div>
        ))}
      </div>

      {!data.hasStructure && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#d9c5b0] bg-white p-6 text-center text-sm text-[#8a6a50]">{t('The school has not added any fees for {name} yet.', { name: studentName || data.student.name })}</div>
      )}

      <div className="space-y-2">
        {data.items.map((i) => {
          const canPick = i.status === 'Unpaid' || i.status === 'Rejected';
          return (
            <label key={i.key} className={`flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 ${canPick ? 'cursor-pointer hover:border-[#7a4e2d]' : ''} ${picked.includes(i.key) ? 'border-[#7a4e2d] ring-1 ring-[#7a4e2d]' : 'border-[#d9c5b0]'}`}>
              {canPick ? <input type="checkbox" className="mt-1 h-5 w-5 accent-[#7a4e2d]" checked={picked.includes(i.key)} onChange={() => toggle(i.key)} /> : <span className="w-5" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-[#3f2a1d]">{i.title}</p><StatusPill status={i.status} />
                </div>
                <p className="mt-0.5 text-sm font-bold text-[#7a4e2d]">{rs(i.amount)}{i.dueDate ? <span className="ml-2 text-xs font-semibold text-[#8a6a50]">{t('Due')} {fmtDate(String(i.dueDate).slice(0, 10), { day: 'numeric', month: 'short' })}</span> : null}</p>
                {i.status === 'Rejected' && i.reviewNote && <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800">{t('School note')}: {i.reviewNote}</p>}
              </div>
            </label>
          );
        })}
      </div>

      {payable.length > 0 && !open && (
        <button disabled={!picked.length} onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7a4e2d] px-5 py-4 text-base font-black text-white shadow-sm hover:bg-[#633d22] disabled:opacity-40">
          <Camera className="h-5 w-5" /> {picked.length ? t('I paid {amount} - upload screenshot', { amount: rs(total) }) : t('Select the fees you paid')}
        </button>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3 rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-4 shadow-sm">
          <div className="flex items-center justify-between"><h3 className="text-base font-black text-[#3f2a1d]">{t('Send payment proof')} · {rs(total)}</h3><button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-[#7a4e2d]/10"><X className="h-5 w-5" /></button></div>
          <p className="text-xs font-semibold text-[#8a6a50]">{t('Pay through your bank or wallet first, then upload the screenshot. Fees turn Paid only after the school checks it.')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-bold text-[#6d4c35]">{t('Paid by')}</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full rounded-xl border border-[#d9c5b0] bg-white px-3 py-3 text-sm">{METHODS.map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-bold text-[#6d4c35]">{t('Transaction ID (optional)')}</label>
              <input value={form.reference} maxLength={80} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full rounded-xl border border-[#d9c5b0] bg-white px-3 py-3 text-sm" /></div>
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={chooseFile} />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c9ab8c] bg-white px-4 py-5 text-sm font-black text-[#7a4e2d] hover:bg-[#f7efe4]">
              {preview ? <img src={preview} alt="" className="max-h-48 rounded-xl" /> : file ? <><FileText className="h-5 w-5" />{file.name}</> : <><Camera className="h-5 w-5" />{t('Add payment screenshot or photo')}</>}
            </button>
          </div>
          <textarea rows={2} value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t('Message for the school (optional)')} className="w-full rounded-xl border border-[#d9c5b0] bg-white px-3 py-2.5 text-sm" />
          <button disabled={busy} className="w-full rounded-2xl bg-[#7a4e2d] px-5 py-3.5 text-base font-black text-white hover:bg-[#633d22] disabled:opacity-50">{busy ? t('Sending...') : t('Send to school')}</button>
        </form>
      )}

      {data.proofs.length > 0 && (
        <div>
          <h3 className="mb-2 mt-2 text-sm font-black uppercase tracking-wide text-[#8a6a50]">{t('My payment submissions')}</h3>
          <div className="space-y-2">
            {data.proofs.map((p) => (
              <div key={p._id} className="flex items-start gap-3 rounded-2xl border border-[#d9c5b0] bg-white p-3">
                <a href={p.screenshotUrl} target="_blank" rel="noopener noreferrer" className="shrink-0"><img src={p.screenshotUrl} alt="" className="h-14 w-14 rounded-lg border border-[#eadcc9] object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /></a>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-[#3f2a1d]">{rs(p.totalAmount)}</b><StatusPill status={p.status === 'Pending' ? 'Under review' : p.status === 'Approved' ? 'Paid' : 'Rejected'} /></div>
                  <p className="mt-0.5 truncate text-[#6d4c35]">{p.items.map((i) => i.label).join(', ')}</p>
                  <p className="text-[#8a6a50]">{new Date(p.createdAt).toLocaleDateString()} · {t(p.method)}</p>
                  {p.status === 'Rejected' && p.reviewNote && <p className="mt-1 rounded bg-rose-50 px-2 py-1 font-semibold text-rose-800">{p.reviewNote}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeesPanel;
