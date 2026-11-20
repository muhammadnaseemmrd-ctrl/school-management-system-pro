import React, { useState } from 'react';
import { Tabs, Note } from './tkit';
import { Courses } from './Courses';
import { Cohorts } from './Cohorts';
import { Completions, Submissions, Certificates, Discussion, Slots } from './Reviews';

// An instructor sees only the courses they teach. Money, learners' private details and policy stay with the office.
export default function TrainingTeacher() {
  const [tab, setTab] = useState('courses');
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Training courses</h2><p className="text-sm text-[#5b6b7b]">The courses you teach: write lessons, take attendance, review work, answer the discussion and open office hours.</p></div>
      <Tabs label="Training sections" value={tab} onChange={setTab} items={[['courses', 'My courses'], ['cohorts', 'Cohorts and attendance'], ['submissions', 'Hand-ins'], ['completions', 'Finished courses'], ['discussion', 'Discussion'], ['slots', 'Office hours'], ['certs', 'Certificates']]} />
      {tab === 'courses' && <><Note>You can write and change lessons and send the course for approval. Price, publishing and instructors are set by an administrator.</Note><Courses role="teacher" /></>}
      {tab === 'cohorts' && <Cohorts admin={false} />}
      {tab === 'submissions' && <Submissions />}
      {tab === 'completions' && <Completions />}
      {tab === 'discussion' && <Discussion />}
      {tab === 'slots' && <Slots admin={false} />}
      {tab === 'certs' && <Certificates admin={false} />}
    </div>
  );
}
