import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { plain, day } from '../components/training/tkit';

const val = (m) => `${typeof m.value === 'number' ? m.value.toLocaleString('en-US') : m.value}${m.unit === '%' ? '%' : ''}`;

// The published annual report. Figures are counted from the school's records. Stories appear only if everyone in them agreed.
export default function AnnualReportPage() {
  const { code } = useParams(); const [s, setS] = useState({ loading: true, data: null, error: '' });
  useEffect(() => { document.title = 'Annual report · Aulensia'; let live = true; plain.get(`/public/annual/${encodeURIComponent(code)}`).then((r) => live && setS({ loading: false, data: r.data, error: '' })).catch((e) => live && setS({ loading: false, data: null, error: e.response?.status === 404 ? 'This report is not published.' : 'Something went wrong. Please try again.' })); return () => { live = false; }; }, [code]);
  const d = s.data; const r = d?.report;
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{d?.school || 'Aulensia'}</p>
        <h1 className="text-center text-2xl font-semibold text-[#1b2837]">{r ? r.title : 'Annual report'}</h1>
        {s.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Loading"><div className="skeleton h-24" /></div>}
        {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
        {r && (<>
          <section className="grid gap-3 sm:grid-cols-2" aria-label="Figures">{r.metrics.map((m) => <div key={m.key} className="rounded-2xl border border-[#e3e7e7] bg-white p-4"><p className="text-xs font-semibold text-[#5b6b7b]">{m.label}</p><p className="mt-1 text-2xl font-bold text-[#1b2837]" dir="ltr">{val(m)}{m.unit && m.unit !== '%' ? <span className="ml-1 text-xs font-normal text-[#5b6b7b]">{m.unit}</span> : null}</p></div>)}</section>
          {r.stories.map((x, i) => <section key={i} className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">{x.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-[#3b4a5c]">{x.text}</p></section>)}
          <p className="text-center text-xs text-[#5b6b7b]">Approved {day(r.approvedAt)}. Check code <span className="break-all font-mono" dir="ltr">{r.hash}</span></p>
        </>)}
      </div>
    </main>
  );
}
