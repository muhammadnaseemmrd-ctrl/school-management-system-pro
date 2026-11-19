import React from 'react';
import { parse, speak } from './notation';

export const KIND_LABEL = { mcq: 'Multiple choice', multi: 'Several correct answers', tf: 'True or false', short: 'Short answer', essay: 'Essay or open answer', match: 'Matching', order: 'Put in order', numeric: 'Number' };
export const STATE_TONE = { Draft: 'None', Review: 'Pending', Published: 'Active', Closed: 'Approved', Archived: 'None', Active: 'Active', Retired: 'None', Requested: 'Pending', InReview: 'Pending', Upheld: 'Approved', Rejected: 'Suspended', Revised: 'Approved', Declined: 'Suspended', Revoked: 'None', Graded: 'Approved', Marking: 'Pending', Submitted: 'Pending', InProgress: 'Active', Voided: 'Suspended', Held: 'None', Scheduled: 'Pending', Released: 'Active' };

// Maths and chemistry typed as plain text (x^2, H_2O, \frac{a}{b}) drawn properly, with a spoken form for screen readers
function Tokens({ tokens }) {
  return tokens.map((k, i) => {
    if (k.t === 'text') return <React.Fragment key={i}>{k.v}</React.Fragment>;
    if (k.t === 'sym') return <React.Fragment key={i}>{k.v}</React.Fragment>;
    if (k.t === 'sup') return <sup key={i}><Tokens tokens={k.v} /></sup>;
    if (k.t === 'sub') return <sub key={i}><Tokens tokens={k.v} /></sub>;
    if (k.t === 'frac') return <span key={i} className="mx-0.5 inline-flex flex-col items-center align-middle text-[0.9em] leading-tight"><span className="border-b border-current px-1"><Tokens tokens={k.n} /></span><span className="px-1"><Tokens tokens={k.d} /></span></span>;
    if (k.t === 'sqrt') return <span key={i}>√<span className="border-t border-current"><Tokens tokens={k.v} /></span></span>;
    return null;
  });
}
export const Rich = ({ text, className = '' }) => { const s = String(text || ''); const spoken = /[\^_]|\\[a-zA-Z]+/.test(s) ? speak(s) : undefined; return <span className={`whitespace-pre-wrap ${className}`} {...(spoken ? { role: 'math', 'aria-label': spoken } : {})}><span aria-hidden={spoken ? 'true' : undefined}><Tokens tokens={parse(s)} /></span></span>; };

export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const clock = (sec) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : '');
export const newId = () => Math.random().toString(16).slice(2, 10);
