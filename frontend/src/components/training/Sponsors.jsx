import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, call, Loading, Note, Table, Td, Reason, TBadge, AskForm, ShowOnce, money, day } from './tkit';

function InvoiceForm({ sponsor, courses, onClose, onDone }) {
  const [f, setF] = useState({ courseId: courses[0]?._id || '', cohortId: '', pricePerSeat: '', discountNote: '', rows: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const co = useGet('/training/cohorts', { courseId: f.courseId || undefined }); const cohorts = (co.data?.cohorts || []).filter((c) => ['open', 'running'].includes(c.status));
  const c = courses.find((x) => x._id === f.courseId);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const learners = f.rows.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => { const [name, email, phone] = x.split(',').map((y) => y.trim()); return { name, email, phone }; });
    try { const r = await apiClient.post('/training/sponsorships', { sponsorId: sponsor._id, courseId: f.courseId, cohortId: f.cohortId || undefined, learners, ...(f.pricePerSeat !== '' ? { pricePerSeat: Number(f.pricePerSeat), discountNote: f.discountNote } : {}) }); await onDone(r.data); } catch (x) { setErr(errMsg(x, 'Could not make the invoice.')); setBusy(false); }
  };
  return (
    <Modal title={`Invoice ${sponsor.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Course"><select className={inputCls} value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value, cohortId: '' })} required>{courses.map((x) => <option key={x._id} value={x._id}>{x.title}</option>)}</select></Field>
        <Field label="Cohort (optional)"><select className={inputCls} value={f.cohortId} onChange={(e) => setF({ ...f, cohortId: e.target.value })}><option value="">Any, no seat held</option>{cohorts.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></Field>
        <Field label="Price per seat" hint={c ? `List price ${money(c.price)}. Leave empty to use it.` : ''}><input className={inputCls} type="number" min="0" value={f.pricePerSeat} onChange={(e) => setF({ ...f, pricePerSeat: e.target.value })} /></Field>
        {f.pricePerSeat !== '' && <Field label="Why a different price? (at least 10 characters)"><input className={inputCls} value={f.discountNote} onChange={(e) => setF({ ...f, discountNote: e.target.value })} required minLength={10} /></Field>}
        <div className="sm:col-span-2"><Field label="Learners, one per line: name, email" hint="New learners get a private link, shown once after you make the invoice. Nobody gets access until the payment is confirmed."><textarea className={inputCls} rows={5} value={f.rows} onChange={(e) => setF({ ...f, rows: e.target.value })} required placeholder="Worker One, w1@company.com" /></Field></div>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : 'Make the invoice'}</button></div>
      </form>
    </Modal>
  );
}

export function Sponsors() {
  const g = useGet('/training/sponsors'); const inv = useGet('/training/sponsorships'); const cs = useGet('/training/courses', { status: 'published' });
  const [form, setForm] = useState(null); const [bill, setBill] = useState(null); const [pay, setPay] = useState(null); const [cancel, setCancel] = useState(null); const [shown, setShown] = useState(null);
  const sp = g.data?.sponsors || []; const invs = inv.data?.sponsorships || []; const reload = () => { g.reload(); inv.reload(); };
  return (
    <div className="space-y-4">
      <Note>A company or agency that pays for its people. Billing needs an approved contract or purchase-order reference first. Seats open only after you confirm the sponsor's payment. The sponsor can open a private report that shows only its own learners' progress.</Note>
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm({})}>Add a sponsor</button></div>
      <Loading g={g}>{sp.length === 0 ? <Card><EmptyState title="No sponsors yet" text="Add an organisation to invoice it for a group of learners." /></Card> : (
        <Table label="Sponsors" head={['Organisation', 'Contract or PO', 'Status', 'Invoices', 'Unpaid', '']} min={760}>
          {sp.map((s) => (
            <tr key={s._id}><Td className="font-medium">{s.name}<div className="text-xs font-normal text-[#5b6b7b]">{s.contactName} {s.email}</div></Td><Td className="text-xs">{s.authority || <span className="text-[#9f1239]">None yet</span>}</Td><Td><TBadge s={s.status} /></Td><Td>{s.invoices}</Td><Td>{money(s.unpaid)}</Td>
              <Td><div className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Edit ${s.name}`} onClick={() => setForm(s)}>Edit</button>{s.status !== 'approved' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Approve ${s.name}`} onClick={() => call(() => apiClient.patch(`/training/sponsors/${s._id}`, { status: 'approved' }), 'Approved for billing', reload)}>Approve billing</button>}{s.status === 'approved' && <><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Invoice ${s.name}`} onClick={() => setBill(s)} disabled={!(cs.data?.courses || []).length}>Invoice seats</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Report link for ${s.name}`} onClick={async () => { const r = await call(() => apiClient.post(`/training/sponsors/${s._id}/report-link`), null); if (r) setShown({ title: 'Sponsor report link', text: 'Send this link to the sponsor. It shows only its own learners. Making a new one stops the old one working.', secret: `${window.location.origin}/sponsor/${r.data.key}` }); }}>Report link</button></>}</div></Td></tr>
          ))}
        </Table>
      )}</Loading>
      <h3 className="font-semibold text-[#1b2837]">Invoices</h3>
      <Loading g={inv}>{invs.length === 0 ? <p className="text-sm text-[#5b6b7b]">No invoices yet.</p> : (
        <Table label="Invoices" head={['Invoice', 'Sponsor', 'Course', 'Seats', 'Total', 'Status', '']} min={760}>
          {invs.map((x) => (
            <tr key={x._id}><Td className="font-mono text-xs">{x.invoiceNo}</Td><Td>{x.sponsorName}</Td><Td>{x.courseTitle}</Td><Td>{x.seats}</Td><Td>{money(x.total)}<div className="text-[11px] text-[#5b6b7b]">{money(x.pricePerSeat)} a seat plus tax</div></Td><Td><TBadge s={x.status} />{x.reference && <div className="text-[11px] text-[#5b6b7b]">{x.reference}</div>}</Td>
              <Td>{x.status === 'invoiced' && <div className="flex flex-wrap gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Confirm payment for ${x.invoiceNo}`} onClick={() => setPay(x)}>Confirm payment</button><button className={`${btnDanger} !px-2 !py-1 !text-xs`} aria-label={`Cancel ${x.invoiceNo}`} onClick={() => setCancel(x)}>Cancel</button></div>}</Td></tr>
          ))}
        </Table>
      )}</Loading>
      {form && <AskForm title={form._id ? `Edit ${form.name}` : 'Add a sponsor'} confirm="Save" onClose={() => setForm(null)} initial={form} fields={[{ k: 'name', label: 'Organisation', required: true }, { k: 'contactName', label: 'Contact person' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'phone', label: 'Phone' }, { k: 'authority', label: 'Contract or purchase-order reference', full: true, hint: 'Needed before you can approve billing.' }]}
        onDone={async (v) => { const body = { name: v.name, contactName: v.contactName, email: v.email, phone: v.phone, authority: v.authority }; if (form._id) await apiClient.patch(`/training/sponsors/${form._id}`, body); else await apiClient.post('/training/sponsors', body); setForm(null); reload(); }} />}
      {bill && <InvoiceForm sponsor={bill} courses={cs.data?.courses || []} onClose={() => setBill(null)} onDone={(r) => { setBill(null); reload(); if (r.keys?.length) setShown({ title: 'Private links for new learners', text: 'Shown once. Copy them now and send each person their own link.', secret: r.keys.map((k) => `${k.name} <${k.email}>\n${window.location.origin}/learn#${k.key}`).join('\n\n') }); }} />}
      {pay && <AskForm title={`Confirm payment for ${pay.invoiceNo}`} intro={`Confirm only after the money is in. The invoice total is ${money(pay.total)} and the amount must match exactly. Access opens for all ${pay.seats} learners.`} confirm="Confirm the payment" onClose={() => setPay(null)} initial={{ amount: pay.total }} fields={[{ k: 'reference', label: 'Payment reference you checked', required: true }, { k: 'amount', label: 'Amount received', type: 'number', required: true }]} onDone={async (v) => { await apiClient.post(`/training/sponsorships/${pay._id}/confirm`, { reference: v.reference, amount: Number(v.amount) }); setPay(null); reload(); }} />}
      {cancel && <Reason title={`Cancel ${cancel.invoiceNo}`} text="Only an unpaid invoice can be cancelled." confirm="Cancel the invoice" min={10} onClose={() => setCancel(null)} onDone={async (reason) => { await apiClient.post(`/training/sponsorships/${cancel._id}/cancel`, { reason }); setCancel(null); reload(); }} />}
      {shown && <ShowOnce title={shown.title} text={shown.text} secret={shown.secret} onClose={() => setShown(null)} />}
    </div>
  );
}
