import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, Note, LBadge, money, day, key, useDebounced, saveBlob } from './libKit';

const QUEUE = 'aulensia.library.queue';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch (e) { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch (e) { /* storage full or blocked */ } };

// Finds a person by name, admission number or a scanned card.
function PersonFinder({ onPick, onCard }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [rows, setRows] = useState([]); const [scan, setScan] = useState('');
  useEffect(() => { let live = true; if (dq.trim().length < 2) { setRows([]); return undefined; } apiClient.get('/library/people', { params: { q: dq } }).then((r) => { if (live) setRows(r.data.rows); }).catch(() => {}); return () => { live = false; }; }, [dq]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Field label="Find a student or teacher" hint="Type at least two letters of the name or the admission number."><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></Field>
        {rows.length > 0 && <ul className="mt-2 divide-y divide-[#f0f1f1] rounded-lg border border-[#e3e7e7] text-sm">{rows.map((p) => <li key={`${p.type}${p.id}`}><button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-[#f7f6f2]" onClick={() => { onPick(p); setQ(''); setRows([]); }}><span className="font-medium">{p.name}</span><span className="text-xs text-[#5b6b7b]">{p.label}</span></button></li>)}</ul>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (scan.trim()) { onCard(scan.trim()); setScan(''); } }}>
        <Field label="Scan a library card" hint="A scanner types the number and presses Enter."><input className={`${inputCls} font-mono`} value={scan} onChange={(e) => setScan(e.target.value)} autoComplete="off" spellCheck={false} /></Field>
        <button className={`${btnGhost} mt-2`}>Open card</button>
      </form>
    </div>
  );
}

function ReturnPanel({ offline, queue, onResult }) {
  const [code, setCode] = useState(''); const [damage, setDamage] = useState('none'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null); const ref = useRef(null);
  const go = async (e) => {
    e.preventDefault(); if (!code.trim()) return; setBusy(true); setRes(null);
    try {
      if (offline) { queue({ type: 'return', barcode: code.trim(), damage }); toast.success('Saved on this device. Send it when you are online.'); setCode(''); }
      else { const r = await apiClient.post('/library/return', { barcode: code.trim(), damage, note }); setRes(r.data); setCode(''); setNote(''); setDamage('none'); onResult && onResult(); }
    } catch (x) { toast.error(errMsg(x, 'Could not return that book.')); } finally { setBusy(false); ref.current?.focus(); }
  };
  return (
    <Card>
      <h3 className="mb-2 font-semibold text-[#1b2837]">Take a book back</h3>
      <form onSubmit={go} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Scan the book barcode"><input ref={ref} className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} /></Field>
        <Field label="Condition"><select className={inputCls} value={damage} onChange={(e) => setDamage(e.target.value)}><option value="none">Fine</option><option value="minor">Minor damage</option><option value="major">Major damage</option><option value="destroyed">Destroyed</option></select></Field>
        <button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : 'Return'}</button>
        {damage !== 'none' && <div className="sm:col-span-3"><Field label="What is wrong with it?"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></Field></div>}
      </form>
      {res && (
        <div className="mt-3 rounded-lg border border-[#bfd8d2] bg-[#edf5f3] p-3 text-sm text-[#215a52]" role="status">
          <p className="font-semibold">{res.found ? `“${res.title}” was lost and has been found.` : `“${res.title}” is back from ${res.holder}.`}</p>
          {res.fines?.map((f, i) => <p key={i}>{f.kind ? `A ${f.kind} charge of ${money(f.amount)} was added: ${f.basis}` : `${f.fineNo}: ${f.action}`}</p>)}
          {res.heldFor && <p>It is being held for {res.heldFor}, who reserved it.</p>}
          {res.copyStatus === 'repair' && <p>The copy was sent for repair.</p>}
        </div>
      )}
    </Card>
  );
}

function CardView({ card, view, reload, admin, offline, queue }) {
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null); const ref = useRef(null);
  const lend = async (e) => {
    e.preventDefault(); if (!code.trim()) return; setBusy(true);
    try {
      if (offline) { queue({ type: 'issue', card: card.barcode, barcode: code.trim() }); toast.success('Saved on this device. Send it when you are online.'); }
      else { const r = await apiClient.post('/library/issue', { cardId: card._id, barcode: code.trim() }); toast.success(`“${r.data.title}” is due on ${day(r.data.due)}.`); await reload(); }
      setCode('');
    } catch (x) { toast.error(errMsg(x, 'Could not lend that book.')); } finally { setBusy(false); ref.current?.focus(); }
  };
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); await reload(); } catch (x) { toast.error(errMsg(x, 'That did not work.')); } };
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-lg font-bold text-[#1b2837]">{card.name}</h3><p className="text-sm text-[#5b6b7b]">{card.classLabel || card.holderType} · card <span className="font-mono">{card.barcode}</span></p></div>
          <div className="flex flex-wrap items-center gap-2"><LBadge s={card.status} />{view.owed > 0 && <LBadge s="bad" label={`Owes ${money(view.owed)}`} tone="bad" />}<span className="text-xs text-[#5b6b7b]">{view.loans.filter((l) => l.kind === 'loan').length} of {view.limit} books out</span></div>
        </div>
        {card.status !== 'active' && <div className="mt-2"><Note tone="warn">This card is {card.status}{card.blockReason ? `: ${card.blockReason}` : ''}.</Note></div>}
        <form onSubmit={lend} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1"><Field label="Scan the book to lend"><input ref={ref} className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} /></Field></div>
          <button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : 'Lend'}</button>
          {admin && <button type="button" className={btnGhost} onClick={() => setAsk({ kind: 'card' })}>Block or unblock the card</button>}
        </form>
      </Card>
      <Card>
        <h4 className="mb-2 font-semibold text-[#1b2837]">Books out</h4>
        {view.loans.length === 0 ? <EmptyState title="Nothing out" text="Scan a book above to lend it." /> : (
          <Table label="Books out" head={['Book', 'Type', 'Due', 'Renewed', '']} min={560}>
            {view.loans.map((l) => <tr key={l._id}><Td><span className="font-medium">{l.titleName}</span><div className="font-mono text-[11px] text-[#5b6b7b]">{l.barcode}</div></Td><Td><LBadge s={l.kind} /></Td><Td>{day(l.dueOn)} {l.overdue && <LBadge s="overdue" label={`${l.daysLate} day${l.daysLate === 1 ? '' : 's'} late`} />}</Td><Td>{l.renewals}</Td>
              <Td><div className="flex flex-wrap gap-1">{l.kind === 'loan' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/library/loans/${l._id}/renew`), 'Renewed.')}>Renew</button>}<button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => setAsk({ kind: 'lost', loan: l })}>Report lost</button></div></Td></tr>)}
          </Table>
        )}
      </Card>
      {(view.reservations.length > 0 || view.fines.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {view.reservations.length > 0 && <Card><h4 className="mb-2 font-semibold text-[#1b2837]">Reserved</h4><ul className="grid gap-2 text-sm">{view.reservations.map((r) => <li key={r._id} className="flex flex-wrap items-center justify-between gap-2"><span>{r.titleName} <LBadge s={r.status} />{r.status === 'waiting' && <span className="ms-1 text-xs text-[#5b6b7b]">place {r.position}</span>}</span><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/library/reservations/${r._id}/cancel`, {}), 'Reservation cancelled.')}>Cancel</button></li>)}</ul></Card>}
          {view.fines.length > 0 && <Card><h4 className="mb-2 font-semibold text-[#1b2837]">Charges to pay</h4><ul className="grid gap-2 text-sm">{view.fines.map((f) => <li key={f._id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{money(f.amount)}</b> · {f.basis} <span className="text-xs text-[#5b6b7b]">{f.titleName}</span></span><span className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/library/fines/${f._id}/pay`, { method: 'cash' }), 'Payment recorded.')}>Paid in cash</button>{admin && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk({ kind: 'waive', fine: f })}>Waive</button>}</span></li>)}</ul></Card>}
        </div>
      )}
      {ask?.kind === 'lost' && <Reason title="Report this book lost" text={`“${ask.loan.titleName}” will be marked lost and ${card.name} will be charged by the library rules.`} confirm="Report lost" label="What happened?" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/library/loans/${ask.loan._id}/lost`, { note: v }); setAsk(null); toast.success('Marked lost and charged.'); await reload(); }} />}
      {ask?.kind === 'waive' && <Reason title="Waive this charge" text={`${money(ask.fine.amount)}: ${ask.fine.basis}`} confirm="Waive it" min={10} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.post(`/library/fines/${ask.fine._id}/waive`, { reason: v }); setAsk(null); toast.success('Charge waived.'); await reload(); }} />}
      {ask?.kind === 'card' && <Reason title={card.status === 'active' ? 'Block this card' : 'Unblock this card'} text="The reason is kept in the record." confirm={card.status === 'active' ? 'Block' : 'Unblock'} danger={card.status === 'active'} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.patch(`/library/cards/${card._id}`, { status: card.status === 'active' ? 'blocked' : 'active', reason: v }); setAsk(null); toast.success('Saved.'); await reload(); }} />}
    </div>
  );
}

export default function Desk({ admin }) {
  const [card, setCard] = useState(null); const [view, setView] = useState(null); const [err, setErr] = useState('');
  const [offline, setOffline] = useState(false); const [q, setQ] = useState(readQueue); const [results, setResults] = useState(null); const [sending, setSending] = useState(false);
  const open = async (params) => { setErr(''); try { const r = await apiClient.get('/library/cards/lookup', { params }); setCard(r.data.card); setView(r.data); } catch (e) { setErr(errMsg(e, 'Could not open that card.')); setCard(null); setView(null); } };
  const reload = async () => { if (card) await open({ cardId: card._id }); };
  const queue = (op) => { setErr(''); setResults(null); const next = [...readQueue(), { ...op, clientKey: key(), capturedAt: new Date().toISOString() }]; writeQueue(next); setQ(next); };
  const send = async () => {
    const ops = readQueue(); if (!ops.length) return; setSending(true);
    try {
      const r = await apiClient.post('/library/sync', { ops: ops.slice(0, 100) }); const done = new Set(r.data.results.filter((x) => x.ok || !x.retry).map((x) => x.clientKey)); const left = ops.filter((o) => !done.has(o.clientKey)); writeQueue(left); setQ(left); setResults(r.data.results);
      toast.success(`${r.data.results.filter((x) => x.ok).length} sent.`);
    } catch (e) { toast.error(errMsg(e, 'Could not send. They are still saved here.')); } finally { setSending(false); }
  };
  useEffect(() => { const on = () => { if (readQueue().length) send(); }; window.addEventListener('online', on); return () => window.removeEventListener('online', on); /* eslint-disable-next-line */ }, []);
  const labels = async () => { try { const r = await apiClient.post('/library/labels/cards', { cardIds: card ? [card._id] : [] }, { responseType: 'blob' }); saveBlob(r.data, 'library-card.pdf'); } catch (e) { toast.error('Could not make the card.'); } };
  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-[#1b2837]">Circulation desk</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Work offline (save lending and returns on this device)</label>
        </div>
        {offline && <div className="mb-3"><Note>You are working offline. Lending and returns are saved here with the time you did them and are sent when you press “Send saved actions”. Scan the library card number for each lending.</Note></div>}
        <PersonFinder onPick={(p) => open(p.type === 'student' ? { studentId: p.id } : { teacherId: p.id })} onCard={(c) => (offline ? setCard({ barcode: c, name: `Card ${c}`, holderType: '', status: 'active', _id: 'offline' }) || setView({ loans: [], reservations: [], fines: [], owed: 0, limit: 0 }) : open({ card: c }))} />
        {err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}
      </Card>
      {(q.length > 0 || results) && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{q.length > 0 ? <><b>{q.length}</b> action{q.length === 1 ? '' : 's'} saved on this device and not sent yet.</> : 'Everything saved on this device has been sent.'}</p>{q.length > 0 ? <button className={btnPrimary} onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send saved actions'}</button> : <button className={btnGhost} onClick={() => setResults(null)}>Clear this list</button>}</div>
          {results && <ul className="mt-2 grid gap-1 text-sm">{results.map((r) => <li key={r.clientKey} className={r.ok ? 'text-[#215a52]' : 'text-[#9f1239]'}>{r.ok ? `Done${r.late ? ' (done earlier, sent late)' : ''}: ${r.result?.title || ''}` : `Not done: ${r.result?.message || r.message}`}</li>)}</ul>}
        </Card>
      )}
      {card && view && card._id !== 'offline' && <CardView card={card} view={view} reload={reload} admin={admin} offline={offline} queue={queue} />}
      {card && card._id === 'offline' && <Card><p className="text-sm">Offline card <span className="font-mono">{card.barcode}</span>.</p><OfflineLend card={card} queue={queue} /></Card>}
      <ReturnPanel offline={offline} queue={queue} onResult={reload} />
      {card && card._id !== 'offline' && <div><button className={btnGhost} onClick={labels}>Print this card</button></div>}
    </div>
  );
}

function OfflineLend({ card, queue }) {
  const [code, setCode] = useState('');
  return <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { queue({ type: 'issue', card: card.barcode, barcode: code.trim() }); setCode(''); toast.success('Saved on this device.'); } }}><div className="min-w-[14rem] flex-1"><Field label="Scan the book to lend"><input className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></Field></div><button className={btnPrimary}>Save lending</button></form>;
}
