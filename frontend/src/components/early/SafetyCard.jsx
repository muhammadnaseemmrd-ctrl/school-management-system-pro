import React from 'react';
import { Modal, Pill, btnGhost } from '../ui';
import { useGet, Loading, SEV_TONE, Note } from './earlyKit';

// The sheet a carer reads before food, an outing or an emergency. Every open of it is recorded.
export default function SafetyCard({ roomId, onClose }) {
  const g = useGet(`/early/rooms/${roomId}/safety-card`); const d = g.data;
  return (
    <Modal title={d ? `Safety card: ${d.room.name}` : 'Safety card'} onClose={onClose} wide>
      <Loading g={g}>{d && (
        <div className="grid gap-3">
          <Note>Opening this card is recorded. Do not copy it or photograph it.</Note>
          <button className={`${btnGhost} justify-self-end`} onClick={() => window.print()}>Print</button>
          <ul className="divide-y divide-[#e3e7e7]">{d.children.map((c) => (
            <li key={c.childId} className="py-2">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{c.name}</span><span className="text-xs text-[#5b6b7b]">{c.age}</span>{c.here ? <Pill value="Approved">Here</Pill> : <Pill value="None">Not here</Pill>}{c.unconfirmedFromFamily > 0 && <Pill value="Pending">Family update waiting</Pill>}</div>
              {c.allergies.length === 0 && !c.medicalAlert && !c.diet && <div className="text-xs text-[#5b6b7b]">Nothing recorded.</div>}
              {c.allergies.map((a) => <div key={a.what} className="mt-1 text-sm"><Pill value={SEV_TONE[a.severity]}>{a.severity}</Pill> <b>{a.what}</b> {a.action && <>— {a.action}</>}{!a.confirmed && <span className="ms-1 text-xs text-[#8a4636]">(not yet confirmed with the family)</span>}</div>)}
              {c.medicalAlert && <div className="mt-1 text-sm"><Pill value="Pending">Alert</Pill> {c.medicalAlert}</div>}
              {c.diet && <div className="mt-1 text-sm">Diet: {c.diet}</div>}
              {c.emergency.length > 0 && <div className="mt-1 text-xs text-[#3b4a5c]">Emergency: {c.emergency.map((e) => `${e.name}${e.relationship ? ` (${e.relationship})` : ''} ${e.phone}`).join(' · ')}</div>}
            </li>))}</ul>
        </div>)}</Loading>
    </Modal>
  );
}
