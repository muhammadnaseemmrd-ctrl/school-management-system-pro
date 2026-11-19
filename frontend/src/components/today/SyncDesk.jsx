import React, { useState } from 'react';
import { Card, Stat, EmptyState } from '../ui';
import { Tbl, Td, Row, Sub } from '../attendance/deskKit';
import { dayTime } from '../safety/safetyKit';
import { useGet } from '../timetable/planKit';
import ConflictInbox from './ConflictInbox';

// The school office's view of offline work: how much of it landed once, who has clashes waiting, what was refused
const SyncDesk = () => {
  const [tab, setTab] = useState('overview'); const ov = useGet('/sync/overview'); const rj = useGet('/sync/rejections');
  const TABS = [['overview', 'Overview'], ['clashes', 'Clashes'], ['refused', 'Refused'], ['devices', 'Devices']];
  const o = ov.data;
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {tab === 'overview' && (!o ? <div className="skeleton h-40" /> : <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Offline integrity" value={`${o.integrity}%`} sub="changes applied once or openly conflicted, last 30 days" /><Stat label="Changes received" value={o.counts.total} sub={`${o.counts.applied} saved, ${o.counts.partial} partly`} /><Stat label="Open clashes" value={o.openConflicts} sub={o.openConflicts ? `oldest ${o.oldestOpenHours} h` : 'None waiting'} tone={o.openConflicts ? 'text-[#9f1239]' : undefined} /><Stat label="Refused" value={o.counts.rejected} sub="with the reason, in Refused" /></div>
        {o.byTeacher.length > 0 && <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold">Clashes waiting, by teacher</div><Tbl head={['Teacher', 'Open']}>{o.byTeacher.map((t) => <Row key={t.teacherId}><Td>{t.name}</Td><Td>{t.open}</Td></Row>)}</Tbl></Card>}</div>)}
      {tab === 'clashes' && <ConflictInbox admin onChanged={ov.reload} />}
      {tab === 'refused' && <Card className="!p-0">{!rj.data ? <div className="skeleton h-32" /> : rj.data.rejections.length === 0 ? <EmptyState title="Nothing was refused" /> : <Tbl head={['When', 'Who', 'What', 'Why']}>{rj.data.rejections.map((r) => <Row key={r._id}><Td>{dayTime(r.receivedAt)}</Td><Td>{r.who}</Td><Td>{r.kind}<Sub>{r.entityKey}</Sub></Td><Td>{r.message}</Td></Row>)}</Tbl>}</Card>}
      {tab === 'devices' && <Card className="!p-0">{!o ? <div className="skeleton h-32" /> : o.devices.length === 0 ? <EmptyState title="No device has sent anything yet" /> : <Tbl head={['Teacher', 'Device', 'Changes sent', 'Last seen']}>{o.devices.map((d) => <Row key={`${d.userId}${d.deviceId}`}><Td>{d.name}</Td><Td><span className="font-mono text-xs">{d.deviceId.slice(0, 14)}</span></Td><Td>{d.count}</Td><Td>{dayTime(d.last)}</Td></Row>)}</Tbl>}</Card>}
    </div>
  );
};
export default SyncDesk;
