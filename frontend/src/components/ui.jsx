import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox } from 'lucide-react';

// Shared building blocks for the newer screens (agent portal, owner money screens).
export const pkr = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
// wrapped in an LTR isolate so dates read correctly inside right-to-left Urdu text
export const fmtDate = (d) => (d ? `\u2066${new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}\u2069` : '—');
export const fmtDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const inputCls = 'w-full rounded-lg border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm text-[#1b2837] outline-none transition focus:border-[#2a5cac]';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#2a5cac] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234c91] disabled:opacity-60';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3e7e7] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b2837] hover:bg-[#f7f6f2] disabled:opacity-60';
export const btnDanger = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3b4ac] bg-white px-4 py-2.5 text-sm font-semibold text-[#9f1239] hover:bg-[#fff1f2] disabled:opacity-60';

export const Card = ({ className = '', children }) => (
  <div className={`rounded-2xl border border-[#e3e7e7] bg-white p-5 ${className}`}>{children}</div>
);

export const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-[#5b6b7b]">{hint}</span>}
  </label>
);

// A dialog. Escape closes the top-most one wherever the focus is (also after a button got disabled mid-save),
// focus moves inside on open and goes back to where it was on close.
export const Modal = ({ title, onClose, children, wide }) => {
  const ref = useRef(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement; const dlg = ref.current;
    if (dlg && !dlg.contains(document.activeElement)) (dlg.querySelector('input:not([type=hidden]),select,textarea') || dlg.querySelector('[data-dialog-panel]'))?.focus?.();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const all = document.querySelectorAll('[role="dialog"]');
      if (all[all.length - 1] !== ref.current) return;
      e.stopPropagation(); closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (before && document.contains(before)) before.focus?.(); };
  }, []);
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1b2837]/45 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div data-dialog-panel tabIndex={-1} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[#e3e7e7] bg-white p-6 shadow-2xl outline-none ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-[#1b2837]">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#5b6b7b] hover:bg-[#f7f6f2]"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
};

const TONES = {
  Pending: 'bg-[#fbf0ec] text-[#8a4636]', Approved: 'bg-[#eef2f8] text-[#234c91]', Paid: 'bg-[#edf5f3] text-[#215a52]', Void: 'bg-[#f1f2f2] text-[#5b6b7b]',
  Paying: 'bg-[#edf5f3] text-[#215a52]', Free: 'bg-[#eef2f8] text-[#234c91]', Expired: 'bg-[#fbf0ec] text-[#8a4636]', Suspended: 'bg-[#fff1f2] text-[#9f1239]',
  Confirmed: 'bg-[#edf5f3] text-[#215a52]', Refunded: 'bg-[#f1f2f2] text-[#5b6b7b]', Active: 'bg-[#edf5f3] text-[#215a52]', None: 'bg-[#f1f2f2] text-[#5b6b7b]',
};
// Status always shows its word, never colour alone
export const Pill = ({ value, children }) => (
  <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONES[value] || TONES.None}`}>{children || value}</span>
);

// Skeleton shaped like the table it stands in for
export const TableSkeleton = ({ rows = 5, cols = 5 }) => (
  <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((__, c) => <div key={c} className="skeleton h-5" />)}
      </div>
    ))}
  </div>
);

// Empty state: say what this is, and give one next step
export const EmptyState = ({ title, text, action }) => (
  <div className="flex flex-col items-center px-6 py-12 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2f8] text-[#2a5cac]"><Inbox className="h-6 w-6" /></div>
    <p className="mt-4 font-semibold text-[#1b2837]">{title}</p>
    {text && <p className="mt-1 max-w-md text-sm text-[#5b6b7b]">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Pager = ({ pagination, onPage }) => (!pagination || pagination.pages <= 1 ? null : (
  <div className="flex items-center justify-between border-t border-[#e3e7e7] px-4 py-3 text-xs text-[#3b4a5c]">
    <span>{pagination.total} total</span>
    <div className="flex items-center gap-2">
      <button disabled={pagination.currentPage <= 1} onClick={() => onPage(pagination.currentPage - 1)} className={`${btnGhost} !px-3 !py-1.5 !text-xs`}>Prev</button>
      <span className="font-semibold">{pagination.currentPage} / {pagination.pages}</span>
      <button disabled={pagination.currentPage >= pagination.pages} onClick={() => onPage(pagination.currentPage + 1)} className={`${btnGhost} !px-3 !py-1.5 !text-xs`}>Next</button>
    </div>
  </div>
));

export const Stat = ({ label, value, sub, tone = 'text-[#1b2837]' }) => (
  <Card>
    <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7b]">{label}</p>
    <p className={`mt-2 text-2xl font-bold ${tone}`}><span dir="ltr" className="inline-block">{value}</span></p>
    {sub && <p className="mt-1 text-xs text-[#5b6b7b]">{sub}</p>}
  </Card>
);

export const errMsg = (e, fallback = 'Something went wrong') => e?.response?.data?.message || fallback;
