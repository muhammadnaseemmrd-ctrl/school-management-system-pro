import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, Stat, EmptyState, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub } from '../attendance/deskKit';
import { STATUS_TONE, Reason, Banner, dayTime } from './safetyKit';
import VisitorsTab, { CheckInModal } from './VisitorsTab';
import DismissalTab from './DismissalTab';
import DrillsTab from './DrillsTab';
import ContractorsTab from './ContractorsTab';

const Overview = ({ o, onGo, reload }) => {
  const c = o.counts; const [ci, setCi] = useState(null);
  const B = ({ tab, ...p }) => <button className="text-start" onClick={() => onGo(tab)}><Stat {...p} /></button>;
  return (
    <div className="space-y-4">
      {o.drill && <Banner tone="bad"><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{o.drill.title}</b> is running: {o.drill.counts.safe} of {o.drill.counts.expected} students safe{o.drill.counts.missing ? `, ${o.drill.counts.missing} missing` : ''}.</span><button className={btnPrimary} onClick={() => onGo('drills')}>Head count</button></div></Banner>}
      {o.findings.length > 0 && <Card><div className="mb-2 text-sm font-semibold">Needs attention</div><ul className="space-y-1 text-sm">{o.findings.map((f, i) => <li key={i} className="flex gap-2"><Pill value={f.severity === 'High' ? 'Suspended' : 'Pending'}>{f.severity}</Pill><span>{f.text}</span></li>)}</ul></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <B tab="visitors" label="Visitors inside" value={c.visitorsInside} sub={`${c.expectedToday} expected, ${c.awaitingApproval} waiting for approval`} />
        <B tab="contractors" label="Contractors inside" value={c.contractorsInside} sub={c.passesPending ? `${c.passesPending} pass(es) to approve` : 'No passes waiting'} />
        <B tab="dismissal" label="Collected today" value={c.releasedToday} sub={`${c.refusedToday} refused · ${c.exceptionsPending} exception(s) waiting`} tone={c.refusedToday ? 'text-[#9f1239]' : undefined} />
        <B tab="logbook" label="Open logbook items" value={c.openLogItems} sub={c.handoversPending ? `${c.handoversPending} handover waiting` : 'No handover waiting'} />
      </div>
      <Card className="!p-0"><Bar><b className="text-sm">On campus now</b></Bar>
        {o.inside.length + o.contractorsInside.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">No visitors or contractors are inside.</p> : <Tbl head={['Who', 'Host', 'Since', 'Badge']}>{[...o.inside.map((v) => <Row key={v._id}><Td>{v.visitorName}<Sub>{v.kind}</Sub></Td><Td>{v.hostName}</Td><Td>{dayTime(v.checkInAt)}{v.overstay && <Sub>Past the allowed time</Sub>}</Td><Td>{v.badge}</Td></Row>), ...o.contractorsInside.map((p) => <Row key={p._id}><Td>{p.personName}<Sub>{p.company}</Sub></Td><Td>Contractor</Td><Td>pass ends {dayTime(p.validTo)}</Td><Td>—</Td></Row>)]}</Tbl>}
      </Card>
      {o.expected.length > 0 && <Card className="!p-0"><Bar><b className="text-sm">Expected visitors</b></Bar><Tbl head={['Visitor', 'Host', 'Window', '']}>{o.expected.map((v) => <Row key={v._id}><Td>{v.visitorName}<Sub>{v.kind}</Sub></Td><Td>{v.hostName}</Td><Td>{dayTime(v.expectedFrom)} – {dayTime(v.expectedTo)}</Td><Td cls="text-end"><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => setCi(v)}>Check in</button></Td></Row>)}</Tbl></Card>}
      {ci && <CheckInModal visit={ci} gates={o.settings.gates} onClose={() => setCi(null)} onDone={reload} />}
    </div>
  );
};

const GateLog = ({ gates }) => {
  const [f, setF] = useState({ method: '', allowed: '' }); const l = useList('/safety/gate-log', 'entries', f); const [nw, setNw] = useState(false);
  const [m, setM] = useState({ subjectKind: 'other', subjectName: '', direction: 'in', manualReason: '', gate: gates[0] });
  const save = async () => { try { await apiClient.post('/safety/gate-log', m); toast.success('Written down'); setNw(false); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <Bar><button className={btnGhost} onClick={() => setNw(true)}>Write an entry by hand</button><select className={`${inputCls} !w-40`} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Method"><option value="">Any method</option>{['qr', 'reader', 'manual', 'pickup'].map((x) => <option key={x}>{x}</option>)}</select><select className={`${inputCls} !w-40`} value={f.allowed} onChange={(e) => setF({ ...f, allowed: e.target.value })} aria-label="Result"><option value="">All results</option><option value="false">Refused only</option></select></Bar>
      <Body l={l} cols={5} empty="No gate activity yet.">
        <Tbl head={['When', 'Who', 'Direction', 'Credential', 'Result']}>{l.rows.map((e) => <Row key={e._id}><Td cls="whitespace-nowrap">{dayTime(e.at)}</Td><Td>{e.subjectName || 'Unknown'}<Sub>{e.subjectKind}{e.ref ? ` · ${e.ref}` : ''}</Sub></Td><Td>{e.direction === 'in' ? 'In' : 'Out'}<Sub>{e.gate}</Sub></Td><Td>{e.method}{e.manualReason && <Sub>{e.manualReason}</Sub>}</Td><Td>{e.allowed ? <Pill value="Approved">Allowed</Pill> : <Pill value="Suspended">Refused</Pill>}{e.denyReason && <Sub>{e.denyReason}</Sub>}</Td></Row>)}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {nw && <Modal title="Write a gate entry by hand" onClose={() => setNw(false)}>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Who"><select className={inputCls} value={m.subjectKind} onChange={(e) => setM({ ...m, subjectKind: e.target.value })}><option value="other">Someone else</option><option value="staff">Staff</option></select></Field><Field label="Name"><input className={inputCls} value={m.subjectName} onChange={(e) => setM({ ...m, subjectName: e.target.value })} maxLength={80} /></Field>
          <Field label="Direction"><select className={inputCls} value={m.direction} onChange={(e) => setM({ ...m, direction: e.target.value })}><option value="in">In</option><option value="out">Out</option></select></Field>{gates.length > 1 && <Field label="Gate"><select className={inputCls} value={m.gate} onChange={(e) => setM({ ...m, gate: e.target.value })}>{gates.map((g) => <option key={g}>{g}</option>)}</select></Field>}
          <div className="sm:col-span-2"><Field label="Why by hand?"><input className={inputCls} value={m.manualReason} onChange={(e) => setM({ ...m, manualReason: e.target.value })} maxLength={120} placeholder="e.g. reader is offline" /></Field></div></div>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setNw(false)}>Cancel</button><button className={btnPrimary} disabled={!m.subjectName.trim() || m.manualReason.trim().length < 3} onClick={save}>Save</button></div>
      </Modal>}
    </Card>
  );
};

const Logbook = ({ gates, meId }) => {
  const [status, setStatus] = useState(''); const l = useList('/safety/logbook', 'items', { status }); const [nw, setNw] = useState(false); const [res, setRes] = useState(null); const [h, setH] = useState({ list: [], staff: [] }); const [ho, setHo] = useState(false); const [f, setF] = useState({ kind: 'Incident', severity: 'Low', text: '', gate: gates[0] });
  const [hf, setHf] = useState({ to: '', note: '', witnessName: '', keysAndEquipment: '', gate: gates[0] });
  const loadH = useCallback(async () => { try { const [a, b] = await Promise.all([apiClient.get('/safety/handovers'), apiClient.get('/safety/duty-staff')]); setH({ list: a.data.handovers, staff: b.data.staff }); } catch (e) { /* shown by list */ } }, []);
  useEffect(() => { loadH(); }, [loadH]);
  const decide = (x, decision) => act(() => apiClient.post(`/safety/handovers/${x._id}/decide`, { decision, note: decision === 'dispute' ? 'Does not match what I found' : '' }), decision === 'accept' ? 'Shift accepted' : 'Disputed', () => { loadH(); l.reload(); });
  return (
    <div className="space-y-4">
      <Card className="!p-0">
        <Bar><button className={btnPrimary} onClick={() => setNw(true)}>Add to the logbook</button><button className={btnGhost} onClick={() => setHo(true)}>Hand over the shift</button><select className={`${inputCls} !w-36`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter"><option value="">All</option><option>Open</option><option>Resolved</option></select></Bar>
        <Body l={l} cols={4} empty="The logbook is empty.">
          <Tbl head={['When', 'What', 'Status', '']}>{l.rows.map((i) => <Row key={i._id}><Td cls="whitespace-nowrap">{dayTime(i.createdAt)}<Sub>{i.reportedByName}</Sub></Td><Td>{i.text}<Sub>{i.kind} · {i.severity} · {i.gate}{i.carriedCount ? ` · carried over ${i.carriedCount}×` : ''}</Sub>{i.resolution && <Sub>Done: {i.resolution}</Sub>}</Td><Td><Pill value={STATUS_TONE[i.status]}>{i.status}</Pill></Td><Td cls="text-end">{i.status === 'Open' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setRes(i)}>Resolve</button>}</Td></Row>)}</Tbl>
          <Pager pagination={l.pagination} onPage={l.setPage} />
        </Body>
      </Card>
      <Card className="!p-0"><Bar><b className="text-sm">Shift handovers</b></Bar>
        {h.list.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">No handovers yet.</p> : <Tbl head={['When', 'From → to', 'Open items', 'Status', '']}>{h.list.map((x) => <Row key={x._id}><Td cls="whitespace-nowrap">{dayTime(x.createdAt)}<Sub>{x.gate}</Sub></Td><Td>{x.fromName} → {x.toName}{x.witnessName && <Sub>Witness: {x.witnessName}</Sub>}{x.keysAndEquipment && <Sub>{x.keysAndEquipment}</Sub>}</Td><Td>{(x.openItems || []).length}{x.note && <Sub>{x.note}</Sub>}</Td><Td><Pill value={STATUS_TONE[x.status]}>{x.status}</Pill>{x.overdue && <Sub>Waiting too long</Sub>}</Td><Td cls="whitespace-nowrap text-end">{x.status === 'Pending' && String(x.toId) === String(meId) && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={decide(x, 'accept')}>Accept</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={decide(x, 'dispute')}>Dispute</button></>}</Td></Row>)}</Tbl>}
      </Card>
      {nw && <Modal title="Add to the logbook" onClose={() => setNw(false)}><div className="grid gap-3 sm:grid-cols-3"><Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['Incident', 'Action', 'Note'].map((k) => <option key={k}>{k}</option>)}</select></Field><Field label="Severity"><select className={inputCls} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{['Low', 'Medium', 'High'].map((k) => <option key={k}>{k}</option>)}</select></Field>{gates.length > 1 && <Field label="Gate"><select className={inputCls} value={f.gate} onChange={(e) => setF({ ...f, gate: e.target.value })}>{gates.map((g) => <option key={g}>{g}</option>)}</select></Field>}<div className="sm:col-span-3"><Field label="What happened, or what must be done"><textarea className={inputCls} rows={3} maxLength={600} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field></div></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setNw(false)}>Cancel</button><button className={btnPrimary} disabled={f.text.trim().length < 3} onClick={async () => { try { await apiClient.post('/safety/logbook', f); setNw(false); setF({ ...f, text: '' }); l.reload(); } catch (e) { toast.error(errMsg(e)); } }}>Save</button></div></Modal>}
      {res && <Reason title="Resolve this item" label="What was done?" cta="Mark resolved" onClose={() => setRes(null)} onSubmit={async (resolution) => { try { await apiClient.post(`/safety/logbook/${res._id}/resolve`, { resolution }); setRes(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
      {ho && <Modal title="Hand over the shift" onClose={() => setHo(false)}><p className="mb-3 text-sm text-[#3b4a5c]">Open items go with the handover. It counts only when the other person accepts it.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Handing over to"><select className={inputCls} value={hf.to} onChange={(e) => setHf({ ...hf, to: e.target.value })}><option value="">Choose…</option>{h.staff.map((s) => <option key={s.id} value={`${s.role}:${s.id}`}>{s.name} ({s.role})</option>)}</select></Field><Field label="Witness (optional)"><input className={inputCls} value={hf.witnessName} onChange={(e) => setHf({ ...hf, witnessName: e.target.value })} maxLength={80} /></Field><div className="sm:col-span-2"><Field label="Keys and equipment"><input className={inputCls} value={hf.keysAndEquipment} onChange={(e) => setHf({ ...hf, keysAndEquipment: e.target.value })} maxLength={200} /></Field></div><div className="sm:col-span-2"><Field label="Note"><textarea className={inputCls} rows={2} value={hf.note} onChange={(e) => setHf({ ...hf, note: e.target.value })} maxLength={600} /></Field></div></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setHo(false)}>Cancel</button><button className={btnPrimary} disabled={!hf.to} onClick={async () => { try { const [toRole, toId] = hf.to.split(':'); await apiClient.post('/safety/handovers', { toRole, toId, note: hf.note, witnessName: hf.witnessName, keysAndEquipment: hf.keysAndEquipment, gate: hf.gate }); toast.success('Handed over. Waiting for them to accept.'); setHo(false); loadH(); } catch (e) { toast.error(errMsg(e)); } }}>Hand over</button></div></Modal>}
    </div>
  );
};

const Policy = ({ onSaved }) => {
  const [s, setS] = useState(null);
  useEffect(() => { apiClient.get('/safety/settings').then((r) => setS(r.data.settings)).catch((e) => toast.error(errMsg(e))); }, []);
  if (!s) return <div className="skeleton h-40" />;
  const num = (k, label, hint) => <Field label={label} hint={hint}><input type="number" className={inputCls} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} /></Field>;
  const save = act(async () => { const r = await apiClient.put('/safety/settings', { ...s, gates: s.gates }); setS(r.data.settings); onSaved?.(); }, 'Saved');
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3"><Field label="Gates (one per line)"><textarea className={inputCls} rows={3} value={s.gates.join('\n')} onChange={(e) => setS({ ...s, gates: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></Field></div>
        {num('inviteHours', 'Invitation lasts (hours)', 'At most until the visit window ends')}{num('badgeHours', 'Badge lasts (hours)')}{num('maxVisitHours', 'Flag visitors after (hours)')}
        {num('idRetentionDays', 'Keep ID type and last four characters (days)', '0 = wipe as soon as the visit is over')}{num('contractorMaxHours', 'Longest contractor shift (hours)')}{num('handoverAcceptMinutes', 'Handover should be accepted within (minutes)')}{num('familyFallbackMinutes', 'Phone fallback after (minutes)', 'For families who have not opened an emergency notice')}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.requireId} onChange={(e) => setS({ ...s, requireId: e.target.checked })} /> Look at an ID before giving a badge</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.walkInAllowed} onChange={(e) => setS({ ...s, walkInAllowed: e.target.checked })} /> Accept walk-in visitors</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.notifyOnPickup} onChange={(e) => setS({ ...s, notifyOnPickup: e.target.checked })} /> Tell the family when their child is collected</label>
      </div>
      <div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={save}>Save policy</button></div>
    </Card>
  );
};

const SafetyDesk = ({ role = 'admin', meId: meProp }) => {
  const admin = role === 'admin'; const [meFetched, setMe] = useState(null); const meId = meProp || meFetched;
  useEffect(() => { if (!meProp) apiClient.get('/auth/profile').then((r) => setMe(r.data.user?._id || r.data.user?.id || null)).catch(() => {}); }, [meProp]);
  const [o, setO] = useState(undefined); const [hosts, setHosts] = useState([]);
  const load = useCallback(async () => { try { const r = await apiClient.get('/safety/overview'); setO(r.data); } catch (e) { setO(e.response?.status === 403 ? null : undefined); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (admin || o) apiClient.get('/safety/duty-staff').then((r) => setHosts(r.data.hosts?.teachers || [])).catch(() => {}); }, [admin, o]);
  const duty = !!o; const gates = o?.settings?.gates || ['Main gate'];
  const TABS = admin
    ? [['overview', 'Overview'], ['visitors', 'Visitors'], ['dismissal', 'Dismissal'], ['contractors', 'Contractors'], ['gatelog', 'Gate log'], ['logbook', 'Logbook'], ['drills', 'Drills'], ['policy', 'Policy']]
    : duty ? [['overview', 'Overview'], ['visitors', 'Visitors'], ['dismissal', 'Dismissal'], ['gatelog', 'Gate log'], ['logbook', 'Logbook'], ['drills', 'Drill count']] : [['dismissal', 'Dismissal'], ['visitors', 'My visitors'], ['drills', 'Drill count']];
  const [tab, setTab] = useState(null); const cur = tab && TABS.some((t) => t[0] === tab) ? tab : TABS[0][0];
  if (o === undefined && !admin) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-4">
      {!admin && !duty && <Banner tone="good">You are not on gate duty. You can run dismissal for your own class, invite guests, and count your class in a drill. An administrator can give you gate duty for a few days.</Banner>}
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={cur === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${cur === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {cur === 'overview' && (o ? <Overview o={o} onGo={setTab} reload={load} /> : <div className="skeleton h-32" />)}
      {cur === 'visitors' && <VisitorsTab role={role} duty={duty} gates={gates} hosts={hosts} meId={meId} />}
      {cur === 'dismissal' && <DismissalTab admin={admin} duty={duty} />}
      {cur === 'contractors' && <ContractorsTab gates={gates} />}
      {cur === 'gatelog' && <GateLog gates={gates} />}
      {cur === 'logbook' && <Logbook gates={gates} meId={meId} />}
      {cur === 'drills' && <DrillsTab admin={admin} />}
      {cur === 'policy' && <Policy onSaved={load} />}
    </div>
  );
};
export default SafetyDesk;
