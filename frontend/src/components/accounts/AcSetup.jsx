import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Num, KIND_WORD, day, dt, money } from './acKit';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SetupForm({ onDone }) {
  const [f, setF] = useState({ startDate: `${new Date().getFullYear()}-01-01`, fiscalStartMonth: 7 }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/accounts/setup', { startDate: f.startDate, fiscalStartMonth: Number(f.fiscalStartMonth) }); toast.success('The ledger is ready.'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not set up the ledger.')); setBusy(false); } };
  return (
    <Card><form onSubmit={go} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="text-base font-bold text-[#1b2837]">Set up the school ledger</h3><p className="text-sm text-[#5b6b7b]">This makes the chart of accounts and starts the books. Fees, payments, pay runs, bills and store sales dated before the start date are not posted; enter them as opening balances in a journal. These two choices cannot be changed after the first entry is posted.</p></div>
      <Field label="The books start on"><input type="date" className={inputCls} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required /></Field>
      <Field label="The financial year starts in"><select className={inputCls} value={f.fiscalStartMonth} onChange={(e) => setF({ ...f, fiscalStartMonth: e.target.value })}>{MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
      {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Setting up…' : 'Set up the ledger'}</button></div>
    </form></Card>
  );
}

function AccountForm({ account, onClose, onDone }) {
  const [f, setF] = useState(() => ({ code: account?.code || '', name: account?.name || '', kind: account?.kind || 'expense', group: account?.group || '', bank: !!account?.bank, active: account ? account.active : true }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { if (account) await apiClient.patch(`/accounts/accounts/${account.id}`, { name: f.name, group: f.group, bank: f.bank, active: f.active }); else await apiClient.post('/accounts/accounts', f); toast.success('Saved.'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save.')); setBusy(false); } };
  return (
    <Modal title={account ? `${account.code} · ${account.name}` : 'New account'} onClose={onClose}>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" hint="2 to 12 letters or numbers"><input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required disabled={!!account} /></Field>
        <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} disabled={!!account}>{Object.entries(KIND_WORD).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={100} /></Field></div>
        <Field label="Group in reports"><input className={inputCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} maxLength={60} /></Field>
        {f.kind === 'asset' && <Field label="Bank or wallet"><span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.bank} onChange={(e) => setF({ ...f, bank: e.target.checked })} /> It has a statement to reconcile</span></Field>}
        {account && <Field label="In use"><span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Can be posted to</span></Field>}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function Rules({ g, admin }) {
  const d = g.data; const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const start = () => setF({ budgetControl: d.settings.budgetControl, requireReconciliation: !!d.settings.requireReconciliation, map: { ...d.settings.map }, reason: '' });
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.put('/accounts/settings', { reason: f.reason, settings: { budgetControl: f.budgetControl, requireReconciliation: f.requireReconciliation, map: f.map } }); toast.success('Rules saved as a new version.'); setF(null); g.reload(); } catch (x) { setErr(errMsg(x, 'Could not save.')); } finally { setBusy(false); } };
  const word = { off: 'Off: budgets are reports only', warn: 'Warn: say so, but allow it', block: 'Block: refuse journals that go over' };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-start justify-between gap-3"><div className="text-sm text-[#3b4a5c]"><p>Books start {day(d.settings.startDate)}; the financial year starts in {MONTH_NAMES[d.settings.fiscalStartMonth - 1]}.</p><p>Going over a budget: <b>{word[d.settings.budgetControl]}</b>. A signed bank reconciliation is {d.settings.requireReconciliation ? 'needed' : 'not needed'} before a month closes.</p></div>{admin && !f && <button className={btnGhost} onClick={start}>Change the rules</button>}</div></Card>
      {f && <Card><form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="When spending goes over budget"><select className={inputCls} value={f.budgetControl} onChange={(e) => setF({ ...f, budgetControl: e.target.value })}>{Object.entries(word).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
        <Field label="Bank reconciliation"><span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requireReconciliation} onChange={(e) => setF({ ...f, requireReconciliation: e.target.checked })} /> Needed before a month can close</span></Field>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Which account each automatic posting uses</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(d.labels).map(([k, label]) => <Field key={k} label={label}><select className={inputCls} value={f.map[k] || ''} onChange={(e) => setF({ ...f, map: { ...f.map, [k]: e.target.value } })}>{d.accounts.filter((a) => a.kind === d.kinds[k]).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>)}</div></fieldset>
        <div className="sm:col-span-2"><Field label="Why are you changing the rules? (kept in the record)"><textarea className={inputCls} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={5} /></Field></div>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={() => setF(null)}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the rules'}</button></div></form></Card>}
      <details className="rounded-xl border border-[#e3e7e7] bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-[#2a5cac]">History of the rules ({d.history.length})</summary><ol className="mt-2 space-y-1 text-xs text-[#3b4a5c]">{d.history.map((h) => <li key={h.version}><b>Version {h.version}</b> · {h.byName || 'System'} · {dt(h.at)} — {h.reason}</li>)}</ol></details>
    </div>
  );
}

export default function AcSetup({ t }) {
  const st = useGet('/accounts/settings'); const ch = useGet(st.data?.ready ? '/accounts/accounts' : '/accounts/access'); const [form, setForm] = useState(null); const [chk, setChk] = useState(null); const [busy, setBusy] = useState(false); const [sug, setSug] = useState(null);
  const reloadAll = () => { st.reload(); ch.reload(); };
  const check = async (sweep) => { setBusy(true); try { const r = sweep ? await apiClient.post('/accounts/sweep', {}) : await apiClient.get('/accounts/check'); setChk(sweep ? { ...r.data.check, swept: r.data } : r.data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const opening = async () => { try { const r = await apiClient.get('/accounts/opening-suggestion'); setSug(r.data); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Loading g={st}>{st.data && (!st.data.ready ? (t.admin ? <SetupForm onDone={reloadAll} /> : <Card><p className="text-sm text-[#3b4a5c]">The ledger has not been set up yet. Ask an administrator.</p></Card>) : (
      <div className="space-y-4">
        <Rules g={st} admin={t.admin} />
        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#1b2837]">Is everything in order?</h3><p className="text-sm text-[#5b6b7b]">Checks that every journal balances and that no posted line has been changed outside the system.</p></div><span className="flex gap-2"><button className={btnGhost} onClick={() => check(false)} disabled={busy}>Check the books</button>{t.admin && <button className={btnGhost} onClick={() => check(true)} disabled={busy}>Re-check all records</button>}</span></div>
          {chk && <div className="mt-3">{chk.ok ? <Note tone="good">The books check out: {chk.lines} lines, debits equal credits, and nothing has been altered.</Note> : <Note tone="warn"><b>Problems found:</b><ul className="list-disc ps-5">{chk.problems.slice(0, 20).map((p, i) => <li key={i}>{p.text || p.kind}</li>)}</ul></Note>}{chk.swept && <p className="mt-1 text-xs text-[#5b6b7b]">{chk.swept.scanned} records checked, {chk.swept.posted + chk.swept.changed} postings made.</p>}</div>}</Card>
        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#1b2837]">Opening balances</h3><p className="text-sm text-[#5b6b7b]">Anything owed to or by the school before {day(st.data.settings.startDate)} is entered once as an opening-balance journal.</p></div>{t.prepare && <button className={btnGhost} onClick={opening}>What was open before the start?</button>}</div>{sug && <Note tone="info">Fee invoices from before the start still had {money(sug.feeReceivable)} unpaid. {sug.note}</Note>}</Card>
        <Loading g={ch}>{ch.data?.accounts && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-[#1b2837]">Chart of accounts</h3>{t.prepare && <button className={btnPrimary} onClick={() => setForm({})}>New account</button>}</div>
          {Object.entries(KIND_WORD).map(([k, label]) => { const rows = ch.data.accounts.filter((a) => a.kind === k); return rows.length ? (
            <Table key={k} label={label} head={[label, 'Group', 'Balance', '']} min={560}>{rows.map((a) => <tr key={a.code}><Td>{a.code} · {a.name}{!a.active && <span className="ms-2 rounded-md bg-[#f1f2f2] px-1.5 text-[11px] text-[#5b6b7b]">Switched off</span>}{a.bank && <span className="ms-2 rounded-md bg-[#eef2f8] px-1.5 text-[11px] text-[#234c91]">Bank</span>}</Td><Td className="text-xs">{a.group}</Td><Td className="text-end"><Num v={a.balance} neg /></Td><Td>{t.prepare && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setForm(a)} aria-label={`Change ${a.code}`}>Change</button>}</Td></tr>)}</Table>) : null; })}</>}</Loading>
        {form && <AccountForm account={form.id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); ch.reload(); }} />}
      </div>))}</Loading>
  );
}
