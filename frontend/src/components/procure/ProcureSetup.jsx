import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, btnPrimary, inputCls, errMsg } from '../ui';
import { Table, Td, useGet, Loading, dt } from './pcKit';

const NUMS = [['singleApprovalLimit', 'One approver is enough up to (Rs)', 'Above this, two different administrators must approve a request.'], ['quoteThreshold', 'Ask for quotes from (Rs)', 'A request at or above this needs written quotes.'], ['minQuotes', 'Quotes needed', 'Between 1 and 5.'], ['tolerancePercent', 'Tolerance on orders and bills (%)', 'How far a bill or an order may differ from what was approved or received.'], ['capitalizationThreshold', 'Count as an asset from (Rs)', 'Cheaper items are not put on the asset register by default.'], ['fiscalYearStartMonth', 'Budget year starts in month', '1 is January. 7 is July.']];
export default function ProcureSetup() {
  const g = useGet('/procure/settings'); const [s, setS] = useState(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (g.data) setS({ ...g.data.settings, costCentres: g.data.settings.costCentres.join(', '), categories: g.data.settings.categories.join(', ') }); }, [g.data]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const body = { ...s, costCentres: s.costCentres.split(',').map((x) => x.trim()).filter(Boolean), categories: s.categories.split(',').map((x) => x.trim()).filter(Boolean) }; await apiClient.put('/procure/settings', { settings: body, reason }); toast.success('Saved as a new version.'); setReason(''); g.reload(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Loading g={g}>{g.data && s && (
      <div className="space-y-3">
        <Card><h3 className="mb-1 font-semibold text-[#1b2837]">Purchasing rules (version {g.data.version})</h3>
          <p className="mb-3 text-sm text-[#5b6b7b]">These limits decide who must approve a request, when quotes are needed and how closely a bill must match the order. A request remembers the rules it was raised under.</p>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">{NUMS.map(([k, l, h]) => <Field key={k} label={l} hint={h}><input className={inputCls} type="number" step={k === 'tolerancePercent' ? '0.1' : '1'} min="0" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></Field>)}</div>
            <Field label="Cost centres" hint="Separate with commas."><input className={inputCls} value={s.costCentres} onChange={(e) => setS({ ...s, costCentres: e.target.value })} /></Field>
            <Field label="Spending categories" hint="Separate with commas."><input className={inputCls} value={s.categories} onChange={(e) => setS({ ...s, categories: e.target.value })} /></Field>
            <Field label="Why are the rules changing?" hint="Kept with the version."><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} /></Field>
            {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
            <button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save as a new version'}</button>
          </form></Card>
        <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Earlier versions</h3><Table label="Rule versions" head={['Version', 'When', 'By', 'Why']} min={520}>{g.data.history.slice().reverse().map((h) => <tr key={h.version}><Td>{h.version}</Td><Td>{dt(h.at)}</Td><Td>{h.byName}</Td><Td>{h.reason}</Td></tr>)}</Table></Card>
      </div>)}</Loading>
  );
}
