import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { btnPrimary, Card } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, Loading, Note, Table, Td, Tag, AskForm, Empty, dt } from '../advancement/advKit';

const CONSENT = { granted: ['Agreed', 'good'], denied: ['Said no', 'none'], none: ['Not asked', 'none'], withdrawn: ['Withdrawn', 'none'], unknown: ['Not asked', 'none'] };

// What the school's devices recorded about a child, shown to the family, with a way to challenge it.
export default function FamilySignals() {
  const [ver, setVer] = useState(0); const g = useGet('/security/my-signals', { v: ver }); const a = useGet('/security/my-appeals', { v: ver }); const [m, setM] = useState(null);
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-[#1b2837]">What the school&apos;s devices recorded</h2><p className="mt-1 text-sm text-[#5b6b7b]">Only the short facts below are kept. No faces, photos or recordings of your child are stored.</p></div>
      <Loading g={g}>{g.data && (<>
        <Note>{g.data.note}</Note>
        {g.data.pilots.length > 0 && <Card><h3 className="text-sm font-bold">Trials running now</h3><ul className="mt-2 space-y-2 text-sm">{g.data.pilots.map((p, i) => <li key={i}><b>{p.title}</b>: {p.purpose}<span className="block text-xs text-[#5b6b7b]">Kept {p.retentionDays} days. If you say no: {p.manualAlternative}</span></li>)}</ul></Card>}
        {g.data.children.map((c) => (
          <Card key={String(c.studentId)}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-[#1b2837]">{c.name}</h3><Tag tone={(CONSENT[c.consent] || CONSENT.none)[1]}>{(CONSENT[c.consent] || CONSENT.none)[0]}</Tag></div>
            {c.signals.length === 0 ? <p className="mt-2 text-sm text-[#5b6b7b]">Nothing has been recorded.</p> : <div className="mt-2"><Table label={`Signals for ${c.name}`} head={['When', 'What', 'Where', 'Used as evidence', '']} min={640}>{c.signals.map((s) => <tr key={s.id}><Td>{dt(s.at)}</Td><Td>{s.kind}</Td><Td>{s.place || '—'}</Td><Td>{s.state === 'used' ? 'Yes, as extra evidence' : s.state === 'held' ? 'Waiting for a person' : s.state === 'dismissed' ? 'No' : 'Stored only'}</Td><Td><button className="text-sm font-semibold text-[#234c91] underline" onClick={() => setM({ c, s })} aria-label={`Challenge the signal of ${dt(s.at)}`}>This is wrong</button></Td></tr>)}</Table></div>}
            <div className="mt-3"><button className={btnPrimary} onClick={() => setM({ c })}>Ask the school about this</button></div>
          </Card>))}
      </>)}</Loading>
      <Loading g={a}>{a.data && a.data.appeals.length > 0 && <Card><h3 className="text-sm font-bold">Your questions</h3><ul className="mt-2 space-y-2 text-sm">{a.data.appeals.map((x) => <li key={x.no}><span dir="ltr">{x.no}</span> · <Tag tone={x.status === 'Open' ? 'warn' : 'good'}>{x.status === 'Open' ? 'Waiting for an answer' : x.status}</Tag><span className="block text-[#3b4a5c]">{x.statement}</span>{x.decision?.note && <span className="block text-xs text-[#5b6b7b]">The school answered: {x.decision.note}</span>}</li>)}</ul></Card>}</Loading>
      {m && <AskForm title={m.s ? 'This signal is wrong' : 'Ask the school'} intro="Someone who was not involved will answer. If you are right, the signal and anything tied to it are removed." fields={[{ k: 'statement', label: 'What you think is wrong (at least a sentence)', type: 'textarea', required: true }]} onClose={() => setM(null)} onDone={async (v) => { await apiClient.post('/security/my-appeals', { about: m.s ? 'signal' : 'other', aboutId: m.s?.id, studentId: m.c.studentId, statement: v.statement }); toast.success('Sent. The school will answer you.'); setM(null); setVer(ver + 1); }} />}
    </div>
  );
}
