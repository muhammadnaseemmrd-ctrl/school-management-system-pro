import React, { useState } from 'react';
import { Card, Stat, Pill } from '../ui';
import { useGet, Loading, Note, Tabs, money } from './libKit';
import Desk from './Desk';
import Catalogue from './Catalogue';
import { Loans, Reservations, Fines, Textbooks } from './Circulation';
import StoreSell from './StoreSell';
import { Orders, Stock, Sales, Counts, Tills, DayReport } from './StoreOffice';
import { Setup } from './LibrarySetup';

function Overview({ go }) {
  const g = useGet('/library/overview'); const st = useGet('/store/overview'); const d = g.data;
  return (
    <Loading g={g}>{d && (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Books" value={d.titles} sub={`${d.copies} copies`} /><Stat label="Out now" value={d.onLoan} sub={`${d.dueToday} due today`} /><Stat label="Overdue" value={d.overdue} tone={d.overdue ? 'text-[#8a4636]' : undefined} /><Stat label="Charges to pay" value={money(d.finesAmount)} sub={`${d.finesOpen} charges`} /></div>
        <Card>
          <h3 className="mb-2 font-semibold text-[#1b2837]">Waiting for you</h3>
          <ul className="grid gap-2 text-sm">
            {[['Overdue books', d.overdue, 'loans'], ['Reservations waiting', d.reservations, 'reservations'], ['Charges to collect', d.finesOpen, 'fines'], ['Copies marked lost', d.lost, 'catalogue']].map(([l, n, t]) => <li key={l} className="flex items-center justify-between gap-2"><span>{l}</span><span className="flex items-center gap-2">{n ? <Pill value="Pending">{n}</Pill> : <span className="text-xs text-[#5b6b7b]">none</span>}<button className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => go(t)} aria-label={`Open ${l}`}>Open</button></span></li>)}
            {st.data && [['Store refunds to decide', st.data.refundsWaiting], ['Store orders to collect', st.data.pendingOrders], ['Stock counts to approve', st.data.countsWaiting], ['Items running low', st.data.low]].map(([l, n]) => <li key={l} className="flex items-center justify-between gap-2"><span>{l}</span>{n ? <Pill value="Pending">{n}</Pill> : <span className="text-xs text-[#5b6b7b]">none</span>}</li>)}
          </ul>
        </Card>
        {d.titles === 0 && <Note>Your library is empty. Open Catalogue to add books one by one, or import a spreadsheet.</Note>}
      </div>
    )}</Loading>
  );
}

export default function LibraryAdmin() {
  const [top, setTop] = useState('overview'); const [store, setStore] = useState('sell'); const [circ, setCirc] = useState('loans');
  const go = (t) => { if (['loans', 'reservations', 'fines'].includes(t)) { setTop('circulation'); setCirc(t); } else setTop(t); };
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Library and store</h2><p className="text-sm text-[#5b6b7b]">Lend and take back books, keep the catalogue, collect charges, issue textbooks, and run the school shop: stock, till, refunds and counts.</p></div>
      <Tabs label="Library and store sections" value={top} onChange={setTop} items={[['overview', 'Overview'], ['desk', 'Desk'], ['catalogue', 'Catalogue'], ['circulation', 'Loans and charges'], ['textbooks', 'Textbooks'], ['store', 'Store'], ['setup', 'Setup']]} />
      {top === 'overview' && <Overview go={go} />}
      {top === 'desk' && <Desk admin />}
      {top === 'catalogue' && <Catalogue admin />}
      {top === 'circulation' && (<><Tabs label="Loans and charges" value={circ} onChange={setCirc} items={[['loans', 'Loans'], ['reservations', 'Reservations'], ['fines', 'Charges']]} />{circ === 'loans' && <Loans />}{circ === 'reservations' && <Reservations />}{circ === 'fines' && <Fines admin />}</>)}
      {top === 'textbooks' && <Textbooks />}
      {top === 'store' && (<><Tabs label="Store sections" value={store} onChange={setStore} items={[['sell', 'Till'], ['orders', 'Pickup orders'], ['stock', 'Stock'], ['sales', 'Sales and refunds'], ['counts', 'Stock counts'], ['tills', 'Tills'], ['report', 'Reports']]} />
        {store === 'sell' && <StoreSell admin />}{store === 'orders' && <Orders />}{store === 'stock' && <Stock admin />}{store === 'sales' && <Sales admin />}{store === 'counts' && <Counts admin />}{store === 'tills' && <Tills />}{store === 'report' && <DayReport />}</>)}
      {top === 'setup' && <Setup />}
    </div>
  );
}
