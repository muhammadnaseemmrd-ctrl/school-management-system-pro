import React, { useState } from 'react';
import { Tabs, Note } from './libKit';
import LibraryMe from './LibraryMe';
import Desk from './Desk';
import Catalogue from './Catalogue';
import { Loans, Fines } from './Circulation';
import StoreSell from './StoreSell';
import { Orders, Stock, Sales, Counts } from './StoreOffice';

// A teacher always sees their own borrowing. The desk and the till show only when an administrator has given them a time-limited permission.
export default function LibraryTeacher({ desk, till }) {
  const [tab, setTab] = useState('mine'); const [store, setStore] = useState('sell'); const [circ, setCirc] = useState('loans');
  return (
    <div className="space-y-4">
      {(desk || till) && <Tabs label="Library sections" value={tab} onChange={setTab} items={[['mine', 'My books'], ...(desk ? [['desk', 'Desk'], ['catalogue', 'Catalogue'], ['circulation', 'Loans and charges']] : []), ...(till ? [['store', 'Store till']] : [])]} />}
      {tab === 'mine' && <LibraryMe role="teacher" />}
      {tab === 'desk' && desk && <Desk admin={false} />}
      {tab === 'catalogue' && desk && <Catalogue admin={false} />}
      {tab === 'circulation' && desk && (<><Tabs label="Loans and charges" value={circ} onChange={setCirc} items={[['loans', 'Loans'], ['fines', 'Charges']]} />{circ === 'loans' ? <Loans /> : <Fines admin={false} />}</>)}
      {tab === 'store' && till && (<><Note>You are working the store till under a permission an administrator gave you for a limited time.</Note><Tabs label="Store sections" value={store} onChange={setStore} items={[['sell', 'Till'], ['orders', 'Pickup orders'], ['stock', 'Stock'], ['sales', 'Sales and refunds'], ['counts', 'Stock counts']]} />
        {store === 'sell' && <StoreSell />}{store === 'orders' && <Orders />}{store === 'stock' && <Stock />}{store === 'sales' && <Sales />}{store === 'counts' && <Counts />}</>)}
    </div>
  );
}
