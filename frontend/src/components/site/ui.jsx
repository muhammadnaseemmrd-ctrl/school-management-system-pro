import React from 'react';

export const Eyebrow = ({ children, light = false }) => (
  <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: light ? '#f0a58c' : '#8a4636' }}>{children}</p>
);

export const SectionHead = ({ eyebrow, title, text, center = false, light = false }) => (
  <div className={`reveal max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
    <Eyebrow light={light}>{eyebrow}</Eyebrow>
    <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl" style={{ color: light ? '#fff' : '#1b2837' }}>{title}</h2>
    {text && <p className="mt-4 text-lg leading-8" style={{ color: light ? '#c9d6ea' : '#3b4a5c' }}>{text}</p>}
  </div>
);

// Arrow-key movement for a row or column of tabs (roving focus).
export function tabKeys(e, count, current, set) {
  const k = e.key;
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(k)) return;
  e.preventDefault();
  const group = e.currentTarget.dataset.group;
  let n = current;
  if (k === 'Home') n = 0; else if (k === 'End') n = count - 1;
  else if (k === 'ArrowRight' || k === 'ArrowDown') n = (current + 1) % count;
  else n = (current - 1 + count) % count;
  set(n);
  requestAnimationFrame(() => document.getElementById(group + '-tab-' + n)?.focus());
}
