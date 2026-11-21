import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Modal, Field, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, PBadge, Dl, Trail, useGet, Loading, PageBar, useDebounced, Note, AskForm, money, day, key, download, METHODS, today } from './pcKit';

// What can be done to one bill, in one place, so the order screen and the bills list behave the same.
function BillButtons({ b, admin, officer, onDone }) {
  const [ask, setAsk] = useState(null);
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); onDone(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="flex flex-wrap gap-1">
      {admin && b.status === 'entered' && <><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Approve bill ${b.billNo}`} onClick={() => (b.match === 'exception' ? setAsk('exception') : run(() => apiClient.post(`/procure/bills/${b._id}/decide`, { approve: true }), 'Bill approved.'))}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Turn down bill ${b.billNo}`} onClick={() => setAsk('reject')}>Turn down</button></>}
      {admin && b.status === 'approved' && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Pay bill ${b.billNo}`} onClick={() => setAsk('pay')}>Pay</button>}
      {officer && ['entered', 'approved'].includes(b.status) && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Cancel bill ${b.billNo}`} onClick={() => setAsk('void')}>Cancel</button>}
      {admin && b.status === 'paid' && b.amount - (b.creditTotal || 0) > 0 && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Credit note for ${b.billNo}`} onClick={() => setAsk('credit')}>Credit note</button>}
      {ask === 'exception' && <Reason title="Approve a bill that does not match" text={b.matchNote} confirm="Approve anyway" danger={false} min={10} label="Why is it being approved? (kept in the record)" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/bills/${b._id}/decide`, { approve: true, exceptionReason: v }); setAsk(null); toast.success('Bill approved.'); onDone(); }} />}
      {ask === 'reject' && <Reason title="Turn this bill down" text="It can be entered again once it is corrected." confirm="Turn it down" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/bills/${b._id}/decide`, { approve: false, note: v }); setAsk(null); toast.success('Turned down.'); onDone(); }} />}
      {ask === 'void' && <Reason title="Cancel this bill" text="Use this for a bill entered by mistake. A paid bill is corrected with a credit note instead." confirm="Cancel the bill" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/bills/${b._id}/void`, { reason: v }); setAsk(null); toast.success('Bill cancelled.'); onDone(); }} />}
      {ask === 'pay' && <AskForm title={`Pay ${b.billNo}`} intro={`${money(b.amount)} to ${b.vendorName}. A bank transfer goes to the account that has been approved for this supplier.`} confirm="Record the payment" initial={{ method: 'bank_transfer', paidOn: today() }} fields={[{ k: 'method', label: 'How', type: 'select', options: METHODS }, { k: 'reference', label: 'Transfer or cheque reference', hint: 'Not needed for cash.' }, { k: 'paidOn', label: 'Paid on', type: 'date' }]} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/bills/${b._id}/pay`, v); setAsk(null); toast.success('Payment recorded.'); onDone(); }} />}
      {ask === 'credit' && <AskForm title={`Credit note for ${b.billNo}`} intro={`Up to ${money(b.amount - (b.creditTotal || 0))} can still be credited. The money goes back to the budget.`} confirm="Record the credit" fields={[{ k: 'amount', label: 'Credit (Rs)', type: 'number', min: 1, required: true }, { k: 'reason', label: 'Why', type: 'textarea', required: true }]} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/bills/${b._id}/credit`, { amount: Number(v.amount), reason: v.reason }); setAsk(null); toast.success('Credit recorded.'); onDone(); }} />}
    </div>
  );
}

function BillTable({ rows, admin, officer, onDone }) {
  return (
    <Table label="Bills" head={['Bill', 'Supplier invoice', 'Amount', 'Due', 'Check', 'Status', '']} min={820}>
      {rows.map((b) => <tr key={b._id}><Td className="font-mono text-xs">{b.billNo}<div className="font-sans text-[11px] text-[#5b6b7b]">{b.poNo}</div></Td><Td>{b.invoiceNo}<div className="text-xs text-[#5b6b7b]">{b.vendorName} · {day(b.invoiceDate)}</div></Td><Td>{money(b.amount)}{b.creditTotal > 0 && <div className="text-xs text-[#5b6b7b]">{money(b.creditTotal)} credited</div>}</Td><Td>{day(b.dueOn)}</Td><Td><PBadge k="match" s={b.match} />{b.match === 'exception' && <div className="max-w-[16rem] text-xs text-[#8a4636]">{b.matchNote}</div>}</Td><Td><PBadge k="bill" s={b.status} />{b.status === 'paid' && b.pay && <div className="text-xs text-[#5b6b7b]">{b.pay.bankSnapshot || b.pay.method} · {day(b.pay.paidOn)}</div>}</Td><Td><BillButtons b={b} admin={admin} officer={officer} onDone={onDone} /></Td></tr>)}
    </Table>
  );
}

function OrderDetail({ id, admin, officer, onClose, onChange }) {
  const g = useGet(`/procure/orders/${id}`); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null); const [qty, setQty] = useState({}); const [rej, setRej] = useState({}); const [note, setNote] = useState(''); const [ck, setCk] = useState(key()); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const o = g.data?.order; const reload = () => { g.reload(); onChange(); };
  const receive = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const lines = g.data.lines.map((l) => ({ lineId: l._id, qty: Number(qty[l._id] || 0), rejected: Number(rej[l._id] || 0) })).filter((l) => l.qty > 0 || l.rejected > 0);
      if (!lines.length) { setErr('Say how many of at least one item arrived.'); setBusy(false); return; }
      await apiClient.post(`/procure/orders/${id}/receive`, { clientKey: ck, lines, note }); toast.success('Delivery recorded.'); setForm(null); setQty({}); setRej({}); setNote(''); setCk(key()); reload();
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Modal title={o ? `${o.poNo} · ${o.vendorName}` : 'Order'} onClose={onClose} wide>
      <Loading g={g}>{o && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><PBadge k="order" s={o.status} />{g.data.requisition && <span className="text-xs text-[#5b6b7b]">From {g.data.requisition.reqNo}, asked by {g.data.requisition.requesterName}</span>}</div>
          <Dl items={[['Order total', money(o.total)], ['Received so far', money(g.data.receivedValue)], ['Billed', money(o.invoicedTotal)], ['Paid', money(o.paidTotal)], ['Expected', day(o.expectedOn)], ['Still set aside', money(o.committedLeft)]]} />
          <Table label="Order lines" head={['Item', 'Ordered', 'Arrived', 'Sent back', 'Price each']} min={520}>{g.data.lines.map((l) => <tr key={l._id}><Td className="font-medium">{l.description}</Td><Td>{l.qty}</Td><Td>{l.receivedQty}</Td><Td>{l.rejectedQty}</Td><Td>{money(l.unitPrice)}</Td></tr>)}</Table>
          {officer && ['issued', 'part_received'].includes(o.status) && (form === 'receive'
            ? <form onSubmit={receive} className="space-y-2 rounded-xl border border-[#e3e7e7] p-3"><h4 className="text-sm font-semibold">Record a delivery</h4>
              {g.data.lines.map((l) => <div key={l._id} className="grid grid-cols-12 items-end gap-2"><div className="col-span-12 text-sm font-medium sm:col-span-6">{l.description}<span className="ms-2 text-xs font-normal text-[#5b6b7b]">{Math.max(0, l.qty - l.receivedQty)} still to come</span></div>
                <div className="col-span-6 sm:col-span-3"><label className="text-xs text-[#5b6b7b]" htmlFor={`rq${l._id}`}>Arrived ({l.description})</label><input id={`rq${l._id}`} className={inputCls} type="number" min="0" step="1" value={qty[l._id] ?? ''} onChange={(e) => setQty({ ...qty, [l._id]: e.target.value })} /></div>
                <div className="col-span-6 sm:col-span-3"><label className="text-xs text-[#5b6b7b]" htmlFor={`rj${l._id}`}>Damaged, sent back ({l.description})</label><input id={`rj${l._id}`} className={inputCls} type="number" min="0" step="1" value={rej[l._id] ?? ''} onChange={(e) => setRej({ ...rej, [l._id]: e.target.value })} /></div></div>)}
              <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
              <div className="flex gap-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the delivery'}</button><button type="button" className={btnGhost} onClick={() => setForm(null)}>Not now</button></div></form>
            : <button className={btnPrimary} onClick={() => setForm('receive')}>Goods have arrived</button>)}
          {g.data.receipts.length > 0 && <section><h4 className="mb-1 text-sm font-semibold">Deliveries</h4><Table label="Deliveries" head={['Delivery', 'When', 'Value', 'Received by']} min={440}>{g.data.receipts.map((r) => <tr key={r._id}><Td className="font-mono text-xs">{r.grnNo}</Td><Td>{day(r.createdAt)}</Td><Td>{money(r.value)}</Td><Td>{r.receivedByName}</Td></tr>)}</Table></section>}
          <section><div className="mb-1 flex items-center justify-between"><h4 className="text-sm font-semibold">Supplier bills</h4>{officer && o.status !== 'cancelled' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setForm('bill')}>Enter a bill</button>}</div>
            {g.data.bills.length ? <BillTable rows={g.data.bills} admin={admin} officer={officer} onDone={reload} /> : <p className="text-sm text-[#5b6b7b]">No bills yet.</p>}</section>
          <div className="flex flex-wrap gap-2">{admin && ['issued', 'part_received'].includes(o.status) && !o.paidTotal && <button className={btnDanger} onClick={() => setAsk('cancel')}>Cancel the order</button>}{admin && ['received', 'part_received', 'issued'].includes(o.status) && o.committedLeft > 0 && <button className={btnGhost} onClick={() => setAsk('close')}>Close and release what is left</button>}</div>
          <details><summary className="cursor-pointer text-sm font-semibold text-[#2a5cac]">History</summary><div className="mt-2"><Trail rows={o.trail} /></div></details>
        </div>
      )}</Loading>
      {form === 'bill' && <AskForm title="Enter a supplier bill" intro="It is checked against what was ordered and what has arrived. Someone else approves it before it can be paid." confirm="Enter the bill" initial={{ invoiceDate: today() }} fields={[{ k: 'invoiceNo', label: 'Supplier’s invoice number', required: true }, { k: 'amount', label: 'Amount (Rs)', type: 'number', min: 1, required: true }, { k: 'invoiceDate', label: 'Invoice date', type: 'date', required: true }, { k: 'dueOn', label: 'Due on', type: 'date' }, { k: 'note', label: 'Note', type: 'textarea' }]} onClose={() => setForm(null)} onDone={async (v) => { const r = await apiClient.post(`/procure/orders/${id}/bills`, { ...v, amount: Number(v.amount) }); setForm(null); toast.success(r.data.match === 'exception' ? `Bill entered. ${r.data.matchNote}` : 'Bill entered.'); reload(); }} />}
      {ask === 'cancel' && <Reason title="Cancel this order" text="The money set aside for it goes back to the budget." confirm="Cancel the order" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/orders/${id}/cancel`, { reason: v }); setAsk(null); toast.success('Order cancelled.'); reload(); }} />}
      {ask === 'close' && <Reason title="Close this order" text="Whatever has not been paid is released back to the budget. Nothing more can be received or billed." confirm="Close the order" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/orders/${id}/close`, { reason: v }); setAsk(null); toast.success('Order closed.'); reload(); }} />}
    </Modal>
  );
}

export function Orders({ admin, officer }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const g = useGet('/procure/orders', { q: dq || undefined, status: status || undefined, page, limit: 25 });
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><div className="min-w-[14rem] flex-1"><Field label="Search orders"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Order number, item or supplier" /></Field></div>
        <Field label="Show"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Every order</option><option value="issued">Waiting for goods</option><option value="part_received">Part received</option><option value="received">Received</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></Field></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No orders here" text="Approved requests are ordered from the Requests tab." /></Card> : <>
        <Table label="Purchase orders" head={['Order', 'Supplier', 'Total', 'Paid', 'Status', '']} min={680}>
          {g.data.rows.map((o) => <tr key={o._id}><Td className="font-mono text-xs">{o.poNo}</Td><Td className="font-medium">{o.vendorName}<div className="text-xs text-[#5b6b7b]">{o.title}</div></Td><Td>{money(o.total)}</Td><Td>{money(o.paidTotal)}</Td><Td><PBadge k="order" s={o.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(o._id)} aria-label={`Open ${o.poNo}`}>Open</button></Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {open && <OrderDetail id={open} admin={admin} officer={officer} onClose={() => setOpen(null)} onChange={g.reload} />}
    </div>
  );
}

export function Bills({ admin, officer }) {
  const [f, setF] = useState('entered'); const [page, setPage] = useState(1);
  const g = useGet('/procure/bills', { page, limit: 25, ...(f === 'overdue' ? { overdue: '1' } : { status: f || undefined }) });
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="Show"><select className={inputCls} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }}><option value="entered">Waiting for approval</option><option value="approved">Ready to pay</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="rejected">Turned down</option><option value="void">Cancelled</option><option value="">All bills</option></select></Field>
        <Note>A bill is entered by one person, approved by a different administrator, and then paid. Bills that do not match the order or what arrived need a written reason.</Note></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No bills here" text="Bills are entered from an order once the supplier sends an invoice." /></Card> : <>
        <BillTable rows={g.data.rows} admin={admin} officer={officer} onDone={g.reload} />
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
    </div>
  );
}
