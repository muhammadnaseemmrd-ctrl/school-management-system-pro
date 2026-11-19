import React from 'react';
import { FileText } from 'lucide-react';
import { Card, EmptyState, btnGhost, fmtDate } from '../ui';
import { Row, Sub, Td, Tbl } from '../attendance/deskKit';
import { useGet } from '../timetable/planKit';
import { usePdf } from './IssueDesk';

// Documents the school has issued to a student, for the student and for linked parents
export default function MyDocuments() {
  const g = useGet('/studio/my/documents'); const pdf = usePdf(); const rows = g.data?.documents || [];
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-[#e3e7e7] px-4 py-3"><h3 className="text-base font-semibold text-[#1b2837]">Documents from the school</h3><p className="text-xs text-[#5b6b7b]">ID cards, certificates, report cards and fee papers. Each has a check code so anyone can confirm it is real.</p></div>
      {g.loading && !g.data ? <div className="skeleton m-4 h-24" /> : g.error ? <EmptyState title={g.error} action={<button className={btnGhost} onClick={g.reload}>Try again</button>} /> : rows.length === 0 ? <EmptyState title="Nothing issued yet" text="When the school issues a document, it will appear here." /> : (
        <Tbl head={['Document', 'For', 'Issued', 'Number', '']}>{rows.map((d) => <Row key={d._id}><Td>{d.title}<Sub>{d.familyLabel}</Sub></Td><Td>{d.studentName}</Td><Td>{fmtDate(d.issuedAt)}</Td><Td><span className="font-mono text-xs">{d.serial}</span></Td><Td><button className={btnGhost} onClick={() => pdf.open(d.serial, `/studio/my/documents/${d._id}/pdf`)}><FileText size={14} /> Open</button></Td></Row>)}</Tbl>)}
      {pdf.node}
    </Card>
  );
}
