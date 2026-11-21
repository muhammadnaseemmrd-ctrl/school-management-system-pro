import React, { useState } from 'react';
import { btnPrimary, btnGhost, Field, inputCls, Card } from '../ui';
import { useGet, Tabs, Loading, Note, Table, Td, Tag, AskForm, Reason, send, Empty, tone, Tile, Grid, day, today, addDays } from './advKit';

const People = () => useGet('/advancement/people', {});
const pick = (p) => [['', 'Nobody yet'], ...(p.data?.people || []).map((x) => [x.id, `${x.name} (${x.role})`])];

function Coverage({ ver, bump }) {
  const [fw, setFw] = useState(''); const g = useGet('/advancement/quality/coverage', { framework: fw || undefined, v: ver }); const st = useGet('/advancement/quality/standards', {}); const ppl = People(); const [m, setM] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Framework"><select className={inputCls} value={fw} onChange={(e) => setFw(e.target.value)}><option value="">All</option>{(st.data?.frameworks || []).map((f) => <option key={f}>{f}</option>)}</select></Field><button className={btnPrimary} onClick={() => setM({})}>Add a standard</button></div>
      <Note>A standard is met only when checked evidence that is still in date backs it. Evidence nobody has checked does not count.</Note>
      <Loading g={g}>{g.data && (<>
        <Grid><Tile label="Met" value={g.data.summary.met} tone="text-[#215a52]" /><Tile label="Waiting for a check" value={g.data.summary.waiting ?? 0} /><Tile label="Gaps" value={g.data.summary.gaps} tone={g.data.summary.gaps ? 'text-[#9f1239]' : ''} /><Tile label="Covered" value={`${g.data.summary.percentMet}%`} /></Grid>
        {g.data.standards.length === 0 ? <Empty>No standards yet.</Empty> : <Table label="Standards and coverage" head={['Standard', 'Owner', 'State', 'Evidence', 'Next runs out']} min={780}>{g.data.standards.map((s) => <tr key={s.id}><Td><span className="text-xs text-[#5b6b7b]">{s.framework}</span><span className="block"><b dir="ltr">{s.code}</b> {s.title}</span></Td><Td>{s.ownerName || '—'}</Td><Td><Tag tone={tone(s.state)}>{s.state === 'Waiting' ? 'Waiting for a check' : s.state}</Tag></Td><Td>{s.accepted} accepted{s.waiting ? `, ${s.waiting} waiting` : ''}</Td><Td>{s.nextExpiry ? day(s.nextExpiry) : '—'}</Td></tr>)}</Table>}</>)}</Loading>
      {m && <AskForm title="Add a standard" fields={[{ k: 'framework', label: 'Framework (for example ISO 21001)', required: true }, { k: 'code', label: 'Code', required: true }, { k: 'title', label: 'Title', required: true }, { k: 'ownerId', label: 'Owner', type: 'select', options: pick(ppl) }, { k: 'description', label: 'What it asks for', type: 'textarea' }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/quality/standards', { ...v, ownerId: v.ownerId || undefined }, 'Added'); setM(null); bump(); st.reload(); }} />}
    </div>
  );
}

function Evidence({ ver, bump }) {
  const [status, setStatus] = useState(''); const g = useGet('/advancement/quality/evidence', { status: status || undefined, v: ver }); const st = useGet('/advancement/quality/standards', {}); const [m, setM] = useState(null);
  const name = (id) => { const s = (st.data?.standards || []).find((x) => String(x._id) === String(id)); return s ? `${s.code} ${s.title}` : ''; };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Show"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['Submitted', 'Accepted', 'Rejected', 'Expired'].map((s) => <option key={s}>{s}</option>)}</select></Field><button className={btnPrimary} onClick={() => setM({ t: 'add' })}>Submit evidence</button></div>
      <Note>The person who submits evidence cannot be the one who accepts it.</Note>
      <Loading g={g}>{g.data && (g.data.evidence.length === 0 ? <Empty>No evidence yet.</Empty> : <Table label="Evidence" head={['Evidence', 'For', 'Kept at', 'Runs out', 'Status', '']} min={900}>{g.data.evidence.map((e) => <tr key={e._id}><Td><span className="font-semibold">{e.title}</span><span className="block text-xs text-[#5b6b7b]">{e.submittedByName}</span></Td><Td className="text-xs">{name(e.standardId)}</Td><Td className="max-w-[14rem] break-words text-xs">{e.heldAt}</Td><Td>{e.validUntil ? day(e.validUntil) : '—'}</Td><Td><Tag tone={tone(e.status)}>{e.status === 'Submitted' ? 'Waiting for a check' : e.status}</Tag>{e.reviewNote && <span className="block text-xs text-[#5b6b7b]">{e.reviewNote}</span>}</Td><Td>{e.status === 'Submitted' && <div className="flex gap-2"><button className={btnPrimary} onClick={() => setM({ t: 'accept', e })} aria-label={`Accept ${e.title}`}>Accept</button><button className={btnGhost} onClick={() => setM({ t: 'reject', e })} aria-label={`Reject ${e.title}`}>Reject</button></div>}</Td></tr>)}</Table>)}</Loading>
      {m?.t === 'add' && <AskForm title="Submit evidence" fields={[{ k: 'standardId', label: 'Standard', type: 'select', required: true, options: [['', 'Choose…'], ...(st.data?.standards || []).map((s) => [s._id, `${s.framework} ${s.code} ${s.title}`])] }, { k: 'title', label: 'Title', required: true }, { k: 'kind', label: 'Kind', type: 'select', options: [['document', 'Document'], ['link', 'Link'], ['observation', 'Observation'], ['data', 'Data']] }, { k: 'heldAt', label: 'Where it is kept (a link, or the place of the paper copy)', required: true }, { k: 'period', label: 'Period it covers' }, { k: 'validUntil', label: 'In date until (optional)', type: 'date', min: today() }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/quality/evidence', { ...v, validUntil: v.validUntil || undefined }, 'Submitted. Someone else must check it.'); setM(null); bump(); }} />}
      {m?.t === 'accept' && <Reason title="Accept this evidence" text="Write what you saw." label="What you checked (optional)" min={0} danger={false} confirm="Accept" onClose={() => setM(null)} onDone={async (n) => { await send('post', `/quality/evidence/${m.e._id}/review`, { decision: 'accept', note: n }, 'Accepted'); setM(null); bump(); }} />}
      {m?.t === 'reject' && <Reason title="Reject this evidence" text="Say what is missing." confirm="Reject" onClose={() => setM(null)} onDone={async (n) => { await send('post', `/quality/evidence/${m.e._id}/review`, { decision: 'reject', note: n }, 'Rejected'); setM(null); bump(); }} />}
    </div>
  );
}

function Cycles({ ver, bump }) {
  const g = useGet('/advancement/quality/cycles', { v: ver }); const ppl = People(); const [m, setM] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'add' })}>New review</button></div>
      <Loading g={g}>{g.data && (g.data.cycles.length === 0 ? <Empty>No review cycles yet.</Empty> : <Table label="Review cycles" head={['Review', 'Owner', 'Every', 'Next due', 'Last done', '']} min={820}>{g.data.cycles.map((c) => <tr key={c._id}><Td><span className="font-semibold">{c.title}</span><span className="block text-xs text-[#5b6b7b]">{c.area}</span></Td><Td>{c.ownerName || '—'}</Td><Td>{c.intervalMonths} months</Td><Td>{day(c.nextDueOn)} {c.overdue ? <Tag tone="bad">Overdue</Tag> : c.dueSoon ? <Tag tone="warn">Due soon</Tag> : null}</Td><Td>{c.lastReviewedOn ? day(c.lastReviewedOn) : '—'}</Td><Td><button className={btnGhost} onClick={() => setM({ t: 'done', c })} aria-label={`Complete the review of ${c.title}`}>Complete</button></Td></tr>)}</Table>)}</Loading>
      {m?.t === 'add' && <AskForm title="New review" fields={[{ k: 'title', label: 'What is reviewed', required: true }, { k: 'area', label: 'Area' }, { k: 'intervalMonths', label: 'Every how many months', type: 'number', min: 1, max: 60, def: 12 }, { k: 'nextDueOn', label: 'Next due', type: 'date', required: true, min: today() }, { k: 'ownerId', label: 'Owner', type: 'select', options: pick(ppl) }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/quality/cycles', { ...v, intervalMonths: Number(v.intervalMonths), ownerId: v.ownerId || undefined }, 'Added'); setM(null); bump(); }} />}
      {m?.t === 'done' && <AskForm title={`Complete: ${m.c.title}`} fields={[{ k: 'outcome', label: 'Outcome', type: 'select', options: [['no_change', 'No change needed'], ['updated', 'Updated'], ['replaced', 'Replaced'], ['retired', 'Retired']] }, { k: 'note', label: 'What was reviewed and what changed', type: 'textarea', required: true }]} initial={{ outcome: 'no_change' }} onClose={() => setM(null)} onDone={async (v) => { await send('post', `/quality/cycles/${m.c._id}/complete`, v, 'Review recorded'); setM(null); bump(); }} />}
    </div>
  );
}

function Findings({ ver, bump, me }) {
  const [status, setStatus] = useState(''); const g = useGet('/advancement/quality/findings', { status: status || undefined, v: ver }); const ppl = People(); const [m, setM] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Show"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['Open', 'Planned', 'Closed'].map((s) => <option key={s}>{s}</option>)}</select></Field><button className={btnPrimary} onClick={() => setM({ t: 'add' })}>Raise a finding</button></div>
      <Note>Each finding has one person responsible. They write the plan. A different person closes it, with proof.</Note>
      <Loading g={g}>{g.data && (g.data.findings.length === 0 ? <Empty>No findings.</Empty> : <Table label="Audit findings" head={['No.', 'Finding', 'Responsible', 'Due', 'Status', '']} min={900}>{g.data.findings.map((f) => <tr key={f._id}><Td><span dir="ltr">{f.no}</span></Td><Td><span className="font-semibold">{f.title}</span><Tag tone={f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'none'}>{f.severity}</Tag><span className="block text-xs text-[#5b6b7b]">{f.detail}</span>{f.plan && <span className="block text-xs">Plan: {f.plan}</span>}</Td><Td>{f.ownerName}</Td><Td>{f.dueOn ? day(f.dueOn) : '—'} {f.overdue && <Tag tone="bad">Overdue</Tag>}</Td><Td><Tag tone={tone(f.status)}>{f.status}</Tag></Td><Td>{f.status !== 'Closed' && <div className="flex gap-2"><button className={btnGhost} onClick={() => setM({ t: 'plan', f })} aria-label={`Write the plan for ${f.no}`}>{f.plan ? 'Change plan' : 'Write plan'}</button>{f.plan && <button className={btnPrimary} onClick={() => setM({ t: 'close', f })} aria-label={`Close ${f.no}`}>Close</button>}</div>}</Td></tr>)}</Table>)}</Loading>
      {m?.t === 'add' && <AskForm title="Raise a finding" fields={[{ k: 'title', label: 'Title', required: true }, { k: 'detail', label: 'What was found', type: 'textarea' }, { k: 'severity', label: 'How serious', type: 'select', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] }, { k: 'ownerId', label: 'Person responsible', type: 'select', required: true, options: [['', 'Choose…'], ...pick(ppl).slice(1)] }, { k: 'dueOn', label: 'Due', type: 'date', min: today() }]} initial={{ severity: 'medium' }} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/quality/findings', { ...v, dueOn: v.dueOn || undefined }, 'Raised'); setM(null); bump(); }} />}
      {m?.t === 'plan' && <AskForm title={`Plan for ${m.f.no}`} fields={[{ k: 'plan', label: 'What will be done', type: 'textarea', required: true }, { k: 'dueOn', label: 'Done by', type: 'date' }]} initial={{ plan: m.f.plan, dueOn: m.f.dueOn }} onClose={() => setM(null)} onDone={async (v) => { await send('post', `/quality/findings/${m.f._id}/plan`, { plan: v.plan, dueOn: v.dueOn || undefined }, 'Plan saved'); setM(null); bump(); }} />}
      {m?.t === 'close' && <AskForm title={`Close ${m.f.no}`} intro="Someone other than the person responsible must close it." fields={[{ k: 'note', label: 'What was done', type: 'textarea', required: true }, { k: 'evidence', label: 'Proof (where it can be seen)', required: true }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', `/quality/findings/${m.f._id}/close`, v, 'Closed'); setM(null); bump(); }} />}
    </div>
  );
}

export default function Quality() {
  const [tab, setTab] = useState('coverage'); const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1); const ov = useGet('/advancement/quality/overview', { v: ver });
  return (
    <div className="space-y-4">
      <Loading g={ov}>{ov.data && <Grid><Tile label="Evidence waiting for a check" value={ov.data.evidenceWaiting} /><Tile label="Reviews overdue" value={ov.data.cyclesOverdue} tone={ov.data.cyclesOverdue ? 'text-[#9f1239]' : ''} /><Tile label="Open findings" value={ov.data.findingsOpen} /><Tile label="Findings overdue" value={ov.data.findingsOverdue} tone={ov.data.findingsOverdue ? 'text-[#9f1239]' : ''} /></Grid>}</Loading>
      <Tabs label="Quality sections" value={tab} onChange={setTab} items={[['coverage', 'Standards'], ['evidence', 'Evidence', ov.data?.evidenceWaiting || null], ['cycles', 'Reviews', ov.data?.cyclesOverdue || null], ['findings', 'Findings']]} />
      <div key={tab}>{tab === 'coverage' && <Coverage ver={ver} bump={bump} />}{tab === 'evidence' && <Evidence ver={ver} bump={bump} />}{tab === 'cycles' && <Cycles ver={ver} bump={bump} />}{tab === 'findings' && <Findings ver={ver} bump={bump} />}</div>
    </div>
  );
}
