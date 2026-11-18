import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pager, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub } from '../attendance/deskKit';
import { dayTime, CodeBox } from './safetyKit';
import VisitorsTab from './VisitorsTab';

// One-day alternate collector. The code is shown once and the school never keeps it in readable form.
const Alternates = ({ kids }) => {
  const l = useList('/safety/dismissal/authorizations', 'authorizations'); const [nw, setNw] = useState(false); const [code, setCode] = useState(null);
  const today = new Date().toLocaleDateString('en-CA');
  const [f, setF] = useState({ studentId: kids[0]?._id || '', personName: '', phone: '', relationship: '', day: today });
  const save = async () => { try { const r = await apiClient.post('/safety/dismissal/authorizations', f); setNw(false); l.reload(); setCode({ title: `Collection code for ${f.personName}`, code: r.data.code, note: `Valid on ${f.day} only. Give this code to ${f.personName}. They must also show their name at the gate. It is shown once.` }); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <Bar><button className={btnPrimary} onClick={() => setNw(true)} disabled={!kids.length}>Let someone else collect my child</button></Bar>
      <Body l={l} cols={4} empty="No one else is authorised. Your child is only released to the guardians the school has on file.">
        <Tbl head={['Person', 'Child', 'Day', '']}>{l.rows.map((a) => <Row key={a._id}><Td>{a.personName}<Sub>{a.relationship}</Sub></Td><Td>{a.studentName}</Td><Td>{a.day}<Sub>{a.status}</Sub></Td><Td cls="text-end">{a.status === 'Active' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/dismissal/authorizations/${a._id}/revoke`, {}), 'Cancelled', l.reload)}>Cancel</button>}</Td></Row>)}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {nw && <Modal title="Authorise one person for one day" onClose={() => setNw(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Child"><select className={inputCls} value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}>{kids.map((k) => <option key={k._id} value={k._id}>{k.name}</option>)}</select></Field>
          <Field label="Day"><input type="date" className={inputCls} min={today} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Full name of the person"><input className={inputCls} value={f.personName} onChange={(e) => setF({ ...f, personName: e.target.value })} maxLength={80} /></Field>
          <Field label="Relation"><input className={inputCls} value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} maxLength={40} placeholder="e.g. Uncle" /></Field>
          <div className="sm:col-span-2"><Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field></div>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setNw(false)}>Cancel</button><button className={btnPrimary} disabled={!f.studentId || f.personName.trim().length < 3} onClick={save}>Authorise</button></div>
      </Modal>}
      {code && <CodeBox {...code} onClose={() => setCode(null)} />}
    </Card>
  );
};

const History = () => {
  const l = useList('/safety/dismissal/mine', 'events');
  return (
    <Card className="!p-0"><Body l={l} cols={4} empty="Nobody has collected your child at school yet.">
      <Tbl head={['When', 'Child', 'Collected by']}>{l.rows.map((e) => <Row key={e._id}><Td cls="whitespace-nowrap">{dayTime(e.at)}</Td><Td>{e.studentName}</Td><Td>{e.collectorName}<Sub>{e.relationship}</Sub></Td></Row>)}</Tbl>
      <Pager pagination={l.pagination} onPage={l.setPage} />
    </Body></Card>
  );
};

const FamilySafety = ({ role = 'parent', kids = [], meId }) => {
  const TABS = role === 'parent' ? [['history', 'Who collected my child'], ['alt', 'Someone else collects'], ['visits', 'Visit the school']] : [['history', 'Who collected me']];
  const [tab, setTab] = useState('history');
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {tab === 'history' && <History />}
      {tab === 'alt' && <Alternates kids={kids} />}
      {tab === 'visits' && <VisitorsTab role="parent" duty={false} gates={['Main gate']} hosts={[]} kids={kids} meId={meId} />}
    </div>
  );
};
export default FamilySafety;
