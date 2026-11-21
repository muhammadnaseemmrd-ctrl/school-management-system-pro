import React, { useState } from 'react';
import { Card, Field, btnGhost, inputCls } from '../ui';
import { useGet, Loading, Note, Table, Td, Tabs, download, day, DIR_SHORT, KIND_WORD } from './tpKit';

const NAMES = [['punctuality', 'Punctuality'], ['ridership', 'Ridership'], ['exceptions', 'Exceptions']];
export default function TpReports() {
  const [name, setName] = useState('punctuality'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const g = useGet(`/transport/reports/${name}`, { from: from || undefined, to: to || undefined }); const d = g.data;
  const csv = () => download(`/transport/reports/${name}?format=csv${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`, `transport-${name}.csv`);
  return (
    <div className="space-y-3">
      <Tabs label="Reports" value={name} onChange={setName} items={NAMES} />
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field><button className={btnGhost} onClick={csv}>Download as a spreadsheet</button></div></Card>
      <Loading g={g}>{d && (
        <>
          <p className="text-xs text-[#5b6b7b]">{day(d.from)} to {day(d.to)}</p>
          {d.note && <Note>{d.note}</Note>}
          {d.rows.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">Nothing in this period.</p></Card> : name === 'punctuality' ? (
            <Table label="Punctuality" head={['Route', 'Run', 'Trips', 'On time', 'Average delay', 'Worst delay', 'Children not accounted for']} min={720}>{d.rows.map((r) => <tr key={`${r.route}${r.direction}`}><Td className="font-medium">{r.route}</Td><Td>{DIR_SHORT[r.direction]}</Td><Td>{r.trips}</Td><Td>{r.onTimePct == null ? '—' : `${r.onTimePct}%`}</Td><Td>{r.avgDelay == null ? '—' : `${r.avgDelay} min`}</Td><Td>{r.maxDelay} min</Td><Td className={r.unreconciled ? 'font-semibold text-[#9f1239]' : ''}>{r.unreconciled}</Td></tr>)}</Table>
          ) : name === 'ridership' ? (
            <Table label="Ridership" head={['Route', 'Run', 'Trips', 'Children carried', 'Not at the stop', 'Not riding', 'Exceptions']} min={720}>{d.rows.map((r) => <tr key={`${r.route}${r.direction}`}><Td className="font-medium">{r.route}</Td><Td>{DIR_SHORT[r.direction]}</Td><Td>{r.trips}</Td><Td>{r.boarded}</Td><Td>{r.noShow}</Td><Td>{r.optedOut}</Td><Td>{r.exceptions}</Td></tr>)}</Table>
          ) : (
            <Table label="Exceptions" head={['Date', 'Route', 'Child', 'What', 'Settled']} min={720}>{d.rows.map((r, i) => <tr key={i}><Td>{day(r.date)}</Td><Td>{r.route} · {DIR_SHORT[r.direction]}</Td><Td>{r.student}<div className="text-xs text-[#5b6b7b]">{r.className}</div></Td><Td>{KIND_WORD[r.kind] || r.kind}<div className="text-xs text-[#5b6b7b]">{r.note}</div></Td><Td className="text-xs">{r.settled ? `Yes: ${r.resolution}${r.by ? ` (${r.by})` : ''}` : <span className="font-semibold text-[#9f1239]">Not yet</span>}</Td></tr>)}</Table>
          )}
        </>
      )}</Loading>
    </div>
  );
}
