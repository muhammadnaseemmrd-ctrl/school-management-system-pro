import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, ABadge, Num, useChart, money, ym } from './acKit';

const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
function fyNow(start) { const d = new Date(); const y = d.getFullYear(); const m = d.getMonth() + 1; const s = Math.max(1, Math.min(12, Number(start) || 7)); const a = m >= s ? y : y - 1; return s === 1 ? String(a) : `${a}-${String(a + 1).slice(2)}`; }

function BudgetForm({ budget, settings, onClose, onDone }) {
  const chart = useChart(); const [fy, setFy] = useState(budget?.fy || fyNow(settings?.fiscalStartMonth)); const [note, setNote] = useState(budget?.note || '');
  const [rows, setRows] = useState(() => (budget ? budget.lines.map((l) => ({ code: l.code, annual: l.total, months: l.months, split: false })) : [{ code: '', annual: '', months: null, split: false }]));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const startM = Number(settings?.fiscalStartMonth) || 7; const labels = Array.from({ length: 12 }, (_, i) => MONTHS[(i + (startM - 7) + 12) % 12]);
  const by = useMemo(() => new Map(chart.map((a) => [a.code, a])), [chart]);
  const body = () => ({ fy, note, lines: rows.filter((r) => r.code).map((r) => (r.split ? { code: r.code, months: (r.months || new Array(12).fill(0)).map(Number) } : { code: r.code, annual: Number(r.annual) || 0 })) });
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { if (budget) await apiClient.put(`/accounts/budgets/${budget._id}`, body()); else await apiClient.post('/accounts/budgets', body()); toast.success('Budget saved as a draft.'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save the budget.')); setBusy(false); } };
  const inc = rows.reduce((s, r) => s + (by.get(r.code)?.kind === 'income' ? Number(r.split ? (r.months || []).reduce((a, b) => a + Number(b || 0), 0) : r.annual) || 0 : 0), 0); const exp = rows.reduce((s, r) => s + (by.get(r.code)?.kind === 'expense' ? Number(r.split ? (r.months || []).reduce((a, b) => a + Number(b || 0), 0) : r.annual) || 0 : 0), 0);
  return (
    <Modal title={budget ? `Budget ${budget.fy}, version ${budget.version}` : 'New budget'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Year" hint="Like 2026-27, or 2026 if the year starts in January"><input className={inputCls} value={fy} onChange={(e) => setFy(e.target.value)} required disabled={!!budget} /></Field><div className="sm:col-span-2"><Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field></div></div>
        <div className="space-y-2">{rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-[#e3e7e7] p-2">
            <div className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-6"><Field label={`Line ${i + 1} account`}><select className={inputCls} value={r.code} onChange={(e) => set(i, 'code', e.target.value)}><option value="">Choose an income or expense account</option>{chart.filter((a) => a.kind === 'income' || a.kind === 'expense').map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field></div>
              <div className="col-span-8 sm:col-span-3"><Field label="For the year"><input type="number" min="0" step="1" className={inputCls} value={r.split ? (r.months || []).reduce((a, b) => a + Number(b || 0), 0) : r.annual} onChange={(e) => set(i, 'annual', e.target.value)} disabled={r.split} /></Field></div>
              <div className="col-span-4 flex gap-1 sm:col-span-3"><button type="button" className={`${btnGhost} !px-2 !py-2 !text-xs`} onClick={() => set(i, 'split', !r.split)} aria-expanded={r.split}>{r.split ? 'Even split' : 'By month'}</button><button type="button" className={`${btnDanger} !px-2 !py-2 !text-xs`} onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove line ${i + 1}`}>Remove</button></div>
            </div>
            {r.split && <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">{labels.map((m, k) => <label key={m + k} className="text-xs text-[#5b6b7b]">{m}<input type="number" min="0" step="1" className={`${inputCls} !py-1.5`} value={(r.months || new Array(12).fill(0))[k]} onChange={(e) => { const ms = (r.months || new Array(12).fill(0)).slice(); ms[k] = e.target.value; set(i, 'months', ms); }} /></label>)}</div>}
          </div>))}</div>
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className={btnGhost} onClick={() => setRows([...rows, { code: '', annual: '', months: null, split: false }])}>Add a line</button><p className="text-sm font-semibold text-[#3b4a5c]">Income {inc.toLocaleString('en-PK')} · Expenses {exp.toLocaleString('en-PK')} · {inc - exp >= 0 ? 'Surplus' : 'Deficit'} {Math.abs(inc - exp).toLocaleString('en-PK')}</p></div>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save as draft'}</button></div>
      </form>
    </Modal>
  );
}

export default function Budgets({ t }) {
  const g = useGet('/accounts/budgets'); const st = useGet('/accounts/settings'); const [form, setForm] = useState(null); const [view, setView] = useState(null);
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-[#3b4a5c]">A budget is a plan for each income and expense account across the year. Someone with approval rights, who did not write it, approves it. A change is a new version, so what was agreed before is never lost. Budget control in “Chart and rules” decides whether going over only warns or stops a journal.</p>{t.prepare && <button className={btnPrimary} onClick={() => setForm({})}>New budget</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No budget yet" text="Start one for this year. Reports still work without it." /></Card> :
        <Table label="Budgets" head={['Year', 'Version', 'Income', 'Expenses', 'State', '']} min={680}>{g.data.rows.map((b) => (
          <tr key={b._id}><Td><b>{b.fy}</b>{b.note ? <div className="text-xs text-[#5b6b7b]">{b.note}</div> : null}</Td><Td>{b.version}</Td><Td className="text-end"><Num v={b.totalIncome} /></Td><Td className="text-end"><Num v={b.totalExpense} /></Td><Td><ABadge k="budget" s={b.status} />{b.approvedByName && <div className="text-xs text-[#5b6b7b]">{b.approvedByName}</div>}</Td>
            <Td><span className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setView(b)} aria-label={`Open ${b.fy} version ${b.version}`}>Open</button>
              {t.prepare && b.status === 'draft' && <><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setForm(b)}>Change</button><button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.delete(`/accounts/budgets/${b._id}`), 'Deleted.')}>Delete</button></>}
              {t.approve && b.status === 'draft' && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/accounts/budgets/${b._id}/approve`, {}), 'Approved.')}>Approve</button>}
              {t.prepare && b.status === 'approved' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post('/accounts/budgets', { fy: b.fy, copyFrom: b._id, note: 'New version' }), 'A new draft version was started.')}>New version</button>}</span></Td></tr>))}</Table>)}</Loading>
      {form && <BudgetForm budget={form._id ? form : null} settings={st.data?.settings} onClose={() => setForm(null)} onDone={() => { setForm(null); g.reload(); }} />}
      {view && <Modal title={`Budget ${view.fy}, version ${view.version}`} onClose={() => setView(null)} wide><Table label="Budget lines" head={['Account', 'For the year']} min={360}>{view.lines.map((l) => <tr key={l.code}><Td>{l.code}</Td><Td className="text-end"><Num v={l.total} /></Td></tr>)}</Table><p className="mt-2 text-xs text-[#5b6b7b]">Income {money(view.totalIncome)} · Expenses {money(view.totalExpense)}. See “Budget against actual” under Statements.</p></Modal>}
    </div>
  );
}
