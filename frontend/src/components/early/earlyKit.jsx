import React from 'react';
import { Pill } from '../ui';
export { useGet, call } from '../timetable/planKit';

export const hm = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export const TYPES = [['meal', 'Meal'], ['drink', 'Drink'], ['nap', 'Nap'], ['toilet', 'Toilet'], ['mood', 'Mood'], ['health', 'Health'], ['medication', 'Medicine'], ['activity', 'Activity'], ['observation', 'Observation'], ['behavior', 'Behaviour'], ['note', 'Note']];
export const TYPE_LABEL = Object.fromEntries(TYPES);
export const STATUS_TONE = { In: 'Approved', Out: 'None', Absent: 'Suspended', Expected: 'Pending' };
export const STATUS_WORD = { In: 'Here', Out: 'Collected', Absent: 'Absent', Expected: 'Expected' };
export const POST_TONE = { Draft: 'None', Review: 'Pending', Published: 'Active', Withheld: 'Suspended', Retracted: 'Suspended' };
export const POST_WORD = { Draft: 'Draft', Review: 'Waiting for review', Published: 'Shared with family', Withheld: 'Sent back', Retracted: 'Withdrawn' };
export const LEVELS = [['Exploring', 'Exploring'], ['Practising', 'Practising'], ['Confident', 'Confident']];
export const SEV_TONE = { severe: 'Suspended', moderate: 'Pending', mild: 'None' };

// one care entry as a short sentence
export function entryText(e) {
  const d = e.data || {};
  switch (e.careType) {
    case 'meal': return [d.course, d.item, d.amount && `ate ${d.amount === 'none' ? 'none' : d.amount}`].filter(Boolean).join(' · ');
    case 'drink': return `${d.item || 'Drink'}${d.ml ? ` ${d.ml} ml` : ''}`;
    case 'nap': return `Slept ${d.start || '?'}–${d.end || '?'}${d.minutes ? ` (${d.minutes} min)` : ''}`;
    case 'toilet': return `Toilet: ${d.kind || ''}`;
    case 'mood': return `Mood: ${d.value || ''}`;
    case 'health': return `${e.text || ''}${d.temperatureC ? ` · ${d.temperatureC} °C` : ''}`;
    case 'medication': return `${d.name} ${d.dose} (family permission held)`;
    case 'activity': return d.title || e.text;
    default: return e.text || '';
  }
}

// A small, plain tab bar. Every desk uses it so keyboard and screen-reader behaviour is the same.
export const Tabs = ({ label, value, onChange, items }) => (
  <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
    {items.map(([k, v, badge]) => (
      <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${value === k ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white text-[#1b2837] hover:bg-[#f7f6f2]'}`}>
        {v}{badge ? <span className={`ms-2 rounded-full px-1.5 text-[11px] ${value === k ? 'bg-white/25' : 'bg-[#fbf0ec] text-[#8a4636]'}`}>{badge}</span> : null}
      </button>
    ))}
  </div>
);

export const Loading = ({ g, children }) => (g.loading ? <div className="p-6 text-sm text-[#5b6b7b]" role="status">Loading…</div> : g.error ? <div className="p-6 text-sm text-[#9f1239]" role="alert">{g.error}</div> : children);
export const Note = ({ tone = 'info', children }) => (
  <div role={tone === 'warn' ? 'alert' : 'note'} className={`rounded-xl border px-4 py-3 text-sm ${tone === 'warn' ? 'border-[#e3b4ac] bg-[#fff1f2] text-[#9f1239]' : tone === 'ok' ? 'border-[#bfd8d2] bg-[#edf5f3] text-[#215a52]' : 'border-[#e3e7e7] bg-[#f7f6f2] text-[#3b4a5c]'}`}>{children}</div>
);
export const StatusPill = ({ s }) => <Pill value={STATUS_TONE[s] || 'None'}>{STATUS_WORD[s] || s}</Pill>;
// a JPEG, scaled so its longest side is at most 1280 px, as a data URL under the school's photo limit
export function shrinkImage(file, maxKb = 600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      let side = 1280; const tryOnce = (q) => { const k = Math.min(1, side / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
      let out = tryOnce(0.82); while (out.length * 0.75 > maxKb * 1024 && side > 400) { side = Math.round(side * 0.8); out = tryOnce(0.7); }
      URL.revokeObjectURL(url); if (out.length * 0.75 > maxKb * 1024) reject(new Error('That photo is too big even after shrinking.')); else resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture we can read.')); }; img.src = url;
  });
}

// Pictures sit behind sign-in, so they are fetched with the token and shown from a temporary local address.
import apiClient from '../../utils/apiClient';
export function AuthImg({ src, alt, className = '' }) {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    let dead = false; let made = '';
    apiClient.get(src, { responseType: 'blob' }).then((r) => { if (!dead) { made = URL.createObjectURL(r.data); setUrl(made); } }).catch(() => {});
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [src]);
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`flex items-center justify-center bg-[#f1f2f2] text-xs text-[#5b6b7b] ${className}`} role="img" aria-label={alt}>…</div>;
}
