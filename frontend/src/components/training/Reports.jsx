import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Stat, Field, btnPrimary, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, money, day } from './tkit';
import { toast } from 'react-hot-toast';

export function Reports() {
  const [days, setDays] = useState(90); const g = useGet('/training/reports', { days }); const d = g.data;
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2"><Field label="Period"><select className={inputCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[30, 90, 180, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select></Field></div>
      <Loading g={g}>{d && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Net received" value={money(d.totals.net)} sub={`${money(d.totals.paid)} paid, ${money(d.totals.refunded)} refunded`} /><Stat label="Orders" value={d.orders} sub={`${d.paidOrders} paid · ${d.conversion}% reached payment`} /><Stat label="Finished courses" value={`${d.completionRate}%`} sub="of access given in this period" /><Stat label="Refund rate" value={`${d.refundRate}%`} sub={`${money(d.totals.discount)} given in discounts`} /></div>
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">By course</h3>{d.byCourse.length === 0 ? <p className="text-sm text-[#5b6b7b]">No orders in this period.</p> : <Table label="Sales by course" head={['Course or bundle', 'Orders', 'Paid', 'Refunded', 'Net', 'Discounts']} min={640}>{d.byCourse.map((r) => <tr key={r.key}><Td>{r.title}</Td><Td>{r.orders}</Td><Td>{money(r.paid)}</Td><Td>{money(r.refunded)}</Td><Td className="font-semibold">{money(r.net)}</Td><Td>{money(r.discount)}</Td></tr>)}</Table>}</Card>
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Where buyers came from</h3>{d.bySource.length === 0 ? <p className="text-sm text-[#5b6b7b]">No codes were used in this period.</p> : <Table label="Sales by source" head={['Source', 'Orders', 'Discount given']} min={420}>{d.bySource.map((r) => <tr key={r.source}><Td>{r.source}</Td><Td>{r.orders}</Td><Td>{money(r.discount)}</Td></tr>)}</Table>}</Card>
          <Note>Amounts come from confirmed payments and recorded refunds only. Learners' progress is counted from reviewed work, not from clicks.</Note>
        </>
      )}</Loading>
    </div>
  );
}

export function TrainingSettings({ onSaved }) {
  const g = useGet('/training/settings'); const s = g.data;
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  React.useEffect(() => { if (s) setF({ currency: s.currency, paymentInstructions: s.paymentInstructions || '', graceDays: s.graceDays, holdDays: s.holdDays, enabled: !!s.storefront?.enabled, headline: s.storefront?.headline || '', about: s.storefront?.about || '', taxPercent: s.taxPercent, taxLabel: s.taxLabel || '', refundDays: s.refundDays, jurisdiction: s.jurisdiction || '', reason: '' }); }, [s]);
  if (!f) return <Loading g={g}>{null}</Loading>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const policyChanged = Number(f.taxPercent) !== s.taxPercent || f.taxLabel !== (s.taxLabel || '') || Number(f.refundDays) !== s.refundDays || f.jurisdiction !== (s.jurisdiction || '');
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await apiClient.put('/training/settings', { currency: f.currency, paymentInstructions: f.paymentInstructions, graceDays: Number(f.graceDays), holdDays: Number(f.holdDays), storefront: { enabled: f.enabled, headline: f.headline, about: f.about }, taxPercent: Number(f.taxPercent), taxLabel: f.taxLabel, refundDays: Number(f.refundDays), jurisdiction: f.jurisdiction, reason: f.reason }); toast.success('Settings saved'); await g.reload(); onSaved && onSaved(); }
    catch (x) { setErr(errMsg(x, 'Could not save.')); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold text-[#1b2837] sm:col-span-2">Public course page</h3>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Show a public page where anyone can see and buy your courses</label>
        <Field label="Headline"><input className={inputCls} value={f.headline} onChange={set('headline')} maxLength={140} /></Field>
        <Field label="About your school (shown on the page)"><textarea className={inputCls} rows={2} value={f.about} onChange={set('about')} maxLength={1500} /></Field>
        <h3 className="mt-2 font-semibold text-[#1b2837] sm:col-span-2">Payments</h3>
        <div className="sm:col-span-2"><Field label="How to pay (shown to buyers after they order)" hint="Bank account, wallet number, office address. There is no online card payment here: a learner pays, sends the reference, and you confirm it."><textarea className={inputCls} rows={3} value={f.paymentInstructions} onChange={set('paymentInstructions')} maxLength={1000} /></Field></div>
        <Field label="Currency"><input className={inputCls} value={f.currency} onChange={set('currency')} maxLength={5} /></Field>
        <Field label="Days a late instalment is allowed before access pauses"><input className={inputCls} type="number" min="0" max="60" value={f.graceDays} onChange={set('graceDays')} /></Field>
        <Field label="Days an unpaid order holds a seat before it is cancelled"><input className={inputCls} type="number" min="1" max="60" value={f.holdDays} onChange={set('holdDays')} /></Field>
        <h3 className="mt-2 font-semibold text-[#1b2837] sm:col-span-2">Tax and refund terms (a numbered policy)</h3>
        <Field label="Tax (%) added on top of the price"><input className={inputCls} type="number" min="0" max="100" step="0.1" value={f.taxPercent} onChange={set('taxPercent')} /></Field>
        <Field label="Tax name on receipts"><input className={inputCls} value={f.taxLabel} onChange={set('taxLabel')} maxLength={40} /></Field>
        <Field label="Refund window (days)"><input className={inputCls} type="number" min="0" max="365" value={f.refundDays} onChange={set('refundDays')} /></Field>
        <Field label="Jurisdiction and terms note"><input className={inputCls} value={f.jurisdiction} onChange={set('jurisdiction')} maxLength={300} /></Field>
        {policyChanged && <div className="sm:col-span-2"><Field label="Why are the terms changing? (kept with the new version)"><textarea className={inputCls} rows={2} value={f.reason} onChange={set('reason')} required minLength={10} /></Field></div>}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the settings'}</button></div>
      </form>
      <Card>
        <h3 className="mb-1 font-semibold text-[#1b2837]">Policy versions</h3>
        <p className="mb-2 text-xs text-[#5b6b7b]">Each order keeps the version it was made under. Changing the terms never changes an order already placed.</p>
        <Table label="Policy versions" head={['Version', 'From', 'Tax', 'Refund window', 'Changed by', 'Reason']} min={680}>{[...s.policies].reverse().map((p) => <tr key={p.version}><Td>{p.version}{p.version === s.policyVersion ? ' (current)' : ''}</Td><Td>{day(p.effectiveFrom)}</Td><Td>{p.taxPercent}% {p.taxLabel}</Td><Td>{p.refundDays} days</Td><Td>{p.byName || '—'}</Td><Td className="text-xs">{p.note}</Td></tr>)}</Table>
      </Card>
    </div>
  );
}
