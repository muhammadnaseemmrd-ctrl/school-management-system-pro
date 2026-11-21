import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, btnGhost, btnPrimary, inputCls, Field, errMsg } from '../ui';
import { Table, Td, Reason, LBadge, useGet, Loading, PageBar, useDebounced, money, day, download, Note } from './libKit';

export function Loans() {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [f, setF] = useState('open'); const [page, setPage] = useState(1);
  const params = { q: dq || undefined, page, limit: 25, ...(f === 'overdue' ? { overdue: '1' } : f === 'textbook' ? { kind: 'textbook', status: 'open' } : { status: f }) }; const g = useGet('/library/loans', params);
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1"><Field label="Search loans"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Borrower, book or barcode" /></Field></div>
        <Field label="Show"><select className={inputCls} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }}><option value="open">Out now</option><option value="overdue">Overdue</option><option value="textbook">Textbooks for the year</option><option value="returned">Returned</option><option value="lost">Lost</option></select></Field>
        <button className={btnGhost} onClick={() => download('/library/loans.csv', 'library-loans.csv')}>Download as a spreadsheet</button>
      </div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No loans here" text="Nothing matches this view." /></Card> : <>
        <Table label="Loans" head={['Borrower', 'Book', 'Type', 'Due', 'Status']} min={640}>
          {g.data.rows.map((l) => <tr key={l._id}><Td className="font-medium">{l.holderName}</Td><Td>{l.titleName}<div className="font-mono text-[11px] text-[#5b6b7b]">{l.barcode}</div></Td><Td><LBadge s={l.kind} /></Td><Td>{day(l.dueOn)}</Td><Td>{l.overdue ? <LBadge s="overdue" label={`${l.daysLate} day${l.daysLate === 1 ? '' : 's'} late`} /> : <LBadge s={l.status} />}</Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
    </div>
  );
}

export function Reservations() {
  const g = useGet('/library/reservations'); const [ask, setAsk] = useState(null);
  return (
    <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No reservations" text="When every copy of a book is out, students and teachers can join its queue." /></Card> : (
      <Table label="Reservations" head={['Book', 'Waiting', 'Place', 'Status', '']} min={600}>
        {g.data.rows.map((r) => <tr key={r._id}><Td className="font-medium">{r.titleName}</Td><Td>{r.holderName}</Td><Td>{r.position}</Td><Td><LBadge s={r.status} />{r.status === 'ready' && <div className="text-xs text-[#5b6b7b]">Held until {day(r.holdUntil)}</div>}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(r)} aria-label={`Cancel the reservation for ${r.titleName} by ${r.holderName}`}>Cancel</button></Td></tr>)}
      </Table>
    ))}
    {ask && <Reason title="Cancel this reservation" text={`${ask.holderName} will lose their place for “${ask.titleName}”.`} confirm="Cancel it" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/library/reservations/${ask._id}/cancel`, { reason: v }); setAsk(null); toast.success('Cancelled.'); g.reload(); }} />}
    </Loading>
  );
}

export function Fines({ admin }) {
  const [f, setF] = useState('open'); const [page, setPage] = useState(1); const g = useGet('/library/fines', f === 'refund' ? { refundDue: '1', page } : { status: f, page, limit: 25 }); const [ask, setAsk] = useState(null);
  const pay = async (x) => { try { await apiClient.post(`/library/fines/${x._id}/pay`, { method: 'cash' }); toast.success('Payment recorded.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><Field label="Show"><select className={inputCls} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }}><option value="open">To pay</option><option value="paid">Paid</option><option value="waived">Waived</option><option value="void">Cancelled</option><option value="refund">Paid, but the book was found (refund to decide)</option></select></Field></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No charges here" text="Late, lost and damaged charges appear here, worked out by your library rules." /></Card> : <>
        <Table label="Charges" head={['Charge', 'Borrower', 'Why', 'Amount', 'Status', '']} min={720}>
          {g.data.rows.map((x) => <tr key={x._id}><Td className="font-mono text-xs">{x.fineNo}</Td><Td className="font-medium">{x.holderName}</Td><Td>{x.basis}<div className="text-xs text-[#5b6b7b]">{x.titleName} · rules v{x.policyVersion}</div>{x.refundDue && <div className="text-xs text-[#8a4636]">{x.refundNote}</div>}</Td><Td>{money(x.amount)}</Td><Td><LBadge s={x.status} /></Td>
            <Td>{x.status === 'open' && <div className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => pay(x)} aria-label={`Record cash payment for ${x.fineNo}`}>Paid in cash</button>{admin && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(x)} aria-label={`Waive ${x.fineNo}`}>Waive</button>}</div>}</Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {ask && <Reason title="Waive this charge" text={`${money(ask.amount)} for ${ask.holderName}: ${ask.basis}`} confirm="Waive it" min={10} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/library/fines/${ask._id}/waive`, { reason: v }); setAsk(null); toast.success('Waived.'); g.reload(); }} />}
    </div>
  );
}

function Needs({ classId, year, rec }) {
  const need = useGet('/library/textbooks/needs', { classId, year }); const [result, setResult] = useState(null); const [busy, setBusy] = useState('');
  const issue = async (t) => { setBusy(t._id); setResult(null); try { const r = await apiClient.post('/library/textbooks/class-set', { classId, titleId: t._id, year }); setResult(r.data); need.reload(); rec.reload(); } catch (e) { toast.error(errMsg(e, 'Could not issue.')); } finally { setBusy(''); } };
  return (
    <>
      <Loading g={need}>{need.data && (need.data.titles.length === 0 ? <Card><EmptyState title="No textbooks for this class" text="Add a book to the catalogue, choose “Textbook”, and pick this class." /></Card> : (
        <Table label="Textbooks for this class" head={['Textbook', 'Copies free', 'Students without one', '']} min={560}>
          {need.data.titles.map((t) => <tr key={t._id}><Td className="font-medium">{t.title}<div className="text-xs text-[#5b6b7b]">{t.subject}</div></Td><Td>{t.available}</Td><Td>{t.needed}{t.needed > t.available && <span className="ms-2 text-xs text-[#8a4636]">{t.needed - t.available} short</span>}</Td><Td><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} disabled={busy === t._id || t.needed === 0 || t.available === 0} onClick={() => issue(t)}>{busy === t._id ? 'Issuing…' : 'Issue to the class'}</button></Td></tr>)}
        </Table>
      ))}</Loading>
      {result && <Note tone={result.short.length || result.failed.length ? 'warn' : 'ok'}>{result.issued} copies of “{result.title}” were issued to {result.class}.{result.short.length > 0 && ` Not enough copies for: ${result.short.join(', ')}.`}{result.failed.length > 0 && ` Could not issue to: ${result.failed.map((f) => `${f.student} (${f.reason})`).join('; ')}.`}</Note>}
    </>
  );
}

export function Textbooks() {
  const classes = useGet('/classes', { limit: 100 }); const cl = classes.data?.classes || []; const yr = new Date().getFullYear(); const [classId, setClassId] = useState(''); const [year, setYear] = useState(`${yr}-${String(yr + 1).slice(2)}`);
  const rec = useGet('/library/textbooks/recoveries', { year });
  return (
    <div className="space-y-3">
      <Card>
        <p className="mb-3 text-sm text-[#5b6b7b]">Textbooks are issued to a class for the school year. Each student gets one copy; nobody who already has one gets another.</p>
        <div className="flex flex-wrap items-end gap-3"><Field label="Class"><select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose a class</option>{cl.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field><Field label="School year"><input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-27" /></Field></div>
      </Card>
      {classId && /^\d{4}(-\d{2,4})?$/.test(year) && <Needs classId={classId} year={year} rec={rec} />}
      <Card>
        <h3 className="mb-2 font-semibold text-[#1b2837]">Still out for {year}</h3>
        <Loading g={rec}>{rec.data && (rec.data.rows.length === 0 ? <p className="text-sm text-[#5b6b7b]">No textbooks are out for this year.</p> : <Table label="Textbooks still out" head={['Student', 'Textbook', 'Barcode', 'Issued']} min={520}>{rec.data.rows.map((r) => <tr key={r.loanId}><Td className="font-medium">{r.holderName}</Td><Td>{r.titleName}</Td><Td className="font-mono text-xs">{r.barcode}</Td><Td>{day(r.issuedAt)}</Td></tr>)}</Table>)}</Loading>
      </Card>
    </div>
  );
}
