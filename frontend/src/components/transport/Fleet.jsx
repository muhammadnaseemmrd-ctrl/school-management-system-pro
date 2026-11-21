import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, AskForm, TBadge, Dl, day, dt } from './tpKit';

const VF = (v) => [
  { k: 'plate', label: 'Number plate', required: true }, { k: 'label', label: 'Name (for example Bus 2)' }, { k: 'kind', label: 'Kind', type: 'select', options: [['bus', 'Bus'], ['van', 'Van'], ['other', 'Other']], def: v?.kind || 'bus' },
  { k: 'capacity', label: 'Seats for children', type: 'number', min: 1, max: 120, required: true }, { k: 'fitnessExpiry', label: 'Fitness certificate runs out', type: 'date' }, { k: 'insuranceExpiry', label: 'Insurance runs out', type: 'date' }, { k: 'notes', label: 'Notes', type: 'textarea' }];

export function Vehicles({ manage, go }) {
  const g = useGet('/transport/vehicles'); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null);
  return (
    <div className="space-y-3">
      {manage && <div><button className={btnPrimary} onClick={() => setForm({})}>Add a vehicle</button></div>}
      <Loading g={g}>{g.data && (g.data.length === 0 ? <Card><EmptyState title="No vehicles yet" text="Add each bus or van with its seats and the dates its papers run out. The same plate cannot be added twice." /></Card> : (
        <Table label="Vehicles" head={['Vehicle', 'Seats', 'Papers', 'Inspection', 'Status', '']} min={760}>{g.data.map((v) => (
          <tr key={v._id}><Td className="font-medium">{v.plate}<div className="text-xs text-[#5b6b7b]">{v.label || v.kind}</div></Td><Td>{v.capacity}</Td>
            <Td className="text-xs"><span className={v.fitnessSoon ? 'font-semibold text-[#8a4636]' : ''}>Fitness {v.fitnessExpiry ? day(v.fitnessExpiry) : 'not set'}</span><br /><span className={v.insuranceSoon ? 'font-semibold text-[#8a4636]' : ''}>Insurance {v.insuranceExpiry ? day(v.insuranceExpiry) : 'not set'}</span></Td>
            <Td className="text-xs">{v.lastInspectionOn ? `Last ${day(v.lastInspectionOn)}` : 'Never'}<br /><span className={v.inspectionDue ? 'font-semibold text-[#8a4636]' : ''}>{v.nextInspectionDue ? `Due ${day(v.nextInspectionDue)}` : 'Due now'}</span></Td>
            <Td><TBadge k="vehicle" s={v.status} />{v.status === 'inspection_hold' && <div className="mt-1 text-xs text-[#5b6b7b]">{v.holdReason}</div>}</Td>
            <Td>{manage && v.status !== 'retired' && <span className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setForm(v)} aria-label={`Change ${v.plate}`}>Change</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => go && go('inspections', v._id)} aria-label={`Inspect ${v.plate}`}>Inspect</button><button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => setAsk(v)} aria-label={`Retire ${v.plate}`}>Retire</button></span>}</Td></tr>))}</Table>))}</Loading>
      {form && <AskForm title={form._id ? `Change ${form.plate}` : 'Add a vehicle'} confirm="Save" fields={VF(form)} initial={form._id ? form : {}} onClose={() => setForm(null)} onDone={async (x) => { const b = { ...x, capacity: Number(x.capacity) }; if (form._id) await apiClient.patch(`/transport/vehicles/${form._id}`, b); else await apiClient.post('/transport/vehicles', b); setForm(null); toast.success('Saved.'); g.reload(); }} />}
      {ask && <Reason title={`Retire ${ask.plate}`} text="A retired vehicle cannot be put on a plan. Give any plan that uses it another vehicle first." confirm="Retire the vehicle" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.patch(`/transport/vehicles/${ask._id}`, { status: 'retired', reason: r }); setAsk(null); toast.success('Retired.'); g.reload(); }} />}
    </div>
  );
}

function KeyShown({ result, onClose }) {
  const link = `${window.location.origin}/driver#${result.driver._id}.${result.key}`; const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch (e) { toast.error('Could not copy. Select the link and copy it by hand.'); } };
  return (
    <Modal title={`Driver link for ${result.driver.name}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Note tone="warn">This private link is shown only once. Anyone with it can act as this driver on the trips given to them. Send it to the driver’s phone and nobody else. If it is lost or shared, make a new one; the old one stops working at once.</Note>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Private link</span><input readOnly className={`${inputCls} font-mono text-xs`} value={link} onFocus={(e) => e.target.select()} /></label>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={copy}>{copied ? 'Copied' : 'Copy the link'}</button><button className={btnPrimary} onClick={onClose}>I have sent it</button></div>
      </div>
    </Modal>
  );
}

export function Drivers({ manage }) {
  const g = useGet('/transport/drivers'); const [form, setForm] = useState(null); const [ask, setAsk] = useState(null); const [shown, setShown] = useState(null);
  const fields = [{ k: 'name', label: 'Name', required: true, full: true }, { k: 'phone', label: 'Phone' }, { k: 'licenceLast4', label: 'Last 4 of licence number', max: 4 }, { k: 'licenceExpiry', label: 'Licence runs out', type: 'date' }, { k: 'notes', label: 'Notes', type: 'textarea' }];
  return (
    <div className="space-y-3">
      <Note>Drivers do not have a school login. Each gets a private link for their phone that opens only the trips given to them.</Note>
      {manage && <div><button className={btnPrimary} onClick={() => setForm({})}>Add a driver</button></div>}
      <Loading g={g}>{g.data && (g.data.length === 0 ? <Card><EmptyState title="No drivers yet" text="Add each driver and give them their private link." /></Card> : (
        <Table label="Drivers" head={['Driver', 'Phone', 'Licence', 'Last seen', 'Status', '']} min={760}>{g.data.map((d) => (
          <tr key={d._id}><Td className="font-medium">{d.name}</Td><Td>{d.phone || '—'}</Td><Td className="text-xs">{d.licenceLast4 ? `…${d.licenceLast4}` : ''}<br />{d.licenceExpiry ? `Runs out ${day(d.licenceExpiry)}` : 'No date'}</Td><Td className="text-xs">{d.lastSeenAt ? dt(d.lastSeenAt) : 'Not yet'}</Td><Td><TBadge k="driver" s={d.status} /></Td>
            <Td>{manage && d.status !== 'ended' && <span className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setForm(d)} aria-label={`Change ${d.name}`}>Change</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={async () => { try { const r = await apiClient.post(`/transport/drivers/${d._id}/key`); setShown(r.data); g.reload(); } catch (e) { toast.error(errMsg(e)); } }} aria-label={`Make a new link for ${d.name}`}>{d.hasKey ? 'New link' : 'Make link'}</button>{d.status === 'active' ? <button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => setAsk(d)} aria-label={`Switch off ${d.name}`}>Switch off</button> : <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={async () => { try { await apiClient.patch(`/transport/drivers/${d._id}`, { status: 'active' }); toast.success('Active again.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } }}>Switch on</button>}</span>}</Td></tr>))}</Table>))}</Loading>
      {form && <AskForm title={form._id ? `Change ${form.name}` : 'Add a driver'} confirm="Save" fields={fields} initial={form._id ? form : {}} onClose={() => setForm(null)} onDone={async (x) => { if (form._id) { await apiClient.patch(`/transport/drivers/${form._id}`, x); setForm(null); toast.success('Saved.'); g.reload(); } else { const r = await apiClient.post('/transport/drivers', x); setForm(null); g.reload(); setShown(r.data); } }} />}
      {ask && <Reason title={`Switch off ${ask.name}`} text="Their private link stops working. Give any standing plan another driver first." confirm="Switch off" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.patch(`/transport/drivers/${ask._id}`, { status: 'suspended', reason: r }); setAsk(null); toast.success('Switched off.'); g.reload(); }} />}
      {shown && <KeyShown result={shown} onClose={() => setShown(null)} />}
    </div>
  );
}

export function Inspections({ manage, vehicleId }) {
  const [vid, setVid] = useState(vehicleId || ''); const vehicles = useGet('/transport/vehicles'); const cfg = useGet('/transport/settings'); const g = useGet('/transport/inspections', { vehicleId: vid || undefined }); const [form, setForm] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const items = cfg.data?.settings?.inspection || [];
  const start = () => setForm({ vehicleId: vid || vehicles.data?.[0]?._id || '', kind: 'routine', inspectorName: '', notes: '', marks: Object.fromEntries(items.map((i) => [i.key, { result: 'pass', note: '' }])) });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await apiClient.post('/transport/inspections', { vehicleId: form.vehicleId, kind: form.kind, inspectorName: form.inspectorName, notes: form.notes, items: items.map((i) => ({ key: i.key, result: form.marks[i.key].result, note: form.marks[i.key].note })) }); setForm(null); toast.success(r.data.inspection.result === 'pass' ? 'Inspection passed.' : `Inspection failed.${r.data.inspection.ticketNo ? ` Repair job ${r.data.inspection.ticketNo} opened.` : ''}`); g.reload(); vehicles.reload(); } catch (x) { setErr(errMsg(x)); } setBusy(false);
  };
  return (
    <div className="space-y-3">
      <Note>A failed critical line puts the bus on hold: it cannot start a trip, and a repair job goes to the purchasing office. Only a later passed inspection, by a different person, lifts the hold.</Note>
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="Vehicle"><select className={inputCls} value={vid} onChange={(e) => setVid(e.target.value)}><option value="">All vehicles</option>{(vehicles.data || []).map((v) => <option key={v._id} value={v._id}>{v.plate}</option>)}</select></Field>{manage && <button className={btnPrimary} onClick={start} disabled={!items.length || !(vehicles.data || []).length}>Record an inspection</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.length === 0 ? <Card><EmptyState title="No inspections yet" text="Record the first inspection for a bus. Each line is marked pass, fail or not applicable." /></Card> : (
        <Table label="Inspections" head={['Date', 'Vehicle', 'Result', 'Inspector', 'Notes']} min={600}>{g.data.map((i) => <tr key={i._id}><Td>{day(i.doneOn)}</Td><Td className="font-medium">{i.vehiclePlate}</Td><Td><TBadge k="result" s={i.result} />{i.failedCritical > 0 && <div className="text-xs text-[#9f1239]">{i.failedCritical} critical</div>}</Td><Td>{i.inspectorName}</Td><Td className="text-xs">{i.items.filter((x) => x.result === 'fail').map((x) => `${x.label}${x.note ? ` (${x.note})` : ''}`).join('; ')}{i.ticketNo ? ` · Repair job ${i.ticketNo}` : ''}</Td></tr>)}</Table>))}</Loading>
      {form && (
        <Modal title="Record an inspection" onClose={() => setForm(null)} wide>
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Vehicle"><select className={inputCls} value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required>{(vehicles.data || []).filter((v) => v.status !== 'retired').map((v) => <option key={v._id} value={v._id}>{v.plate}</option>)}</select></Field>
              <Field label="Kind"><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="routine">Routine</option><option value="annual">Yearly</option><option value="after_incident">After an incident</option></select></Field>
              <Field label="Inspector"><input className={inputCls} value={form.inspectorName} onChange={(e) => setForm({ ...form, inspectorName: e.target.value })} required /></Field>
            </div>
            <ul className="divide-y divide-[#f0f1f1] rounded-xl border border-[#e3e7e7]">{items.map((i) => (
              <li key={i.key} className="grid gap-2 p-2 sm:grid-cols-12 sm:items-center"><span className="text-sm sm:col-span-5">{i.label}{i.critical && <span className="ms-1 text-[11px] font-semibold text-[#9f1239]">(critical)</span>}</span>
                <fieldset className="flex gap-3 text-sm sm:col-span-4"><legend className="sr-only">{i.label}</legend>{[['pass', 'Pass'], ['fail', 'Fail'], ['na', 'Not applicable']].map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="radio" name={`r-${i.key}`} checked={form.marks[i.key].result === v} onChange={() => setForm({ ...form, marks: { ...form.marks, [i.key]: { ...form.marks[i.key], result: v } } })} />{l}</label>)}</fieldset>
                <input className={`${inputCls} sm:col-span-3`} placeholder="Note" aria-label={`Note for ${i.label}`} value={form.marks[i.key].note} onChange={(e) => setForm({ ...form, marks: { ...form.marks, [i.key]: { ...form.marks[i.key], note: e.target.value } } })} /></li>))}</ul>
            {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setForm(null)}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the inspection'}</button></div>
          </form>
        </Modal>)}
    </div>
  );
}
