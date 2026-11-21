import React, { useState } from 'react';
import { Tabs } from './acKit';
import Overview from './Overview';
import Journals from './Journals';
import Statements from './Statements';
import Funds from './Funds';
import Budgets from './Budgets';
import Recons from './Recons';
import Months from './Months';
import AcSetup from './AcSetup';

// The school's books. An administrator has everything. A teacher works under a permission an administrator gave for a limited time:
// "read" shows the books, "prepare" adds journals, budgets and bank reconciliations, "approve" also posts, signs off and closes months.
export default function AccountsAdmin({ t = { admin: true, approve: true, prepare: true, audit: true } }) {
  const [tab, setTab] = useState('overview'); const [seed, setSeed] = useState(null);
  const go = (k, s) => { setTab(k); setSeed(s || null); };
  const items = [['overview', 'Overview'], ['journals', 'Journals'], ['statements', 'Statements'], ['funds', 'Funds and grants'], ['budgets', 'Budgets'], ['recons', 'Bank reconciliation'], ['months', 'Months'], ['setup', t.admin ? 'Chart and rules' : 'Chart of accounts']];
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">School accounts</h2><p className="text-sm text-[#5b6b7b]">Every fee, payment, pay run, bill and store sale lands here by itself. Journals are for everything else. A posted entry is never changed; it is reversed with a new one.{!t.admin && ' You are working here under a permission an administrator gave you for a limited time.'}</p></div>
      <Tabs label="Accounts sections" value={tab} onChange={(k) => go(k)} items={items} />
      {tab === 'overview' && <Overview t={t} go={go} />}
      {tab === 'journals' && <Journals t={t} seed={seed} key={seed ? seed.key : 'j'} />}
      {tab === 'statements' && <Statements t={t} seed={seed} key={seed ? seed.key : 's'} go={go} />}
      {tab === 'funds' && <Funds t={t} go={go} />}
      {tab === 'budgets' && <Budgets t={t} />}
      {tab === 'recons' && <Recons t={t} />}
      {tab === 'months' && <Months t={t} />}
      {tab === 'setup' && <AcSetup t={t} />}
    </div>
  );
}
