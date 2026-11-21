import React from 'react';
import { Modal } from '../ui';
import { useGet, Loading, Table, Td, Value, Tag, nf } from './gKit';
import { withUnit, SOURCE } from './gKit';

// One campus: its classes with the same measures, and the rules that apply to it today.
export default function CampusDetail({ campusId, period, onClose }) {
  const g = useGet(`/group/rollup/${campusId}`, { from: period.from, to: period.to });
  return (
    <Modal title={g.data ? g.data.campus.name : 'Campus'} onClose={onClose} wide>
      <Loading g={g}>{g.data && (
        <div className="space-y-4">
          <p className="text-sm text-[#5b6b7b]">{g.data.campus.code ? `Code ${g.data.campus.code}. ` : ''}{g.data.campus.address ? `${g.data.campus.address}. ` : ''}Period {g.data.from} to {g.data.to}.</p>
          <h3 className="text-sm font-bold text-[#1b2837]">Classes</h3>
          {g.data.classes.length === 0 ? <p className="text-sm text-[#5b6b7b]">No classes are placed in this campus yet.</p> : (
            <Table label="Classes in this campus" head={['Class', 'Children', ...Object.values(g.data.measures).map((m) => m.name)]} min={480}>
              {g.data.classes.map((c) => <tr key={c.classId}><Td><span className="font-semibold">{c.label}</span></Td><Td><span dir="ltr">{nf(c.students)}</span></Td>{Object.keys(g.data.measures).map((k) => <Td key={k}>{c.measures[k] ? <Value t={c.measures[k]} /> : '—'}</Td>)}</tr>)}
            </Table>)}
          <h3 className="text-sm font-bold text-[#1b2837]">Rules that apply here</h3>
          <Table label="Rules that apply to this campus" head={['Rule', 'Value', 'Where it comes from']} min={480}>
            {g.data.policies.map((r) => <tr key={r.key}><Td>{r.label}</Td><Td><span dir="ltr" className="font-semibold">{withUnit(r.value, r.unit)}</span></Td><Td><Tag tone={(SOURCE[r.source.kind] || SOURCE.default)[1]}>{(SOURCE[r.source.kind] || SOURCE.default)[0]}</Tag>{r.locked && <> <Tag tone="warn">Locked</Tag></>}</Td></tr>)}
          </Table>
        </div>)}</Loading>
    </Modal>
  );
}
