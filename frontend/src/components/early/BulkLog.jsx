import React, { useRef, useState } from 'react';
import { Modal, Field, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { TYPES, Note } from './earlyKit';

const nowHM = () => new Date().toTimeString().slice(0, 5);
const key = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
const sel = (opts) => opts.map((o) => <option key={o} value={o}>{o}</option>);

// One entry for many children at once. The key makes a repeat of the same send harmless.
export default function BulkLog({ roomId, roster, onClose, onDone }) {
  const [type, setType] = useState('meal'); const [d, setD] = useState({ course: 'lunch', amount: 'some', kind: 'wet', value: 'happy', item: '' }); const [text, setText] = useState(''); const [time, setTime] = useState(nowHM()); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null); const [err, setErr] = useState('');
  const ck = useRef(key()); const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const change = (t) => { setType(t); ck.current = key(); setErr(''); };
  const submit = async () => {
    setBusy(true); setErr('');
    const at = new Date(); const [h, m] = time.split(':').map(Number); at.setHours(h, m, 0, 0); if (at > new Date()) at.setDate(at.getDate() - 1);
    const data = { ...d }; if (type === 'drink' && d.ml) data.ml = Number(d.ml); if (type === 'health' && d.temperatureC) data.temperatureC = Number(d.temperatureC);
    try { const r = await apiClient.post('/early/care/bulk', { roomId, careType: type, childIds: roster.map((c) => c._id), data, text, at: at.toISOString(), clientKey: ck.current }); setRes(r.data); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  if (res) return (
    <Modal title="Recorded" onClose={onDone}>
      <div className="grid gap-3"><Note tone="ok">{res.recorded.length} {res.recorded.length === 1 ? 'entry' : 'entries'} saved{res.already ? `, ${res.already} already saved earlier` : ''}.</Note>
        {res.notes?.map((n) => <Note key={n}>{n}</Note>)}
        {res.skipped?.length > 0 && <Note tone="warn"><div className="font-semibold">Left out</div><ul className="list-disc ps-5">{res.skipped.map((s) => <li key={s.childId}>{s.name || 'A child'}: {s.why}</li>)}</ul></Note>}
        <div className="flex justify-end"><button className={btnPrimary} onClick={onDone}>Done</button></div></div>
    </Modal>);
  return (
    <Modal title={`Log for ${roster.length} ${roster.length === 1 ? 'child' : 'children'}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to record">{TYPES.map(([k, v]) => <button key={k} role="radio" aria-checked={type === k} onClick={() => change(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${type === k ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white'}`}>{v}</button>)}</div>
        <div className="text-xs text-[#5b6b7b]">{roster.map((c) => c.name).join(', ')}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Time"><input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          {type === 'meal' && <><Field label="Which meal"><select className={inputCls} value={d.course} onChange={set('course')}>{sel(['breakfast', 'snack', 'lunch', 'tea', 'other'])}</select></Field><Field label="What was served"><input className={inputCls} value={d.item} onChange={set('item')} /></Field><Field label="How much was eaten"><select className={inputCls} value={d.amount} onChange={set('amount')}>{sel(['none', 'some', 'half', 'most', 'all'])}</select></Field></>}
          {type === 'drink' && <><Field label="Drink"><input className={inputCls} value={d.item} onChange={set('item')} placeholder="Water" /></Field><Field label="Millilitres"><input className={inputCls} inputMode="numeric" value={d.ml || ''} onChange={set('ml')} /></Field></>}
          {type === 'nap' && <><Field label="Fell asleep"><input type="time" className={inputCls} value={d.start || ''} onChange={set('start')} /></Field><Field label="Woke up"><input type="time" className={inputCls} value={d.end || ''} onChange={set('end')} /></Field></>}
          {type === 'toilet' && <Field label="What happened"><select className={inputCls} value={d.kind} onChange={set('kind')}>{sel(['wet', 'soiled', 'dry', 'potty', 'accident'])}</select></Field>}
          {type === 'mood' && <Field label="Mood"><select className={inputCls} value={d.value} onChange={set('value')}>{sel(['happy', 'calm', 'excited', 'tired', 'clingy', 'upset', 'unwell'])}</select></Field>}
          {type === 'health' && <><Field label="Temperature °C (optional)"><input className={inputCls} inputMode="decimal" value={d.temperatureC || ''} onChange={set('temperatureC')} /></Field></>}
          {type === 'medication' && <><Field label="Medicine"><input className={inputCls} value={d.name || ''} onChange={set('name')} /></Field><Field label="Dose"><input className={inputCls} value={d.dose || ''} onChange={set('dose')} /></Field><Field label="Given by"><input className={inputCls} value={d.givenBy || ''} onChange={set('givenBy')} /></Field><label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" checked={!!d.permission} onChange={set('permission')} /> I hold written permission from the family</label></>}
          {type === 'activity' && <Field label="Activity"><input className={inputCls} value={d.title || ''} onChange={set('title')} /></Field>}
          {type === 'behavior' && <Field label="What helped"><input className={inputCls} value={d.whatHelped || ''} onChange={set('whatHelped')} /></Field>}
        </div>
        {['health', 'observation', 'behavior', 'note'].includes(type) && <Field label={type === 'behavior' ? 'What you saw (describe it, do not label the child)' : 'Words'} hint={type === 'behavior' ? 'A behaviour note reaches the family only after you have talked it over with them.' : ''}><textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
        {['meal', 'drink', 'nap', 'toilet', 'mood', 'activity'].includes(type) && <Field label="Extra words (optional)"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
        {err && <Note tone="warn">{err}</Note>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={submit}>Save for {roster.length}</button></div>
      </div>
    </Modal>
  );
}
