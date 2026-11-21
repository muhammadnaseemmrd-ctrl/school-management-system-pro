import React from 'react';
import { Card } from '../ui';
import { useGet, Loading, Note, Tag, day } from './anKit';

const ST = { ok: ['Fresh', 'good'], stale: ['Out of date', 'bad'], none: ['Never recorded', 'warn'], attention: ['Needs a look', 'warn'] };

// Whether the records the measures read are recent enough to trust.
export default function Health() {
  const g = useGet('/analytics/health', {}); const d = g.data;
  return (
    <Loading g={g}>{d && (
      <div className="space-y-4">
        <Note tone="info">A measure is only as good as the records behind it. Today is {day(d.today)}.</Note>
        <div className="grid gap-3 sm:grid-cols-3">{d.items.map((i) => (
          <Card key={i.key}><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-[#1b2837]">{i.label}</h3><Tag tone={ST[i.status][1]}>{ST[i.status][0]}</Tag></div>
            <p className="mt-2 text-lg font-bold text-[#1b2837]">{i.asOf ? day(i.asOf) : 'Nothing yet'}</p>{i.ageDays !== null && <p className="text-xs text-[#5b6b7b]">{i.ageDays <= 0 ? 'Today' : `${i.ageDays} days ago`}</p>}<p className="mt-1 text-xs text-[#3b4a5c]">{i.note}</p></Card>))}</div>
        <Card><h3 className="text-sm font-bold text-[#1b2837]">Things that quietly go wrong</h3>
          <ul className="mt-2 divide-y divide-[#f0f1f1]">{d.counts.map((c) => <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-[#1b2837]">{c.label}</span><span className="flex items-center gap-2"><strong className="tabular-nums">{c.value}</strong><Tag tone={ST[c.status][1]}>{ST[c.status][0]}</Tag></span></li>)}</ul></Card>
      </div>)}</Loading>
  );
}
