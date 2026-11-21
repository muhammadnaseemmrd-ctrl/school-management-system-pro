import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Note, LBadge, useGet, Loading, useDebounced, money, dt, key, printHtml, esc } from './libKit';

export const receiptHtml = (s, school = '') => `<h1>${esc(school || 'School store')}</h1><div>Receipt ${esc(s.receiptNo)}<br>${esc(dt(s.paidAt))} · ${esc(s.cashierName)}</div>${s.buyerName ? `<div>For ${esc(s.buyerName)}</div>` : ''}<hr><table>${s.lines.map((l) => `<tr><td>${l.qty} × ${esc(l.name)}</td><td class="r">${(l.total).toLocaleString()}</td></tr>`).join('')}</table><hr><table><tr><td>Subtotal</td><td class="r">${s.subtotal.toLocaleString()}</td></tr>${s.discount ? `<tr><td>Discount</td><td class="r">-${s.discount.toLocaleString()}</td></tr>` : ''}<tr><th>Total</th><th class="r">Rs ${s.total.toLocaleString()}</th></tr><tr><td>Paid by ${esc(s.method)}</td><td class="r">${s.tendered ? s.tendered.toLocaleString() : ''}</td></tr>${s.change ? `<tr><td>Change</td><td class="r">${s.change.toLocaleString()}</td></tr>` : ''}</table><hr><div>${esc(s.footer || 'Thank you.')}</div>`;

export function Receipt({ sale, onClose }) {
  return (
    <Modal title={`Receipt ${sale.receiptNo}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="text-[#5b6b7b]">{dt(sale.paidAt)} · {sale.cashierName}{sale.buyerName ? ` · for ${sale.buyerName}` : ''}</p>
        <ul className="divide-y divide-[#f0f1f1]">{sale.lines.map((l, i) => <li key={i} className="flex justify-between gap-2 py-1"><span>{l.qty} × {l.name}</span><span>{money(l.total)}</span></li>)}</ul>
        {sale.discount > 0 && <p className="flex justify-between"><span>Discount ({sale.discountReason})</span><span>-{money(sale.discount)}</span></p>}
        <p className="flex justify-between text-base font-bold"><span>Total</span><span>{money(sale.total)}</span></p>
        <p className="flex justify-between text-[#5b6b7b]"><span>Paid by {sale.method}</span><span>{sale.method === 'cash' ? `${money(sale.tendered)}, change ${money(sale.change)}` : sale.reference}</span></p>
        <div className="flex justify-end gap-2 pt-2"><button className={btnGhost} onClick={() => printHtml(receiptHtml(sale))}>Print</button><button className={btnPrimary} onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}

function OpenShift({ tills, onOpened }) {
  const [tillId, setTillId] = useState(tills[0]?._id || ''); const [cash, setCash] = useState(tills[0]?.floatAmount || 0); const [busy, setBusy] = useState(false);
  if (!tills.length) return <Card><EmptyState title="No till for you" text="An administrator needs to create a till and assign you to it before you can sell." /></Card>;
  const go = async (e) => { e.preventDefault(); setBusy(true); try { await apiClient.post('/store/shifts/open', { tillId, openingCash: Number(cash) }); toast.success('Till open.'); onOpened(); } catch (x) { toast.error(errMsg(x)); setBusy(false); } };
  return (
    <Card>
      <h3 className="mb-2 font-semibold text-[#1b2837]">Open your till</h3>
      <form onSubmit={go} className="flex flex-wrap items-end gap-3"><Field label="Till"><select className={inputCls} value={tillId} onChange={(e) => setTillId(e.target.value)}>{tills.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field><Field label="Cash in the drawer now (Rs)"><input className={inputCls} type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} required /></Field><button className={btnPrimary} disabled={busy}>Open till</button></form>
    </Card>
  );
}

function CloseShift({ shift, onClose, onClosed }) {
  const [cash, setCash] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [needNote, setNeedNote] = useState(null); const [done, setDone] = useState(null);
  const go = async (e) => { e.preventDefault(); setErr(''); try { const r = await apiClient.post(`/store/shifts/${shift._id}/close`, { countedCash: Number(cash), note }); setDone(r.data); } catch (x) { if (x.response?.data?.reason === 'variance') setNeedNote(x.response.data); setErr(errMsg(x)); } };
  if (done) return <Modal title="Till closed" onClose={() => { onClosed(); }}><div className="space-y-2 text-sm"><p>Expected {money(done.expected)}, counted {money(done.counted)}.</p><p className={done.variance ? 'font-semibold text-[#8a4636]' : 'font-semibold text-[#215a52]'}>{done.variance === 0 ? 'The drawer is exactly right.' : `The drawer is ${money(Math.abs(done.variance))} ${done.variance < 0 ? 'short' : 'over'}.`}</p><div className="flex justify-end"><button className={btnPrimary} onClick={onClosed}>Done</button></div></div></Modal>;
  return (
    <Modal title="Close your till" onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        <p className="text-sm text-[#5b6b7b]">Count the cash in the drawer and type it in. The expected amount is shown after you press Close.</p>
        <Field label="Cash counted (Rs)"><input className={inputCls} type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} required autoFocus /></Field>
        {needNote && <Note tone="warn">The drawer is {money(Math.abs(needNote.variance))} {needNote.variance < 0 ? 'short' : 'over'} (expected {money(needNote.expected)}). Write a note to close it.</Note>}
        {(needNote || note) && <Field label="Note"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} required={!!needNote} /></Field>}
        {err && !needNote && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary}>Close till</button></div>
      </form>
    </Modal>
  );
}

export default function StoreSell({ admin }) {
  const sh = useGet('/store/shift'); const [q, setQ] = useState(''); const dq = useDebounced(q, 250); const items = useGet('/store/skus', { q: dq || undefined, limit: 40 });
  const [cart, setCart] = useState([]); const [disc, setDisc] = useState(''); const [why, setWhy] = useState(''); const [method, setMethod] = useState('cash'); const [tender, setTender] = useState(''); const [ref, setRef] = useState(''); const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null); const [closing, setClosing] = useState(false); const attempt = useRef(key()); const scan = useRef(null);
  useEffect(() => { scan.current?.focus(); }, [sh.data?.shift?._id]);
  const add = (s) => { if (s.available < 1) { toast.error(`${s.name} is out of stock.`); return; } setCart((c) => { const i = c.findIndex((x) => x.sku._id === s._id); if (i >= 0) { const n = [...c]; if (n[i].qty >= s.available) { toast.error(`Only ${s.available} left.`); return c; } n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; } return [...c, { sku: s, qty: 1 }]; }); };
  const scanGo = (e) => { e.preventDefault(); const v = q.trim().toUpperCase(); const hit = (items.data?.rows || []).find((s) => s.barcode === v || s.sku === v); if (hit) { add(hit); setQ(''); } };
  const setQty = (id, qty) => setCart((c) => c.map((x) => (x.sku._id === id ? { ...x, qty: Math.max(1, Math.min(x.sku.available, qty || 1)) } : x)));
  const sub = cart.reduce((s, x) => s + x.sku.price * x.qty, 0); const pct = Number(disc) || 0; const discount = Math.round(sub * pct / 100); const total = sub - discount; const change = method === 'cash' ? Math.max(0, (Number(tender) || 0) - total) : 0;
  const sell = async () => {
    setBusy(true);
    try { const r = await apiClient.post('/store/sales', { clientKey: attempt.current, lines: cart.map((x) => ({ skuId: x.sku._id, qty: x.qty })), discountPercent: pct, discountReason: why, method, tendered: Number(tender) || 0, reference: ref }); setReceipt(r.data); setCart([]); setDisc(''); setWhy(''); setTender(''); setRef(''); attempt.current = key(); items.reload(); sh.reload(); }
    catch (e) { toast.error(errMsg(e, 'Could not complete the sale. Check and try again.')); items.reload(); } finally { setBusy(false); }
  };
  return (
    <Loading g={sh}>{sh.data && (!sh.data.shift ? <OpenShift tills={sh.data.tills} onOpened={sh.reload} /> : (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Till <b>{sh.data.shift.tillName}</b> open since {dt(sh.data.shift.openedAt)} · {sh.data.shift.totals?.count || 0} sales, {money(sh.data.shift.totals?.sales)}</span><button className={btnGhost} onClick={() => setClosing(true)}>Close my till</button></div>
        <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
          <Card>
            <form onSubmit={scanGo} className="mb-3"><Field label="Find an item, or scan its barcode" hint="Press Enter after scanning to add it."><input ref={scan} className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></Field></form>
            <Loading g={items}>{items.data && (items.data.rows.length === 0 ? <EmptyState title="No items" text="Ask an administrator to add items to the store." /> : (
              <ul className="grid gap-2 sm:grid-cols-2">{items.data.rows.map((s) => <li key={s._id}><button className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#e3e7e7] p-2 text-start hover:bg-[#f7f6f2] disabled:opacity-50" disabled={s.available < 1} onClick={() => add(s)} aria-label={`Add ${s.name} ${s.variant} to the sale, ${money(s.price)}, ${s.available} left`}><span><span className="block text-sm font-medium">{s.name}</span><span className="block text-xs text-[#5b6b7b]">{[s.variant, s.sku].filter(Boolean).join(' · ')}</span></span><span className="text-end text-sm"><b>{money(s.price)}</b><span className={`block text-xs ${s.available <= s.reorderLevel ? 'text-[#8a4636]' : 'text-[#5b6b7b]'}`}>{s.available} left</span></span></button></li>)}</ul>
            ))}</Loading>
          </Card>
          <Card>
            <h3 className="mb-2 font-semibold text-[#1b2837]">This sale</h3>
            {cart.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing added yet.</p> : (
              <div className="space-y-3">
                <ul className="divide-y divide-[#f0f1f1] text-sm">{cart.map((x) => <li key={x.sku._id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.sku.name}</span><span className="block text-xs text-[#5b6b7b]">{x.sku.variant} · {money(x.sku.price)} each</span></span>
                  <input aria-label={`Quantity of ${x.sku.name} ${x.sku.variant}`} className="w-16 rounded-lg border border-[#e3e7e7] px-2 py-1 text-sm" type="number" min="1" max={x.sku.available} value={x.qty} onChange={(e) => setQty(x.sku._id, parseInt(e.target.value, 10))} />
                  <span className="w-20 text-end">{money(x.sku.price * x.qty)}</span><button className="rounded p-1 text-[#9f1239] hover:bg-[#fff1f2]" aria-label={`Remove ${x.sku.name} ${x.sku.variant}`} onClick={() => setCart((c) => c.filter((y) => y !== x))}>✕</button></li>)}</ul>
                <div className="grid grid-cols-2 gap-2"><Field label="Discount (%)"><input className={inputCls} type="number" min="0" max="100" value={disc} onChange={(e) => setDisc(e.target.value)} /></Field>{pct > 0 && <Field label="Why?"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} required /></Field>}</div>
                <div className="grid grid-cols-2 gap-2"><Field label="Paid by"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="wallet">Mobile wallet</option><option value="account">Charged to account</option></select></Field>
                  {method === 'cash' ? <Field label="Cash received (Rs)"><input className={inputCls} type="number" min="0" value={tender} onChange={(e) => setTender(e.target.value)} /></Field> : <Field label="Reference"><input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}</div>
                <div className="space-y-1 border-t border-[#e3e7e7] pt-2 text-sm">{discount > 0 && <p className="flex justify-between text-[#5b6b7b]"><span>Discount</span><span>-{money(discount)}</span></p>}<p className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></p>{method === 'cash' && Number(tender) >= total && <p className="flex justify-between text-[#215a52]"><span>Change to give</span><span>{money(change)}</span></p>}</div>
                <button className={`${btnPrimary} w-full`} onClick={sell} disabled={busy || (method === 'cash' && (Number(tender) || 0) < total)}>{busy ? 'Working…' : `Take ${money(total)}`}</button>
              </div>
            )}
          </Card>
        </div>
        {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
        {closing && <CloseShift shift={sh.data.shift} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); sh.reload(); }} />}
      </div>
    ))}</Loading>
  );
}
