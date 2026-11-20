import React, { useState } from 'react';
import { Card, Pill, btnGhost, inputCls } from '../ui';
import { Bar, Body, Row, Sub, Td, Tbl, useList } from '../attendance/deskKit';
import { BATCH_TONE, dt } from './omrKit';
import SheetsView from './SheetsView';
import BatchView from './BatchView';

function Sittings({ open }) {
  const [status, setStatus] = useState(''); const l = useList('/omr/batches', 'batches', status ? { status } : {});
  return (
    <Card><Bar><label className="text-sm font-medium" htmlFor="omr-bs">Show</label><select id="omr-bs" className={`${inputCls} w-48`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All sittings</option>{['Scanning', 'Graded', 'Moderation', 'Approved', 'Published'].map((s) => <option key={s}>{s}</option>)}</select></Bar>
      <Body l={l} cols={5} empty="No sittings yet. Open an answer sheet and choose Start a sitting."><Tbl head={['Sitting', 'Sheet', 'Status', 'Started', '']}>{l.rows.map((b) => <Row key={b._id}><Td><button className="text-left font-semibold text-[#234c91] hover:underline" onClick={() => open(b._id)}>{b.title}</button></Td><Td>{b.formTitle}<Sub>Code {String(b.formCode).padStart(4, '0')}</Sub></Td><Td><Pill value={BATCH_TONE[b.status]}>{b.status}</Pill></Td><Td className="text-xs">{dt(b.createdAt)}</Td><Td><button className={btnGhost} onClick={() => open(b._id)}>Open</button></Td></Row>)}</Tbl></Body></Card>
  );
}

// Paper exams: print answer sheets, photograph them, check what the reader was unsure of, grade, moderate, publish
export default function OmrDesk({ isAdmin = false }) {
  const [tab, setTab] = useState('sheets'); const [batch, setBatch] = useState(null);
  const open = (id) => { setBatch(id); setTab('sittings'); };
  if (batch) return <BatchView id={batch} isAdmin={isAdmin} onBack={() => setBatch(null)} />;
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Paper exams" className="flex flex-wrap gap-2">{[['sheets', 'Answer sheets'], ['sittings', 'Sittings']].map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-[#1b2837] text-white' : 'bg-[#f7f6f2] text-[#3b4a5c] hover:bg-[#e9efee]'}`}>{v}</button>)}</div>
      {tab === 'sheets' && <SheetsView openBatch={open} />}{tab === 'sittings' && <Sittings open={open} />}
    </div>
  );
}
