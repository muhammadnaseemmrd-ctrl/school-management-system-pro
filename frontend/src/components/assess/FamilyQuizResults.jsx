import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Card, EmptyState, Pill, btnGhost, fmtDate } from '../ui';
import { Row, Sub, Td, Tbl } from '../attendance/deskKit';
import { useGet } from '../timetable/planKit';

// Quiz and exam results a school has released, for linked guardians who are allowed to see marks
export default function FamilyQuizResults() {
  const g = useGet('/assess/take/family'); const rows = g.data?.results || [];
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-[#e3e7e7] px-4 py-3"><h3 className="text-base font-semibold text-[#1b2837]">Quizzes and exams</h3><p className="text-xs text-[#5b6b7b]">Results appear here after the school releases them.</p></div>
      {g.loading && !g.data ? <div className="skeleton m-4 h-24" /> : g.error ? <EmptyState title={g.error} action={<button className={btnGhost} onClick={g.reload}>Try again</button>} /> : rows.length === 0 ? <EmptyState title="No released results yet" /> : (
        <Tbl head={['Child', 'Quiz', 'Result', 'Date']}>{rows.map((r) => <Row key={r.attemptId}><Td>{r.studentName}</Td><Td>{r.title}<Sub>{r.kind === 'exam' ? 'Exam' : 'Quiz'}</Sub></Td><Td>{r.total} / {r.max} ({r.pct}%) <Pill value={r.passed ? 'Active' : 'None'}>{r.passed ? 'Passed' : 'Below pass mark'}</Pill>{r.pendingMarks > 0 && <Sub>{r.pendingMarks} answers still being marked</Sub>}</Td><Td>{fmtDate(r.submittedAt)}</Td></Row>)}</Tbl>)}
    </Card>
  );
}
