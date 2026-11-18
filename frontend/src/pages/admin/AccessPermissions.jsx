import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { KeyRound, Siren, CheckCircle2, CircleDashed } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, fmtDate, errMsg } from '../../components/ui';

const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const until = (v) => { const d = new Date(v); d.setHours(23, 59, 59, 0); return d.toISOString(); };

const AccessPermissions = () => {
  const [m, setM] = useState(null); const [grants, setGrants] = useState([]); const [people, setPeople] = useState(null); const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); const [revoke, setRevoke] = useState(null); const [glass, setGlass] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([apiClient.get('/permissions/matrix'), apiClient.get('/permissions/grants'), apiClient.get('/permissions/people')]);
      setM(a.data); setGrants(b.data.grants); setPeople(c.data); setErr('');
    } catch (e) { setErr(errMsg(e, 'Could not load')); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); await load(); return true; } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); } };

  if (err) return <EmptyState title={err} action={<button className={btnGhost} onClick={load}>Try again</button>} />;
  if (!m || !people) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>;
  const grantable = m.actions.filter((a) => a.grantable);
  const def = form && m.actions.find((a) => a.action === form.action);
  const who = form ? (form.granteeRole === 'teacher' ? people.teachers : people.admins) : [];
  const active = grants.filter((g) => g.active && g.source === 'grant'); const emergencies = grants.filter((g) => g.source === 'break-glass');

  return (
    <div className="page-ready space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-xl font-bold"><KeyRound className="h-5 w-5" /> Access and permissions</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#5b6b7b]">Roles give everyone their normal access. Anything beyond that is given for a limited time, for a reason, and can be taken back. Every grant and every emergency use is recorded.</p></div>
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => setGlass({ reason: '', minutes: 30 })}><Siren className="h-4 w-4" /> Emergency access</button>
            <button className={btnPrimary} onClick={() => setForm({ action: grantable[0].action, granteeRole: 'teacher', granteeId: '', classId: '', validTo: iso(7), reason: '' })}>Grant access</button></div>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 font-semibold">Current grants</h3>
        <Card className="overflow-x-auto !p-0">
          {active.length === 0 ? <EmptyState title="No temporary access is active" text="Use Grant access to let a cover teacher take a class's attendance for a few days, or to let another admin read restriction reasons." /> : (
            <table className="w-full min-w-[640px] text-start text-sm"><tbody>{active.map((g) => (
              <tr key={g._id} className="border-b border-[#e3e7e7]/60 last:border-0">
                <td className="px-4 py-3"><p className="font-semibold">{g.granteeName}</p><p className="text-xs text-[#5b6b7b]">{g.label}{g.className ? ` · class ${g.className}` : ''}</p></td>
                <td className="px-4 py-3 text-xs">Until {fmtDate(g.validTo)}<p className="text-[#5b6b7b]">{g.reason}</p></td>
                <td className="px-4 py-3 text-xs text-[#5b6b7b]">by {g.grantedByName || 'admin'}</td>
                <td className="px-4 py-3"><button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setRevoke({ id: g._id, reason: '' })}>Take back</button></td></tr>))}</tbody></table>)}
        </Card>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Emergency access log</h3>
        <Card className="overflow-x-auto !p-0">
          {emergencies.length === 0 ? <EmptyState title="Emergency access has not been used" /> : (
            <table className="w-full min-w-[640px] text-start text-sm"><tbody>{emergencies.map((g) => (
              <tr key={g._id} className="border-b border-[#e3e7e7]/60 last:border-0">
                <td className="px-4 py-3 font-semibold">{g.granteeName}</td><td className="px-4 py-3 text-xs">{g.label}</td>
                <td className="px-4 py-3 text-xs text-[#5b6b7b]">{new Date(g.validFrom).toLocaleString('en-GB')}, {g.reason}</td>
                <td className="px-4 py-3"><Pill value={g.active ? 'Pending' : 'None'}>{g.active ? 'Open now' : 'Closed'}</Pill></td></tr>))}</tbody></table>)}
        </Card>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">What each permission means</h3>
        <Card className="!p-0"><ul className="divide-y divide-[#e3e7e7]">{m.actions.map((a) => (
          <li key={a.action} className="flex gap-3 p-4 text-sm">{a.implemented ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2c776c]" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-[#8a97a3]" />}
            <div><p className="font-semibold">{a.label} <span className="ms-1 font-mono text-[11px] font-normal text-[#5b6b7b]">{a.action}</span></p>
              <p className="text-xs text-[#5b6b7b]">By default: {a.defaults.length ? a.defaults.join(', ') : 'nobody'} · {a.grantable ? 'can be granted' : 'role only'}{a.implemented ? '' : ' · not yet in the product'}</p>
              <p className="mt-1 text-xs">{a.rule}</p></div></li>))}</ul></Card>
      </div>

      {form && <Modal title="Grant access" onClose={() => setForm(null)}>
        <div className="space-y-3">
          <Field label="Permission"><select className={inputCls} value={form.action} onChange={(e) => { const a = m.actions.find((x) => x.action === e.target.value); setForm({ ...form, action: e.target.value, granteeRole: a.scope === 'class' ? 'teacher' : 'admin', granteeId: '', classId: '' }); }}>
            {grantable.map((a) => <option key={a.action} value={a.action}>{a.label}</option>)}</select></Field>
          {def.scope !== 'class' && <p className="text-xs text-[#5b6b7b]">Only school admins can be given this.</p>}
          <Field label="Who"><select className={inputCls} value={form.granteeId} onChange={(e) => setForm({ ...form, granteeId: e.target.value })}><option value="">Choose…</option>{who.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>
          {def.scope === 'class' && <Field label="Class"><select className={inputCls} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}><option value="">Choose…</option>{people.classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>}
          <Field label="Until" hint={`At most ${m.limits.maxGrantDays} days`}><input type="date" min={iso(1)} className={inputCls} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
          <Field label="Reason"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="For example: covering for a colleague on leave" /></Field>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setForm(null)}>Cancel</button>
            <button disabled={busy || !form.granteeId || form.reason.trim().length < 5 || (def.scope === 'class' && !form.classId)} className={btnPrimary}
              onClick={async () => { if (await run(() => apiClient.post('/permissions/grants', { ...form, validTo: until(form.validTo), classId: form.classId || undefined }), 'Access granted')) setForm(null); }}>Grant</button></div>
        </div></Modal>}

      {revoke && <Modal title="Take back this access" onClose={() => setRevoke(null)}>
        <Field label="Reason"><input autoFocus className={inputCls} value={revoke.reason} onChange={(e) => setRevoke({ ...revoke, reason: e.target.value })} /></Field>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setRevoke(null)}>Cancel</button>
          <button disabled={busy || revoke.reason.trim().length < 3} className={btnDanger} onClick={async () => { if (await run(() => apiClient.post(`/permissions/grants/${revoke.id}/revoke`, { reason: revoke.reason }), 'Access taken back')) setRevoke(null); }}>Take back</button></div></Modal>}

      {glass && <EmergencyModal glass={glass} setGlass={setGlass} busy={busy} onSend={() => run(() => apiClient.post('/permissions/break-glass', { action: 'safeguarding.case.read', ...glass }), 'Emergency access is open')} max={m.limits.maxBreakGlassMinutes} />}
    </div>
  );
};

export const EmergencyModal = ({ glass, setGlass, busy, onSend, max = 60, onDone }) => (
  <Modal title="Emergency access to restriction reasons" onClose={() => setGlass(null)}>
    <p className="mb-3 rounded-lg bg-[#fbf0ec] px-3 py-2 text-xs text-[#8a4636]">Use this only for a real safety concern. Every other admin is told straight away, with your reason, and everything you read is recorded.</p>
    <div className="space-y-3">
      <Field label="What is the emergency?" hint="At least one full sentence"><textarea rows={3} className={inputCls} value={glass.reason} onChange={(e) => setGlass({ ...glass, reason: e.target.value })} /></Field>
      <Field label="For how long"><select className={inputCls} value={glass.minutes} onChange={(e) => setGlass({ ...glass, minutes: Number(e.target.value) })}>{[15, 30, max].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></Field>
      <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setGlass(null)}>Cancel</button>
        <button disabled={busy || glass.reason.trim().length < 15} className={btnDanger} onClick={async () => { if (await onSend()) { setGlass(null); onDone?.(); } }}>Open emergency access</button></div>
    </div>
  </Modal>
);

export default AccessPermissions;
