import React, { useState } from 'react';
import { Card, Stat, EmptyState, btnGhost } from '../ui';
import { useGet, Loading, Note } from '../early/earlyKit';
import { Badge, Table, Td, gradeTxt } from './kit';

// One requirement group of the degree audit, in plain words.
function Group({ g }) {
  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-[#1b2837]">{g.title}</h4><Badge s={g.status} /></div>
      {g.rule !== 'all' && <p className="mt-1 text-xs text-[#5b6b7b]">{g.have} of {g.need} {g.rule === 'credits' ? 'credits' : 'courses'} done{g.remaining ? ` · ${g.remaining} ${g.remainingUnit} still needed` : ''}</p>}
      {g.status === 'waived' && <p className="mt-1 text-xs text-[#5b6b7b]">Waived by a signed exception.</p>}
      <ul className="mt-2 grid gap-1 text-sm">
        {g.items.map((i) => (
          <li key={`${i.code}-${i.state}`} className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{i.code}</span><span className="text-[#3b4a5c]">{i.title}</span><Badge s={i.state} />
            {i.grade ? <span className="text-xs text-[#5b6b7b]">grade {i.grade}</span> : null}{i.replaces ? <span className="text-xs text-[#5b6b7b]">in place of {i.replaces}</span> : null}{i.belowMinimum ? <span className="text-xs text-[#8a4636]">grade is below the minimum</span> : null}{i.lastGrade ? <span className="text-xs text-[#8a4636]">last grade {i.lastGrade}</span> : null}</li>
        ))}
      </ul>
      {g.options?.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs font-semibold text-[#2a5cac]">Courses that could fill this ({g.options.length})</summary><ul className="mt-1 grid gap-0.5 text-xs text-[#3b4a5c]">{g.options.map((o) => <li key={o.code}><span className="font-mono">{o.code}</span> {o.title} · {o.credits} credits</li>)}</ul></details>}
    </Card>
  );
}

export function AuditView({ audit }) {
  if (!audit) return <Note>This student is not in a programme yet, so there is nothing to check.</Note>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Credits earned" value={`${audit.credits.earned} / ${audit.credits.needed}`} />
        <Stat label="Average (CGPA)" value={audit.cgpa} sub={`Needs ${audit.minCgpa}`} />
        <Stat label="Catalogue year" value={audit.catalogYear} />
        <Stat label="Ready to graduate" value={audit.eligible ? 'Yes' : 'Not yet'} tone={audit.eligible ? 'text-[#215a52]' : 'text-[#8a4636]'} />
      </div>
      {!audit.eligible && audit.blockers.length > 0 && <Note>What is still missing: {audit.blockers.join(' · ')}</Note>}
      {audit.unknownCourses?.length > 0 && <Note tone="warn">These courses on the record are not in the catalogue any more: {audit.unknownCourses.join(', ')}.</Note>}
      <div className="grid gap-3 md:grid-cols-2">{audit.groups.map((g) => <Group key={g.key} g={g} />)}</div>
      {audit.exceptionsApplied?.length > 0 && <p className="text-xs text-[#5b6b7b]">{audit.exceptionsApplied.length} signed exception(s) are applied in this check.</p>}
    </div>
  );
}

// The academic record: terms, grades and the degree audit. `mine` lets the student appeal.
export function RecordView({ data, mine, onAppeal }) {
  const [tab, setTab] = useState('terms');
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Average (CGPA)" value={data.terms.some((t) => t.gpa !== null) ? data.cgpa : '—'} />
        <Stat label="Credits earned" value={data.creditsEarned} />
        <Stat label="Programme" value={data.program ? data.program.programName : 'Not placed'} sub={data.program ? `Catalogue ${data.program.catalogYear}${data.program.advisorName ? ` · advisor ${data.program.advisorName}` : ''}` : ''} />
        <Stat label="Status" value={data.program ? (data.program.status === 'graduated' ? 'Graduated' : 'Active') : '—'} />
      </div>
      <div role="tablist" aria-label="Record sections" className="flex gap-2">
        {[['terms', 'Terms and grades'], ['audit', 'Degree audit']].map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white text-[#1b2837] hover:bg-[#f7f6f2]'}`}>{v}</button>)}
      </div>
      {tab === 'audit' && <AuditView audit={data.audit} />}
      {tab === 'terms' && (data.terms.length === 0 ? <Card><EmptyState title="No courses yet" text="Courses appear here once registration starts." /></Card> : data.terms.map((t) => (
        <Card key={t.termId} className="!p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-[#1b2837]">{t.name}</h4><span className="text-xs text-[#5b6b7b]">{t.gpa !== null ? `Term average ${t.gpa} · ${t.earned} credits earned` : 'Grades not published yet'}{mine && t.appealUntil ? ` · appeals until ${new Date(t.appealUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span></div>
          <Table label={`${t.name} courses`} head={['Course', 'Credits', 'Grade', 'Notes', ...(mine ? [''] : [])]} min={520}>
            {t.courses.map((c) => (
              <tr key={c.enrollmentId}><Td><span className="font-mono text-xs">{c.code}</span> {c.title}</Td><Td>{c.credits}</Td><Td><span className="font-semibold">{c.status === 'enrolled' && !c.grade ? '' : gradeTxt(c.grade)}</span></Td>
                <Td className="text-xs text-[#5b6b7b]">{[c.status === 'enrolled' && 'Registered', c.status === 'dropped' && 'Dropped', c.attemptNo > 1 && `Attempt ${c.attemptNo}`, c.countsInAverage === false && c.grade && !['W', 'I', 'AU'].includes(c.grade) && 'Not in the average (retaken)'].filter(Boolean).join(' · ')}</Td>
                {mine && <Td>{c.canAppeal && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => onAppeal(c)} aria-label={`Appeal the ${c.code} grade`}>Appeal</button>}</Td>}</tr>
            ))}
          </Table>
        </Card>
      )))}
    </div>
  );
}

// An administrator or advisor opens a student's record by id.
export function StudentRecord({ studentId, onData }) {
  const g = useGet(`/registrar/students/${studentId}/record`);
  return <Loading g={g}>{g.data && <RecordView data={g.data} />}</Loading>;
}
export { useGet };
