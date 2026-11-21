import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { plain, day, dt } from '../components/training/tkit';

const STATUS = ['Employed', 'Self-employed', 'Studying', 'Looking for work', 'Not working', 'Prefer not to say'];
const box = 'rounded-2xl border border-[#e3e7e7] bg-white p-5';
const input = 'mt-1 w-full rounded-lg border border-[#c9d1d1] bg-white px-3 py-2 text-sm text-[#1b2837]';
const btn = 'rounded-lg bg-[#1f6f63] px-4 py-2 text-sm font-semibold text-white hover:bg-[#185a50] disabled:opacity-60';
const ghost = 'rounded-lg border border-[#c9d1d1] bg-white px-4 py-2 text-sm font-semibold text-[#1b2837] hover:bg-[#f7f6f2]';

// A graduate opens the private link they were given. They decide what the school may keep. Nothing is kept without a yes.
export default function AlumniPage() {
  const { token } = useParams(); const t = encodeURIComponent(token);
  const [s, setS] = useState({ loading: true, data: null, error: '' }); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [gone, setGone] = useState(false);
  const [f, setF] = useState(null); const [emp, setEmp] = useState({ status: 'Employed', sector: '' }); const [erase, setErase] = useState(false);
  const load = () => plain.get(`/public/alumni/${t}`).then((r) => { setS({ loading: false, data: r.data, error: '' }); const c = r.data.alumnus; setF((x) => x || { contact: c.consent.contact, email: c.contact.email || '', phone: c.contact.phone || '', events: c.consent.events, directory: c.consent.directory === 'visible', headline: c.profile.headline || '', city: c.profile.city || '', employer: c.profile.employer || '', field: c.profile.field || '' }); }).catch((e) => setS({ loading: false, data: null, error: e.response?.status === 404 ? 'This link is not valid any more. Ask the school for a new one.' : 'Something went wrong. Please try again.' }));
  useEffect(() => { document.title = 'Your alumni page · Aulensia'; load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn, ok) => { setBusy(true); setErr(''); setMsg(''); try { await fn(); setMsg(ok); await load(); } catch (e) { setErr(e.response?.data?.message || 'That did not work.'); } setBusy(false); };
  const saveConsent = (e) => { e.preventDefault(); const channels = f.contact ? [f.email && 'email', f.phone && 'phone'].filter(Boolean) : []; return run(() => plain.put(`/public/alumni/${t}/consent`, { contact: f.contact, channels, email: f.contact ? f.email : '', phone: f.contact ? f.phone : '', events: f.contact && f.events, directory: f.directory ? 'visible' : 'hidden', profile: f.directory ? { headline: f.headline, city: f.city, employer: f.employer, field: f.field } : {} }), 'Saved. This is all the school will keep.'); };
  const d = s.data; const me = d?.alumnus;
  if (gone) return <main className="min-h-screen bg-[#f7f6f2] px-4 py-10"><div className={`mx-auto max-w-xl ${box}`} role="status"><h1 className="text-xl font-semibold text-[#1b2837]">Done</h1><p className="mt-2 text-sm text-[#3b4a5c]">{erase ? 'Everything about you has been removed.' : 'Your contact details and answers have been removed, and the school will not write to you.'}</p></div></main>;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{d?.school || 'Aulensia'}</p>
        <h1 className="text-center text-2xl font-semibold text-[#1b2837]">{me ? `Hello ${me.name.split(' ')[0]}` : 'Your alumni page'}</h1>
        {s.loading && <div className={box} role="status" aria-label="Loading"><div className="skeleton h-24" /></div>}
        {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
        {d && (<>
          <p className="text-center text-sm text-[#3b4a5c]">{d.promise}</p>
          {msg && <p className="rounded-xl bg-[#edf5f3] p-3 text-center text-sm text-[#215a52]" role="status">{msg}</p>}
          {err && <p className="rounded-xl bg-[#fff1f2] p-3 text-center text-sm text-[#9f1239]" role="alert">{err}</p>}
          <form onSubmit={saveConsent} className={`${box} space-y-3`} aria-label="What the school may keep">
            <h2 className="font-semibold text-[#1b2837]">What may the school keep?</h2>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.contact} onChange={(e) => setF({ ...f, contact: e.target.checked })} /> <span>You may contact me. Without this the school keeps no email or phone number for me.</span></label>
            {f.contact && <div className="grid gap-3 sm:grid-cols-2 pl-6"><label className="text-sm font-semibold">Email<input className={input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} dir="ltr" /></label><label className="text-sm font-semibold">Phone<input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" /></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.events} onChange={(e) => setF({ ...f, events: e.target.checked })} /> Tell me about events and reunions</label><p className="text-xs text-[#5b6b7b] sm:col-span-2">Only the ways you fill in here are saved, and only those are used.</p></div>}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.directory} onChange={(e) => setF({ ...f, directory: e.target.checked })} /> <span>List me in the alumni directory, with only what I write below.</span></label>
            {f.directory && <div className="grid gap-3 sm:grid-cols-2 pl-6">{[['headline', 'A line about me'], ['city', 'City'], ['employer', 'Where I work or study'], ['field', 'My field']].map(([k, l]) => <label key={k} className="text-sm font-semibold">{l}<input className={input} value={f[k]} maxLength={120} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}</div>}
            <div className="flex justify-end"><button className={btn} disabled={busy}>Save my choices</button></div>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); run(() => plain.post(`/public/alumni/${t}/employment`, emp), 'Thank you.'); }} className={`${box} space-y-3`} aria-label="What I am doing now">
            <h2 className="font-semibold text-[#1b2837]">What are you doing now? <span className="text-xs font-normal text-[#5b6b7b]">(you can skip this)</span></h2>
            {me.employment && <p className="text-xs text-[#5b6b7b]">You answered: {me.employment.status}{me.employment.sector ? `, ${me.employment.sector}` : ''}.</p>}
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Status<select className={input} value={emp.status} onChange={(e) => setEmp({ ...emp, status: e.target.value })}>{STATUS.map((x) => <option key={x}>{x}</option>)}</select></label><label className="text-sm font-semibold">Field of work<input className={input} value={emp.sector} maxLength={60} onChange={(e) => setEmp({ ...emp, sector: e.target.value })} /></label></div>
            <p className="text-xs text-[#5b6b7b]">The school only ever sees totals for groups of several people. Nobody can be picked out.</p>
            <div className="flex justify-end"><button className={ghost} disabled={busy}>Send my answer</button></div>
          </form>
          <section className={box} aria-label="Events"><h2 className="font-semibold text-[#1b2837]">Coming up</h2>{d.events.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">No events right now.</p> : <ul className="mt-2 space-y-3">{d.events.map((e) => <li key={e.id} className="rounded-xl border border-[#e3e7e7] p-3"><p className="font-semibold">{e.title}</p><p className="text-xs text-[#5b6b7b]">{dt(e.startsAt)}{e.place ? ` · ${e.place}` : ''}</p>{e.description && <p className="mt-1 text-sm text-[#3b4a5c]">{e.description}</p>}<div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Will you come to ${e.title}?`}>{[['going', 'I am going'], ['maybe', 'Maybe'], ['no', 'Not this time']].map(([k, l]) => <button key={k} className={e.mine === k ? btn : ghost} aria-pressed={e.mine === k} disabled={busy} onClick={() => run(() => plain.post(`/public/alumni/${t}/rsvp`, { eventId: e.id, status: k }), 'Your answer is saved.')}>{l}</button>)}</div></li>)}</ul>}</section>
          <section className={box} aria-label="Leave"><h2 className="font-semibold text-[#1b2837]">Leave</h2><p className="mt-1 text-sm text-[#3b4a5c]">You can remove your contact details and answers at any time. If you also want your name removed, tick the box.</p><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} /> Remove my name too</label><div className="mt-3"><button className="rounded-lg border border-[#e3b4ac] bg-white px-4 py-2 text-sm font-semibold text-[#9f1239]" disabled={busy} onClick={() => run(async () => { await plain.post(`/public/alumni/${t}/withdraw`, { erase }); setGone(true); }, '')}>Remove my details</button></div></section>
        </>)}
      </div>
    </main>
  );
}
