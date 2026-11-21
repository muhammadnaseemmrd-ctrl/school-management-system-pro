import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { plain, money, day } from '../components/training/tkit';

// A public fundraising page: the goal, what has been raised, where it goes. No contact details, no anonymous donors.
export default function CampaignPage() {
  const { code } = useParams(); const [s, setS] = useState({ loading: true, data: null, error: '' });
  useEffect(() => { document.title = 'Support our school · Aulensia'; let live = true; plain.get(`/public/campaigns/${encodeURIComponent(code)}`).then((r) => live && setS({ loading: false, data: r.data, error: '' })).catch((e) => live && setS({ loading: false, data: null, error: e.response?.status === 404 ? 'This page is not open.' : 'Something went wrong. Please try again.' })); return () => { live = false; }; }, [code]);
  const d = s.data;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{d?.school || 'Aulensia'}</p>
        <h1 className="text-center text-2xl font-semibold text-[#1b2837]">{d ? d.title : 'Support our school'}</h1>
        {s.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Loading"><div className="skeleton h-24" /></div>}
        {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
        {d && (<>
          {d.status === 'Closed' && <p className="rounded-xl bg-[#f1f2f2] p-3 text-center text-sm text-[#3b4a5c]" role="status">This campaign has closed. Thank you to everyone who gave.</p>}
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-label="Progress">
            <p className="text-sm text-[#3b4a5c]"><b className="text-2xl text-[#1b2837]" dir="ltr">{money(d.raised)}</b> raised of <span dir="ltr">{money(d.goal)}</span>{d.percent !== null && <> · {d.percent}%</>}</p>
            {d.percent !== null && <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[#eef0f0]" role="progressbar" aria-valuenow={d.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the goal raised"><div className="h-full bg-[#1f6f63]" style={{ width: `${d.percent}%` }} /></div>}
            <p className="mt-2 text-xs text-[#5b6b7b]">{d.donors !== null && d.donors !== undefined ? `${d.donors} people have given. ` : ''}{d.endsOn ? `Ends ${day(d.endsOn)}.` : ''}</p>
          </section>
          {d.story && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><p className="whitespace-pre-wrap text-sm text-[#1b2837]">{d.story}</p></section>}
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-label="Where the money goes"><h2 className="font-semibold text-[#1b2837]">Where the money goes</h2><ul className="mt-2 space-y-2">{d.uses.map((u) => <li key={u.label} className="text-sm"><div className="flex justify-between"><span>{u.label}</span><b dir="ltr">{u.percent}%</b></div><div className="mt-1 h-2 w-full rounded-full bg-[#eef0f0]" aria-hidden="true"><div className="h-full rounded-full bg-[#5b8f87]" style={{ width: `${u.percent}%` }} /></div></li>)}</ul></section>
          {d.thankYou.length > 0 && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-label="Thank you"><h2 className="font-semibold text-[#1b2837]">Thank you</h2><p className="mt-2 text-sm text-[#3b4a5c]">{d.thankYou.join(', ')}</p></section>}
          <p className="text-center text-xs text-[#5b6b7b]">{d.promise}</p>
          <p className="text-center text-sm text-[#3b4a5c]">To give, please ask the school office. Gifts are recorded with a receipt number.</p>
        </>)}
      </div>
    </main>
  );
}
