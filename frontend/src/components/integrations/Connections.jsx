import React from 'react';
import { Card, btnPrimary, btnGhost } from '../ui';
import { Loading, Table, Td, Tag, CStatus, KIND_LABEL, dt, useGet } from './iKit';

export default function Connections({ onOpen, onAdd, version }) {
  const g = useGet('/integrations/connectors', { v: version });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button className={btnPrimary} onClick={onAdd}>Add a connection</button></div>
      <Loading g={g}>{g.data && (g.data.connectors.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">No connections yet. Add one to let another system read from the school, hear about events, open learning tools, or let staff sign in with their school account.</p></Card> : (
        <Table label="Connections" head={['Name', 'Kind', 'Status', 'What it can see', 'Last used', '']} min={760}>
          {g.data.connectors.filter((c) => c.status !== 'revoked').concat(g.data.connectors.filter((c) => c.status === 'revoked')).map((c) => (
            <tr key={c.id}><Td><span className="font-semibold text-[#1b2837]">{c.name}</span></Td><Td>{KIND_LABEL[c.kind]}</Td><Td><CStatus s={c.status} /></Td>
              <Td><div className="flex flex-wrap gap-1">{c.shares.length ? c.shares.map((s) => <Tag key={s} tone="info">{s}</Tag>) : <span className="text-[#5b6b7b]">Nothing</span>}</div></Td><Td>{c.lastUsedAt ? dt(c.lastUsedAt) : '—'}</Td>
              <Td><button className={btnGhost} onClick={() => onOpen(c.id)} aria-label={`Open ${c.name}`}>Open</button></Td></tr>))}
        </Table>))}</Loading>
    </div>
  );
}
