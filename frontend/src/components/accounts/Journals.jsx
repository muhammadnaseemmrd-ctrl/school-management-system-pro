import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, PageBar, useDebounced, ABadge, Trail, Dl, Num, today, ymName, day, useChart } from './acKit';

const blankLine = () => ({ code: '', debit: '', credit: '', memo: '', fundId: '' });
const n = (v) => (v === '' || v == null ? 0 : Number(v));

export function JournalForm({ existing, onClose, onDone }) {
  const chart = useChart(); const funds = useGet('/accounts/funds');
  const [f, setF] = useState(() => ({ date: existing?.date || today(), type: existing?.type || 'manual', memo: existing?.memo || '', reference: existing?.reference || '', lines: existing ? existing.lines.map((l) => ({ code: l.code, debit: l.debit || '', credit: l.credit || '', memo: l.memo || '', fundId: l.fundId || '' })) : [blankLine(), blankLine()] }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [pv, setPv] = useState(null);
  const by = useMemo(() => new Map(chart.map((a) => [a.code, a])), [chart]);
  const set = (i, k, v) => { setPv(null); setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'debit' && v !== '' ? { credit: '' } : {}), ...(k === 'credit' && v !== '' ? { debit: '' } : {}) } : l)) }); };
  const dr = f.lines.reduce((s, l) => s + n(l.debit), 0); const cr = f.lines.reduce((s, l) => s + n(l.credit), 0); const diff = dr - cr;
  const fundable = (code) => { const a = by.get(code); return !!a && (a.kind === 'income' || a.kind === 'expense' || a.code === '1500'); };
  const body = () => ({ date: f.date, type: f.type, memo: f.memo, reference: f.reference, lines: f.lines.filter((l) => l.code || l.debit || l.credit).map((l) => ({ code: l.code, debit: n(l.debit), credit: n(l.credit), memo: l.memo || undefined, fundId: l.fundId && fundable(l.code) ? l.fundId : undefined })) });
  const check = async () => { setErr(''); try { const r = await apiClient.post('/accounts/journals/preview', body()); setPv(r.data); } catch (x) { setErr(errMsg(x, 'Could not check it.')); } };
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const r = existing ? await apiClient.patch(`/accounts/journals/${existing._id}`, body()) : await apiClient.post('/accounts/journals', body()); toast.success('Saved as a draft.'); onDone(r.data); } catch (x) { setErr(errMsg(x, 'Could not save the journal.')); setBusy(false); } };
  return (
    <Modal title={existing ? `Change ${existing.number}` : 'New journal'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
          <Field label="Kind"><select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="manual">Journal</option><option value="adjusting">Adjustment</option><option value="opening">Opening balances</option></select></Field>
          <div className="sm:col-span-2"><Field label="Reference (receipt, cheque or letter number)"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={80} /></Field></div>
          <div className="sm:col-span-4"><Field label="What is this for?"><input className={inputCls} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} required maxLength={300} /></Field></div>
        </div>
        <div className="space-y-2" role="group" aria-label="Journal lines">
          {f.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-[#e3e7e7] p-2">
              <div className="col-span-12 sm:col-span-4"><Field label={`Line ${i + 1} account`}><select className={inputCls} value={l.code} onChange={(e) => set(i, 'code', e.target.value)}><option value="">Choose an account</option>{chart.filter((a) => a.active || a.code === l.code).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field></div>
              <div className="col-span-6 sm:col-span-2"><Field label="Debit"><input type="number" min="0" step="1" className={inputCls} value={l.debit} onChange={(e) => set(i, 'debit', e.target.value)} /></Field></div>
              <div className="col-span-6 sm:col-span-2"><Field label="Credit"><input type="number" min="0" step="1" className={inputCls} value={l.credit} onChange={(e) => set(i, 'credit', e.target.value)} /></Field></div>
              <div className="col-span-10 sm:col-span-3">{fundable(l.code) ? <Field label="Fund or grant"><select className={inputCls} value={l.fundId} onChange={(e) => set(i, 'fundId', e.target.value)}><option value="">None</option>{(funds.data?.funds || []).filter((x) => x.status === 'active' || x.id === l.fundId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field> : <Field label="Note for this line"><input className={inputCls} value={l.memo} onChange={(e) => set(i, 'memo', e.target.value)} maxLength={200} /></Field>}</div>
              <div className="col-span-2 sm:col-span-1"><button type="button" className={`${btnDanger} !px-2 !py-2 !text-xs`} onClick={() => { setPv(null); setF({ ...f, lines: f.lines.filter((_, j) => j !== i) }); }} disabled={f.lines.length <= 2} aria-label={`Remove line ${i + 1}`}>Remove</button></div>
            </div>))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={btnGhost} onClick={() => setF({ ...f, lines: [...f.lines, blankLine()] })}>Add a line</button>
          <p className={`text-sm font-semibold ${diff === 0 && dr > 0 ? 'text-[#215a52]' : 'text-[#8a4636]'}`} role="status">Debits {dr.toLocaleString('en-PK')} · Credits {cr.toLocaleString('en-PK')} · {diff === 0 ? (dr > 0 ? 'Balanced' : 'Nothing entered') : `Out by ${Math.abs(diff).toLocaleString('en-PK')}`}</p>
        </div>
        {pv && (pv.ok ? <Note tone="good">This would be accepted.{(pv.warnings || []).length > 0 && <ul className="mt-1 list-disc ps-5">{pv.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}</Note> : <Note tone="warn">{pv.error || 'There is a problem:'}{(pv.problems || []).length > 0 && <ul className="mt-1 list-disc ps-5">{pv.problems.map((w) => <li key={w}>{w}</li>)}</ul>}</Note>)}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button type="button" className={btnGhost} onClick={check}>Check it</button><button className={btnPrimary} disabled={busy || diff !== 0 || dr === 0}>{busy ? 'Saving…' : 'Save as draft'}</button></div>
      </form>
    </Modal>
  );
}

function JournalView({ id, t, onClose, onChanged, edit }) {
  const g = useGet(`/accounts/journals/${id}`); const [ask, setAsk] = useState(null); const [src, setSrc] = useState(null);
  const j = g.data;
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); g.reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={j ? `${j.number} · ${j.memo}` : 'Journal'} onClose={onClose} wide>
      <Loading g={g}>{j && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><ABadge k="journal" s={j.status} /><ABadge k="type" s={j.type} />{j.shifted && <span className="rounded-md bg-[#fbf0ec] px-2 py-0.5 text-[11px] font-semibold text-[#8a4636]">Moved to the next open month</span>}{j.sole && <span className="rounded-md bg-[#f1f2f2] px-2 py-0.5 text-[11px] font-semibold text-[#5b6b7b]">Approved by the only administrator</span>}</div>
          <Dl items={[['Date', `${day(j.date)} (${ymName(j.ym)})`], ['Reference', j.reference], ['Prepared by', j.preparedByName], ['Decided by', j.decidedByName ? `${j.decidedByName}${j.decidedAt ? ` · ${day(j.decidedAt)}` : ''}` : ''], j.reversalOfNo && ['Reverses', j.reversalOfNo], j.reversedByNo && ['Reversed by', j.reversedByNo], j.decisionNote && ['Note', j.decisionNote]]} />
          <Table label="Journal lines" head={['Account', 'Fund', 'Note', 'Debit', 'Credit']} min={560}>{j.lines.map((l, i) => <tr key={i}><Td>{l.code} · {l.name}</Td><Td>{l.fundName || ''}</Td><Td className="text-xs">{l.memo}</Td><Td className="text-end"><Num v={l.debit} /></Td><Td className="text-end"><Num v={l.credit} /></Td></tr>)}
            <tr><Td className="font-bold" >Total</Td><Td /><Td /><Td className="text-end"><Num v={j.totalDebit} bold /></Td><Td className="text-end"><Num v={j.totalCredit} bold /></Td></tr></Table>
          {(j.warnings || []).length > 0 && <Note tone="warn"><ul className="list-disc ps-5">{j.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Note>}
          {j.status === 'posted' && j.hash && <p className="text-xs text-[#5b6b7b]">Fingerprint <span className="font-mono">{j.hash}</span>. If any line is altered outside the system, the check in “Chart and rules” finds it.</p>}
          <details><summary className="cursor-pointer text-xs font-semibold text-[#2a5cac]">History</summary><div className="mt-2"><Trail rows={j.trail} /></div></details>
          <div className="flex flex-wrap justify-end gap-2">
            {j.sourceType && <button className={btnGhost} onClick={async () => { try { const r = await apiClient.get(`/accounts/trace/${j.sourceType}/${j.sourceId}`); setSrc(r.data); } catch (e) { toast.error(errMsg(e)); } }}>Where it came from</button>}
            {t.prepare && (j.status === 'draft' || j.status === 'rejected') && j.type !== 'system' && <><button className={btnGhost} onClick={() => edit(j)}>Change</button>{j.status === 'draft' && <button className={btnDanger} onClick={() => act(() => apiClient.delete(`/accounts/journals/${j._id}`), 'Deleted.').then(onClose)}>Delete</button>}<button className={btnPrimary} onClick={() => act(() => apiClient.post(`/accounts/journals/${j._id}/submit`, {}), 'Sent for approval.')}>Send for approval</button></>}
            {t.approve && j.status === 'submitted' && <><button className={btnGhost} onClick={() => setAsk('reject')}>Return it</button><button className={btnPrimary} onClick={() => act(() => apiClient.post(`/accounts/journals/${j._id}/decide`, { decision: 'approve' }), 'Posted.')}>Approve and post</button></>}
            {t.prepare && j.status === 'posted' && j.type !== 'system' && !j.reversedBy && j.type !== 'reversal' && <button className={btnDanger} onClick={() => setAsk('reverse')}>Reverse it</button>}
          </div>
        </div>)}</Loading>
      {ask === 'reject' && <Reason title="Return this journal" text="The person who prepared it will see your reason and can correct it." confirm="Return it" min={5} label="What needs fixing" onClose={() => setAsk(null)} onDone={async (note) => { await apiClient.post(`/accounts/journals/${id}/decide`, { decision: 'reject', note }); setAsk(null); toast.success('Returned.'); g.reload(); onChanged(); }} />}
      {ask === 'reverse' && <Reason title="Reverse this journal" text="This makes a new journal with every line the other way round, dated today. It must be approved by someone else. The original stays in the books." confirm="Ask for the reversal" min={5} label="Why is it being reversed" onClose={() => setAsk(null)} onDone={async (reason) => { await apiClient.post(`/accounts/journals/${id}/reverse`, { reason }); setAsk(null); toast.success('Reversal sent for approval.'); g.reload(); onChanged(); }} />}
      {src && <Modal title="Where this came from" onClose={() => setSrc(null)}><Dl items={[['Record', src.source?.refNo || src.source?.refId], ['Kind', src.source?.kind?.replace(/_/g, ' ')], ['Changes posted', (src.journals || []).length]]} /><ul className="mt-2 space-y-1 text-sm">{(src.journals || []).map((x) => <li key={x._id}>{x.number} · {day(x.date)} · {x.memo}</li>)}</ul></Modal>}
    </Modal>
  );
}

export default function Journals({ t, seed }) {
  const [status, setStatus] = useState(seed?.status || ''); const [type, setType] = useState(''); const [month, setMonth] = useState(''); const [q, setQ] = useState(''); const dq = useDebounced(q); const [page, setPage] = useState(1);
  const g = useGet('/accounts/journals', { status: status || undefined, type: type || undefined, ym: month || undefined, q: dq || undefined, page, limit: 25 });
  const [form, setForm] = useState(null); const [open, setOpen] = useState(seed?.open || null);
  useEffect(() => { setPage(1); }, [status, type, month, dq]);
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3">
        <Field label="State"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="draft">Drafts</option><option value="submitted">Waiting for approval</option><option value="rejected">Returned</option><option value="posted">In the books</option></select></Field>
        <Field label="Kind"><select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}><option value="">All kinds</option><option value="manual">Journals</option><option value="adjusting">Adjustments</option><option value="opening">Opening balances</option><option value="system">Automatic</option><option value="reversal">Reversals</option></select></Field>
        <Field label="Month"><input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label="Search"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, words or reference" /></Field>
        {t.prepare && <button className={btnPrimary} onClick={() => setForm({})}>New journal</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No journals" text="Fees, payments, pay runs and bills post by themselves. Add a journal for anything else, such as opening balances, donations or corrections." /></Card> : <>
        <Table label="Journals" head={['Number', 'Date', 'What', 'Kind', 'Amount', 'State', '']} min={760}>{g.data.rows.map((j) => (
          <tr key={j._id}><Td className="font-mono text-xs">{j.number}</Td><Td className="text-xs">{day(j.date)}</Td><Td>{j.memo}{j.reference ? <div className="text-xs text-[#5b6b7b]">{j.reference}</div> : null}</Td><Td><ABadge k="type" s={j.type} /></Td><Td className="text-end"><Num v={j.totalDebit} /></Td><Td><ABadge k="journal" s={j.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(j._id)} aria-label={`Open ${j.number}`}>Open</button></Td></tr>))}</Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} /></>)}</Loading>
      {form && <JournalForm existing={form._id ? form : null} onClose={() => setForm(null)} onDone={(j) => { setForm(null); g.reload(); setOpen(j._id); }} />}
      {open && <JournalView id={open} t={t} onClose={() => setOpen(null)} onChanged={g.reload} edit={(j) => { setOpen(null); setForm(j); }} />}
    </div>
  );
}
