import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Pill, EmptyState, btnGhost, btnPrimary } from '../ui';
import { Sub } from '../attendance/deskKit';
import { Reason } from '../safety/safetyKit';
import { useGet, call, fmtDay, todayLocal } from './planKit';
import { SwapList, NewSwap } from './TimetablePlanning';

const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const STATE = { normal: ['None', ''], covered: ['Approved', 'Covered'], 'cover-needed': ['Pending', 'Cover being arranged'], cover: ['Active', 'You are covering'] };

const MyWeek = ({ meId }) => {
  const [from, setFrom] = useState(todayLocal()); const w = useGet('/timetable-ops/mine', { from }); const [back, setBack] = useState(null);
  if (w.loading && !w.data) return <div className="skeleton h-40" />;
  if (!w.data) return <EmptyState title={w.error} />;
  const d = w.data; const wl = d.workload;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} onClick={() => setFrom(addDays(d.from, -7))}>Earlier week</button><b className="text-sm">{fmtDay(d.from)} – {fmtDay(d.to)}</b><button className={btnGhost} onClick={() => setFrom(addDays(d.from, 7))}>Later week</button>{from !== todayLocal() && <button className={btnGhost} onClick={() => setFrom(todayLocal())}>This week</button>}</div>
      {wl && <Card><div className="text-sm"><b>{wl.weekPeriods}</b> periods a week · most in a day <b>{Math.max(0, ...Object.values(wl.days))}</b> · most in a row <b>{wl.maxInARow}</b>{wl.exceptions.length > 0 && <span className="ms-2">{wl.exceptions.map((e, i) => <Pill key={i} value="Pending">{e}</Pill>)}</span>}</div></Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {d.days.map((day) => (
          <Card key={day.date} className={day.date === todayLocal() ? 'ring-1 ring-[#2a5cac]' : ''}>
            <div className="mb-2 text-sm font-semibold">{fmtDay(day.date)}</div>
            {day.lessons.length === 0 ? <p className="text-sm text-[#5b6b7b]">No lessons.</p> : <ul className="space-y-2">{day.lessons.map((l, i) => (
              <li key={i} className="rounded-lg border border-[#e3e7e7] p-2 text-sm"><div className="flex items-start justify-between gap-2"><span className="font-semibold">{l.startTime}-{l.endTime}</span>{l.state !== 'normal' && <Pill value={STATE[l.state][0]}>{l.swap ? (l.state === 'covered' ? 'Swapped away' : 'Swapped in') : STATE[l.state][1]}</Pill>}</div>
                <div>{l.className} · {l.subjectName}</div><Sub>{l.room ? `${l.room} · ` : ''}{l.state === 'covered' && l.coverName ? `Taken by ${l.coverName}` : ''}{l.state === 'cover' ? `For ${l.forName}` : ''}</Sub>
                {l.state === 'cover' && !l.swap && <div className="mt-2 flex gap-2">{l.response === 'Accepted' ? <span className="text-xs text-[#1f5d52]">You confirmed</span> : <button className={`${btnPrimary} !px-3 !py-1 !text-xs`} onClick={() => call(() => apiClient.post(`/timetable-ops/cover/${l.coverId}/respond`, { response: 'Accepted' }), 'Confirmed', w.reload)}>Confirm</button>}<button className={`${btnGhost} !px-3 !py-1 !text-xs`} onClick={() => setBack(l)}>I cannot take it</button></div>}
              </li>))}</ul>}
          </Card>))}
      </div>
      {back && <Reason title="Hand this lesson back" label="Why can you not take it?" cta="Hand back" danger onClose={() => setBack(null)} onSubmit={async (note) => { await call(() => apiClient.post(`/timetable-ops/cover/${back.coverId}/respond`, { response: 'Declined', note }), 'Handed back. The office is told.', w.reload); setBack(null); }} />}
    </div>
  );
};

const Swaps = ({ meId }) => {
  const col = useGet('/timetable-ops/colleagues'); const [nw, setNw] = useState(false); const [k, setK] = useState(0);
  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] p-3"><button className={btnPrimary} onClick={() => setNw(true)}>Ask a colleague to swap</button><span className="text-sm text-[#5b6b7b]">Both of you must agree and an administrator approves.</span></div>
      <SwapList key={k} meId={meId} />
      {nw && <NewSwap myId={meId} colleagues={col.data?.teachers || []} onClose={() => setNw(false)} onDone={() => setK((x) => x + 1)} />}
    </Card>
  );
};

const TeacherTimetableDesk = ({ meId }) => {
  const [tab, setTab] = useState('week'); const TABS = [['week', 'My week'], ['swaps', 'Lesson swaps']];
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {tab === 'week' ? <MyWeek meId={meId} /> : <Swaps meId={meId} />}
    </div>
  );
};
export default TeacherTimetableDesk;
