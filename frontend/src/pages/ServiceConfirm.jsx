import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { plain, day } from '../components/training/tkit';

const input = 'mt-1 w-full rounded-lg border border-[#c9d1d1] bg-white px-3 py-2 text-sm text-[#1b2837]';

// A supervisor opens the private link. They see the first name, the activity and the hours, and confirm or decline in their own words. It works once.
export default function ServiceConfirm() {
  const { token } = useParams(); const t = encodeURIComponent(token);
  const [s, setS] = useState({ loading: true, data: null, error: '' }); const [hours, setHours] = useState(''); const [statement, setStatement] = useState(''); const [done, setDone] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Confirm service · Aulensia'; plain.get(`/public/service/${t}`).then((r) => { setS({ loading: false, data: r.data, error: '' }); setHours(String(r.data.hours)); }).catch((e) => setS({ loading: false, data: null, error: e.response?.status === 404 ? 'This link has been used or is not valid any more. Ask the student for a new one.' : 'Something went wrong. Please try again.' })); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (decision) => { setBusy(true); setErr(''); try { await plain.post(`/public/service/${t}`, { decision, hours: decision === 'confirm' ? Number(hours) : undefined, statement }); setDone(decision === 'confirm' ? 'Thank you. The hours are confirmed.' : 'Thank you. You said you could not confirm this.'); } catch (e) { setErr(e.response?.data?.message || 'That did not work.'); } setBusy(false); };
  const d = s.data;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-xl space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{d?.school || 'Aulensia'}</p>
        <h1 className="text-center text-2xl font-semibold text-[#1b2837]">Confirm community service</h1>
        {s.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Loading"><div className="skeleton h-24" /></div>}
        {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
        {done && <div className="rounded-2xl border border-[#bfd8d2] bg-[#edf5f3] p-5 text-sm text-[#215a52]" role="status">{done}</div>}
        {d && !done && (
          <form onSubmit={(e) => { e.preventDefault(); send('confirm'); }} className="space-y-3 rounded-2xl border border-[#e3e7e7] bg-white p-5">
            <p className="text-sm text-[#3b4a5c]"><b>{d.student}</b> says they did this service. You were named as the person who supervised.</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[#5b6b7b]">What</dt><dd>{d.activity}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Where</dt><dd>{d.orgName || '—'}</dd></div><div><dt className="text-xs text-[#5b6b7b]">When</dt><dd>{day(d.date)}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Hours logged</dt><dd>{d.hours}</dd></div></dl>
            <label className="block text-sm font-semibold text-[#1b2837]">Hours you can confirm (up to {d.hours}, in halves)<input className={input} type="number" min={0.5} max={d.hours} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} dir="ltr" /></label>
            <label className="block text-sm font-semibold text-[#1b2837]">Write what you saw, in a line or two<textarea className={input} required minLength={5} maxLength={300} rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
            {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
            <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded-lg border border-[#e3b4ac] bg-white px-4 py-2 text-sm font-semibold text-[#9f1239] disabled:opacity-60" disabled={busy} onClick={() => send('decline')}>I cannot confirm this</button><button className="rounded-lg bg-[#1f6f63] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy}>Confirm</button></div>
            <p className="text-xs text-[#5b6b7b]">Only the first name is shown to you. This link works once.</p>
          </form>)}
      </div>
    </main>
  );
}
