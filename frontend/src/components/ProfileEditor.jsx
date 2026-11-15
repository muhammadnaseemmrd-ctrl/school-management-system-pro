import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../utils/apiClient';
import { compressImage } from '../utils/imageCompress';
import { openProxiedFile } from '../utils/fileProxy';
import { useLang } from '../i18n/LanguageContext';

const inputCls = 'w-full rounded-xl border border-[#cfe0d6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0f6b4f]';
const Field = ({ label, children }) => (<div><label className="mb-1 block text-xs font-bold text-[#355e4d]">{label}</label>{children}</div>);

const upload = async (file, purpose) => {
  const f = await compressImage(file);
  if (f.size > 4 * 1024 * 1024) throw new Error('File is too large (max 4 MB)');
  const fd = new FormData();
  fd.append('file', f);
  const r = await apiClient.post(`/upload?purpose=${purpose}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return { url: r.data.url, name: file.name };
};

// "My profile": photo, contact details, emergency contact and personal documents.
// Works for students, teachers, parents and admins.
const ProfileEditor = () => {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [doc, setDoc] = useState({ title: '', category: 'Other', file: null });
  const [busyDoc, setBusyDoc] = useState(false);
  const photoRef = useRef(null);
  const docRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get('/profile/me');
      setData(r.data.profile); setCats(r.data.categories);
      setForm({ name: r.data.profile.name, phone: r.data.profile.phone, ...r.data.profile.extra });
    } catch (e) { toast.error(e.response?.data?.message || t('Could not load your profile')); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  if (!data || !form) return <div className="flex h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#0f6b4f]" /></div>;

  const save = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { name, phone, ...extra } = form;
      const r = await apiClient.put('/profile/me', { ...(data.canEditName ? { name } : {}), phone, extra });
      setData(r.data.profile); toast.success(t('Profile saved'));
    } catch (err) { toast.error(err.response?.data?.message || t('Could not save')); }
    finally { setSaving(false); }
  };

  const changePhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error(t('Please choose a photo'));
    try {
      setBusyPhoto(true);
      const up = await upload(f, 'profile');
      const r = await apiClient.put('/profile/me', { avatar: up.url });
      setData(r.data.profile); toast.success(t('Photo updated'));
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setBusyPhoto(false); }
  };

  const addDoc = async (e) => {
    e.preventDefault();
    if (!doc.file) return toast.error(t('Choose a file'));
    try {
      setBusyDoc(true);
      const up = await upload(doc.file, 'profile');
      const r = await apiClient.post('/profile/me/documents', { title: doc.title || doc.file.name, category: doc.category, url: up.url, fileName: up.name });
      setData({ ...data, documents: r.data.documents }); setDoc({ title: '', category: 'Other', file: null });
      toast.success(t('Document saved'));
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setBusyDoc(false); }
  };

  const delDoc = async (d) => {
    if (!window.confirm(t('Delete this document?'))) return;
    try { const r = await apiClient.delete(`/profile/me/documents/${d._id}`); setData({ ...data, documents: r.data.documents }); }
    catch (err) { toast.error(err.response?.data?.message || t('Could not delete')); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-5 rounded-3xl border border-[#cfe0d6] bg-[#fbfdfb] p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative">
          {data.avatar ? <img src={data.avatar} alt="" className="h-20 w-20 rounded-full border-2 border-[#0f6b4f] object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0f6b4f] text-3xl font-black text-white">{data.name?.charAt(0)}</div>}
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={changePhoto} />
          <button onClick={() => photoRef.current?.click()} disabled={busyPhoto} className="absolute -bottom-1 -end-1 rounded-full bg-[#0f6b4f] p-2 text-white shadow hover:bg-[#0b5340]" title={t('Change photo')}>
            {busyPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        </div>
        <div>
          <h3 className="text-xl font-black text-[#0c2f25]">{data.name}</h3>
          <p className="text-xs font-semibold text-[#4f7262]">{data.email}</p>
        </div>
      </div>

      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {data.canEditName && <Field label={t('Name')}><input className={inputCls} value={form.name} onChange={set('name')} /></Field>}
        <Field label={t('Mobile number')}><input className={inputCls} value={form.phone} onChange={set('phone')} /></Field>
        <Field label={t('City')}><input className={inputCls} value={form.city} onChange={set('city')} /></Field>
        <Field label={t('Home address')}><input className={inputCls} value={form.address} onChange={set('address')} /></Field>
        <Field label={t('Emergency contact name')}><input className={inputCls} value={form.emergencyName} onChange={set('emergencyName')} /></Field>
        <Field label={t('Emergency contact number')}><input className={inputCls} value={form.emergencyPhone} onChange={set('emergencyPhone')} /></Field>
        <div className="sm:col-span-2"><Field label={t('About me (optional)')}><textarea rows={2} maxLength={500} className={inputCls} value={form.about} onChange={set('about')} /></Field></div>
        <div className="sm:col-span-2"><button disabled={saving} className="rounded-xl bg-[#0f6b4f] px-5 py-2.5 text-sm font-black text-[#edf5f0] hover:bg-[#0b5340] disabled:opacity-50">{saving ? t('Saving...') : t('Save profile')}</button></div>
      </form>

      <div className="border-t border-[#e1eee6] pt-4">
        <h4 className="text-sm font-black uppercase tracking-wide text-[#4f7262]">{t('My documents')}</h4>
        <p className="mt-1 text-xs text-[#4f7262]">{t('Upload certificates, ID copies or other papers. The school admin can see them. Photos, PDF or Word files up to 4 MB.')}</p>
        <form onSubmit={addDoc} className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto_auto]">
          <input className={inputCls} placeholder={t('Document name')} value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
          <select className={inputCls} value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <input ref={docRef} type="file" className="hidden" accept="image/*,application/pdf,.doc,.docx" onChange={(e) => setDoc({ ...doc, file: e.target.files?.[0] || null })} />
          <button type="button" onClick={() => docRef.current?.click()} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#9fc0ae] bg-white px-3 py-2.5 text-xs font-bold text-[#0f6b4f]"><Upload className="h-4 w-4" /><span className="max-w-[8rem] truncate">{doc.file ? doc.file.name : t('Choose file')}</span></button>
          <button disabled={busyDoc || !doc.file} className="rounded-xl bg-[#0f6b4f] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{busyDoc ? '...' : t('Add')}</button>
        </form>
        <div className="mt-3 space-y-2">
          {data.documents.length === 0 && <p className="rounded-xl border border-dashed border-[#cfe0d6] bg-white p-4 text-center text-xs italic text-[#4f7262]">{t('No documents yet.')}</p>}
          {data.documents.map((d) => (
            <div key={d._id} className="flex items-center gap-3 rounded-xl border border-[#cfe0d6] bg-white px-3 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-[#0f6b4f]" />
              <button onClick={() => openProxiedFile(d.url)} className="min-w-0 flex-1 text-start"><p className="truncate text-sm font-bold text-[#0c2f25]">{d.title}</p><p className="text-[11px] text-[#4f7262]">{d.category} · {new Date(d.uploadedAt).toLocaleDateString()}</p></button>
              <button onClick={() => delDoc(d)} className="rounded-lg p-1.5 text-[#be123c] hover:bg-[#fff1f2]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProfileEditor;
