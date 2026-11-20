import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Field, inputCls } from '../ui';
export { useGet, call } from '../timetable/planKit';
export { Tabs, Loading, Note } from '../early/earlyKit';

export const when = (d) => (d ? `⁦${new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}⁩` : '');
export const day = (d) => (d ? `⁦${new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? 'UTC' : undefined })}⁩` : '—');
export const dtLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const CATS = [['learning', 'Learning'], ['behaviour', 'Behaviour'], ['wellbeing', 'Wellbeing'], ['attendance', 'Attendance'], ['health', 'Health'], ['family', 'Family'], ['bullying', 'Bullying'], ['safeguarding', 'Safeguarding'], ['other', 'Other']];
export const CAT_WORD = Object.fromEntries(CATS);
export const LEVELS = [['watch', 'Keep an eye on'], ['support', 'Support'], ['intensive', 'Intensive support']];
export const LEVEL_WORD = Object.fromEntries(LEVELS);
export const LEVEL_TONE = { watch: 'None', support: 'Approved', intensive: 'Suspended' };
export const CASE_TONE = { Open: 'Pending', Active: 'Approved', Review: 'Pending', Closed: 'None' };
export const SEV_TONE = { mild: 'None', moderate: 'Pending', severe: 'Suspended' };
export const ADJ = [['extra-time', 'Extra time in exams'], ['reader', 'A reader'], ['separate-room', 'A separate room'], ['assistive-tech', 'Assistive technology'], ['seating', 'Seating'], ['breaks', 'Breaks'], ['modified-work', 'Changed work'], ['other', 'Something else']];
export const ADJ_WORD = Object.fromEntries(ADJ);
export const APPT_WORD = { counselling: 'Support session', nurse: 'Sick bay', mentor: 'Mentor', 'parent-meeting': 'Meeting with school' };
export const APPT_TONE = { Requested: 'Pending', Booked: 'Approved', Done: 'Active', Missed: 'Suspended', Cancelled: 'None' };
export const COURSE_WORD = { safeguarding: 'Safeguarding', 'first-aid': 'First aid', 'anti-bullying': 'Anti-bullying', 'special-needs': 'Special needs', 'mental-health': 'Mental health' };

export const errText = (e, f = 'Something went wrong') => e?.response?.data?.message || f;

// Find a child by name. Staff only see the children they may reach.
export function StudentPicker({ label = 'Student', value, onPick, autoFocus }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const t = setTimeout(() => { apiClient.get('/care/students', { params: { q } }).then((r) => setRows(r.data.students || [])).catch(() => setRows([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return <div className="flex items-center gap-2 rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate"><b>{value.name}</b>{value.className ? ` · ${value.className}` : ''}</span><button type="button" className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => onPick(null)}>Change</button></div>;
  return (
    <div className="relative">
      <Field label={label} hint="Type at least two letters of the name"><input autoFocus={autoFocus} className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" /></Field>
      {rows.length > 0 && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#e3e7e7] bg-white shadow-lg" role="listbox">{rows.map((s) => <li key={s._id}><button type="button" className="w-full px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]" onClick={() => { onPick(s); setQ(''); setRows([]); }}>{s.name}<span className="text-xs text-[#5b6b7b]"> · {s.className || 'no class'} · {s.studentId || ''}</span></button></li>)}</ul>}
    </div>
  );
}
export const StaffSelect = ({ staff, value, onChange, label = 'Staff member', empty = 'Nobody yet' }) => (
  <Field label={label}><select className={inputCls} value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">{empty}</option>{(staff || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.model === 'User' ? ' (administrator)' : ''}</option>)}</select></Field>
);
