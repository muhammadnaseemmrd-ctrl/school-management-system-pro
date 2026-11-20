import React from 'react';
import { Pill } from '../ui';
export { useGet, call } from '../timetable/planKit';
export { Tabs, Loading, Note } from '../early/earlyKit';

// Date and time shown in the viewer's own clock. Wrapped in an LTR isolate so it reads correctly inside Urdu text.
export const when = (d) => (d ? `⁦${new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}⁩` : '');
export const dayOf = (d) => (d ? `⁦${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}⁩` : '');
export const timeOf = (d) => (d ? `⁦${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}⁩` : '');
export const mins = (m) => (m == null ? '—' : m < 90 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m / 144) / 10} days`);

export const CATS = [['fees', 'Fees'], ['academics', 'Academics'], ['attendance', 'Attendance'], ['transport', 'Transport'], ['documents', 'Documents'], ['admission', 'Admission'], ['health', 'Health'], ['complaint', 'Complaint'], ['safety', 'Safety concern'], ['other', 'Something else']];
export const CAT_WORD = Object.fromEntries(CATS);
export const PRIORITIES = [['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']];
export const TICKET_TONE = { Open: 'Pending', 'In progress': 'Approved', 'Waiting on family': 'Pending', Resolved: 'Active', Closed: 'None' };
export const TICKET_WORD = { Open: 'Open', 'In progress': 'In progress', 'Waiting on family': 'Waiting on family', Resolved: 'Resolved', Closed: 'Closed' };
export const PRI_TONE = { normal: 'None', high: 'Pending', urgent: 'Suspended' };
export const SLOT_WORD = { Free: 'Free', Booked: 'Booked', Blocked: 'Blocked', Done: 'Done', NoShow: 'Did not come', Cancelled: 'Cancelled' };
export const SLOT_TONE = { Free: 'Free', Booked: 'Approved', Blocked: 'None', Done: 'Active', NoShow: 'Suspended', Cancelled: 'None' };
export const PTM_TONE = { Draft: 'None', Open: 'Active', Closed: 'None', Cancelled: 'Suspended' };
export const PTM_WORD = { Draft: 'Draft', Open: 'Booking open', Closed: 'Closed', Cancelled: 'Cancelled' };

// Deadline state, always as a word as well as a colour.
export function SlaBadge({ sla, school = true }) {
  if (!sla) return null;
  const m = { ok: ['Approved', 'On time'], met: ['Active', 'Deadlines met'], missed: ['Suspended', 'Deadline missed'], paused: ['None', 'Waiting on family'], breached: ['Suspended', 'Past deadline'] }[sla.state] || ['None', sla.state];
  return <Pill value={m[0]}>{school || sla.state !== 'ok' ? m[1] : 'On track'}</Pill>;
}
export const Unread = ({ n }) => (n ? <span className="rounded-full bg-[#9f1239] px-1.5 text-[11px] font-bold text-white" aria-label={`${n} waiting`}>{n}</span> : null);
export const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2)}`);
