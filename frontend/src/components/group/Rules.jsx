import React, { useState } from 'react';
import { Card, btnGhost } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, Loading, Note, Table, Td, Tag, AskForm, call, withUnit, SOURCE, IGNORED, today } from './gKit';
import History from './History';

const bits = (spec) => `Between ${spec.min.toLocaleString('en-PK')} and ${spec.max.toLocaleString('en-PK')} ${spec.unit}.`;

// What applies to a campus, where each value comes from, and how to change it: for the whole group, or for one campus inside the group's limits.
export default function Rules({ acc }) {
  const [cid, setCid] = useState(acc.campuses[0] ? acc.campuses[0].campusId : ''); const [asOf, setAsOf] = useState(''); const [ask, setAsk] = useState(null); const [hist, setHist] = useState(null); const [n, setN] = useState(0);
  const camp = acc.campuses.find((c) => c.campusId === cid) || acc.campuses[0];
  return (
    <div className="space-y-4">
      {acc.wide && <GroupRules key={`g${n}`} onAsk={setAsk} onHist={(spec) => setHist({ spec, campus: null })} />}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-[#1b2837]">Campus
            <select className="mt-1 block w-56 rounded-lg border border-[#c9d1d1] bg-white px-3 py-2 text-sm font-normal" value={camp ? camp.campusId : ''} onChange={(e) => setCid(e.target.value)}>{acc.campuses.map((c) => <option key={c.campusId} value={c.campusId}>{c.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-[#1b2837]">Look back to
            <input type="date" className="mt-1 block rounded-lg border border-[#c9d1d1] bg-white px-3 py-2 text-sm font-normal" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} /></label>
          {asOf && <button className={btnGhost} onClick={() => setAsOf('')}>Back to today</button>}
        </div>
      </Card>
      {camp && <CampusRules key={`${camp.campusId}${asOf}${n}`} camp={camp} asOf={asOf} acc={acc} onAsk={setAsk} onHist={(spec) => setHist({ spec, campus: camp })} />}
      {ask && <Change {...ask} onClose={() => setAsk(null)} onDone={() => { setAsk(null); setN(n + 1); }} />}
      {hist && <History spec={hist.spec} campus={hist.campus} onClose={() => setHist(null)} />}
    </div>
  );
}

function GroupRules({ onAsk, onHist }) {
  const g = useGet('/group/policies/group'); const cat = useGet('/group/policies/catalog');
  return (
    <Card>
      <h2 className="text-base font-bold text-[#1b2837]">Rules for the whole group</h2>
      <p className="mt-1 text-sm text-[#5b6b7b]">A value set here applies to every campus. Limits say how far a campus may move from it, and a lock stops a campus changing it at all. A change waits for a second school-wide administrator.</p>
      <div className="mt-3"><Loading g={g}>{g.data && cat.data && (
        <Table label="Rules for the whole group" head={['Rule', 'Value', 'Limits', 'Campuses with their own', 'Status', '']} min={820}>
          {g.data.rules.map((r) => { const spec = cat.data.rules.find((x) => x.key === r.key) || r; return (
            <tr key={r.key}>
              <Td><span className="font-semibold text-[#1b2837]">{r.label}</span><p className="text-[11px] text-[#5b6b7b]">{r.consumer}</p></Td>
              <Td><span dir="ltr" className="font-semibold">{r.value !== null ? withUnit(r.value, r.unit) : `Not set (${r.fallbackValue === null || r.fallbackValue === undefined ? 'none' : withUnit(r.fallbackValue, r.unit)} in use)`}</span>{r.locked && <> <Tag tone="warn">Locked</Tag></>}</Td>
              <Td><span dir="ltr" className="text-xs">{r.lo} to {r.hi}</span></Td>
              <Td><span dir="ltr">{r.overrides}</span></Td>
              <Td>{r.pending ? <Tag tone="warn">Version {r.pending.version} waiting</Tag> : <span className="text-xs text-[#5b6b7b]">Version {r.version || 0}</span>}</Td>
              <Td><div className="flex flex-wrap gap-1"><button className={btnGhost} disabled={!!r.pending} onClick={() => onAsk({ mode: 'group', spec, row: r })} aria-label={`Change ${r.label} for the group`}>Change</button><button className={btnGhost} onClick={() => onHist(spec)} aria-label={`History of ${r.label}`}>History</button></div></Td>
            </tr>); })}
        </Table>)}</Loading></div>
    </Card>
  );
}

function CampusRules({ camp, asOf, acc, onAsk, onHist }) {
  const g = useGet('/group/policies', { campusId: camp.campusId, ...(asOf ? { asOf } : {}) });
  return (
    <Card>
      <h2 className="text-base font-bold text-[#1b2837]">What applies at {camp.name}{asOf ? ` on ${asOf}` : ''}</h2>
      <p className="mt-1 text-sm text-[#5b6b7b]">A campus value wins when the group allows it. Otherwise the group's value applies, and with neither, the module's own setting.</p>
      <div className="mt-3"><Loading g={g}>{g.data && (
        <Table label={`Rules at ${camp.name}`} head={['Rule', 'Value', 'Where it comes from', 'Waiting', '']} min={820}>
          {g.data.rules.map((r) => { const src = SOURCE[r.source.kind] || SOURCE.default; return (
            <tr key={r.key}>
              <Td><span className="font-semibold text-[#1b2837]">{r.label}</span><p className="text-[11px] text-[#5b6b7b]">{r.help}</p></Td>
              <Td><span dir="ltr" className="font-semibold">{withUnit(r.value, r.unit)}</span>{r.lo !== null && r.lo !== undefined && !r.campusOnly && <p className="text-[11px] text-[#5b6b7b]" dir="ltr">May move {r.lo} to {r.hi}</p>}</Td>
              <Td><Tag tone={src[1]}>{src[0]}{r.source.version ? ` · v${r.source.version}` : ''}</Tag>{r.locked && <> <Tag tone="warn">Locked by the group</Tag></>}{r.ignored && <p className="mt-1 text-[11px] text-[#8a4636]">{IGNORED[r.ignored]} ({withUnit(r.override, r.unit)} is kept in the history.)</p>}</Td>
              <Td>{r.pendingGroup && <p className="text-xs"><Tag tone="warn">Group</Tag> {withUnit(r.pendingGroup.value, r.unit)}</p>}{r.pendingCampus && <p className="text-xs"><Tag tone="warn">Campus</Tag> {r.pendingCampus.value === null ? 'Remove override' : withUnit(r.pendingCampus.value, r.unit)}</p>}</Td>
              <Td><div className="flex flex-wrap gap-1">{asOf ? null : <button className={btnGhost} disabled={!r.canOverride || !!r.pendingCampus} onClick={() => onAsk({ mode: 'campus', spec: r, row: r, camp })} aria-label={`${r.campusOnly ? 'Set' : 'Change'} ${r.label} for ${camp.name}`}>{r.campusOnly ? 'Set' : 'Change'}</button>}<button className={btnGhost} onClick={() => onHist(r)} aria-label={`History of ${r.label}`}>History</button></div>{!asOf && !r.canOverride && r.locked && <p className="mt-1 text-[11px] text-[#5b6b7b]">Locked</p>}</Td>
            </tr>); })}
        </Table>)}</Loading></div>
      {!acc.wide && <div className="mt-3"><Note tone="info">Changes you ask for wait for a school-wide administrator to approve them. Nothing changes until they do.</Note></div>}
    </Card>
  );
}

// the form for a change: the group's value and limits, or one campus's own value
function Change({ mode, spec, row, camp, onClose, onDone }) {
  const group = mode === 'group'; const unit = spec.unit;
  const fields = group
    ? [{ k: 'value', label: `Value (${unit})`, type: 'number', min: spec.min, max: spec.max, step: spec.step, hint: `${bits(spec)} Leave empty to set only limits.` },
      { k: 'lo', label: 'Lowest a campus may choose', type: 'number', min: spec.min, max: spec.max, step: spec.step }, { k: 'hi', label: 'Highest a campus may choose', type: 'number', min: spec.min, max: spec.max, step: spec.step },
      { k: 'locked', type: 'check', label: 'Lock', text: 'Campuses may not change this rule', full: true }, { k: 'reason', label: 'Reason (kept in the history)', type: 'textarea', required: true, max: 300 }]
    : [{ k: 'value', label: `Value for ${camp.name} (${unit})`, type: 'number', min: row.lo ?? spec.min, max: row.hi ?? spec.max, step: spec.step, hint: `${row.lo !== null && row.lo !== undefined && !spec.campusOnly ? `The group allows ${row.lo} to ${row.hi}. ` : bits(spec)}Leave empty to remove this campus's own value.` },
      { k: 'reason', label: 'Reason (kept in the history)', type: 'textarea', required: true, max: 300 }];
  const initial = group ? { value: row.value ?? '', lo: row.lo ?? '', hi: row.hi ?? '', locked: !!row.locked } : { value: row.override ?? '' };
  const send = async (v) => {
    const body = { value: v.value === '' ? null : Number(v.value), reason: v.reason };
    if (group) { body.lo = v.lo === '' ? null : Number(v.lo); body.hi = v.hi === '' ? null : Number(v.hi); body.locked = !!v.locked; }
    await apiClient.put(group ? `/group/policies/group/${spec.key}` : `/group/policies/campus/${camp.campusId}/${spec.key}`, body);
    call(async () => ({}), 'Sent for approval. Nothing changes until it is approved.'); onDone();
  };
  return <AskForm title={`${spec.label}${group ? ': whole group' : `: ${camp.name}`}`} intro={`${spec.help || ''} ${group ? 'A second school-wide administrator must approve this.' : 'A school-wide administrator must approve this.'}`.trim()} fields={fields} initial={initial} confirm="Send for approval" onClose={onClose} onDone={send} wide />;
}
