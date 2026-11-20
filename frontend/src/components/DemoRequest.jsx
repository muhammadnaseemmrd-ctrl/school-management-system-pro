import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import apiClient from '../utils/apiClient';

// Remember where the visitor came from for this visit only: the partner code and campaign tags on the link they used.
export function captureCampaign() {
  try {
    const q = new URLSearchParams(window.location.search); const keep = (k, to) => { const v = (q.get(k) || '').trim().slice(0, 80); if (v) sessionStorage.setItem(`aul-${to}`, v); };
    keep('ref', 'ref'); keep('utm_source', 'utmSource'); keep('utm_medium', 'utmMedium'); keep('utm_campaign', 'utmCampaign');
  } catch { /* storage may be blocked: the form still works */ }
}
const recall = (k) => { try { return sessionStorage.getItem(`aul-${k}`) || ''; } catch { return ''; } };

const input = 'w-full rounded-lg border border-[#a9b4bf] bg-white px-3 py-2.5 text-sm text-[#1b2837] focus:border-[#2a5cac] focus:outline-none focus:ring-2 focus:ring-[#2a5cac]/30';
const Row = ({ label, children, hint }) => (<label className="block text-sm font-semibold text-[#2b3a4d]">{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-[#5b6b7b]">{hint}</span>}</label>);

export default function DemoRequest({ open, interest = 'demo', onClose }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', schoolName: '', city: '', role: 'Principal', students: '', interest, message: '', preferredTime: '', consent: false, website: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(null); const first = useRef(null);
  useEffect(() => { if (open) { setF((x) => ({ ...x, interest })); setErr(''); setDone(null); setTimeout(() => first.current && first.current.focus(), 30); } }, [open, interest]);
  useEffect(() => { if (!open) return undefined; const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await apiClient.post('/public/leads', { ...f, students: f.students ? Number(f.students) : 0, refCode: recall('ref'), utmSource: recall('utmSource'), utmMedium: recall('utmMedium'), utmCampaign: recall('utmCampaign'), source: recall('utmSource') ? '' : 'website' }); setDone(r.data); }
    catch (x) { setErr(x.response?.data?.message || 'Could not send your request. Please try again.'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1b2837]/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="demo-title" className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[#f7f6f2] p-6 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="demo-title" className="font-display text-2xl font-bold text-[#1b2837]">{done ? 'We have your request' : f.interest === 'quote' ? 'Get a quote for your school' : f.interest === 'question' ? 'Ask us a question' : 'Book a demo'}</h2>
            {!done && <p className="mt-1 text-sm text-[#3b4a5c]">Tell us a little about your school. A person from our team will reply, usually within one working day.</p>}</div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[#2a5cac] hover:bg-[#eef2f8]"><X className="h-5 w-5" /></button>
        </div>
        {done ? (
          <div className="mt-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-[#2c776c]" aria-hidden="true" />
            <p className="mt-4 text-[#1b2837]">{done.message}</p>
            {done.reference && <p className="mt-2 text-sm text-[#5b6b7b]">Your reference: <span className="font-mono font-bold text-[#1b2837]">{done.reference}</span></p>}
            <button onClick={onClose} className="mt-6 rounded-lg bg-[#2a5cac] px-6 py-3 font-semibold text-white hover:bg-[#234c91]">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-4" noValidate>
            <fieldset className="grid grid-cols-3 gap-2" aria-label="What would you like">
              {[['demo', 'A demo'], ['quote', 'A quote'], ['question', 'A question']].map(([k, l]) => (
                <label key={k} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-semibold ${f.interest === k ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#a9b4bf] bg-white text-[#2b3a4d]'}`}>
                  <input type="radio" name="interest" value={k} checked={f.interest === k} onChange={set('interest')} className="sr-only" />{l}</label>))}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="Your name"><input ref={first} className={`mt-1 ${input}`} value={f.name} onChange={set('name')} autoComplete="name" required maxLength={120} /></Row>
              <Row label="Your role"><select className={`mt-1 ${input}`} value={f.role} onChange={set('role')}>{['Principal', 'Owner', 'Administrator', 'Teacher', 'Other'].map((r) => <option key={r}>{r}</option>)}</select></Row>
              <Row label="Email"><input type="email" className={`mt-1 ${input}`} value={f.email} onChange={set('email')} autoComplete="email" required maxLength={160} /></Row>
              <Row label="Phone or WhatsApp"><input type="tel" className={`mt-1 ${input}`} value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="0300 1234567" maxLength={30} /></Row>
              <Row label="School name"><input className={`mt-1 ${input}`} value={f.schoolName} onChange={set('schoolName')} required maxLength={160} /></Row>
              <Row label="City"><input className={`mt-1 ${input}`} value={f.city} onChange={set('city')} maxLength={80} /></Row>
              <Row label="About how many students?"><input type="number" min="0" max="100000" inputMode="numeric" className={`mt-1 ${input}`} value={f.students} onChange={set('students')} /></Row>
              {f.interest === 'demo' && <Row label="Best time to call"><input className={`mt-1 ${input}`} value={f.preferredTime} onChange={set('preferredTime')} placeholder="e.g. weekdays after 2pm" maxLength={80} /></Row>}
            </div>
            <Row label="Anything we should know? (optional)"><textarea rows={3} className={`mt-1 ${input}`} value={f.message} onChange={set('message')} maxLength={1000} /></Row>
            {/* a real person never sees or fills this; robots do */}
            <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
            <label className="flex items-start gap-3 text-sm text-[#2b3a4d]"><input type="checkbox" checked={f.consent} onChange={set('consent')} className="mt-1 h-4 w-4" /><span>I agree that Aulensia may contact me about this request and keep these details to follow it up.</span></label>
            {err && <p role="alert" className="rounded-lg border border-[#e3b4a4] bg-[#fbf0ec] px-3 py-2 text-sm text-[#8a3a28]">{err}</p>}
            <button disabled={busy} className="rounded-lg bg-[#2a5cac] px-6 py-3 font-bold text-white transition hover:bg-[#234c91] disabled:opacity-60">{busy ? 'Sending…' : 'Send request'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
