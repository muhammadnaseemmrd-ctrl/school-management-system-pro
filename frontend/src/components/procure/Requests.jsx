import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Modal, Field, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, PBadge, Dl, Trail, useGet, Loading, PageBar, useDebounced, Note, AskForm, money, day, key } from './pcKit';

const blank = () => ({ description: '', qty: 1, unit: '', unitPrice: '' });

function RequestForm({ opts, funds, existing, onClose, onDone }) {
  const [v, setV] = useState(() => existing ? { title: existing.title, costCentre: existing.costCentre, category: existing.category, justification: existing.justification || '', neededBy: existing.neededBy || '', projectId: existing.projectId || '', fundId: existing.fundId || '', items: existing.items.map((i) => ({ description: i.description, qty: i.qty, unit: i.unit || '', unitPrice: i.unitPrice })) } : { title: '', costCentre: opts.lines[0]?.costCentre || opts.costCentres[0], category: opts.lines[0]?.category || opts.categories[0], justification: '', neededBy: '', projectId: '', fundId: '', items: [blank()] });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k, x) => setV((p) => ({ ...p, [k]: x })); const setItem = (i, k, x) => setV((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, [k]: x } : it)) }));
  const total = v.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
  const line = opts.lines.find((l) => l.costCentre === v.costCentre && l.category === v.category);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const body = { ...v, projectId: v.projectId || null, fundId: v.fundId || null, items: v.items.map((i) => ({ ...i, qty: Number(i.qty), unitPrice: Number(i.unitPrice) })) }; const r = existing ? await apiClient.patch(`/procure/requisitions/${existing._id}`, body) : await apiClient.post('/procure/requisitions', body); toast.success(existing ? 'Request saved.' : 'Request saved as a draft.'); onDone(r.data); } catch (x) { setErr(errMsg(x)); setBusy(false); }
  };
  return (
    <Modal title={existing ? `Change ${existing.reqNo}` : 'New purchase request'} onClose={onClose} wide>
      <form onSubmit={go} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="What is it for?"><input className={inputCls} value={v.title} onChange={(e) => set('title', e.target.value)} required maxLength={160} /></Field></div>
        <Field label="Cost centre"><select className={inputCls} value={v.costCentre} onChange={(e) => set('costCentre', e.target.value)}>{opts.costCentres.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Spending category"><select className={inputCls} value={v.category} onChange={(e) => set('category', e.target.value)}>{opts.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <div className="sm:col-span-2 text-xs text-[#5b6b7b]">{line ? `Budget left on this line: ${money(line.available)}.` : 'This cost centre has no approved budget for this category this year. A request cannot be submitted until it has.'}</div>
        {opts.projects.length > 0 && <Field label="Project (if it is part of one)"><select className={inputCls} value={v.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">Not part of a project</option>{opts.projects.map((p) => <option key={p._id} value={p._id}>{p.code} · {p.title}</option>)}</select></Field>}
        {funds && funds.length > 0 && <Field label="Pay from a special fund" hint="Leave empty to use the general budget only."><select className={inputCls} value={v.fundId} onChange={(e) => set('fundId', e.target.value)}><option value="">No special fund</option>{funds.filter((f) => f.status === 'active').map((f) => <option key={f._id} value={f._id}>{f.name} · {money(f.available)} left</option>)}</select></Field>}
        <Field label="Needed by"><input className={inputCls} type="date" value={v.neededBy} onChange={(e) => set('neededBy', e.target.value)} /></Field>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-semibold text-[#1b2837]">Items</legend>
          <div className="space-y-2">{v.items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-[#e3e7e7] p-2">
              <div className="col-span-12 sm:col-span-5"><label className="text-xs text-[#5b6b7b]" htmlFor={`d${i}`}>Item</label><input id={`d${i}`} className={inputCls} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} required /></div>
              <div className="col-span-4 sm:col-span-2"><label className="text-xs text-[#5b6b7b]" htmlFor={`q${i}`}>Quantity</label><input id={`q${i}`} className={inputCls} type="number" min="1" step="1" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} required /></div>
              <div className="col-span-4 sm:col-span-2"><label className="text-xs text-[#5b6b7b]" htmlFor={`u${i}`}>Unit</label><input id={`u${i}`} className={inputCls} value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="box, pack" /></div>
              <div className="col-span-4 sm:col-span-2"><label className="text-xs text-[#5b6b7b]" htmlFor={`p${i}`}>Price each (Rs)</label><input id={`p${i}`} className={inputCls} type="number" min="0" step="1" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} required /></div>
              <div className="col-span-12 flex items-end sm:col-span-1">{v.items.length > 1 && <button type="button" className={`${btnGhost} !px-2 !py-1.5 !text-xs`} aria-label={`Remove item ${i + 1}`} onClick={() => set('items', v.items.filter((_, j) => j !== i))}>Remove</button>}</div>
            </div>))}</div>
          <div className="mt-2 flex items-center justify-between"><button type="button" className={`${btnGhost} !text-xs`} onClick={() => set('items', [...v.items, blank()])}>Add an item</button><span className="text-sm font-semibold">Total {money(total)}</span></div>
        </fieldset>
        <div className="sm:col-span-2"><Field label="Why is it needed?"><textarea className={inputCls} rows={2} value={v.justification} onChange={(e) => set('justification', e.target.value)} maxLength={600} /></Field></div>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save request'}</button></div>
      </form>
    </Modal>
  );
}

function Detail({ id, admin, officer, mine, onClose, onChange }) {
  const g = useGet(`/procure/requisitions/${id}`); const vend = useGet(officer ? '/procure/vendors' : '/procure/access', officer ? { limit: 100, status: 'active' } : undefined); const [ask, setAsk] = useState(null); const [form, setForm] = useState(null);
  const r = g.data?.requisition; const rule = g.data?.rule; const act = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); g.reload(); onChange(); } catch (e) { toast.error(errMsg(e)); } };
  const opts = useGet('/procure/options');
  const vendors = officer ? (vend.data?.rows || []) : [];
  return (
    <Modal title={r ? `${r.reqNo} · ${r.title}` : 'Request'} onClose={onClose} wide>
      <Loading g={g}>{r && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><PBadge k="req" s={r.status} />{r.status === 'submitted' && <span className="text-xs text-[#5b6b7b]">{r.approvals.length ? `One approval given, ${r.levels - r.approvals.length} more needed.` : r.levels > 1 ? `Needs ${r.levels} different approvers.` : 'Needs one approver.'}</span>}</div>
          <Dl items={[['Asked by', r.requesterName], ['Cost centre', r.costCentre], ['Category', r.category], ['Total', money(r.total)], ['Needed by', day(r.neededBy)], ['Budget left on the line', g.data.line ? money(g.data.line.available) : 'No budget line'], ['Why', r.justification]]} />
          <Table label="Items" head={['Item', 'Quantity', 'Price each', 'Amount']} min={420}>{r.items.map((i, n) => <tr key={n}><Td className="font-medium">{i.description}</Td><Td>{i.qty} {i.unit}</Td><Td>{money(i.unitPrice)}</Td><Td>{money(i.amount)}</Td></tr>)}</Table>
          {(r.quotes.length > 0 || (officer && ['draft', 'submitted', 'approved'].includes(r.status))) && (
            <section><h4 className="mb-1 text-sm font-semibold text-[#1b2837]">Quotes {rule && rule.need > 0 && <span className="font-normal text-[#5b6b7b]">· {rule.have} of {rule.need} needed</span>}</h4>
              {r.quotes.length > 0 && <Table label="Quotes" head={['Supplier', 'Quoted', 'Valid to', '']} min={460}>{r.quotes.map((q) => <tr key={q.key}><Td className="font-medium">{q.vendorName}{r.chosenQuote === q.key && <span className="ms-2 text-xs text-[#215a52]">Chosen</span>}</Td><Td>{money(q.amount)}</Td><Td>{day(q.validTo)}</Td><Td>{officer && ['draft'].includes(r.status) && <div className="flex gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Choose the quote from ${q.vendorName}`} onClick={() => { const lowest = Math.min(...r.quotes.map((x) => x.amount)); if (q.amount > lowest) setAsk({ kind: 'choose', q }); else act(() => apiClient.post(`/procure/requisitions/${id}/choose-quote`, { quoteKey: q.key }), 'Quote chosen.'); }}>Choose</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Remove the quote from ${q.vendorName}`} onClick={() => act(() => apiClient.delete(`/procure/requisitions/${id}/quotes/${q.key}`), 'Quote removed.')}>Remove</button></div>}</Td></tr>)}</Table>}
              {officer && r.status === 'draft' && <button className={`${btnGhost} mt-2 !text-xs`} onClick={() => setForm('quote')}>Add a quote</button>}
            </section>)}
          {r.soleSourceReason && <Note>Fewer quotes than the rule asks for: {r.soleSourceReason}</Note>}
          {g.data.order && <Note tone="ok">Ordered as {g.data.order.poNo} from {g.data.order.vendorName}.</Note>}
          <div className="flex flex-wrap gap-2">
            {['draft'].includes(r.status) && (mine || officer) && <><button className={btnGhost} onClick={() => setForm('edit')}>Change it</button><button className={btnPrimary} onClick={() => (rule && rule.need > 0 && r.quotes.length < rule.need ? setAsk({ kind: 'submit-few' }) : act(() => apiClient.post(`/procure/requisitions/${id}/submit`, {}), 'Sent for approval.'))}>Send for approval</button></>}
            {['draft', 'submitted', 'approved'].includes(r.status) && (mine || officer) && <button className={btnDanger} onClick={() => setAsk({ kind: 'cancel' })}>Cancel the request</button>}
            {admin && r.status === 'submitted' && <><button className={btnPrimary} onClick={() => act(() => apiClient.post(`/procure/requisitions/${id}/decide`, { approve: true }), 'Approved.')}>Approve</button><button className={btnDanger} onClick={() => setAsk({ kind: 'reject' })}>Turn it down</button></>}
            {officer && r.status === 'approved' && <button className={btnPrimary} onClick={() => setForm('order')}>Order it</button>}
          </div>
          <details><summary className="cursor-pointer text-sm font-semibold text-[#2a5cac]">History</summary><div className="mt-2"><Trail rows={r.trail} /></div></details>
        </div>
      )}</Loading>
      {ask?.kind === 'cancel' && <Reason title="Cancel this request" text="Any money set aside for it goes back to the budget." confirm="Cancel the request" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/requisitions/${id}/cancel`, { reason: v }); setAsk(null); toast.success('Cancelled.'); g.reload(); onChange(); }} />}
      {ask?.kind === 'reject' && <Reason title="Turn this request down" text="The person who asked will see your reason." confirm="Turn it down" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/requisitions/${id}/decide`, { approve: false, note: v }); setAsk(null); toast.success('Turned down.'); g.reload(); onChange(); }} />}
      {ask?.kind === 'choose' && <Reason title="Why not the lowest quote?" text={`You are choosing ${ask.q.vendorName} at ${money(ask.q.amount)}, which is not the cheapest.`} confirm="Choose this quote" danger={false} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/requisitions/${id}/choose-quote`, { quoteKey: ask.q.key, reason: v }); setAsk(null); toast.success('Quote chosen.'); g.reload(); }} />}
      {ask?.kind === 'submit-few' && <Reason title="Fewer quotes than the rule asks for" text={`The school asks for ${rule.need} quotes for a request this size. Say why fewer will do.`} confirm="Send for approval" danger={false} min={10} label="Why fewer quotes (kept in the record)" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/procure/requisitions/${id}/submit`, { soleSourceReason: v }); setAsk(null); toast.success('Sent for approval.'); g.reload(); onChange(); }} />}
      {form === 'quote' && <AskForm title="Add a quote" confirm="Add the quote" fields={[{ k: 'vendorId', label: 'Supplier', type: 'select', required: true, full: true, options: [['', 'Choose a supplier'], ...vendors.map((v) => [v._id, v.name])] }, { k: 'amount', label: 'Quoted total (Rs)', type: 'number', min: 1, required: true }, { k: 'validTo', label: 'Valid until', type: 'date' }, { k: 'note', label: 'Note', type: 'textarea' }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post(`/procure/requisitions/${id}/quotes`, { ...v, amount: Number(v.amount) }); setForm(null); toast.success('Quote added.'); g.reload(); }} />}
      {form === 'order' && <AskForm title={`Order ${r.reqNo}`} intro={`The order is for ${money(r.total)}${r.chosenVendorName ? '' : ''}. It goes to the supplier you choose.`} confirm="Issue the order" initial={{ vendorId: r.chosenVendorId || '' }} fields={[{ k: 'vendorId', label: 'Supplier', type: 'select', required: true, full: true, options: [['', 'Choose a supplier'], ...vendors.map((v) => [v._id, v.name])] }, { k: 'expectedOn', label: 'Expected on', type: 'date' }, { k: 'terms', label: 'Terms', type: 'textarea' }]} onClose={() => setForm(null)} onDone={async (v) => { const x = await apiClient.post(`/procure/requisitions/${id}/order`, v); setForm(null); toast.success(`Order ${x.data.poNo} issued.`); g.reload(); onChange(); }} />}
      {form === 'edit' && opts.data && <RequestForm opts={opts.data} existing={r} onClose={() => setForm(null)} onDone={() => { setForm(null); g.reload(); onChange(); }} />}
    </Modal>
  );
}

export default function Requests({ admin, officer, mine }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null); const [form, setForm] = useState(false);
  const g = useGet('/procure/requisitions', { q: dq || undefined, status: status || undefined, page, limit: 25 }); const opts = useGet('/procure/options'); const funds = useGet(admin ? '/procure/funds' : '/procure/options');
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1"><Field label="Search requests"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Number, title or person" /></Field></div>
        <Field label="Show"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Every request</option><option value="draft">Drafts</option><option value="submitted">Waiting for approval</option><option value="approved">Approved, not ordered</option><option value="ordered">Ordered</option><option value="rejected">Turned down</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></Field>
        <button className={btnPrimary} onClick={() => setForm(true)} disabled={!opts.data}>New request</button>
      </div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No requests here" text={mine ? 'When you need something bought, start a new request. It goes to the administrators for approval.' : 'Requests from staff appear here.'} /></Card> : <>
        <Table label="Purchase requests" head={['Request', 'What', 'Asked by', 'Total', 'Status', '']} min={720}>
          {g.data.rows.map((r) => <tr key={r._id}><Td className="font-mono text-xs">{r.reqNo}</Td><Td className="font-medium">{r.title}<div className="text-xs text-[#5b6b7b]">{r.costCentre} · {r.category}</div></Td><Td>{r.requesterName}</Td><Td>{money(r.total)}</Td><Td><PBadge k="req" s={r.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(r._id)} aria-label={`Open ${r.reqNo}`}>Open</button></Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {form && opts.data && <RequestForm opts={opts.data} funds={admin ? funds.data?.rows : null} onClose={() => setForm(false)} onDone={(r) => { setForm(false); g.reload(); setOpen(r._id); }} />}
      {open && <Detail id={open} admin={admin} officer={officer} mine={mine} onClose={() => setOpen(null)} onChange={g.reload} />}
    </div>
  );
}
