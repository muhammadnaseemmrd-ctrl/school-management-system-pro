import React, { useState } from 'react';
import { Card, btnGhost } from '../ui';
import { useGet, Loading, Note, PeriodBar, usePeriod, Value, Change, Spark, Sev, nf, Tag } from './anKit';
import MeasureDetail from './MeasureDetail';
import JobForm from './JobForm';

// The head's page: what slipped, then every measure this person may see, each with what it counts.
export default function Overview({ acc, go }) {
  const [p, setP] = usePeriod(30); const [gb, setGb] = useState('class'); const [open, setOpen] = useState(null); const [mk, setMk] = useState(null);
  const g = useGet('/analytics/overview', { from: p.from, to: p.to, groupBy: gb });
  return (
    <div className="space-y-4">
      <Card><PeriodBar value={p} onChange={setP} groupBy={gb} onGroup={setGb} groups={[['class', 'Class'], ['standard', 'Grade'], ['campus', 'Campus'], ['none', 'Whole school']]} /></Card>
      <Loading g={g}>{g.data && (
        <div className="space-y-4">
          {g.data.exceptions.length > 0 ? (
            <Card><h3 className="text-sm font-bold text-[#1b2837]">Needs attention</h3><p className="mt-1 text-xs text-[#5b6b7b]">Where a measure crossed a line your school set. Urgent first.</p>
              <ul className="mt-2 divide-y divide-[#f0f1f1]">{g.data.exceptions.slice(0, 12).map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm"><Sev s={e.severity} /><span className="min-w-0 flex-1 text-[#1b2837]">{e.message}</span>
                  <button className={btnGhost} onClick={() => setOpen(e.metricKey)}>See why</button>
                  {acc.admin && <button className={btnGhost} onClick={() => setMk(e)}>Give it to someone</button>}</li>))}</ul></Card>
          ) : <Note tone="good">Nothing has crossed a line in this period.</Note>}
          {g.data.jobs.length > 0 && <Card><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-[#1b2837]">Open jobs ({g.data.openJobs})</h3><button className={btnGhost} onClick={() => go('jobs')}>All jobs</button></div>
            <ul className="mt-2 space-y-1 text-sm">{g.data.jobs.map((j) => <li key={j._id} className="flex flex-wrap gap-2"><span className="font-medium text-[#1b2837]">{j.title}</span><span className="text-[#5b6b7b]">{j.ownerName} · by {j.dueOn}</span>{j.overdue && <Tag tone="bad">Late</Tag>}</li>)}</ul></Card>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.data.results.map((r) => (
              <Card key={r.key} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-[#1b2837]">{r.name}</h3><Tag>{r.domain}</Tag></div>
                <div className="flex items-end gap-3"><span className="text-2xl font-bold text-[#1b2837]"><Value t={r.total} /></span><Change v={r.change} good={r.alert && r.alert.above !== undefined && r.alert.below === undefined ? 'down' : 'up'} /><span className="ms-auto"><Spark series={r.series} /></span></div>
                {!r.total.suppressed && r.total.den !== null && <p className="text-xs text-[#3b4a5c]" dir="ltr">{nf(r.total.num)} of {nf(r.total.den)} {r.unit}</p>}
                {r.total.suppressed && <p className="text-xs text-[#5b6b7b]">Fewer than {r.minCell} children, so no figure is shown.</p>}
                <p className="text-xs text-[#5b6b7b]">Counts: {r.numerator}.</p>
                <div className="mt-auto pt-2"><button className={btnGhost} onClick={() => setOpen(r.key)}>Details</button></div>
              </Card>))}
          </div>
          {g.data.hidden.length > 0 && <details className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold text-[#1b2837]">{g.data.hidden.length} measures are not shown to you</summary>
            <ul className="mt-2 space-y-1 text-xs text-[#5b6b7b]">{g.data.hidden.map((h) => <li key={h.key}><span className="font-semibold text-[#3b4a5c]">{h.name}:</span> {h.why}</li>)}</ul></details>}
        </div>)}</Loading>
      {open && <MeasureDetail k={open} period={p} groupBy={gb} onClose={() => setOpen(null)} />}
      {mk && <JobForm seed={{ metricKey: mk.metricKey, groupKey: mk.groupKey, groupLabel: mk.groupLabel, title: `Look into: ${mk.name}${mk.groupLabel ? ` (${mk.groupLabel})` : ''}`, intro: mk.message }} onClose={() => setMk(null)} onDone={() => { setMk(null); g.reload(); }} />}
    </div>
  );
}
