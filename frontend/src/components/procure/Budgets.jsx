import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Modal, Field, Stat, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, PBadge, Dl, KINDS, useGet, Loading, PageBar, Note, AskForm, money, day, dt } from './pcKit';

function BudgetForm({ cfg, year, existing, onClose, onDone }) {
  const [v, setV] = useState(() => existing ? { year: existing.year, costCentre: existing.costCentre, note: existing.note || '', lines: existing.lines.map((l) => ({ category: l.category, amount: l.amount })) } : { year, costCentre: cfg.costCentres[0], note: '', lines: [{ category: cfg.categories[0], amount: '' }] });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const total = v.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const setLine = (i, k, x) => setV((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: x } : l)) }));
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const body = { ...v, lines: v.lines.map((l) => ({ category: l.category, amount: Number(l.amount) })) }; if (existing) await apiClient.put(`/procure/budgets/${existing._id}`, body); else await apiClient.post('/procure/budgets', body); toast.success('Budget saved as a draft.'); onDone(); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  return (
    <Modal title={existing ? `Change the ${existing.costCentre} budget` : 'New budget'} onClose={onClose} wide>
      <form onSubmit={go} className="grid gap-3 sm:grid-cols-2">
        <Field label="Year" hint="For example 2026-27."><input className={inputCls} value={v.year} onChange={(e) => setV({ ...v, year: e.target.value })} required disabled={!!existing} /></Field>
        <Field label="Cost centre"><select className={inputCls} value={v.costCentre} onChange={(e) => setV({ ...v, costCentre: e.target.value })} disabled={!!existing}>{cfg.costCentres.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-semibold">Amount for each category</legend>
          <div className="space-y-2">{v.lines.map((l, i) => <div key={i} className="grid grid-cols-12 items-end gap-2"><div className="col-span-7"><label className="text-xs text-[#5b6b7b]" htmlFor={`bc${i}`}>Category</label><select id={`bc${i}`} className={inputCls} value={l.category} onChange={(e) => setLine(i, 'category', e.target.value)}>{cfg.categories.map((c) => <option key={c}>{c}</option>)}</select></div><div className="col-span-4"><label className="text-xs text-[#5b6b7b]" htmlFor={`ba${i}`}>Amount (Rs)</label><input id={`ba${i}`} className={inputCls} type="number" min="0" value={l.amount} onChange={(e) => setLine(i, 'amount', e.target.value)} required /></div><div className="col-span-1">{v.lines.length > 1 && <button type="button" className={`${btnGhost} !px-2 !py-1.5 !text-xs`} aria-label={`Remove line ${i + 1}`} onClick={() => setV({ ...v, lines: v.lines.filter((_, j) => j !== i) })}>×</button>}</div></div>)}</div>
          <div className="mt-2 flex items-center justify-between"><button type="button" className={`${btnGhost} !text-xs`} onClick={() => setV({ ...v, lines: [...v.lines, { category: cfg.categories[0], amount: '' }] })}>Add a category</button><span className="text-sm font-semibold">Total {money(total)}</span></div></fieldset>
        <div className="sm:col-span-2"><Field label="Note"><input className={inputCls} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field></div>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the draft'}</button></div>
      </form>
    </Modal>
  );
}

export function Budgets() {
  const [year, setYear] = useState(''); const g = useGet('/procure/budgets', { year: year || undefined }); const st = useGet('/procure/settings'); const ov = useGet('/procure/overview'); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null); const [vary, setVary] = useState(false);
  const cfg = st.data?.settings; const cur = ov.data?.year; const reload = () => { g.reload(); ov.reload(); };
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="Budget year" hint={cur ? `This year is ${cur}.` : ''}><input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} placeholder={cur || '2026-27'} /></Field><button className={btnPrimary} disabled={!cfg} onClick={() => setForm({})}>New budget</button><button className={btnGhost} onClick={() => setVary(true)} disabled={!g.data || !g.data.rows.some((b) => b.status === 'approved')}>Ask to change a line</button></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No budgets for this year" text="Make one budget for each cost centre. Requests can only be raised against an approved budget line." /></Card> : g.data.rows.map((b) => (
        <Card key={b._id}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-[#1b2837]">{b.costCentre} <span className="font-normal text-[#5b6b7b]">· {b.year}</span></h3><div className="mt-1"><PBadge k="budget" s={b.status} />{b.sole && <span className="ms-2 text-xs text-[#5b6b7b]">Approved by the only administrator</span>}</div></div>
            <div className="flex flex-wrap gap-2">{b.status === 'draft' && <><button className={btnGhost} onClick={() => setForm(b)}>Change it</button><button className={btnPrimary} aria-label={`Approve the ${b.costCentre} budget`} onClick={() => act(() => apiClient.post(`/procure/budgets/${b._id}/approve`, {}), 'Budget approved.')}>Approve</button></>}{b.status === 'approved' && <button className={btnGhost} onClick={() => setAsk(b)}>Close the year</button>}</div></div>
          <Table label={`${b.costCentre} budget lines`} head={['Category', 'Budget', 'Set aside', 'Spent', 'Left']} min={520}>{b.lines.map((l) => <tr key={l._id}><Td className="font-medium">{l.category}</Td><Td>{money(l.amount)}</Td><Td>{money(l.committed)}</Td><Td>{money(l.spent)}</Td><Td className={l.available < 0 ? 'text-[#9f1239]' : ''}>{money(l.available)}</Td></tr>)}
            <tr className="font-semibold"><Td>Total</Td><Td>{money(b.total)}</Td><Td>{money(b.committed)}</Td><Td>{money(b.spent)}</Td><Td>{money(b.available)}</Td></tr></Table>
        </Card>)))}</Loading>
      <Variations reload={reload} />
      {form && cfg && <BudgetForm cfg={cfg} year={year || cur || ''} existing={form._id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); reload(); }} />}
      {ask && <Reason title={`Close the ${ask.costCentre} budget`} text="No more can be spent from it. What is still set aside stays until those orders are settled." confirm="Close it" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/procure/budgets/${ask._id}/close`, { reason: r }); setAsk(null); toast.success('Budget closed.'); reload(); }} />}
      {vary && g.data && <VariationForm budgets={g.data.rows.filter((b) => b.status === 'approved')} onClose={() => setVary(false)} onDone={() => { setVary(false); reload(); }} />}
    </div>
  );
}

function VariationForm({ budgets, onClose, onDone }) {
  const lines = budgets.flatMap((b) => b.lines.map((l) => ({ ...l, label: `${b.costCentre} · ${l.category} (${money(l.available)} left)` })));
  return <AskForm title="Ask to change the budget" intro="Move money between two lines, or add to one. A different administrator decides." confirm="Ask" initial={{ kind: 'move', toLineId: lines[0]?._id || '', fromLineId: lines[1]?._id || lines[0]?._id || '' }} fields={[{ k: 'kind', label: 'What', type: 'select', options: [['move', 'Move money from another line'], ['increase', 'Add to a line']] }, { k: 'toLineId', label: 'The line that needs more', type: 'select', required: true, options: lines.map((l) => [l._id, l.label]) }, { k: 'fromLineId', label: 'Take it from (when moving)', type: 'select', options: lines.map((l) => [l._id, l.label]) }, { k: 'amount', label: 'Amount (Rs)', type: 'number', min: 1, required: true }, { k: 'reason', label: 'Why', type: 'textarea', required: true }]} onClose={onClose} onDone={async (v) => { await apiClient.post('/procure/variations', { ...v, amount: Number(v.amount), fromLineId: v.kind === 'move' ? v.fromLineId : undefined }); toast.success('Sent for a decision.'); onDone(); }} />;
}

function Variations({ reload }) {
  const g = useGet('/procure/variations', { status: 'requested' }); const [ask, setAsk] = useState(null);
  if (!g.data || g.data.rows.length === 0) return null;
  return (
    <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Budget changes waiting for a decision</h3>
      <Table label="Budget variations" head={['Change', 'Amount', 'Why', 'Asked by', '']} min={640}>{g.data.rows.map((v) => <tr key={v._id}><Td className="font-mono text-xs">{v.varNo}<div className="font-sans text-[11px] text-[#5b6b7b]">{v.kind === 'move' ? 'Move' : 'Increase'}</div></Td><Td>{money(v.amount)}</Td><Td>{v.reason}</Td><Td>{v.requestedByName}</Td><Td><div className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Approve ${v.varNo}`} onClick={async () => { try { await apiClient.post(`/procure/variations/${v._id}/decide`, { approve: true }); toast.success('Approved.'); g.reload(); reload(); } catch (e) { toast.error(errMsg(e)); } }}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Turn down ${v.varNo}`} onClick={() => setAsk(v)}>Turn down</button></div></Td></tr>)}</Table>
      {ask && <Reason title="Turn down this change" confirm="Turn it down" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/procure/variations/${ask._id}/decide`, { approve: false, note: r }); setAsk(null); toast.success('Turned down.'); g.reload(); }} />}
    </Card>
  );
}

export function Funds() {
  const g = useGet('/procure/funds'); const rc = useGet('/procure/reconcile'); const st = useGet('/procure/settings'); const [form, setForm] = useState(null); const [open, setOpen] = useState(null);
  const d = g.data; const cfg = st.data?.settings;
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-[#1b2837]">Funds</h3><p className="text-sm text-[#5b6b7b]">Money with its own rules: a donor who wants it spent on furniture, a grant that ends on a date. A request can only draw on a fund that allows its category and date.</p></div><div className="flex gap-2"><button className={btnPrimary} onClick={() => setForm('new')} disabled={!cfg}>New fund</button></div></div>
        {rc.data && <p className={`mt-2 text-xs ${rc.data.ok ? 'text-[#215a52]' : 'text-[#9f1239]'}`} role="status">{rc.data.ok ? 'Every fund, budget line and project adds up to its entries.' : `Check needed: ${rc.data.problems.length} balance(s) differ from their entries.`}</p>}</Card>
      <Loading g={g}>{d && (d.rows.length === 0 ? <Card><EmptyState title="No funds yet" text="Add a general fund for ordinary money, and one for each donor or grant with rules." /></Card> : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Received" value={money(d.totals.received)} /><Stat label="Set aside" value={money(d.totals.committed)} /><Stat label="Spent" value={money(d.totals.spent)} /><Stat label="Left" value={money(d.totals.available)} sub={`${money(d.restricted)} is restricted`} /></div>
        <Table label="Funds" head={['Fund', 'Kind', 'Spend on', 'Valid', 'Received', 'Left', 'Status', '']} min={900}>{d.rows.map((f) => <tr key={f._id}><Td className="font-medium">{f.name}{f.donor && <div className="text-xs text-[#5b6b7b]">{f.donor}</div>}</Td><Td>{KINDS[f.kind]}</Td><Td>{f.allowed && f.allowed.length ? f.allowed.join(', ') : 'Anything'}</Td><Td>{f.validFrom || f.validTo ? `${day(f.validFrom) || '…'} to ${day(f.validTo) || '…'}` : 'No limit'}</Td><Td>{money(f.received)}</Td><Td>{money(f.available)}</Td><Td><PBadge k="fund" s={f.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(f._id)} aria-label={`Open ${f.name}`}>Open</button></Td></tr>)}</Table></>)}</Loading>
      {form === 'new' && cfg && <AskForm title="New fund" confirm="Add the fund" wide intro="A restricted fund must say what it can be spent on." fields={[{ k: 'name', label: 'Name', required: true }, { k: 'kind', label: 'Kind', type: 'select', options: Object.entries(KINDS) }, { k: 'donor', label: 'Donor or grant giver' }, { k: 'amount', label: 'Opening amount (Rs)', type: 'number', min: 0 }, { k: 'validFrom', label: 'Valid from', type: 'date' }, { k: 'validTo', label: 'Valid until', type: 'date' }, { k: 'allowed', label: 'Can be spent on (comma separated)', hint: `From: ${cfg.categories.join(', ')}`, full: true }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post('/procure/funds', { ...v, amount: Number(v.amount) || 0, allowed: v.allowed ? v.allowed.split(',').map((x) => x.trim()).filter(Boolean) : [] }); setForm(null); toast.success('Fund added.'); g.reload(); rc.reload(); }} />}
      {open && <FundDetail id={open} onClose={() => setOpen(null)} onChange={() => { g.reload(); rc.reload(); }} />}
    </div>
  );
}

function FundDetail({ id, onClose, onChange }) {
  const [page, setPage] = useState(1); const g = useGet(`/procure/funds/${id}`, { page, limit: 20 }); const [form, setForm] = useState(null); const [ask, setAsk] = useState(false); const f = g.data?.fund; const reload = () => { g.reload(); onChange(); };
  return (
    <Modal title={f ? f.name : 'Fund'} onClose={onClose} wide>
      <Loading g={g}>{f && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Received" value={money(f.received)} /><Stat label="Set aside" value={money(f.committed)} /><Stat label="Spent" value={money(f.spent)} /><Stat label="Left" value={money(f.available)} /></div>
          {f.status === 'active' && <div className="flex flex-wrap gap-2"><button className={btnPrimary} onClick={() => setForm('receipt')}>Money received</button><button className={btnGhost} onClick={() => setForm('adjust')}>Correct the balance</button><button className={btnGhost} onClick={() => setAsk(true)}>Close the fund</button></div>}
          <Table label="Fund history" head={['When', 'What', 'Amount', 'Balance after', 'Note']} min={640}>{g.data.entries.map((e) => <tr key={e._id}><Td>{dt(e.createdAt)}</Td><Td>{({ receipt: 'Money in', commit: 'Set aside', release: 'Released', spend: 'Spent', refund: 'Credit back', adjust: 'Correction' })[e.kind] || e.kind}{e.refNo && <div className="text-xs text-[#5b6b7b]">{e.refNo}</div>}</Td><Td>{money(e.amount)}</Td><Td>{money(e.balanceAfter)}</Td><Td>{e.note}</Td></tr>)}</Table>
          <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
        </div>)}</Loading>
      {form === 'receipt' && <AskForm title="Money received" confirm="Add it" fields={[{ k: 'amount', label: 'Amount (Rs)', type: 'number', min: 1, required: true }, { k: 'reference', label: 'Reference' }, { k: 'note', label: 'Note', type: 'textarea' }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post(`/procure/funds/${id}/money`, { ...v, amount: Number(v.amount) }); setForm(null); toast.success('Added.'); reload(); }} />}
      {form === 'adjust' && <AskForm title="Correct the balance" intro="A correction is a new entry. Nothing is rewritten." confirm="Record the correction" fields={[{ k: 'direction', label: 'Direction', type: 'select', options: [['up', 'Add to the fund'], ['down', 'Take out of the fund']] }, { k: 'amount', label: 'Amount (Rs)', type: 'number', min: 1, required: true }, { k: 'note', label: 'Why', type: 'textarea', required: true }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post(`/procure/funds/${id}/money`, { ...v, kind: 'adjust', amount: Number(v.amount) }); setForm(null); toast.success('Recorded.'); reload(); }} />}
      {ask && <Reason title="Close this fund" text="It must have nothing set aside. No money can be added or spent afterwards." confirm="Close the fund" onClose={() => setAsk(false)} onDone={async (r) => { await apiClient.post(`/procure/funds/${id}/close`, { reason: r }); setAsk(false); toast.success('Fund closed.'); reload(); }} />}
    </Modal>
  );
}
