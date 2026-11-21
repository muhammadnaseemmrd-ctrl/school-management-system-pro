import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Modal, Field, Stat, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, PBadge, Dl, Trail, ASSET_KINDS, useGet, Loading, PageBar, useDebounced, Note, AskForm, money, day, dt, download, saveBlob } from './pcKit';

function Detail({ id, admin, onClose, onChange }) {
  const g = useGet(`/procure/assets/${id}`); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null); const a = g.data?.asset; const reload = () => { g.reload(); onChange(); };
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={a ? `${a.tag} · ${a.name}` : 'Asset'} onClose={onClose} wide>
      <Loading g={g}>{a && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><PBadge k="asset" s={a.status} />{a.status === 'disposal_requested' && a.disposal && <span className="text-xs text-[#5b6b7b]">{a.disposal.how.replace('_', ' ')} asked for by {a.disposal.requestedByName}: {a.disposal.reason}</span>}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Cost" value={money(a.cost)} /><Stat label="Lost in value" value={money(a.accumulated)} sub={`${a.monthsHeld} months`} /><Stat label="Worth now" value={money(a.book)} /><Stat label="Each month" value={money(a.monthly)} /></div>
          <Dl items={[['Kind', ASSET_KINDS[a.category] || a.category], ['Where', a.location], ['Who has it', a.custodianName], ['Serial number', a.serial], ['In use since', day(a.capitalizedOn)], ['Useful life', `${a.usefulLifeYears} years`], ['Scrap value', money(a.salvage)], ['From order', a.poNo]]} />
          <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={() => setForm('move')} disabled={['disposal_requested', 'disposed', 'lost'].includes(a.status)}>Move or hand over</button>{['in_service', 'in_repair', 'stored'].includes(a.status) && <>
            {a.status !== 'in_repair' && <button className={btnGhost} onClick={() => run(() => apiClient.patch(`/procure/assets/${id}`, { status: 'in_repair' }), 'Marked as in repair.')}>Send for repair</button>}{a.status !== 'in_service' && <button className={btnGhost} onClick={() => run(() => apiClient.patch(`/procure/assets/${id}`, { status: 'in_service' }), 'Back in service.')}>Back in service</button>}{a.status !== 'stored' && <button className={btnGhost} onClick={() => run(() => apiClient.patch(`/procure/assets/${id}`, { status: 'stored' }), 'Put in storage.')}>Put in storage</button>}<button className={btnDanger} onClick={() => setForm('dispose')}>Dispose of it</button></>}
            {admin && a.status === 'disposal_requested' && <><button className={btnPrimary} onClick={() => run(() => apiClient.post(`/procure/assets/${id}/dispose/decide`, { approve: true }), 'Disposal approved.')}>Approve the disposal</button><button className={btnGhost} onClick={() => setAsk(true)}>Turn it down</button></>}</div>
          {g.data.schedule.length > 1 && <section><h4 className="mb-1 text-sm font-semibold">How its value falls</h4><Table label="Depreciation schedule" head={['On', 'Lost so far', 'Worth then']} min={380}>{g.data.schedule.map((s) => <tr key={s.on}><Td>{day(s.on)}</Td><Td>{money(s.accumulated)}</Td><Td>{money(s.book)}</Td></tr>)}</Table></section>}
          {g.data.tickets.length > 0 && <section><h4 className="mb-1 text-sm font-semibold">Repair jobs</h4><Table label="Repair jobs" head={['Job', 'What', 'Status', 'Cost']} min={440}>{g.data.tickets.map((t) => <tr key={t._id}><Td className="font-mono text-xs">{t.ticketNo}</Td><Td>{t.title}</Td><Td><PBadge k="ticket" s={t.status} /></Td><Td>{t.cost ? money(t.cost) : '—'}</Td></tr>)}</Table></section>}
          <details><summary className="cursor-pointer text-sm font-semibold text-[#2a5cac]">History</summary><ol className="mt-2 space-y-1 text-xs text-[#3b4a5c]" aria-label="Asset history">{g.data.events.map((e) => <li key={e._id}><span className="font-semibold">{e.kind}</span>{e.from || e.to ? ` · ${e.from || '—'} → ${e.to || '—'}` : ''}{e.note ? ` — ${e.note}` : ''} <span className="text-[#5b6b7b]">{e.byName} · {dt(e.createdAt)}</span></li>)}</ol></details>
        </div>)}</Loading>
      {form === 'move' && <AskForm title="Move or hand over" confirm="Save" initial={{ location: a?.location, custodianName: a?.custodianName }} fields={[{ k: 'location', label: 'Where it is now' }, { k: 'custodianName', label: 'Who has it' }, { k: 'note', label: 'Note', type: 'textarea' }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post(`/procure/assets/${id}/transfer`, v); setForm(null); toast.success('Saved.'); reload(); }} />}
      {form === 'dispose' && <AskForm title="Dispose of this asset" intro="A different administrator must approve it. The asset stays on the register, marked gone." confirm="Ask to dispose" initial={{ how: 'scrap' }} fields={[{ k: 'how', label: 'How', type: 'select', options: [['sale', 'Sold'], ['scrap', 'Scrapped'], ['donate', 'Donated'], ['write_off', 'Written off'], ['lost', 'Lost or stolen']] }, { k: 'proceeds', label: 'Money received (Rs)', type: 'number', min: 0 }, { k: 'reason', label: 'Why', type: 'textarea', required: true }]} onClose={() => setForm(null)} onDone={async (v) => { await apiClient.post(`/procure/assets/${id}/dispose`, { ...v, proceeds: v.proceeds === '' ? undefined : Number(v.proceeds) }); setForm(null); toast.success('Sent for approval.'); reload(); }} />}
      {ask && <Reason title="Turn down the disposal" text="The asset goes back to where it was." confirm="Turn it down" onClose={() => setAsk(false)} onDone={async (r) => { await apiClient.post(`/procure/assets/${id}/dispose/decide`, { approve: false, note: r }); setAsk(false); toast.success('Turned down.'); reload(); }} />}
    </Modal>
  );
}

function FromOrder({ onClose, onDone }) {
  const orders = useGet('/procure/orders', { limit: 50, status: 'part_received' }); const done = useGet('/procure/orders', { limit: 50, status: 'received' }); const [oid, setOid] = useState(''); const det = useGet(oid ? `/procure/orders/${oid}` : '/procure/access');
  const list = [...(orders.data?.rows || []), ...(done.data?.rows || [])]; const lines = oid && det.data?.lines ? det.data.lines.filter((l) => l.receivedQty - l.tagged > 0) : [];
  return (
    <Modal title="Tag what has arrived" onClose={onClose}>
      <div className="grid gap-3"><Field label="Order"><select className={inputCls} value={oid} onChange={(e) => setOid(e.target.value)}><option value="">Choose an order that has arrived</option>{list.map((o) => <option key={o._id} value={o._id}>{o.poNo} · {o.vendorName}</option>)}</select></Field>
        {oid && lines.length === 0 && <Note>Everything that has arrived on this order is already tagged.</Note>}
        {lines.map((l) => <LineTag key={l._id} oid={oid} l={l} onDone={() => { det.reload(); onDone(); }} />)}</div>
    </Modal>
  );
}
function LineTag({ oid, l, onDone }) {
  const [v, setV] = useState({ count: l.receivedQty - l.tagged, category: 'other', location: '' }); const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); try { const r = await apiClient.post('/procure/assets/from-order', { orderId: oid, lineId: l._id, ...v, count: Number(v.count) }); toast.success(`${r.data.added} tagged.`); onDone(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); } };
  return <form onSubmit={go} className="grid gap-2 rounded-xl border border-[#e3e7e7] p-3 sm:grid-cols-3"><p className="text-sm font-semibold sm:col-span-3">{l.description} <span className="font-normal text-[#5b6b7b]">· {l.receivedQty - l.tagged} not tagged yet</span></p>
    <Field label="How many"><input className={inputCls} type="number" min="1" max={l.receivedQty - l.tagged} value={v.count} onChange={(e) => setV({ ...v, count: e.target.value })} required /></Field>
    <Field label="Kind"><select className={inputCls} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{Object.entries(ASSET_KINDS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
    <Field label="Where"><input className={inputCls} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} /></Field>
    <div className="sm:col-span-3"><button className={btnPrimary} disabled={busy}>{busy ? 'Tagging…' : 'Tag them'}</button></div></form>;
}

export default function Assets({ admin }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [cat, setCat] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null); const [form, setForm] = useState(null); const [picked, setPicked] = useState([]); const [scan, setScan] = useState('');
  const g = useGet('/procure/assets', { q: dq || undefined, category: cat || undefined, status: status || undefined, page, limit: 25 });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const labels = async () => { try { const r = await apiClient.post('/procure/assets/labels', { ids: picked }, { responseType: 'blob' }); saveBlob(r.data, 'asset-tags.pdf'); } catch (e) { toast.error('Could not make the labels.'); } };
  const find = async (e) => { e.preventDefault(); try { const r = await apiClient.get('/procure/assets/by-tag', { params: { tag: scan } }); setScan(''); setOpen(r.data.asset._id); } catch (x) { toast.error(errMsg(x, 'No asset has that tag.')); } };
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><div className="min-w-[12rem] flex-1"><Field label="Search the register"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, tag, serial or place" /></Field></div>
        <Field label="Kind"><select className={inputCls} value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}><option value="">All kinds</option>{Object.entries(ASSET_KINDS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
        <Field label="Show"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Everything in use</option><option value="in_repair">In repair</option><option value="stored">In storage</option><option value="disposal_requested">Disposal waiting</option><option value="disposed">Disposed</option><option value="lost">Lost</option></select></Field></div>
        <div className="mt-3 flex flex-wrap items-end gap-3"><form onSubmit={find} className="flex items-end gap-2"><Field label="Scan or type a tag"><input className={`${inputCls} font-mono`} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="AS00000013" /></Field><button className={btnGhost} disabled={!scan}>Find it</button></form>
          <button className={btnPrimary} onClick={() => setForm('new')}>Add an asset</button><button className={btnGhost} onClick={() => setForm('order')}>Tag what has arrived</button><button className={btnGhost} onClick={labels} disabled={!picked.length}>Print labels ({picked.length})</button>{admin && <button className={btnGhost} onClick={() => download('/procure/reports/assets?format=csv', 'asset-register.csv')}>Download the register</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No assets here" text="Add equipment and furniture the school owns, or tag items when an order arrives. Each gets its own tag." /></Card> : <>
        <Table label="Asset register" head={['', 'Tag', 'Asset', 'Where', 'Cost', 'Worth now', 'Status', '']} min={900}>{g.data.rows.map((a) => <tr key={a._id}><Td><input type="checkbox" checked={picked.includes(a._id)} onChange={() => toggle(a._id)} aria-label={`Select ${a.tag} for labels`} /></Td><Td className="font-mono text-xs">{a.tag}</Td><Td className="font-medium">{a.name}<div className="text-xs text-[#5b6b7b]">{ASSET_KINDS[a.category]}{a.serial ? ` · ${a.serial}` : ''}</div></Td><Td>{a.location}<div className="text-xs text-[#5b6b7b]">{a.custodianName}</div></Td><Td>{money(a.cost)}</Td><Td>{money(a.book)}</Td><Td><PBadge k="asset" s={a.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(a._id)} aria-label={`Open ${a.tag}`}>Open</button></Td></tr>)}</Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
      </>)}</Loading>
      {form === 'new' && <AskForm title="Add an asset" wide confirm="Add it" initial={{ category: 'it', capitalizedOn: new Date().toISOString().slice(0, 10) }} fields={[{ k: 'name', label: 'Name', required: true, full: true }, { k: 'category', label: 'Kind', type: 'select', options: Object.entries(ASSET_KINDS) }, { k: 'cost', label: 'Cost (Rs)', type: 'number', min: 0, required: true }, { k: 'salvage', label: 'Scrap value (Rs)', type: 'number', min: 0 }, { k: 'capitalizedOn', label: 'In use since', type: 'date' }, { k: 'location', label: 'Where' }, { k: 'custodianName', label: 'Who has it' }, { k: 'serial', label: 'Serial number' }]} onClose={() => setForm(null)} onDone={async (v) => { const r = await apiClient.post('/procure/assets', { ...v, cost: Number(v.cost), salvage: v.salvage === '' ? undefined : Number(v.salvage) }); setForm(null); toast.success(r.data.belowThreshold ? `Added as ${r.data.tag}. It is below the amount the school counts as an asset.` : `Added as ${r.data.tag}.`); g.reload(); }} />}
      {form === 'order' && <FromOrder onClose={() => setForm(null)} onDone={g.reload} />}
      {open && <Detail id={open} admin={admin} onClose={() => setOpen(null)} onChange={g.reload} />}
    </div>
  );
}
