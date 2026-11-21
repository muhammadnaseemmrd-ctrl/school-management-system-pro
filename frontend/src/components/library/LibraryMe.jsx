import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { Table, Td, Note, LBadge, Tabs, useGet, Loading, useDebounced, money, day } from './libKit';

function Search({ canAct, onChanged }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const g = useGet('/library/me/titles', { q: dq || undefined });
  const reserve = async (t) => { try { const r = await apiClient.post('/library/me/reserve', { titleId: t._id }); toast.success(`You are number ${r.data.position} in the queue.`); onChanged(); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><Field label="Search the library" hint="By title, author, subject or ISBN."><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} /></Field></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No books found" text="Try another word." /></Card> : (
        <Table label="Books" head={['Book', 'Shelf', 'On the shelf', '']} min={520}>
          {g.data.rows.map((t) => <tr key={t._id}><Td><span className="font-medium">{t.title}</span><div className="text-xs text-[#5b6b7b]">{(t.authors || []).join(', ')}</div></Td><Td>{t.shelf || '—'}</Td><Td>{t.lendable ? (t.available > 0 ? <LBadge s="available" label={`${t.available} of ${t.copies}`} /> : <LBadge s="on_loan" label="All out" />) : <LBadge s="none" label="Stays in the library" tone="none" />}</Td>
            <Td>{canAct && t.lendable && t.kind !== 'textbook' && t.available === 0 && t.copies > 0 && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => reserve(t)} aria-label={`Reserve ${t.title}`}>Reserve</button>}</Td></tr>)}
        </Table>
      ))}</Loading>
    </div>
  );
}

function Mine({ g, childId }) {
  const v = g.data; const act = async (fn, ok) => { try { await fn(); toast.success(ok); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const q = childId ? `?childId=${childId}` : '';
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-bold text-[#1b2837]">{v.card.name}</h3><p className="text-sm text-[#5b6b7b]">Library card <span className="font-mono">{v.card.barcode}</span> · {v.loans.filter((l) => l.kind === 'loan').length} of {v.limit} books out</p></div>{v.owed > 0 && <LBadge s="bad" label={`Owes ${money(v.owed)}`} tone="bad" />}</div>
        {v.card.status !== 'active' && <div className="mt-2"><Note tone="warn">This card is {v.card.status}. Please see the library.</Note></div>}
      </Card>
      <Card>
        <h4 className="mb-2 font-semibold text-[#1b2837]">Books out</h4>
        {v.loans.length === 0 ? <EmptyState title="No books out" text="Borrow a book at the library desk." /> : (
          <Table label="Books out" head={['Book', 'Due', 'Type', '']} min={520}>
            {v.loans.map((l) => <tr key={l._id}><Td className="font-medium">{l.titleName}</Td><Td>{day(l.dueOn)} {l.overdue && <LBadge s="overdue" label={`${l.daysLate} day${l.daysLate === 1 ? '' : 's'} late`} />}</Td><Td><LBadge s={l.kind} /></Td>
              <Td>{v.canAct && l.kind === 'loan' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/library/me/loans/${l._id}/renew`), 'Renewed.')} aria-label={`Renew ${l.titleName}`}>Renew</button>}</Td></tr>)}
          </Table>
        )}
        <p className="mt-2 text-xs text-[#5b6b7b]">A late book costs Rs {v.policy.finePerDay} for each day after {v.policy.graceDays} day{v.policy.graceDays === 1 ? '' : 's'} of grace. A book can be renewed {v.policy.maxRenewals} time{v.policy.maxRenewals === 1 ? '' : 's'}.</p>
      </Card>
      {v.reservations.length > 0 && <Card><h4 className="mb-2 font-semibold text-[#1b2837]">Reserved</h4><ul className="grid gap-2 text-sm">{v.reservations.map((r) => <li key={r._id} className="flex flex-wrap items-center justify-between gap-2"><span>{r.titleName} <LBadge s={r.status} />{r.status === 'waiting' ? <span className="ms-1 text-xs text-[#5b6b7b]">place {r.position}</span> : <span className="ms-1 text-xs text-[#5b6b7b]">collect by {day(r.holdUntil)}</span>}</span>{v.canAct && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/library/me/reservations/${r._id}/cancel`, {}), 'Cancelled.')} aria-label={`Cancel reservation for ${r.titleName}`}>Cancel</button>}</li>)}</ul></Card>}
      {v.fines.length > 0 && <Card><h4 className="mb-2 font-semibold text-[#1b2837]">Charges to pay at the library</h4><ul className="grid gap-1 text-sm">{v.fines.map((f) => <li key={f._id}><b>{money(f.amount)}</b> · {f.basis} <span className="text-xs text-[#5b6b7b]">{f.titleName}</span></li>)}</ul></Card>}
      <span className="hidden">{q}</span>
    </div>
  );
}

function StoreOrders({ childId, role }) {
  const items = useGet('/store/me/items', childId ? { childId } : {}); const orders = useGet('/store/me/orders', childId ? { childId } : {}); const [cart, setCart] = useState({}); const [busy, setBusy] = useState(false);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([skuId, qty]) => ({ skuId, qty }));
  const total = lines.reduce((s, l) => s + (items.data?.rows.find((i) => i._id === l.skuId)?.price || 0) * l.qty, 0);
  const place = async () => { setBusy(true); try { const r = await apiClient.post('/store/me/orders', { lines, ...(childId ? { childId } : {}) }); toast.success(`Order ${r.data.orderNo} placed. Pay at the store to collect it.`); setCart({}); items.reload(); orders.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const cancel = async (o) => { try { await apiClient.post(`/store/me/orders/${o._id}/cancel`, childId ? { childId } : {}); toast.success('Order cancelled.'); items.reload(); orders.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-3">
      <Card><h3 className="mb-1 font-semibold text-[#1b2837]">School store</h3><p className="mb-3 text-sm text-[#5b6b7b]">Choose what you need. The store holds it for a few days; you pay when you collect it.</p>
        <Loading g={items}>{items.data && (items.data.rows.length === 0 ? <EmptyState title="Nothing available" text="The store has nothing in stock right now." /> : (
          <>
            <Table label="Store items" head={['Item', 'Price', 'How many']} min={460}>{items.data.rows.map((i) => <tr key={i._id}><Td className="font-medium">{i.name}<div className="text-xs text-[#5b6b7b]">{i.variant}</div></Td><Td>{money(i.price)}</Td><Td><input aria-label={`How many ${i.name} ${i.variant}`} className="w-20 rounded-lg border border-[#e3e7e7] px-2 py-1 text-sm" type="number" min="0" max={i.available} value={cart[i._id] || ''} onChange={(e) => setCart({ ...cart, [i._id]: Math.min(i.available, Math.max(0, parseInt(e.target.value, 10) || 0)) })} /></Td></tr>)}</Table>
            <div className="mt-3 flex items-center justify-between gap-2"><span className="text-sm">{lines.length ? `${lines.reduce((s, l) => s + l.qty, 0)} items, ${money(total)}` : 'Nothing chosen yet'}</span><button className={btnPrimary} disabled={!lines.length || busy} onClick={place}>{busy ? 'Placing…' : 'Place the order'}</button></div>
          </>
        ))}</Loading></Card>
      <Loading g={orders}>{orders.data && orders.data.rows.length > 0 && (
        <Card><h4 className="mb-2 font-semibold text-[#1b2837]">Orders</h4>
          <ul className="grid gap-2 text-sm">{orders.data.rows.map((o) => <li key={o._id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{o.orderNo || o.receiptNo}</b> · {o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')} · {money(o.total)} {o.status === 'reserved' ? <LBadge s="reserved_order" /> : <LBadge s={o.status} />}{o.status === 'reserved' && <span className="ms-1 text-xs text-[#5b6b7b]">pay by {day(o.holdUntil)}</span>}</span>{o.status === 'reserved' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => cancel(o)} aria-label={`Cancel order ${o.orderNo}`}>Cancel</button>}</li>)}</ul></Card>
      )}</Loading>
    </div>
  );
}

// Used by students, parents (for one child) and teachers (as a borrower).
export default function LibraryMe({ role = 'student', childId = '' }) {
  const [tab, setTab] = useState('mine'); const g = useGet('/library/me', childId ? { childId } : {}); const shop = role === 'student' || role === 'parent';
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Library</h2><p className="text-sm text-[#5b6b7b]">{role === 'parent' ? 'What your child has borrowed, what is due, and the school store.' : 'Your books, due dates, reservations and charges.'}</p></div>
      <Tabs label="Library sections" value={tab} onChange={setTab} items={[['mine', 'My books'], ...(role !== 'parent' ? [['search', 'Find a book']] : []), ...(shop ? [['store', 'School store']] : [])]} />
      {tab === 'mine' && <Loading g={g}>{g.data && <Mine g={g} childId={childId} />}</Loading>}
      {tab === 'search' && <Search canAct onChanged={g.reload} />}
      {tab === 'store' && <StoreOrders childId={childId} role={role} />}
    </div>
  );
}
