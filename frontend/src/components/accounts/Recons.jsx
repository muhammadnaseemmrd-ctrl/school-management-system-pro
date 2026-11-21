import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, ABadge, Num, Dl, ymName, ym, useChart, money, day } from './acKit';

const KINDS = [['deposit_in_transit', 'Money banked but not on the statement yet'], ['outstanding_payment', 'Cheque or payment not cleared yet'], ['bank_error', 'Bank’s mistake'], ['not_in_books', 'On the statement but not in the books'], ['other', 'Something else']];

function ReconForm({ recon, onClose, onDone }) {
  const chart = useChart(); const banks = chart.filter((a) => a.bank && a.active);
  const [f, setF] = useState(() => ({ code: recon?.code || '', ym: recon?.ym || ym(), statementBalance: recon ? recon.statementBalance : '', note: recon?.note || '', items: recon ? recon.items.map((i) => ({ ...i })) : [] }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [res, setRes] = useState(recon || null);
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const body = () => ({ code: f.code || banks[0]?.code, ym: f.ym, statementBalance: Number(f.statementBalance), note: f.note, items: f.items.map((i) => ({ kind: i.kind, text: i.text, amount: Number(i.amount) })) });
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const r = await apiClient.post('/accounts/recons', body()); setRes(r.data); toast.success(r.data.difference === 0 ? 'Saved. It agrees.' : `Saved. Still out by ${Math.abs(r.data.difference).toLocaleString('en-PK')}.`); onDone(false); } catch (x) { setErr(errMsg(x, 'Could not save.')); } finally { setBusy(false); } };
  return (
    <Modal title={recon ? `Reconciliation, ${recon.code}` : 'Reconcile a bank account'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-[#5b6b7b]">Enter the closing balance on the bank statement. The books’ balance is worked out for you. Anything that explains the difference goes below as an item. When the difference is nothing, someone else can sign it.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Account"><select className={inputCls} value={f.code || banks[0]?.code || ''} onChange={(e) => setF({ ...f, code: e.target.value })} disabled={!!recon}>{banks.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>
          <Field label="Month"><input type="month" className={inputCls} value={f.ym} onChange={(e) => setF({ ...f, ym: e.target.value })} disabled={!!recon} required /></Field>
          <Field label="Balance on the statement"><input type="number" step="1" className={inputCls} value={f.statementBalance} onChange={(e) => setF({ ...f, statementBalance: e.target.value })} required /></Field>
        </div>
        <div className="space-y-2" role="group" aria-label="Items that explain the difference">{f.items.map((i, k) => (
          <div key={k} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-[#e3e7e7] p-2">
            <div className="col-span-12 sm:col-span-4"><Field label={`Item ${k + 1}`}><select className={inputCls} value={i.kind} onChange={(e) => setItem(k, 'kind', e.target.value)}>{KINDS.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field></div>
            <div className="col-span-12 sm:col-span-4"><Field label="What it is"><input className={inputCls} value={i.text} onChange={(e) => setItem(k, 'text', e.target.value)} required minLength={2} maxLength={160} /></Field></div>
            <div className="col-span-8 sm:col-span-2"><Field label="Amount (+ or −)"><input type="number" step="1" className={inputCls} value={i.amount} onChange={(e) => setItem(k, 'amount', e.target.value)} required /></Field></div>
            <div className="col-span-4 sm:col-span-2"><button type="button" className={`${btnDanger} !px-2 !py-2 !text-xs`} onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== k) })} aria-label={`Remove item ${k + 1}`}>Remove</button></div>
          </div>))}</div>
        <button type="button" className={btnGhost} onClick={() => setF({ ...f, items: [...f.items, { kind: 'deposit_in_transit', text: '', amount: '' }] })}>Add an item</button>
        <Field label="Note"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
        {res && <Note tone={res.difference === 0 ? 'good' : 'warn'}>The books say {money(res.ledgerBalance)}; the statement says {money(res.statementBalance)}; the items add {money(res.explained)}. {res.difference === 0 ? 'It agrees.' : `Still out by ${money(Math.abs(res.difference))}.`}</Note>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => onDone(true)}>Close</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save and work it out'}</button></div>
      </form>
    </Modal>
  );
}

export default function Recons({ t }) {
  const [month, setMonth] = useState(''); const g = useGet('/accounts/recons', { ym: month || undefined }); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null); const [view, setView] = useState(null);
  const sign = async (r) => { try { await apiClient.post(`/accounts/recons/${r._id}/sign`, {}); toast.success('Signed.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end justify-between gap-3"><Field label="Month"><input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>{t.prepare && <button className={btnPrimary} onClick={() => setForm({})}>Reconcile an account</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="Nothing reconciled yet" text="Check each bank account against its statement at the end of the month. If the settings ask for it, a month cannot close until every account is signed." /></Card> :
        <Table label="Bank reconciliations" head={['Month', 'Account', 'Books', 'Statement', 'Difference', 'State', '']} min={760}>{g.data.rows.map((r) => (
          <tr key={r._id}><Td>{ymName(r.ym)}</Td><Td>{r.code}</Td><Td className="text-end"><Num v={r.ledgerBalance} /></Td><Td className="text-end"><Num v={r.statementBalance} /></Td><Td className="text-end"><Num v={r.difference} neg /></Td><Td><ABadge k="recon" s={r.status} />{r.signedByName && <div className="text-xs text-[#5b6b7b]">{r.signedByName}</div>}</Td>
            <Td><span className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => (r.status === 'draft' && t.prepare ? setForm(r) : setView(r))} aria-label={`Open ${r.code} ${ymName(r.ym)}`}>Open</button>{t.approve && r.status === 'draft' && r.difference === 0 && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => sign(r)}>Sign</button>}{t.admin && r.status === 'signed' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(r)}>Reopen</button>}</span></Td></tr>))}</Table>)}</Loading>
      {form && <ReconForm recon={form._id ? form : null} onClose={() => setForm(null)} onDone={(close) => { g.reload(); if (close) setForm(null); }} />}
      {view && <Modal title={`${view.code} · ${ymName(view.ym)}`} onClose={() => setView(null)} wide><Dl items={[['Books', money(view.ledgerBalance)], ['Statement', money(view.statementBalance)], ['Items', money(view.explained)], ['Difference', money(view.difference)], ['Prepared by', view.preparedByName], ['Signed by', view.signedByName ? `${view.signedByName}${view.signedAt ? ` · ${day(view.signedAt)}` : ''}` : '']]} />{view.items.length > 0 && <Table label="Items" head={['What', 'Amount']} min={360}>{view.items.map((i, k) => <tr key={k}><Td>{i.text}</Td><Td className="text-end"><Num v={i.amount} neg /></Td></tr>)}</Table>}</Modal>}
      {ask && <Reason title={`Reopen ${ask.code} · ${ymName(ask.ym)}`} text="A signed reconciliation can be reopened while its month is still open." confirm="Reopen" min={5} onClose={() => setAsk(null)} onDone={async (reason) => { await apiClient.post(`/accounts/recons/${ask._id}/reopen`, { reason }); setAsk(null); toast.success('Reopened.'); g.reload(); }} />}
    </div>
  );
}
