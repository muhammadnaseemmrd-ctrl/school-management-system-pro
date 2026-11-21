import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, btnGhost, btnPrimary } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, Loading, Note, Table, Td, Tag, Reason, AskForm, dt, withUnit } from './gKit';

// Changes waiting to be decided. The person who made a change never decides it; a school with one school-wide administrator is the exception, and the record says so.
export default function Waiting({ acc, onChanged }) {
  const g = useGet('/group/policies/pending'); const [act, setAct] = useState(null);
  // throws on a refusal, so the form stays open and says why
  const decide = async (item, approve, note) => { await apiClient.post(`/group/policies/${item.docId}/decide`, { approve, note }); toast.success(approve ? 'Approved. It applies now.' : 'Turned down.'); setAct(null); g.reload(); if (onChanged) onChanged(); };
  return (
    <Loading g={g}>{g.data && (
      <div className="space-y-4">
        <Note tone="info">{acc.wide ? 'Check the reason, then approve or turn down. If you made a change yourself, another school-wide administrator must decide it.' : 'These are the changes asked for your campuses. A school-wide administrator decides them.'}</Note>
        {g.data.pending.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">Nothing is waiting.</p></Card> : (
          <Table label="Changes waiting for approval" head={['Rule', 'For', 'Change', 'Reason', 'Asked by', ...(acc.wide ? [''] : [])]} min={820}>
            {g.data.pending.map((p) => (
              <tr key={p.docId}>
                <Td><span className="font-semibold text-[#1b2837]">{p.label}</span></Td>
                <Td>{p.scope === 'group' ? <Tag tone="good">Whole group</Tag> : <Tag tone="info">{p.campusName}</Tag>}</Td>
                <Td><span dir="ltr" className="font-semibold">{p.value === null ? (p.scope === 'campus' ? 'Remove the campus value' : 'Limits only') : withUnit(p.value, p.unit)}</span>{p.locked && <p className="text-[11px] text-[#8a4636]">Locked</p>}{(p.lo !== null && p.lo !== undefined) || (p.hi !== null && p.hi !== undefined) ? <p className="text-[11px] text-[#5b6b7b]" dir="ltr">Limits {p.lo ?? 'widest'} to {p.hi ?? 'widest'}</p> : null}</Td>
                <Td>{p.reason}</Td>
                <Td>{p.madeByName}<p className="text-[11px] text-[#5b6b7b]">{dt(p.madeAt)}</p></Td>
                {acc.wide && <Td><div className="flex flex-wrap gap-1"><button className={btnPrimary} onClick={() => setAct({ item: p, approve: true })} aria-label={`Approve ${p.label}`}>Approve</button><button className={btnGhost} onClick={() => setAct({ item: p, approve: false })} aria-label={`Turn down ${p.label}`}>Turn down</button></div></Td>}
              </tr>))}
          </Table>)}
        {act && (act.approve
          ? <AskForm title={`Approve: ${act.item.label}`} intro={act.item.scope === 'group' ? 'This applies to every campus from now on.' : `This applies to ${act.item.campusName} from now on.`} fields={[{ k: 'note', label: 'Note (optional)', type: 'textarea', max: 300 }]} confirm="Approve" onClose={() => setAct(null)} onDone={(v) => decide(act.item, true, (v.note || '').trim())} />
          : <Reason title={`Turn down: ${act.item.label}`} text="Say why, so the person who asked knows what to change." confirm="Turn down" min={5} onClose={() => setAct(null)} onDone={(note) => decide(act.item, false, note)} />)}
      </div>)}</Loading>
  );
}
