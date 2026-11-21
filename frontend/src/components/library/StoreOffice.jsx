import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, EmptyState, Stat, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, Note, LBadge, AskForm, Tabs, useGet, Loading, PageBar, useDebounced, money, day, dt } from './libKit';
import { Receipt } from './StoreSell';

export function Orders() {
  const g = useGet('/store/orders'); const [pay, setPay] = useState(null);
  const cancel = async (o) => { try { await apiClient.post(`/store/orders/${o._id}/cancel`, {}); toast.success('Order cancelled and the items released.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No orders waiting" text="When a student or parent orders from the store, the items are held here until they come to pay." /></Card> : (
      <Table label="Orders waiting for payment" head={['Order', 'For', 'Items', 'Total', 'Held until', '']} min={680}>
        {g.data.rows.map((o) => <tr key={o._id}><Td className="font-mono text-xs">{o.orderNo}</Td><Td className="font-medium">{o.buyerName || '—'}</Td><Td>{o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}</Td><Td>{money(o.total)}</Td><Td>{day(o.holdUntil)}</Td>
          <Td><div className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => setPay(o)} aria-label={`Take payment for ${o.orderNo}`}>Take payment</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => cancel(o)} aria-label={`Cancel ${o.orderNo}`}>Cancel</button></div></Td></tr>)}
      </Table>
    ))}
    {pay && <AskForm title={`Payment for ${pay.orderNo}`} intro={`Total ${money(pay.total)}. You need an open till.`} confirm="Take payment" fields={[{ k: 'method', label: 'Paid by', type: 'select', options: [['cash', 'Cash'], ['bank', 'Bank transfer'], ['wallet', 'Mobile wallet']], def: 'cash' }, { k: 'tendered', label: 'Cash received (Rs)', type: 'number', min: 0, def: pay.total }, { k: 'reference', label: 'Reference' }]} onClose={() => setPay(null)} onDone={async (v) => { const r = await apiClient.post(`/store/orders/${pay._id}/pay`, v); toast.success(`Paid. Receipt ${r.data.receiptNo}.`); setPay(null); g.reload(); }} />}
    </Loading>
  );
}

export function Stock({ admin }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [low, setLow] = useState(false); const [page, setPage] = useState(1); const g = useGet('/store/skus', { q: dq || undefined, low: low ? '1' : undefined, page, limit: 25 }); const [ask, setAsk] = useState(null); const [mv, setMv] = useState(null);
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><div className="min-w-[14rem] flex-1"><Field label="Search items"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, code or group" /></Field></div><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setPage(1); }} /> Only items running low</label>{admin && <button className={btnPrimary} onClick={() => setAsk({ k: 'new' })}>Add an item</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No items" text={admin ? 'Add the shirts, notebooks and books you sell. Each size is its own item.' : 'No items match.'} /></Card> : <>
        <Table label="Store items" head={['Item', 'Code', 'Price', 'On the shelf', 'Held', 'Available', '']} min={760}>
          {g.data.rows.map((s) => <tr key={s._id}><Td className="font-medium">{s.name}<div className="text-xs text-[#5b6b7b]">{s.variant}</div></Td><Td className="font-mono text-xs">{s.sku}</Td><Td>{money(s.price)}</Td><Td>{s.onHand}</Td><Td>{s.reserved}</Td><Td>{s.available}{s.reorderLevel > 0 && s.available <= s.reorderLevel && <span className="ms-2"><LBadge s="warn" label="Running low" tone="warn" /></span>}</Td>
            <Td>{admin && <div className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk({ k: 'receive', s })} aria-label={`Receive stock of ${s.name} ${s.variant}`}>Receive stock</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk({ k: 'edit', s })} aria-label={`Edit ${s.name} ${s.variant}`}>Edit</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setMv(s)} aria-label={`History of ${s.name} ${s.variant}`}>History</button></div>}</Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {ask?.k === 'new' && <AskForm title="Add an item" confirm="Add" fields={[{ k: 'sku', label: 'Item code', required: true, hint: 'For example SH-32. Letters, numbers, dots and dashes.' }, { k: 'name', label: 'Name', required: true }, { k: 'variant', label: 'Size or colour' }, { k: 'group', label: 'Group', hint: 'Items of one kind, for example Boys shirt.' }, { k: 'category', label: 'Category', type: 'select', options: [['uniform', 'Uniform'], ['book', 'Book'], ['stationery', 'Stationery'], ['other', 'Other']], def: 'uniform' }, { k: 'price', label: 'Price (Rs)', type: 'number', min: 0, required: true }, { k: 'cost', label: 'What it costs the school (Rs)', type: 'number', min: 0 }, { k: 'reorderLevel', label: 'Warn me when it falls to', type: 'number', min: 0, def: 0 }]} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post('/store/skus', v); toast.success('Item added. Now receive its stock.'); setAsk(null); g.reload(); }} />}
      {ask?.k === 'edit' && <AskForm title={`Edit ${ask.s.name}`} confirm="Save" fields={[{ k: 'name', label: 'Name', required: true }, { k: 'variant', label: 'Size or colour' }, { k: 'price', label: 'Price (Rs)', type: 'number', min: 0 }, { k: 'cost', label: 'Cost (Rs)', type: 'number', min: 0 }, { k: 'reorderLevel', label: 'Warn me when it falls to', type: 'number', min: 0 }]} initial={ask.s} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.patch(`/store/skus/${ask.s._id}`, v); toast.success('Saved.'); setAsk(null); g.reload(); }} />}
      {ask?.k === 'receive' && <AskForm title={`Receive stock: ${ask.s.name} ${ask.s.variant}`} confirm="Add to stock" fields={[{ k: 'qty', label: 'How many arrived', type: 'number', min: 1, required: true }, { k: 'unitCost', label: 'Cost of each (Rs)', type: 'number', min: 0, def: ask.s.cost }, { k: 'supplier', label: 'Supplier' }, { k: 'ref', label: 'Delivery note or bill number' }]} onClose={() => setAsk(null)} onDone={async (v) => { const r = await apiClient.post('/store/receive', { skuRef: ask.s._id, ...v }); toast.success(`Now ${r.data.onHand} on the shelf.`); setAsk(null); g.reload(); }} />}
      {mv && <Movements sku={mv} onClose={() => setMv(null)} />}
    </div>
  );
}

function Movements({ sku, onClose }) {
  const g = useGet('/store/movements', { skuId: sku._id, limit: 50 });
  return (
    <Modal title={`History of ${sku.name} ${sku.variant || ''}`} onClose={onClose} wide>
      <p className="mb-2 text-xs text-[#5b6b7b]">Every change to stock is kept for good. A mistake is corrected by a new line, never by changing an old one.</p>
      <Loading g={g}>{g.data && <Table label="Stock movements" head={['When', 'What', 'Shelf', 'Held', 'Balance', 'By', 'Why']} min={680}>{g.data.rows.map((m) => <tr key={m._id}><Td>{dt(m.createdAt)}</Td><Td className="capitalize">{m.kind}</Td><Td>{m.qty > 0 ? `+${m.qty}` : m.qty}</Td><Td>{m.reserveChange > 0 ? `+${m.reserveChange}` : m.reserveChange}</Td><Td>{m.balanceAfter}</Td><Td>{m.byName}</Td><Td>{m.reason}{m.refNo ? ` (${m.refNo})` : ''}</Td></tr>)}</Table>}</Loading>
    </Modal>
  );
}

function SaleDetail({ id, onClose, onChanged }) {
  const g = useGet(`/store/sales/${id}`); const [pick, setPick] = useState({}); const [why, setWhy] = useState(''); const [restock, setRestock] = useState(true); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const s = g.data;
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/store/refunds', { saleId: id, lines: Object.entries(pick).filter(([, q]) => Number(q) > 0).map(([skuId, qty]) => ({ skuId, qty: Number(qty) })), reason: why, restock }); setSent(true); g.reload(); onChanged(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return (
    <Modal title={s ? `Receipt ${s.receiptNo}` : 'Receipt'} onClose={onClose} wide>
      <Loading g={g}>{s && (
        <div className="space-y-3 text-sm">
          <p className="text-[#5b6b7b]">{dt(s.paidAt)} · {s.cashierName} · paid by {s.method} <LBadge s={s.status} /></p>
          <Table label="Items sold" head={['Item', 'Qty', 'Paid', 'Refunded']} min={420}>{s.lines.map((l) => <tr key={String(l.skuId)}><Td>{l.name}</Td><Td>{l.qty}</Td><Td>{money(l.total)}</Td><Td>{l.refundedQty ? `${l.refundedQty} (${money(l.refunded)})` : '—'}</Td></tr>)}</Table>
          <p className="font-semibold">Total {money(s.total)}{s.refundedTotal ? ` · refunded ${money(s.refundedTotal)}` : ''}</p>
          {s.refunds.length > 0 && <ul className="grid gap-1">{s.refunds.map((r) => <li key={r._id}>{r.refundNo}: {money(r.amount)} <LBadge s={r.status} /> <span className="text-xs text-[#5b6b7b]">{r.reason}</span></li>)}</ul>}
          {['paid', 'partly_refunded'].includes(s.status) && !s.refunds.some((r) => r.status === 'requested') && !sent && (
            <form onSubmit={go} className="grid gap-2 rounded-xl border border-[#e3e7e7] p-3">
              <h4 className="font-semibold text-[#1b2837]">Ask for a refund</h4>
              <p className="text-xs text-[#5b6b7b]">An administrator other than you decides. Choose how many of each item come back.</p>
              {s.lines.map((l) => { const left = l.qty - (l.refundedQty || 0); return left > 0 && <label key={String(l.skuId)} className="flex items-center justify-between gap-2"><span>{l.name} (up to {left})</span><input className="w-20 rounded-lg border border-[#e3e7e7] px-2 py-1" type="number" min="0" max={left} value={pick[l.skuId] || ''} onChange={(e) => setPick({ ...pick, [l.skuId]: e.target.value })} aria-label={`How many ${l.name} to refund`} /></label>; })}
              <Field label="Why?"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} required minLength={5} /></Field>
              <label className="flex items-center gap-2"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put the items back on the shelf</label>
              {err && <p role="alert" className="text-[#9f1239]">{err}</p>}
              <div className="flex justify-end"><button className={btnPrimary} disabled={busy}>Ask for the refund</button></div>
            </form>
          )}
          {sent && <Note tone="ok">The refund was sent to the administrators for a decision.</Note>}
        </div>
      )}</Loading>
    </Modal>
  );
}

export function Sales({ admin }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [page, setPage] = useState(1); const g = useGet('/store/sales', { q: dq || undefined, page, limit: 25 }); const rf = useGet('/store/refunds', { status: 'requested' }); const [open, setOpen] = useState(null); const [ask, setAsk] = useState(null);
  const decide = async (r, approve, note) => { await apiClient.post(`/store/refunds/${r._id}/decide`, { approve, note }); toast.success(approve ? 'Refund approved.' : 'Refund turned down.'); rf.reload(); g.reload(); };
  return (
    <div className="space-y-3">
      <Loading g={rf}>{rf.data && rf.data.rows.length > 0 && (
        <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Refunds waiting for a decision</h3>
          <ul className="grid gap-2 text-sm">{rf.data.rows.map((r) => <li key={r._id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{money(r.amount)}</b> on {r.receiptNo} · asked by {r.requestedByName} · {r.reason}</span>{admin ? <span className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={async () => { try { await decide(r, true, ''); } catch (e) { toast.error(errMsg(e)); } }} aria-label={`Approve refund ${r.refundNo}`}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(r)} aria-label={`Turn down refund ${r.refundNo}`}>Turn down</button></span> : <LBadge s="requested" />}</li>)}</ul></Card>
      )}</Loading>
      <Card><Field label="Search sales"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Receipt number or buyer" /></Field></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No sales yet" text="Sales made at the till appear here with their receipts." /></Card> : <>
        <Table label="Sales" head={['Receipt', 'When', 'Buyer', 'Items', 'Total', 'Status', '']} min={760}>
          {g.data.rows.map((s) => <tr key={s._id}><Td className="font-mono text-xs">{s.receiptNo}</Td><Td>{dt(s.paidAt)}</Td><Td>{s.buyerName || '—'}</Td><Td>{s.lines.reduce((a, l) => a + l.qty, 0)}</Td><Td>{money(s.total)}</Td><Td><LBadge s={s.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(s._id)} aria-label={`Open receipt ${s.receiptNo}`}>Open</button></Td></tr>)}
        </Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {open && <SaleDetail id={open} onClose={() => setOpen(null)} onChanged={() => { rf.reload(); g.reload(); }} />}
      {ask && <Reason title="Turn down this refund" text={`${money(ask.amount)} on ${ask.receiptNo}`} confirm="Turn it down" onClose={() => setAsk(null)} onDone={async (v) => { await decide(ask, false, v); setAsk(null); }} />}
    </div>
  );
}

function CountSheet({ id, onClose, onChanged, admin }) {
  const g = useGet(`/store/counts/${id}`); const [vals, setVals] = useState({}); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null); const c = g.data;
  const entries = () => (c.lines || []).map((l) => ({ skuId: l.skuId, counted: vals[l.skuId] !== undefined ? vals[l.skuId] : l.counted }));
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(ok(r)); g.reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Modal title={c ? `${c.countNo} · ${c.title}` : 'Stock count'} onClose={onClose} wide>
      <Loading g={g}>{c && (
        <div className="space-y-3 text-sm">
          <p><LBadge s={c.status} /> {c.status === 'counting' && 'Count what is on the shelf and type it in. Nothing changes until a different person approves.'}{c.status === 'submitted' && `Counted by ${c.submittedByName}. Net difference ${money(c.netValue)}.`}</p>
          <Table label="Count sheet" head={['Item', 'Expected', 'Counted', 'Difference']} min={520}>
            {c.lines.map((l) => <tr key={String(l.skuId)}><Td>{l.name}<div className="font-mono text-[11px] text-[#5b6b7b]">{l.sku}</div></Td><Td>{l.expected}</Td>
              <Td>{c.status === 'counting' ? <input aria-label={`Counted ${l.name}`} className="w-24 rounded-lg border border-[#e3e7e7] px-2 py-1" type="number" min="0" value={vals[l.skuId] !== undefined ? vals[l.skuId] : (l.counted ?? '')} onChange={(e) => setVals({ ...vals, [l.skuId]: e.target.value })} /> : (l.counted ?? '—')}</Td>
              <Td className={l.diff ? 'font-semibold text-[#8a4636]' : ''}>{l.counted == null ? '—' : l.diff > 0 ? `+${l.diff}` : l.diff}</Td></tr>)}
          </Table>
          <div className="flex flex-wrap justify-end gap-2">
            {c.status === 'counting' && <><button className={btnGhost} disabled={busy} onClick={() => run(() => apiClient.put(`/store/counts/${id}`, { entries: entries() }), (r) => `Saved ${r.data.counted} of ${r.data.of}.`)}>Save</button><button className={btnPrimary} disabled={busy} onClick={() => run(async () => { await apiClient.put(`/store/counts/${id}`, { entries: entries() }); return apiClient.post(`/store/counts/${id}/submit`); }, (r) => `Sent for approval: ${r.data.differences} differences.`)}>Send for approval</button></>}
            {c.status === 'submitted' && admin && <><button className={btnPrimary} disabled={busy} onClick={() => setAsk('approve')}>Approve</button><button className={btnGhost} disabled={busy} onClick={() => setAsk('reject')}>Turn down</button></>}
          </div>
          {c.status === 'approved' && <Note tone="ok">Approved by {c.decidedByName}. The shelf now matches the count.</Note>}
        </div>
      )}</Loading>
      {ask === 'approve' && <AskForm title="Approve this count" intro="The shelf will change to match the count. Add a note if the difference is large." confirm="Approve" fields={[{ k: 'note', label: 'Note (kept in the record)', type: 'textarea', rows: 2 }]} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/store/counts/${id}/decide`, { approve: true, note: v.note }); setAsk(null); toast.success('Approved. The shelf now matches.'); g.reload(); onChanged(); }} />}
      {ask === 'reject' && <Reason title="Turn down this count" confirm="Turn down" label="Why (kept in the record)" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/store/counts/${id}/decide`, { approve: false, note: v }); setAsk(null); toast.success('Turned down.'); g.reload(); onChanged(); }} />}
    </Modal>
  );
}

export function Counts({ admin }) {
  const g = useGet('/store/counts'); const [open, setOpen] = useState(null);
  const start = async () => { try { const r = await apiClient.post('/store/counts', {}); toast.success('Count started.'); g.reload(); setOpen(r.data._id); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">A stock count compares the shelf with the records. The person who counts cannot approve their own count.</p><button className={btnPrimary} onClick={start}>Start a count</button></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No counts yet" text="Start a count to check that the shelf matches the records." /></Card> : (
        <Table label="Stock counts" head={['Count', 'Started', 'By', 'Difference', 'Status', '']} min={620}>{g.data.rows.map((c) => <tr key={c._id}><Td className="font-mono text-xs">{c.countNo}</Td><Td>{dt(c.createdAt)}</Td><Td>{c.startedByName}</Td><Td>{c.status === 'counting' ? '—' : money(c.netValue)}</Td><Td><LBadge s={c.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(c._id)} aria-label={`Open ${c.countNo}`}>Open</button></Td></tr>)}</Table>
      ))}</Loading>
      {open && <CountSheet id={open} admin={admin} onClose={() => setOpen(null)} onChanged={g.reload} />}
    </div>
  );
}

export function Tills() {
  const g = useGet('/store/tills'); const sh = useGet('/store/shifts'); const people = useGet('/store/people'); const [ask, setAsk] = useState(null);
  const opts = (people.data?.rows || []).map((p) => [p.id, `${p.name} (${p.role})`]);
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">A cashier can only sell on a till an administrator has given them. Teachers also need the “store till” permission from Access.</p><button className={btnPrimary} onClick={() => setAsk({ k: 'new' })}>Add a till</button></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No tills" text="Add a till and choose who may use it." /></Card> : (
        <Table label="Tills" head={['Till', 'Cashiers', 'Float', 'Now', '']} min={560}>{g.data.rows.map((t) => <tr key={t._id}><Td className="font-medium">{t.name}{!t.active && <span className="ms-2"><LBadge s="closed" label="Not in use" /></span>}</Td><Td>{(t.assigned || []).map((a) => a.name).join(', ') || '—'}</Td><Td>{money(t.floatAmount)}</Td><Td>{t.open ? <LBadge s="open" label={`Open: ${t.open.cashierName}`} /> : '—'}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk({ k: 'edit', t })} aria-label={`Edit ${t.name}`}>Edit</button></Td></tr>)}</Table>
      ))}</Loading>
      <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Recent shifts</h3>
        <Loading g={sh}>{sh.data && (sh.data.rows.length === 0 ? <p className="text-sm text-[#5b6b7b]">No shifts yet.</p> : <Table label="Shifts" head={['Till', 'Cashier', 'Opened', 'Sales', 'Expected', 'Counted', 'Difference']} min={760}>{sh.data.rows.map((s) => <tr key={s._id}><Td>{s.tillName}</Td><Td>{s.cashierName}</Td><Td>{dt(s.openedAt)}</Td><Td>{money(s.totals?.sales)}</Td><Td>{s.status === 'open' ? <LBadge s="open" /> : money(s.expectedCash)}</Td><Td>{s.status === 'open' ? '—' : money(s.countedCash)}</Td><Td className={s.flagged ? 'font-semibold text-[#8a4636]' : ''}>{s.status === 'open' ? '—' : money(s.variance)}</Td></tr>)}</Table>)}</Loading></Card>
      {ask && <TillForm ask={ask} opts={opts} onClose={() => setAsk(null)} onDone={() => { setAsk(null); g.reload(); }} />}
    </div>
  );
}
function TillForm({ ask, opts, onClose, onDone }) {
  const t = ask.t; const [ids, setIds] = useState((t?.assigned || []).map((a) => String(a.id))); const [v, setV] = useState({ name: t?.name || '', floatAmount: t?.floatAmount || 0, active: t ? t.active : true }); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); try { if (t) await apiClient.patch(`/store/tills/${t._id}`, { ...v, cashierIds: ids }); else await apiClient.post('/store/tills', { ...v, cashierIds: ids }); toast.success('Saved.'); onDone(); } catch (x) { setErr(errMsg(x)); } };
  return (
    <Modal title={t ? `Edit ${t.name}` : 'Add a till'} onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        <Field label="Name"><input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
        <Field label="Usual opening cash (Rs)"><input className={inputCls} type="number" min="0" value={v.floatAmount} onChange={(e) => setV({ ...v, floatAmount: e.target.value })} /></Field>
        <fieldset className="grid gap-1 rounded-lg border border-[#e3e7e7] p-3"><legend className="px-1 text-xs font-semibold text-[#3b4a5c]">Who may use this till</legend>{opts.map(([id, label]) => <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ids.includes(String(id))} onChange={(e) => setIds(e.target.checked ? [...ids, String(id)] : ids.filter((x) => x !== String(id)))} /> {label}</label>)}</fieldset>
        {t && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> In use</label>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary}>Save</button></div>
      </form>
    </Modal>
  );
}

export function DayReport() {
  const [d, setD] = useState(new Date().toLocaleDateString('en-CA')); const g = useGet('/store/reports/day', { from: d }); const ov = useGet('/store/overview'); const low = useGet('/store/low-stock');
  return (
    <div className="space-y-3">
      <Loading g={ov}>{ov.data && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Items" value={ov.data.items} sub={`${ov.data.units} on the shelf`} /><Stat label="Stock value" value={money(ov.data.stockValue)} sub="at cost" /><Stat label="Taken today" value={money(ov.data.takingsToday)} sub={`${ov.data.salesToday} sales`} /><Stat label="Waiting" value={ov.data.pendingOrders + ov.data.refundsWaiting + ov.data.countsWaiting} sub={`${ov.data.pendingOrders} orders, ${ov.data.refundsWaiting} refunds, ${ov.data.countsWaiting} counts`} /></div>}</Loading>
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><h3 className="font-semibold text-[#1b2837]">Takings for a day</h3><Field label="Day"><input className={inputCls} type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field></div>
        <Loading g={g}>{g.data && <div className="space-y-3 text-sm"><p>{g.data.sales} sales, <b>{money(g.data.gross)}</b> taken{g.data.refunded > 0 && `, ${money(g.data.refunded)} refunded`}. Cash {money(g.data.byMethod.cash)}, bank {money(g.data.byMethod.bank)}, wallet {money(g.data.byMethod.wallet)}, account {money(g.data.byMethod.account)}.</p>{g.data.items.length > 0 && <Table label="Items sold" head={['Item', 'Sold', 'Amount']} min={420}>{g.data.items.map((i) => <tr key={i.sku}><Td>{i.name}</Td><Td>{i.qty}</Td><Td>{money(i.amount)}</Td></tr>)}</Table>}</div>}</Loading>
      </Card>
      <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Running low</h3><Loading g={low}>{low.data && (low.data.rows.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing is running low.</p> : <ul className="grid gap-1 text-sm">{low.data.rows.map((s) => <li key={s._id}>{s.name} {s.variant}: <b>{s.available}</b> left (warn at {s.reorderLevel})</li>)}</ul>)}</Loading></Card>
    </div>
  );
}

export function StoreSettings() {
  const g = useGet('/store/settings'); const [v, setV] = useState(null); const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false); const s = v || g.data;
  return (
    <Loading g={g}>{s && (
      <Card>
        <h3 className="mb-3 font-semibold text-[#1b2837]">Store settings</h3>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setOk(false); try { await apiClient.put('/store/settings', s); setOk(true); toast.success('Saved.'); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); } }}>
          {[['holdDays', 'Days an order is held for pickup'], ['refundDays', 'Days a sale can be refunded'], ['maxCashierDiscount', 'Most a cashier can discount (%)'], ['cashTolerance', 'Till difference allowed without a note (Rs)'], ['countFlagValue', 'Stock count difference that needs a note (Rs)']].map(([k, l]) => <Field key={k} label={l}><input className={inputCls} type="number" min="0" value={s[k]} onChange={(e) => setV({ ...s, [k]: e.target.value })} /></Field>)}
          <div className="sm:col-span-2"><Field label="Line at the bottom of every receipt"><input className={inputCls} value={s.receiptFooter} maxLength={200} onChange={(e) => setV({ ...s, receiptFooter: e.target.value })} /></Field></div>
          <div className="flex items-center gap-3 sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>{ok && <span role="status" className="text-sm text-[#215a52]">Saved.</span>}</div>
        </form>
      </Card>
    )}</Loading>
  );
}
