import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { plain, money, day } from '../components/training/tkit';

// A sponsor opens the private link it was given and sees only its own learners' progress. No grades, no other people, no payments but its own invoices.
export default function SponsorReport() {
  const { key } = useParams(); const [s, setS] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    document.title = 'Sponsor report · Aulensia'; let live = true;
    plain.get(`/public/training/sponsor/${encodeURIComponent(key)}`).then((r) => live && setS({ loading: false, data: r.data, error: '' })).catch((e) => live && setS({ loading: false, data: null, error: e.response?.status === 404 ? 'This report link is not valid. Ask the school for a new one.' : 'We could not load the report. Please try again.' }));
    return () => { live = false; };
  }, [key]);
  const d = s.data;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{d?.school || 'Aulensia'}</p>
        <h1 className="text-center text-2xl font-semibold text-[#1b2837]">{d ? `Progress report for ${d.sponsor}` : 'Sponsor report'}</h1>
        {s.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Loading"><div className="skeleton h-24" /></div>}
        {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
        {d && d.invoices.length === 0 && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 text-sm">There are no invoices yet.</div>}
        {d && d.invoices.map((inv) => (
          <section key={inv.invoiceNo} className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-label={`Invoice ${inv.invoiceNo}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-[#1b2837]">{inv.course}</h2><span className="text-xs text-[#5b6b7b]">{inv.invoiceNo} · {inv.seats} seats · {money(inv.total)} · {inv.status === 'paid' ? `paid ${day(inv.paidAt)}` : 'not paid yet'}</span></div>
            <div role="region" aria-label={`Learners on ${inv.invoiceNo}`} tabIndex={0} className="mt-3 overflow-x-auto"><table className="w-full text-sm" aria-label={`Learners on ${inv.invoiceNo}`}><thead className="text-xs text-[#5b6b7b]"><tr><th scope="col" className="p-2 text-start">Learner</th><th scope="col" className="p-2 text-start">Progress</th><th scope="col" className="p-2 text-start">State</th><th scope="col" className="p-2 text-start">Certificate check code</th></tr></thead>
              <tbody>{inv.learners.map((l, i) => <tr key={i} className="border-t border-[#f0f1f1]"><td className="p-2">{l.name}</td><td className="p-2">{l.percent}%</td><td className="p-2">{l.state}{l.completedAt ? ` (${day(l.completedAt)})` : ''}</td><td className="p-2 font-mono text-xs">{l.checkCode ? <a className="text-[#2a5cac] underline" href={`/verify-credential/${l.checkCode}`}>{l.checkCode}</a> : '—'}</td></tr>)}</tbody></table></div>
          </section>
        ))}
      </div>
    </main>
  );
}
