import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Printer, Upload, Wallet, CheckCircle2 } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, Stat, EmptyState, TableSkeleton, btnGhost, btnPrimary, btnDanger, inputCls, fmtDate, errMsg, pkr } from '../../components/ui';

const TONE = { Open: 'Pending', PartiallyPaid: 'Approved', Paid: 'Paid', WrittenOff: 'None', Void: 'Void', Pending: 'Pending', Confirmed: 'Confirmed', Rejected: 'Suspended', Requested: 'Pending', Approved: 'Approved', Active: 'Active', Ended: 'None', Unmatched: 'Pending', Matched: 'Confirmed', Ignored: 'None' };
const REASONS = [['hardship', 'Family hardship'], ['scholarship', 'Scholarship'], ['staff-child', 'Staff child'], ['billing-error', 'Billing error'], ['duplicate', 'Duplicate payment'], ['withdrawal', 'Withdrawal'], ['overpayment', 'Overpayment'], ['other', 'Other']];
const useList = (path, key, params) => {
  const [s, setS] = useState({ rows: [], pagination: null, loading: true, error: '' }); const [page, setPage] = useState(1); const q = JSON.stringify(params || {});
  const load = useCallback(async () => { setS((x) => ({ ...x, loading: true })); try { const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } }); const p = r.data.pagination; setS({ rows: r.data[key] || [], pagination: p && { ...p, currentPage: p.page }, extra: r.data, loading: false, error: '' }); } catch (e) { setS((x) => ({ ...x, loading: false, error: errMsg(e, 'Could not load') })); } }, [path, key, page, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);
  return { ...s, setPage, reload: load };
};
const Body = ({ l, cols, empty, children }) => (l.loading ? <TableSkeleton cols={cols} /> : l.error ? <EmptyState title={l.error} action={<button className={btnGhost} onClick={l.reload}>Try again</button>} /> : !l.rows.length ? <EmptyState title={empty.title} text={empty.text} /> : children);
const Th = ({ children }) => <th className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-[#5b6b7b]">{children}</th>;

const useStudents = () => { const [s, setS] = useState([]); useEffect(() => { apiClient.get('/students', { params: { limit: 1000 } }).then((r) => setS(r.data.students || [])).catch(() => {}); }, []); return s; };
const StudentSelect = ({ value, onChange, students }) => (
  <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Choose a student</option>{students.map((s) => <option key={s._id} value={s._id}>{s.name}{s.rollNumber ? ` · ${s.rollNumber}` : ''}</option>)}</select>
);

/* ───────── overview ───────── */
const Overview = ({ onGo }) => {
  const [o, setO] = useState(null); const [rec, setRec] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { apiClient.get('/finance/overview').then((r) => setO(r.data)).catch((e) => setErr(errMsg(e))); }, []);
  if (err) return <EmptyState title={err} />; if (!o) return <div className="skeleton h-32" />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoiced" value={pkr(o.invoiced)} /><Stat label="Collected" value={pkr(o.collected)} tone="text-[#215a52]" />
        <Stat label="Outstanding" value={pkr(o.outstanding)} sub={`${pkr(o.overdue)} overdue`} tone="text-[#8a4636]" /><Stat label="Unused credit" value={pkr(o.unallocatedCredit)} sub="Paid but not yet on an invoice" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <button className="text-start" onClick={() => onGo('bank')}><Stat label="Bank credits to match" value={o.unmatchedCredits} sub={pkr(o.unmatchedAmount)} /></button>
        <button className="text-start" onClick={() => onGo('approvals')}><Stat label="Waiting for approval" value={o.pendingApprovals} sub="Refunds, write-offs, credit notes" /></button>
        <button className="text-start" onClick={() => onGo('till')}><Stat label="Tills open" value={o.openTills} sub="Close each at the end of the shift" /></button>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-[#1b2837]">Check the books</p><p className="text-sm text-[#5b6b7b]">Confirms every invoice equals the payments placed on it.</p></div>
          <button className={btnGhost} onClick={async () => { try { setRec((await apiClient.get('/finance/reconcile')).data); } catch (e) { toast.error(errMsg(e)); } }}>Run check</button></div>
        {rec && <div className="mt-3 text-sm">{rec.ok ? <p className="flex items-center gap-2 text-[#215a52]"><CheckCircle2 className="h-4 w-4" />All {rec.checked.invoices} invoices and {rec.checked.payments} payments agree.</p> : <ul className="list-disc ps-5 text-[#8a4636]">{rec.problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}</div>}
      </Card>
    </div>
  );
};

/* ───────── invoices ───────── */
const Generate = ({ onClose, onDone }) => {
  const [classes, setClasses] = useState([]); const [f, setF] = useState({ classId: '', period: '', dueDate: '' }); const [prev, setPrev] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { apiClient.get('/classes', { params: { limit: 1000 } }).then((r) => setClasses(r.data.classes || [])).catch(() => {}); }, []);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPrev(null); };
  const run = async (dryRun) => { setBusy(true); try { const r = await apiClient.post('/finance/invoices/generate', { ...f, dryRun }); if (dryRun) setPrev(r.data); else { toast.success(`${r.data.created.length} invoices created`); onDone(); onClose(); } } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const ok = f.classId && f.period.trim() && f.dueDate;
  return (
    <Modal title="Generate invoices" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Class"><select className={inputCls} value={f.classId} onChange={set('classId')}><option value="">Choose a class</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.standard}-{c.division}</option>)}</select></Field>
        <Field label="Period" hint="Shown on the invoice, for example November 2026"><input className={inputCls} value={f.period} onChange={set('period')} /></Field>
        <Field label="Due date"><input type="date" className={inputCls} value={f.dueDate} onChange={set('dueDate')} /></Field>
        {prev && <div className="rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-3 text-sm"><p><b>{prev.created.length}</b> invoices would be created for {pkr(prev.created.reduce((t, x) => t + x.total, 0))}{prev.created.some((x) => x.discount) && <>, after {pkr(prev.created.reduce((t, x) => t + x.discount, 0))} of discounts</>}.</p>{prev.skipped.length > 0 && <p className="mt-1 text-[#5b6b7b]">{prev.skipped.length} students skipped: nothing unpaid that is not already invoiced.</p>}</div>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnGhost} disabled={!ok || busy} onClick={() => run(true)}>Preview</button><button className={btnPrimary} disabled={!ok || busy || !prev || !prev.created.length} onClick={() => run(false)}>Create invoices</button></div>
    </Modal>
  );
};

const Challan = ({ id, onClose }) => {
  const [d, setD] = useState(null);
  useEffect(() => { apiClient.get(`/finance/invoices/${id}/challan`).then((r) => setD(r.data)).catch((e) => { toast.error(errMsg(e)); onClose(); }); }, [id, onClose]);
  if (!d) return <Modal title="Fee challan" onClose={onClose}><div className="skeleton h-40" /></Modal>;
  const pi = d.school.paymentInfo || {};
  return (
    <Modal title="Fee challan" onClose={onClose} wide>
      <style>{'@media print{body *{visibility:hidden}.challan,.challan *{visibility:visible}.challan{position:absolute;inset:0}.noprint{display:none}}'}</style>
      <div className="challan grid gap-3 md:grid-cols-3">
        {d.copies.map((c) => (
          <div key={c} className="rounded-lg border border-dashed border-[#9aa8b5] p-3 text-xs text-[#1b2837]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5b6b7b]">{c}</p>
            <p className="mt-1 text-sm font-bold">{d.school.name}</p>
            <p className="mt-2">Student: <b>{d.student.name}</b> ({d.student.class})</p>
            <p>Invoice {d.invoice.number} · {d.invoice.period}</p><p>Due {fmtDate(d.invoice.dueDate)}</p>
            <table className="mt-2 w-full"><tbody>{d.invoice.lines.map((l, i) => <tr key={i}><td className="py-0.5">{l.title}</td><td className="text-end" dir="ltr">{(l.net).toLocaleString('en-PK')}</td></tr>)}</tbody></table>
            <p className="mt-2 border-t border-[#e3e7e7] pt-1 text-sm font-bold">Pay {pkr(d.invoice.balance)}</p>
            <p className="mt-2 font-mono text-sm tracking-widest" dir="ltr">{d.invoice.challanCode}</p><p className="text-[10px] text-[#5b6b7b]">Write this code in the bank transfer reference.</p>
            {(pi.bankName || pi.iban) && <p className="mt-1 text-[10px]">{pi.bankName} {pi.accountTitle} {pi.iban || pi.accountNumber}</p>}
          </div>
        ))}
      </div>
      <div className="noprint mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Close</button><button className={btnPrimary} onClick={() => window.print()}><Printer className="h-4 w-4" />Print</button></div>
    </Modal>
  );
};

const Invoices = () => {
  const [status, setStatus] = useState(''); const [search, setSearch] = useState(''); const [gen, setGen] = useState(false); const [show, setShow] = useState(null); const [voidFor, setVoidFor] = useState(null); const [reason, setReason] = useState('');
  const l = useList('/finance/invoices', 'invoices', { status, search });
  const doVoid = async () => { try { await apiClient.post(`/finance/invoices/${voidFor._id}/void`, { reason }); toast.success('Invoice voided'); setVoidFor(null); setReason(''); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] p-3">
        <input className={`${inputCls} !w-56`} placeholder="Student, invoice or challan" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${inputCls} !w-40`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['Open', 'PartiallyPaid', 'Paid', 'WrittenOff', 'Void'].map((s) => <option key={s}>{s}</option>)}</select>
        <button className={`${btnPrimary} ms-auto`} onClick={() => setGen(true)}>Generate invoices</button>
      </div>
      <Body l={l} cols={6} empty={{ title: 'No invoices yet', text: 'Generate invoices for a class to give each family one challan to pay.' }}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Invoice</Th><Th>Student</Th><Th>Due</Th><Th>Total</Th><Th>Balance</Th><Th>Status</Th><Th /></tr></thead><tbody>
          {l.rows.map((i) => <tr key={i._id} className="border-t border-[#e3e7e7]"><td className="px-3 py-2 font-medium">{i.number}<div className="text-xs text-[#5b6b7b]">{i.period}</div></td><td className="px-3 py-2">{i.studentName}</td><td className="px-3 py-2">{fmtDate(i.dueDate)}</td><td className="px-3 py-2" dir="ltr">{pkr(i.total)}</td><td className="px-3 py-2" dir="ltr">{pkr(i.balance)}</td><td className="px-3 py-2"><Pill value={TONE[i.status]}>{i.status === 'PartiallyPaid' ? 'Part paid' : i.status === 'WrittenOff' ? 'Written off' : i.status}</Pill></td>
            <td className="px-3 py-2 text-end"><button className="text-xs font-semibold text-[#2a5cac]" onClick={() => setShow(i._id)} disabled={i.status === 'Void'}>Challan</button>{!['Void'].includes(i.status) && i.paid === 0 && <button className="ms-3 text-xs font-semibold text-[#9f1239]" onClick={() => setVoidFor(i)}>Void</button>}</td></tr>)}
        </tbody></table></div>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {gen && <Generate onClose={() => setGen(false)} onDone={l.reload} />}{show && <Challan id={show} onClose={() => setShow(null)} />}
      {voidFor && <Modal title={`Void ${voidFor.number}`} onClose={() => setVoidFor(null)}><Field label="Why is it void?"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setVoidFor(null)}>Cancel</button><button className={btnDanger} disabled={reason.trim().length < 3} onClick={doVoid}>Void invoice</button></div></Modal>}
    </Card>
  );
};

/* ───────── payments ───────── */
const Receive = ({ onClose, onDone, till }) => {
  const students = useStudents(); const [f, setF] = useState({ studentId: '', amount: '', method: till ? 'cash' : 'bank', reference: '', invoiceId: '' }); const [invs, setInvs] = useState([]); const [busy, setBusy] = useState(false); const [key] = useState(() => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => { if (f.studentId) apiClient.get('/finance/invoices', { params: { studentId: f.studentId, limit: 50 } }).then((r) => setInvs((r.data.invoices || []).filter((i) => ['Open', 'PartiallyPaid'].includes(i.status)))).catch(() => {}); else setInvs([]); }, [f.studentId]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => { setBusy(true); try { const r = await apiClient.post('/finance/payments', { ...f, amount: Number(f.amount), invoiceId: f.invoiceId || undefined }, { headers: { 'Idempotency-Key': key } }); toast.success(r.data.payment.receiptNo ? `Receipt ${r.data.payment.receiptNo}` : 'Recorded. Confirm it once the bank shows the money.'); onDone(); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Modal title="Receive a payment" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Student"><StudentSelect students={students} value={f.studentId} onChange={(v) => setF({ ...f, studentId: v, invoiceId: '' })} /></Field>
        <Field label="Pay which invoice" hint="Leave on automatic to pay the oldest first"><select className={inputCls} value={f.invoiceId} onChange={set('invoiceId')}><option value="">Automatic, oldest first</option>{invs.map((i) => <option key={i._id} value={i._id}>{i.number} · {pkr(i.balance)} left</option>)}</select></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (Rs)"><input inputMode="numeric" className={inputCls} value={f.amount} onChange={set('amount')} /></Field>
          <Field label="Method"><select className={inputCls} value={f.method} onChange={set('method')}>{['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque', 'other'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        </div>
        {f.method === 'cash' ? (till ? <p className="rounded-lg bg-[#edf5f3] p-3 text-sm text-[#215a52]">Cash goes into your open till and gets a receipt straight away.</p> : <p className="rounded-lg bg-[#fbf0ec] p-3 text-sm text-[#8a4636]">Open your till on the Till tab before taking cash.</p>)
          : <Field label="Transaction reference" hint="Used to match it with the bank statement"><input className={inputCls} value={f.reference} onChange={set('reference')} /></Field>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !f.studentId || !Number(f.amount) || (f.method === 'cash' && !till)} onClick={save}>Save payment</button></div>
    </Modal>
  );
};

const Payments = ({ till }) => {
  const [status, setStatus] = useState(''); const [rcv, setRcv] = useState(false); const [conf, setConf] = useState(null); const [rc, setRc] = useState(null);
  const l = useList('/finance/payments', 'payments', { status });
  const openReceipt = async (id) => { try { setRc((await apiClient.get(`/finance/payments/${id}/receipt`)).data); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] p-3">
        <select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All payments</option>{['Pending', 'Confirmed', 'Rejected'].map((s) => <option key={s}>{s}</option>)}</select>
        <button className={`${btnPrimary} ms-auto`} onClick={() => setRcv(true)}>Receive payment</button>
      </div>
      <Body l={l} cols={6} empty={{ title: 'No payments yet', text: 'Receive cash at your till, or record a bank transfer and match it to the statement.' }}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Receipt</Th><Th>Student</Th><Th>Method</Th><Th>Amount</Th><Th>Received</Th><Th>Status</Th><Th /></tr></thead><tbody>
          {l.rows.map((p) => <tr key={p._id} className="border-t border-[#e3e7e7]"><td className="px-3 py-2 font-medium">{p.receiptNo || '—'}</td><td className="px-3 py-2">{p.studentName}</td><td className="px-3 py-2">{p.method}<div className="text-xs text-[#5b6b7b]">{p.reference}</div></td><td className="px-3 py-2" dir="ltr">{pkr(p.amount)}{p.refunded > 0 && <div className="text-xs text-[#8a4636]">refunded {pkr(p.refunded)}</div>}</td><td className="px-3 py-2">{fmtDate(p.receivedAt)}</td><td className="px-3 py-2"><Pill value={TONE[p.status]}>{p.status}</Pill></td>
            <td className="px-3 py-2 text-end">{p.status === 'Confirmed' && <button className="text-xs font-semibold text-[#2a5cac]" onClick={() => openReceipt(p._id)}>Receipt</button>}{p.status === 'Pending' && <button className="text-xs font-semibold text-[#2a5cac]" onClick={() => setConf(p)}>Confirm</button>}</td></tr>)}
        </tbody></table></div>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {rcv && <Receive till={till} onClose={() => setRcv(false)} onDone={l.reload} />}
      {conf && <ConfirmPayment pay={conf} onClose={() => setConf(null)} onDone={l.reload} />}
      {rc && <Modal title={`Receipt ${rc.receipt.number}`} onClose={() => setRc(null)}><div className="space-y-1 text-sm"><p className="font-bold">{rc.school.name}</p><p>Received from the family of <b>{rc.student.name}</b></p><p>{fmtDate(rc.receipt.date)} · {rc.receipt.method} {rc.receipt.reference}</p><p className="text-lg font-bold" dir="ltr">{pkr(rc.receipt.amount)}</p>{rc.receipt.allocations.map((a, i) => <p key={i} className="text-[#5b6b7b]">{pkr(a.amount)} towards {a.invoiceNumber}</p>)}{rc.receipt.credit > 0 && <p className="text-[#5b6b7b]">{pkr(rc.receipt.credit)} kept as credit</p>}<p className="text-xs text-[#5b6b7b]">Cashier: {rc.receipt.cashier}</p></div></Modal>}
    </Card>
  );
};

const ConfirmPayment = ({ pay, onClose, onDone }) => {
  const [lines, setLines] = useState([]); const [pick, setPick] = useState(''); const [note, setNote] = useState(''); const [rej, setRej] = useState(false);
  useEffect(() => { apiClient.get('/finance/bank/lines', { params: { status: 'Unmatched', limit: 100 } }).then((r) => setLines((r.data.lines || []).filter((x) => x.amount === pay.amount))).catch(() => {}); }, [pay.amount]);
  const go = async () => { try { await apiClient.post(`/finance/payments/${pay._id}/confirm`, rej ? { reject: true, note } : { bankLineId: pick }); toast.success(rej ? 'Payment rejected' : 'Payment confirmed'); onDone(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={`Confirm ${pkr(pay.amount)} ${pay.method}`} onClose={onClose}>
      {rej ? <Field label="Why is it rejected?"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field> : (
        <Field label="Matching bank credit" hint="Only an unmatched credit of exactly this amount can confirm it">
          {lines.length ? <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose the bank line</option>{lines.map((x) => <option key={x._id} value={x._id}>{fmtDate(x.date)} · {x.reference || x.description}</option>)}</select> : <p className="rounded-lg bg-[#fbf0ec] p-3 text-sm text-[#8a4636]">No unmatched bank credit of {pkr(pay.amount)}. Import the statement on the Bank tab first.</p>}
        </Field>)}
      <div className="mt-4 flex items-center justify-between"><button className="text-xs font-semibold text-[#9f1239]" onClick={() => setRej(!rej)}>{rej ? 'Back' : 'Reject this payment'}</button><div className="flex gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={rej ? note.trim().length < 3 : !pick} onClick={go}>{rej ? 'Reject' : 'Confirm'}</button></div></div>
    </Modal>
  );
};

/* ───────── till ───────── */
const Till = ({ mine, onChanged }) => {
  const l = useList('/finance/sessions', 'sessions'); const [fl, setFl] = useState('0'); const [counted, setCounted] = useState(''); const [note, setNote] = useState(''); const [slip, setSlip] = useState(''); const [hint, setHint] = useState(null);
  const open = async () => { try { await apiClient.post('/finance/sessions/open', { openingFloat: Number(fl) || 0 }); toast.success('Till open'); l.reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const close = async () => { try { await apiClient.post(`/finance/sessions/${mine._id}/close`, { countedCash: Number(counted), varianceNote: note, depositSlip: slip }); toast.success('Till closed'); setHint(null); l.reload(); onChanged(); } catch (e) { if (e.response?.status === 422 && e.response.data.variance !== undefined) setHint(e.response.data); toast.error(errMsg(e)); } };
  return (
    <div className="space-y-4">
      <Card>
        {mine ? (<div className="space-y-3"><p className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-[#2c776c]" />Your till is open since {new Date(mine.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} with {pkr(mine.openingFloat)}</p>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Cash counted (Rs)"><input inputMode="numeric" className={inputCls} value={counted} onChange={(e) => setCounted(e.target.value)} /></Field><Field label="Deposit slip number"><input className={inputCls} value={slip} onChange={(e) => setSlip(e.target.value)} /></Field>{hint && <Field label={`Explain the ${hint.variance > 0 ? 'surplus' : 'shortfall'} of ${pkr(Math.abs(hint.variance))}`}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}</div>
          <button className={btnPrimary} disabled={counted === ''} onClick={close}>Close till</button></div>)
          : (<div className="flex flex-wrap items-end gap-3"><Field label="Opening cash (Rs)"><input inputMode="numeric" className={`${inputCls} !w-40`} value={fl} onChange={(e) => setFl(e.target.value)} /></Field><button className={btnPrimary} onClick={open}>Open my till</button><p className="text-sm text-[#5b6b7b]">You need an open till to take cash.</p></div>)}
      </Card>
      <Card className="!p-0"><Body l={l} cols={5} empty={{ title: 'No shifts yet' }}><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Cashier</Th><Th>Opened</Th><Th>Expected</Th><Th>Counted</Th><Th>Difference</Th><Th>Status</Th></tr></thead><tbody>
        {l.rows.map((s) => <tr key={s._id} className="border-t border-[#e3e7e7]"><td className="px-3 py-2">{s.cashierName}</td><td className="px-3 py-2">{fmtDate(s.openedAt)}</td><td className="px-3 py-2" dir="ltr">{s.status === 'Closed' ? pkr(s.expectedCash) : '—'}</td><td className="px-3 py-2" dir="ltr">{s.status === 'Closed' ? pkr(s.countedCash) : '—'}</td><td className={`px-3 py-2 ${s.variance ? 'font-semibold text-[#8a4636]' : ''}`} dir="ltr">{s.status === 'Closed' ? (s.variance === 0 ? 'None' : `${s.variance > 0 ? '+' : '−'}${Math.abs(s.variance)}`) : '—'}</td><td className="px-3 py-2"><Pill value={s.status === 'Open' ? 'Pending' : 'Confirmed'}>{s.status}</Pill></td></tr>)}
      </tbody></table></div><Pager pagination={l.pagination} onPage={l.setPage} /></Body></Card>
    </div>
  );
};

/* ───────── bank ───────── */
const Bank = () => {
  const l = useList('/finance/bank/lines', 'lines', { status: 'Unmatched' }); const [imp, setImp] = useState(false); const [match, setMatch] = useState(null); const [ign, setIgn] = useState(null); const [why, setWhy] = useState('');
  const doIgnore = async () => { try { await apiClient.post(`/finance/bank/lines/${ign._id}/ignore`, { reason: why }); toast.success('Marked as not a fee payment'); setIgn(null); setWhy(''); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const quick = async (x) => { try { await apiClient.post(`/finance/bank/lines/${x._id}/match`, { invoiceId: x.suggestion.invoiceId }); toast.success('Matched and receipted'); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <div className="flex items-center gap-2 border-b border-[#e3e7e7] p-3"><p className="text-sm text-[#5b6b7b]">Bank credits wait here until a person confirms each match.</p><button className={`${btnPrimary} ms-auto`} onClick={() => setImp(true)}><Upload className="h-4 w-4" />Import statement</button></div>
      <Body l={l} cols={5} empty={{ title: 'Nothing waiting', text: 'Import a CSV statement from your bank to see credits to match.' }}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Date</Th><Th>Description</Th><Th>Amount</Th><Th>Suggestion</Th><Th /></tr></thead><tbody>
          {l.rows.map((x) => <tr key={x._id} className="border-t border-[#e3e7e7]"><td className="px-3 py-2">{fmtDate(x.date)}</td><td className="px-3 py-2">{x.description}<div className="text-xs text-[#5b6b7b]">{x.reference}</div></td><td className="px-3 py-2" dir="ltr">{pkr(x.amount)}</td>
            <td className="px-3 py-2">{x.suggestion?.invoiceId ? <div><span className="font-medium">{x.suggestion.studentName}</span> · {x.suggestion.invoiceNumber}<div className="text-xs text-[#5b6b7b]">{x.suggestion.confidence} confidence: {x.suggestion.why}</div></div> : <span className="text-[#5b6b7b]">No suggestion</span>}</td>
            <td className="px-3 py-2 text-end whitespace-nowrap">{x.suggestion?.invoiceId && <button className="text-xs font-semibold text-[#2a5cac]" onClick={() => quick(x)}>Accept</button>}<button className="ms-3 text-xs font-semibold text-[#2a5cac]" onClick={() => setMatch(x)}>Choose invoice</button><button className="ms-3 text-xs font-semibold text-[#5b6b7b]" onClick={() => setIgn(x)}>Not a fee</button></td></tr>)}
        </tbody></table></div>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {imp && <ImportStatement onClose={() => setImp(false)} onDone={l.reload} />}{match && <MatchLine line={match} onClose={() => setMatch(null)} onDone={l.reload} />}
      {ign && <Modal title={`Ignore ${pkr(ign.amount)}`} onClose={() => setIgn(null)}><Field label="Why is this not a fee payment?"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setIgn(null)}>Cancel</button><button className={btnPrimary} disabled={why.trim().length < 3} onClick={doIgnore}>Mark as not a fee</button></div></Modal>}
    </Card>
  );
};
const ImportStatement = ({ onClose, onDone }) => {
  const [csv, setCsv] = useState(''); const [name, setName] = useState(''); const [prev, setPrev] = useState(null); const [busy, setBusy] = useState(false);
  const pickFile = async (e) => { const f = e.target.files[0]; if (!f) return; setName(f.name); setCsv(await f.text()); setPrev(null); };
  const run = async (dryRun) => { setBusy(true); try { const r = await apiClient.post('/finance/bank/import', { csv, fileName: name, dryRun }); if (dryRun) setPrev(r.data); else if (r.data.duplicate) toast(r.data.message); else { toast.success(`${r.data.imported} credits imported`); onDone(); onClose(); } } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Modal title="Import bank statement" onClose={onClose} wide>
      <p className="text-sm text-[#5b6b7b]">Upload a CSV with a date column and a credit or amount column. Description and reference columns help matching.</p>
      <input type="file" accept=".csv,text/csv" className="mt-3 text-sm" onChange={pickFile} />
      {prev && (<div className="mt-3 space-y-2 text-sm"><p><b>{prev.willImport}</b> credits will be imported{prev.duplicates > 0 && <>, {prev.duplicates} already imported</>}.</p>{prev.errors.length > 0 && <ul className="list-disc ps-5 text-[#8a4636]">{prev.errors.slice(0, 8).map((x) => <li key={x.row}>{x.message}</li>)}</ul>}
        <div className="max-h-48 overflow-auto rounded-lg border border-[#e3e7e7]"><table className="w-full text-xs"><tbody>{prev.preview.slice(0, 30).map((x, i) => <tr key={i} className="border-t border-[#e3e7e7] first:border-0"><td className="px-2 py-1">{fmtDate(x.date)}</td><td className="px-2 py-1">{x.description}</td><td className="px-2 py-1" dir="ltr">{pkr(x.amount)}</td><td className="px-2 py-1 text-[#5b6b7b]">{x.suggestion ? `${x.suggestion.studentName} (${x.suggestion.confidence})` : ''}</td></tr>)}</tbody></table></div></div>)}
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnGhost} disabled={!csv || busy} onClick={() => run(true)}>Preview</button><button className={btnPrimary} disabled={!csv || busy || !prev || !prev.willImport} onClick={() => run(false)}>Import</button></div>
    </Modal>
  );
};
const MatchLine = ({ line, onClose, onDone }) => {
  const [search, setSearch] = useState(''); const [rows, setRows] = useState([]);
  useEffect(() => { const t = setTimeout(() => apiClient.get('/finance/invoices', { params: { search, limit: 20 } }).then((r) => setRows((r.data.invoices || []).filter((i) => ['Open', 'PartiallyPaid'].includes(i.status)))).catch(() => {}), 250); return () => clearTimeout(t); }, [search]);
  const go = async (i) => { try { await apiClient.post(`/finance/bank/lines/${line._id}/match`, { invoiceId: i._id }); toast.success('Matched and receipted'); onDone(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={`Match ${pkr(line.amount)}`} onClose={onClose}>
      <input className={inputCls} placeholder="Student name, invoice or challan code" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="mt-3 max-h-64 space-y-1 overflow-auto">{rows.length ? rows.map((i) => <button key={i._id} className="flex w-full items-center justify-between rounded-lg border border-[#e3e7e7] px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]" onClick={() => go(i)}><span><b>{i.studentName}</b> · {i.number}</span><span dir="ltr">{pkr(i.balance)} left</span></button>) : <p className="p-3 text-sm text-[#5b6b7b]">No open invoices found.</p>}</div>
    </Modal>
  );
};

/* ───────── approvals & rules ───────── */
const Approvals = () => {
  const l = useList('/finance/adjustments', 'adjustments'); const [ask, setAsk] = useState(false); const [dec, setDec] = useState(null); const [note, setNote] = useState('');
  const decide = async (a, decision) => { try { await apiClient.post(`/finance/adjustments/${a._id}/decide`, { decision, note }); toast.success(decision === 'approve' ? 'Approved' : 'Rejected'); setDec(null); setNote(''); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <div className="flex items-center gap-2 border-b border-[#e3e7e7] p-3"><p className="text-sm text-[#5b6b7b]">Another admin must approve every refund, write-off and credit note.</p><button className={`${btnPrimary} ms-auto`} onClick={() => setAsk(true)}>New request</button></div>
      <Body l={l} cols={5} empty={{ title: 'No requests', text: 'Refunds, write-offs and credit notes appear here for a second person to approve.' }}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Type</Th><Th>Student</Th><Th>Amount</Th><Th>Why</Th><Th>Status</Th><Th /></tr></thead><tbody>
          {l.rows.map((a) => <tr key={a._id} className="border-t border-[#e3e7e7]"><td className="px-3 py-2 capitalize">{a.type}<div className="text-xs text-[#5b6b7b]">by {a.requestedByName}</div></td><td className="px-3 py-2">{a.studentName}</td><td className="px-3 py-2" dir="ltr">{pkr(a.amount)}</td><td className="px-3 py-2">{REASONS.find((r) => r[0] === a.reasonCode)?.[1]}<div className="text-xs text-[#5b6b7b]">{a.note}</div></td><td className="px-3 py-2"><Pill value={TONE[a.status]}>{a.status}</Pill>{a.voucherNo && <div className="text-xs text-[#5b6b7b]">{a.voucherNo}</div>}</td><td className="px-3 py-2 text-end">{a.status === 'Requested' && <button className="text-xs font-semibold text-[#2a5cac]" onClick={() => setDec(a)}>Decide</button>}</td></tr>)}
        </tbody></table></div>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {ask && <RequestAdjustment onClose={() => setAsk(false)} onDone={l.reload} />}
      {dec && <Modal title={`${dec.type} of ${pkr(dec.amount)}`} onClose={() => setDec(null)}><p className="text-sm">{dec.studentName} · asked by {dec.requestedByName}</p><p className="mt-1 text-sm text-[#5b6b7b]">{dec.note}</p><Field label="Decision note" hint="Required to reject"><input className={`${inputCls} mt-2`} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setDec(null)}>Cancel</button><button className={btnDanger} disabled={note.trim().length < 3} onClick={() => decide(dec, 'reject')}>Reject</button><button className={btnPrimary} onClick={() => decide(dec, 'approve')}>Approve</button></div></Modal>}
    </Card>
  );
};
const RequestAdjustment = ({ onClose, onDone }) => {
  const students = useStudents(); const [f, setF] = useState({ type: 'credit-note', studentId: '', targetId: '', amount: '', reasonCode: 'billing-error', note: '' }); const [targets, setTargets] = useState([]);
  useEffect(() => { if (!f.studentId) return setTargets([]); const refund = f.type === 'refund'; apiClient.get(refund ? '/finance/payments' : '/finance/invoices', { params: { studentId: f.studentId, limit: 50 } }).then((r) => setTargets(refund ? (r.data.payments || []).filter((p) => p.status === 'Confirmed' && p.amount > p.refunded) : (r.data.invoices || []).filter((i) => ['Open', 'PartiallyPaid'].includes(i.status)))).catch(() => {}); }, [f.studentId, f.type]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'type' ? { targetId: '' } : {}) });
  const save = async () => { try { await apiClient.post('/finance/adjustments', { type: f.type, amount: Number(f.amount), reasonCode: f.reasonCode, note: f.note, ...(f.type === 'refund' ? { paymentId: f.targetId } : { invoiceId: f.targetId }) }); toast.success('Sent for approval'); onDone(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title="Request an adjustment" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Kind"><select className={inputCls} value={f.type} onChange={set('type')}><option value="credit-note">Credit note (reduce an invoice)</option><option value="write-off">Write-off (give up the balance)</option><option value="refund">Refund (give money back)</option></select></Field>
        <Field label="Student"><StudentSelect students={students} value={f.studentId} onChange={(v) => setF({ ...f, studentId: v, targetId: '' })} /></Field>
        <Field label={f.type === 'refund' ? 'Payment to refund' : 'Invoice'}><select className={inputCls} value={f.targetId} onChange={set('targetId')}><option value="">Choose</option>{targets.map((t) => <option key={t._id} value={t._id}>{f.type === 'refund' ? `${t.receiptNo} · ${pkr(t.amount - t.refunded)} refundable` : `${t.number} · ${pkr(t.balance)} left`}</option>)}</select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Amount (Rs)"><input inputMode="numeric" className={inputCls} value={f.amount} onChange={set('amount')} /></Field><Field label="Reason"><select className={inputCls} value={f.reasonCode} onChange={set('reasonCode')}>{REASONS.map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></Field></div>
        <Field label="Explain in a sentence"><input className={inputCls} value={f.note} onChange={set('note')} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.targetId || !Number(f.amount) || f.note.trim().length < 5} onClick={save}>Send for approval</button></div>
    </Modal>
  );
};

const Rules = () => {
  const l = useList('/finance/rules', 'rules'); const [add, setAdd] = useState(false); const [set, setSet] = useState({ graceDays: 0, lateFeeAmount: 0 }); const students = useStudents();
  const [f, setF] = useState({ name: '', kind: 'concession', valueType: 'percent', value: '', appliesTo: 'tuition', studentId: '', reason: '' });
  useEffect(() => { apiClient.get('/finance/settings').then((r) => setSet(r.data.settings)).catch(() => {}); }, []);
  const saveSet = async () => { try { await apiClient.put('/finance/settings', { graceDays: Number(set.graceDays), lateFeeAmount: Number(set.lateFeeAmount) }); toast.success('Saved'); } catch (e) { toast.error(errMsg(e)); } };
  const runLate = async () => { try { const r = await apiClient.post('/finance/late-fees/run'); toast.success(`Late fee added to ${r.data.applied} invoices`); } catch (e) { toast.error(errMsg(e)); } };
  const create = async () => { try { await apiClient.post('/finance/rules', { ...f, value: Number(f.value), studentId: f.studentId || undefined }); toast.success('Sent for approval'); setAdd(false); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const decide = async (r, decision) => { try { await apiClient.post(`/finance/rules/${r._id}/decide`, { decision }); toast.success('Done'); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const sf = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <Card><p className="font-semibold">Late fees</p><div className="mt-2 flex flex-wrap items-end gap-3"><Field label="Grace days"><input inputMode="numeric" className={`${inputCls} !w-28`} value={set.graceDays} onChange={(e) => setSet({ ...set, graceDays: e.target.value })} /></Field><Field label="Late fee (Rs)"><input inputMode="numeric" className={`${inputCls} !w-32`} value={set.lateFeeAmount} onChange={(e) => setSet({ ...set, lateFeeAmount: e.target.value })} /></Field><button className={btnGhost} onClick={saveSet}>Save</button><button className={btnGhost} onClick={runLate}>Apply to overdue invoices</button></div><p className="mt-2 text-xs text-[#5b6b7b]">Each invoice gets the late fee once.</p></Card>
      <Card className="!p-0">
        <div className="flex items-center gap-2 border-b border-[#e3e7e7] p-3"><p className="text-sm text-[#5b6b7b]">Scholarships, concessions and sibling discounts. Another admin must approve each one before it applies.</p><button className={`${btnPrimary} ms-auto`} onClick={() => setAdd(true)}>New rule</button></div>
        <Body l={l} cols={5} empty={{ title: 'No discount rules', text: 'Add a rule and a second admin approves it before it affects invoices.' }}>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Rule</Th><Th>Value</Th><Th>Valid</Th><Th>Status</Th><Th /></tr></thead><tbody>
            {l.rows.map((r) => <tr key={r._id} className="border-t border-[#e3e7e7]"><td className="px-3 py-2 font-medium">{r.name}<div className="text-xs capitalize text-[#5b6b7b]">{r.kind} · {r.reason}</div></td><td className="px-3 py-2" dir="ltr">{r.valueType === 'percent' ? `${r.value}%` : pkr(r.value)}</td><td className="px-3 py-2">{fmtDate(r.validFrom)} – {r.validTo ? fmtDate(r.validTo) : 'open'}</td><td className="px-3 py-2"><Pill value={TONE[r.status]}>{r.status}</Pill></td>
              <td className="px-3 py-2 text-end whitespace-nowrap">{r.status === 'Pending' && <><button className="text-xs font-semibold text-[#2a5cac]" onClick={() => decide(r, 'approve')}>Approve</button><button className="ms-3 text-xs font-semibold text-[#9f1239]" onClick={() => decide(r, 'reject')}>Reject</button></>}{r.status === 'Active' && <button className="text-xs font-semibold text-[#5b6b7b]" onClick={() => decide(r, 'end')}>End now</button>}</td></tr>)}
          </tbody></table></div>
        </Body>
      </Card>
      {add && <Modal title="New discount rule" onClose={() => setAdd(false)}><div className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={sf('name')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Kind"><select className={inputCls} value={f.kind} onChange={sf('kind')}><option value="concession">Concession</option><option value="scholarship">Scholarship (one student)</option><option value="sibling">Sibling discount</option></select></Field><Field label="Applies to"><select className={inputCls} value={f.appliesTo} onChange={sf('appliesTo')}><option value="tuition">Tuition only</option><option value="all">All fees</option></select></Field>
          <Field label="Type"><select className={inputCls} value={f.valueType} onChange={sf('valueType')}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></Field><Field label={f.valueType === 'percent' ? 'Percent' : 'Rupees'}><input inputMode="numeric" className={inputCls} value={f.value} onChange={sf('value')} /></Field></div>
        {f.kind === 'scholarship' && <Field label="Student"><StudentSelect students={students} value={f.studentId} onChange={(v) => setF({ ...f, studentId: v })} /></Field>}
        <Field label="Why does this rule exist?"><input className={inputCls} value={f.reason} onChange={sf('reason')} /></Field>
      </div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setAdd(false)}>Cancel</button><button className={btnPrimary} disabled={!f.name.trim() || !Number(f.value) || f.reason.trim().length < 5} onClick={create}>Send for approval</button></div></Modal>}
    </div>
  );
};

/* ───────── page ───────── */
const TABS = [['overview', 'Overview'], ['invoices', 'Invoices'], ['payments', 'Payments'], ['till', 'Till'], ['bank', 'Bank'], ['approvals', 'Approvals'], ['rules', 'Rules & late fees']];
export default function Finance() {
  const [tab, setTab] = useState('overview'); const [mine, setMine] = useState(null);
  const loadMine = useCallback(() => apiClient.get('/finance/sessions', { params: { limit: 1 } }).then((r) => setMine(r.data.mine || null)).catch(() => {}), []);
  useEffect(() => { loadMine(); }, [loadMine]);
  const body = useMemo(() => ({ overview: <Overview onGo={setTab} />, invoices: <Invoices />, payments: <Payments till={mine} />, till: <Till mine={mine} onChanged={loadMine} />, bank: <Bank />, approvals: <Approvals />, rules: <Rules /> }[tab]), [tab, mine, loadMine]);
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Fee collection</h2><p className="text-sm text-[#5b6b7b]">Invoices, receipts, the cash till, bank matching and approvals.</p></div>
      <div className="flex gap-1 overflow-x-auto border-b border-[#e3e7e7]" role="tablist">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {body}
    </div>
  );
}
