import React, { useState } from 'react';
import { Card, Field, inputCls } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, Bar, money, nf, addDays, today } from './anKit';

const BCOL = ['#2a5cac', '#b7791f', '#c2410c', '#b91c1c', '#7f1d1d'];

// Fees owed by how late they are; the admissions funnel and the roll. Administrators only.
export default function Money({ acc }) {
  return <div className="space-y-6"><Ageing /><Funnel wide={acc.wide} /></div>;
}

function Ageing() {
  const [gb, setGb] = useState('standard'); const g = useGet('/analytics/ageing', { groupBy: gb }); const d = g.data;
  return (
    <section className="space-y-3" aria-labelledby="age-h">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="age-h" className="text-lg font-bold text-[#1b2837]">Fees owed, by how late</h2>{d && <p className="text-xs text-[#5b6b7b]">As of {d.asOf}. {d.note}</p>}</div>
        <Field label="Break down by"><select className={inputCls} value={gb} onChange={(e) => setGb(e.target.value)}><option value="none">Whole school</option><option value="class">Class</option><option value="standard">Grade</option><option value="campus">Campus</option></select></Field></div>
      <Loading g={g}>{d && (
        <>
          <div className="grid gap-3 sm:grid-cols-3"><Card><p className="text-xs text-[#5b6b7b]">Owed on open invoices</p><p className="text-2xl font-bold text-[#1b2837]" dir="ltr">{money(d.outstanding)}</p></Card><Card><p className="text-xs text-[#5b6b7b]">Of it, past its due date</p><p className="text-2xl font-bold text-[#9f1239]" dir="ltr">{money(d.overdue)}</p></Card><Card><p className="text-xs text-[#5b6b7b]">Children with something owed</p><p className="text-2xl font-bold text-[#1b2837]">{nf(d.children)}</p></Card></div>
          {d.outstanding === 0 ? <Note tone="good">Nothing is owed on open invoices.</Note> : (
            <Table label="Fees owed by age" head={['How late', 'Invoices', 'Amount', 'Share']} min={480}>
              {d.buckets.map((b, i) => <tr key={b.key}><Td className="font-medium">{b.label}</Td><Td>{nf(b.n)}</Td><Td dir="ltr">{money(b.amount)}</Td><Td className="w-48"><Bar v={d.outstanding ? (b.amount * 100) / d.outstanding : 0} tone={BCOL[i]} /><span className="text-xs text-[#5b6b7b]" dir="ltr">{d.outstanding ? Math.round((b.amount * 100) / d.outstanding) : 0}%</span></Td></tr>)}
            </Table>)}
          {gb !== 'none' && d.groups.length > 0 && (
            <Table label="Fees owed by group" head={['Group', 'Children', ...d.buckets.map((b) => b.label), 'Total']} min={860}>
              {d.groups.map((x) => x.suppressed ? <tr key={x.key || 'n'}><Td className="font-medium">{x.label}</Td><Td className="text-xs text-[#5b6b7b]">Too few to show</Td>{[...d.buckets, 0].map((b, i) => <Td key={i}>—</Td>)}</tr>
                : <tr key={x.key || 'n'}><Td className="font-medium">{x.label}</Td><Td>{x.children}</Td>{x.buckets.map((b, i) => <Td key={i} dir="ltr">{b.amount ? money(b.amount) : '—'}</Td>)}<Td className="font-semibold" dir="ltr">{money(x.outstanding)}</Td></tr>)}
            </Table>)}
        </>)}</Loading>
    </section>
  );
}

function Funnel({ wide }) {
  const [p, setP] = useState({ from: addDays(today(), -365), to: today() }); const g = useGet('/analytics/funnel', { from: p.from, to: p.to }); const d = g.data;
  if (!wide) return <Note tone="info">The admissions funnel and the roll cover the whole school, so only an administrator of the whole school sees them.</Note>;
  return (
    <section className="space-y-3" aria-labelledby="fun-h">
      <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="fun-h" className="text-lg font-bold text-[#1b2837]">Admissions and the roll</h2>
        <div className="flex flex-wrap items-end gap-3"><Field label="Applications from"><input type="date" className={inputCls} value={p.from} max={p.to} onChange={(e) => e.target.value && setP({ ...p, from: e.target.value })} /></Field><Field label="To"><input type="date" className={inputCls} value={p.to} min={p.from} max={today()} onChange={(e) => e.target.value && setP({ ...p, to: e.target.value })} /></Field></div></div>
      <Loading g={g}>{d && (
        <>
          <p className="text-sm text-[#3b4a5c]">{nf(d.applications)} applications in this period. Each step counts everyone who reached that step or went further.</p>
          <Table label="Admissions steps" head={['Step', 'Reached', 'Of the step before', 'Of all applications', '']} min={600}>
            {d.steps.map((s) => <tr key={s.stage}><Td className="font-medium">{s.stage}</Td><Td>{nf(s.reached)}</Td><Td dir="ltr">{s.ofPrevious === null ? '—' : `${s.ofPrevious}%`}</Td><Td dir="ltr">{s.ofFirst === null ? '—' : `${s.ofFirst}%`}</Td><Td className="w-40"><Bar v={s.ofFirst || 0} /></Td></tr>)}
          </Table>
          <p className="text-xs text-[#5b6b7b]">Right now: {d.stillOpenElsewhere.Waitlisted} waitlisted, {d.stillOpenElsewhere.Rejected} not offered, {d.stillOpenElsewhere.Withdrawn} withdrawn.</p>
          <h3 className="text-sm font-bold text-[#1b2837]">Children on the roll today</h3>
          {d.roll.length === 0 ? <Note tone="info">No children are on the roll.</Note> : <Table label="Roll by grade" head={['Grade', 'Children']} min={300}>{d.roll.map((r) => <tr key={r.standard}><Td className="font-medium">{/^\d/.test(r.standard) ? `Grade ${r.standard}` : r.standard}</Td><Td>{nf(r.students)}</Td></tr>)}</Table>}
          <p className="text-xs text-[#5b6b7b]">{nf(d.inactive)} children are marked as having left. {d.note}</p>
        </>)}</Loading>
    </section>
  );
}
