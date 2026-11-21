import React, { useState } from 'react';
import { Card, Field, inputCls, btnGhost } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, PageBar, dt, download } from './iKit';

// Everything that left the school through a connection: who got it, what kind of information, how many records.
export default function Activity() {
  const list = useGet('/integrations/connectors'); const [f, setF] = useState({ connectorId: '', from: '', to: '' }); const [page, setPage] = useState(1);
  const q = { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page, limit: 25 }; const g = useGet('/integrations/disclosures', q);
  const set = (k, v) => { setF({ ...f, [k]: v }); setPage(1); };
  const csv = () => download(`/integrations/disclosures?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), format: 'csv', limit: 500 })}`, 'disclosures.csv');
  return (
    <div className="space-y-4">
      <Note tone="info">Every time information leaves the school through a connection, it is written here. Nothing is left out, and nothing here can be changed.</Note>
      <Card><div className="grid gap-3 sm:grid-cols-4">
        <Field label="Connection"><select className={inputCls} value={f.connectorId} onChange={(e) => set('connectorId', e.target.value)}><option value="">All connections</option>{(list.data ? list.data.connectors : []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="From"><input className={inputCls} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field label="To"><input className={inputCls} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></Field>
        <div className="flex items-end"><button className={btnGhost} onClick={csv}>Download as CSV</button></div>
      </div></Card>
      <Loading g={g}>{g.data && (g.data.disclosures.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">Nothing has been shared in this period.</p></Card> : (
        <>
          <Table label="Information shared through connections" head={['When', 'Connection', 'How', 'What', 'Kinds of information', 'Records']} min={760}>
            {g.data.disclosures.map((d) => (
              <tr key={d.id}><Td>{dt(d.at)}</Td><Td><span className="font-semibold text-[#1b2837]">{d.connector}</span></Td><Td>{d.channel}</Td><Td>{d.what}</Td><Td><div className="flex flex-wrap gap-1">{d.categories.map((c) => <Tag key={c} tone="info">{c}</Tag>)}</div></Td><Td><span dir="ltr">{d.records}</span></Td></tr>))}
          </Table>
          <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
        </>))}</Loading>
    </div>
  );
}
