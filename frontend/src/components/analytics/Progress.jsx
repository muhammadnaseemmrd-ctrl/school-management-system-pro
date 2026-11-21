import React, { useState } from 'react';
import { Card, Field, inputCls } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, Spark, Change, addDays, today } from './anKit';

// Average marks by class and subject across the exams in the period, oldest to newest.
export default function Progress() {
  const [p, setP] = useState({ from: addDays(today(), -180), to: today() });
  const g = useGet('/analytics/progress', { from: p.from, to: p.to });
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" className={inputCls} value={p.from} max={p.to} onChange={(e) => e.target.value && setP({ ...p, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={p.to} min={p.from} max={today()} onChange={(e) => e.target.value && setP({ ...p, to: e.target.value })} /></Field></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Note tone="info">No exams with marks fall in this period.</Note> : (
        <>
          <Note tone="info">Each row is one class and subject. An exam taken by fewer than {g.data.minCell} children shows no average.</Note>
          <Table label="Progress by class and subject" head={['Class', 'Subject', 'Trend', 'Exams, oldest first', 'Latest change']} min={760}>
            {g.data.rows.map((r) => {
              const shown = r.points.filter((x) => !x.suppressed).map((x) => ({ value: x.avg }));
              return <tr key={`${r.classId}${r.subjectId}`}><Td className="font-medium">{r.label}</Td><Td>{r.subject}</Td><Td>{shown.length > 1 ? <Spark series={shown} /> : <span className="text-xs text-[#5b6b7b]">Needs two exams</span>}</Td>
                <Td><ol className="space-y-0.5 text-xs">{r.points.map((x) => <li key={x.examId} dir="ltr"><span className="text-[#5b6b7b]">{x.date}</span> {x.name}: {x.suppressed ? <Tag>Hidden</Tag> : <strong>{x.avg}%</strong>}</li>)}</ol></Td>
                <Td><Change v={r.change} /></Td></tr>; })}
          </Table></>))}</Loading>
    </div>
  );
}
