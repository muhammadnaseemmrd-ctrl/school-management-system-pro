import React, { useState } from 'react';
import { btnPrimary, btnGhost, btnDanger, Field, inputCls, Card } from '../ui';
import { useGet, Tabs, Loading, Note, Table, Td, Tag, AskForm, Reason, ShowOnce, send, Empty, tone, Tile, Grid, dt, day, today, addDays } from '../advancement/advKit';

const sec = (m, p, b, ok) => send(m, p.replace(/^/, ''), b, ok);
const call2 = async (method, path, body, ok) => { const { default: apiClient } = await import('../../utils/apiClient'); const { toast } = await import('react-hot-toast'); const r = await apiClient[method](`/security${path}`, body); if (ok) toast.success(ok); return r.data; };
const PST = { Draft: 'Draft', Review: 'Waiting for two approvals', Active: 'Running', Paused: 'Paused', Ended: 'Ended' };
const pt = (s) => ({ Draft: 'none', Review: 'warn', Active: 'good', Paused: 'bad', Ended: 'none' }[s] || 'none');

function PilotForm({ kinds, init, onClose, onDone }) {
  return <AskForm wide title={init ? `Change ${init.no}` : 'Write a pilot plan'} intro="A pilot is a short, written trial of a device. It must say why it is needed, on what basis, how long the data is kept, and what happens for a family that says no. No faces, no images and no templates are ever stored."
    fields={[{ k: 'title', label: 'Title', required: true }, { k: 'kind', label: 'What the device does', type: 'select', required: true, options: [['', 'Choose…'], ...kinds.map((k) => [k.key, k.label])] }, { k: 'purpose', label: 'Why it is needed (at least a sentence)', type: 'textarea', required: true }, { k: 'legalBasis', label: 'Legal basis', required: true }, { k: 'dpiaRef', label: 'Reference of the data protection impact assessment', required: true }, { k: 'retentionDays', label: 'Days signals are kept (up to 365)', type: 'number', min: 1, max: 365, required: true }, { k: 'manualAlternative', label: 'What a family or child who does not take part gets instead', type: 'textarea', required: true }, { k: 'reviewOn', label: 'Review date (within 180 days)', type: 'date', required: true, min: addDays(today(), 1), max: addDays(today(), 180) }]}
    initial={init || { retentionDays: 30, reviewOn: addDays(today(), 60) }} onClose={onClose} onDone={onDone} />;
}

function Pilots({ ver, bump, me }) {
  const g = useGet('/security/pilots', { v: ver }); const [m, setM] = useState(null);
  const kinds = g.data?.kinds || [];
  return (
    <div className="space-y-3">
      {me.lead && <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'new' })}>Write a plan</button></div>}
      <Note>A plan runs only after two people with different roles approve it: the data protection officer and the security lead, neither of them the author. It is paused on its review date unless it was reviewed.</Note>
      <Loading g={g}>{g.data && (g.data.pilots.length === 0 ? <Empty>No pilots yet.</Empty> : g.data.pilots.map((p) => (
        <Card key={p.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-[#1b2837]"><span dir="ltr">{p.no}</span> · {p.title}</h2><Tag tone={pt(p.status)}>{PST[p.status] || p.status}</Tag></div>
          <p className="mt-1 text-xs text-[#5b6b7b]">{p.kindLabel}</p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[#5b6b7b]">Why</dt><dd>{p.purpose}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Legal basis · assessment</dt><dd>{p.legalBasis} · {p.dpiaRef}</dd></div><div><dt className="text-xs text-[#5b6b7b]">If a family says no</dt><dd>{p.manualAlternative}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Kept · review</dt><dd>{p.retentionDays} days · {day(p.reviewOn)}{p.consentRequired ? ' · needs consent' : ''}</dd></div></dl>
          {p.approvals.length > 0 && <p className="mt-2 text-xs text-[#3b4a5c]">Approved by: {p.approvals.map((a) => `${a.byName} (${a.role === 'dpo' ? 'data protection officer' : 'security lead'})`).join(', ')}{p.soleAdmin ? ' · the only administrator' : ''}</p>}
          {p.pausedReason && <p className="mt-1 text-xs text-[#9f1239]">Paused: {p.pausedReason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.status === 'Draft' && me.lead && <><button className={btnGhost} onClick={() => setM({ t: 'edit', p })}>Change</button><button className={btnPrimary} onClick={async () => { await call2('post', `/pilots/${p.id}/ask`, {}, 'Sent for approval'); bump(); }}>Send for approval</button></>}
            {p.status === 'Review' && <>{me.dpo && <button className={btnPrimary} onClick={() => setM({ t: 'ap', p, role: 'dpo' })} aria-label={`Approve ${p.no} as the data protection officer`}>Approve as the data protection officer</button>}{me.lead && <button className={btnPrimary} onClick={() => setM({ t: 'ap', p, role: 'security' })} aria-label={`Approve ${p.no} as the security lead`}>Approve as the security lead</button>}</>}
            {p.status === 'Active' && <button className={btnGhost} onClick={() => setM({ t: 'pause', p })}>Pause</button>}
            {p.status === 'Paused' && me.dpo && <button className={btnPrimary} onClick={() => setM({ t: 'resume', p })}>Resume after a review</button>}
            {['Active', 'Paused', 'Review'].includes(p.status) && <button className={btnDanger} onClick={() => setM({ t: 'end', p })}>End the pilot</button>}
          </div>
        </Card>)))}</Loading>
      {(m?.t === 'new' || m?.t === 'edit') && <PilotForm kinds={kinds} init={m.p} onClose={() => setM(null)} onDone={async (v) => { const b = { ...v, retentionDays: Number(v.retentionDays) }; if (m.t === 'new') await call2('post', '/pilots', b, 'Plan saved as a draft'); else await call2('put', `/pilots/${m.p.id}`, b, 'Saved'); setM(null); bump(); }} />}
      {m?.t === 'ap' && <Reason title={`Approve ${m.p.no}`} text={`You are approving as ${m.role === 'dpo' ? 'the data protection officer' : 'the security lead'}. You cannot approve a plan you wrote.`} label="What you checked (optional)" min={0} danger={false} confirm="Approve" onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/pilots/${m.p.id}/approve`, { role: m.role, decision: 'approve', note: n }, 'Approved'); setM(null); bump(); }} />}
      {m?.t === 'pause' && <Reason title={`Pause ${m.p.no}`} text="Devices stop being accepted at once." confirm="Pause" onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/pilots/${m.p.id}/pause`, { reason: n }, 'Paused'); setM(null); bump(); }} />}
      {m?.t === 'end' && <Reason title={`End ${m.p.no}`} text="The pilot ends for good. Its stored signals are deleted when their time is up." confirm="End the pilot" onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/pilots/${m.p.id}/end`, { reason: n }, 'Ended'); setM(null); bump(); }} />}
      {m?.t === 'resume' && <AskForm title={`Resume ${m.p.no}`} intro="Only the data protection officer can resume a pilot, after a review, with a new review date." fields={[{ k: 'note', label: 'What was reviewed', type: 'textarea', required: true }, { k: 'reviewOn', label: 'New review date', type: 'date', required: true, min: addDays(today(), 1), max: addDays(today(), 180) }]} initial={{ reviewOn: addDays(today(), 60) }} confirm="Resume" onClose={() => setM(null)} onDone={async (v) => { await call2('post', `/pilots/${m.p.id}/resume`, v, 'Resumed'); setM(null); bump(); }} />}
    </div>
  );
}

function Devices({ ver, bump, me }) {
  const g = useGet('/security/devices', { v: ver }); const p = useGet('/security/pilots', {}); const [m, setM] = useState(null); const [key, setKey] = useState(null);
  const open = (p.data?.pilots || []).filter((x) => x.status !== 'Ended');
  const keyText = (k) => `Device ID: ${k.id}\nKey: ${k.secret}\nExpires: ${day(k.expiresAt)}\n\nThe device sends signals to /api/device-events with the headers X-Device-Id and X-Device-Key.`;
  return (
    <div className="space-y-3">
      {me.lead && <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'new' })}>Add a device</button></div>}
      <Note>A device sends only short facts (a scan, a count, a tamper alert). Anything that looks like an image, a face or a template is refused. Signals from a pilot that needs consent are dropped unless the family agreed.</Note>
      <Loading g={g}>{g.data && (g.data.devices.length === 0 ? <Empty>No devices yet.</Empty> : <Table label="Devices" head={['Device', 'Pilot', 'Last heard', 'Clock', 'Key', 'Status', '']} min={940}>{g.data.devices.map((d) => <tr key={d.id}><Td><span className="font-semibold">{d.name}</span><span className="block text-xs text-[#5b6b7b]">{d.kind}{d.location ? ` · ${d.location}` : ''}</span></Td><Td className="text-xs"><span dir="ltr">{d.pilotNo}</span> {d.pilotStatus && d.pilotStatus !== 'Active' ? `(${d.pilotStatus})` : ''}</Td><Td>{d.lastSeenAt ? dt(d.lastSeenAt) : 'Never'} {d.status === 'Active' && (d.online ? <Tag tone="good">Online</Tag> : <Tag tone="bad">Offline</Tag>)}</Td><Td>{d.lastSeenAt ? (d.clockOk ? 'In step' : <Tag tone="warn">{d.driftSeconds}s off</Tag>) : '—'}</Td><Td className="text-xs"><span dir="ltr">{d.keyPrefix ? `${d.keyPrefix}…` : '—'}</span>{d.keyExpiresAt && <span className="block text-[#5b6b7b]">until {day(d.keyExpiresAt)}</span>}</Td><Td><Tag tone={d.status === 'Active' ? 'good' : 'none'}>{d.status}</Tag></Td>
        <Td>{me.lead && d.status !== 'Retired' && <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={async () => { const r = await call2('post', `/devices/${d.id}/rotate-key`, {}, 'New key made'); setKey(r.key); }} aria-label={`New key for ${d.name}`}>New key</button><button className={btnGhost} onClick={async () => { await call2('post', `/devices/${d.id}/status`, { status: d.status === 'Active' ? 'Disabled' : 'Active' }, 'Saved'); bump(); }} aria-label={`${d.status === 'Active' ? 'Switch off' : 'Switch on'} ${d.name}`}>{d.status === 'Active' ? 'Switch off' : 'Switch on'}</button><button className={btnDanger} onClick={() => setM({ t: 'ret', d })} aria-label={`Retire ${d.name}`}>Retire</button></div>}</Td></tr>)}</Table>)}</Loading>
      {m?.t === 'new' && <AskForm title="Add a device" intro="It belongs to one pilot. The key is shown once." fields={[{ k: 'pilotId', label: 'Pilot', type: 'select', required: true, options: [['', 'Choose…'], ...open.map((x) => [x.id, `${x.no} ${x.title}`])] }, { k: 'name', label: 'Name', required: true }, { k: 'kind', label: 'Kind', type: 'select', options: [['reader', 'Reader'], ['counter', 'Counter'], ['camera', 'Camera (motion and tamper only)'], ['gateway', 'Gateway']] }, { k: 'location', label: 'Where it is' }]} initial={{ kind: 'reader' }} onClose={() => setM(null)} onDone={async (v) => { const r = await call2('post', '/devices', v, 'Device added'); setM(null); setKey(r.key); bump(); }} />}
      {m?.t === 'ret' && <Reason title={`Retire ${m.d.name}`} text="Its key is destroyed. This cannot be undone." label="Note" min={0} confirm="Retire" onClose={() => setM(null)} onDone={async () => { await call2('post', `/devices/${m.d.id}/status`, { status: 'Retired' }, 'Retired'); setM(null); bump(); }} />}
      {key && <ShowOnce title="Device key" text="Put this into the device now. The key is shown only once and cannot be looked up again. A new key replaces it at once." secret={keyText(key)} onClose={() => setKey(null)} />}
    </div>
  );
}

function Signals({ ver, bump }) {
  const [state, setState] = useState('held'); const g = useGet('/security/events', { state: state || undefined, v: ver }); const [m, setM] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3"><Field label="Show"><select className={inputCls} value={state} onChange={(e) => setState(e.target.value)}><option value="held">Waiting for a person</option><option value="">All</option><option value="used">Used</option><option value="dismissed">Dismissed</option><option value="accepted">Stored</option></select></Field></div>
      <Note>A scan is only extra evidence of arrival. It never marks a child absent. A scan the device was unsure about waits here for a person to use or dismiss it.</Note>
      <Loading g={g}>{g.data && (g.data.events.length === 0 ? <Empty>Nothing here.</Empty> : <Table label="Signals" head={['When', 'Device', 'What', 'Student', 'Sure?', 'State', '']} min={860}>{g.data.events.map((e) => <tr key={e.id}><Td>{dt(e.at)}</Td><Td>{e.deviceName}</Td><Td>{e.kind}{(e.flags || []).length > 0 && <span className="block text-xs text-[#5b6b7b]">{e.flags.join(', ')}</span>}</Td><Td>{e.studentName || '—'}</Td><Td>{e.confidence === null || e.confidence === undefined ? '—' : `${Math.round(e.confidence * 100)}%`}</Td><Td><Tag tone={e.state === 'held' ? 'warn' : 'none'}>{e.state}</Tag>{e.decidedByName && <span className="block text-xs text-[#5b6b7b]">{e.decidedByName}</span>}</Td><Td>{e.state === 'held' && <div className="flex gap-2"><button className={btnPrimary} onClick={() => setM({ e, d: 'use' })} aria-label="Use this signal as extra evidence">Use</button><button className={btnGhost} onClick={() => setM({ e, d: 'dismiss' })} aria-label="Dismiss this signal">Dismiss</button></div>}</Td></tr>)}</Table>)}</Loading>
      {m && <Reason title={m.d === 'use' ? 'Use this signal' : 'Dismiss this signal'} text={m.d === 'use' ? 'It is added as extra evidence only. It does not mark anyone present or absent.' : 'It is kept out of the record.'} danger={m.d !== 'use'} confirm={m.d === 'use' ? 'Use it' : 'Dismiss'} onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/events/${m.e.id}/decide`, { decision: m.d, note: n }, 'Done'); setM(null); bump(); }} />}
    </div>
  );
}

function Incident({ id, me, onBack }) {
  const [v, setV] = useState(0); const g = useGet(`/security/incidents/${id}`, { v }); const acc = useGet(`/security/incidents/${id}/access`, { v }); const ppl = useGet('/advancement/people', {}); const [m, setM] = useState(null); const i = g.data?.incident; const bump = () => setV((x) => x + 1);
  return (
    <div className="space-y-3">
      <button className={btnGhost} onClick={onBack}>Back to the incidents</button>
      <Loading g={g}>{i && (<>
        <Card><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-[#1b2837]"><span dir="ltr">{i.no}</span> · {i.title}</h2><Tag tone={i.status === 'Open' ? 'warn' : 'none'}>{i.status}</Tag></div>
          <p className="mt-1 text-sm text-[#3b4a5c]">{i.description}</p><p className="mt-1 text-xs text-[#5b6b7b]">{dt(i.occurredAt)}{i.location ? ` · ${i.location}` : ''} · severity {i.severity}</p>
          <p className="mt-1 text-xs text-[#5b6b7b]">Who can open it: the person who made it, the security lead, the data protection officer{i.viewers.length ? `, and ${i.viewers.join(', ')}` : ''}. Every opening is logged.</p>
          {i.legalHold && <Note tone="warn">Legal hold by {i.legalHold.byName} on {dt(i.legalHold.at)}: {i.legalHold.reason}. It cannot be destroyed until a different person lifts it.</Note>}
          {i.retentionUntil && <p className="mt-1 text-xs">Kept until {day(i.retentionUntil)}, then destroyed with a certificate.</p>}
          {i.destruction && <p className="mt-1 text-xs">Destroyed {dt(i.destruction.at)}. Certificate: <span className="break-all font-mono" dir="ltr">{i.destruction.certificate}</span></p>}
          {i.status !== 'Destroyed' && <div className="mt-3 flex flex-wrap gap-2">{i.status === 'Open' && <><button className={btnGhost} onClick={() => setM({ t: 'item' })}>Add an item</button><button className={btnGhost} onClick={() => setM({ t: 'close' })}>Close the incident</button></>}<button className={btnGhost} onClick={() => setM({ t: 'viewers' })}>Who else can open it</button>{!i.legalHold && <button className={btnGhost} onClick={() => setM({ t: 'hold' })}>Legal hold</button>}{i.legalHold && me.dpo && <button className={btnGhost} onClick={() => setM({ t: 'release' })}>Lift the hold</button>}{i.items.length > 0 && <button className={btnPrimary} onClick={() => setM({ t: 'export' })}>Ask to hand over</button>}</div>}
        </Card>
        <Card><h3 className="text-sm font-bold">Items</h3><p className="text-xs text-[#5b6b7b]">Only a reference and a fingerprint are kept here. The file itself stays where the school stores it.</p>{i.items.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">Nothing added yet.</p> : <ul className="mt-2 space-y-2 text-sm">{i.items.map((x) => <li key={x.id} className="rounded-lg border border-[#e3e7e7] p-2"><b>{x.kind}</b> · {x.ref}<span className="block break-all font-mono text-xs text-[#5b6b7b]" dir="ltr">SHA-256 {x.checksum}</span>{x.note && <span className="block text-xs">{x.note}</span>}<span className="block text-xs text-[#5b6b7b]">{x.addedByName} · {dt(x.at)}</span></li>)}</ul>}</Card>
        <Card><h3 className="text-sm font-bold">Who opened it</h3><Loading g={acc}>{acc.data && (acc.data.access.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">No entries.</p> : <ul className="mt-2 space-y-1 text-xs text-[#3b4a5c]">{acc.data.access.map((a, k) => <li key={k}>{dt(a.at)} · {a.byName} ({a.byRole}) · {a.action}</li>)}</ul>)}</Loading></Card>
      </>)}</Loading>
      {m?.t === 'item' && <AskForm title="Add an item" fields={[{ k: 'kind', label: 'What kind', type: 'select', options: [['clip', 'Video clip'], ['photo', 'Photo'], ['log', 'Log or record'], ['note', 'Note']] }, { k: 'ref', label: 'Where it is kept (a reference, not the file)', required: true }, { k: 'checksum', label: 'SHA-256 fingerprint of the file (64 characters)', required: true, ph: '64 hexadecimal characters' }, { k: 'note', label: 'Note' }]} initial={{ kind: 'log' }} onClose={() => setM(null)} onDone={async (v) => { await call2('post', `/incidents/${id}/items`, v, 'Added'); setM(null); bump(); }} />}
      {m?.t === 'close' && <AskForm title="Close the incident" fields={[{ k: 'note', label: 'How it ended', type: 'textarea', required: true }, { k: 'retentionDays', label: 'Days to keep the evidence (30 to 730)', type: 'number', min: 30, max: 730, required: true }]} initial={{ retentionDays: 180 }} onClose={() => setM(null)} onDone={async (v) => { await call2('post', `/incidents/${id}/close`, { note: v.note, retentionDays: Number(v.retentionDays) }, 'Closed'); setM(null); bump(); }} />}
      {m?.t === 'hold' && <Reason title="Put a legal hold" text="Say what it is for (a case, a request, a complaint). The evidence cannot be destroyed while it stands." confirm="Hold" onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/incidents/${id}/hold`, { reason: n }, 'On hold'); setM(null); bump(); }} />}
      {m?.t === 'release' && <Reason title="Lift the hold" text="Someone other than the person who set it must do this. Say why it can end." confirm="Lift" onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/incidents/${id}/release`, { reason: n }, 'Hold lifted'); setM(null); bump(); }} />}
      {m?.t === 'viewers' && <AskForm title="Who else can open it" intro="Up to ten members of staff. Each opening is logged." fields={[{ k: 'ids', label: 'Staff (hold Ctrl or Command to choose several)', type: 'textarea', hint: 'Paste one staff ID per line, or leave empty to remove everyone.' }]} initial={{ ids: '' }} extra={<div className="sm:col-span-2"><label className="text-sm font-semibold" htmlFor="vw">Choose</label><select id="vw" multiple className={`${inputCls} mt-1 h-40`} onChange={(e) => { e.target.dataset.v = [...e.target.selectedOptions].map((o) => o.value).join(','); }}>{(ppl.data?.people || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}</select></div>} onClose={() => setM(null)} onDone={async (v) => { const sel = [...document.querySelectorAll('#vw option:checked')].map((o) => o.value); const ids = [...sel, ...String(v.ids || '').split('\n').map((x) => x.trim()).filter(Boolean)]; await call2('put', `/incidents/${id}/viewers`, { userIds: ids }, 'Saved'); setM(null); bump(); }} />}
      {m?.t === 'export' && <AskForm title="Ask to hand the evidence over" intro="Two people must approve before anything leaves the school. The hand-over is recorded with a fingerprint of what was given." fields={[{ k: 'purpose', label: 'Why (for example a police report number)', type: 'textarea', required: true }, { k: 'recipient', label: 'Who receives it', required: true }]} onClose={() => setM(null)} onDone={async (v) => { await call2('post', `/incidents/${id}/exports`, v, 'Asked. Another person must approve.'); setM(null); bump(); }} />}
    </div>
  );
}

function Incidents({ ver, bump, me }) {
  const g = useGet('/security/incidents', { v: ver }); const [open, setOpen] = useState(null); const [m, setM] = useState(false);
  if (open) return <Incident id={open} me={me} onBack={() => { setOpen(null); bump(); }} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM(true)}>Record an incident</button></div>
      <Note>You see only incidents you made or were given access to. Opening one is always logged.</Note>
      <Loading g={g}>{g.data && (g.data.incidents.length === 0 ? <Empty>No incidents you can open.</Empty> : <Table label="Incidents" head={['No.', 'What', 'When', 'Severity', 'Status', '']} min={720}>{g.data.incidents.map((i) => <tr key={i.id}><Td><span dir="ltr">{i.no}</span></Td><Td>{i.title}</Td><Td>{dt(i.occurredAt)}</Td><Td>{i.severity}</Td><Td><Tag tone={i.status === 'Open' ? 'warn' : 'none'}>{i.status}</Tag></Td><Td><button className={btnGhost} onClick={() => setOpen(i.id)} aria-label={`Open ${i.no}`}>Open</button></Td></tr>)}</Table>)}</Loading>
      {m && <AskForm title="Record an incident" fields={[{ k: 'title', label: 'Title', required: true }, { k: 'description', label: 'What happened', type: 'textarea', required: true }, { k: 'occurredAt', label: 'When', type: 'datetime-local', required: true }, { k: 'location', label: 'Where' }, { k: 'severity', label: 'How serious', type: 'select', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] }]} initial={{ severity: 'medium' }} onClose={() => setM(false)} onDone={async (v) => { const r = await call2('post', '/incidents', { ...v, occurredAt: new Date(v.occurredAt).toISOString() }, 'Recorded'); setM(false); setOpen(r.incident.id); }} />}
    </div>
  );
}

function Exports({ ver, bump }) {
  const g = useGet('/security/exports', { v: ver }); const [m, setM] = useState(null); const [done, setDone] = useState(null);
  return (
    <div className="space-y-3">
      <Note>Evidence leaves the school only after two people approve it. The person who asked cannot approve their own request. A request lapses after 7 days.</Note>
      <Loading g={g}>{g.data && (g.data.exports.length === 0 ? <Empty>No hand-over requests.</Empty> : <Table label="Hand-over requests" head={['Incident', 'Why', 'To', 'Asked by', 'Approvals', 'Status', '']} min={900}>{g.data.exports.map((x) => <tr key={x.id}><Td><span dir="ltr">{x.incidentNo}</span></Td><Td className="max-w-xs text-xs">{x.purpose}</Td><Td>{x.recipient}</Td><Td>{x.requestedByName}</Td><Td className="text-xs">{x.approvals.length ? x.approvals.map((a) => a.byName).join(', ') : '—'}{x.soleAdmin ? ' (only administrator)' : ''}</Td><Td><Tag tone={tone(x.status)}>{x.status}</Tag>{x.rejection && <span className="block text-xs">{x.rejection.note}</span>}{x.manifestHash && <span className="block break-all font-mono text-xs text-[#5b6b7b]" dir="ltr">{x.manifestHash}</span>}</Td>
        <Td><div className="flex gap-2">{x.status === 'Requested' && <><button className={btnPrimary} onClick={async () => { await call2('post', `/exports/${x.id}/decide`, { decision: 'approve' }, 'Approved'); bump(); }} aria-label={`Approve the hand-over of ${x.incidentNo}`}>Approve</button><button className={btnGhost} onClick={() => setM(x)} aria-label={`Reject the hand-over of ${x.incidentNo}`}>Reject</button></>}{x.status === 'Approved' && <button className={btnPrimary} onClick={async () => { const r = await call2('post', `/exports/${x.id}/fulfil`, {}, 'Handed over'); setDone(r); bump(); }} aria-label={`Hand over ${x.incidentNo}`}>Hand over</button>}</div></Td></tr>)}</Table>)}</Loading>
      {m && <Reason title="Reject the hand-over" text="Say why." confirm="Reject" onClose={() => setM(null)} onDone={async (n) => { await call2('post', `/exports/${m.id}/decide`, { decision: 'reject', note: n }, 'Rejected'); setM(null); bump(); }} />}
      {done && <ShowOnce title="Hand-over record" text="This lists what was handed over and its fingerprint. Keep it with the hand-over." secret={JSON.stringify(done.manifest || done, null, 2)} onClose={() => setDone(null)} />}
    </div>
  );
}

function Appeals({ ver, bump }) {
  const g = useGet('/security/appeals', { v: ver }); const [m, setM] = useState(null);
  return (
    <div className="space-y-3">
      <Note>Families can challenge what a device recorded. It is answered by someone who was not involved in the original decision. If upheld, the signal and any evidence tied to it are removed.</Note>
      <Loading g={g}>{g.data && (g.data.appeals.length === 0 ? <Empty>No challenges.</Empty> : <Table label="Challenges" head={['No.', 'From', 'About', 'What they said', 'Status', '']} min={860}>{g.data.appeals.map((a) => <tr key={a._id}><Td><span dir="ltr">{a.no}</span></Td><Td>{a.requesterName}<span className="block text-xs text-[#5b6b7b]">{a.requesterType}</span></Td><Td>{a.about}</Td><Td className="max-w-sm text-xs">{a.statement}</Td><Td><Tag tone={a.status === 'Open' ? 'warn' : 'none'}>{a.status}</Tag>{a.decision?.note && <span className="block text-xs text-[#5b6b7b]">{a.decision.note}</span>}</Td><Td>{a.status === 'Open' && <button className={btnPrimary} onClick={() => setM(a)} aria-label={`Decide ${a.no}`}>Decide</button>}</Td></tr>)}</Table>)}</Loading>
      {m && <AskForm title={`Decide ${m.no}`} intro="You cannot decide a challenge about something you decided or raised yourself." fields={[{ k: 'decision', label: 'Decision', type: 'select', options: [['uphold', 'Uphold: the family is right'], ['reject', 'Reject']] }, { k: 'note', label: 'Explain it so the family can understand (at least 10 characters)', type: 'textarea', required: true }]} initial={{ decision: 'uphold' }} onClose={() => setM(null)} onDone={async (v) => { await call2('post', `/appeals/${m._id}/decide`, v, 'Decided'); setM(null); bump(); }} />}
    </div>
  );
}

// Security pilots, devices and evidence (PRD E34). Each action needs its own right, and most need a second person.
export default function SecurityHub() {
  const mine = useGet('/security/me', {});
  if (mine.loading || mine.error || !mine.data) return <Loading g={mine}>{null}</Loading>;
  if (!mine.data.operate) return <Note>You have not been given any part of security. An administrator can give you the security, data protection or operator right.</Note>;
  return <Inner me={mine.data} />;
}

function Inner({ me }) {
  const [tab, setTab] = useState('overview'); const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1); const ov = useGet('/security/overview', { v: ver });
  const o = ov.data;
  const items = [['overview', 'Overview'], ['pilots', 'Pilots', o?.pilotsWaiting || null], ['devices', 'Devices', o?.devicesOffline || null], ['signals', 'Signals', o?.heldSignals || null], ...(me.either ? [['incidents', 'Incidents'], ['exports', 'Hand-overs', o?.exportsWaiting || null], ['appeals', 'Challenges', o?.appealsOpen || null]] : [])];
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-[#1b2837]">Security devices and evidence</h1><p className="mt-1 text-sm text-[#5b6b7b]">Short, written pilots of devices that report simple facts. No faces or images are ever stored. Families can see what was recorded about their child and challenge it.</p></div>
      <Tabs label="Security sections" value={tab} onChange={setTab} items={items} />
      <div key={tab}>
        {tab === 'overview' && <Loading g={ov}>{o && <><Grid><Tile label="Pilots running" value={o.pilotsActive} /><Tile label="Plans waiting" value={o.pilotsWaiting} tone={o.pilotsWaiting ? 'text-[#8a4636]' : ''} /><Tile label="Paused" value={o.pilotsPaused} /><Tile label="Reviews due soon" value={o.reviewsDue} /></Grid><div className="mt-3"><Grid><Tile label="Devices" value={o.devices} /><Tile label="Offline" value={o.devicesOffline} tone={o.devicesOffline ? 'text-[#9f1239]' : ''} /><Tile label="Signals waiting" value={o.heldSignals} /><Tile label="Open incidents" value={o.openIncidents} /></Grid></div><div className="mt-3"><Grid><Tile label="Hand-overs waiting" value={o.exportsWaiting} /><Tile label="Open challenges" value={o.appealsOpen} tone={o.appealsOpen ? 'text-[#8a4636]' : ''} /></Grid></div></>}</Loading>}
        {tab === 'pilots' && <Pilots ver={ver} bump={bump} me={me} />}{tab === 'devices' && <Devices ver={ver} bump={bump} me={me} />}{tab === 'signals' && <Signals ver={ver} bump={bump} />}{tab === 'incidents' && <Incidents ver={ver} bump={bump} me={me} />}{tab === 'exports' && <Exports ver={ver} bump={bump} />}{tab === 'appeals' && <Appeals ver={ver} bump={bump} />}
      </div>
    </div>
  );
}
