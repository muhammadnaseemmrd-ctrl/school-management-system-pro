import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, btnPrimary, btnGhost } from '../ui';
import { Tabs, Loading, Note, Table, Td, Tag, CStatus, KIND_LABEL, useGet, dt, ShowOnce } from './iKit';
import Connections from './Connections';
import ConnectorDetail from './ConnectorDetail';
import ConnectorForm from './ConnectorForm';
import Activity from './Activity';

const Tile = ({ label, value, tone }) => <div className="rounded-xl border border-[#e3e7e7] bg-white p-4"><p className="text-xs font-semibold text-[#5b6b7b]">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${tone || 'text-[#1b2837]'}`} dir="ltr">{value}</p></div>;

// Connections to outside systems: keys, webhooks, learning tools and sign-in through the school's own account provider.
export default function IntegrationsHub() {
  const [tab, setTab] = useState('overview'); const [open, setOpen] = useState(null); const [adding, setAdding] = useState(false); const [shown, setShown] = useState(null); const [v, setV] = useState(0);
  const ov = useGet('/integrations/overview', { v }); const bump = () => { setV((x) => x + 1); };
  const n = ov.data ? ov.data.waitingForReview.length : 0;
  const added = async (data) => {
    setAdding(false); bump(); toast.success('Added. It is not turned on yet.');
    if (data.shownOnce) setShown({ title: data.key ? 'Your new key' : 'Your signing secret', secret: data.key || data.secret, id: data.connector.id }); else setOpen(data.connector.id);
  };
  if (ov.error && /whole school/i.test(ov.error)) return <p className="text-sm text-[#9f1239]" role="alert">Connections are managed by an administrator of the whole school.</p>;
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-[#1b2837]">Connections</h1><p className="mt-1 text-sm text-[#5b6b7b]">Let other systems read from the school, hear about events, open learning tools or sign staff in. Everything that leaves the school is logged.</p></div>
      {open ? <ConnectorDetail id={open} onBack={() => { setOpen(null); bump(); }} onChanged={bump} /> : (<>
        <Tabs label="Connection sections" value={tab} onChange={setTab} items={[['overview', 'Overview'], ['connections', 'Connections', n || null], ['activity', 'What was shared']]} />
        <div key={tab}>
          {tab === 'overview' && <Loading g={ov}>{ov.data && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Tile label="Connections on" value={ov.data.byStatus.active} /><Tile label="Waiting for review" value={ov.data.byStatus.pending_review} tone={ov.data.byStatus.pending_review ? 'text-[#8a4636]' : ''} /><Tile label="Events sent (24 hours)" value={`${ov.data.deliveries24h.delivered} of ${ov.data.deliveries24h.total}`} /><Tile label="Shared (24 hours)" value={ov.data.disclosures24h} /></div>
              {ov.data.waitingForReview.length > 0 && <Card><h2 className="text-sm font-bold text-[#1b2837]">Waiting for review</h2><ul className="mt-2 divide-y divide-[#eef0f0] text-sm">{ov.data.waitingForReview.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><span className="font-semibold text-[#1b2837]">{c.name}</span> <span className="text-[#5b6b7b]">· {KIND_LABEL[c.kind]} · asked by {c.review.askedByName}</span></span><button className={btnGhost} onClick={() => setOpen(c.id)} aria-label={`Review ${c.name}`}>Review</button></li>)}</ul></Card>}
              {ov.data.needAttention.length > 0 && <Card><h2 className="text-sm font-bold text-[#1b2837]">Needs attention</h2><ul className="mt-2 divide-y divide-[#eef0f0] text-sm">{ov.data.needAttention.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><span className="font-semibold text-[#1b2837]">{c.name}</span> <CStatus s={c.status} /> <span className="text-[#5b6b7b]">{c.pausedReason || `${c.failures} failed in a row`}</span></span><button className={btnGhost} onClick={() => setOpen(c.id)} aria-label={`Open ${c.name}`}>Open</button></li>)}</ul></Card>}
              {ov.data.expiring.length > 0 && <Note tone="warn">Keys ending within two weeks: {ov.data.expiring.map((e) => `${e.name} (${dt(e.expiresAt)})`).join(', ')}. Replace them before they stop working.</Note>}
              {ov.data.deadTotal > 0 && <Note tone="warn">{ov.data.deadTotal} webhook {ov.data.deadTotal === 1 ? 'delivery was' : 'deliveries were'} given up on. Open the webhook to send them again.</Note>}
              {ov.data.byStatus.active + ov.data.byStatus.draft + ov.data.byStatus.paused + ov.data.byStatus.pending_review === 0 && <Card><p className="text-sm text-[#5b6b7b]">Nothing is connected yet.</p><button className={`${btnPrimary} mt-3`} onClick={() => setAdding(true)}>Add a connection</button></Card>}
            </div>)}</Loading>}
          {tab === 'connections' && <Connections onOpen={setOpen} onAdd={() => setAdding(true)} version={v} />}
          {tab === 'activity' && <Activity />}
        </div></>)}
      {adding && <ConnectorForm onClose={() => setAdding(false)} onDone={added} />}
      {shown && <ShowOnce title={shown.title} text="Copy it now and keep it safe. It cannot be shown again. The connection is not on until you turn it on." secret={shown.secret} onClose={() => { const id = shown.id; setShown(null); setOpen(id); }} />}
    </div>
  );
}
