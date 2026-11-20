import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Copy } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { pkr, fmtDate, Card, Stat, Pager, Modal, Field, TableSkeleton, EmptyState, inputCls, btnPrimary, btnGhost, btnDanger, errMsg } from '../../components/ui';

const TONE = { New: 'bg-[#eef2f8] text-[#234c91]', Contacted: 'bg-[#eef2f8] text-[#234c91]', DemoBooked: 'bg-[#fbf0ec] text-[#8a4636]', Quoted: 'bg-[#fbf0ec] text-[#8a4636]', Won: 'bg-[#edf5f3] text-[#215a52]', Lost: 'bg-[#f1f2f2] text-[#5b6b7b]', Spam: 'bg-[#f1f2f2] text-[#5b6b7b]',
  Draft: 'bg-[#f1f2f2] text-[#5b6b7b]', Sent: 'bg-[#eef2f8] text-[#234c91]', Accepted: 'bg-[#edf5f3] text-[#215a52]', Declined: 'bg-[#f1f2f2] text-[#5b6b7b]', Expired: 'bg-[#fbf0ec] text-[#8a4636]', Withdrawn: 'bg-[#f1f2f2] text-[#5b6b7b]',
  Issued: 'bg-[#fbf0ec] text-[#8a4636]', Paid: 'bg-[#edf5f3] text-[#215a52]', Void: 'bg-[#f1f2f2] text-[#5b6b7b]', Open: 'bg-[#fbf0ec] text-[#8a4636]', WaitingOnSchool: 'bg-[#eef2f8] text-[#234c91]', Resolved: 'bg-[#edf5f3] text-[#215a52]', Closed: 'bg-[#f1f2f2] text-[#5b6b7b]',
  Published: 'bg-[#edf5f3] text-[#215a52]', urgent: 'bg-[#fff1f2] text-[#9f1239]', high: 'bg-[#fbf0ec] text-[#8a4636]', normal: 'bg-[#f1f2f2] text-[#5b6b7b]', low: 'bg-[#f1f2f2] text-[#5b6b7b]', overdue: 'bg-[#fff1f2] text-[#9f1239]' };
const St = ({ v, label }) => <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[v] || TONE.Draft}`}>{label || v}</span>;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const METHODS = [['bank', 'Bank transfer'], ['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['cash', 'Cash'], ['other', 'Other']];

const useList = (path, key, params = {}) => {
  const [s, setS] = useState({ rows: [], pagination: null, loading: true, error: '' }); const [page, setPage] = useState(1); const q = JSON.stringify(params);
  const load = useCallback(async () => { setS((x) => ({ ...x, loading: true, error: '' })); try { const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } }); setS({ rows: r.data[key] || [], pagination: r.data.pagination, loading: false, error: '' }); } catch (e) { setS((x) => ({ ...x, loading: false, error: errMsg(e, 'Could not load') })); } }, [path, key, page, q]);
  useEffect(() => { load(); }, [load]);
  return { ...s, page, setPage, reload: load };
};
const Table = ({ state, head, empty, children, minW = 700 }) => (
  <Card className="overflow-hidden !p-0">
    {state.loading ? <TableSkeleton cols={head.length} /> : state.error ? <EmptyState title={state.error} action={<button onClick={state.reload} className={btnGhost}>Try again</button>} /> : state.rows.length === 0 ? <EmptyState title={empty} />
      : <div className="overflow-x-auto"><table className="w-full text-start text-sm" style={{ minWidth: minW }}><thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
    <Pager pagination={state.pagination} onPage={state.setPage} />
  </Card>
);
const Chips = ({ value, onChange, items }) => (<div className="flex flex-wrap gap-2" role="group">{items.map(([k, l]) => <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className={`rounded-full border px-3 py-1 text-xs font-semibold ${value === k ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>{l}</button>)}</div>);
const run = async (fn, ok, after) => { try { const r = await fn(); if (ok) toast.success(typeof ok === 'function' ? ok(r) : ok); if (after) await after(r); return r; } catch (e) { toast.error(errMsg(e)); return null; } };

/* ───────────── a link to copy, shown once ───────────── */
const LinkModal = ({ link, onClose }) => (
  <Modal title="Send this link to the buyer" onClose={onClose}>
    <p className="text-sm text-[#3b4a5c]">This link is shown only now. Copy it and send it by email or WhatsApp. If it is lost, send the quote again to make a new one.</p>
    <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${inputCls} mt-3 font-mono text-xs`} aria-label="Quote link" />
    <div className="mt-4 flex justify-end gap-2"><button className={btnPrimary} onClick={() => { navigator.clipboard?.writeText(link).then(() => toast.success('Link copied'), () => toast.error('Copy it by hand')); }}><Copy className="h-4 w-4" /> Copy link</button><button className={btnGhost} onClick={onClose}>Done</button></div>
  </Modal>
);

/* ───────────── a quote ───────────── */
const QuoteForm = ({ lead, plans, onClose, onDone }) => {
  const paid = Object.entries(plans || {}).filter(([, p]) => p.pricePKR > 0);
  const [f, setF] = useState({ planSlug: paid[0]?.[0] || '', billingPeriod: 'monthly', discountPercent: '', discountReason: '', extraLabel: '', extraAmount: '', validDays: '', note: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const p = plans?.[f.planSlug]; const list = (f.billingPeriod === 'yearly' ? p?.yearlyPricePKR : p?.pricePKR) || 0; const sub = list + (Number(f.extraAmount) > 0 ? Math.round(Number(f.extraAmount)) : 0); const disc = Math.round((sub * (Number(f.discountPercent) || 0)) / 100);
  const submit = async (send) => { setBusy(true); setErr(''); try { const body = { leadId: lead._id, planSlug: f.planSlug, billingPeriod: f.billingPeriod, discountPercent: Number(f.discountPercent) || 0, discountReason: f.discountReason, validDays: f.validDays ? Number(f.validDays) : undefined, note: f.note, extraLines: f.extraLabel && f.extraAmount ? [{ label: f.extraLabel, amountPKR: Number(f.extraAmount) }] : [] };
    const r = await apiClient.post('/superadmin/sales/quotes', body); if (send) { const s = await apiClient.post(`/superadmin/sales/quotes/${r.data.quote._id}/send`); onDone(s.data.link); } else { toast.success('Draft saved'); onDone(null); } } catch (e) { setErr(errMsg(e, 'Could not save')); } finally { setBusy(false); } };
  return (
    <Modal title={`Quote for ${lead.schoolName}`} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan"><select className={inputCls} value={f.planSlug} onChange={set('planSlug')}>{paid.map(([k, pl]) => <option key={k} value={k}>{pl.label}</option>)}</select></Field>
        <Field label="Billing"><select className={inputCls} value={f.billingPeriod} onChange={set('billingPeriod')}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
        <Field label="Extra item (optional)" hint="e.g. Data import"><input className={inputCls} value={f.extraLabel} onChange={set('extraLabel')} maxLength={160} /></Field>
        <Field label="Extra amount (Rs)"><input type="number" min="0" className={inputCls} value={f.extraAmount} onChange={set('extraAmount')} /></Field>
        <Field label="Discount %" hint="0 to 50"><input type="number" min="0" max="50" className={inputCls} value={f.discountPercent} onChange={set('discountPercent')} /></Field>
        <Field label="Why the discount" hint="Required with a discount"><input className={inputCls} value={f.discountReason} onChange={set('discountReason')} maxLength={200} /></Field>
        <Field label="Valid for (days)" hint="Blank uses your default"><input type="number" min="1" max="90" className={inputCls} value={f.validDays} onChange={set('validDays')} /></Field>
        <Field label="Note to the buyer (optional)"><input className={inputCls} value={f.note} onChange={set('note')} maxLength={1000} /></Field>
      </div>
      <p className="mt-4 rounded-lg bg-[#f7f6f2] p-3 text-sm">Total <b>{pkr(sub - disc)}</b>{disc > 0 && <span className="text-[#5b6b7b]"> (after {pkr(disc)} off)</span>}</p>
      {err && <p role="alert" className="mt-3 text-sm text-[#9f1239]">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} disabled={busy} onClick={() => submit(false)}>Save as draft</button><button className={btnPrimary} disabled={busy} onClick={() => submit(true)}>Save and get link</button></div>
    </Modal>
  );
};

/* ───────────── a lead ───────────── */
const LeadModal = ({ id, plans, onClose, onChanged }) => {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [status, setStatus] = useState(''); const [lost, setLost] = useState(''); const [demo, setDemo] = useState(''); const [note, setNote] = useState(''); const [quoting, setQuoting] = useState(false); const [link, setLink] = useState(''); const [made, setMade] = useState(null);
  const load = useCallback(() => apiClient.get(`/superadmin/sales/leads/${id}`).then((r) => { setD(r.data); setStatus(r.data.lead.status); setNote(r.data.lead.ownerNote || ''); }).catch((e) => setErr(errMsg(e))), [id]); useEffect(() => { load(); }, [load]);
  if (err) return <Modal title="Lead" onClose={onClose}><p className="text-sm text-[#9f1239]">{err}</p></Modal>; if (!d) return <Modal title="Lead" onClose={onClose}><TableSkeleton rows={4} cols={2} /></Modal>;
  const l = d.lead; const patch = (b, ok) => run(() => apiClient.patch(`/superadmin/sales/leads/${id}`, b), ok, async () => { await load(); onChanged(); });
  if (link) return <LinkModal link={link} onClose={() => { setLink(''); load(); onChanged(); }} />;
  if (quoting) return <QuoteForm lead={l} plans={plans} onClose={() => setQuoting(false)} onDone={(lk) => { setQuoting(false); if (lk) setLink(lk); else { load(); onChanged(); } }} />;
  if (made) return (<Modal title="School created" onClose={() => { setMade(null); load(); onChanged(); }}><p className="text-sm">School code <b className="font-mono">{made.school.code}</b>. The administrator is {made.admin.name} ({made.admin.email}).</p><p className="mt-3 rounded-lg bg-[#fbf0ec] p-3 text-sm">Temporary password: <b className="font-mono">{made.temporaryPassword}</b><br /><span className="text-xs">Shown only now. Send it to them privately; they should change it at first sign-in.</span></p><div className="mt-4 text-end"><button className={btnPrimary} onClick={() => { setMade(null); load(); onChanged(); }}>Done</button></div></Modal>);
  return (
    <Modal title={`${l.name} · ${l.schoolName}`} onClose={onClose} wide>
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2"><p><b>Email</b> {l.email}</p><p><b>Phone</b> {l.phone || '—'}</p><p><b>City</b> {l.city || '—'}</p><p><b>Students</b> {l.students || '—'}</p><p><b>Wants</b> {l.interest}{l.preferredTime ? ` · ${l.preferredTime}` : ''}</p><p><b>From</b> {l.source}{l.utm.campaign ? ` · ${l.utm.campaign}` : ''}{l.agentName ? ` · agent ${l.agentName}` : ''}</p><p><b>Asked</b> {l.requests} time{l.requests > 1 ? 's' : ''}, first {when(l.createdAt)}</p><p><b>Status</b> <St v={l.status} /></p></div>
      {l.message && <p className="mt-3 rounded-lg bg-[#f7f6f2] p-3 text-sm">{l.message}</p>}
      {!['Won'].includes(l.status) && (<div className="mt-4 grid gap-3 rounded-xl border border-[#e3e7e7] p-4 sm:grid-cols-2"><Field label="Move to"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{['New', 'Contacted', 'DemoBooked', 'Quoted', 'Lost', 'Spam'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        {status === 'Lost' && <Field label="Why lost"><input className={inputCls} value={lost} onChange={(e) => setLost(e.target.value)} maxLength={200} /></Field>}{status === 'DemoBooked' && <Field label="Demo date and time"><input type="datetime-local" className={inputCls} value={demo} onChange={(e) => setDemo(e.target.value)} /></Field>}
        <div className="flex items-end gap-2 sm:col-span-2"><button className={btnPrimary} disabled={status === l.status} onClick={() => patch({ status, lostReason: lost, demoAt: demo ? new Date(demo).toISOString() : undefined }, 'Updated')}>Save status</button><button className={btnGhost} onClick={() => patch({ logContact: true }, 'Contact logged')}>I contacted them</button></div></div>)}
      <Field label="Private notes"><textarea rows={2} className={`${inputCls} mt-3`} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (l.ownerNote || '') && patch({ ownerNote: note }, 'Note saved')} maxLength={2000} /></Field>
      <div className="mt-4 flex flex-wrap gap-2">{!['Lost', 'Spam', 'Won'].includes(l.status) && <button className={btnPrimary} onClick={() => setQuoting(true)}>New quote</button>}{!l.convertedSchoolId && !['Lost', 'Spam'].includes(l.status) && <button className={btnGhost} onClick={() => run(() => apiClient.post(`/superadmin/sales/leads/${id}/convert`, {}), 'School created', (r) => setMade(r.data))}>Create their school</button>}{l.convertedSchoolId && <span className="self-center text-xs text-[#215a52]">School created</span>}</div>
      {(d.quotes.length > 0 || d.invoices.length > 0) && (<div className="mt-4 text-sm"><h4 className="mb-1 font-bold">Quotes and invoices</h4><ul className="space-y-1">{d.quotes.map((q) => <li key={q._id} className="flex justify-between gap-2"><span>{q.number} · {q.planLabel} {q.billingPeriod} · {pkr(q.totalPKR)}</span><St v={q.status} /></li>)}{d.invoices.map((i) => <li key={i._id} className="flex justify-between gap-2"><span>{i.number} · {pkr(i.totalPKR)}</span><St v={i.overdue ? 'overdue' : i.status} label={i.overdue ? 'Overdue' : i.status} /></li>)}</ul></div>)}
      <details className="mt-4 text-xs text-[#5b6b7b]"><summary className="cursor-pointer font-semibold">History ({l.history.length})</summary><ul className="mt-2 space-y-1">{[...l.history].reverse().map((h, i) => <li key={i}>{when(h.at)} · {h.by} · {h.action}{h.note ? ` · ${h.note}` : ''}</li>)}</ul></details>
    </Modal>
  );
};

const Pipeline = ({ plans }) => {
  const [status, setStatus] = useState('open'); const [q, setQ] = useState(''); const [open, setOpen] = useState(null); const [sum, setSum] = useState(null);
  const list = useList('/superadmin/sales/leads', 'leads', { status: status === 'all' ? undefined : status, q: q || undefined }); const loadSum = useCallback(() => apiClient.get('/superadmin/sales/pipeline').then((r) => setSum(r.data)).catch(() => {}), []); useEffect(() => { loadSum(); }, [loadSum]);
  return (<div className="space-y-4">
    {sum && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Open leads" value={sum.openLeads} sub={`${sum.newLast7d} new this week`} /><Stat label="Not yet contacted (over 24h)" value={sum.uncontactedOver24h} tone={sum.uncontactedOver24h ? 'text-[#9f1239]' : undefined} /><Stat label="Quotes out" value={sum.openQuotes} sub={pkr(sum.openQuoteValuePKR)} /><Stat label="Unpaid invoices" value={sum.unpaidInvoices} sub={`${pkr(sum.unpaidValuePKR)}${sum.overdueInvoices ? ` · ${sum.overdueInvoices} overdue` : ''}`} /></div>}
    {sum && <p className="text-xs text-[#5b6b7b]">Last 90 days: {sum.won90d} won, {sum.lost90d} lost{sum.conversion90d !== null ? ` (${sum.conversion90d}% of decided leads)` : ''}{sum.sources.length ? ` · sources: ${sum.sources.map((s) => `${s.source} ${s.count}`).join(', ')}` : ''}</p>}
    <div className="flex flex-wrap items-center gap-3"><Chips value={status} onChange={setStatus} items={[['open', 'Open'], ['New', 'New'], ['Contacted', 'Contacted'], ['DemoBooked', 'Demo booked'], ['Quoted', 'Quoted'], ['Won', 'Won'], ['Lost', 'Lost'], ['Spam', 'Spam'], ['all', 'All']]} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, school, email" aria-label="Search leads" className={`${inputCls} max-w-xs`} /></div>
    <Table state={list} head={['Who', 'School', 'Wants', 'Status', 'From', 'Asked']} empty="No leads here yet. They appear when someone uses Book a demo on the website.">
      {list.rows.map((l) => (<tr key={l._id} className="cursor-pointer border-b border-[#e3e7e7] hover:bg-[#f7f6f2]" onClick={() => setOpen(l._id)}><td className="px-4 py-3"><button className="text-start font-semibold text-[#2a5cac]" onClick={(e) => { e.stopPropagation(); setOpen(l._id); }}>{l.name}</button><div className="text-xs text-[#5b6b7b]">{l.email}</div></td><td className="px-4 py-3">{l.schoolName}<div className="text-xs text-[#5b6b7b]">{l.city}{l.students ? ` · ${l.students} students` : ''}</div></td><td className="px-4 py-3">{l.interest}</td><td className="px-4 py-3"><St v={l.status} /></td><td className="px-4 py-3 text-xs">{l.source}{l.agentName ? ` · ${l.agentName}` : ''}</td><td className="px-4 py-3 text-xs">{when(l.createdAt)}{l.requests > 1 ? ` · ×${l.requests}` : ''}</td></tr>))}
    </Table>
    {open && <LeadModal id={open} plans={plans} onClose={() => setOpen(null)} onChanged={() => { list.reload(); loadSum(); }} />}
  </div>);
};

/* ───────────── quotes and invoices ───────────── */
const Money = () => {
  const [view, setView] = useState('quotes'); const [link, setLink] = useState(''); const [paying, setPaying] = useState(null); const [reason, setReason] = useState(null);
  const quotes = useList('/superadmin/sales/quotes', 'quotes'); const invoices = useList('/superadmin/sales/invoices', 'invoices'); const [pf, setPf] = useState({ method: 'bank', reference: '' }); const [rs, setRs] = useState('');
  const refresh = () => { quotes.reload(); invoices.reload(); };
  return (<div className="space-y-4"><Chips value={view} onChange={setView} items={[['quotes', 'Quotes'], ['invoices', 'Invoices']]} />
    {view === 'quotes' ? (<Table state={quotes} head={['Quote', 'School', 'Plan', 'Total', 'Valid until', 'Status', '']} empty="No quotes yet. Make one from a lead." minW={820}>
      {quotes.rows.map((q) => (<tr key={q._id} className="border-b border-[#e3e7e7]"><td className="px-4 py-3 font-mono text-xs">{q.number}</td><td className="px-4 py-3">{q.schoolName}<div className="text-xs text-[#5b6b7b]">{q.buyerName}</div></td><td className="px-4 py-3">{q.planLabel} · {q.billingPeriod}</td><td className="px-4 py-3">{pkr(q.totalPKR)}{q.discountPercent > 0 && <div className="text-xs text-[#5b6b7b]">{q.discountPercent}% off: {q.discountReason}</div>}</td><td className="px-4 py-3 text-xs">{fmtDate(q.validUntil)}</td><td className="px-4 py-3"><St v={q.status} /></td>
        <td className="space-x-2 px-4 py-3 text-end">{['Draft', 'Sent'].includes(q.status) && <button className={btnGhost} onClick={() => run(() => apiClient.post(`/superadmin/sales/quotes/${q._id}/send`), null, (r) => { setLink(r.data.link); refresh(); })}>{q.status === 'Draft' ? 'Get link' : 'New link'}</button>}{['Draft', 'Sent'].includes(q.status) && <button className={btnDanger} onClick={() => { setRs(''); setReason({ kind: 'quote', id: q._id }); }}>Withdraw</button>}</td></tr>))}
    </Table>) : (<Table state={invoices} head={['Invoice', 'School', 'Total', 'Due', 'Status', '']} empty="No invoices yet. One is made when a buyer accepts a quote." minW={760}>
      {invoices.rows.map((i) => (<tr key={i._id} className="border-b border-[#e3e7e7]"><td className="px-4 py-3 font-mono text-xs">{i.number}</td><td className="px-4 py-3">{i.schoolName}<div className="text-xs text-[#5b6b7b]">{i.planLabel} · {i.billingPeriod}</div></td><td className="px-4 py-3">{pkr(i.totalPKR)}</td><td className="px-4 py-3 text-xs">{fmtDate(i.dueAt)}</td><td className="px-4 py-3"><St v={i.overdue ? 'overdue' : i.status} label={i.overdue ? 'Overdue' : i.status} /></td>
        <td className="space-x-2 px-4 py-3 text-end">{i.status === 'Issued' && <button className={btnPrimary} onClick={() => { setPf({ method: 'bank', reference: '' }); setPaying(i); }}>Record payment</button>}{i.status === 'Issued' && <button className={btnDanger} onClick={() => { setRs(''); setReason({ kind: 'invoice', id: i._id }); }}>Cancel</button>}</td></tr>))}
    </Table>)}
    {link && <LinkModal link={link} onClose={() => setLink('')} />}
    {paying && (<Modal title={`Record payment for ${paying.number}`} onClose={() => setPaying(null)}><p className="text-sm text-[#3b4a5c]">This records {pkr(paying.totalPKR)} from {paying.schoolName}, puts them on the {paying.planLabel} plan and adds the entry to the books.</p><div className="mt-3 grid gap-3"><Field label="Received by"><select className={inputCls} value={pf.method} onChange={(e) => setPf({ ...pf, method: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field><Field label="Reference (transaction id)"><input className={inputCls} value={pf.reference} onChange={(e) => setPf({ ...pf, reference: e.target.value })} maxLength={120} /></Field></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setPaying(null)}>Cancel</button><button className={btnPrimary} onClick={() => run(() => apiClient.post(`/superadmin/sales/invoices/${paying._id}/pay`, pf), (r) => r.data.message, () => { setPaying(null); refresh(); })}>Record payment</button></div></Modal>)}
    {reason && (<Modal title={reason.kind === 'quote' ? 'Withdraw this quote' : 'Cancel this invoice'} onClose={() => setReason(null)}><Field label="Why"><input className={inputCls} value={rs} onChange={(e) => setRs(e.target.value)} maxLength={200} autoFocus /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setReason(null)}>Keep it</button><button className={btnDanger} onClick={() => run(() => apiClient.post(`/superadmin/sales/${reason.kind === 'quote' ? 'quotes' : 'invoices'}/${reason.id}/${reason.kind === 'quote' ? 'withdraw' : 'void'}`, { reason: rs }), 'Done', () => { setReason(null); refresh(); })}>Confirm</button></div></Modal>)}
  </div>);
};

/* ───────────── support inbox ───────────── */
const CaseModal = ({ id, onClose, onChanged }) => {
  const [c, setC] = useState(null); const [text, setText] = useState(''); const [internal, setInternal] = useState(false); const [wait, setWait] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(() => apiClient.get(`/superadmin/support/${id}`).then((r) => setC(r.data.case)).catch((e) => setErr(errMsg(e))), [id]); useEffect(() => { load(); }, [load]);
  if (err) return <Modal title="Case" onClose={onClose}><p className="text-sm text-[#9f1239]">{err}</p></Modal>; if (!c) return <Modal title="Case" onClose={onClose}><TableSkeleton rows={4} cols={2} /></Modal>;
  const upd = (b) => run(() => apiClient.patch(`/superadmin/support/${id}`, b), 'Updated', async () => { await load(); onChanged(); });
  return (<Modal title={`${c.number} · ${c.subject}`} onClose={onClose} wide>
    <p className="text-sm text-[#3b4a5c]">{c.schoolName} ({c.schoolCode}, {c.planSlug}) · {c.openedByName} · {c.category}</p>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><St v={c.status} label={c.status === 'WaitingOnSchool' ? 'Waiting on school' : c.status} /><St v={c.priority} />{c.firstResponseBreached && <St v="overdue" label="First reply was late" />}{c.resolveBreached && <St v="overdue" label="Resolve was late" />}<span>First reply due {when(c.firstResponseDueAt)}{c.firstRespondedAt ? ` · answered ${when(c.firstRespondedAt)}` : ''}</span><span>Resolve by {when(c.resolveDueAt)}</span></div>
    <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto" aria-label="Messages">{c.messages.map((m, i) => (<li key={i} className={`rounded-lg p-3 text-sm ${m.internal ? 'border border-dashed border-[#d9826a] bg-[#fbf0ec]' : m.from === 'owner' ? 'bg-[#eef2f8]' : 'bg-[#f7f6f2]'}`}><p className="text-xs font-semibold text-[#5b6b7b]">{m.byName || m.from}{m.internal ? ' · internal note, not shown to the school' : ''} · {when(m.at)}</p><p className="mt-1 whitespace-pre-line">{m.text}</p></li>))}</ul>
    {c.status !== 'Closed' && (<div className="mt-3"><textarea rows={3} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" aria-label="Reply" maxLength={4000} /><div className="mt-2 flex flex-wrap items-center gap-4 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>{!internal && c.status === 'Open' && <label className="flex items-center gap-1"><input type="checkbox" checked={wait} onChange={(e) => setWait(e.target.checked)} /> Waiting for the school (pauses the clock)</label>}<button className={`${btnPrimary} ms-auto`} disabled={text.trim().length < 2} onClick={() => run(() => apiClient.post(`/superadmin/support/${id}/reply`, { message: text, internal, waitForSchool: wait }), internal ? 'Note saved' : 'Reply sent', async () => { setText(''); setWait(false); await load(); onChanged(); })}>{internal ? 'Save note' : 'Send reply'}</button></div></div>)}
    <div className="mt-4 grid gap-3 border-t border-[#e3e7e7] pt-3 sm:grid-cols-3"><Field label="Status"><select className={inputCls} value={c.status} onChange={(e) => upd({ status: e.target.value })}>{['Open', 'WaitingOnSchool', 'Resolved', 'Closed'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Priority"><select className={inputCls} value={c.priority} onChange={(e) => upd({ priority: e.target.value })}>{['low', 'normal', 'high', 'urgent'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Assigned to"><input className={inputCls} defaultValue={c.assigneeName} onBlur={(e) => e.target.value !== c.assigneeName && upd({ assigneeName: e.target.value })} maxLength={80} /></Field></div>
    {c.rating && <p className="mt-3 text-sm">School rated this {c.rating}/5{c.ratingNote ? `: ${c.ratingNote}` : ''}</p>}
  </Modal>);
};
const Inbox = () => {
  const [status, setStatus] = useState('active'); const [open, setOpen] = useState(null); const [st, setSt] = useState(null);
  const list = useList('/superadmin/support', 'cases', status === 'breached' ? { breached: 1 } : { status: status === 'all' ? undefined : status }); const loadSt = useCallback(() => apiClient.get('/superadmin/support/stats').then((r) => setSt(r.data)).catch(() => {}), []); useEffect(() => { loadSt(); }, [loadSt]);
  return (<div className="space-y-4">
    {st && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Open" value={st.open} /><Stat label="Waiting on school" value={st.waiting} /><Stat label="Missed a deadline (90 days)" value={st.breached} tone={st.breached ? 'text-[#9f1239]' : undefined} /><Stat label="First reply on time" value={st.firstResponseOnTimePct === null ? '—' : `${st.firstResponseOnTimePct}%`} sub={st.avgRating ? `${st.avgRating}/5 average rating` : 'no ratings yet'} /></div>}
    <Chips value={status} onChange={setStatus} items={[['active', 'Needs attention'], ['Open', 'Open'], ['WaitingOnSchool', 'Waiting on school'], ['Resolved', 'Resolved'], ['breached', 'Missed deadline'], ['all', 'All']]} />
    <Table state={list} head={['Case', 'School', 'Priority', 'Status', 'First reply due', 'Last message']} empty="No cases here. Schools open them from Help in their dashboard." minW={820}>
      {list.rows.map((c) => (<tr key={c._id} className="cursor-pointer border-b border-[#e3e7e7] hover:bg-[#f7f6f2]" onClick={() => setOpen(c._id)}><td className="px-4 py-3"><button className="text-start font-semibold text-[#2a5cac]" onClick={(e) => { e.stopPropagation(); setOpen(c._id); }}>{c.subject}</button><div className="font-mono text-xs text-[#5b6b7b]">{c.number}</div></td><td className="px-4 py-3">{c.schoolName}</td><td className="px-4 py-3"><St v={c.priority} /></td><td className="px-4 py-3"><St v={c.status} label={c.status === 'WaitingOnSchool' ? 'Waiting on school' : c.status} /></td><td className="px-4 py-3 text-xs">{c.firstRespondedAt ? 'Answered' : <span className={c.firstResponseOverdue ? 'font-bold text-[#9f1239]' : ''}>{when(c.firstResponseDueAt)}{c.firstResponseOverdue ? ' · overdue' : ''}</span>}</td><td className="px-4 py-3 text-xs">{when(c.lastMessageAt)} · {c.lastFrom}</td></tr>))}
    </Table>
    {open && <CaseModal id={open} onClose={() => setOpen(null)} onChanged={() => { list.reload(); loadSt(); }} />}
  </div>);
};

/* ───────────── proof (customer words) ───────────── */
const ProofForm = ({ item, onClose, onDone }) => {
  const [f, setF] = useState({ quote: item?.quote || '', personName: item?.personName || '', personRole: item?.personRole || '', schoolName: item?.schoolName || '', evidenceKind: item?.evidenceKind || 'email', evidenceNote: item?.evidenceNote || '', wordsAsGiven: item ? item.wordsAsGiven : true, editApprovedOn: item?.editApprovedOn ? String(item.editApprovedOn).slice(0, 10) : '', consentGiven: !!item?.consentGiven, consentOn: item?.consentOn ? String(item.consentOn).slice(0, 10) : '', consentContact: item?.consentContact || '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => { setBusy(true); setErr(''); try { const body = { ...f, editApprovedOn: f.editApprovedOn || null, consentOn: f.consentOn || null }; if (item) await apiClient.put(`/superadmin/sales/proof/${item._id}`, body); else await apiClient.post('/superadmin/sales/proof', body); toast.success('Saved'); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  return (<Modal title={item ? 'Edit customer words' : 'Record customer words'} onClose={onClose} wide>
    <p className="mb-3 rounded-lg bg-[#fbf0ec] p-3 text-xs text-[#8a4636]">Only add words a real person gave you, with their permission. Nothing is shown on the website until you publish it, and publishing needs the consent record below.</p>
    <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Their words"><textarea rows={3} className={inputCls} value={f.quote} onChange={set('quote')} maxLength={600} /></Field></div>
      <Field label="Name"><input className={inputCls} value={f.personName} onChange={set('personName')} maxLength={100} /></Field><Field label="Role"><input className={inputCls} value={f.personRole} onChange={set('personRole')} maxLength={80} /></Field><Field label="School"><input className={inputCls} value={f.schoolName} onChange={set('schoolName')} maxLength={140} /></Field>
      <Field label="Where the original is kept"><select className={inputCls} value={f.evidenceKind} onChange={set('evidenceKind')}>{['email', 'signed-form', 'recorded-call', 'survey', 'other'].map((k) => <option key={k}>{k}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Where exactly" hint="e.g. Email of 3 Nov, saved in Drive/Proof"><input className={inputCls} value={f.evidenceNote} onChange={set('evidenceNote')} maxLength={500} /></Field></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.wordsAsGiven} onChange={set('wordsAsGiven')} /> These are exactly the words they gave</label>{!f.wordsAsGiven && <Field label="Date they approved the edit"><input type="date" className={inputCls} value={f.editApprovedOn} onChange={set('editApprovedOn')} /></Field>}
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.consentGiven} onChange={set('consentGiven')} /> They agreed to be quoted on our website</label><Field label="Date they agreed"><input type="date" className={inputCls} value={f.consentOn} onChange={set('consentOn')} /></Field><Field label="How to reach them"><input className={inputCls} value={f.consentContact} onChange={set('consentContact')} maxLength={160} /></Field></div>
    {err && <p role="alert" className="mt-3 text-sm text-[#9f1239]">{err}</p>}<div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={save}>Save</button></div></Modal>);
};
const Proof = () => {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(''); const [form, setForm] = useState(null); const [why, setWhy] = useState(null); const [rs, setRs] = useState('');
  const load = useCallback(() => apiClient.get('/superadmin/sales/proof').then((r) => setRows(r.data.proof)).catch((e) => setErr(errMsg(e))), []); useEffect(() => { load(); }, [load]);
  const publish = async (t) => { try { await apiClient.post(`/superadmin/sales/proof/${t._id}/publish`); toast.success('Now on the website'); load(); } catch (e) { const p = e.response?.data?.problems; toast.error(p ? p.join(' ') : errMsg(e)); } };
  return (<div className="space-y-4"><div className="flex items-center justify-between"><p className="text-sm text-[#3b4a5c]">The website shows nothing here until you publish an entry. There are no placeholder testimonials.</p><button className={btnPrimary} onClick={() => setForm({})}>Add</button></div>
    {err ? <EmptyState title={err} /> : !rows ? <TableSkeleton rows={3} cols={3} /> : rows.length === 0 ? <EmptyState title="No customer words recorded yet." text="When a school tells you something kind and agrees to share it, record it here." /> : (<div className="grid gap-3 md:grid-cols-2">{rows.map((t) => (<Card key={t._id}><blockquote className="text-sm">{t.quote}</blockquote><p className="mt-2 text-xs text-[#5b6b7b]">{t.personName}{t.personRole ? `, ${t.personRole}` : ''} · {t.schoolName}</p><div className="mt-3 flex flex-wrap items-center gap-2"><St v={t.status === 'Withdrawn' ? 'Void' : t.status} label={t.status} />{t.status === 'Published' && <span className="text-xs text-[#5b6b7b]">review by {fmtDate(t.reviewBy)}</span>}
      <span className="ms-auto flex gap-2">{t.status !== 'Published' && <button className={btnGhost} onClick={() => setForm(t)}>Edit</button>}{t.status !== 'Published' && <button className={btnPrimary} onClick={() => publish(t)}>Publish</button>}{t.status === 'Published' && <button className={btnDanger} onClick={() => { setRs(''); setWhy(t); }}>Take down</button>}{t.status !== 'Published' && <button className={btnDanger} onClick={() => run(() => apiClient.delete(`/superadmin/sales/proof/${t._id}`), 'Deleted', load)}>Delete</button>}</span></div></Card>))}</div>)}
    {form && <ProofForm item={form._id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
    {why && (<Modal title="Take this down" onClose={() => setWhy(null)}><Field label="Why"><input className={inputCls} value={rs} onChange={(e) => setRs(e.target.value)} maxLength={200} autoFocus /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setWhy(null)}>Cancel</button><button className={btnDanger} onClick={() => run(() => apiClient.post(`/superadmin/sales/proof/${why._id}/withdraw`, { reason: rs }), 'Removed from the website', () => { setWhy(null); load(); })}>Take down</button></div></Modal>)}
  </div>);
};

/* ───────────── settings ───────────── */
const Settings = () => {
  const [s, setS] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { apiClient.get('/superadmin/sales/settings').then((r) => setS(r.data.settings)).catch((e) => setErr(errMsg(e))); }, []);
  if (err) return <EmptyState title={err} />; if (!s) return <TableSkeleton rows={5} cols={2} />;
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value })); const hrs = (k, p) => (e) => setS((x) => ({ ...x, [k]: { ...x[k], [p]: e.target.value } }));
  const save = async () => { setBusy(true); try { const r = await apiClient.put('/superadmin/sales/settings', s); setS(r.data.settings); toast.success('Saved'); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const T = ({ k, l, hint }) => <Field label={l} hint={hint}><input className={inputCls} value={s[k] || ''} onChange={set(k)} maxLength={200} /></Field>;
  return (<div className="space-y-4"><Card><h3 className="mb-3 font-bold">Your details and how buyers pay</h3><div className="grid gap-3 sm:grid-cols-2"><T k="companyName" l="Company name" /><T k="address" l="Address" /><T k="email" l="Email" /><T k="phone" l="Phone" /><T k="bankName" l="Bank" /><T k="accountTitle" l="Account title" /><T k="accountNumber" l="Account number" /><T k="iban" l="IBAN" /><T k="jazzcash" l="JazzCash number" /><T k="easypaisa" l="Easypaisa number" /><div className="sm:col-span-2"><T k="paymentNote" l="Note shown with the payment details" /></div></div></Card>
    <Card><h3 className="mb-3 font-bold">Quotes and invoices</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Quote valid for (days)"><input type="number" className={inputCls} value={s.quoteValidDays} onChange={set('quoteValidDays')} /></Field><Field label="Invoice due in (days)"><input type="number" className={inputCls} value={s.invoiceDueDays} onChange={set('invoiceDueDays')} /></Field><div className="sm:col-span-2"><Field label={`Terms (version ${s.termsVersion})`} hint="Buyers accept these exact words. Changing them makes a new version; quotes already sent keep the old text."><textarea rows={6} className={inputCls} value={s.terms} onChange={set('terms')} maxLength={4000} /></Field></div></div></Card>
    <Card><h3 className="mb-1 font-bold">Support promises</h3><p className="mb-3 text-xs text-[#5b6b7b]">Working hours: Monday to Friday, 9am to 6pm Pakistan time. Waiting on the school pauses the resolve clock.</p><div className="grid gap-3 sm:grid-cols-4">{['low', 'normal', 'high', 'urgent'].map((p) => <Field key={p} label={`${p}: first reply (hours)`}><input type="number" className={inputCls} value={s.firstResponseHours[p]} onChange={hrs('firstResponseHours', p)} /></Field>)}{['low', 'normal', 'high', 'urgent'].map((p) => <Field key={p} label={`${p}: resolve (hours)`}><input type="number" className={inputCls} value={s.resolveHours[p]} onChange={hrs('resolveHours', p)} /></Field>)}</div></Card>
    <div className="text-end"><button className={btnPrimary} disabled={busy} onClick={save}>Save settings</button></div></div>);
};

export function SalesTab({ plans }) {
  const [sub, setSub] = useState('pipeline');
  return (<div className="space-y-5"><div><h2 className="text-2xl font-black">Sales and support</h2><p className="text-sm text-[#5b6b7b]">From a website request to a paying school, and the help they ask for afterwards.</p></div>
    <div role="tablist" aria-label="Sales sections" className="flex flex-wrap gap-2">{[['pipeline', 'Leads'], ['money', 'Quotes & invoices'], ['inbox', 'Support inbox'], ['proof', 'Customer words'], ['settings', 'Settings']].map(([k, l]) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`rounded-lg px-4 py-2 text-sm font-bold ${sub === k ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>{l}</button>)}</div>
    {sub === 'pipeline' && <Pipeline plans={plans} />}{sub === 'money' && <Money />}{sub === 'inbox' && <Inbox />}{sub === 'proof' && <Proof />}{sub === 'settings' && <Settings />}</div>);
}
export default SalesTab;
