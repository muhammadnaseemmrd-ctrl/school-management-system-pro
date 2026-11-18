import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub } from '../attendance/deskKit';
import { STATUS_TONE, localIn, iso, dayTime, Reason, CodeBox } from './safetyKit';

const NewPass = ({ gates, onClose, onDone }) => {
  const [f, setF] = useState({ company: '', personName: '', phone: '', purpose: '', from: localIn(0), to: localIn(240), gates: [] });
  const toggle = (g) => setF({ ...f, gates: f.gates.includes(g) ? f.gates.filter((x) => x !== g) : [...f.gates, g] });
  const save = async () => { try { await apiClient.post('/safety/contractors', { company: f.company, personName: f.personName, phone: f.phone, purpose: f.purpose, validFrom: iso(f.from), validTo: iso(f.to), gates: f.gates }); toast.success('Sent for approval by a different administrator'); onDone(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title="New contractor pass" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company"><input className={inputCls} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} maxLength={80} /></Field><Field label="Person"><input className={inputCls} value={f.personName} onChange={(e) => setF({ ...f, personName: e.target.value })} maxLength={80} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field><Field label="Work to do"><input className={inputCls} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} maxLength={200} /></Field>
        <Field label="Shift starts"><input type="datetime-local" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field><Field label="Shift ends"><input type="datetime-local" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <div className="sm:col-span-2 text-sm"><span className="font-semibold">Gates allowed</span> <span className="text-[#5b6b7b]">(none ticked = any gate)</span><div className="mt-1 flex flex-wrap gap-3">{gates.map((g) => <label key={g} className="flex items-center gap-1"><input type="checkbox" checked={f.gates.includes(g)} onChange={() => toggle(g)} /> {g}</label>)}</div></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.company.trim() || !f.personName.trim() || f.purpose.trim().length < 3} onClick={save}>Create pass</button></div>
    </Modal>
  );
};

const ContractorsTab = ({ gates }) => {
  const [status, setStatus] = useState(''); const l = useList('/safety/contractors', 'passes', { status }); const [nw, setNw] = useState(false); const [code, setCode] = useState(null); const [rev, setRev] = useState(null);
  const cred = async (p) => { try { const r = await apiClient.post(`/safety/contractors/${p._id}/credential`, {}); setCode({ title: `Pass for ${p.personName}`, code: r.data.code, note: `Valid until ${dayTime(r.data.validTo)}. A new code replaces this one.` }); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const move = (p, direction) => act(() => apiClient.post(`/safety/contractors/${p._id}/move`, { direction, gate: gates[0] }), direction === 'in' ? 'Admitted' : 'Marked as left', l.reload);
  return (
    <Card className="!p-0">
      <Bar><button className={btnPrimary} onClick={() => setNw(true)}>New pass</button><select className={`${inputCls} !w-40`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter passes"><option value="">All passes</option>{['Pending', 'Active', 'Revoked', 'Declined'].map((s) => <option key={s}>{s}</option>)}</select></Bar>
      <Body l={l} cols={5} empty="No contractor passes.">
        <Tbl head={['Contractor', 'Shift', 'Gates', 'Status', '']}>{l.rows.map((p) => (
          <Row key={p._id}><Td>{p.personName}<Sub>{p.company} · {p.purpose}</Sub></Td><Td cls="whitespace-nowrap">{dayTime(p.validFrom)}<Sub>until {dayTime(p.validTo)}</Sub></Td><Td>{p.gates.length ? p.gates.join(', ') : 'Any'}{p.deviceIds.length > 0 && <Sub>{p.deviceIds.length} reader(s) only</Sub>}</Td>
            <Td><Pill value={STATUS_TONE[p.status]}>{p.status}</Pill>{p.inside && <Sub>Inside now</Sub>}{p.revokedReason && <Sub>{p.revokedReason}</Sub>}</Td>
            <Td cls="whitespace-nowrap text-end">
              {p.status === 'Pending' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/contractors/${p._id}/decide`, { decision: 'approve' }), 'Approved', l.reload)}>Approve</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/contractors/${p._id}/decide`, { decision: 'decline' }), 'Declined', l.reload)}>Decline</button>{' '}</>}
              {p.status === 'Active' && <><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => cred(p)}>Code</button>{' '}{p.inside ? <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={move(p, 'out')}>Mark left</button> : <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={move(p, 'in')} disabled={!p.live}>Admit</button>}{' '}</>}
              {['Pending', 'Active'].includes(p.status) && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setRev(p)}>Withdraw</button>}
            </Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {nw && <NewPass gates={gates} onClose={() => setNw(false)} onDone={l.reload} />}
      {code && <CodeBox {...code} onClose={() => setCode(null)} />}
      {rev && <Reason title="Withdraw this pass" label="Why?" cta="Withdraw" danger onClose={() => setRev(null)} onSubmit={async (reason) => { try { await apiClient.post(`/safety/contractors/${rev._id}/revoke`, { reason }); setRev(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
    </Card>
  );
};
export default ContractorsTab;
