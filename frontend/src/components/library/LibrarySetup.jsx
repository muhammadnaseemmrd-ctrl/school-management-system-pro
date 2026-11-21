import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Stat, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { Table, Td, Note, useGet, Loading, money, dt } from './libKit';
import { StoreSettings } from './StoreOffice';

const ROLES = [['student', 'Students'], ['teacher', 'Teachers'], ['staff', 'Staff']];
export function Policy() {
  const g = useGet('/library/policy'); const [p, setP] = useState(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (g.data) setP(JSON.parse(JSON.stringify(g.data.policy))); }, [g.data]);
  const num = (path, v) => setP((x) => { const n = JSON.parse(JSON.stringify(x)); const [a, b] = path.split('.'); if (b) n[a][b] = v; else n[a] = v; return n; });
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.put('/library/policy', { policy: p, reason }); toast.success('Rules saved as a new version.'); setReason(''); g.reload(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return (
    <Loading g={g}>{g.data && p && (
      <div className="space-y-3">
        <Card>
          <h3 className="mb-1 font-semibold text-[#1b2837]">Library rules (version {g.data.version})</h3>
          <p className="mb-3 text-sm text-[#5b6b7b]">Fines and limits come from these rules and nothing else. Each charge remembers the version it was made under, so changing the rules never changes an old charge.</p>
          <form onSubmit={save} className="space-y-4">
            <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-1 text-sm font-semibold text-[#1b2837]">Days a book can be kept, and books at once</legend>
              {ROLES.map(([k, l]) => <div key={k} className="grid gap-2 rounded-xl border border-[#e3e7e7] p-3"><p className="text-sm font-semibold">{l}</p><Field label="Days"><input className={inputCls} type="number" min="1" max="365" value={p.loanDays[k]} onChange={(e) => num(`loanDays.${k}`, e.target.value)} /></Field><Field label="Books at once"><input className={inputCls} type="number" min="1" max="100" value={p.maxLoans[k]} onChange={(e) => num(`maxLoans.${k}`, e.target.value)} /></Field></div>)}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              {[['maxRenewals', 'Renewals allowed'], ['graceDays', 'Grace days before a fine'], ['finePerDay', 'Fine for each late day (Rs)'], ['fineCap', 'Most a late fine can be (Rs)'], ['blockAtFines', 'Stop new loans when unpaid fines reach (Rs)'], ['holdDays', 'Days a reserved book is held'], ['reminderDaysBefore', 'Remind this many days before the due date'], ['lostPercent', 'Lost book: percent of the price'], ['lostProcessingFee', 'Lost book: handling fee (Rs)'], ['lostDefaultPrice', 'Price to use when a book has none (Rs)']].map(([k, l]) => <Field key={k} label={l}><input className={inputCls} type="number" min="0" value={p[k]} onChange={(e) => num(k, e.target.value)} /></Field>)}
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-1 text-sm font-semibold text-[#1b2837]">Charge for damage (percent of the price)</legend>
              {[['minor', 'Minor damage'], ['major', 'Major damage'], ['destroyed', 'Destroyed']].map(([k, l]) => <Field key={k} label={l}><input className={inputCls} type="number" min="0" max="300" value={p.damagePercent[k]} onChange={(e) => num(`damagePercent.${k}`, e.target.value)} /></Field>)}</fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.blockWhenOverdue} onChange={(e) => num('blockWhenOverdue', e.target.checked)} /> A person with an overdue book cannot borrow another</label>
            <Field label="Why are the rules changing?" hint="Kept with the version."><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} /></Field>
            {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
            <button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save as a new version'}</button>
          </form>
        </Card>
        <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Earlier versions</h3><Table label="Rule versions" head={['Version', 'When', 'By', 'Why']} min={520}>{g.data.history.map((h) => <tr key={h.version}><Td>{h.version}</Td><Td>{dt(h.at)}</Td><Td>{h.byName}</Td><Td>{h.reason}</Td></tr>)}</Table></Card>
      </div>
    )}</Loading>
  );
}

export function Setup() {
  const [busy, setBusy] = useState(false);
  const sweep = async () => { setBusy(true); try { const r = await apiClient.post('/library/sweep', {}); toast.success(`${r.data.library.reminded} reminders, ${r.data.library.overdue} overdue notices, ${r.data.library.expired} reservations released, ${r.data.orders} store orders released.`); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <div className="space-y-4">
      <Policy />
      <StoreSettings />
      <Card><h3 className="mb-1 font-semibold text-[#1b2837]">Daily tidy-up</h3><p className="mb-3 text-sm text-[#5b6b7b]">Every night the system sends due and overdue reminders, releases reservations and store pickups nobody collected, and warns about low stock. You can run it now.</p><button className={btnGhost} onClick={sweep} disabled={busy}>{busy ? 'Running…' : 'Run it now'}</button></Card>
    </div>
  );
}
