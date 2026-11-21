import React, { useState } from 'react';
import { Modal, Card, Field, inputCls } from '../ui';
import { useGet, Loading, Table, Td, Value, Change, Tag, Sev, nf, Bar, ymName, unitWord } from './anKit';

// One measure in full: what it counts, against what, who sees it, the groups and the months.
export default function MeasureDetail({ k, period, groupBy: gb0, onClose }) {
  const [gb, setGb] = useState(gb0 === 'none' ? 'class' : gb0);
  const g = useGet(`/analytics/measures/${k}`, { from: period.from, to: period.to, groupBy: gb });
  const d = g.data;
  return (
    <Modal title={d ? d.name : 'Measure'} onClose={onClose} wide>
      <Loading g={g}>{d && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div><div className="text-3xl font-bold text-[#1b2837]"><Value t={d.total} /></div><Change v={d.change} />{d.previous && <p className="text-xs text-[#5b6b7b]">Before: {d.previous.suppressed ? 'hidden' : d.previous.value === null ? 'no data' : `${d.previous.value}%`} ({d.previous.from} to {d.previous.to})</p>}</div>
            {!d.total.suppressed && d.total.den !== null && <p className="text-[#3b4a5c]" dir="ltr">{nf(d.total.num)} of {nf(d.total.den)} {unitWord(d.unit)}</p>}
            {d.target !== null && d.target !== undefined && <Tag tone="info">Target {d.target}%</Tag>}
          </div>
          {d.exceptions.length > 0 && <ul className="space-y-1">{d.exceptions.map((e, i) => <li key={i} className="flex gap-2"><Sev s={e.severity} /><span>{e.message}</span></li>)}</ul>}
          <Card>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div><dt className="text-xs text-[#5b6b7b]">What is counted (numerator)</dt><dd className="font-medium text-[#1b2837]">{d.numerator}</dd></div>
              <div><dt className="text-xs text-[#5b6b7b]">What it is counted against (denominator)</dt><dd className="font-medium text-[#1b2837]">{d.denominator}</dd></div>
              <div><dt className="text-xs text-[#5b6b7b]">Who sees it</dt><dd className="font-medium text-[#1b2837]">{d.definition.roleScope}</dd></div>
              <div><dt className="text-xs text-[#5b6b7b]">Definition</dt><dd className="font-medium text-[#1b2837]">{d.definition.custom ? 'Made by the school' : 'Built in'}, version {d.version || 'built-in'}. Groups with fewer than {d.minCell} children show no figure.</dd></div>
            </dl>
          </Card>
          {d.definition.scope === 'class' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2"><h3 className="font-bold text-[#1b2837]">By group</h3>
                <Field label="Break down by"><select className={inputCls} value={gb} onChange={(e) => setGb(e.target.value)}><option value="class">Class</option><option value="standard">Grade</option><option value="campus">Campus</option></select></Field></div>
              {d.groups.length === 0 ? <p className="text-[#5b6b7b]">Nothing was recorded for any group in this period.</p> : (
                <Table label={`${d.name} by group`} head={['Group', 'Figure', '', 'Counted', 'Against', 'Children']} min={520}>
                  {d.groups.map((x) => <tr key={x.key || 'none'}><Td className="font-medium">{x.label}</Td><Td><Value t={x} /></Td><Td className="w-40">{!x.suppressed && x.value !== null && <Bar v={x.value} />}</Td><Td dir="ltr">{x.suppressed ? '—' : nf(x.num)}</Td><Td dir="ltr">{x.suppressed ? '—' : nf(x.den)}</Td><Td>{x.suppressed ? <span className="text-xs text-[#5b6b7b]">too few to show</span> : (x.ent ?? '—')}</Td></tr>)}
                </Table>)}
            </div>)}
          {d.series.length > 0 && (
            <div className="space-y-2"><h3 className="font-bold text-[#1b2837]">Month by month</h3>
              <Table label={`${d.name} by month`} head={['Month', 'Figure', '', 'Counted', 'Against']} min={420}>
                {d.series.map((x) => <tr key={x.ym}><Td className="font-medium">{ymName(x.ym)}</Td><Td dir="ltr">{x.value === null ? '—' : `${x.value}%`}</Td><Td className="w-40">{x.value !== null && <Bar v={x.value} />}</Td><Td dir="ltr">{nf(x.num)}</Td><Td dir="ltr">{nf(x.den)}</Td></tr>)}
              </Table></div>)}
        </div>)}</Loading>
    </Modal>
  );
}
