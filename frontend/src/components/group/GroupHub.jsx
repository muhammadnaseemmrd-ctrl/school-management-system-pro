import React, { useState } from 'react';
import { Tabs } from './gKit';
import { useGroupAccess, useGet } from './gKit';
import Campuses from './Campuses';
import Rules from './Rules';
import Waiting from './Waiting';

// The group's home: every campus side by side, the rules behind them, and changes waiting to be decided.
export default function GroupHub() {
  const acc = useGroupAccess(); const [tab, setTab] = useState('campuses'); const wait = useGet('/group/policies/pending', { t: tab });
  if (!acc.ready) return <p className="text-sm text-[#5b6b7b]" role="status">Loading…</p>;
  if (acc.none || acc.campuses.length === 0) return <p className="text-sm text-[#9f1239]" role="alert">The group view is not available to you.</p>;
  const n = wait.data ? wait.data.pending.length : 0;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-[#1b2837]">Campus group</h1>
        <p className="mt-1 text-sm text-[#5b6b7b]">{acc.wide ? 'Every campus of the school side by side, and the rules the group sets for them.' : 'Your campuses only. Rules you ask to change wait for a school-wide administrator.'}</p></div>
      <Tabs label="Campus group sections" value={tab} onChange={setTab} items={[['campuses', 'Campuses'], ['rules', 'Rules'], ['waiting', 'Waiting for approval', n || null]]} />
      <div key={tab}>
        {tab === 'campuses' && <Campuses acc={acc} go={setTab} />}
        {tab === 'rules' && <Rules acc={acc} />}
        {tab === 'waiting' && <Waiting acc={acc} onChanged={wait.reload} />}
      </div>
    </div>
  );
}
