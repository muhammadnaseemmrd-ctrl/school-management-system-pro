import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Modal, Field, btnGhost, btnPrimary, btnDanger, inputCls } from '../ui';
import QrCode from '../attendance/QrCode';

export const ID_TYPES = ['CNIC', 'Passport', 'Driving licence', 'Employee card', 'Other'];
export const VISIT_KINDS = ['Guest', 'Parent', 'Vendor', 'Official', 'Interview'];
// "datetime-local" value for now plus some minutes, and back to an ISO string
export const localIn = (minutes = 0) => { const d = new Date(Date.now() + minutes * 60000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
export const iso = (v) => new Date(v).toISOString();
export const hhmm = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export const dayTime = (d) => (d ? `${new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${hhmm(d)}` : '');
export const STATUS_TONE = { Requested: 'Pending', Approved: 'Approved', CheckedIn: 'Active', CheckedOut: 'None', Declined: 'Suspended', Expired: 'None', Cancelled: 'None', Refused: 'Suspended', Pending: 'Pending', Active: 'Active', Revoked: 'Suspended', Released: 'Approved', Open: 'Pending', Closed: 'Active', Signed: 'Approved', Accepted: 'Approved', Disputed: 'Suspended', Resolved: 'None', Used: 'None' };

// Ask for a few words before an action that needs a reason
export const Reason = ({ title, label, cta, danger, min = 3, onClose, onSubmit, extra }) => {
  const [text, setText] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      {extra}
      <Field label={label}><textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} autoFocus /></Field>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={danger ? btnDanger : btnPrimary} disabled={text.trim().length < min} onClick={() => onSubmit(text.trim())}>{cta}</button></div>
    </Modal>
  );
};

// A code shown once, as a QR picture and as text for people who cannot scan
export const CodeBox = ({ title, code, note, onClose }) => (
  <Modal title={title} onClose={onClose}>
    <div className="flex flex-col items-center gap-3 text-center">
      <QrCode value={code} size={220} />
      <code className="break-all rounded-lg bg-[#f7f6f2] px-3 py-2 text-xs">{code}</code>
      <button className={btnGhost} onClick={() => { navigator.clipboard?.writeText(code); toast.success('Copied'); }}>Copy code</button>
      <p className="text-sm text-[#5b6b7b]">{note || 'This code is shown once. If it is lost, make a new one and the old one stops working.'}</p>
    </div>
  </Modal>
);

// A printable badge: site, name, host, areas, expiry. No ID details.
export const BadgePrint = ({ badge, onClose }) => (
  <Modal title="Visitor badge" onClose={onClose}>
    <div id="visitor-badge" className="mx-auto w-72 rounded-xl border-2 border-[#1b2837] p-4 text-center">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7b]">{badge.site}</div>
      <div className="mt-1 rounded bg-[#1b2837] py-0.5 text-sm font-bold uppercase tracking-widest text-white">{badge.kind}</div>
      <div className="mt-3 text-2xl font-bold text-[#1b2837]">{badge.visitorName}</div>
      <div className="mt-1 text-sm">Visiting: <b>{badge.hostName || 'School office'}</b></div>
      <div className="mt-2 text-xs text-[#3b4a5c]">Areas: {(badge.zones || []).join(' · ')}</div>
      <div className="mt-3 text-lg font-mono font-bold">{badge.number}</div>
      <div className="mt-1 text-xs text-[#5b6b7b]">Valid until {dayTime(badge.expiresAt)}{badge.reprint ? ' · reprint' : ''}</div>
    </div>
    <div className="mt-4 flex justify-end gap-2 print:hidden"><button className={btnGhost} onClick={onClose}>Close</button><button className={btnPrimary} onClick={() => window.print()}>Print</button></div>
    <style>{`@media print { body * { visibility: hidden !important; } #visitor-badge, #visitor-badge * { visibility: visible !important; } #visitor-badge { position: fixed; top: 20mm; left: 20mm; } }`}</style>
  </Modal>
);

export const Banner = ({ tone = 'warn', children }) => (
  <div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${tone === 'bad' ? 'border-[#e3b4ac] bg-[#fbeeea] text-[#7f2a1c]' : tone === 'good' ? 'border-[#b7d9d2] bg-[#e8f4f1] text-[#1f5d52]' : 'border-[#ead9a8] bg-[#fbf5e2] text-[#6b5311]'}`}>{children}</div>
);
