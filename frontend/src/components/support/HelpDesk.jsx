import React, { useRef, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, inputCls, pkr, fmtDate } from '../ui';
import { call, useGet, Loading, Note, Tabs } from '../early/earlyKit';

const CATS = [['how-to', 'How do I…?'], ['billing', 'Billing or plan'], ['technical', 'Something is not working'], ['data', 'My data'], ['security', 'Security'], ['feature', 'Feature request'], ['other', 'Something else']];
const PRIOS = [['low', 'Low: whenever you can'], ['normal', 'Normal'], ['high', 'High: it is slowing us down'], ['urgent', 'Urgent: we cannot work']];
const STATUS = { Open: 'Open', WaitingOnSchool: 'Waiting for you', Resolved: 'Resolved', Closed: 'Closed' };
const TONE = { Open: 'bg-[#fbf0ec] text-[#8a4636]', WaitingOnSchool: 'bg-[#eef2f8] text-[#234c91]', Resolved: 'bg-[#edf5f3] text-[#215a52]', Closed: 'bg-[#f1f2f2] text-[#5b6b7b]', Issued: 'bg-[#fbf0ec] text-[#8a4636]', Paid: 'bg-[#edf5f3] text-[#215a52]', overdue: 'bg-[#fff1f2] text-[#9f1239]' };
const Badge = ({ k, children }) => <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[k] || TONE.Closed}`}>{children}</span>;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const newKey = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function NewCase({ onClose, onDone }) {
  const key = useRef(newKey()); const [f, setF] = useState({ subject: '', message: '', category: 'how-to', priority: 'normal' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const r = await apiClient.post('/support/cases', { ...f, clientKey: key.current }); onDone(r.data.case); } catch (x) { setErr(x.response?.data?.message || 'Could not send'); } finally { setBusy(false); } };
  return (<Modal title="Ask Aulensia for help" onClose={onClose} wide><form onSubmit={submit} className="grid gap-3">
    <Field label="Short title"><input className={inputCls} value={f.subject} onChange={set('subject')} maxLength={160} required autoFocus /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="What is it about?"><select className={inputCls} value={f.category} onChange={set('category')}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field><Field label="How urgent?"><select className={inputCls} value={f.priority} onChange={set('priority')}>{PRIOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
    <Field label="Tell us what happened" hint="Say what you did, what you expected and what you saw. Please do not type passwords."><textarea rows={5} className={inputCls} value={f.message} onChange={set('message')} maxLength={4000} required /></Field>
    {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button></div></form></Modal>);
}

function CaseView({ id, onClose, onChanged }) {
  const g = useGet(`/support/cases/${id}`); const [text, setText] = useState(''); const [rating, setRating] = useState(0); const c = g.data?.case;
  const after = async () => { setText(''); await g.reload(); onChanged(); };
  return (<Modal title={c ? `${c.number} · ${c.subject}` : 'Case'} onClose={onClose} wide><Loading g={g}>{c && (<>
    <div className="flex flex-wrap items-center gap-2 text-xs"><Badge k={c.status}>{STATUS[c.status]}</Badge><span>We aim to reply by {when(c.firstResponseDueAt)} (working hours, Monday to Friday)</span></div>
    <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto" aria-label="Messages">{c.messages.map((m, i) => (<li key={i} className={`rounded-lg p-3 text-sm ${m.from === 'owner' ? 'bg-[#eef2f8]' : 'bg-[#f7f6f2]'}`}><p className="text-xs font-semibold text-[#5b6b7b]">{m.from === 'owner' ? `Aulensia${m.byName ? ` · ${m.byName}` : ''}` : m.byName || 'You'} · {when(m.at)}</p><p className="mt-1 whitespace-pre-line">{m.text}</p></li>))}</ul>
    {c.status !== 'Closed' && (<div className="mt-3"><textarea rows={3} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder={c.status === 'Resolved' ? 'Still not right? Write here to reopen it' : 'Write a reply'} aria-label="Reply" maxLength={4000} /><div className="mt-2 flex flex-wrap justify-end gap-2">{['Open', 'WaitingOnSchool'].includes(c.status) && <button className={btnGhost} onClick={() => call(() => apiClient.post(`/support/cases/${id}/resolve`), 'Marked as resolved', after)}>It is solved</button>}<button className={btnPrimary} disabled={text.trim().length < 2} onClick={() => call(() => apiClient.post(`/support/cases/${id}/reply`, { message: text }), 'Sent', after)}>Send</button></div></div>)}
    {['Resolved', 'Closed'].includes(c.status) && (<div className="mt-4 border-t border-[#e3e7e7] pt-3 text-sm">{c.rating ? <p>You rated this {c.rating} out of 5. Thank you.</p> : (<><p className="font-semibold">How was our help?</p><div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className={`h-9 w-9 rounded-lg border text-sm font-bold ${rating === n ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white'}`}>{n}</button>)}<button className={`${btnPrimary} ms-2`} disabled={!rating} onClick={() => call(() => apiClient.post(`/support/cases/${id}/rate`, { rating }), 'Thank you', after)}>Send rating</button></div></>)}</div>)}</>)}</Loading></Modal>);
}

function Invoices() {
  const g = useGet('/support/invoices'); const inv = g.data?.invoices || []; const p = g.data?.payment;
  return (<Loading g={g}>{inv.length === 0 ? <EmptyState title="No invoices from Aulensia yet." text="When you accept a quote, your invoice appears here with how to pay." /> : (<div className="space-y-4">
    {p && <Note>To pay, transfer the amount and use the invoice number as the reference. {[p.bankName && `Bank: ${p.bankName}`, p.accountTitle && `Title: ${p.accountTitle}`, p.accountNumber && `Account: ${p.accountNumber}`, p.iban && `IBAN: ${p.iban}`, p.jazzcash && `JazzCash: ${p.jazzcash}`, p.easypaisa && `Easypaisa: ${p.easypaisa}`].filter(Boolean).join(' · ') || 'We will send you the payment details.'} {p.note}</Note>}
    <Card className="overflow-x-auto !p-0"><table className="w-full min-w-[560px] text-sm"><thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{['Invoice', 'Plan', 'Total', 'Due', 'Status'].map((h) => <th key={h} scope="col" className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead><tbody>{inv.map((i) => (<tr key={i._id} className="border-b border-[#e3e7e7]"><td className="px-4 py-3 font-mono text-xs">{i.number}</td><td className="px-4 py-3">{i.planLabel} · {i.billingPeriod}</td><td className="px-4 py-3">{pkr(i.totalPKR)}</td><td className="px-4 py-3 text-xs">{fmtDate(i.dueAt)}</td><td className="px-4 py-3"><Badge k={i.overdue ? 'overdue' : i.status}>{i.overdue ? 'Overdue' : i.status === 'Paid' ? `Paid ${fmtDate(i.paidAt)}` : 'Waiting for payment'}</Badge></td></tr>))}</tbody></table></Card></div>)}</Loading>);
}

export default function HelpDesk() {
  const [tab, setTab] = useState('cases'); const [filter, setFilter] = useState(''); const g = useGet('/support/cases', { status: filter || undefined }); const [open, setOpen] = useState(null); const [adding, setAdding] = useState(false);
  const cases = g.data?.cases || [];
  return (<div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Help from Aulensia</h2><p className="text-sm text-[#5b6b7b]">Ask a question, report a problem and see your invoices. Replies come from a person, in working hours (Monday to Friday, 9am to 6pm Pakistan time).</p></div>{tab === 'cases' && <button className={btnPrimary} onClick={() => setAdding(true)}>Ask for help</button>}</div>
    <Tabs label="Help sections" value={tab} onChange={setTab} items={[['cases', 'Your questions'], ['invoices', 'Invoices']]} />
    {tab === 'invoices' ? <Invoices /> : (<>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show" className={`${inputCls} max-w-xs`}><option value="">All</option><option value="Open">Open</option><option value="WaitingOnSchool">Waiting for you</option><option value="Resolved">Resolved</option></select>
      <Loading g={g}>{cases.length === 0 ? <EmptyState title="Nothing here yet." text="When you ask Aulensia for help it will show up here, with the replies." action={<button className={btnPrimary} onClick={() => setAdding(true)}>Ask for help</button>} /> : (<div className="space-y-2">{cases.map((c) => (<button key={c._id} onClick={() => setOpen(c._id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e3e7e7] bg-white p-4 text-start hover:bg-[#f7f6f2]"><span><span className="block font-semibold">{c.subject}</span><span className="text-xs text-[#5b6b7b]">{c.number} · {c.messageCount} message{c.messageCount === 1 ? '' : 's'} · last {when(c.lastMessageAt)}{c.lastFrom === 'owner' ? ' · from Aulensia' : ''}</span></span><Badge k={c.status}>{STATUS[c.status]}</Badge></button>))}</div>)}</Loading></>)}
    {adding && <NewCase onClose={() => setAdding(false)} onDone={(c) => { setAdding(false); g.reload(); setOpen(c._id); }} />}{open && <CaseView id={open} onClose={() => setOpen(null)} onChanged={g.reload} />}</div>);
}
