import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, ABadge, Num, Dl, FUND_KIND, day, money, useChart } from './acKit';

function FundForm({ fund, onClose, onDone }) {
  const chart = useChart(); const [f, setF] = useState(() => ({ name: fund?.name || '', kind: fund?.kind || 'restricted', donor: fund?.donor || '', reference: fund?.reference || '', purpose: fund?.purpose || '', allowedCodes: fund?.allowedCodes || [], validFrom: fund?.validFrom || '', validTo: fund?.validTo || '', ceiling: fund?.ceiling || '', reason: '' }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const tog = (c) => setF({ ...f, allowedCodes: f.allowedCodes.includes(c) ? f.allowedCodes.filter((x) => x !== c) : [...f.allowedCodes, c] });
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const b = { ...f, ceiling: f.ceiling === '' ? 0 : Number(f.ceiling), validFrom: f.validFrom || undefined, validTo: f.validTo || undefined }; if (fund) await apiClient.patch(`/accounts/funds/${fund.id}`, b); else await apiClient.post('/accounts/funds', b); toast.success('Saved.'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save the fund.')); setBusy(false); } };
  const spendable = chart.filter((a) => a.kind === 'expense' || a.code === '1500');
  return (
    <Modal title={fund ? `Change ${fund.name}` : 'New fund or grant'} onClose={onClose} wide>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></Field>
        <Field label="Kind" hint="Restricted funds and grants can be spent only on what they allow."><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="unrestricted">General (no rules)</option><option value="restricted">Restricted</option><option value="grant">Grant</option></select></Field>
        <Field label="Donor or giver"><input className={inputCls} value={f.donor} onChange={(e) => setF({ ...f, donor: e.target.value })} maxLength={120} /></Field>
        <Field label="Agreement reference"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={80} /></Field>
        <div className="sm:col-span-2"><Field label="What it is for"><input className={inputCls} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} maxLength={300} /></Field></div>
        {f.kind !== 'unrestricted' && <>
          <Field label="Can be spent from"><input type="date" className={inputCls} value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
          <Field label="Can be spent until"><input type="date" className={inputCls} value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field>
          <Field label="Award, the most that may be spent (rupees; empty for no limit)"><input type="number" min="0" step="1" className={inputCls} value={f.ceiling} onChange={(e) => setF({ ...f, ceiling: e.target.value })} /></Field>
          <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">It may be spent on</legend><div className="flex flex-wrap gap-2">{spendable.map((a) => <label key={a.code} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${f.allowedCodes.includes(a.code) ? 'border-[#2a5cac] bg-[#eef2f8] font-semibold' : 'border-[#e3e7e7]'}`}><input type="checkbox" className="sr-only" checked={f.allowedCodes.includes(a.code)} onChange={() => tog(a.code)} />{a.code} · {a.name}</label>)}</div></fieldset></>}
        {fund && <div className="sm:col-span-2"><Field label="Why are you changing it? (kept in the record)"><textarea className={inputCls} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={5} /></Field></div>}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function FundView({ fund, onClose }) {
  const g = useGet(`/accounts/funds/${fund.id}/lines`);
  return (
    <Modal title={fund.name} onClose={onClose} wide>
      <div className="space-y-3">
        <Dl items={[['Kind', FUND_KIND[fund.kind]], ['Giver', fund.donor], ['Agreement', fund.reference], ['Purpose', fund.purpose], ['Window', fund.validFrom || fund.validTo ? `${fund.validFrom ? day(fund.validFrom) : 'any time'} to ${fund.validTo ? day(fund.validTo) : 'open'}` : ''], ['Award', fund.ceiling ? money(fund.ceiling) : 'No limit'], ['Received', money(fund.received)], ['Spent', money(fund.spent)]]} />
        {fund.spentBy.length > 0 && <><h3 className="text-sm font-bold text-[#1b2837]">What it paid for</h3><Table label="What it paid for" head={['Account', 'Spent']} min={320}>{fund.spentBy.map((r) => <tr key={r.code}><Td>{r.code} · {r.name}</Td><Td className="text-end"><Num v={r.amount} /></Td></tr>)}</Table></>}
        {fund.flags.length > 0 && <Note tone="warn"><b>Flagged against the rules:</b><ul className="list-disc ps-5">{fund.flags.map((x, i) => <li key={i}>{x.number}: {x.text}</li>)}</ul></Note>}
        <h3 className="text-sm font-bold text-[#1b2837]">Entries charged to this fund</h3>
        <Loading g={g}>{g.data && (g.data.rows.length ? <Table label="Entries" head={['Date', 'Journal', 'Account', 'Debit', 'Credit']} min={520}>{g.data.rows.map((r, i) => <tr key={i}><Td className="text-xs">{day(r.date)}</Td><Td className="font-mono text-xs">{r.journalNo}</Td><Td>{r.code}</Td><Td className="text-end"><Num v={r.debit} /></Td><Td className="text-end"><Num v={r.credit} /></Td></tr>)}</Table> : <p className="text-sm text-[#5b6b7b]">Nothing has been charged to it yet.</p>)}</Loading>
      </div>
    </Modal>
  );
}

export default function Funds({ t }) {
  const g = useGet('/accounts/funds'); const [form, setForm] = useState(null); const [open, setOpen] = useState(null); const [ask, setAsk] = useState(null);
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-[#3b4a5c]">A fund keeps money given for a purpose apart. Name it on income and expense lines and the system holds the spending to the giver’s rules: dates, accounts and the award. Purchasing grants appear here by themselves.</p>{t.approve && <button className={btnPrimary} onClick={() => setForm({})}>New fund or grant</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.funds.length === 0 ? <Card><EmptyState title="No funds yet" text="Everything is in the school’s general money until you make a fund." /></Card> :
        <Table label="Funds and grants" head={['Fund', 'Kind', 'Received', 'Spent', 'Left of the award', 'State', '']} min={820}>{g.data.funds.map((f) => (
          <tr key={f.id}><Td><b>{f.name}</b>{f.donor ? <div className="text-xs text-[#5b6b7b]">{f.donor}</div> : null}{f.flags.length > 0 && <div className="text-xs font-semibold text-[#8a4636]">{f.flags.length} flagged</div>}</Td><Td>{FUND_KIND[f.kind]}</Td><Td className="text-end"><Num v={f.received} /></Td><Td className="text-end"><Num v={f.spent} /></Td><Td className="text-end">{f.remainingCeiling == null ? 'No limit' : <Num v={f.remainingCeiling} />}</Td><Td><ABadge k="fund" s={f.status} /></Td>
            <Td><span className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(f)} aria-label={`Open ${f.name}`}>Open</button>{t.approve && !f.pcFundId && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setForm(f)} aria-label={`Change ${f.name}`}>Change</button>}{t.approve && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(f)} aria-label={`${f.status === 'active' ? 'Close' : 'Reopen'} ${f.name}`}>{f.status === 'active' ? 'Close' : 'Reopen'}</button>}</span></Td></tr>))}</Table>)}</Loading>
      {form && <FundForm fund={form.id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); g.reload(); }} />}
      {open && <FundView fund={open} onClose={() => setOpen(null)} />}
      {ask && <Reason title={`${ask.status === 'active' ? 'Close' : 'Reopen'} ${ask.name}`} text={ask.status === 'active' ? 'Nothing more can be charged to a closed fund.' : 'It can be charged again.'} confirm={ask.status === 'active' ? 'Close it' : 'Reopen it'} danger={ask.status === 'active'} min={5} onClose={() => setAsk(null)} onDone={async (reason) => { await apiClient.post(`/accounts/funds/${ask.id}/${ask.status === 'active' ? 'close' : 'reopen'}`, { reason }); setAsk(null); toast.success('Done.'); g.reload(); }} />}
    </div>
  );
}
