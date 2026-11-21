import React, { useState } from 'react';
import { useAnalyticsAccess, Tabs, Loading, Note } from './anKit';
import Overview from './Overview';
import Progress from './Progress';
import Reports from './Reports';
import Jobs from './Jobs';
import Definitions from './Definitions';
import Money from './Money';
import Health from './Health';
import Pulse from './Pulse';

// One home for measures. What shows depends on the person: teachers see their own classes, leads the whole school's learning and attendance, administrators everything their campus allows.
export default function AnalyticsHub({ teacher = false }) {
  const acc = useAnalyticsAccess(); const [tab, setTab] = useState('overview');
  if (!acc.ready) return <p className="text-sm text-[#5b6b7b]" role="status">Loading…</p>;
  const tabs = [['overview', 'Overview'], ['progress', 'Progress'], ['reports', 'Reports'], ['jobs', 'Jobs'], ['defs', 'What each measure means'],
    ...(acc.admin ? [['money', 'Fees and admissions']] : []), ...(acc.wide ? [['health', 'Data health']] : []), ['pulse', teacher ? 'My time' : 'Teacher time']];
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-[#1b2837]">Measures</h1>
        <p className="mt-1 text-sm text-[#5b6b7b]">{acc.level === 'admin' ? (acc.limited ? 'Your campus only. Measures that cover the whole school are hidden.' : 'The whole school.') : acc.level === 'lead' ? 'Learning and attendance for the whole school.' : 'Your own classes.'} Care and safeguarding records are never part of these figures.</p></div>
      <Tabs label="Measures sections" value={tab} onChange={setTab} items={tabs} />
      <div key={tab}>
        {tab === 'overview' && <Overview acc={acc} go={setTab} />}
        {tab === 'progress' && <Progress />}
        {tab === 'reports' && <Reports acc={acc} />}
        {tab === 'jobs' && <Jobs acc={acc} />}
        {tab === 'defs' && <Definitions acc={acc} />}
        {tab === 'money' && acc.admin && <Money acc={acc} />}
        {tab === 'health' && acc.wide && <Health />}
        {tab === 'pulse' && <Pulse acc={acc} teacher={teacher} />}
      </div>
    </div>
  );
}
