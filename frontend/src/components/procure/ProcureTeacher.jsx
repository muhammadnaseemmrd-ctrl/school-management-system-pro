import React, { useState } from 'react';
import { Tabs, Note } from './pcKit';
import Requests from './Requests';
import { Orders } from './Orders';
import Vendors from './Vendors';
import Projects from './Projects';
import Assets from './Assets';
import { Tickets, Routines } from './Maintenance';

// Every teacher can report a fault and follow their own reports. Raising a purchase request, or working in the purchasing office, needs a time-limited permission from an administrator.
export default function ProcureTeacher({ officer, request }) {
  const [tab, setTab] = useState('jobs'); const [more, setMore] = useState('orders');
  const items = [['jobs', officer ? 'Repair jobs' : 'Report a fault'], ...(request || officer ? [['requests', officer ? 'Requests' : 'My requests']] : []), ...(officer ? [['office', 'Orders and suppliers'], ['assets', 'Assets'], ['projects', 'Projects'], ['routines', 'Routines']] : [])];
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">{officer ? 'Purchasing office' : 'Repairs and purchasing'}</h2><p className="text-sm text-[#5b6b7b]">{officer ? 'You are working in the purchasing office under a permission an administrator gave you for a limited time. Approvals, payments and budgets stay with administrators.' : 'Report a broken or missing thing so the school can fix it. If an administrator has allowed it, you can also ask for something to be bought.'}</p></div>
      {items.length > 1 && <Tabs label="Purchasing sections" value={tab} onChange={setTab} items={items} />}
      {!officer && !request && <Note>To ask for something to be bought, an administrator needs to give you the request permission for a few days.</Note>}
      {tab === 'jobs' && <Tickets officer={officer} />}
      {tab === 'requests' && (request || officer) && <Requests admin={false} officer={officer} mine />}
      {tab === 'office' && officer && (<><Tabs label="Orders and suppliers" value={more} onChange={setMore} items={[['orders', 'Orders'], ['suppliers', 'Suppliers']]} />{more === 'orders' ? <Orders admin={false} officer /> : <Vendors admin={false} />}</>)}
      {tab === 'assets' && officer && <Assets admin={false} />}
      {tab === 'projects' && officer && <Projects admin={false} />}
      {tab === 'routines' && officer && <Routines />}
    </div>
  );
}
