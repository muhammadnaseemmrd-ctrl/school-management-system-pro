import React, { useState } from 'react';
import { Card, Modal, Pill, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { call, useGet, Loading, Note, Tabs } from './earlyKit';
import ChildProgress from './ChildProgress';

function Coverage({ roomId, roster }) {
  const g = useGet(`/early/rooms/${roomId}/coverage`); const [child, setChild] = useState('');
  return (
    <div className="grid gap-3">
      <Note>For each milestone: how many children in the room are in the typical age range, and how many have been seen doing it. This shows where to look next. It never ranks a child.</Note>
      <Field label="Look at one child"><select className={`${inputCls} max-w-xs`} value={child} onChange={(e) => setChild(e.target.value)}><option value="">The whole room</option>{roster.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
      {child ? <ChildProgress childId={child} /> : (
        <Loading g={g}>{g.data && g.data.areas.map((a) => (
          <section key={a.key} aria-label={a.label}><h4 className="mb-1 text-sm font-bold">{a.label}</h4><ul className="rounded-xl border border-[#e3e7e7] bg-white px-3">{a.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center gap-2 border-t border-[#e3e7e7] py-2 first:border-t-0"><span className="min-w-[12rem] flex-1 text-sm">{i.label}</span><span className="text-xs text-[#5b6b7b]">{i.inWindow} in range</span><Pill value={i.seenCount ? 'Approved' : 'None'}>{i.seenCount} seen</Pill><div aria-hidden className="h-1.5 w-24 rounded-full bg-[#e3e7e7]"><div className="h-1.5 rounded-full bg-[#2a5cac]" style={{ width: `${Math.min(100, i.inWindow ? (i.seenCount / i.inWindow) * 100 : 0)}%` }} /></div></li>))}</ul></section>))}</Loading>)}
    </div>
  );
}

function FwForm({ fw, onClose, onDone }) {
  const [name, setName] = useState(fw.name); const [areas, setAreas] = useState(JSON.parse(JSON.stringify(fw.areas)));
  const area = (i, p) => setAreas(areas.map((a, j) => (j === i ? { ...a, ...p } : a))); const item = (i, k, p) => area(i, { items: areas[i].items.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const save = () => call(() => apiClient.put(`/early/frameworks/${fw._id}`, { name, areas }), 'Saved', onDone);
  return (
    <Modal title={`Edit: ${fw.name}`} onClose={onClose} wide><div className="grid gap-3"><Note>Write milestones in your own words. The age range is a typical window, not a target.</Note><Field label="Name of the framework"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {areas.map((a, i) => <fieldset key={a.key} className="rounded-xl border border-[#e3e7e7] p-3"><legend className="px-1"><input className={`${inputCls} w-56`} aria-label="Area name" value={a.label} onChange={(e) => area(i, { label: e.target.value })} /></legend>
        {a.items.map((it, k) => <div key={it.key} className="mb-2 grid gap-2 sm:grid-cols-[1fr_5rem_5rem_auto]"><input className={inputCls} aria-label="Milestone" value={it.label} onChange={(e) => item(i, k, { label: e.target.value })} /><input className={inputCls} type="number" aria-label="From months" value={it.fromMonths} onChange={(e) => item(i, k, { fromMonths: Number(e.target.value) })} /><input className={inputCls} type="number" aria-label="To months" value={it.toMonths} onChange={(e) => item(i, k, { toMonths: Number(e.target.value) })} /><button className={btnGhost} onClick={() => area(i, { items: a.items.filter((_, j) => j !== k) })}>Remove</button></div>)}
        <button className={btnGhost} onClick={() => area(i, { items: [...a.items, { key: `m${Date.now().toString(36)}`, label: '', labelUr: '', fromMonths: 24, toMonths: 48 }] })}>Add a milestone</button></fieldset>)}
      <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={save}>Save</button></div></div></Modal>
  );
}

function Frameworks({ isAdmin }) {
  const g = useGet('/early/frameworks', { full: 1 }); const [edit, setEdit] = useState(null);
  return (
    <Loading g={g}><div className="grid gap-3">{(g.data?.frameworks || []).map((f) => (
      <Card key={f._id}><div className="flex flex-wrap items-center gap-2"><b className="flex-1">{f.name}</b><Pill value={f.status === 'Published' ? 'Active' : 'Pending'}>{f.status}</Pill><span className="text-xs text-[#5b6b7b]">{f.items} milestones · version {f.version}</span></div><p className="mt-1 text-xs text-[#5b6b7b]">{f.license}</p>
        <div className="mt-2 flex flex-wrap gap-2"><button className={btnGhost} onClick={() => call(() => apiClient.post(`/early/frameworks/${f._id}/copy`, {}), 'Copied. Edit your copy, then publish it.', g.reload)}>Make our own copy</button>{f.status === 'Draft' && <button className={btnGhost} onClick={() => setEdit(f)}>Edit</button>}{f.status === 'Draft' && isAdmin && <button className={btnPrimary} onClick={() => call(() => apiClient.post(`/early/frameworks/${f._id}/publish`), 'Published', g.reload)}>Publish</button>}</div></Card>))}
      {edit && <FwForm fw={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); g.reload(); }} />}</div></Loading>
  );
}

export default function LearnDesk({ roomId, isAdmin }) {
  const [tab, setTab] = useState('coverage'); const room = useGet(`/early/rooms/${roomId}`);
  return <div className="grid gap-3"><Tabs label="Learning" value={tab} onChange={setTab} items={[['coverage', 'Milestones'], ['frameworks', 'Our frameworks']]} />{tab === 'coverage' && room.data && <Coverage roomId={roomId} roster={room.data.children} />}{tab === 'frameworks' && <Frameworks isAdmin={isAdmin} />}</div>;
}
