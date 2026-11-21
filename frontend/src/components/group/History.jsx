import React from 'react';
import { Modal } from '../ui';
import { useGet, Loading, Table, Td, Status, dt, withUnit } from './gKit';

// Every version of one rule, with who made it, why, and who decided.
export default function History({ spec, campus, onClose }) {
  const g = useGet('/group/policies/history', { key: spec.key, ...(campus ? { campusId: campus.campusId } : {}) });
  return (
    <Modal title={`History: ${spec.label}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-[#5b6b7b]">{campus ? `For ${campus.name}.` : 'For the whole group.'} Nothing here is ever edited or deleted. A change is a new version.</p>
      <Loading g={g}>{g.data && (g.data.versions.length === 0 ? <p className="text-sm text-[#5b6b7b]">No one has set this yet.</p> : (
        <Table label="Versions of this rule" head={['Version', 'Value', 'Limits', 'Status', 'Made by', 'Reason', 'Decided by']} min={760}>
          {g.data.versions.map((v) => (
            <tr key={v.version}>
              <Td><span dir="ltr">{v.version}</span></Td>
              <Td><span dir="ltr" className="font-semibold">{v.value === null || v.value === undefined ? (campus ? 'No override' : 'Not set') : withUnit(v.value, spec.unit)}</span>{v.locked && <p className="text-[11px] text-[#8a4636]">Locked</p>}</Td>
              <Td><span dir="ltr" className="text-xs">{v.lo !== null && v.lo !== undefined ? v.lo : spec.min} to {v.hi !== null && v.hi !== undefined ? v.hi : spec.max}</span></Td>
              <Td><Status s={v.status} />{v.soleAdmin && <p className="text-[11px] text-[#5b6b7b]">Decided by the only school-wide administrator</p>}</Td>
              <Td>{v.madeByName}<p className="text-[11px] text-[#5b6b7b]">{dt(v.madeAt)}</p></Td>
              <Td>{v.reason}</Td>
              <Td>{v.decidedByName ? <>{v.decidedByName}<p className="text-[11px] text-[#5b6b7b]">{dt(v.decidedAt)}{v.decisionNote ? ` · ${v.decisionNote}` : ''}</p></> : <span className="text-[#5b6b7b]">—</span>}</Td>
            </tr>))}
        </Table>))}</Loading>
    </Modal>
  );
}
