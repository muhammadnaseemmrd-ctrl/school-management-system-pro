import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Modal, Field, Stat, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, PBadge, Dl, useGet, Loading, Note, AskForm, money, day } from './pcKit';

function NewProject({ onClose, onDone }) {
  const [v, setV] = useState({ title: '', proposed: '', description: '', location: '', startOn: '', endOn: '', milestones: [{ title: '', amount: '', dueOn: '' }] }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const setM = (i, k, x) => setV((p) => ({ ...p, milestones: p.milestones.map((m, j) => (j === i ? { ...m, [k]: x } : m)) }));
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const ms = v.milestones.filter((m) => m.title.trim()).map((m) => ({ ...m, amount: Number(m.amount) || 0 })); await apiClient.post('/procure/projects', { ...v, proposed: Number(v.proposed), milestones: ms }); toast.success('Project proposed.'); onDone(); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  return (
    <Modal title="Propose a project" onClose={onClose} wide>
      <form onSubmit={go} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Title"><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required /></Field></div>
        <Field label="Estimated cost (Rs)"><input className={inputCls} type="number" min="1" value={v.proposed} onChange={(e) => setV({ ...v, proposed: e.target.value })} required /></Field>
        <Field label="Where"><input className={inputCls} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} /></Field>
        <Field label="Starts"><input className={inputCls} type="date" value={v.startOn} onChange={(e) => setV({ ...v, startOn: e.target.value })} /></Field>
        <Field label="Finishes"><input className={inputCls} type="date" value={v.endOn} onChange={(e) => setV({ ...v, endOn: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="What is it?"><textarea className={inputCls} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field></div>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-semibold">Milestones</legend>
          <div className="space-y-2">{v.milestones.map((m, i) => <div key={i} className="grid grid-cols-12 items-end gap-2"><div className="col-span-12 sm:col-span-6"><label className="text-xs text-[#5b6b7b]" htmlFor={`mt${i}`}>Milestone</label><input id={`mt${i}`} className={inputCls} value={m.title} onChange={(e) => setM(i, 'title', e.target.value)} /></div><div className="col-span-6 sm:col-span-3"><label className="text-xs text-[#5b6b7b]" htmlFor={`mo${i}`}>Due</label><input id={`mo${i}`} className={inputCls} type="date" value={m.dueOn} onChange={(e) => setM(i, 'dueOn', e.target.value)} /></div><div className="col-span-6 sm:col-span-3"><label className="text-xs text-[#5b6b7b]" htmlFor={`ma${i}`}>Planned cost (Rs)</label><input id={`ma${i}`} className={inputCls} type="number" min="0" value={m.amount} onChange={(e) => setM(i, 'amount', e.target.value)} /></div></div>)}</div>
          <button type="button" className={`${btnGhost} mt-2 !text-xs`} onClick={() => setV({ ...v, milestones: [...v.milestones, { title: '', amount: '', dueOn: '' }] })}>Add a milestone</button></fieldset>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Propose it'}</button></div>
      </form>
    </Modal>
  );
}

function Detail({ id, admin, onClose, onChange }) {
  const g = useGet(`/procure/projects/${id}`); const bud = useGet(admin ? '/procure/budgets' : '/procure/access'); const funds = useGet(admin ? '/procure/funds' : '/procure/access'); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null);
  const p = g.data?.project; const reload = () => { g.reload(); onChange(); }; const run = async (fn, ok) => { try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const lines = admin && bud.data ? bud.data.rows.filter((b) => b.status === 'approved').flatMap((b) => b.lines.map((l) => [l._id, `${b.costCentre} · ${l.category} (${money(l.available)} left)`])) : [];
  const next = { approved: ['building', 'Start work'], building: ['handover', 'Move to handover'], handover: ['completed', 'Mark completed'] }[p?.phase];
  return (
    <Modal title={p ? `${p.code} · ${p.title}` : 'Project'} onClose={onClose} wide>
      <Loading g={g}>{p && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><PBadge k="phase" s={p.phase} />{p.location && <span className="text-xs text-[#5b6b7b]">{p.location}</span>}</div>
          {p.description && <p className="text-sm text-[#3b4a5c]">{p.description}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Estimated" value={money(p.proposed)} /><Stat label="May spend" value={money(p.authorized)} /><Stat label="Set aside / spent" value={`${money(p.committed)} / ${money(p.spent)}`} /><Stat label="Left" value={money(p.available)} tone={p.available < 0 ? 'text-[#9f1239]' : undefined} /></div>
          {g.data.variance.overProposed > 0 && <Note tone="warn">The project may spend {money(g.data.variance.overProposed)} more than first estimated, through approved changes.</Note>}
          <section><h4 className="mb-1 text-sm font-semibold">Milestones {g.data.variance.overdue > 0 && <span className="font-normal text-[#8a4636]">· {g.data.variance.overdue} overdue</span>}</h4>
            {p.milestones.length === 0 ? <p className="text-sm text-[#5b6b7b]">No milestones.</p> : <Table label="Milestones" head={['Milestone', 'Due', 'Planned cost', 'Done', '']} min={520}>{p.milestones.map((m) => <tr key={m.key}><Td className="font-medium">{m.title}{m.note && <div className="text-xs text-[#5b6b7b]">{m.note}</div>}</Td><Td>{day(m.dueOn)}</Td><Td>{money(m.amount)}</Td><Td>{m.done ? `Done ${day(m.doneAt)}` : 'Not yet'}</Td><Td>{['approved', 'building', 'handover'].includes(p.phase) && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`${m.done ? 'Mark not done' : 'Mark done'}: ${m.title}`} onClick={() => run(() => apiClient.post(`/procure/projects/${id}/milestones/${m.key}`, { done: !m.done }), m.done ? 'Marked not done.' : 'Marked done.')}>{m.done ? 'Undo' : 'Mark done'}</button>}</Td></tr>)}</Table>}</section>
          {g.data.changes.length > 0 && <section><h4 className="mb-1 text-sm font-semibold">Change orders</h4><Table label="Change orders" head={['Change', 'What', 'Why', 'Status', '']} min={620}>{g.data.changes.map((c) => <tr key={c._id}><Td className="font-mono text-xs">{c.chgNo}</Td><Td>{c.kind === 'increase' ? `Add ${money(c.amount)}` : c.kind === 'schedule' ? `Finish by ${day(c.endOn)}` : 'Change of scope'}</Td><Td>{c.reason}</Td><Td><PBadge k="ask" s={c.status} /></Td><Td>{admin && c.status === 'requested' && <div className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Approve ${c.chgNo}`} onClick={() => run(() => apiClient.post(`/procure/changes/${c._id}/decide`, { approve: true }), 'Approved.')}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Turn down ${c.chgNo}`} onClick={() => setAsk({ kind: 'change', c })}>Turn down</button></div>}</Td></tr>)}</Table></section>}
          {g.data.orders.length > 0 && <section><h4 className="mb-1 text-sm font-semibold">Orders</h4><Table label="Project orders" head={['Order', 'Supplier', 'Total', 'Paid']} min={440}>{g.data.orders.map((o) => <tr key={o._id}><Td className="font-mono text-xs">{o.poNo}</Td><Td>{o.vendorName}</Td><Td>{money(o.total)}</Td><Td>{money(o.paidTotal)}</Td></tr>)}</Table></section>}
          <div className="flex flex-wrap gap-2">
            {admin && p.phase === 'proposed' && <button className={btnPrimary} onClick={() => setForm('approve')}>Approve the project</button>}
            {['approved', 'building', 'handover'].includes(p.phase) && <button className={btnGhost} onClick={() => setForm('change')}>Ask for a change</button>}
            {admin && next && <button className={btnPrimary} onClick={() => (next[0] === 'completed' && p.milestones.some((m) => !m.done) ? setAsk({ kind: 'complete' }) : run(() => apiClient.post(`/procure/projects/${id}/phase`, { phase: next[0] }), 'Updated.'))}>{next[1]}</button>}
            {admin && !['completed', 'cancelled'].includes(p.phase) && <button className={btnDanger} onClick={() => setAsk({ kind: 'cancel' })}>Cancel the project</button>}
          </div>
        </div>)}</Loading>
      {form === 'approve' && <AskForm title="Approve the project" intro="Choose the budget line the money comes from. Spending stops at the amount you authorise." confirm="Approve" initial={{ authorized: p?.proposed, budgetLineId: lines[0]?.[0] || '' }} fields={[{ k: 'budgetLineId', label: 'Budget line', type: 'select', required: true, full: true, options: [['', 'Choose a line'], ...lines] }, { k: 'fundId', label: 'Special fund (optional)', type: 'select', options: [['', 'None'], ...((funds.data?.rows || []).filter((f) => f.status === 'active').map((f) => [f._id, `${f.name} (${money(f.available)} left)`]))] }, { k: 'authorized', label: 'May spend (Rs)', type: 'number', min: 1, required: true }]} onClose={() => setForm(null)} onDone={async (v) => { const r = await apiClient.post(`/procure/projects/${id}/approve`, { ...v, authorized: Number(v.authorized), fundId: v.fundId || null }); setForm(null); toast.success(r.data.warnings?.length ? `Approved. ${r.data.warnings[0]}` : 'Approved.'); reload(); }} />}
      {form === 'change' && <AskForm title="Ask for a change" confirm="Ask" initial={{ kind: 'increase' }} fields={[{ k: 'kind', label: 'What kind', type: 'select', options: [['increase', 'More money'], ['schedule', 'New finish date'], ['scope', 'Change of scope']] }, { k: 'amount', label: 'Extra money (Rs)', type: 'number', min: 1 }, { k: 'endOn', label: 'New finish date', type: 'date' }, { k: 'reason', label: 'Why', type: 'textarea', required: true }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post(`/procure/projects/${id}/changes`, { kind: v.kind, reason: v.reason, amount: v.kind === 'increase' ? Number(v.amount) : undefined, endOn: v.kind === 'schedule' ? v.endOn : undefined }); setForm(null); toast.success('Sent for a decision.'); reload(); }} />}
      {ask?.kind === 'cancel' && <Reason title="Cancel this project" text="Orders for it must be settled first." confirm="Cancel the project" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/procure/projects/${id}/phase`, { phase: 'cancelled', note: r }); setAsk(null); toast.success('Cancelled.'); reload(); }} />}
      {ask?.kind === 'complete' && <Reason title="Complete with milestones open" text="Some milestones are not ticked. Say why the project is complete anyway." confirm="Mark completed" danger={false} onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/procure/projects/${id}/phase`, { phase: 'completed', note: r }); setAsk(null); toast.success('Completed.'); reload(); }} />}
      {ask?.kind === 'change' && <Reason title="Turn down this change" confirm="Turn it down" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/procure/changes/${ask.c._id}/decide`, { approve: false, note: r }); setAsk(null); toast.success('Turned down.'); reload(); }} />}
    </Modal>
  );
}

export default function Projects({ admin }) {
  const [phase, setPhase] = useState(''); const g = useGet('/procure/projects', { phase: phase || undefined }); const [open, setOpen] = useState(null); const [form, setForm] = useState(false);
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="Show"><select className={inputCls} value={phase} onChange={(e) => setPhase(e.target.value)}><option value="">All projects</option><option value="proposed">Waiting for approval</option><option value="approved">Approved</option><option value="building">Under way</option><option value="handover">Handover</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field><button className={btnPrimary} onClick={() => setForm(true)}>Propose a project</button></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No projects" text="A building, a lab or any larger job with milestones can be run as a project, with its own spending limit." /></Card> : (
        <Table label="Projects" head={['Project', 'Phase', 'May spend', 'Spent', 'Left', 'Milestones', '']} min={780}>{g.data.rows.map((p) => <tr key={p._id}><Td className="font-medium">{p.title}<div className="font-mono text-[11px] text-[#5b6b7b]">{p.code}</div></Td><Td><PBadge k="phase" s={p.phase} /></Td><Td>{money(p.authorized || p.proposed)}</Td><Td>{money(p.spent)}</Td><Td>{money(p.available)}</Td><Td>{p.milestonesDone} of {p.milestones.length}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(p._id)} aria-label={`Open ${p.code}`}>Open</button></Td></tr>)}</Table>))}</Loading>
      {form && <NewProject onClose={() => setForm(false)} onDone={() => { setForm(false); g.reload(); }} />}
      {open && <Detail id={open} admin={admin} onClose={() => setOpen(null)} onChange={g.reload} />}
    </div>
  );
}
