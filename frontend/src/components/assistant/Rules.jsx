import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, Field, inputCls, btnPrimary, btnGhost } from '../ui';
import apiClient from '../../utils/apiClient';
import { Loading, Note, Tag, useGet, dt, Reason } from './asKit';

// The school's rules for the assistant. A change needs a second administrator.
export default function Rules({ onChanged }) {
  const g = useGet('/ai/policy'); const [f, setF] = useState(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [act, setAct] = useState(null); const [test, setTest] = useState(null);
  const a = g.data?.active; const p = g.data?.pending;
  const start = () => setF({ enabled: a.enabled, purposes: Object.fromEntries(g.data.kinds.map((k) => [k.key, !!a.purposes[k.key]])), provider: a.provider, limits: { ...a.limits }, external: { baseUrl: a.external?.baseUrl || '', model: a.external?.model || '', apiKey: '', termsConfirmed: false } });
  const propose = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await apiClient.put('/ai/policy', { reason, enabled: f.enabled, purposes: f.purposes, provider: f.provider, limits: f.limits, external: f.provider === 'external' ? f.external : undefined }); toast.success('Sent. A different administrator must approve it.'); setF(null); setReason(''); g.reload(); onChanged?.(); } catch (x) { setErr(x.response?.data?.message || 'That did not work.'); }
    setBusy(false);
  };
  const decide = async (decision, note) => { await apiClient.post('/ai/policy/decide', { decision, note }); toast.success(decision === 'approve' ? 'The change is now in force.' : 'The change was declined.'); setAct(null); g.reload(); onChanged?.(); };
  const runTest = async (which) => { setTest({ busy: true }); try { const r = await apiClient.post('/ai/policy/test', { which }); setTest({ ok: true, text: `The model answered in ${r.data.ms} ms (${r.data.model}).` }); } catch (x) { setTest({ ok: false, text: x.response?.data?.message || 'The model did not answer.' }); } };
  return (
    <Loading g={g}>{g.data && (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-[#1b2837]">Rules now in force</h2>{a.enabled ? <Tag tone="good">On</Tag> : <Tag tone="none">Off</Tag>}</div>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[#5b6b7b]">Drafter</dt><dd>{a.provider === 'external' ? `Outside model: ${a.external?.model} (key ${a.external?.keyHint || 'set'})` : 'Built-in drafter. Nothing leaves the school.'}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Allowed kinds of writing</dt><dd>{g.data.kinds.filter((k) => a.purposes[k.key]).map((k) => k.label).join(', ') || 'None'}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Limits</dt><dd>{a.limits.perUserPerHour} drafts per person each hour · {a.limits.perSchoolPerDay} per day for the school · text kept {a.limits.draftRetentionDays} days</dd></div><div><dt className="text-xs text-[#5b6b7b]">Used for training</dt><dd>Never. Children&apos;s data is not sent.</dd></div></dl>
          <div className="mt-3 flex flex-wrap gap-2">{!p && !f && <button className={btnPrimary} onClick={start}>Propose a change</button>}{a.provider === 'external' && <button className={btnGhost} onClick={() => runTest('active')}>Test the outside model</button>}</div>
          {test && <p role="status" className={`mt-2 text-sm ${test.ok === false ? 'text-[#9f1239]' : 'text-[#3b4a5c]'}`}>{test.busy ? 'Testing…' : test.text}</p>}
        </Card>
        {p && <Card><h2 className="text-sm font-bold text-[#1b2837]">A change is waiting</h2><p className="mt-1 text-sm text-[#3b4a5c]">Proposed by {p.madeByName} on {dt(p.at)}: {p.reason}</p><p className="mt-1 text-sm">{p.enabled ? 'On' : 'Off'} · {p.provider === 'external' ? `outside model ${p.external?.model}` : 'built-in drafter'} · {p.limits.perUserPerHour}/hour, {p.limits.perSchoolPerDay}/day</p><div className="mt-3 flex gap-2"><button className={btnPrimary} onClick={() => decide('approve', '')}>Approve</button><button className={btnGhost} onClick={() => setAct('reject')}>Decline</button></div><p className="mt-2 text-xs text-[#5b6b7b]">You cannot approve a change you proposed, unless you are the only administrator.</p></Card>}
        {f && (
          <Card><form onSubmit={propose} className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Switch the writing assistant on</label>
            <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[#1b2837]">Kinds of writing to allow</legend><div className="mt-1 flex flex-wrap gap-4">{g.data.kinds.map((k) => <label key={k.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.purposes[k.key]} onChange={(e) => setF({ ...f, purposes: { ...f.purposes, [k.key]: e.target.checked } })} /> {k.label}</label>)}</div></fieldset>
            <Field label="Who writes the drafts?"><select className={inputCls} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}><option value="builtin">Built-in drafter (nothing leaves the school)</option><option value="external">An outside model service</option></select></Field>
            {['perUserPerHour', 'perSchoolPerDay', 'draftRetentionDays'].map((k) => <Field key={k} label={{ perUserPerHour: 'Drafts per person each hour', perSchoolPerDay: 'Drafts per day for the school', draftRetentionDays: 'Days to keep draft text' }[k]} hint={`${g.data.ranges[k][0]} to ${g.data.ranges[k][1]}`}><input type="number" className={inputCls} min={g.data.ranges[k][0]} max={g.data.ranges[k][1]} value={f.limits[k]} onChange={(e) => setF({ ...f, limits: { ...f.limits, [k]: Number(e.target.value) } })} /></Field>)}
            {f.provider === 'external' && <>
              <div className="sm:col-span-2"><Note tone="warn">Only the words typed into the request and the approved sources are sent. Children&apos;s names, numbers and care notes are removed or blocked first. Use a service whose terms say it does not train on or keep what you send.</Note></div>
              <Field label="Service address (https)"><input className={inputCls} required value={f.external.baseUrl} onChange={(e) => setF({ ...f, external: { ...f.external, baseUrl: e.target.value } })} placeholder="https://api.example.com/v1" dir="ltr" /></Field>
              <Field label="Model name"><input className={inputCls} required value={f.external.model} onChange={(e) => setF({ ...f, external: { ...f.external, model: e.target.value } })} dir="ltr" /></Field>
              <Field label="Key" hint={a.external?.keyHint ? `Leave empty to keep the key ${a.external.keyHint}` : 'Stored sealed. Shown only as its last four characters.'}><input className={inputCls} type="password" autoComplete="off" value={f.external.apiKey} onChange={(e) => setF({ ...f, external: { ...f.external, apiKey: e.target.value } })} dir="ltr" /></Field>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.external.termsConfirmed} onChange={(e) => setF({ ...f, external: { ...f.external, termsConfirmed: e.target.checked } })} /> I checked that the service does not train on or keep the school&apos;s text</label>
            </>}
            <div className="sm:col-span-2"><Field label="Why this change? (shown to the other administrator)"><textarea className={inputCls} required minLength={5} maxLength={300} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
            {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={() => setF(null)}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? 'Sending…' : 'Send for approval'}</button></div>
          </form></Card>
        )}
        <Card><h2 className="text-sm font-bold text-[#1b2837]">Past changes</h2>{g.data.history.length === 0 ? <p className="mt-1 text-sm text-[#5b6b7b]">None yet.</p> : <ul className="mt-2 space-y-1 text-sm text-[#3b4a5c]">{g.data.history.map((h) => <li key={`${h.version}${h.at}`}>{dt(h.at)} · {h.decision === 'approve' ? 'approved' : 'declined'} by {h.deciderName} · proposed by {h.madeByName} · {h.reason}{h.soleAdmin ? ' (the only administrator)' : ''}</li>)}</ul>}</Card>
        {act === 'reject' && <Reason title="Decline this change" text="Say why." confirm="Decline" onClose={() => setAct(null)} onDone={(n) => decide('reject', n)} />}
      </div>)}</Loading>
  );
}
