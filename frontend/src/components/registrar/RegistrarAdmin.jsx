import React, { useState } from 'react';
import { Card, Stat, Pill } from '../ui';
import { useGet, Loading, Note, Tabs } from '../early/earlyKit';
import { Courses, Programmes, Settings } from './Catalogue';
import { Terms } from './Terms';
import { People, Graduation } from './People';
import { Approvals } from './Approvals';

export default function RegistrarAdmin() {
  const [tab, setTab] = useState('overview'); const ov = useGet('/registrar/overview'); const st = useGet('/registrar/settings'); const d = ov.data; const w = d?.waiting || {};
  const waitingTotal = d ? w.versions + w.gradeChanges + w.appeals + w.exceptions : 0;
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Registrar</h2><p className="text-sm text-[#5b6b7b]">Courses, programme rules, terms, registration, grades, degree audit and transcripts.</p></div>
      <Tabs label="Registrar sections" value={tab} onChange={setTab} items={[['overview', 'Overview', waitingTotal || null], ['people', 'Students'], ['courses', 'Courses'], ['programs', 'Programmes', w.versions || null], ['terms', 'Terms and sections'], ['approvals', 'Approvals', (w.gradeChanges || 0) + (w.appeals || 0) + (w.exceptions || 0) || null], ['graduation', 'Graduation'], ['settings', 'Grades and policy']]} />
      {tab === 'overview' && (
        <Loading g={ov}>{d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Programmes" value={d.programs} /><Stat label="Courses" value={d.courses} /><Stat label="Students in programmes" value={d.students.active} sub={`${d.students.graduated} graduated`} /><Stat label="Terms" value={d.openTerms + d.gradingTerms} sub={`${d.openTerms} open · ${d.gradingTerms} grading`} /></div>
            <Card>
              <h3 className="mb-2 font-semibold text-[#1b2837]">Waiting for you</h3>
              <ul className="grid gap-2 text-sm">
                {[['Programme rules to approve', w.versions, 'programs'], ['Grade changes to approve', w.gradeChanges, 'approvals'], ['Appeals to decide', w.appeals, 'approvals'], ['Exceptions to decide', w.exceptions, 'approvals'], ['Sections whose grades are not in yet', w.sectionsToGrade, 'terms']].map(([label, n, to]) => (
                  <li key={label} className="flex items-center justify-between gap-2"><span>{label}</span><span className="flex items-center gap-2">{n ? <Pill value="Pending">{n}</Pill> : <span className="text-xs text-[#5b6b7b]">None</span>}{n ? <button className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => setTab(to)} aria-label={`Open ${label}`}>Open</button> : null}</span></li>
                ))}
              </ul>
            </Card>
            {d.soleAdmin ? <Note>Your school has one administrator. Approvals can be given by the same person who asked, and the record says so. Add a second administrator to make them two-person steps.</Note> : <Note>Approvals need a different administrator from the one who asked. Each approval is signed and kept with a fingerprint.</Note>}
          </div>
        )}</Loading>
      )}
      {tab === 'people' && <People />}
      {tab === 'courses' && <Courses scale={st.data?.scale || []} />}
      {tab === 'programs' && <Programmes soleAdmin={d?.soleAdmin} />}
      {tab === 'terms' && <Terms />}
      {tab === 'approvals' && <Approvals soleAdmin={d?.soleAdmin} counts={w} />}
      {tab === 'graduation' && <Graduation />}
      {tab === 'settings' && <Settings onChanged={() => { st.reload(); ov.reload(); }} />}
    </div>
  );
}
