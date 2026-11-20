import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ShieldAlert, UserCheck, Car, Ban } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { EmergencyModal } from './AccessPermissions';
import { Modal, Field, Pill, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, fmtDate, errMsg } from '../../components/ui';

const LABEL = {
  viewInfo: 'Child profile', viewAttendance: 'Attendance', viewMarks: 'Marks', viewFees: 'See fees',
  payFees: 'Send fee payments', receiveNotices: 'Notices', receiveMessages: 'Messages', pickup: 'Collect the child',
};
const TYPES = [['no-contact', 'No notices or messages'], ['no-pickup', 'Must not collect the child'], ['no-fees', 'No fee information'], ['no-access', 'No access at all']];
const typeLabel = (t) => (TYPES.find((x) => x[0] === t) || [, t])[1];

const RightsBoxes = ({ value, onChange, keys, disabled }) => (
  <div className="grid gap-1.5 sm:grid-cols-2">
    {keys.map((k) => (
      <label key={k} className={`flex items-center gap-2 rounded-lg border border-[#e3e7e7] px-2.5 py-1.5 text-xs ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-[#f7f6f2]'}`}>
        <input type="checkbox" disabled={disabled} checked={!!value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />{LABEL[k]}
      </label>))}
  </div>
);

const Chips = ({ rights, keys }) => (
  <div className="mt-1 flex flex-wrap gap-1">{keys.map((k) => (
    <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rights[k] ? 'bg-[#edf5f3] text-[#215a52]' : 'bg-[#f1f2f2] text-[#5b6b7b] line-through'}`}>{LABEL[k]}</span>))}</div>
);

const GuardianRights = ({ studentId, studentName, parents, onClose }) => {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);                 // { link, rights }
  const [add, setAdd] = useState(null);                   // new guardian form
  const [res, setRes] = useState(null);                   // new restriction form
  const [pick, setPick] = useState({ who: '', name: '' });
  const [verdict, setVerdict] = useState(null);
  const [ending, setEnding] = useState(null);             // { kind, id, reason }
  const [glass, setGlass] = useState(null);

  const load = useCallback(() => apiClient.get(`/guardians/students/${studentId}`).then((r) => { setD(r.data); setErr(''); }).catch((e) => setErr(errMsg(e, 'Could not load'))), [studentId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); await load(); return true; } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); } };
  const who = (v) => (v.parentId ? { parentId: v.parentId } : { personName: v.name });

  if (err) return <Modal title={`Guardians · ${studentName}`} onClose={onClose}><EmptyState title={err} action={<button className={btnGhost} onClick={load}>Try again</button>} /></Modal>;
  if (!d) return <Modal title={`Guardians · ${studentName}`} onClose={onClose} wide><div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div></Modal>;

  const keys = d.rightKeys;
  const current = d.links.filter((l) => l.active); const past = d.links.filter((l) => !l.active);
  const used = new Set(current.map((l) => String(l.parentId)));
  const free = parents.filter((p) => !used.has(String(p._id)));
  const noAcct = add && !add.parentId;

  return (
    <Modal title={`Guardians and pickup · ${d.student.name}`} onClose={onClose} wide>
      <div className="space-y-6 text-sm">
        <section>
          <div className="mb-2 flex items-center justify-between"><h4 className="flex items-center gap-2 font-semibold"><UserCheck className="h-4 w-4" /> Who may do what</h4>
            <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setAdd({ parentId: '', name: '', relationship: 'Guardian', phone: '', rights: Object.fromEntries(keys.map((k) => [k, k !== 'pickup'])) })}>Add guardian or driver</button></div>
          <ul className="divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7]">
            {current.length + d.implicit.length === 0 && <li className="p-4 text-xs text-[#5b6b7b]">No guardian is linked to this child yet.</li>}
            {d.implicit.map((x) => (
              <li key={`i${x.parentId}`} className="p-3"><div className="flex items-center justify-between gap-2"><div><p className="font-semibold">{x.name} <span className="text-xs font-normal text-[#5b6b7b]">{x.email}</span></p><p className="text-[11px] text-[#5b6b7b]">Standard rights, never pickup, until you set them below</p></div>
                <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setAdd({ parentId: x.parentId, name: x.name, relationship: x.relationship, phone: x.phone, rights: x.rights })}>Set rights</button></div><Chips rights={x.rights} keys={keys} /></li>))}
            {current.map((l) => (
              <li key={l._id} className="p-3"><div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold">{l.name} <span className="text-xs font-normal text-[#5b6b7b]">{l.relationship}{l.isPrimary ? ' · primary' : ''}{!l.parentId ? ' · no account' : ''}</span></p>
                  <p className="text-[11px] text-[#5b6b7b]">From {fmtDate(l.validFrom)}{l.validTo ? ` until ${fmtDate(l.validTo)}` : ''}</p></div>
                <div className="flex gap-1.5"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setEdit({ link: l, rights: { ...l.rights } })}>Change rights</button>
                  <button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setEnding({ kind: 'links', id: l._id, reason: '' })}>End link</button></div></div>
                <Chips rights={l.rights} keys={keys} /></li>))}
          </ul>
          {past.length > 0 && <p className="mt-2 text-[11px] text-[#5b6b7b]">Ended links kept for the record: {past.map((l) => `${l.name} (until ${fmtDate(l.validTo)})`).join(', ')}</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h4 className="flex items-center gap-2 font-semibold"><Ban className="h-4 w-4" /> Restrictions</h4>
            <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setRes({ parentId: '', name: '', type: 'no-contact', reason: '', referenceNo: '', validTo: '' })}>Add restriction</button></div>
          <p className="mb-2 text-[11px] text-[#5b6b7b]">A restriction always wins over a guardian's rights. Only the admin who recorded it, or someone with a grant or emergency access, can read the reason. Teachers and gate staff are never told why.</p>
          {d.restrictions.length === 0 ? <p className="rounded-xl border border-dashed border-[#e3e7e7] p-4 text-xs text-[#5b6b7b]">No restrictions on file.</p> : (
            <ul className="divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7]">{d.restrictions.map((r) => (
              <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div><p className="font-semibold">{r.name} <Pill value={r.active ? 'Suspended' : 'None'}>{r.active ? 'In force' : 'Ended'}</Pill></p>
                  <p className="text-xs">{typeLabel(r.type)}{r.referenceNo ? ` · ref ${r.referenceNo}` : ''}</p><p className="text-[11px] text-[#5b6b7b]">{r.reasonHidden ? <>Reason hidden. <button type="button" className="font-semibold text-[#2a5cac] underline" onClick={() => setGlass({ reason: '', minutes: 30 })}>Emergency access</button></> : r.reason} · from {fmtDate(r.validFrom)}{r.validTo ? ` to ${fmtDate(r.validTo)}` : ''}</p></div>
                {r.active && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setEnding({ kind: 'restrictions', id: r._id, reason: '' })}>End restriction</button>}</li>))}</ul>)}
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-2 font-semibold"><Car className="h-4 w-4" /> Pickup check</h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1"><select className={inputCls} value={pick.who} onChange={(e) => { setPick({ ...pick, who: e.target.value }); setVerdict(null); }}>
              <option value="">Someone else, type name…</option>{parents.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></div>
            {!pick.who && <input className={`${inputCls} !w-48`} placeholder="Name at the gate" value={pick.name} onChange={(e) => { setPick({ ...pick, name: e.target.value }); setVerdict(null); }} />}
            <button disabled={busy || (!pick.who && !pick.name.trim())} className={btnPrimary} onClick={async () => { setBusy(true); try { const r = await apiClient.post(`/guardians/students/${studentId}/pickup-verify`, pick.who ? { parentId: pick.who } : { personName: pick.name }); setVerdict(r.data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } }}>Check</button>
          </div>
          {verdict && <div className={`mt-3 flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${verdict.decision === 'Authorised' ? 'bg-[#edf5f3] text-[#215a52]' : 'bg-[#fff1f2] text-[#9f1239]'}`}><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><b>{verdict.decision}</b>. {verdict.message}</div></div>}
        </section>
      </div>

      {edit && <Modal title={`Rights for ${edit.link.name}`} onClose={() => setEdit(null)}>
        <RightsBoxes keys={edit.link.parentId ? keys : ['pickup']} value={edit.rights} onChange={(r) => setEdit({ ...edit, rights: r })} />
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setEdit(null)}>Cancel</button>
          <button disabled={busy} className={btnPrimary} onClick={async () => { if (await run(() => apiClient.put(`/guardians/links/${edit.link._id}`, { rights: edit.rights, version: edit.link.version }), 'Rights updated')) setEdit(null); }}>Save</button></div></Modal>}

      {add && <Modal title="Add guardian or driver" onClose={() => setAdd(null)}>
        <div className="space-y-3">
          <Field label="Person"><select className={inputCls} value={add.parentId} onChange={(e) => { const p = parents.find((x) => x._id === e.target.value); setAdd({ ...add, parentId: e.target.value, name: p ? p.name : '', rights: e.target.value ? add.rights : { pickup: true } }); }}>
            <option value="">Someone without an account (driver, relative)</option>{free.map((p) => <option key={p._id} value={p._id}>{p.name} · {p.email}</option>)}</select></Field>
          {noAcct && <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className={inputCls} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field><Field label="Phone"><input className={inputCls} value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></Field></div>}
          <Field label="Relationship"><input className={inputCls} value={add.relationship} onChange={(e) => setAdd({ ...add, relationship: e.target.value })} /></Field>
          <RightsBoxes keys={noAcct ? ['pickup'] : keys} value={add.rights} onChange={(r) => setAdd({ ...add, rights: r })} />
          {noAcct && <p className="text-[11px] text-[#5b6b7b]">A person without an account can only be authorised to collect the child.</p>}
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setAdd(null)}>Cancel</button>
            <button disabled={busy || (noAcct && !add.name.trim())} className={btnPrimary} onClick={async () => { const body = { parentId: add.parentId || undefined, personName: add.parentId ? undefined : add.name, phone: add.phone, relationship: add.relationship, rights: add.rights }; if (await run(() => apiClient.post(`/guardians/students/${studentId}/links`, body), 'Guardian saved')) setAdd(null); }}>Save</button></div>
        </div></Modal>}

      {res && <Modal title="Add restriction" onClose={() => setRes(null)}>
        <div className="space-y-3">
          <Field label="Who is restricted"><select className={inputCls} value={res.parentId} onChange={(e) => setRes({ ...res, parentId: e.target.value })}><option value="">Someone without an account, type name…</option>{parents.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>
          {!res.parentId && <Field label="Name"><input className={inputCls} value={res.name} onChange={(e) => setRes({ ...res, name: e.target.value })} /></Field>}
          <Field label="What is restricted"><select className={inputCls} value={res.type} onChange={(e) => setRes({ ...res, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Reason (admins only)" hint="Court order, safety plan or school decision"><input className={inputCls} value={res.reason} onChange={(e) => setRes({ ...res, reason: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Order or case number"><input className={inputCls} value={res.referenceNo} onChange={(e) => setRes({ ...res, referenceNo: e.target.value })} /></Field>
            <Field label="Ends on" hint="Leave empty if it has no end date"><input type="date" className={inputCls} value={res.validTo} onChange={(e) => setRes({ ...res, validTo: e.target.value })} /></Field></div>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setRes(null)}>Cancel</button>
            <button disabled={busy || res.reason.trim().length < 3 || (!res.parentId && !res.name.trim())} className={btnPrimary} onClick={async () => { const body = { ...who(res), type: res.type, reason: res.reason, referenceNo: res.referenceNo, validTo: res.validTo || undefined }; if (await run(() => apiClient.post(`/guardians/students/${studentId}/restrictions`, body), 'Restriction recorded')) setRes(null); }}>Save restriction</button></div>
        </div></Modal>}

      {glass && <EmergencyModal glass={glass} setGlass={setGlass} busy={busy} max={60} onSend={() => run(() => apiClient.post('/permissions/break-glass', { action: 'safeguarding.case.read', ...glass }), 'Emergency access is open')} />}

      {ending && <Modal title="Why is this ending?" onClose={() => setEnding(null)}>
        <Field label="Reason" hint="Kept in the record"><input autoFocus className={inputCls} value={ending.reason} onChange={(e) => setEnding({ ...ending, reason: e.target.value })} /></Field>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setEnding(null)}>Cancel</button>
          <button disabled={busy || ending.reason.trim().length < 3} className={btnDanger} onClick={async () => { if (await run(() => apiClient.post(`/guardians/${ending.kind}/${ending.id}/end`, { reason: ending.reason }), 'Ended')) setEnding(null); }}>End it</button></div></Modal>}
    </Modal>
  );
};

export default GuardianRights;
