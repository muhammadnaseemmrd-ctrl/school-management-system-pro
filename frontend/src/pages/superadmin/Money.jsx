import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Copy, KeyRound, PauseCircle, PlayCircle, RotateCcw, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import {
  pkr, fmtDate, fmtDay, Card, Stat, Pill, Pager, Modal, Field, TableSkeleton, EmptyState,
  inputCls, btnPrimary, btnGhost, btnDanger, errMsg,
} from '../../components/ui';

const METHODS = [['bank', 'Bank transfer'], ['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['cash', 'Cash'], ['other', 'Other']];
const newKey = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// paged list with skeleton / empty / error states
const useList = (path, key, params = {}) => {
  const [s, setS] = useState({ rows: [], extra: null, pagination: null, loading: true, error: '' });
  const [page, setPage] = useState(1);
  const q = JSON.stringify(params);
  const load = useCallback(async () => {
    setS((x) => ({ ...x, loading: true, error: '' }));
    try {
      const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } });
      setS({ rows: r.data[key] || [], extra: r.data, pagination: r.data.pagination, loading: false, error: '' });
    } catch (e) { setS((x) => ({ ...x, loading: false, error: errMsg(e, 'Could not load') })); }
  }, [path, key, page, q]);
  useEffect(() => { load(); }, [load]);
  return { ...s, page, setPage, reload: load };
};

const Shell = ({ state, head, empty, children, minW = 720 }) => (
  <Card className="overflow-hidden !p-0">
    {state.loading ? <TableSkeleton cols={head.length} />
      : state.error ? <EmptyState title={state.error} action={<button onClick={state.reload} className={btnGhost}>Try again</button>} />
        : state.rows.length === 0 ? empty
          : <div className="overflow-x-auto"><table className="w-full text-start text-sm" style={{ minWidth: minW }}>
            <thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{head.map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody className="stagger">{children}</tbody></table></div>}
    <Pager pagination={state.pagination} onPage={state.setPage} />
  </Card>
);

/* ───────────── Record payment (also opened from the Schools tab) ───────────── */
export const RecordPaymentModal = ({ school, plans, onClose, onDone }) => {
  const key = useRef(newKey());
  const [schools, setSchools] = useState([]);
  useEffect(() => { if (!school) apiClient.get('/superadmin/schools', { params: { limit: 100 } }).then((r) => setSchools(r.data.schools)).catch(() => {}); }, [school]);
  const planList = Object.entries(plans || {}).filter(([, p]) => (p.pricePKR || 0) > 0 || (p.yearlyPricePKR || 0) > 0);
  const [f, setF] = useState({
    schoolId: school?._id || '', planSlug: school && planList.find(([k]) => k === school.plan) ? school.plan : (planList[0]?.[0] || ''),
    billingPeriod: 'monthly', amountPKR: '', method: 'bank', reference: '', paidAt: fmtDay(new Date()), note: '',
  });
  const [amountTouched, setAmountTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const price = (slug, period) => (period === 'yearly' ? plans?.[slug]?.yearlyPricePKR : plans?.[slug]?.pricePKR) || 0;
  useEffect(() => { if (!amountTouched && f.planSlug) setF((x) => ({ ...x, amountPKR: String(price(x.planSlug, x.billingPeriod) || '') })); /* eslint-disable-next-line */ }, [f.planSlug, f.billingPeriod]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await apiClient.post('/superadmin/payments', { ...f, amountPKR: Number(f.amountPKR) }, { headers: { 'Idempotency-Key': key.current } });
      toast.success(r.data.message); onDone?.(r.data); onClose();
    } catch (e2) { setErr(errMsg(e2, 'Could not record the payment')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Record a payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {school ? <p className="rounded-lg bg-[#f7f6f2] px-3 py-2 text-sm"><b>{school.name}</b> <span className="font-mono text-xs text-[#5b6b7b]">{school.code}</span></p> : (
          <Field label="School"><select required className={inputCls} value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })}>
            <option value="">Choose a school…</option>{schools.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}</select></Field>)}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan"><select className={inputCls} value={f.planSlug} onChange={(e) => { setAmountTouched(false); setF({ ...f, planSlug: e.target.value }); }}>{planList.map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></Field>
          <Field label="Billing"><select className={inputCls} value={f.billingPeriod} onChange={(e) => { setAmountTouched(false); setF({ ...f, billingPeriod: e.target.value }); }}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount received (Rs)" hint="Whole rupees"><input required inputMode="numeric" pattern="[0-9]*" dir="ltr" className={inputCls} value={f.amountPKR} onChange={(e) => { setAmountTouched(true); setF({ ...f, amountPKR: e.target.value.replace(/\D/g, '') }); }} /></Field>
          <Field label="Received on"><input required type="date" max={fmtDay(new Date())} className={inputCls} value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How it was received"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Reference (optional)"><input className={inputCls} dir="ltr" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <Field label="Note (optional)"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <p className="text-xs text-[#5b6b7b]">The school's subscription is extended from the day its current plan ends (or today if it already ended). Saving twice does not record the payment twice.</p>
        {err && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={btnGhost}>Cancel</button><button disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Record payment'}</button></div>
      </form>
    </Modal>
  );
};

/* ───────────── Link a school to an agent ───────────── */
export const LinkAgentModal = ({ school, onClose, onDone }) => {
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState(school.agentId || '');
  const [pct, setPct] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { apiClient.get('/superadmin/agents', { params: { limit: 100, status: 'active' } }).then((r) => setAgents(r.data.agents)).catch(() => {}); }, []);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await apiClient.put(`/superadmin/schools/${school._id}/agent`, { agentId: agentId || null, commissionPercent: pct === '' ? undefined : Number(pct) });
      toast.success(agentId ? 'School linked to agent' : 'Agent removed from school'); onDone?.(); onClose();
    } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Agent for ${school.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Agent"><select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">No agent</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.referralCode} · {a.commissionPercent}%</option>)}</select></Field>
        {agentId && <Field label="Commission % for this school" hint="Leave blank to use the agent's rate. The rate is frozen for this school once saved."><input className={inputCls} dir="ltr" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>}
        <p className="text-xs text-[#5b6b7b]">Changing the agent affects future payments only. Earlier payments keep the agent they were recorded with.</p>
        {err && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={btnGhost}>Cancel</button><button disabled={busy} className={btnPrimary}>Save</button></div>
      </form>
    </Modal>
  );
};

/* ───────────── Agents ───────────── */
export const AgentsTab = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const id = setTimeout(() => setQ(search), 300); return () => clearTimeout(id); }, [search]);
  const st = useList('/superadmin/agents', 'agents', { status, search: q });
  const [modal, setModal] = useState(null); // {type, agent}
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [secret, setSecret] = useState(null);
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success('Copied'); };

  const open = (type, agent) => {
    setErr(''); setModal({ type, agent });
    if (type === 'create') setForm({ name: '', email: '', phone: '', city: '', commissionPercent: 10, notes: '' });
    if (type === 'edit') setForm({ name: agent.name, phone: agent.phone, city: agent.city, commissionPercent: agent.commissionPercent, notes: agent.notes || '' });
    if (type === 'payout') setForm({ method: 'bank', reference: '', paidAt: fmtDay(new Date()), note: '' });
  };
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  const create = (e) => { e.preventDefault(); run(async () => { const r = await apiClient.post('/superadmin/agents', { ...form, commissionPercent: Number(form.commissionPercent) }); setSecret({ email: r.data.agent.email, password: r.data.temporaryPassword }); setModal(null); st.reload(); }); };
  const edit = (e) => { e.preventDefault(); run(async () => { await apiClient.put(`/superadmin/agents/${modal.agent.id}`, { ...form, commissionPercent: Number(form.commissionPercent) }); toast.success('Agent updated'); setModal(null); st.reload(); }); };
  const toggle = (a) => run(async () => { await apiClient.put(`/superadmin/agents/${a.id}`, { isActive: !a.isActive }); toast.success(a.isActive ? 'Agent suspended' : 'Agent reactivated'); st.reload(); });
  const reset = (a) => run(async () => { const r = await apiClient.post(`/superadmin/agents/${a.id}/reset-password`, {}); setSecret({ email: r.data.email, password: r.data.temporaryPassword }); });
  const payout = (e) => { e.preventDefault(); run(async () => { const a = modal.agent; const r = await apiClient.post(`/superadmin/agents/${a.id}/payouts`, { ...form, amountPKR: a.commission.approvedPKR }); toast.success(`${pkr(r.data.payout.amountPKR)} paid out`); setModal(null); st.reload(); }); };

  return (
    <div className="page-ready space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <input placeholder="Search name, email or code…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} max-w-xs flex-1`} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); st.setPage(1); }} className={`${inputCls} !w-auto`} aria-label="Status"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
        <button onClick={() => open('create')} className={`${btnPrimary} ms-auto`}><Plus className="h-4 w-4" /> Add agent</button>
      </Card>
      <Shell state={st} head={['Agent', 'Code', 'Rate', 'Schools', 'Paid by schools', 'Waiting', 'Ready to pay', 'Paid out', 'Status', '']} minW={1000}
        empty={<EmptyState title="No agents yet" text="Add a partner who brings schools to Aulensia. They get a code, a link and their own portal." action={<button onClick={() => open('create')} className={btnPrimary}><Plus className="h-4 w-4" /> Add agent</button>} />}>
        {st.rows.map((a) => (
          <tr key={a.id} className="border-b border-[#e3e7e7]/60 last:border-0">
            <td className="px-4 py-3"><p className="font-semibold">{a.name}</p><p className="text-xs text-[#5b6b7b]">{a.email}</p></td>
            <td className="px-4 py-3 font-mono text-xs">{a.referralCode}</td>
            <td className="px-4 py-3" dir="ltr">{a.commissionPercent}%</td>
            <td className="px-4 py-3">{a.schools}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(a.totalPaidPKR)}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(a.commission.pendingPKR)}</td>
            <td className="px-4 py-3 font-semibold text-[#2a5cac]" dir="ltr">{pkr(a.commission.approvedPKR)}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(a.commission.paidPKR)}</td>
            <td className="px-4 py-3"><Pill value={a.isActive ? 'Active' : 'Suspended'}>{a.isActive ? 'Active' : 'Suspended'}</Pill></td>
            <td className="px-4 py-3"><div className="flex gap-1">
              <button className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`} onClick={() => open('edit', a)}>Edit</button>
              <button className={`${btnPrimary} !px-2.5 !py-1.5 !text-xs`} disabled={a.commission.approvedPKR < 1} onClick={() => open('payout', a)}>Pay</button>
              <button title="Reset password" aria-label="Reset password" className={`${btnGhost} !px-2 !py-1.5`} onClick={() => reset(a)}><KeyRound className="h-4 w-4" /></button>
              <button title={a.isActive ? 'Suspend' : 'Reactivate'} aria-label={a.isActive ? 'Suspend' : 'Reactivate'} className={`${btnGhost} !px-2 !py-1.5`} onClick={() => toggle(a)}>{a.isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}</button>
            </div></td>
          </tr>))}
      </Shell>

      {modal?.type === 'create' && (
        <Modal title="Add agent" onClose={() => setModal(null)}><form onSubmit={create} className="space-y-4">
          <Field label="Name"><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email (used to sign in)"><input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="City"><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field></div>
          <Field label="Commission %" hint="Applies to schools linked from now on. Each school keeps the rate it joined with."><input required className={inputCls} dir="ltr" inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} /></Field>
          <Field label="Internal note"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {err && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className={btnGhost}>Cancel</button><button disabled={busy} className={btnPrimary}>Create agent</button></div>
        </form></Modal>)}

      {modal?.type === 'edit' && (
        <Modal title={`Edit ${modal.agent.name}`} onClose={() => setModal(null)}><form onSubmit={edit} className="space-y-4">
          <Field label="Name"><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="City"><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field></div>
          <Field label="Commission %" hint="Only affects schools linked after this change."><input required className={inputCls} dir="ltr" inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} /></Field>
          <Field label="Internal note"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {err && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className={btnGhost}>Cancel</button><button disabled={busy} className={btnPrimary}>Save</button></div>
        </form></Modal>)}

      {modal?.type === 'payout' && (
        <Modal title={`Pay ${modal.agent.name}`} onClose={() => setModal(null)}><form onSubmit={payout} className="space-y-4">
          <div className="rounded-lg bg-[#eef2f8] px-4 py-3"><p className="text-xs text-[#5b6b7b]">Approved commission to pay now</p><p className="text-2xl font-bold" dir="ltr">{pkr(modal.agent.commission.approvedPKR)}</p></div>
          {modal.agent.payout?.accountNumber && <p className="text-xs text-[#5b6b7b]">Agent's payout details: {modal.agent.payout.method} · {modal.agent.payout.accountTitle} · <span dir="ltr">{modal.agent.payout.accountNumber}</span></p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by"><select className={inputCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Paid on"><input required type="date" max={fmtDay(new Date())} className={inputCls} value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} /></Field>
          </div>
          <Field label="Reference (optional)"><input className={inputCls} dir="ltr" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          <p className="text-xs text-[#5b6b7b]">This marks all approved commission as paid. Make the transfer first, then record it here.</p>
          {err && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className={btnGhost}>Cancel</button><button disabled={busy} className={btnPrimary}>Record payout</button></div>
        </form></Modal>)}

      {secret && (
        <Modal title="Sign-in details" onClose={() => setSecret(null)}>
          <p className="text-sm text-[#3b4a5c]">Share these with the agent now. The password is shown only once; they can change it after signing in at <b>/agent/login</b>.</p>
          <div className="mt-4 space-y-2 rounded-lg bg-[#f7f6f2] p-4 font-mono text-sm" dir="ltr"><p>{secret.email}</p><p className="font-bold">{secret.password}</p></div>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => copy(`${secret.email}\n${secret.password}`)} className={btnGhost}><Copy className="h-4 w-4" /> Copy</button><button onClick={() => setSecret(null)} className={btnPrimary}>Done</button></div>
        </Modal>)}
      {err && !modal && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
    </div>
  );
};

/* ───────────── Payments ───────────── */
export const PaymentsTab = ({ plans, onChanged }) => {
  const [status, setStatus] = useState('');
  const st = useList('/superadmin/payments', 'payments', { status });
  const [rec, setRec] = useState(false);
  const [refund, setRefund] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const doRefund = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await apiClient.post(`/superadmin/payments/${refund.id}/refund`, { reason }); toast.success('Payment refunded'); setRefund(null); setReason(''); st.reload(); onChanged?.(); }
    catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  const total = st.extra?.confirmedTotalPKR;
  return (
    <div className="page-ready space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); st.setPage(1); }} className={`${inputCls} !w-auto`} aria-label="Status"><option value="">All payments</option><option value="Confirmed">Confirmed</option><option value="Refunded">Refunded</option></select>
        {total !== undefined && <span className="text-sm text-[#5b6b7b]">Confirmed in this view: <b className="text-[#1b2837]" dir="ltr">{pkr(total)}</b></span>}
        <button onClick={() => setRec(true)} className={`${btnPrimary} ms-auto`}><Plus className="h-4 w-4" /> Record payment</button>
      </Card>
      <Shell state={st} head={['Received', 'School', 'Plan', 'Covers', 'Amount', 'Method', 'Status', '']} minW={900}
        empty={<EmptyState title="No payments recorded" text="When a school pays you by bank, JazzCash, Easypaisa or cash, record it here. Their plan extends and any agent commission is worked out for you." action={<button onClick={() => setRec(true)} className={btnPrimary}><Plus className="h-4 w-4" /> Record payment</button>} />}>
        {st.rows.map((p) => (
          <tr key={p.id} className="border-b border-[#e3e7e7]/60 last:border-0">
            <td className="px-4 py-3">{fmtDate(p.paidAt)}</td>
            <td className="px-4 py-3"><p className="font-semibold">{p.schoolName}</p><p className="font-mono text-xs text-[#5b6b7b]">{p.schoolCode}</p></td>
            <td className="px-4 py-3 capitalize">{p.plan} · {p.billingPeriod}</td>
            <td className="px-4 py-3 text-xs">{fmtDate(p.coversFrom)} → {fmtDate(p.coversTo)}</td>
            <td className="px-4 py-3 font-semibold" dir="ltr">{pkr(p.amountPKR)}</td>
            <td className="px-4 py-3 capitalize">{p.method}{p.reference && <p className="font-mono text-[11px] text-[#5b6b7b]">{p.reference}</p>}</td>
            <td className="px-4 py-3"><Pill value={p.status}>{p.status}</Pill>{p.refundReason && <p className="mt-1 text-[11px] text-[#5b6b7b]">{p.refundReason}</p>}</td>
            <td className="px-4 py-3">{p.status === 'Confirmed' && <button onClick={() => { setErr(''); setRefund(p); }} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`}><RotateCcw className="h-3.5 w-3.5" /> Refund</button>}</td>
          </tr>))}
      </Shell>
      {rec && <RecordPaymentModal plans={plans} onClose={() => setRec(false)} onDone={() => { st.reload(); onChanged?.(); }} />}
      {refund && (
        <Modal title="Refund this payment?" onClose={() => setRefund(null)}><form onSubmit={doRefund} className="space-y-4">
          <p className="text-sm">{refund.schoolName} · <b dir="ltr">{pkr(refund.amountPKR)}</b> on {fmtDate(refund.paidAt)}. The school's coverage from this payment is removed and any agent commission is cancelled or adjusted.</p>
          <Field label="Reason"><input required minLength={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {err && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setRefund(null)} className={btnGhost}>Keep payment</button><button disabled={busy} className={btnDanger}>Refund</button></div>
        </form></Modal>)}
    </div>
  );
};

/* ───────────── Commissions + rules ───────────── */
export const CommissionsTab = ({ onChanged }) => {
  const [status, setStatus] = useState('Pending');
  const st = useList('/superadmin/commissions', 'commissions', { status });
  const [sel, setSel] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [pf, setPf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voidRow, setVoidRow] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => { setSel([]); }, [status, st.page]);
  useEffect(() => { apiClient.get('/superadmin/commission-policy').then((r) => { setPolicy(r.data.policy); setPf({ recurringMonths: r.data.policy.recurringMonths, holdDays: r.data.policy.holdDays }); }).catch(() => {}); }, []);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const approve = async (force) => {
    setBusy(true);
    try { const r = await apiClient.post('/superadmin/commissions/approve', { ids: sel, force }); toast.success(r.data.message + (r.data.skipped?.length ? ` · ${r.data.skipped.length} still in waiting period` : '')); setSel([]); st.reload(); onChanged?.(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const doVoid = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await apiClient.post(`/superadmin/commissions/${voidRow.id}/void`, { reason }); toast.success('Commission cancelled'); setVoidRow(null); setReason(''); st.reload(); onChanged?.(); }
    catch (e2) { toast.error(errMsg(e2)); } finally { setBusy(false); }
  };
  const savePolicy = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await apiClient.put('/superadmin/commission-policy', { recurringMonths: Number(pf.recurringMonths), holdDays: Number(pf.holdDays) }); setPolicy(r.data.policy); toast.success('Commission rules saved'); }
    catch (e2) { toast.error(errMsg(e2)); } finally { setBusy(false); }
  };
  const pendingSel = st.rows.filter((r) => sel.includes(r.id));
  const due = pendingSel.filter((r) => r.eligibleAt && new Date(r.eligibleAt) <= new Date()).length;
  return (
    <div className="page-ready space-y-4">
      {pf && (
        <Card><form onSubmit={savePolicy} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1"><h3 className="font-semibold">Commission rules</h3><p className="text-xs text-[#5b6b7b]">Apply to every agent. Changes affect payments recorded from now on.</p></div>
          <Field label="Earn for (months)"><input className={`${inputCls} !w-28`} dir="ltr" inputMode="numeric" value={pf.recurringMonths} onChange={(e) => setPf({ ...pf, recurringMonths: e.target.value })} /></Field>
          <Field label="Hold before approval (days)"><input className={`${inputCls} !w-28`} dir="ltr" inputMode="numeric" value={pf.holdDays} onChange={(e) => setPf({ ...pf, holdDays: e.target.value })} /></Field>
          <button disabled={busy} className={btnGhost}>Save rules</button>
        </form></Card>)}
      <Card className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); st.setPage(1); }} className={`${inputCls} !w-auto`} aria-label="Status">{['Pending', 'Approved', 'Paid', 'Void', ''].map((x) => <option key={x} value={x}>{x || 'All'}</option>)}</select>
        {status === 'Pending' && <>
          <button disabled={busy || !sel.length} onClick={() => approve(false)} className={btnPrimary}><CheckCircle2 className="h-4 w-4" /> Approve selected ({due} ready)</button>
          <button disabled={busy || !sel.length} onClick={() => { if (window.confirm('Approve now, even if the waiting period has not ended?')) approve(true); }} className={btnGhost}>Approve early</button>
        </>}
      </Card>
      <Shell state={st} head={['', 'Date', 'Agent', 'School', 'Payment', 'Rate', 'Commission', 'Status', '']} minW={980}
        empty={<EmptyState title={`No ${status ? status.toLowerCase() : ''} commissions`} text="Commission rows appear when a school linked to an agent has a payment recorded." />}>
        {st.rows.map((c) => (
          <tr key={c.id} className="border-b border-[#e3e7e7]/60 last:border-0">
            <td className="px-4 py-3">{c.status === 'Pending' && <input type="checkbox" aria-label="Select" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />}</td>
            <td className="px-4 py-3">{fmtDate(c.createdAt)}</td>
            <td className="px-4 py-3 font-semibold">{c.agentName || '—'}</td>
            <td className="px-4 py-3">{c.schoolName}{c.kind === 'reversal' && <span className="ms-2 text-xs text-[#8a4636]">refund adjustment</span>}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(c.baseAmountPKR)}</td><td className="px-4 py-3" dir="ltr">{c.percent}%</td>
            <td className="px-4 py-3 font-semibold" dir="ltr">{pkr(c.amountPKR)}</td>
            <td className="px-4 py-3"><Pill value={c.status}>{c.status}</Pill>{c.status === 'Pending' && c.eligibleAt && <p className="mt-1 text-[11px] text-[#5b6b7b]">Ready {fmtDate(c.eligibleAt)}</p>}{c.voidReason && <p className="mt-1 text-[11px] text-[#5b6b7b]">{c.voidReason}</p>}</td>
            <td className="px-4 py-3">{['Pending', 'Approved'].includes(c.status) && c.kind === 'accrual' && <button onClick={() => { setReason(''); setVoidRow(c); }} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`}>Cancel</button>}</td>
          </tr>))}
      </Shell>
      {voidRow && (
        <Modal title="Cancel this commission?" onClose={() => setVoidRow(null)}><form onSubmit={doVoid} className="space-y-4">
          <p className="text-sm">{voidRow.agentName} · {voidRow.schoolName} · <b dir="ltr">{pkr(voidRow.amountPKR)}</b>. It will no longer be owed.</p>
          <Field label="Reason"><input required minLength={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setVoidRow(null)} className={btnGhost}>Keep</button><button disabled={busy} className={btnDanger}>Cancel commission</button></div>
        </form></Modal>)}
    </div>
  );
};

/* ───────────── Ledger & audit ───────────── */
export const LedgerTab = ({ onChanged }) => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const audit = useList('/superadmin/audit', 'entries');
  const load = useCallback(() => apiClient.get('/superadmin/ledger').then((r) => { setData(r.data); setErr(''); }).catch((e) => setErr(errMsg(e, 'Could not load'))), []);
  useEffect(() => { load(); }, [load]);
  const fix = async () => {
    setBusy(true);
    try { const r = await apiClient.post('/superadmin/ledger/reconcile'); setData(r.data); toast.success(r.data.ok ? 'Everything balances' : 'Some checks still fail'); onChanged?.(); audit.reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (err) return <EmptyState title={err} action={<button onClick={load} className={btnGhost}>Try again</button>} />;
  if (!data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>;
  return (
    <div className="page-ready space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {data.ok ? <ShieldCheck className="h-6 w-6 text-[#2c776c]" /> : <AlertTriangle className="h-6 w-6 text-[#b86650]" />}
          <div className="flex-1"><h3 className="font-semibold">{data.ok ? 'Books balance' : 'Books need attention'}</h3><p className="text-xs text-[#5b6b7b]">{data.unsettled ? `${data.unsettled} payment(s) not yet posted. ` : ''}Checks compare the ledger against payments, payouts and commissions.</p></div>
          <button disabled={busy} onClick={fix} className={btnGhost}>{busy ? 'Checking…' : 'Check and repair'}</button>
        </div>
        <ul className="mt-4 divide-y divide-[#e3e7e7]">{data.checks.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="flex items-center gap-2">{c.ok ? <CheckCircle2 className="h-4 w-4 text-[#2c776c]" /> : <AlertTriangle className="h-4 w-4 text-[#b86650]" />}{c.name}</span>
            <span className="text-xs text-[#5b6b7b]" dir="ltr">{pkr(c.expected)} expected · {pkr(c.actual)} found</span>
          </li>))}</ul>
      </Card>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[520px] text-start text-sm"><thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{['Account', 'Debit', 'Credit', 'Balance'].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody>{data.trialBalance.accounts.map((a) => (<tr key={a.code} className="border-b border-[#e3e7e7]/60 last:border-0"><td className="px-4 py-3"><span className="font-mono text-xs text-[#5b6b7b]">{a.code}</span> {a.name}</td><td className="px-4 py-3" dir="ltr">{pkr(a.debit)}</td><td className="px-4 py-3" dir="ltr">{pkr(a.credit)}</td><td className="px-4 py-3 font-semibold" dir="ltr">{pkr(a.balance)}</td></tr>))}
            <tr className="bg-[#f7f6f2] font-semibold"><td className="px-4 py-3">Total</td><td className="px-4 py-3" dir="ltr">{pkr(data.trialBalance.totalDebit)}</td><td className="px-4 py-3" dir="ltr">{pkr(data.trialBalance.totalCredit)}</td><td className="px-4 py-3">{data.trialBalance.balanced ? 'Balanced' : 'Out of balance'}</td></tr></tbody></table>
      </Card>
      <div><h3 className="mb-2 font-semibold">Activity log</h3>
        <Shell state={audit} head={['When', 'Who', 'Action', 'Detail']} minW={720}
          empty={<EmptyState title="Nothing logged yet" text="Payments, refunds, approvals, payouts and agent changes are recorded here and cannot be edited." />}>
          {audit.rows.map((a) => (<tr key={a._id || a.id} className="border-b border-[#e3e7e7]/60 last:border-0 align-top">
            <td className="whitespace-nowrap px-4 py-3 text-xs">{new Date(a.createdAt).toLocaleString('en-GB')}</td>
            <td className="px-4 py-3">{a.actorName || '—'}</td><td className="px-4 py-3 font-mono text-xs">{a.action}</td>
            <td className="max-w-md px-4 py-3 text-xs text-[#5b6b7b]">{a.detail ? JSON.stringify(a.detail).slice(0, 160) : ''}</td></tr>))}
        </Shell></div>
    </div>
  );
};
