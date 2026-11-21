import React, { useState } from 'react';
import { Card, Stat, Pill } from '../ui';
import { useGet, Loading, Note, Tabs, money } from './pcKit';
import Requests from './Requests';
import { Orders, Bills } from './Orders';
import Vendors from './Vendors';
import { Budgets, Funds } from './Budgets';
import Projects from './Projects';
import Assets from './Assets';
import { Tickets, Routines, Contracts } from './Maintenance';
import Reports from './Reports';
import ProcureSetup from './ProcureSetup';

function Overview({ go }) {
  const g = useGet('/procure/overview'); const d = g.data;
  return (
    <Loading g={g}>{d && (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label={`Budget ${d.year}`} value={money(d.budget.amount)} /><Stat label="Set aside" value={money(d.budget.committed)} /><Stat label="Spent" value={money(d.budget.spent)} /><Stat label="Left" value={money(d.budget.available)} tone={d.budget.available < 0 ? 'text-[#9f1239]' : undefined} /></div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Waiting for you</h3>
            <ul className="grid gap-2 text-sm">{[['Requests to approve', d.waiting.requestsToApprove, 'requests'], ['Approved requests to order', d.waiting.requestsToOrder, 'requests'], ['Orders waiting for goods', d.waiting.ordersToReceive, 'orders'], ['Bills to approve', d.waiting.billsToApprove, 'bills'], ['Bills ready to pay', d.waiting.billsToPay, 'bills'], ['Bills overdue', d.waiting.billsOverdue, 'bills'], ['Supplier bank changes', d.waiting.bankChanges, 'suppliers'], ['Budget changes', d.waiting.budgetVariations, 'budgets'], ['Projects to approve', d.waiting.projectsToApprove, 'projects'], ['Project change orders', d.waiting.changeOrders, 'projects'], ['Asset disposals', d.waiting.disposals, 'assets']].map(([l, n, t]) => <li key={l} className="flex items-center justify-between gap-2"><span>{l}</span><span className="flex items-center gap-2">{n ? <Pill value="Pending">{n}</Pill> : <span className="text-xs text-[#5b6b7b]">none</span>}<button className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => go(t)} aria-label={`Open ${l}`}>Open</button></span></li>)}</ul></Card>
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">The school’s things</h3>
            <ul className="grid gap-2 text-sm"><li className="flex justify-between"><span>Assets on the register</span><span className="font-semibold">{d.assets.count}</span></li><li className="flex justify-between"><span>Bought for</span><span className="font-semibold">{money(d.assets.cost)}</span></li><li className="flex justify-between"><span>Worth now</span><span className="font-semibold">{money(d.assets.book)}</span></li>
              <li className="flex items-center justify-between gap-2"><span>Repair jobs open</span><span className="flex items-center gap-2">{d.maintenance.open ? <Pill value="Pending">{d.maintenance.open}</Pill> : <span className="text-xs text-[#5b6b7b]">none</span>}<button className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => go('maintenance')} aria-label="Open repair jobs">Open</button></span></li>
              {d.maintenance.urgent > 0 && <li className="flex justify-between text-[#8a4636]"><span>Urgent or high priority</span><span className="font-semibold">{d.maintenance.urgent}</span></li>}{d.maintenance.overdue > 0 && <li className="flex justify-between text-[#8a4636]"><span>Overdue</span><span className="font-semibold">{d.maintenance.overdue}</span></li>}
              {d.maintenance.plansDue > 0 && <li className="flex justify-between"><span>Routines due to open</span><span className="font-semibold">{d.maintenance.plansDue}</span></li>}{d.contractsEnding > 0 && <li className="flex justify-between text-[#8a4636]"><span>Contracts ending soon</span><span className="font-semibold">{d.contractsEnding}</span></li>}</ul></Card>
        </div>
        {d.budget.amount === 0 && <Note>No budget has been approved for {d.year} yet. Open Budgets and funds to make one. Staff can only raise requests against an approved budget line.</Note>}
      </div>
    )}</Loading>
  );
}

export default function ProcureAdmin() {
  const [top, setTop] = useState('overview'); const [buy, setBuy] = useState('orders'); const [money_, setMoney] = useState('budgets'); const [maint, setMaint] = useState('jobs');
  const go = (t) => { if (['orders', 'bills'].includes(t)) { setTop('buying'); setBuy(t); } else if (['budgets', 'funds'].includes(t)) { setTop('money'); setMoney(t); } else if (t === 'maintenance') { setTop('maintenance'); setMaint('jobs'); } else setTop(t); };
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Purchasing and facilities</h2><p className="text-sm text-[#5b6b7b]">Requests, quotes and orders, supplier bills, budgets and special funds, building projects, the asset register, repairs and running costs.</p></div>
      <Tabs label="Purchasing sections" value={top} onChange={setTop} items={[['overview', 'Overview'], ['requests', 'Requests'], ['buying', 'Orders and bills'], ['suppliers', 'Suppliers'], ['money', 'Budgets and funds'], ['projects', 'Projects'], ['assets', 'Assets'], ['maintenance', 'Repairs and costs'], ['reports', 'Reports'], ['setup', 'Rules']]} />
      {top === 'overview' && <Overview go={go} />}
      {top === 'requests' && <Requests admin officer />}
      {top === 'buying' && (<><Tabs label="Orders and bills" value={buy} onChange={setBuy} items={[['orders', 'Orders'], ['bills', 'Bills']]} />{buy === 'orders' ? <Orders admin officer /> : <Bills admin officer />}</>)}
      {top === 'suppliers' && <Vendors admin />}
      {top === 'money' && (<><Tabs label="Budgets and funds" value={money_} onChange={setMoney} items={[['budgets', 'Budgets'], ['funds', 'Funds']]} />{money_ === 'budgets' ? <Budgets /> : <Funds />}</>)}
      {top === 'projects' && <Projects admin />}
      {top === 'assets' && <Assets admin />}
      {top === 'maintenance' && (<><Tabs label="Repairs and costs" value={maint} onChange={setMaint} items={[['jobs', 'Repair jobs'], ['routines', 'Routines'], ['contracts', 'Running costs']]} />{maint === 'jobs' && <Tickets officer />}{maint === 'routines' && <Routines />}{maint === 'contracts' && <Contracts admin />}</>)}
      {top === 'reports' && <Reports />}
      {top === 'setup' && <ProcureSetup />}
    </div>
  );
}
