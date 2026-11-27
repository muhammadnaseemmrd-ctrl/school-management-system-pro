import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Building2, Camera, FileText, Gift, Loader2, Search, Wallet, UserCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { compressImage } from '../../utils/imageCompress';
import { openProxiedFile } from '../../utils/fileProxy';
import ProfileEditor from '../ProfileEditor';
import BackupPanel from '../BackupPanel';
import { PROVINCES } from '../../utils/pakistan';
import { clearBranding } from '../../utils/useBranding';

const Card = ({ className = '', children }) => <div className={`rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm ${className}`}>{children}</div>;
const inputCls = 'w-full rounded-xl border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]';
const Field = ({ label, children, hint }) => (<div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">{label}</label>{children}{hint && <p className="mt-1 text-[11px] text-[#5b6b7b]">{hint}</p>}</div>);
const btn = 'rounded-xl bg-[#2a5cac] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#234c91] disabled:opacity-50';
const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const SUBS = [['identity', 'School profile', Building2], ['payments', 'Payment details', Wallet], ['plan', 'Plan & offers', Gift], ['documents', 'People documents', FileText], ['backup', 'Backup & export', Archive], ['me', 'My account', UserCircle2]];

const SchoolSetup = () => {
  const [sub, setSub] = useState('identity');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUBS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setSub(id)} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black ${sub === id ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white text-[#3b4a5c] hover:bg-[#f7f6f2]'}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      {(sub === 'identity' || sub === 'payments') && <SchoolForm part={sub} />}
      {sub === 'plan' && <PlanOffers />}
      {sub === 'documents' && <PeopleDocs />}
      {sub === 'backup' && <div className="max-w-3xl"><BackupPanel base="/backup" /></div>}
      {sub === 'me' && <ProfileEditor />}
    </div>
  );
};

/* ───────── school profile / payment details ───────── */
const SchoolForm = ({ part }) => {
  const [school, setSchool] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  // the kinds of institution, so the picker can explain what each one changes
  const [types, setTypes] = useState([]);
  useEffect(() => { apiClient.get('/schools/institution-types').then((r) => setTypes(r.data.types || [])).catch(() => {}); }, []);
  const logoRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get('/schools/my');
      const s = r.data.school; setSchool(s);
      setF({
        name: s.name || '', nameUr: s.nameUr || '', institutionType: s.institutionType || 'school', motto: s.motto || '', academicYear: s.academicYear || '', phone: s.phone || '', website: s.website || '',
        principalName: s.principalName || '', principalEmail: s.principalEmail || '', timezone: s.timezone || 'Asia/Karachi', logo: s.logo || '',
        address: { street: '', city: '', province: '', postalCode: '', country: 'Pakistan', ...(s.address || {}) },
        paymentInfo: { bankName: '', accountTitle: '', accountNumber: '', iban: '', jazzcash: '', easypaisa: '', instructions: '', ...(s.paymentInfo || {}) },
      });
    } catch (e) { toast.error(e.response?.data?.message || 'Could not load school'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!f) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>;

  const save = async (payload) => {
    try {
      setSaving(true);
      await apiClient.put(`/schools/${school._id}`, payload);
      clearBranding(); window.dispatchEvent(new Event('branding-changed'));
      toast.success('Saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setAddr = (k) => (e) => setF({ ...f, address: { ...f.address, [k]: e.target.value } });
  const setPay = (k) => (e) => setF({ ...f, paymentInfo: { ...f.paymentInfo, [k]: e.target.value } });

  const changeLogo = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image');
    try {
      setBusyLogo(true);
      const small = await compressImage(file, 600, 0.9);
      const fd = new FormData(); fd.append('file', small);
      const up = await apiClient.post('/upload?purpose=branding', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setF({ ...f, logo: up.data.url });
      await save({ logo: up.data.url });
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setBusyLogo(false); }
  };

  if (part === 'payments') {
    return (
      <Card className="max-w-3xl space-y-4">
        <div><h2 className="text-xl font-black text-[#1b2837]">Where should parents send fees?</h2><p className="text-xs text-[#5b6b7b]">Shown on the Fees screen of every parent and student, above the screenshot upload.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bank name"><input className={inputCls} value={f.paymentInfo.bankName} onChange={setPay('bankName')} placeholder="e.g. Meezan Bank" /></Field>
          <Field label="Account title"><input className={inputCls} value={f.paymentInfo.accountTitle} onChange={setPay('accountTitle')} /></Field>
          <Field label="Account number"><input className={inputCls} value={f.paymentInfo.accountNumber} onChange={setPay('accountNumber')} /></Field>
          <Field label="IBAN"><input className={inputCls} value={f.paymentInfo.iban} onChange={setPay('iban')} /></Field>
          <Field label="JazzCash number"><input className={inputCls} value={f.paymentInfo.jazzcash} onChange={setPay('jazzcash')} /></Field>
          <Field label="Easypaisa number"><input className={inputCls} value={f.paymentInfo.easypaisa} onChange={setPay('easypaisa')} /></Field>
        </div>
        <Field label="Other instructions (optional)"><textarea rows={2} className={inputCls} value={f.paymentInfo.instructions} onChange={setPay('instructions')} placeholder="e.g. Write the student's roll number in the payment note" /></Field>
        <button disabled={saving} onClick={() => save({ paymentInfo: f.paymentInfo })} className={btn}>{saving ? 'Saving...' : 'Save payment details'}</button>
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          {f.logo ? <img src={f.logo} alt="logo" className="h-24 w-24 rounded-2xl border border-[#e3e7e7] bg-white object-contain" /> : <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[#2a5cac]/10 text-3xl font-black text-[#2a5cac]">{f.name.charAt(0)}</div>}
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={changeLogo} />
          <button onClick={() => logoRef.current?.click()} className="absolute -bottom-2 -end-2 rounded-full bg-[#2a5cac] p-2 text-white shadow" title="Change logo">{busyLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}</button>
        </div>
        <div><h2 className="text-xl font-black text-[#1b2837]">School profile</h2><p className="text-xs text-[#5b6b7b]">Logo and name appear at the top of every page for your teachers, students and parents. School code: <b className="font-mono">{school.code}</b></p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="School name"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="What kind of institution this is">
          <select className={inputCls} value={f.institutionType} onChange={set('institutionType')}>
            {(types.length ? types : [{ key: 'school', label: 'School' }]).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[#5b6b7b]">
            {(types.find((t) => t.key === f.institutionType) || {}).blurb || 'This decides which screens your staff see. A school has a nursery and no registrar; a university the other way round.'}
          </p>
        </Field>
        <Field label="School name in Urdu"><input className={inputCls} dir="rtl" lang="ur" value={f.nameUr} onChange={set('nameUr')} placeholder="اسکول کا نام" maxLength={160} /><p className="mt-1 text-[11px] text-[#5b6b7b]">Shown instead of the English name while a page is in Urdu. Leave it empty to keep the English name.</p></Field>
        <Field label="Motto / tagline"><input className={inputCls} value={f.motto} onChange={set('motto')} /></Field>
        <Field label="Academic year"><input className={inputCls} value={f.academicYear} onChange={set('academicYear')} placeholder="2026-2027" /></Field>
        <Field label="School phone"><input className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Website"><input className={inputCls} value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        <Field label="Time zone" hint="Used for the attendance 'today'."><input className={inputCls} value={f.timezone} onChange={set('timezone')} /></Field>
        <Field label="Principal name"><input className={inputCls} value={f.principalName} onChange={set('principalName')} /></Field>
        <Field label="Principal email"><input type="email" className={inputCls} value={f.principalEmail} onChange={set('principalEmail')} /></Field>
        <div className="sm:col-span-2"><Field label="Street address"><input className={inputCls} value={f.address.street || ''} onChange={setAddr('street')} /></Field></div>
        <Field label="City"><input className={inputCls} value={f.address.city || ''} onChange={setAddr('city')} /></Field>
        <Field label="Province"><select className={inputCls} value={f.address.province || f.address.state || ''} onChange={setAddr('province')}><option value="">Select province</option>{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Postal code"><input className={inputCls} value={f.address.postalCode || f.address.zipCode || ''} onChange={setAddr('postalCode')} /></Field>
        <Field label="Country"><input className={inputCls} value={f.address.country || ''} onChange={setAddr('country')} /></Field>
      </div>
      <button disabled={saving} onClick={() => { const { paymentInfo, ...rest } = f; save(rest); }} className={btn}>{saving ? 'Saving...' : 'Save school profile'}</button>
    </Card>
  );
};

/* ───────── plan, usage, offers ───────── */
const PlanOffers = () => {
  const [b, setB] = useState(null);
  useEffect(() => { apiClient.get('/schools/billing').then((r) => setB(r.data)).catch((e) => toast.error(e.response?.data?.message || 'Could not load plan')); }, []);
  if (!b) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>;
  const bar = (n, lim) => (lim ? Math.min(100, Math.round((n / lim) * 100)) : 8);
  return (
    <div className="space-y-4">
      <Card className="max-w-3xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-wide text-[#5b6b7b]">Your plan</p><h2 className="text-2xl font-black text-[#1b2837]">{b.plan.label}</h2></div>
          <div className="text-end">
            {b.appliedOffer ? <><p className="text-xs text-[#5b6b7b] line-through">{rs(b.plan.pricePKR)} / month</p><p className="text-2xl font-black text-emerald-700">{rs(b.pricePayablePKR)} <span className="text-xs font-semibold">/ month</span></p><p className="text-[11px] font-bold text-emerald-700">Offer applied: {b.appliedOffer.title}</p></>
              : <p className="text-2xl font-black text-[#2a5cac]">{rs(b.plan.pricePKR)} <span className="text-xs font-semibold text-[#5b6b7b]">/ month</span></p>}
          </div>
        </div>
        {[['Students', b.usage.students, b.usage.studentLimit], ['Teachers', b.usage.teachers, b.usage.teacherLimit]].map(([l, n, lim]) => (
          <div key={l}><div className="flex justify-between text-xs font-bold text-[#3b4a5c]"><span>{l}</span><span>{n} / {lim || 'Unlimited'}</span></div><div className="mt-1 h-2.5 rounded-full bg-[#eef2f8]"><div className="h-2.5 rounded-full bg-[#2a5cac]" style={{ width: `${bar(n, lim)}%` }} /></div></div>
        ))}
        <p className="text-xs text-[#5b6b7b]">Renews / expires: <b>{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : 'No expiry set'}</b>. To upgrade or renew, contact the platform owner.</p>
      </Card>
      <div><h3 className="mb-2 text-sm font-black uppercase tracking-wide text-[#5b6b7b]">Current offers</h3>
        {b.offers.length === 0 && <Card className="max-w-3xl"><p className="py-3 text-center text-sm italic text-[#5b6b7b]">No offers right now. You will get a notification when one starts.</p></Card>}
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          {b.offers.map((o) => (
            <Card key={o._id} className="space-y-2 border-amber-300 bg-amber-50/60">
              <div className="flex items-center justify-between"><p className="text-base font-black text-[#1b2837]">🎁 {o.title}</p><span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-white">{o.discountType === 'percent' ? `${o.discountValue}% off` : `Rs ${o.discountValue} off`}</span></div>
              {o.description && <p className="text-xs text-[#3b4a5c]">{o.description}</p>}
              <ul className="text-xs text-[#3b4a5c]">{Object.entries(o.prices).map(([k, p]) => <li key={k}>{p.label}: <s className="text-[#5b6b7b]">{rs(p.original)}</s> <b className="text-emerald-700">{rs(p.discounted)}</b></li>)}</ul>
              <p className="text-[11px] font-semibold text-[#5b6b7b]">{o.code ? <>Code: <b className="font-mono text-[#2a5cac]">{o.code}</b> · </> : null}{o.validUntil ? `Valid until ${new Date(o.validUntil).toLocaleDateString()}` : 'No end date'}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ───────── look at a person's uploaded documents ───────── */
const PeopleDocs = () => {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setPeople([]); return undefined; }
    const h = setTimeout(() => apiClient.get('/profile/people', { params: { q } }).then((r) => setPeople(r.data.people)).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [q]);
  const show = async (p) => { try { const r = await apiClient.get(`/profile/documents/${p.role}/${p._id}`); setOpen({ ...p, ...r.data }); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } };
  return (
    <Card className="max-w-3xl space-y-3">
      <div><h2 className="text-xl font-black text-[#1b2837]">Documents uploaded by students, teachers and parents</h2><p className="text-xs text-[#5b6b7b]">Type at least 2 letters of a name.</p></div>
      <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6b7b]" /><input className={`${inputCls} ps-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name..." /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {people.map((p) => <button key={p.role + p._id} onClick={() => show(p)} className="flex items-center justify-between rounded-xl border border-[#e3e7e7] bg-white px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]"><span><b>{p.name}</b> <span className="text-[11px] capitalize text-[#5b6b7b]">{p.role}</span></span><span className="rounded-full bg-[#2a5cac]/10 px-2 py-0.5 text-[11px] font-black text-[#2a5cac]">{p.documents} file(s)</span></button>)}
      </div>
      {open && (
        <div className="rounded-2xl border border-[#e3e7e7] bg-white p-4">
          <h3 className="font-black">{open.name}</h3>
          <p className="text-xs text-[#5b6b7b]">{[open.phone, open.extra?.city, open.extra?.address].filter(Boolean).join(' · ')}{open.extra?.emergencyName ? ` · Emergency: ${open.extra.emergencyName} ${open.extra.emergencyPhone || ''}` : ''}</p>
          <div className="mt-2 space-y-1.5">
            {open.documents.length === 0 && <p className="text-xs italic text-[#5b6b7b]">No documents uploaded.</p>}
            {open.documents.map((d) => <button key={d._id} onClick={() => openProxiedFile(d.url)} className="flex w-full items-center gap-2 rounded-lg border border-[#eef2f8] px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]"><FileText className="h-4 w-4 text-[#2a5cac]" /><span className="flex-1 truncate font-bold">{d.title}</span><span className="text-[11px] text-[#5b6b7b]">{d.category} · {new Date(d.uploadedAt).toLocaleDateString()}</span></button>)}
          </div>
        </div>
      )}
    </Card>
  );
};

export default SchoolSetup;
