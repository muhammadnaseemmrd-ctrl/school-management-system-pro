import React, { useEffect, useState } from 'react';
import { Stat } from '../ui';
import { useGet, Tabs, Loading, Note } from './careKit';
import CareCases from './CareCases';
import CareConcerns, { RaiseConcern } from './CareConcerns';
import CareHealth from './CareHealth';
import CareSupport from './CareSupport';
import CareAdmin from './CareAdmin';

// Student care for the people at the school: cases, concerns, health, adjustments, appointments, training and access
export default function StaffCare({ isAdmin = false }) {
  const me = useGet('/care/me'); const m = me.data; const [tab, setTab] = useState('overview'); const [preset, setPreset] = useState(null); const [raise, setRaise] = useState(false);
  const caps = m ? { ...m, teaches: m.teaches || [], mentor: (m.teaches || []).length > 0 } : null;
  const ov = useGet(caps && (caps.work || caps.dsl || caps.health) ? '/care/overview' : '/care/me');
  useEffect(() => { if (caps) ov.reload(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!caps) return <Loading g={me}>{null}</Loading>;
  const o = ov.data && ov.data.cases ? ov.data : null; const canTriage = caps.work || caps.dsl;
  const items = [['overview', 'Overview'], ['cases', 'Cases', o?.cases.reviewDue], ...(canTriage ? [['concerns', 'Concerns', o?.reports?.new]] : []), ['health', caps.health ? 'Sick bay' : 'Health alerts'], ['support', 'Support'], ['staff', 'Training and access', o?.access?.pending]];
  return (
    <div className="grid gap-4">
      {o && <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Open cases" value={o.cases.open} sub={`${o.cases.intensive} intensive`} /><Stat label="Review due" value={o.cases.reviewDue} /><Stat label="No lead" value={o.cases.unassigned} /><Stat label="Open actions" value={o.cases.openActions} />{o.reports ? <Stat label="Concerns waiting" value={o.reports.new} /> : <Stat label="Confidential" value={o.cases.confidential} />}</div>}
      <Tabs label="Student care" value={tab} onChange={setTab} items={items} />
      {tab === 'overview' && <div className="grid gap-3">
        <Note>{canTriage ? 'Open a case when a child needs coordinated help. Concerns from students, parents and staff land under Concerns.' : 'You see cases you lead or were added to, health alerts for children you teach, and adjustments you must follow.'}</Note>
        <div className="flex flex-wrap gap-2"><button className="rounded-lg border border-[#e3e7e7] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[#f7f6f2]" onClick={() => setRaise(true)}>Raise a concern</button></div>
        {(caps.teaches || []).length > 0 && <Note>Open the Support tab to see goals, mentors and appointments, or Health alerts for emergency information about children you teach.</Note>}
      </div>}
      {tab === 'cases' && <CareCases caps={caps} preset={preset} onPresetUsed={() => setPreset(null)} />}
      {tab === 'concerns' && canTriage && <CareConcerns caps={caps} onTurnIntoCase={(r) => { setPreset({ fromReportId: r._id, title: `Concern: ${r.body.slice(0, 60)}`, summary: r.body, category: r.category === 'safety' ? 'safeguarding' : ['bullying', 'wellbeing', 'health'].includes(r.category) ? r.category : 'other', level: r.urgent ? 'intensive' : 'support', student: r.aboutStudentId ? { _id: r.aboutStudentId, name: r.aboutName } : null }); setTab('cases'); }} />}
      {tab === 'health' && <CareHealth caps={caps} />}
      {tab === 'support' && <CareSupport caps={caps} />}
      {tab === 'staff' && <CareAdmin caps={caps} isAdmin={isAdmin} />}
      {raise && <RaiseConcern onClose={() => setRaise(false)} />}
    </div>
  );
}
