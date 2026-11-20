import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, ShieldAlert, Search } from 'lucide-react';
import apiClient from '../utils/apiClient';

// Public page: anyone holding a transcript can type the check code on it and see whether the school issued it.
// Only a shortened name, the programme and the dates are shown.
const KEY = /[A-F0-9]{12}/i;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const STYLE = {
  Valid: { icon: BadgeCheck, cls: 'border-[#9ad0b6] bg-[#ecf6f1] text-[#1f6b4d]', head: 'This transcript is genuine', sub: 'The school issued it and the content has not been changed.' },
  Altered: { icon: ShieldAlert, cls: 'border-[#e3b4ac] bg-[#fff1f2] text-[#9f1239]', head: 'This transcript does not match the school record', sub: 'The school record for this number has been changed. Do not accept the paper. Contact the school.' },
  Withdrawn: { icon: ShieldAlert, cls: 'border-[#e3b4ac] bg-[#fff1f2] text-[#9f1239]', head: 'This transcript has been withdrawn', sub: 'The school cancelled it. Do not accept it.' },
};

export default function VerifyTranscript() {
  const { key } = useParams(); const nav = useNavigate();
  const [state, setState] = useState({ loading: !!key, data: null, error: '' }); const [code, setCode] = useState('');
  useEffect(() => {
    document.title = 'Check a transcript · Aulensia';
    if (!key) { setState({ loading: false, data: null, error: '' }); return undefined; }
    let live = true; setState({ loading: true, data: null, error: '' });
    apiClient.get(`/public/registrar/verify/${encodeURIComponent(key)}`).then((r) => live && setState({ loading: false, data: r.data, error: '' }))
      .catch((e) => live && setState({ loading: false, data: null, error: e.response?.status === 429 ? 'Too many checks from this connection. Please wait a minute and try again.' : e.response?.status === 404 ? 'We could not find a transcript with this code.' : 'We could not check this right now. Please try again.' }));
    return () => { live = false; };
  }, [key]);
  const submit = (e) => { e.preventDefault(); const m = code.replace(/[\s-]/g, '').match(KEY); if (m) nav(`/verify-transcript/${m[0].toUpperCase()}`); else setState({ loading: false, data: null, error: 'That does not look like a check code. It has 12 letters and numbers and is printed at the bottom of the transcript.' }); };
  const d = state.data; const st = d ? STYLE[d.status] || STYLE.Withdrawn : null; const Icon = st?.icon;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">Aulensia</p>
        <h1 className="mb-5 text-center text-2xl font-semibold text-[#1b2837]">Check a transcript</h1>
        {state.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Checking"><div className="skeleton mb-3 h-6 w-2/3" /><div className="skeleton h-20" /></div>}
        {d && st && (
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-live="polite">
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${st.cls}`} role="status"><Icon size={26} className="mt-0.5 shrink-0" aria-hidden="true" /><div><div className="text-lg font-semibold">{st.head}</div><p className="text-sm">{st.sub}</p></div></div>
            <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-[#5b6b7b]">School</dt><dd className="font-medium text-[#1b2837]">{d.school}</dd>
              <dt className="text-[#5b6b7b]">Student</dt><dd>{d.student}</dd>
              <dt className="text-[#5b6b7b]">Programme</dt><dd>{d.program}</dd>
              <dt className="text-[#5b6b7b]">Kind</dt><dd>{d.kind === 'final' ? 'Final transcript' : 'Official transcript'}</dd>
              <dt className="text-[#5b6b7b]">Number</dt><dd className="font-mono text-xs">{d.serial}</dd>
              <dt className="text-[#5b6b7b]">Issued on</dt><dd>{fmt(d.issuedAt)}</dd>
            </dl>
            <p className="mt-4 text-xs text-[#5b6b7b]">Compare the number, programme and initials with the paper you are holding. If they differ, do not trust the paper. For grades or anything else, contact the school.</p>
          </section>
        )}
        {state.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert"><div className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert size={18} aria-hidden="true" /> Not found</div>{state.error}</div>}
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-[#e3e7e7] bg-white p-5"><label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Check code from the transcript</span><input className="w-full rounded-lg border border-[#e3e7e7] bg-white px-3 py-2.5 font-mono text-sm uppercase text-[#1b2837] outline-none focus:border-[#2a5cac]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3D4E5F6" autoComplete="off" /></label><button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#2a5cac] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234c91]"><Search size={16} aria-hidden="true" /> Check</button></form>
      </div>
    </main>
  );
}
