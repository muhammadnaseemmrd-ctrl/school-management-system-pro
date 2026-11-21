import React, { useEffect, useState } from 'react';
import { btnGhost } from '../ui';
export { Table, Td, Reason, saveBlob, download } from '../registrar/kit';
export { useGet, call, Tabs, Loading, Note } from '../early/earlyKit';
export { AskForm } from '../training/tkit';

export const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const key = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);

const TONE = { good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]' };
const MAP = {
  available: ['On the shelf', 'good'], on_loan: ['Out on loan', 'info'], reserved: ['Held for someone', 'warn'], lost: ['Lost', 'bad'], damaged: ['Damaged', 'warn'], repair: ['In repair', 'warn'], withdrawn: ['Withdrawn', 'none'],
  open: ['Open', 'info'], returned: ['Returned', 'good'], overdue: ['Overdue', 'bad'], waiting: ['Waiting', 'info'], ready: ['Ready to collect', 'good'], fulfilled: ['Collected', 'good'], cancelled: ['Cancelled', 'none'], expired: ['Expired', 'none'],
  paid: ['Paid', 'good'], waived: ['Waived', 'none'], void: ['Cancelled', 'none'], partly_refunded: ['Part refunded', 'warn'], refunded: ['Refunded', 'none'], reserved_order: ['Waiting for payment', 'warn'],
  requested: ['Waiting for a decision', 'warn'], approved: ['Approved', 'good'], rejected: ['Turned down', 'bad'], counting: ['Counting', 'info'], submitted: ['Waiting for approval', 'warn'],
  active: ['Active', 'good'], blocked: ['Blocked', 'bad'], closed: ['Closed', 'none'], add: ['New', 'good'], conflict: ['Differs from the catalogue', 'warn'], same: ['Already there', 'none'], duplicate: ['Repeated in file', 'bad'], problem: ['Problem', 'bad'],
  textbook: ['Textbook', 'info'], loan: ['Loan', 'none'],
};
export const LBadge = ({ s, label, tone }) => { const m = MAP[s] || [s, 'none']; return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[tone || m[1]]}`}>{label || m[0]}</span>; };

export const useDebounced = (v, ms = 300) => { const [x, setX] = useState(v); useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]); return x; };

export const PageBar = ({ page, total, limit, onPage }) => {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 25))); if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-1 py-2 text-xs text-[#3b4a5c]"><span>{total} in all</span>
      <span className="flex items-center gap-2"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span className="font-semibold">{page} of {pages}</span><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></span>
    </div>
  );
};

// Prints a small HTML page through a hidden frame, so a receipt or slip prints on its own and nothing else on screen.
export function printHtml(html) {
  const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  const d = f.contentWindow.document; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>body{font:12px/1.4 sans-serif;margin:12px;color:#000}table{width:100%;border-collapse:collapse}td,th{padding:2px 0;text-align:left}td.r,th.r{text-align:right}h1{font-size:14px;margin:0 0 4px}hr{border:0;border-top:1px dashed #000}</style></head><body>${html}</body></html>`); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* the browser blocked printing */ } setTimeout(() => f.remove(), 1500); }, 150);
}
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A small CSV reader for the catalogue import: quotes, doubled quotes, commas and line breaks inside quotes.
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false; const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => String(x).trim() !== '')); if (clean.length < 2) return [];
  const head = clean[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, ''));
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
