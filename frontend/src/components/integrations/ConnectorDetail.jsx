import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, btnGhost, btnPrimary, btnDanger } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, Loading, Note, Table, Td, Tag, Reason, AskForm, ShowOnce, CStatus, DStatus, KIND_LABEL, dt } from './iKit';
import ConnectorForm from './ConnectorForm';

const Row = ({ k, v }) => <div className="grid gap-1 py-1.5 sm:grid-cols-[200px_1fr]"><dt className="text-xs font-semibold text-[#5b6b7b]">{k}</dt><dd className="break-all text-sm text-[#1b2837]" dir="ltr">{v}</dd></div>;

// One connection: what it shares, who approved it, how to set up the other side, and what happened lately.
export default function ConnectorDetail({ id, onBack, onChanged }) {
  const g = useGet(`/integrations/connectors/${id}`); const [act, setAct] = useState(null); const [shown, setShown] = useState(null); const [st, setSt] = useState('');
  const c = g.data ? g.data.connector : null; const setup = useGet(`/integrations/connectors/${id}/setup`, { s: c ? c.status : '' }); const dl = useGet(`/integrations/connectors/${id}/deliveries`, { status: st, limit: 20, k: c ? c.status : '' });
  const done = (msg) => { toast.success(msg); setAct(null); g.reload(); dl.reload(); if (onChanged) onChanged(); };
  // each of these throws on a refusal, so the dialog stays open and says why
  const post = async (path, body) => (await apiClient.post(`/integrations/connectors/${id}/${path}`, body || {})).data;
  const turnOn = async () => { try { const r = await post('activate'); done(r.waiting ? 'Sent for review. Another administrator must approve it.' : 'Turned on.'); } catch (e) { toast.error(e.response?.data?.message || 'That did not work.'); } };
  const resume = async () => { try { await post('resume'); done('Resumed.'); } catch (e) { toast.error(e.response?.data?.message || 'That did not work.'); } };
  const test = async () => { try { const r = await post('test'); if (r.result === 'delivered' || r.result === 'ok') toast.success(r.result === 'ok' ? 'The provider answered correctly.' : 'The test event was delivered.'); else toast.error(r.problems ? r.problems.join(' ') : `The test failed: ${r.delivery ? r.delivery.lastError : 'no answer'}`); g.reload(); dl.reload(); } catch (e) { toast.error(e.response?.data?.message || 'That did not work.'); } };
  const replay = async (d) => { try { await apiClient.post(`/integrations/deliveries/${d.id}/replay`); toast.success('Sending it again.'); setTimeout(() => dl.reload(), 600); } catch (e) { toast.error(e.response?.data?.message || 'That did not work.'); } };
  return (
    <Loading g={g}>{c && (
      <div className="space-y-4">
        <button className={btnGhost} onClick={onBack}>← All connections</button>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold text-[#1b2837]">{c.name}</h2><p className="text-sm text-[#5b6b7b]">{KIND_LABEL[c.kind]} · added by {c.createdByName}</p><p className="mt-2 max-w-2xl text-sm text-[#3b4a5c]">{c.purpose}</p></div>
            <CStatus s={c.status} />
          </div>
          {c.pausedReason && c.status === 'paused' && <div className="mt-3"><Note tone="warn">Paused: {c.pausedReason}</Note></div>}
          {c.revokedReason && c.status === 'revoked' && <div className="mt-3"><Note tone="info">Removed: {c.revokedReason}</Note></div>}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Actions">
            {['draft', 'paused'].includes(c.status) && <button className={btnPrimary} onClick={c.status === 'draft' ? turnOn : resume}>{c.status === 'draft' ? (c.review.required ? 'Send for review' : 'Turn on') : 'Resume'}</button>}
            {c.status === 'pending_review' && <><button className={btnPrimary} onClick={() => setAct('approve')}>Approve</button><button className={btnGhost} onClick={() => setAct('reject')}>Turn down</button></>}
            {['active', 'pending_review'].includes(c.status) && <button className={btnGhost} onClick={() => setAct('pause')}>Pause</button>}
            {['draft', 'paused'].includes(c.status) && <button className={btnGhost} onClick={() => setAct('edit')}>Change</button>}
            {['webhook', 'sso'].includes(c.kind) && c.status !== 'revoked' && <button className={btnGhost} onClick={test}>{c.kind === 'sso' ? 'Check the provider' : 'Send a test event'}</button>}
            {['api_key', 'webhook'].includes(c.kind) && c.status !== 'revoked' && <button className={btnGhost} onClick={() => setAct('rotate')}>{c.kind === 'api_key' ? 'Replace the key' : 'Replace the secret'}</button>}
            {c.status !== 'revoked' && <button className={btnDanger} onClick={() => setAct('revoke')}>Remove</button>}
          </div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><h3 className="text-sm font-bold text-[#1b2837]">What it can see</h3>
            {c.shares.length ? <div className="mt-2 flex flex-wrap gap-1.5">{c.shares.map((s) => <Tag key={s} tone="info">{s}</Tag>)}</div> : <p className="mt-1 text-sm text-[#5b6b7b]">Nothing. It only confirms who a person is.</p>}
            {c.kind === 'api_key' && <dl className="mt-3 divide-y divide-[#eef0f0]"><Row k="Key" v={c.keyHint} /><Row k="Calls this hour" v={`${c.usedThisHour} of ${c.quotaPerHour}`} /><Row k="Ends" v={c.expiresAt ? dt(c.expiresAt) : 'No end date'} /><Row k="Last used" v={c.lastUsedAt ? `${dt(c.lastUsedAt)} from ${c.lastUsedIp}` : 'Never'} />{c.graceUntil && <Row k="Old key works until" v={dt(c.graceUntil)} />}{c.config.allowedIps.length > 0 && <Row k="Only from" v={c.config.allowedIps.join(', ')} />}</dl>}
            {c.kind === 'webhook' && <dl className="mt-3 divide-y divide-[#eef0f0]"><Row k="Address" v={c.config.url} /><Row k="Events" v={c.config.events.join(', ')} /><Row k="Secret" v={c.secretHint || ''} /><Row k="Failures in a row" v={String(c.failures)} /></dl>}
            {c.kind === 'lti_tool' && <dl className="mt-3 divide-y divide-[#eef0f0]"><Row k="Who may open it" v={c.config.roles.join(', ')} /><Row k="Launch address" v={c.config.targetLinkUri} /></dl>}
            {c.kind === 'sso' && <dl className="mt-3 divide-y divide-[#eef0f0]"><Row k="Issuer" v={c.config.issuer} /><Row k="Email domains" v={c.config.allowedDomains.join(', ')} /><Row k="Who may sign in" v={c.config.roles.join(', ')} /></dl>}
          </Card>
          <Card><h3 className="text-sm font-bold text-[#1b2837]">Review</h3>
            {!c.review.required ? <p className="mt-1 text-sm text-[#5b6b7b]">This connection shares nothing sensitive, so no second administrator is needed.</p> : (
              <div className="mt-1 space-y-2 text-sm text-[#3b4a5c]">
                <ul className="list-disc ps-5">{c.review.why.map((w) => <li key={w}>{w}</li>)}</ul>
                <p>{{ none: 'Not reviewed yet.', pending: `Asked by ${c.review.askedByName}, waiting for another administrator.`, approved: `Approved by ${c.review.decidedByName}${c.review.note ? `: ${c.review.note}` : ''}.`, rejected: `Turned down by ${c.review.decidedByName}: ${c.review.note}` }[c.review.status]}</p>
                {c.review.soleAdmin && <Note tone="info">The school has only one administrator of the whole school, so the same person approved it. This is recorded.</Note>}
                {c.review.status === 'pending' && <p className="text-xs text-[#5b6b7b]">If you asked for this review yourself, another administrator must decide it.</p>}
              </div>)}
          </Card>
        </div>
        {setup.data && c.status !== 'revoked' && (
          <Card><h3 className="text-sm font-bold text-[#1b2837]">Setting up the other side</h3>
            <dl className="mt-2 divide-y divide-[#eef0f0]">
              {setup.data.platform && Object.entries({ Issuer: setup.data.platform.issuer, 'Authorization address': setup.data.platform.authorizationEndpoint, 'Keys address': setup.data.platform.jwksUrl, 'Client id': setup.data.platform.clientId, 'Deployment id': setup.data.platform.deploymentId, 'Launch method': setup.data.platform.launchMethod }).map(([k, v]) => <Row key={k} k={k} v={v} />)}
              {setup.data.redirectUri && <><Row k="Redirect address" v={setup.data.redirectUri} /><Row k="Start address" v={setup.data.startAddress} /></>}
              {setup.data.rosterBase && <><Row k="Roster address (OneRoster 1.1)" v={setup.data.rosterBase} /><Row k="Open read-only address" v={setup.data.openApiBase} /><Row k="Header" v={setup.data.header} /></>}
              {setup.data.signature && <><Row k="Signature" v={setup.data.signature} /><Row k="Other headers" v={setup.data.headers.join(', ')} /></>}
            </dl><p className="mt-2 text-xs text-[#5b6b7b]">{setup.data.note}</p></Card>)}
        {c.kind === 'webhook' && (
          <Card><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-[#1b2837]">Deliveries</h3>
            <label className="text-xs text-[#3b4a5c]">Show <select className="ms-1 rounded-md border border-[#e3e7e7] px-2 py-1 text-xs" value={st} onChange={(e) => setSt(e.target.value)}><option value="">all</option><option value="delivered">delivered</option><option value="failed">waiting to try again</option><option value="dead">gave up</option></select></label></div>
            <Loading g={dl}>{dl.data && (dl.data.deliveries.length === 0 ? <p className="mt-2 text-sm text-[#5b6b7b]">No deliveries yet.</p> : (
              <Table label="Webhook deliveries" head={['Event', 'Status', 'Tries', 'Last answer', 'When', '']} min={720}>
                {dl.data.deliveries.map((d) => (
                  <tr key={d.id}><Td><span className="font-semibold">{d.type}</span>{d.replayOf && <p className="text-[11px] text-[#5b6b7b]">Sent again</p>}</Td><Td><DStatus s={d.status} /></Td><Td><span dir="ltr">{d.attempts}</span></Td><Td>{d.lastError || (d.lastStatus ? `${d.lastStatus} in ${d.lastMs} ms` : '—')}</Td><Td>{dt(d.createdAt)}</Td>
                    <Td>{d.type !== 'connector.test' && ['dead', 'delivered', 'failed'].includes(d.status) && <button className={btnGhost} onClick={() => replay(d)} aria-label={`Send ${d.type} again`}>Send again</button>}</Td></tr>))}
              </Table>))}</Loading></Card>)}
        <Card><h3 className="text-sm font-bold text-[#1b2837]">History</h3>
          <ul className="mt-2 divide-y divide-[#eef0f0] text-sm">{c.history.map((h, i) => <li key={i} className="py-1.5"><span className="font-semibold text-[#1b2837]">{h.by}</span> {h.what}{h.note ? <span className="text-[#5b6b7b]"> — {h.note}</span> : null}<span className="ms-2 text-xs text-[#5b6b7b]">{dt(h.at)}</span></li>)}</ul></Card>
        {act === 'edit' && <ConnectorForm existing={c} onClose={() => setAct(null)} onDone={async () => done('Saved.')} />}
        {act === 'approve' && <AskForm title={`Approve: ${c.name}`} intro="It goes live straight away." fields={[{ k: 'note', label: 'Note (optional)', type: 'textarea' }]} confirm="Approve" onClose={() => setAct(null)} onDone={async (v) => { await post('decide', { approve: true, note: v.note }); done('Approved. It is on.'); }} />}
        {act === 'reject' && <Reason title={`Turn down: ${c.name}`} text="Say why, so the person who asked knows what to change." confirm="Turn down" onClose={() => setAct(null)} onDone={async (note) => { await post('decide', { approve: false, note }); done('Turned down.'); }} />}
        {act === 'pause' && <Reason title={`Pause: ${c.name}`} text="It stops working at once. You can resume it later." confirm="Pause" danger={false} onClose={() => setAct(null)} onDone={async (reason) => { await post('pause', { reason }); done('Paused.'); }} />}
        {act === 'revoke' && <Reason title={`Remove: ${c.name}`} text="It stops working for good and anything waiting to be sent is dropped. The record of what it received stays." confirm="Remove it" onClose={() => setAct(null)} onDone={async (reason) => { await post('revoke', { reason }); done('Removed.'); }} />}
        {act === 'rotate' && <AskForm title={c.kind === 'api_key' ? 'Replace the key' : 'Replace the secret'} intro="The new value is shown once. The old one can keep working for a while so the other system has time to change." fields={[{ k: 'graceHours', label: 'Old one keeps working for (hours, 0 to 72)', type: 'number', def: 24 }]} confirm="Replace" onClose={() => setAct(null)} onDone={async (v) => { const r = await post('rotate', { graceHours: Number(v.graceHours) }); setAct(null); setShown({ title: c.kind === 'api_key' ? 'Your new key' : 'Your new secret', secret: r.key || r.secret }); g.reload(); if (onChanged) onChanged(); }} />}
        {shown && <ShowOnce title={shown.title} text="Copy it now and keep it safe. It cannot be shown again." secret={shown.secret} onClose={() => setShown(null)} />}
      </div>)}</Loading>
  );
}
