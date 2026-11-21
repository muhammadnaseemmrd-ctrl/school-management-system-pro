import React, { useState } from 'react';
import { Card, btnGhost } from '../ui';
import { useGet, Loading, Note, PeriodBar, usePeriod, Value, Change, Sev, Table, Td, Tag, Bar, nf, pct } from './gKit';
import CampusDetail from './CampusDetail';

const COLS = [['attendance.rate', 'Attendance'], ['fees.collection', 'Fees collected'], ['learning.average', 'Average mark']];

// Every campus side by side, measured the same way. A campus administrator sees their own campuses and totals over those alone.
export default function Campuses({ acc, go }) {
  const [p, setP] = usePeriod(30); const [open, setOpen] = useState(null);
  const g = useGet('/group/rollup', { from: p.from, to: p.to });
  return (
    <div className="space-y-4">
      <Card><PeriodBar value={p} onChange={setP} /></Card>
      <Loading g={g}>{g.data && (
        <div className="space-y-4">
          <Note tone="info">{g.data.scopeNote} Every figure uses the same definition as the Measures page, and a campus with fewer than five children shows no figure. The next smallest is hidden with it, so a hidden figure cannot be worked out from the total.</Note>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Group totals">
            <Card className="flex flex-col gap-1"><div role="listitem"><h3 className="text-sm font-bold text-[#1b2837]">Campuses</h3><p className="text-2xl font-bold text-[#1b2837]">{g.data.group.campuses}</p><p className="text-xs text-[#5b6b7b]">{nf(g.data.group.classes)} classes</p></div></Card>
            <Card className="flex flex-col gap-1"><div role="listitem"><h3 className="text-sm font-bold text-[#1b2837]">Children</h3><p className="text-2xl font-bold text-[#1b2837]">{nf(g.data.group.students)}</p><p className="text-xs text-[#5b6b7b]">{g.data.wide ? 'In the whole group' : 'In your campuses'}</p></div></Card>
            {COLS.map(([k, name]) => { const t = g.data.group.measures[k]; if (!t) return null; return (
              <Card key={k} className="flex flex-col gap-1"><div role="listitem"><h3 className="text-sm font-bold text-[#1b2837]">{name}</h3>
                <p className="flex items-end gap-2 text-2xl font-bold text-[#1b2837]"><Value t={t} /><Change v={t.previous !== null && t.previous !== undefined && t.value !== null ? Math.round((t.value - t.previous) * 10) / 10 : null} /></p>
                {!t.suppressed && t.value !== null && t.value !== undefined && t.den ? <p className="text-xs text-[#5b6b7b]" dir="ltr">{nf(t.num)} of {nf(t.den)} {t.unit}</p> : null}</div></Card>); })}
          </div>
          {g.data.exceptions.length > 0 ? (
            <Card><h3 className="text-sm font-bold text-[#1b2837]">Campuses under their target</h3><p className="mt-1 text-xs text-[#5b6b7b]">Targets are rules set for the group or a campus. Urgent first.</p>
              <ul className="mt-2 divide-y divide-[#f0f1f1]">{g.data.exceptions.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm"><Sev s={e.severity} /><span className="min-w-0 flex-1 text-[#1b2837]">{e.message}</span><button className={btnGhost} onClick={() => setOpen(e.campusId)}>Open {e.campusName}</button></li>))}</ul></Card>
          ) : <Note tone="ok">No campus is under a target in this period. Campuses with no target set, or too few children to show, are not listed.</Note>}
          <Table label="Campuses" head={['Campus', 'Children', 'Places', 'Classes', 'Teachers', ...COLS.map((c) => c[1]), 'Own rules', '']} min={900}>
            {g.data.campuses.map((c) => (
              <tr key={c.campusId}>
                <Td><span className="font-semibold text-[#1b2837]">{c.name}</span> {c.isDefault && <Tag>Main</Tag>} {c.status !== 'active' && <Tag tone="warn">{c.status}</Tag>}</Td>
                <Td><span dir="ltr">{nf(c.students)}</span></Td>
                <Td>{c.capacity ? <div className="w-28"><span dir="ltr" className="text-xs">{nf(c.students)} of {nf(c.capacity)} ({pct(c.fill)})</span><Bar v={c.fill} tone={c.fill > 100 ? '#9f1239' : '#2a5cac'} /></div> : <span className="text-xs text-[#5b6b7b]">No limit set</span>}</Td>
                <Td><span dir="ltr">{nf(c.classes)}</span></Td><Td><span dir="ltr">{nf(c.teachers)}</span></Td>
                {COLS.map(([k]) => { const m = c.measures[k]; return <Td key={k}>{m ? <div><Value t={m} />{m.target !== null && m.target !== undefined && <p className="text-[11px] text-[#5b6b7b]" dir="ltr">Target {m.target}%{m.gap !== null && m.gap !== undefined ? (m.gap < 0 ? ` · ${Math.abs(m.gap)} below` : ' · met') : ''}</p>}</div> : <span className="text-[#5b6b7b]">—</span>}</Td>; })}
                <Td>{c.overrides > 0 ? <Tag tone="info">{c.overrides}</Tag> : <span className="text-[#5b6b7b]">None</span>}{c.ignoredOverrides > 0 && <p className="text-[11px] text-[#8a4636]">{c.ignoredOverrides} set aside</p>}{c.waiting > 0 && <p className="text-[11px] text-[#8a4636]">{c.waiting} waiting</p>}</Td>
                <Td><button className={btnGhost} onClick={() => setOpen(c.campusId)} aria-label={`Open ${c.name}`}>Open</button></Td>
              </tr>))}
          </Table>
          {g.data.hidden.length > 0 && <details className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold text-[#1b2837]">{g.data.hidden.length} measures are not shown to you</summary>
            <ul className="mt-2 space-y-1 text-xs text-[#5b6b7b]">{g.data.hidden.map((h) => <li key={h.key}><span className="font-semibold text-[#3b4a5c]">{h.name}:</span> {h.why}</li>)}</ul></details>}
          <p className="text-xs text-[#5b6b7b]">Each look across campuses is written in the audit trail. <button className="font-semibold text-[#2a5cac] underline" onClick={() => go('rules')}>See the rules behind the targets</button></p>
        </div>)}</Loading>
      {open && <CampusDetail campusId={open} period={p} onClose={() => setOpen(null)} />}
    </div>
  );
}
