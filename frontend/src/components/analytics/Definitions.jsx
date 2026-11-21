import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, inputCls, btnGhost, btnPrimary, btnDanger, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, Status, AskForm, Reason, call, dt } from './anKit';

const LEVELS = [['', 'No change'], ['lead', 'Curriculum leads and administrators only'], ['admin', 'Administrators only']];
const LEVEL_WORD = { teacher: 'Teachers (own classes), leads, administrators', lead: 'Leads and administrators', admin: 'Administrators' };
const alertVal = (a, k) => (a && a[k] !== undefined && a[k] !== null ? String(a[k]) : '');

// What each measure means and who sees it. An administrator of the whole school can tune one or narrow it; a second administrator approves.
export default function Definitions({ acc }) {
  const wide = acc.wide; const g = useGet(wide ? '/analytics/definitions' : '/analytics/catalog', {});
  const [edit, setEdit] = useState(null); const [decide, setDecide] = useState(null); const [hist, setHist] = useState(null); const [mkNew, setMkNew] = useState(false); const [retire, setRetire] = useState(null);
  const list = g.data ? g.data.measures : [];
  return (
    <div className="space-y-3">
      <Note tone="info">Every measure says what it counts, what it is counted against and who may see it. {wide ? 'A change to a measure waits for a second administrator, and old reports keep the version they were made with.' : 'Only an administrator of the whole school changes these.'}</Note>
      {wide && <div className="flex justify-end"><button className={btnPrimary} onClick={() => setMkNew(true)}>New measure for some classes</button></div>}
      <Loading g={g}>{g.data && (
        <Table label="Measures and their definitions" head={['Measure', 'Counts', 'Against', 'Who sees it', 'Version', '']} min={900}>
          {list.map((d) => (
            <tr key={d.key}>
              <Td><div className="font-medium text-[#1b2837]">{d.name}</div><div className="mt-1 flex flex-wrap gap-1"><Tag>{d.domain}</Tag>{d.custom && <Tag tone="info">Made by the school</Tag>}{d.pending && <Status s="pending" />}{d.awaiting && <Status s="pending" />}</div></Td>
              <Td className="max-w-[240px] text-xs">{d.numerator}</Td><Td className="max-w-[240px] text-xs">{d.denominator}</Td>
              <Td className="max-w-[220px] text-xs">{d.roleScope}</Td>
              <Td className="whitespace-nowrap">{d.version || 'Built in'}</Td>
              <Td><div className="flex flex-wrap gap-1">
                {wide && !d.awaiting && !d.pending && <button className={btnGhost} onClick={() => setEdit(d)}>Change</button>}
                {wide && (d.pending) && <button className={btnPrimary} onClick={() => setDecide(d)}>Decide</button>}
                {wide && d.awaiting && <button className={btnPrimary} onClick={() => setDecide(d)}>Decide</button>}
                {wide && d.custom && !d.awaiting && <button className={btnGhost} onClick={() => setRetire(d)}>Retire</button>}
                {wide && <button className={btnGhost} onClick={() => setHist(d)}>History</button>}</div></Td>
            </tr>))}
        </Table>)}</Loading>
      {edit && <EditForm d={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); g.reload(); }} />}
      {decide && <Decide d={decide} onClose={() => setDecide(null)} onDone={() => { setDecide(null); g.reload(); }} />}
      {hist && <History d={hist} onClose={() => setHist(null)} />}
      {mkNew && <NewCustom onClose={() => setMkNew(false)} onDone={() => { setMkNew(false); g.reload(); }} />}
      {retire && <Reason title={`Retire "${retire.name}"`} text="It leaves the catalogue and every scheduled report. Reports already made keep their figures." confirm="Retire it" onClose={() => setRetire(null)} onDone={async (r) => { await apiClient.post(`/analytics/definitions/${retire.key}/retire`, { reason: r }); toast.success('Retired.'); setRetire(null); g.reload(); }} />}
    </div>
  );
}

function EditForm({ d, onClose, onDone }) {
  const spec = d.paramSpec || {}; const keys = Object.keys(spec);
  const fields = [
    { k: 'reason', label: 'Why this change', type: 'textarea', required: true, full: true, max: 300 },
    ...keys.map((k) => (spec[k].type === 'enum' ? { k: `p_${k}`, label: spec[k].label, type: 'select', options: spec[k].values.map((v) => [v, v === 'present' ? 'Present' : v === 'absent' ? 'Absent' : v === 'excluded' ? 'Left out' : v]) } : { k: `p_${k}`, label: spec[k].label, type: 'number', min: spec[k].min, max: spec[k].max })),
    { k: 'below', label: 'Look at it when below (%)', type: 'number', step: 'any' }, { k: 'criticalBelow', label: 'Urgent when below (%)', type: 'number', step: 'any' },
    { k: 'above', label: 'Look at it when above (%)', type: 'number', step: 'any' }, { k: 'criticalAbove', label: 'Urgent when above (%)', type: 'number', step: 'any' },
    { k: 'target', label: 'Target (%)', type: 'number', step: 'any' }, { k: 'minCell', label: 'Smallest group shown (children)', type: 'number', min: 1, max: 30, hint: 'Groups with fewer children show no figure.' },
    { k: 'minLevel', label: 'Who may see it', type: 'select', options: LEVELS, hint: `Now: ${LEVEL_WORD[d.minLevel] || d.minLevel}. It can be narrowed, never opened to more people.` },
  ];
  const initial = { reason: '', below: alertVal(d.alert, 'below'), above: alertVal(d.alert, 'above'), criticalBelow: alertVal(d.alert, 'criticalBelow'), criticalAbove: alertVal(d.alert, 'criticalAbove'), target: d.target ?? '', minCell: d.minCell, minLevel: '', ...Object.fromEntries(keys.map((k) => [`p_${k}`, d.params[k]])) };
  return (
    <AskForm title={`Change "${d.name}"`} intro="Nothing changes until a second administrator approves it." confirm="Send for approval" fields={fields} initial={initial} wide onClose={onClose}
      onDone={async (v) => {
        const params = Object.fromEntries(keys.map((k) => [k, spec[k].type === 'number' ? Number(v[`p_${k}`]) : v[`p_${k}`]]));
        const alert = {}; for (const k of ['below', 'above', 'criticalBelow', 'criticalAbove']) if (v[k] !== '' && v[k] !== null) alert[k] = Number(v[k]);
        await apiClient.put(`/analytics/definitions/${d.key}`, { reason: v.reason, params, alert, target: v.target === '' ? null : Number(v.target), minCell: Number(v.minCell), minLevel: v.minLevel || undefined });
        toast.success('Sent to the other administrators for approval.'); onDone();
      }} />
  );
}

function Decide({ d, onClose, onDone }) {
  const p = d.pending || (d.history || []).find((h) => h.status === 'pending'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async (approve) => { setBusy(true); setErr(''); try { await apiClient.post(`/analytics/definitions/${d.key}/decide`, { approve, note }); toast.success(approve ? 'Approved. The new definition is in use.' : 'Turned down.'); onDone(); } catch (e) { setErr(errMsg(e)); setBusy(false); } };
  return (
    <Modal title={`Decide: ${d.name}`} onClose={onClose}>
      {!p ? <p className="text-sm text-[#5b6b7b]">Nothing is waiting.</p> : (
        <div className="space-y-3 text-sm">
          <p className="text-[#3b4a5c]">Made by <strong>{p.madeByName}</strong>. Reason: {p.reason}</p>
          <ul className="list-disc space-y-1 ps-5 text-[#3b4a5c]">
            {Object.entries(p.params || {}).map(([k, v]) => <li key={k}>{(d.paramSpec[k] || {}).label || k}: <strong>{String(v)}</strong></li>)}
            {Object.keys(p.alert || {}).length > 0 && <li>Lines: {Object.entries(p.alert).map(([k, v]) => `${k} ${v}%`).join(', ')}</li>}
            {p.target !== null && p.target !== undefined && <li>Target {p.target}%</li>}<li>Smallest group shown: {p.minCell} children</li>{p.minLevel && <li>Only for: {LEVEL_WORD[p.minLevel]}</li>}
            {p.filters && (p.filters.standards?.length > 0 || p.filters.classIds?.length > 0 || p.filters.subjectIds?.length > 0) && <li>Narrowed to {[p.filters.standards?.length ? `grades ${p.filters.standards.join(', ')}` : '', p.filters.subjectIds?.length ? 'chosen subjects' : '', p.filters.classIds?.length ? 'chosen classes' : ''].filter(Boolean).join(' and ')}</li>}
          </ul>
          <Field label="Note (needed to turn it down)"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
          {err && <p role="alert" className="text-[#9f1239]">{err}</p>}
          <div className="flex justify-end gap-2"><button className={btnDanger} disabled={busy || note.trim().length < 5} onClick={() => send(false)}>Turn down</button><button className={btnPrimary} disabled={busy} onClick={() => send(true)}>Approve</button></div>
        </div>)}
    </Modal>
  );
}

function History({ d, onClose }) {
  return (
    <Modal title={`Versions of "${d.name}"`} onClose={onClose} wide>
      {(d.history || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">This measure is still on its built-in definition.</p> : (
        <ol className="space-y-3 text-sm">{d.history.map((h) => (
          <li key={h.version} className="rounded-lg border border-[#e3e7e7] p-3"><div className="flex flex-wrap items-center gap-2"><strong>Version {h.version}</strong><Status s={h.status} /><span className="text-xs text-[#5b6b7b]">Made by {h.madeByName} · {dt(h.madeAt)}</span></div>
            <p className="mt-1 text-[#3b4a5c]">{h.reason}</p>
            {h.decidedByName && <p className="mt-1 text-xs text-[#5b6b7b]">{h.status === 'rejected' ? 'Turned down' : 'Approved'} by {h.decidedByName}{h.soleAdmin ? ' (the school\'s only administrator)' : ''} · {dt(h.decidedAt)}{h.decisionNote ? ` · ${h.decisionNote}` : ''}</p>}</li>))}</ol>)}
    </Modal>
  );
}

function NewCustom({ onClose, onDone }) {
  const cat = useGet('/analytics/definitions', {}); const [subjects, setSubjects] = useState([]);
  useEffect(() => { apiClient.get('/subjects', { params: { limit: 200 } }).then((r) => setSubjects(r.data.subjects || [])).catch(() => {}); }, []);
  const [v, setV] = useState({ baseKey: 'attendance.rate', name: '', grades: '', subjectId: '', reason: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const bases = (cat.data ? cat.data.measures : []).filter((m) => !m.custom && m.scope === 'class'); const learning = (v.baseKey || '').startsWith('learning.');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/analytics/definitions', { baseKey: v.baseKey, name: v.name, reason: v.reason, filters: { standards: v.grades.split(',').map((x) => x.trim()).filter(Boolean), subjectIds: learning && v.subjectId ? [v.subjectId] : [] } }); toast.success('Sent to the other administrators for approval.'); onDone(); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  return (
    <Modal title="New measure for some classes" onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        <p className="text-sm text-[#5b6b7b]">It counts exactly what its parent counts, for the grades or subject you choose. It cannot be seen by more people than its parent.</p>
        <Field label="Based on"><select className={inputCls} value={v.baseKey} onChange={(e) => setV({ ...v, baseKey: e.target.value })}>{bases.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select></Field>
        <Field label="Name"><input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required minLength={3} maxLength={80} placeholder="Grade 9 attendance" /></Field>
        <Field label="Grades" hint="Separate with commas, as written on the class, for example 7, 8"><input className={inputCls} value={v.grades} onChange={(e) => setV({ ...v, grades: e.target.value })} /></Field>
        {learning && <Field label="Subject (optional)"><select className={inputCls} value={v.subjectId} onChange={(e) => setV({ ...v, subjectId: e.target.value })}><option value="">Any subject</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>}
        <Field label="Why"><textarea className={inputCls} rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} required minLength={5} maxLength={300} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : 'Send for approval'}</button></div>
      </form>
    </Modal>
  );
}
