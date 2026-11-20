import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Field, btnPrimary, btnGhost, inputCls } from '../ui';
import { call, useGet, Loading, Note } from './commsKit';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

// My own language, quiet hours and phone alerts. Everyone who uses Messages sees this.
export function Preferences() {
  const g = useGet('/comms/prefs'); const [p, setP] = useState(null); const d = g.data; const v = p || d?.prefs; const sch = d?.school;
  return (
    <Loading g={g}>{v && (
      <Card className="grid max-w-xl gap-4">
        <Field label="Language for alerts and messages from the school" hint="Messages are shown in this language when the sender wrote both."><select className={inputCls} value={v.lang} onChange={(e) => setP({ ...v, lang: e.target.value })}><option value="en">English</option><option value="ur">اردو (Urdu)</option></select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.push} onChange={(e) => setP({ ...v, push: e.target.checked })} />Send alerts to my phone. You still see everything in the app.</label>
        <div className="grid gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.quietOn} onChange={(e) => setP({ ...v, quietOn: e.target.checked })} />Hold phone alerts during my own quiet hours</label>
          {v.quietOn && <div className="flex flex-wrap gap-3"><Field label="From"><input type="time" className={inputCls} value={v.quietFrom} onChange={(e) => setP({ ...v, quietFrom: e.target.value })} /></Field><Field label="Until"><input type="time" className={inputCls} value={v.quietTo} onChange={(e) => setP({ ...v, quietTo: e.target.value })} /></Field></div>}
          {sch?.quiet?.on && <p className="text-xs text-[#5b6b7b]">The school also holds non-urgent alerts from {sch.quiet.from} to {sch.quiet.to}. Safety alerts and urgent messages from the school always come through.</p>}</div>
        <div className="flex justify-end gap-2">{p && <button className={btnGhost} onClick={() => setP(null)}>Undo</button>}<button className={btnPrimary} disabled={!p} onClick={() => call(() => apiClient.put('/comms/prefs', p), 'Saved', async () => { setP(null); await g.reload(); })}>Save</button></div>
      </Card>)}</Loading>
  );
}

const Min = ({ label, value, onChange, hint }) => <Field label={label} hint={hint}><input type="number" min="15" className={inputCls} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>;

// School-wide rules: quiet hours, working time for deadlines, help desk deadlines and meeting defaults.
export default function CommsSettings() {
  const g = useGet('/comms/settings'); const [s, setS] = useState(null); const v = s || g.data?.settings; const set = (patch) => setS({ ...v, ...patch });
  const save = () => call(() => apiClient.put('/comms/settings', { quiet: v.quiet, urgentBypass: v.urgentBypass, workDays: v.workDays, hours: v.hours, sla: v.sla, threadReplyMinutes: v.threadReplyMinutes, autoCloseDays: v.autoCloseDays, reopenDays: v.reopenDays, ptm: v.ptm }), 'Settings saved', async () => { setS(null); await g.reload(); });
  return (
    <Loading g={g}>{v && (
      <div className="grid max-w-3xl gap-4">
        <Card className="grid gap-3"><h3 className="font-bold">Quiet hours</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.quiet.on} onChange={(e) => set({ quiet: { ...v.quiet, on: e.target.checked } })} />Hold non-urgent phone alerts overnight</label>
          {v.quiet.on && <div className="flex flex-wrap gap-3"><Field label="From"><input type="time" className={inputCls} value={v.quiet.from} onChange={(e) => set({ quiet: { ...v.quiet, from: e.target.value } })} /></Field><Field label="Until"><input type="time" className={inputCls} value={v.quiet.to} onChange={(e) => set({ quiet: { ...v.quiet, to: e.target.value } })} /></Field></div>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.urgentBypass} onChange={(e) => set({ urgentBypass: e.target.checked })} />Let urgent messages from an administrator through in quiet hours</label>
          <Note>Safety alerts are never held. Everything is still in the app straight away; only the phone alert waits.</Note></Card>
        <Card className="grid gap-3"><h3 className="font-bold">Working time</h3><p className="text-sm text-[#5b6b7b]">Reply and resolution deadlines count only working time, so a message sent on Friday evening is not late on Saturday morning.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">{DAYS.map(([n, w]) => <label key={n} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${v.workDays.includes(n) ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7]'}`}><input type="checkbox" className="sr-only" checked={v.workDays.includes(n)} onChange={() => set({ workDays: v.workDays.includes(n) ? v.workDays.filter((x) => x !== n) : [...v.workDays, n].sort() })} />{w}</label>)}</div>
          <div className="flex flex-wrap gap-3"><Field label="Opens"><input type="time" className={inputCls} value={v.hours.from} onChange={(e) => set({ hours: { ...v.hours, from: e.target.value } })} /></Field><Field label="Closes"><input type="time" className={inputCls} value={v.hours.to} onChange={(e) => set({ hours: { ...v.hours, to: e.target.value } })} /></Field></div>
          <Min label="Reply to a family message within (working minutes)" value={v.threadReplyMinutes} onChange={(n) => set({ threadReplyMinutes: n })} hint="After this a conversation shows as late." /></Card>
        <Card className="grid gap-3"><h3 className="font-bold">Help desk deadlines (working minutes)</h3>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-[#5b6b7b]"><th className="py-1">Priority</th><th>First reply</th><th>Resolve</th></tr></thead><tbody>{[['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']].map(([k, w]) => <tr key={k} className="border-t border-[#e3e7e7]"><td className="py-2 font-semibold">{w}</td><td className="pe-2"><input aria-label={`${w} first reply`} type="number" min="15" className={`${inputCls} w-28`} value={v.sla[k].first} onChange={(e) => set({ sla: { ...v.sla, [k]: { ...v.sla[k], first: Number(e.target.value) } } })} /></td><td><input aria-label={`${w} resolve`} type="number" min="15" className={`${inputCls} w-28`} value={v.sla[k].resolve} onChange={(e) => set({ sla: { ...v.sla, [k]: { ...v.sla[k], resolve: Number(e.target.value) } } })} /></td></tr>)}</tbody></table></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Close a resolved request after (days)"><input type="number" min="1" max="60" className={inputCls} value={v.autoCloseDays} onChange={(e) => set({ autoCloseDays: Number(e.target.value) })} /></Field><Field label="Family can reopen for (days)"><input type="number" min="1" max="90" className={inputCls} value={v.reopenDays} onChange={(e) => set({ reopenDays: Number(e.target.value) })} /></Field></div></Card>
        <Card className="grid gap-3"><h3 className="font-bold">Meeting days</h3><div className="grid grid-cols-3 gap-3"><Field label="Minutes per meeting"><input type="number" min="5" max="30" className={inputCls} value={v.ptm.slotMinutes} onChange={(e) => set({ ptm: { ...v.ptm, slotMinutes: Number(e.target.value) } })} /></Field><Field label="Families can cancel until (hours before)"><input type="number" min="0" className={inputCls} value={v.ptm.cancelHoursBefore} onChange={(e) => set({ ptm: { ...v.ptm, cancelHoursBefore: Number(e.target.value) } })} /></Field><Field label="Most meetings per family"><input type="number" min="1" max="20" className={inputCls} value={v.ptm.maxPerFamily} onChange={(e) => set({ ptm: { ...v.ptm, maxPerFamily: Number(e.target.value) } })} /></Field></div></Card>
        <div className="flex justify-end gap-2">{s && <button className={btnGhost} onClick={() => setS(null)}>Undo changes</button>}<button className={btnPrimary} disabled={!s} onClick={save}>Save settings</button></div>
      </div>)}</Loading>
  );
}
