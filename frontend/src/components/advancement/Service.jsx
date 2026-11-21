import React, { useState } from 'react';
import { btnPrimary, btnGhost, Field, inputCls, Card } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, AskForm, Reason, ShowOnce, send, Empty, tone, Tile, Grid, day, today } from './advKit';

const FIELDS = [{ k: 'activity', label: 'What the service was', required: true }, { k: 'orgName', label: 'Organisation or place' }, { k: 'hours', label: 'Hours (in halves, up to 12)', type: 'number', min: 0.5, max: 12, step: 0.5, required: true }, { k: 'date', label: 'Date', type: 'date', required: true, max: today() }, { k: 'supervisorName', label: 'Who supervised you (they will confirm)', required: true }];
const WORD = { Pending: 'Waiting for the supervisor', Verified: 'Confirmed', Declined: 'The supervisor declined', Rejected: 'Rejected by the school' };
const linkOf = (r) => `${window.location.origin}/service/${r.link.token}`;
const SHOW = 'Give this link to the supervisor. It is shown only now. They open it, read what was logged, and confirm or decline in their own words. It works once. If it is lost, make a new one and the old one stops working.';

// the school's view
export function ServiceStaff() {
  const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1); const [st, setSt] = useState(''); const g = useGet('/advancement/service', { status: st || undefined, v: ver }); const sum = useGet('/advancement/service/summary', { v: ver }); const [m, setM] = useState(null); const [shown, setShown] = useState(null); const stu = useGet('/students', { limit: 300 });
  return (
    <div className="space-y-4">
      <Loading g={sum}>{sum.data && <Grid><Tile label="Hours confirmed" value={sum.data.totalHours} /><Tile label="Students with hours" value={sum.data.students.length} /><Tile label="Waiting for a supervisor" value={sum.data.pending} tone={sum.data.pending ? 'text-[#8a4636]' : ''} /></Grid>}</Loading>
      <Note>Only hours a supervisor confirmed count. Entries nobody answers are closed after 90 days.</Note>
      <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Show"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value)}><option value="">All</option>{Object.keys(WORD).map((s) => <option key={s} value={s}>{WORD[s]}</option>)}</select></Field><button className={btnPrimary} onClick={() => setM({ t: 'add' })}>Log for a student</button></div>
      <Loading g={g}>{g.data && (g.data.logs.length === 0 ? <Empty>No entries yet.</Empty> : <Table label="Service entries" head={['Student', 'Service', 'Date', 'Hours', 'Supervisor', 'Status', '']} min={900}>{g.data.logs.map((l) => <tr key={l.id}><Td>{l.studentName}</Td><Td>{l.activity}{l.orgName && <span className="block text-xs text-[#5b6b7b]">{l.orgName}</span>}</Td><Td>{day(l.date)}</Td><Td>{l.status === 'Verified' ? `${l.verifiedHours} of ${l.hours}` : l.hours}</Td><Td>{l.supervisorName}{l.verifierStatement && <span className="block text-xs text-[#5b6b7b]">“{l.verifierStatement}”</span>}</Td><Td><Tag tone={tone(l.status)}>{WORD[l.status] || l.status}</Tag>{l.rejectedNote && <span className="block text-xs">{l.rejectedNote}</span>}</Td>
        <Td><div className="flex flex-wrap gap-2">{l.status === 'Pending' && <button className={btnGhost} onClick={async () => { const r = await send('post', `/service/${l.id}/link`, {}); setShown({ secret: linkOf(r) }); }} aria-label={`New link for ${l.studentName}`}>New link</button>}{['Pending', 'Verified'].includes(l.status) && <button className={btnGhost} onClick={() => setM({ t: 'rej', l })} aria-label={`Reject the entry of ${l.studentName}`}>Reject</button>}</div></Td></tr>)}</Table>)}</Loading>
      {sum.data && sum.data.students.length > 0 && <Table label="Hours by student" head={['Student', 'Entries', 'Confirmed hours']} min={480}>{sum.data.students.map((s) => <tr key={String(s.studentId)}><Td>{s.studentName}</Td><Td>{s.entries}</Td><Td><b>{s.hours}</b></Td></tr>)}</Table>}
      {m?.t === 'add' && <AskForm title="Log service for a student" fields={[{ k: 'studentId', label: 'Student', type: 'select', required: true, options: [['', 'Choose…'], ...(stu.data?.students || []).map((s) => [s._id, `${s.name}${s.admissionNumber ? ` (${s.admissionNumber})` : ''}`])] }, ...FIELDS]} onClose={() => setM(null)} onDone={async (v) => { const r = await send('post', '/service', { ...v, hours: Number(v.hours) }, 'Logged'); setM(null); setShown({ secret: linkOf(r) }); bump(); }} />}
      {m?.t === 'rej' && <Reason title="Reject this entry" text="Say why. Its hours come off the total." confirm="Reject" onClose={() => setM(null)} onDone={async (n) => { await send('post', `/service/${m.l.id}/reject`, { note: n }, 'Rejected'); setM(null); bump(); }} />}
      {shown && <ShowOnce title="Link for the supervisor" text={SHOW} secret={shown.secret} onClose={() => setShown(null)} />}
    </div>
  );
}

// the student's own page
export function MyService() {
  const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1); const g = useGet('/advancement/service/mine', { v: ver }); const [m, setM] = useState(false); const [shown, setShown] = useState(null);
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-[#1b2837]">My community service</h2><p className="mt-1 text-sm text-[#5b6b7b]">Write down service you did. The person who supervised you confirms it with a private link. Only confirmed hours count.</p></div>
      <Loading g={g}>{g.data && (<>
        <Grid><Tile label="Confirmed hours" value={g.data.verifiedHours} /><Tile label="Entries" value={g.data.logs.length} /></Grid>
        <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM(true)}>Add service</button></div>
        {g.data.logs.length === 0 ? <Empty>You have not added any service yet.</Empty> : <Table label="My service" head={['Service', 'Date', 'Hours', 'Supervisor', 'Status', '']} min={760}>{g.data.logs.map((l) => <tr key={l.id}><Td>{l.activity}{l.orgName && <span className="block text-xs text-[#5b6b7b]">{l.orgName}</span>}</Td><Td>{day(l.date)}</Td><Td>{l.status === 'Verified' ? `${l.verifiedHours} of ${l.hours}` : l.hours}</Td><Td>{l.supervisorName}</Td><Td><Tag tone={tone(l.status)}>{WORD[l.status] || l.status}</Tag></Td><Td>{l.status === 'Pending' && <button className={btnGhost} onClick={async () => { const r = await send('post', `/service/${l.id}/link`, {}); setShown({ secret: linkOf(r) }); }} aria-label={`New link for ${l.activity}`}>New link</button>}</Td></tr>)}</Table>}</>)}</Loading>
      {m && <AskForm title="Add service" fields={FIELDS} onClose={() => setM(false)} onDone={async (v) => { const r = await send('post', '/service/mine', { ...v, hours: Number(v.hours) }, 'Added'); setM(false); setShown({ secret: linkOf(r) }); bump(); }} />}
      {shown && <ShowOnce title="Link for your supervisor" text={SHOW} secret={shown.secret} onClose={() => setShown(null)} />}
    </div>
  );
}
