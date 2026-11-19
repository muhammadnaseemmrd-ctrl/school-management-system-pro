import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, ShieldAlert, ShieldQuestion, Search } from 'lucide-react';
import apiClient from '../utils/apiClient';

// Public page: anyone who scans the code on a document, or types its reference, sees whether it is genuine.
// Nothing here needs a sign-in, and only a few safe details are shown.
const TOKEN = /[0-9A-HJKMNP-TV-Z]{24}/i;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const STYLE = {
  Valid: { icon: BadgeCheck, cls: 'border-[#9ad0b6] bg-[#ecf6f1] text-[#1f6b4d]', head: 'This document is genuine', sub: 'It was issued by the school below and has not been withdrawn.' },
  Expired: { icon: ShieldQuestion, cls: 'border-[#ecd9a5] bg-[#fffbee] text-[#8a5a00]', head: 'This document has expired', sub: 'It was genuine, but its validity period has ended.' },
  Replaced: { icon: ShieldAlert, cls: 'border-[#ecd9a5] bg-[#fffbee] text-[#8a5a00]', head: 'This document was replaced', sub: 'The school issued a newer one in its place. Ask the holder for the current document.' },
  Withdrawn: { icon: ShieldAlert, cls: 'border-[#e3b4ac] bg-[#fff1f2] text-[#9f1239]', head: 'This document has been withdrawn', sub: 'The school has cancelled it. Do not accept it.' },
};

export default function VerifyDocument() {
  const { token } = useParams(); const nav = useNavigate();
  const [state, setState] = useState({ loading: !!token, data: null, error: '' }); const [code, setCode] = useState('');
  useEffect(() => {
    document.title = 'Check a document · Aulensia';
    if (!token) { setState({ loading: false, data: null, error: '' }); return undefined; }
    let live = true; setState({ loading: true, data: null, error: '' });
    apiClient.get(`/public/verify/${encodeURIComponent(token)}`).then((r) => live && setState({ loading: false, data: r.data, error: '' }))
      .catch((e) => live && setState({ loading: false, data: null, error: e.response?.status === 429 ? 'Too many checks from this connection. Please wait a minute and try again.' : e.response?.status === 404 ? (e.response.data?.message || 'We could not find a document with this reference.') : 'We could not check this right now. Please try again.' }));
    return () => { live = false; };
  }, [token]);
  const submit = (e) => { e.preventDefault(); const m = code.match(TOKEN); if (m) nav(`/verify/${m[0].toUpperCase()}`); else setState({ loading: false, data: null, error: 'That does not look like a document reference. It has 24 letters and numbers, and is printed under the QR code.' }); };
  const d = state.data; const st = d ? STYLE[d.status] || STYLE.Withdrawn : null; const Icon = st?.icon;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">Aulensia</p>
        <h1 className="mb-5 text-center text-2xl font-semibold text-[#1b2837]">Check a document</h1>
        {state.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Checking"><div className="skeleton mb-3 h-6 w-2/3" /><div className="skeleton h-20" /></div>}
        {d && st && (
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-live="polite">
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${st.cls}`} role="status"><Icon size={26} className="mt-0.5 shrink-0" aria-hidden="true" /><div><div className="text-lg font-semibold">{st.head}</div><p className="text-sm">{st.sub}</p></div></div>
            <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-[#5b6b7b]">School</dt><dd className="font-medium text-[#1b2837]">{d.school}</dd>
              <dt className="text-[#5b6b7b]">Document</dt><dd>{d.title || d.document}</dd>
              {d.holder && <><dt className="text-[#5b6b7b]">Issued to</dt><dd>{d.holder}</dd></>}
              <dt className="text-[#5b6b7b]">Number</dt><dd className="font-mono text-xs">{d.serial}</dd>
              <dt className="text-[#5b6b7b]">Issued on</dt><dd>{fmt(d.issuedOn)}</dd>
              {d.validUntil && <><dt className="text-[#5b6b7b]">Valid until</dt><dd>{fmt(d.validUntil)}</dd></>}
            </dl>
            <p className="mt-4 text-xs text-[#5b6b7b]">Compare the name and number with the paper you are holding. If they differ, do not trust the paper. For anything else, contact the school.</p>
          </section>
        )}
        {state.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert"><div className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert size={18} aria-hidden="true" /> Not found</div>{state.error}<p className="mt-2 text-xs text-[#5b6b7b]">If you scanned this from a printed document, treat it with care: a genuine document always shows a result here.</p></div>}
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-[#e3e7e7] bg-white p-4">
          <label htmlFor="ref" className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Check another document</label>
          <div className="flex gap-2"><input id="ref" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the reference or link" className="w-full rounded-lg border border-[#e3e7e7] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]" autoComplete="off" /><button className="inline-flex items-center gap-2 rounded-lg bg-[#2a5cac] px-4 py-2.5 text-sm font-semibold text-white"><Search size={14} aria-hidden="true" /> Check</button></div>
        </form>
      </div>
    </main>
  );
}
