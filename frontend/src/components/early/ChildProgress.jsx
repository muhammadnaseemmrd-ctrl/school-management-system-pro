import React, { useState } from 'react';
import { Pill, btnGhost, btnPrimary, inputCls } from '../ui';
import apiClient from '../../utils/apiClient';
import { call, useGet, Loading, Note, LEVELS } from './earlyKit';

const LEVEL_TONE = { Exploring: 'Pending', Practising: 'Approved', Confident: 'Active' };
function Item({ childId, it, onChanged }) {
  const [open, setOpen] = useState(false); const [level, setLevel] = useState('Exploring'); const [note, setNote] = useState(''); const [why, setWhy] = useState('');
  const save = () => call(() => apiClient.post('/early/observations', { childId, itemKey: it.key, level, note }), 'Saved', () => { setOpen(false); setNote(''); onChanged(); });
  const remove = () => call(() => apiClient.post(`/early/observations/${it.observationId}/void`, { reason: why }), 'Removed', () => { setOpen(false); setWhy(''); onChanged(); });
  return (
    <li className="border-t border-[#e3e7e7] py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><div className="text-sm font-semibold text-[#1b2837]">{it.label}</div><div className="text-xs text-[#5b6b7b]">Typical around {it.fromMonths}–{it.toMonths} months{it.window === 'now' ? ' · in this child\'s range' : ''}</div></div>
        {it.seen ? <Pill value={LEVEL_TONE[it.level]}>{it.level}</Pill> : <span className="text-xs text-[#5b6b7b]">Not seen yet</span>}
        <button className={btnGhost} aria-expanded={open} onClick={() => setOpen(!open)}>{it.seen ? 'Update' : 'I saw this'}</button>
      </div>
      {it.seen && it.note && <div className="mt-1 text-xs text-[#3b4a5c]">“{it.note}”</div>}
      {!it.seen && it.ideas.length > 0 && <div className="mt-1 text-xs text-[#5b6b7b]">Ideas to try: {it.ideas.map((i) => i.title).join(' · ')}</div>}
      {open && (
        <div className="mt-2 grid gap-2 rounded-xl bg-[#f7f6f2] p-3">
          <div role="radiogroup" aria-label="How far along" className="flex gap-1.5">{LEVELS.map(([k, v]) => <button key={k} role="radio" aria-checked={level === k} onClick={() => setLevel(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${level === k ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white'}`}>{v}</button>)}</div>
          <input className={inputCls} placeholder="What did you see or hear?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What did you see or hear" />
          <div className="flex flex-wrap items-center gap-2"><button className={btnPrimary} onClick={save}>Save</button>
            {it.seen && <><input className={`${inputCls} max-w-[14rem]`} placeholder="Why remove the last one?" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Reason for removing" /><button className={btnGhost} disabled={why.trim().length < 3} onClick={remove}>Remove last observation</button></>}</div>
        </div>)}
    </li>
  );
}

// Milestones for one child, in words. There are no scores, points or rankings anywhere.
export default function ChildProgress({ childId }) {
  const g = useGet(`/early/children/${childId}/progress`); const d = g.data;
  return (
    <Loading g={g}>{d && (
      <div className="grid gap-4">
        <Note>{d.note} Framework: {d.framework.name}.</Note>
        {d.areas.map((a) => (
          <section key={a.key} aria-label={a.label}><h4 className="mb-1 text-sm font-bold text-[#1b2837]">{a.label}</h4><ul className="rounded-xl border border-[#e3e7e7] bg-white px-3">{a.items.map((it) => <Item key={it.key} childId={childId} it={it} onChanged={g.reload} />)}</ul></section>))}
      </div>)}</Loading>
  );
}
