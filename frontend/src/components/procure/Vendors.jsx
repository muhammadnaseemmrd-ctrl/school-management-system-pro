import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Modal, Field, btnGhost, btnPrimary, btnDanger, inputCls } from '../ui';
import { Table, Td, Reason, PBadge, Dl, useGet, Loading, PageBar, useDebounced, Note, AskForm, money, day, dt } from './pcKit';

const BANK = [{ k: 'bankName', label: 'Bank' }, { k: 'accountTitle', label: 'Account title' }, { k: 'accountNo', label: 'Account number or IBAN' }, { k: 'branch', label: 'Branch' }];

function Detail({ id, admin, onClose, onChange }) {
  const g = useGet(`/procure/vendors/${id}`); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null); const v = g.data?.vendor; const reload = () => { g.reload(); onChange(); };
  return (
    <Modal title={v ? v.name : 'Supplier'} onClose={onClose} wide>
      <Loading g={g}>{v && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><PBadge k="vendor" s={v.status} />{v.status === 'blocked' && <span className="text-xs text-[#5b6b7b]">{v.blockReason}</span>}</div>
          <Dl items={[['Tax number', v.taxNo], ['Contact', v.contact], ['Phone', v.phone], ['Email', v.email], ['Address', v.address], ['Ordered so far', money(g.data.orderedTotal)], ['Paid so far', money(g.data.paidTotal)]]} />
          <section className="rounded-xl border border-[#e3e7e7] p-3"><h4 className="mb-1 text-sm font-semibold">Bank account</h4>
            {v.bank && v.bank.accountNo ? <p className="text-sm">{v.bank.bankName} · {v.bank.accountTitle} · account ending {String(v.bank.accountNo).replace('…', '')}</p> : <p className="text-sm text-[#5b6b7b]">No approved account. A bank transfer cannot be made yet.</p>}
            {v.pendingBank && v.pendingBank.requestedAt && <div className="mt-2 rounded-lg bg-[#fbf0ec] p-2 text-sm text-[#8a4636]"><p className="font-semibold">A change is waiting for a different administrator to approve it.</p><p>{v.pendingBank.bankName} · {v.pendingBank.accountTitle} · account ending {String(v.pendingBank.accountNo).replace('…', '')}</p><p className="text-xs">Asked by {v.pendingBank.requestedByName} on {dt(v.pendingBank.requestedAt)}: {v.pendingBank.reason}</p><p className="text-xs">Payments by bank transfer are held until it is decided.</p>
              {admin && <div className="mt-2 flex gap-2"><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={async () => { try { await apiClient.post(`/procure/vendors/${id}/bank/decide`, { approve: true }); toast.success('Bank details approved.'); reload(); } catch (e) { toast.error(e?.response?.data?.message || 'Could not approve.'); } }}>Approve</button><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setAsk('bank')}>Turn down</button></div>}</div>}
            <button className={`${btnGhost} mt-2 !text-xs`} onClick={() => setForm('bank')}>Ask to change the bank account</button>
          </section>
          <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={() => setForm('edit')}>Change details</button>{admin && (v.status === 'active' ? <button className={btnDanger} onClick={() => setAsk('block')}>Block this supplier</button> : <button className={btnGhost} onClick={async () => { await apiClient.patch(`/procure/vendors/${id}`, { status: 'active' }); toast.success('Supplier is active again.'); reload(); }}>Make active again</button>)}</div>
          {g.data.orders.length > 0 && <section><h4 className="mb-1 text-sm font-semibold">Orders</h4><Table label="Orders from this supplier" head={['Order', 'Total', 'Paid', 'Status']} min={420}>{g.data.orders.map((o) => <tr key={o._id}><Td className="font-mono text-xs">{o.poNo}</Td><Td>{money(o.total)}</Td><Td>{money(o.paidTotal)}</Td><Td><PBadge k="order" s={o.status} /></Td></tr>)}</Table></section>}
        </div>
      )}</Loading>
      {form === 'bank' && <AskForm title="Change the bank account" intro="A different administrator must approve it before any money goes to the new account." confirm="Ask for the change" fields={[...BANK.map((f) => ({ ...f, required: f.k === 'accountNo' })), { k: 'reason', label: 'Why is it changing?', type: 'textarea', required: true }]} onClose={() => setForm(null)} onDone={async (x) => { const { reason, ...bank } = x; await apiClient.post(`/procure/vendors/${id}/bank`, { bank, reason }); setForm(null); toast.success('Sent for approval.'); reload(); }} />}
      {form === 'edit' && v && <AskForm title="Change supplier details" confirm="Save" initial={{ name: v.name, taxNo: v.taxNo, contact: v.contact, phone: v.phone, email: v.email, address: v.address }} fields={[{ k: 'name', label: 'Name', required: true, full: true }, { k: 'taxNo', label: 'Tax number' }, { k: 'contact', label: 'Contact person' }, { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' }, { k: 'address', label: 'Address', full: true }]} onClose={() => setForm(null)} onDone={async (x) => { await apiClient.patch(`/procure/vendors/${id}`, x); setForm(null); toast.success('Saved.'); reload(); }} />}
      {ask === 'block' && <Reason title="Block this supplier" text="No new order or quote can name them, and nothing can be paid to them until they are made active again." confirm="Block the supplier" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.patch(`/procure/vendors/${id}`, { status: 'blocked', blockReason: r }); setAsk(null); toast.success('Supplier blocked.'); reload(); }} />}
      {ask === 'bank' && <Reason title="Turn down the bank change" text="The approved account stays as it is." confirm="Turn it down" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/procure/vendors/${id}/bank/decide`, { approve: false, note: r }); setAsk(null); toast.success('Turned down.'); reload(); }} />}
    </Modal>
  );
}

export default function Vendors({ admin }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null); const [form, setForm] = useState(false);
  const g = useGet('/procure/vendors', { q: dq || undefined, status: status || undefined, page, limit: 25 });
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><div className="min-w-[14rem] flex-1"><Field label="Search suppliers"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, tax number or phone" /></Field></div>
        <Field label="Show"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All suppliers</option><option value="active">Active</option><option value="blocked">Blocked</option></select></Field>
        <button className={btnPrimary} onClick={() => setForm(true)}>Add a supplier</button></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No suppliers yet" text="Add the shops and companies you buy from. The same name, tax number or bank account cannot be added twice." /></Card> : <>
        <Table label="Suppliers" head={['Supplier', 'Contact', 'Tax number', 'Bank', 'Status', '']} min={720}>
          {g.data.rows.map((v) => <tr key={v._id}><Td className="font-medium">{v.name}</Td><Td>{v.contact}<div className="text-xs text-[#5b6b7b]">{v.phone}</div></Td><Td>{v.taxNo}</Td><Td>{v.pendingBank && v.pendingBank.requestedAt ? <span className="text-xs text-[#8a4636]">Waiting for approval</span> : v.bank && v.bank.accountNo ? <span className="text-xs">Approved {v.bank.accountNo}</span> : <span className="text-xs text-[#5b6b7b]">None</span>}</Td><Td><PBadge k="vendor" s={v.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(v._id)} aria-label={`Open ${v.name}`}>Open</button></Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {form && <AskForm title="Add a supplier" confirm="Add the supplier" wide intro="Bank details, if you give them, wait for a different administrator to approve them." fields={[{ k: 'name', label: 'Name', required: true, full: true }, { k: 'taxNo', label: 'Tax number' }, { k: 'contact', label: 'Contact person' }, { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' }, { k: 'address', label: 'Address', full: true }, ...BANK]} onClose={() => setForm(false)} onDone={async (x) => { const { bankName, accountTitle, accountNo, branch, ...rest } = x; const body = { ...rest }; if (accountNo) body.bank = { bankName, accountTitle, accountNo, branch }; await apiClient.post('/procure/vendors', body); setForm(false); toast.success('Supplier added.'); g.reload(); }} />}
      {open && <Detail id={open} admin={admin} onClose={() => setOpen(null)} onChange={g.reload} />}
    </div>
  );
}
