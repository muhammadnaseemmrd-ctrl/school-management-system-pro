import React, { useState } from 'react';
import { btnPrimary, btnGhost, btnDanger, Field, inputCls, Card } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, AskForm, Reason, send, Empty, tone, lines, day, today } from './advKit';

const ROLES = [['chair', 'Chair'], ['secretary', 'Secretary'], ['member', 'Member'], ['observer', 'Observer']];

function Members({ ver, bump }) {
  const g = useGet('/advancement/board/members', { v: ver }); const ppl = useGet('/advancement/people', {}); const [m, setM] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({})}>Add a member</button></div>
      <Note>Board membership is chosen here. It does not come from anyone&apos;s job title.</Note>
      <Loading g={g}>{g.data && (g.data.members.length === 0 ? <Empty>No members yet.</Empty> : <Table label="Board members" head={['Name', 'Role', 'Since', 'Status', '']} min={620}>{g.data.members.map((x) => <tr key={x._id}><Td>{x.userName}</Td><Td>{ROLES.find((r) => r[0] === x.role)?.[1] || x.role}</Td><Td>{day(x.createdAt)}</Td><Td><Tag tone={x.active ? 'good' : 'none'}>{x.active ? 'Active' : 'Left'}</Tag></Td><Td>{x.active && <button className={btnDanger} onClick={() => setM({ rm: x })} aria-label={`Remove ${x.userName}`}>Remove</button>}</Td></tr>)}</Table>)}</Loading>
      {m && !m.rm && <AskForm title="Add a board member" fields={[{ k: 'userId', label: 'Who (a member of staff)', type: 'select', required: true, options: [['', 'Choose…'], ...(ppl.data?.people || []).map((p) => [p.id, `${p.name} (${p.role})`])] }, { k: 'role', label: 'Role', type: 'select', options: ROLES }]} initial={{ role: 'member' }} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/board/members', v, 'Added'); setM(null); bump(); }} />}
      {m?.rm && <Reason title={`Remove ${m.rm.userName}`} text="Their access to the papers stops at once." label="Note" min={0} confirm="Remove" onClose={() => setM(null)} onDone={async () => { await send('delete', `/board/members/${m.rm._id}`, undefined, 'Removed'); setM(null); bump(); }} />}
    </div>
  );
}

function Meeting({ id, me, onBack }) {
  const [v, setV] = useState(0); const g = useGet(`/advancement/board/meetings/${id}`, { v }); const [m, setM] = useState(null); const [txt, setTxt] = useState(null); const [err, setErr] = useState(''); const lead = ['chair', 'secretary'].includes(me.role); const bump = () => setV((x) => x + 1);
  const mt = g.data?.meeting;
  return (
    <div className="space-y-3">
      <button className={btnGhost} onClick={onBack}>Back to the meetings</button>
      <Loading g={g}>{mt && (<>
        <Card><h2 className="text-lg font-bold text-[#1b2837]">{mt.title}</h2><p className="text-sm text-[#5b6b7b]">{day(mt.date)} · <Tag tone={tone(mt.status)}>{mt.status}</Tag></p>
          {lead && mt.status === 'Planned' && <div className="mt-2 flex gap-2"><button className={btnPrimary} onClick={async () => { await send('put', `/board/meetings/${id}`, { status: 'Held' }, 'Marked as held'); bump(); }}>Mark as held</button><button className={btnGhost} onClick={async () => { await send('put', `/board/meetings/${id}`, { status: 'Cancelled' }, 'Cancelled'); bump(); }}>Cancel the meeting</button></div>}</Card>
        <Card><h3 className="text-sm font-bold">Agenda</h3><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">{mt.agenda.map((a) => <li key={a.id}><b>{a.title}</b>{a.restricted && <Tag tone="warn">Private: chair and secretary</Tag>}<p className="text-[#3b4a5c]">{a.text}</p></li>)}</ol></Card>
        {mt.status === 'Held' && <Card><h3 className="text-sm font-bold">Resolutions</h3>{mt.resolutions.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">None recorded.</p> : <ul className="mt-2 space-y-1 text-sm">{mt.resolutions.map((r) => <li key={r.id}>{r.text} <Tag tone={r.outcome === 'passed' ? 'good' : 'none'}>{r.outcome.replace('_', ' ')}</Tag></li>)}</ul>}{lead && <button className={`${btnGhost} mt-2`} onClick={() => setM({ t: 'res' })}>Record a resolution</button>}</Card>}
        {mt.status === 'Held' && (
          <Card><h3 className="text-sm font-bold">Minutes</h3>
            <p className="mt-1 text-xs text-[#5b6b7b]">Drafted by the chair or secretary. Approved by two other members, with the chair among them unless the chair wrote them. Changing the draft cancels earlier approvals.</p>
            {mt.minutes?.status === 'Approved' ? <Note tone="ok">Approved by {(mt.minutes.approvals || []).map((a) => a.name).join(' and ')}.</Note> : mt.minutes?.status === 'Draft' ? <p className="mt-1 text-xs">Draft by {mt.minutes.draftedByName} · {(mt.minutes.approvals || []).length} approval(s) so far{(mt.minutes.approvals || []).length ? `: ${mt.minutes.approvals.map((a) => a.name).join(', ')}` : ''}</p> : <p className="mt-1 text-sm text-[#5b6b7b]">No minutes yet.</p>}
            {mt.minutes?.text && txt === null && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#f7f6f2] p-3 text-sm">{mt.minutes.text}</p>}
            {txt !== null && <div className="mt-2"><label htmlFor="mn" className="text-sm font-semibold">Minutes</label><textarea id="mn" className={`${inputCls} mt-1`} rows={10} value={txt} onChange={(e) => setTxt(e.target.value)} />{err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="mt-2 flex justify-end gap-2"><button className={btnGhost} onClick={() => setTxt(null)}>Cancel</button><button className={btnPrimary} onClick={async () => { try { await send('put', `/board/meetings/${id}/minutes`, { text: txt }, 'Saved as a draft'); setTxt(null); setErr(''); bump(); } catch (e) { setErr(e.response?.data?.message || 'That did not work.'); } }}>Save the draft</button></div></div>}
            <div className="mt-3 flex flex-wrap gap-2">{lead && mt.minutes?.status !== 'Approved' && txt === null && <button className={btnGhost} onClick={() => setTxt(mt.minutes?.text || '')}>{mt.minutes?.text ? 'Change the draft' : 'Write the minutes'}</button>}{mt.minutes?.status === 'Draft' && me.role !== 'observer' && <button className={btnPrimary} onClick={async () => { try { await send('post', `/board/meetings/${id}/minutes/approve`, {}, 'Your approval is recorded'); bump(); } catch (e) { setErr(e.response?.data?.message || 'That did not work.'); } }}>Approve these minutes</button>}</div>
            {err && txt === null && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}
          </Card>)}
      </>)}</Loading>
      {m?.t === 'res' && <AskForm title="Record a resolution" fields={[{ k: 'text', label: 'The resolution', type: 'textarea', required: true }, { k: 'outcome', label: 'Outcome', type: 'select', options: [['passed', 'Passed'], ['not_passed', 'Not passed'], ['deferred', 'Deferred']] }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', `/board/meetings/${id}/resolutions`, v, 'Recorded'); setM(null); bump(); }} />}
    </div>
  );
}

export default function Board({ me, wide }) {
  const [tab, setTab] = useState('meetings'); const [open, setOpen] = useState(null); const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1); const lead = me && ['chair', 'secretary'].includes(me.role); const [m, setM] = useState(null);
  const g = useGet('/advancement/board/meetings', { v: ver });
  if (open) return <Meeting id={open} me={me} onBack={() => { setOpen(null); bump(); }} />;
  return (
    <div className="space-y-4">
      {!me && !wide && <Note>You are not a member of the board, so the papers are closed to you.</Note>}
      {wide && <div className="flex gap-2" role="tablist" aria-label="Board sections">{[['meetings', 'Meetings'], ['members', 'Members']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? btnPrimary : btnGhost} onClick={() => setTab(k)}>{l}</button>)}</div>}
      {tab === 'members' && wide && <Members ver={ver} bump={bump} />}
      {tab === 'meetings' && (me ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm text-[#3b4a5c]">You are on the board as <b>{ROLES.find((r) => r[0] === me.role)?.[1]}</b>.</p>{lead && <button className={btnPrimary} onClick={() => setM({})}>New meeting</button>}</div>
          <Loading g={g}>{g.data && (g.data.meetings.length === 0 ? <Empty>No meetings yet.</Empty> : <Table label="Board meetings" head={['Meeting', 'Date', 'Status', 'Minutes', '']} min={640}>{g.data.meetings.map((x) => <tr key={x.id}><Td><span className="font-semibold">{x.title}</span></Td><Td>{day(x.date)}</Td><Td><Tag tone={tone(x.status)}>{x.status}</Tag></Td><Td>{x.minutes === 'None' ? '—' : x.minutes}</Td><Td><button className={btnGhost} onClick={() => setOpen(x.id)} aria-label={`Open ${x.title}`}>Open</button></Td></tr>)}</Table>)}</Loading>
          {m && <AskForm title="New meeting" fields={[{ k: 'title', label: 'Title', required: true }, { k: 'date', label: 'Date', type: 'date', required: true }, { k: 'agenda', label: 'Agenda, one item per line. Start a line with ! to keep it private to the chair and secretary.', type: 'textarea' }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/board/meetings', { title: v.title, date: v.date, agenda: lines(v.agenda).map((l) => ({ title: l.replace(/^!\s*/, ''), text: '', restricted: l.startsWith('!') })) }, 'Meeting made'); setM(null); bump(); }} />}
        </div>
      ) : <Empty>The board papers are open only to board members.</Empty>)}
    </div>
  );
}
