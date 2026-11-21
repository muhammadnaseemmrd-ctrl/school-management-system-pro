import React, { useState } from 'react';
import { btnPrimary, btnGhost, btnDanger, Card } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, AskForm, send, Empty, tone, dt, download, nf } from './advKit';

const shown = (m) => (m.value === null || m.value === undefined ? 'Hidden' : `${typeof m.value === 'number' ? nf(m.value) : m.value}${m.unit === '%' ? '%' : ''}`);

function One({ id, onBack }) {
  const [v, setV] = useState(0); const g = useGet(`/advancement/reports/${id}`, { v }); const [m, setM] = useState(null); const [err, setErr] = useState(''); const bump = () => setV((x) => x + 1); const r = g.data?.report;
  const act = async (fn) => { setErr(''); try { await fn(); bump(); } catch (e) { setErr(e.response?.data?.message || 'That did not work.'); } };
  return (
    <div className="space-y-3">
      <button className={btnGhost} onClick={onBack}>Back to the reports</button>
      <Loading g={g}>{r && (<>
        <Card><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-[#1b2837]">{r.title}</h2><Tag tone={tone(r.status)}>{r.status}</Tag></div>
          {r.status !== 'Draft' && <p className="mt-2 text-xs text-[#5b6b7b]">Approved by {r.approvedByName}{r.soleAdmin ? ' (the only administrator)' : ''} on {dt(r.approvedAt)}. Check code <span className="break-all font-mono" dir="ltr">{r.hash}</span></p>}
          {r.status === 'Published' && <p className="mt-1 text-sm">Public page: <a className="text-[#234c91] underline" href={`/annual/${r.code}`} target="_blank" rel="noreferrer" dir="ltr">{window.location.origin}/annual/{r.code}</a></p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {r.status === 'Draft' && <><button className={btnGhost} onClick={() => act(() => send('post', `/reports/${id}/refresh`, {}, 'Figures refreshed'))}>Refresh the figures</button><button className={btnGhost} onClick={() => setM({ t: 'story' })}>Add a story</button><button className={btnPrimary} onClick={() => act(() => send('post', `/reports/${id}/approve`, {}, 'Approved'))}>Approve (a different administrator)</button></>}
            {r.status === 'Approved' && <button className={btnPrimary} onClick={() => act(() => send('post', `/reports/${id}/publish`, {}, 'Published'))}>Publish the public page</button>}
            {r.status !== 'Draft' && <button className={btnGhost} onClick={() => download(`/advancement/reports/${id}/pdf`, `annual-report-${r.year}.pdf`)}>Download the PDF</button>}
          </div>
          {err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}
        </Card>
        <Note>The figures are counted from the school&apos;s records. Small groups are hidden. Once approved, nothing can be changed: a correction is a new report.</Note>
        <Table label="Figures" head={['Figure', 'Value', 'Where it comes from']} min={620}>{r.metrics.map((x) => <tr key={x.key}><Td>{x.label}</Td><Td><b dir="ltr">{shown(x)}</b> {x.value !== null && x.unit && x.unit !== '%' ? <span className="text-xs text-[#5b6b7b]">{x.unit}</span> : null}</Td><Td className="text-xs text-[#5b6b7b]">{x.source}</Td></tr>)}</Table>
        <Card><h3 className="text-sm font-bold">Stories</h3>{r.stories.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">No stories. A story goes in only if everyone in it agreed.</p> : <ul className="mt-2 space-y-3">{r.stories.map((s) => <li key={s.id} className="rounded-lg border border-[#e3e7e7] p-3 text-sm"><div className="flex items-center justify-between gap-2"><b>{s.title}</b>{r.status === 'Draft' && <button className={btnDanger} onClick={() => act(() => send('delete', `/reports/${id}/stories/${s.id}`, undefined, 'Removed'))} aria-label={`Take out ${s.title}`}>Take out</button>}</div><p className="mt-1 whitespace-pre-wrap text-[#3b4a5c]">{s.text}</p><p className="mt-1 text-xs text-[#5b6b7b]">Agreement: {s.consent?.note}</p></li>)}</ul>}</Card>
      </>)}</Loading>
      {m?.t === 'story' && <AskForm title="Add a story" fields={[{ k: 'title', label: 'Title', required: true }, { k: 'text', label: 'The story (at least a few sentences)', type: 'textarea', required: true, rows: 6 }, { k: 'consentConfirmed', label: 'Agreement', type: 'check', text: 'Everyone named or shown in this story agreed to it being published (for a child, the parent)' }, { k: 'consentNote', label: 'Who agreed, and how', required: true }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', `/reports/${id}/stories`, { ...v, consentConfirmed: !!v.consentConfirmed }, 'Added'); setM(null); bump(); }} />}
    </div>
  );
}

export default function Report() {
  const [ver, setVer] = useState(0); const g = useGet('/advancement/reports', { v: ver }); const [open, setOpen] = useState(null); const [m, setM] = useState(false);
  if (open) return <One id={open} onBack={() => { setOpen(null); setVer(ver + 1); }} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM(true)}>Start a report</button></div>
      <Loading g={g}>{g.data && (g.data.reports.length === 0 ? <Empty>No annual reports yet.</Empty> : <Table label="Annual reports" head={['Report', 'Year', 'Status', 'Approved', '']} min={640}>{g.data.reports.map((r) => <tr key={r.id}><Td><span className="font-semibold">{r.title}</span></Td><Td>{r.year}</Td><Td><Tag tone={tone(r.status)}>{r.status}</Tag></Td><Td>{r.approvedAt ? dt(r.approvedAt) : '—'}</Td><Td><button className={btnGhost} onClick={() => setOpen(r.id)} aria-label={`Open ${r.title}`}>Open</button></Td></tr>)}</Table>)}</Loading>
      {m && <AskForm title="Start an annual report" fields={[{ k: 'year', label: 'Year', type: 'number', required: true, min: 2000, max: new Date().getFullYear() + 1, def: new Date().getFullYear() }, { k: 'title', label: 'Title (optional)' }]} onClose={() => setM(false)} onDone={async (v) => { const r = await send('post', '/reports', { year: Number(v.year), title: v.title || undefined }, 'Started'); setM(false); setOpen(r.report.id); }} />}
    </div>
  );
}
