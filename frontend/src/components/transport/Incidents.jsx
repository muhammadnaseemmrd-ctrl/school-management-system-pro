import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Field, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useGet, Loading, Table, Td, Reason, AskForm, PageBar, TBadge, Trail, KIND_WORD, dt } from './tpKit';

export default function Incidents() {
  const [status, setStatus] = useState('open_all'); const [kind, setKind] = useState(''); const [page, setPage] = useState(1); const g = useGet('/transport/incidents', { status: status || undefined, kind: kind || undefined, page, limit: 25 }); const [form, setForm] = useState(false); const [ask, setAsk] = useState(null); const [open, setOpen] = useState(null);
  const take = async (i) => { try { await apiClient.post(`/transport/incidents/${i._id}`, { action: 'acknowledge' }); toast.success('Taken up.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3">
        <Field label="Show"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="open_all">Open and being handled</option><option value="resolved">Settled</option><option value="">All</option></select></Field>
        <Field label="Kind"><select className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">All kinds</option>{Object.entries(KIND_WORD).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
        <button className={btnPrimary} onClick={() => setForm(true)}>Report an incident</button></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="Nothing to show" text="Incidents from drivers, the office and families appear here with a number." /></Card> : <>
        <Table label="Incidents" head={['Number', 'What', 'When', 'Severity', 'Status', '']} min={760}>{g.data.rows.map((i) => (
          <tr key={i._id}><Td className="font-mono text-xs">{i.incidentNo}</Td><Td><b>{KIND_WORD[i.kind] || i.kind}</b>{i.studentName ? ` · ${i.studentName}` : ''}<div className="text-xs text-[#5b6b7b]">{i.note}</div>{i.resolution && <div className="text-xs text-[#215a52]">Done: {i.resolution}</div>}</Td><Td className="text-xs">{dt(i.createdAt)}<br />{i.reportedByName}</Td><Td><TBadge k="severity" s={i.severity} /></Td><Td><TBadge k="incident" s={i.status} />{i.keepPositions && i.status !== 'resolved' && <div className="mt-1 text-[11px] text-[#5b6b7b]">Track kept</div>}</Td>
            <Td><span className="flex flex-wrap gap-1">{i.status === 'open' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => take(i)} aria-label={`Take up ${i.incidentNo}`}>Take up</button>}{i.status !== 'resolved' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(i)} aria-label={`Settle ${i.incidentNo}`}>Settle</button>}<button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(open === i._id ? null : i._id)} aria-expanded={open === i._id}>History</button></span>{open === i._id && <div className="mt-2"><Trail rows={i.trail} /></div>}</Td></tr>))}</Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} /></>)}</Loading>
      {form && <AskForm title="Report an incident" confirm="Report" fields={[{ k: 'kind', label: 'What kind', type: 'select', options: Object.entries(KIND_WORD) }, { k: 'severity', label: 'How serious', type: 'select', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']], def: 'medium' }, { k: 'note', label: 'What happened', type: 'textarea', required: true }]} initial={{ kind: 'other', severity: 'medium' }} onClose={() => setForm(false)} onDone={async (x) => { await apiClient.post('/transport/incidents', x); setForm(false); toast.success('Reported.'); g.reload(); }} />}
      {ask && <Reason title={`Settle ${ask.incidentNo}`} text="Write what was done. Any saved bus track for this incident is deleted by the next daily check after it is settled." confirm="Mark as settled" danger={false} label="What was done" min={10} onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/transport/incidents/${ask._id}`, { action: 'resolve', resolution: r }); setAsk(null); toast.success('Settled.'); g.reload(); }} />}
    </div>
  );
}
