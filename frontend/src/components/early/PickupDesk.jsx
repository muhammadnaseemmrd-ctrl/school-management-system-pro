import React, { useState } from 'react';
import { Card, Modal, Pill, Field, EmptyState, btnPrimary, btnGhost, inputCls } from '../ui';
import apiClient from '../../utils/apiClient';
import { call, useGet, Loading, Note, Tabs } from './earlyKit';

const WORD = { Requested: 'Needs confirming', Verified: 'Confirmed, ready to apply', Applied: 'Applied', Declined: 'Declined', Cancelled: 'Cancelled by the family' };
const TONE = { Requested: 'Pending', Verified: 'Approved', Applied: 'Active', Declined: 'Suspended', Cancelled: 'None' };
const ACT = { add: 'Add', remove: 'Remove', pause: 'Pause' };

// Who may collect a child can change only after the school has checked with the family.
export default function PickupDesk({ isLead }) {
  const [state, setState] = useState('open'); const g = useGet('/early/pickup-changes', state === 'open' ? {} : { state }); const [v, setV] = useState(null); const [f, setF] = useState({ method: 'call-back', with: '', note: '' }); const [no, setNo] = useState(null); const [why, setWhy] = useState('');
  return (
    <div className="grid gap-3"><Tabs label="Pickup changes" value={state} onChange={setState} items={[['open', 'To deal with'], ['Applied', 'Applied'], ['Declined', 'Declined']]} />
      <Note>Confirm each request with the family by calling the number the school already holds, in person, or from a signed form. Never use a number that came with the request.</Note>
      <Loading g={g}>{(g.data?.requests || []).length === 0 ? <Card><EmptyState title="No requests" /></Card> : (
        <Card className="!p-0 overflow-hidden"><ul>{g.data.requests.map((r) => (
          <li key={r._id} className="flex flex-wrap items-center gap-3 border-t border-[#e3e7e7] px-3 py-2 first:border-t-0"><div className="min-w-[12rem] flex-1"><div className="font-semibold">{ACT[r.action]} {r.personName}</div><div className="text-xs text-[#5b6b7b]">{r.childName} · {r.relationship}{r.phone ? ` · ${r.phone}` : ''} · asked by {r.requestedByName}{r.onBehalf ? ' (recorded by staff)' : ''}</div>{r.verifiedAt && <div className="text-xs text-[#3b4a5c]">Confirmed {r.verifiedMethod} with {r.verifiedWith} by {r.verifiedByName}</div>}{r.decidedNote && <div className="text-xs">{r.decidedNote}</div>}</div>
            <Pill value={TONE[r.state]}>{WORD[r.state]}</Pill>
            {isLead && r.state === 'Requested' && <button className={btnPrimary} onClick={() => { setV(r); setF({ method: 'call-back', with: '', note: '' }); }}>Confirm with the family</button>}
            {isLead && r.state === 'Verified' && <button className={btnPrimary} onClick={() => call(() => apiClient.post(`/early/pickup-changes/${r._id}/apply`), 'Applied. Every guardian has been told.', g.reload)}>Apply</button>}
            {isLead && ['Requested', 'Verified'].includes(r.state) && <button className={btnGhost} onClick={() => { setNo(r); setWhy(''); }}>Decline</button>}</li>))}</ul></Card>)}</Loading>
      {v && <Modal title={`Confirm: ${ACT[v.action]} ${v.personName}`} onClose={() => setV(null)}><div className="grid gap-3"><Field label="How did you confirm it?"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="call-back">I called the family back on their number on file</option><option value="in-person">The family told me in person</option><option value="signed-form">A signed form</option></select></Field><Field label="Who in the family?"><input className={inputCls} value={f.with} onChange={(e) => setF({ ...f, with: e.target.value })} /></Field><Field label="Note (optional)"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field><div className="flex justify-end"><button className={btnPrimary} disabled={f.with.trim().length < 3} onClick={() => call(() => apiClient.post(`/early/pickup-changes/${v._id}/verify`, f), 'Confirmed', () => { setV(null); g.reload(); })}>Save confirmation</button></div></div></Modal>}
      {no && <Modal title="Decline this request" onClose={() => setNo(null)}><div className="grid gap-3"><Field label="Why? The family is told."><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} /></Field><div className="flex justify-end"><button className={btnPrimary} disabled={why.trim().length < 3} onClick={() => call(() => apiClient.post(`/early/pickup-changes/${no._id}/decline`, { note: why }), 'Declined', () => { setNo(null); g.reload(); })}>Decline</button></div></div></Modal>}
    </div>
  );
}
