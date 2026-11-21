import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, inputCls, btnGhost, btnPrimary, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Tag, Change, addDays, today } from './anKit';

// ISO week label for a date, matching the server (2026-W07)
export const isoWeek = (d) => { const x = new Date(`${d}T00:00:00Z`); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(); const j = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((x - j) / 86400000 - 3 + ((j.getUTCDay() + 6) % 7)) / 7); return `${y}-W${String(w).padStart(2, '0')}`; };

// Teachers: an optional, private weekly log of where time goes. Administrators: averages of five or more teachers.
export default function Pulse({ acc, teacher }) { return teacher ? <Mine /> : <School />; }

function Mine() {
  const g = useGet('/analytics/pulse/me', {}); const d = g.data; const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ week: isoWeek(today()), category: 'marking', minutes: '', note: '' }); const [err, setErr] = useState('');
  const join = async () => { setBusy(true); try { await apiClient.post('/analytics/pulse/join'); toast.success('You have joined. You can leave at any time.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const leave = async (erase) => { if (!window.confirm(erase ? 'Leave and delete everything you entered? This cannot be undone.' : 'Leave the time pulse? Your entries stay, but are no longer counted in anything.')) return; setBusy(true); try { await apiClient.post('/analytics/pulse/leave', { erase }); toast.success(erase ? 'Left, and your entries are deleted.' : 'You have left.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  const save = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { await apiClient.put('/analytics/pulse/entry', { ...f, minutes: Number(f.minutes) }); toast.success('Saved.'); setF({ ...f, minutes: '', note: '' }); g.reload(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  const weeks = Array.from({ length: 26 }, (_, i) => isoWeek(addDays(today(), -7 * i))).filter((w, i, a) => a.indexOf(w) === i);
  return (
    <Loading g={g}>{d && (
      <div className="space-y-4">
        <Note tone="info">{d.about}</Note>
        {!d.optedIn ? <Card><h3 className="text-sm font-bold text-[#1b2837]">Join the time pulse</h3><p className="mt-1 text-sm text-[#3b4a5c]">Tell the school roughly how many minutes a week go on each kind of work, so the school can see where forms and paperwork cost teachers the most. Nobody can see your own numbers, and nothing is shown until at least {d.minPeople} teachers have joined.</p><div className="mt-3"><button className={btnPrimary} disabled={busy} onClick={join}>Join, it is optional</button></div></Card> : (
          <>
            <Card>
              <form onSubmit={save} className="grid gap-3 sm:grid-cols-4"><h3 className="text-sm font-bold text-[#1b2837] sm:col-span-4">Add minutes for a week</h3>
                <Field label="Week"><select className={inputCls} value={f.week} onChange={(e) => setF({ ...f, week: e.target.value })}>{weeks.map((w) => <option key={w} value={w}>{w}{w === d.thisWeek ? ' (this week)' : ''}</option>)}</select></Field>
                <Field label="Kind of work"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{d.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
                <Field label="Minutes that week"><input type="number" min={0} max={3000} className={inputCls} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} required /></Field>
                <Field label="Note for yourself (optional)"><input className={inputCls} value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
                {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-4">{err}</p>}
                <div className="sm:col-span-4"><button className={btnPrimary} disabled={busy}>Save</button></div></form>
            </Card>
            {d.schoolAvg && <Card><h3 className="text-sm font-bold text-[#1b2837]">What teachers say, on average</h3><ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{d.schoolAvg.map((s) => <li key={s.key} className="flex justify-between gap-2"><span>{s.label}</span><span className="tabular-nums" dir="ltr">{s.avgMinutes === null ? 'Not enough teachers yet' : `${s.avgMinutes} min a week`}</span></li>)}</ul></Card>}
            <section aria-labelledby="mine-h" className="space-y-2"><h3 id="mine-h" className="text-sm font-bold text-[#1b2837]">Your entries (only you can see these)</h3>
              {d.entries.length === 0 ? <Note tone="info">Nothing entered yet.</Note> : <Table label="Your entries" head={['Week', 'Kind of work', 'Minutes', 'Note']} min={480}>{d.entries.map((e) => <tr key={`${e.week}${e.category}`}><Td dir="ltr">{e.week}</Td><Td>{(d.categories.find((c) => c.key === e.category) || {}).label || e.category}</Td><Td dir="ltr">{e.minutes}</Td><Td className="text-xs">{e.note}</Td></tr>)}</Table>}</section>
            <div className="flex flex-wrap gap-2"><button className={btnGhost} disabled={busy} onClick={() => leave(false)}>Leave the time pulse</button><button className={btnGhost} disabled={busy} onClick={() => leave(true)}>Leave and delete my entries</button></div>
          </>)}
      </div>)}</Loading>
  );
}

function School() {
  const [p, setP] = useState({ from: addDays(today(), -57), to: today() }); const g = useGet('/analytics/pulse/report', { from: p.from, to: p.to }); const d = g.data;
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="From"><input type="date" className={inputCls} value={p.from} max={p.to} onChange={(e) => e.target.value && setP({ ...p, from: e.target.value })} /></Field><Field label="To"><input type="date" className={inputCls} value={p.to} min={p.from} max={today()} onChange={(e) => e.target.value && setP({ ...p, to: e.target.value })} /></Field></div></Card>
      <Loading g={g}>{d && (
        <>
          <Note tone="info">{d.note}</Note>
          {d.optedInNote ? <Note tone="warn">{d.optedInNote}</Note> : <p className="text-sm text-[#3b4a5c]">{d.optedIn} teachers have joined.</p>}
          <Table label="Teacher time by kind of work" head={['Kind of work', 'Teachers', 'Average minutes a week', 'Against the period before']} min={560}>
            {d.categories.map((c) => <tr key={c.key}><Td className="font-medium">{c.label}</Td><Td>{c.suppressed ? <Tag>Hidden</Tag> : c.people}</Td><Td dir="ltr">{c.suppressed ? 'Fewer than five teachers' : c.avgMinutes}</Td><Td>{c.suppressed || c.change === null ? '—' : <Change v={c.change} good="down" />}</Td></tr>)}
          </Table></>)}</Loading>
    </div>
  );
}
