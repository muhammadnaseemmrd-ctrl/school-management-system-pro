import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, btnGhost, btnPrimary, errMsg } from '../ui';
import { useGet, Loading, Note, Stat, money, dt, ymName } from './acKit';

export default function Overview({ t, go }) {
  const g = useGet('/accounts/overview'); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { const r = await apiClient.post('/accounts/feeds/run', {}); toast.success(r.data.posted + r.data.changed ? `${r.data.posted} new and ${r.data.changed} changed postings made.` : 'Everything is already posted.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Loading g={g}>{g.data && (!g.data.ready ? <Card><p className="text-sm text-[#3b4a5c]">The school ledger has not been set up yet.{t.admin ? ' Open “Chart and rules” to choose the date the books start.' : ' Ask an administrator to set it up.'}</p>{t.admin && <button className={`${btnPrimary} mt-3`} onClick={() => go('setup')}>Set up the ledger</button>}</Card> : (() => {
      const o = g.data; const w = [];
      if (o.submitted) w.push(`${o.submitted} journal${o.submitted === 1 ? ' is' : 's are'} waiting for approval.`);
      if (o.rejected) w.push(`${o.rejected} returned journal${o.rejected === 1 ? '' : 's'} need${o.rejected === 1 ? 's' : ''} correcting.`);
      if (o.feed?.heldCount) w.push(`${o.feed.heldCount} automatic posting${o.feed.heldCount === 1 ? ' is' : 's are'} on hold.`);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Cash and bank" value={money(o.cash)} tone={o.cash < 0 ? 'bad' : ''} />
            <Stat label="Fees still to collect" value={money(o.feeReceivable)} sub={o.feeAdvance ? `${money(o.feeAdvance)} paid in advance` : ''} />
            <Stat label="Owed to suppliers" value={money(o.suppliersOwed)} sub={o.salariesOwed ? `${money(o.salariesOwed)} salaries to pay` : ''} />
            <Stat label={`Surplus, ${o.fy}`} value={money(o.yearIncome - o.yearExpense)} sub={`${money(o.yearIncome)} in, ${money(o.yearExpense)} out`} tone={o.yearIncome - o.yearExpense < 0 ? 'bad' : ''} />
          </div>
          {w.length > 0 && <Note tone="warn"><ul className="list-disc ps-5">{w.map((x) => <li key={x}>{x}</li>)}</ul></Note>}
          <div className="grid gap-3 md:grid-cols-2">
            <Card><h3 className="text-sm font-bold text-[#1b2837]">Months</h3><p className="mt-1 text-sm text-[#3b4a5c]">{o.closedThrough ? `Closed through ${ymName(o.closedThrough)}.` : 'No month has been closed yet.'} The books started on {o.startDate}.</p>{o.openReconciliations > 0 && <p className="mt-1 text-sm text-[#8a4636]">{o.openReconciliations} bank reconciliation{o.openReconciliations === 1 ? '' : 's'} not signed yet.</p>}<button className={`${btnGhost} mt-3`} onClick={() => go('months')}>Open the months</button></Card>
            <Card><h3 className="text-sm font-bold text-[#1b2837]">Automatic postings</h3><p className="mt-1 text-sm text-[#3b4a5c]">Fees, payments, pay runs, supplier bills and store sales post themselves. {o.feed?.lastRunAt ? `Last checked ${dt(o.feed.lastRunAt)}.` : 'Not checked yet.'}{o.feed?.last ? ` ${o.feed.last.scanned} records looked at.` : ''}</p>
              {o.feed?.held?.length > 0 && <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-[#8a4636]">{o.feed.held.slice(0, 5).map((h, i) => <li key={i}>{h.text}</li>)}</ul>}
              {t.approve && <button className={`${btnGhost} mt-3`} onClick={run} disabled={busy}>{busy ? 'Checking…' : 'Check now'}</button>}</Card>
          </div>
          {o.restrictedFunds > 0 && <Card><p className="text-sm text-[#3b4a5c]">{o.restrictedFunds} restricted fund{o.restrictedFunds === 1 ? '' : 's'} or grant{o.restrictedFunds === 1 ? '' : 's'} in use. <button className="font-semibold text-[#2a5cac] underline" onClick={() => go('funds')}>See them</button></p></Card>}
        </div>
      );
    })())}</Loading>
  );
}
