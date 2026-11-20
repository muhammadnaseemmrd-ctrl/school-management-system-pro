import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, Pager, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, call, Loading, Note, Table, Td, Reason, TBadge, AskForm, ShowOnce, money, day, dt, PAY_METHODS } from './tkit';

function Confirm({ order, inst, onClose, onDone }) {
  const [f, setF] = useState({ reference: inst.proof?.reference || '', method: inst.proof?.method || 'bank', amount: inst.amount, forceReason: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [dup, setDup] = useState('');
  const go = async (e, force) => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { await apiClient.post(`/training/orders/${order._id}/installments/${inst.no}/confirm`, { reference: f.reference, method: f.method, amount: Number(f.amount), ...(force ? { force: true, forceReason: f.forceReason } : {}) }); await onDone(); }
    catch (x) { setBusy(false); if (x.response?.data?.duplicate) { setDup(x.response.data.duplicate); setErr(errMsg(x)); } else setErr(errMsg(x, 'Could not confirm.')); }
  };
  return (
    <Modal title={`Confirm instalment ${inst.no} of ${order.orderNo}`} onClose={onClose}>
      <form onSubmit={(e) => go(e, false)} className="grid gap-3">
        <p className="text-sm text-[#5b6b7b]">Only confirm after you have seen the money in your account or in your hand. Access opens when you confirm. The amount must match exactly: {money(inst.amount, order.currency)}.</p>
        {inst.proof && <Note>The learner wrote: reference "{inst.proof.reference}"{inst.proof.note ? `, note "${inst.proof.note}"` : ''}.</Note>}
        <Field label="Payment reference you checked"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required minLength={3} maxLength={80} autoFocus /></Field>
        <Field label="How it was paid"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={`Amount received (${order.currency})`}><input className={inputCls} type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        {dup && <Field label={`Why is it right to reuse this reference? (it was used on ${dup})`}><textarea className={inputCls} rows={2} value={f.forceReason} onChange={(e) => setF({ ...f, forceReason: e.target.value })} /></Field>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button>{dup ? <button type="button" className={btnDanger} disabled={busy || f.forceReason.trim().length < 10} onClick={() => go(null, true)}>Confirm anyway</button> : <button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : 'Confirm the payment'}</button>}</div>
      </form>
    </Modal>
  );
}

function OrderView({ id, onClose, onChanged }) {
  const g = useGet(`/training/orders/${id}`); const [conf, setConf] = useState(null); const [rej, setRej] = useState(null); const [cancel, setCancel] = useState(false); const [refund, setRefund] = useState(false); const [revoke, setRevoke] = useState(null);
  const o = g.data?.order; const reload = async () => { await g.reload(); onChanged(); };
  return (
    <Modal title={o ? `Order ${o.orderNo}` : 'Order'} onClose={onClose} wide>
      <Loading g={g}>{o && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2"><TBadge s={o.status} /><span className="text-sm">{o.title}</span><span className="text-xs text-[#5b6b7b]">· {g.data.learner?.name} · {g.data.learner?.email}</span></div>
          <dl className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4"><div><dt className="text-xs text-[#5b6b7b]">List price</dt><dd>{money(o.list, o.currency)}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Discount{o.coupon?.code ? ` (${o.coupon.code})` : ''}</dt><dd>{money(o.discount, o.currency)}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Tax ({o.taxPercent}%)</dt><dd>{money(o.tax, o.currency)}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Total</dt><dd className="font-semibold">{money(o.total, o.currency)}</dd></div></dl>
          <Table label="Instalments" head={['#', 'Amount', 'Due', 'Status', 'Receipt', '']} min={620}>
            {o.installments.map((i) => (
              <tr key={i.no}><Td>{i.no}</Td><Td>{money(i.amount, o.currency)}</Td><Td>{day(i.due)}</Td><Td><TBadge s={i.status} />{i.proof?.rejected && <div className="text-[11px] text-[#9f1239]">Proof turned down: {i.proof.rejected.reason}</div>}{i.proof && i.status === 'proof' && <div className="text-[11px] text-[#5b6b7b]">"{i.proof.reference}" {i.proof.note || ''}</div>}</Td><Td className="font-mono text-xs">{i.receiptNo || ''}</Td>
                <Td><div className="flex flex-wrap gap-1">{i.status !== 'paid' && !['cancelled', 'refunded'].includes(o.status) && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Confirm payment ${i.no}`} onClick={() => setConf(i)}>Confirm payment</button>}{i.status === 'proof' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Turn down proof ${i.no}`} onClick={() => setRej(i)}>Turn down proof</button>}</div></Td></tr>
            ))}
          </Table>
          {(o.refunds || []).length > 0 && <div className="text-sm"><h4 className="mb-1 font-semibold">Refunds</h4><ul className="grid gap-1 text-xs">{o.refunds.map((r, k) => <li key={k}>{day(r.at)} · {money(r.amount, o.currency)} · {r.reason}{r.override ? ' (after the window, overridden)' : ''} · {r.byName}</li>)}</ul></div>}
          <div><h4 className="mb-1 text-sm font-semibold">Access from this order</h4>{g.data.entitlements.length === 0 ? <p className="text-xs text-[#5b6b7b]">None yet. Access opens when a payment is confirmed.</p> : <ul className="grid gap-1 text-sm">{g.data.entitlements.map((e) => <li key={e._id} className="flex flex-wrap items-center gap-2"><TBadge s={e.state} /> <TBadge s={e.completion} />{e.status !== 'revoked' && <button className={`${btnGhost} !px-2 !py-0.5 !text-xs`} onClick={() => setRevoke(e)}>End access</button>}</li>)}</ul>}</div>
          <p className="text-xs text-[#5b6b7b]">Policy version {o.policyVersion} · refund window {o.refundDays} days · {g.data.refundWindowOpen ? 'still open' : 'closed'}</p>
          <div className="flex flex-wrap justify-end gap-2">{o.status === 'pending' && <button className={btnDanger} onClick={() => setCancel(true)}>Cancel the order</button>}{!['cancelled', 'refunded', 'pending'].includes(o.status) && <button className={btnDanger} onClick={() => setRefund(true)}>Refund</button>}<button className={btnGhost} onClick={onClose}>Close</button></div>
        </div>
      )}</Loading>
      {conf && <Confirm order={o} inst={conf} onClose={() => setConf(null)} onDone={async () => { setConf(null); await reload(); }} />}
      {rej && <Reason title="Turn down the proof" text="The learner is told why and can send a better one." confirm="Turn it down" min={10} danger={false} label="What is wrong with it" onClose={() => setRej(null)} onDone={async (reason) => { await apiClient.post(`/training/orders/${o._id}/installments/${rej.no}/reject-proof`, { reason }); setRej(null); await reload(); }} />}
      {cancel && <Reason title="Cancel the unpaid order" confirm="Cancel the order" min={10} onClose={() => setCancel(false)} onDone={async (reason) => { await apiClient.post(`/training/orders/${o._id}/cancel`, { reason }); setCancel(false); await reload(); }} />}
      {revoke && <Reason title="End this access" text="Progress and work already handed in are kept." confirm="End access" min={10} onClose={() => setRevoke(null)} onDone={async (reason) => { await apiClient.post(`/training/entitlements/${revoke._id}/revoke`, { reason }); setRevoke(null); await reload(); }} />}
      {refund && o && <Refund order={o} open={g.data.refundWindowOpen} onClose={() => setRefund(false)} onDone={async () => { setRefund(false); await reload(); }} />}
    </Modal>
  );
}

function Refund({ order, open, onClose, onDone }) {
  const paid = order.installments.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0); const left = paid - (order.refunded || 0);
  return (
    <AskForm title="Refund" confirm="Record the refund" onClose={onClose} initial={{ amount: left, reason: '', override: false, revoke: false }}
      intro={`${money(left, order.currency)} can still be refunded. This records a refund only: send the money yourself. A full refund ends access and frees the seat.${open ? '' : ' The refund window has passed, so an override and a clear reason are needed.'}`}
      fields={[{ k: 'amount', label: 'Amount to refund', type: 'number', min: 1, max: left, required: true }, { k: 'reason', label: 'Reason (kept in the record)', type: 'textarea', required: true }, ...(open ? [] : [{ k: 'override', label: 'Late refund', type: 'check', text: 'Override the refund window' }]), { k: 'revoke', label: 'Access', type: 'check', text: 'End access even for a part refund' }]}
      onDone={async (v) => { await apiClient.post(`/training/orders/${order._id}/refund`, { amount: Number(v.amount), reason: v.reason, override: !!v.override, revoke: !!v.revoke }); await onDone(); }} />
  );
}

export function Orders({ onProofChange }) {
  const [status, setStatus] = useState(''); const [proof, setProof] = useState(false); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null); const [form, setForm] = useState(false);
  const g = useGet('/training/orders', { status: status || undefined, proof: proof ? '1' : undefined, search: q || undefined, page }); const rows = g.data?.orders || [];
  const l = useGet('/training/learners', { limit: 100 }); const cs = useGet('/training/courses', { status: 'published' }); const b = useGet('/training/bundles');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1"><Field label="Search orders"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Order number or course" /></Field></div>
        <Field label="Status"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['pending', 'part_paid', 'paid', 'part_refunded', 'refunded', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={proof} onChange={(e) => { setProof(e.target.checked); setPage(1); }} /> Only proof waiting to be checked</label>
        <button className={btnPrimary} onClick={() => setForm(true)}>New order</button>
      </div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No orders" text="Orders come from the public page, from a learner's own link, or from you with New order." /></Card> : (
        <>
          <Table label="Orders" head={['Order', 'Learner', 'Total', 'Paid', 'Status', 'Placed', '']} min={780}>
            {rows.map((o) => (
              <tr key={o._id}><Td><span className="font-mono text-xs">{o.orderNo}</span><div className="text-xs text-[#5b6b7b]">{o.title}</div></Td><Td>{o.learnerName}<div className="text-xs text-[#5b6b7b]">{o.learnerEmail}</div></Td><Td>{money(o.total, o.currency)}</Td><Td>{money(o.paid, o.currency)}</Td><Td><TBadge s={o.status} />{o.proofWaiting && <div className="mt-1"><TBadge s="proof" /></div>}</Td><Td className="text-xs">{day(o.createdAt)}</Td>
                <Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Open ${o.orderNo}`} onClick={() => setOpen(o._id)}>Open</button></Td></tr>
            ))}
          </Table>
          <Pager pagination={{ total: g.data.total, currentPage: page, pages: Math.ceil(g.data.total / 25) }} onPage={setPage} />
        </>
      )}</Loading>
      {open && <OrderView id={open} onClose={() => setOpen(null)} onChanged={() => { g.reload(); onProofChange && onProofChange(); }} />}
      {form && <AskForm title="New order" confirm="Place the order" wide onClose={() => setForm(false)} intro="For a learner who pays at the office or by phone. The order waits for payment like any other."
        initial={{ learnerId: l.data?.learners?.[0]?._id || '', what: cs.data?.courses?.[0] ? `c:${cs.data.courses[0]._id}` : '', installments: 1, coupon: '' }}
        fields={[{ k: 'learnerId', label: 'Learner', type: 'select', required: true, options: (l.data?.learners || []).map((x) => [x._id, `${x.name}${x.email ? ` (${x.email})` : ''}`]) }, { k: 'what', label: 'Course or bundle', type: 'select', required: true, options: [...(cs.data?.courses || []).map((c) => [`c:${c._id}`, c.title]), ...((b.data?.bundles || []).filter((x) => x.status === 'published').map((x) => [`b:${x._id}`, `Bundle: ${x.title}`]))] }, { k: 'installments', label: 'Instalments', type: 'number', min: 1, max: 12 }, { k: 'coupon', label: 'Coupon code (optional)' }]}
        onDone={async (v) => { const [kind, id] = v.what.split(':'); const r = await apiClient.post('/training/orders', { learnerId: v.learnerId, ...(kind === 'b' ? { bundleId: id } : { courseId: id }), installments: Number(v.installments) || 1, coupon: v.coupon || undefined }); setForm(false); await g.reload(); setOpen(r.data._id); }} />}
    </div>
  );
}

/* ───────── learners ───────── */
function LearnerView({ id, onClose, onChanged }) {
  const g = useGet(`/training/learners/${id}`); const cs = useGet('/training/courses', { status: 'published' }); const [grant, setGrant] = useState(false); const [susp, setSusp] = useState(false); const [key, setKey] = useState(''); const [ent, setEnt] = useState(null); const l = g.data?.learner; const reload = async () => { await g.reload(); onChanged(); };
  return (
    <Modal title={l ? l.name : 'Learner'} onClose={onClose} wide>
      <Loading g={g}>{l && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2"><TBadge s={l.status} />{l.minor && <span className="rounded-md bg-[#eef2f8] px-2 py-0.5 text-[11px] font-semibold text-[#234c91]">Under 18: posts are checked first</span>}<span className="text-sm text-[#5b6b7b]">{l.email} {l.phone}</span></div>
          <div className="flex flex-wrap gap-2">
            {!l.studentId && <button className={btnGhost} onClick={async () => { const r = await call(() => apiClient.post(`/training/learners/${l._id}/reset-key`), null); if (r) setKey(r.data.key); }}>Make a new private link</button>}
            {l.status === 'active' ? <button className={btnGhost} onClick={() => setSusp(true)}>Pause this learner</button> : <button className={btnGhost} onClick={() => call(() => apiClient.patch(`/training/learners/${l._id}`, { status: 'active' }), 'Learner is active again', reload)}>Make active again</button>}
            <button className={btnPrimary} onClick={() => setGrant(true)}>Give free access in writing</button>
          </div>
          <div><h4 className="mb-1 text-sm font-semibold">Courses</h4>{g.data.entitlements.length === 0 ? <p className="text-xs text-[#5b6b7b]">None yet.</p> : (
            <Table label="Learner courses" head={['Course', 'Access', 'Progress', 'Completion', '']} min={560}>{g.data.entitlements.map((e) => <tr key={e._id}><Td>{e.courseTitle}<div className="text-xs text-[#5b6b7b]">{e.source === 'comp' ? `Written grant: ${e.reason}` : e.source}</div></Td><Td><TBadge s={e.state} /></Td><Td>{e.percent}%</Td><Td><TBadge s={e.completion} /></Td><Td>{e.status === 'revoked' ? <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setEnt(e)}>Restore</button> : <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setEnt({ ...e, ending: true })}>End access</button>}</Td></tr>)}</Table>
          )}</div>
          <div><h4 className="mb-1 text-sm font-semibold">Orders</h4><ul className="grid gap-1 text-xs">{g.data.orders.map((o) => <li key={o._id}><span className="font-mono">{o.orderNo}</span> · {o.title} · {money(o.total, o.currency)} · <TBadge s={o.status} /></li>)}{g.data.orders.length === 0 && <li className="text-[#5b6b7b]">None.</li>}</ul></div>
          <div><h4 className="mb-1 text-sm font-semibold">Certificates</h4><ul className="grid gap-1 text-xs">{g.data.credentials.map((c) => <li key={c._id}><span className="font-mono">{c.serial}</span> · {c.title} · <TBadge s={c.status} />{c.refundFlag ? ' · refund needs a decision' : ''}</li>)}{g.data.credentials.length === 0 && <li className="text-[#5b6b7b]">None.</li>}</ul></div>
        </div>
      )}</Loading>
      {key && <ShowOnce title="New private link" text="Give this link to the learner. It is shown once and the old one stops working. Anyone with it can open the learner's courses." secret={`${window.location.origin}/learn#${key}`} onClose={() => setKey('')} />}
      {susp && <Reason title="Pause this learner" text="They cannot open any course until you make them active again." confirm="Pause" min={10} onClose={() => setSusp(false)} onDone={async (reason) => { await apiClient.patch(`/training/learners/${l._id}`, { status: 'suspended', reason }); setSusp(false); await reload(); }} />}
      {grant && <AskForm title="Free access, in writing" intro="For a scholarship, a staff member or a make-good. The reason is kept with the access." confirm="Give access" onClose={() => setGrant(false)} initial={{ courseId: cs.data?.courses?.[0]?._id || '' }} fields={[{ k: 'courseId', label: 'Course', type: 'select', required: true, options: (cs.data?.courses || []).map((c) => [c._id, c.title]) }, { k: 'reason', label: 'Why is this free? (at least 10 characters)', type: 'textarea', required: true }, { k: 'expiresAt', label: 'Ends on (optional)', type: 'date' }]}
        onDone={async (v) => { await apiClient.post('/training/entitlements', { learnerId: l._id, courseId: v.courseId, reason: v.reason, expiresAt: v.expiresAt || undefined }); setGrant(false); await reload(); }} />}
      {ent && <Reason title={ent.ending ? 'End this access' : 'Bring access back'} confirm={ent.ending ? 'End access' : 'Restore access'} min={10} danger={!!ent.ending} onClose={() => setEnt(null)} onDone={async (reason) => { await apiClient.post(`/training/entitlements/${ent._id}/${ent.ending ? 'revoke' : 'restore'}`, { reason }); setEnt(null); await reload(); }} />}
    </Modal>
  );
}

export function Learners() {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null); const [form, setForm] = useState(false); const [fromSt, setFromSt] = useState(false); const [key, setKey] = useState('');
  const g = useGet('/training/learners', { search: q || undefined, page }); const rows = g.data?.learners || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Field label="Search learners"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or email" /></Field></div><button className={btnPrimary} onClick={() => setForm(true)}>Add a learner</button><button className={btnGhost} onClick={() => setFromSt(true)}>Use a student</button></div>
      <Note>Learners sign in with a private link, not a password. The link is shown once when it is made. A student of your school can instead use the student sign-in.</Note>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No learners yet" text="Learners appear when someone buys from the public page or when you add one." /></Card> : (
        <>
          <Table label="Learners" head={['Learner', 'Source', 'Status', 'Courses', 'Last seen', '']} min={680}>
            {rows.map((r) => <tr key={r._id}><Td className="font-medium">{r.name}<div className="text-xs font-normal text-[#5b6b7b]">{r.email}{r.studentId ? ' · student account' : ''}</div></Td><Td className="text-xs">{r.source}</Td><Td><TBadge s={r.status} /></Td><Td>{r.activeCourses}</Td><Td className="text-xs">{day(r.lastSeenAt) || 'Never'}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Open ${r.name}`} onClick={() => setOpen(r._id)}>Open</button></Td></tr>)}
          </Table>
          <Pager pagination={{ total: g.data.total, currentPage: page, pages: Math.ceil(g.data.total / 25) }} onPage={setPage} />
        </>
      )}</Loading>
      {open && <LearnerView id={open} onClose={() => setOpen(null)} onChanged={g.reload} />}
      {form && <AskForm title="Add a learner" confirm="Add the learner" onClose={() => setForm(false)} fields={[{ k: 'name', label: 'Name', required: true }, { k: 'email', label: 'Email', type: 'email' }, { k: 'phone', label: 'Phone' }, { k: 'minor', label: 'Age', type: 'check', text: 'Under 18 (their discussion posts are checked first)' }]}
        onDone={async (v) => { const r = await apiClient.post('/training/learners', v); setForm(false); g.reload(); setKey(r.data.key); }} />}
      {fromSt && <StudentPick onClose={() => setFromSt(false)} onDone={() => { setFromSt(false); g.reload(); }} />}
      {key && <ShowOnce title="Private link" text="Give this link to the learner. It is shown once. Anyone with it can open their courses." secret={`${window.location.origin}/learn#${key}`} onClose={() => setKey('')} />}
    </div>
  );
}

function StudentPick({ onClose, onDone }) {
  const [q, setQ] = useState(''); const g = useGet('/students', { search: q || undefined, limit: 20 }); const rows = g.data?.students || g.data?.data || [];
  return (
    <Modal title="Use a student as a learner" onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-[#5b6b7b]">The student then opens their courses from their own dashboard. Students under 18 have their discussion posts checked first.</p>
        <Field label="Search students"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" autoFocus /></Field>
        <ul className="grid max-h-64 gap-1 overflow-auto">{rows.slice(0, 20).map((s) => <li key={s._id} className="flex items-center justify-between gap-2 rounded-lg border border-[#f0f1f1] px-3 py-2 text-sm"><span>{s.name}</span><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Use ${s.name}`} onClick={() => call(() => apiClient.post('/training/learners/from-student', { studentId: s._id }), (r) => (r.data.existing ? 'Already a learner' : 'Student added'), onDone)}>Use</button></li>)}{rows.length === 0 && <li className="text-sm text-[#5b6b7b]">No students found.</li>}</ul>
        <div className="flex justify-end"><button className={btnGhost} onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  );
}
