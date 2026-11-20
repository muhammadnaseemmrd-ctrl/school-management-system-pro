import React, { useState } from 'react';
import { Building2, Users } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note } from '../early/earlyKit';

// Campuses of one school, which classes sit on which, and which administrators are limited to a campus (PRD E01).
export default function Campuses() {
  const ov = useGet('/campuses'); const cls = useGet('/campuses/classes');
  const me = ov.data?.me; const wide = me?.schoolWide;
  const [form, setForm] = useState(null); const [move, setMove] = useState(null); const [busy, setBusy] = useState(false);
  const reload = () => { ov.reload(); cls.reload(); };
  const run = async (fn, ok) => { setBusy(true); const r = await call(fn, ok, reload); setBusy(false); return r; };
  const campuses = ov.data?.campuses || []; const active = campuses.filter((c) => c.status === 'active');

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5" /> Campuses</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#5b6b7b]">A campus is a site of your school. Every school starts with one main campus. An administrator who is tied to a campus sees only its classes, students and consents, and nothing from the other campuses.</p></div>
          {wide && <button className={btnPrimary} onClick={() => setForm({ name: '', code: '', address: '', phone: '' })}>Add a campus</button>}
        </div>
        {ov.data?.organization && <p className="mt-3 text-xs text-[#5b6b7b]">Part of the organization <b>{ov.data.organization.name}</b>. Other schools in the group cannot see your records.</p>}
        {me && !wide && <div className="mt-3"><Note>You are an administrator for {campuses.length === 1 ? 'one campus' : `${campuses.length} campuses`}. Only a school-wide administrator can add campuses or change who works where.</Note></div>}
      </Card>

      <Loading g={ov}>
        <div className="grid gap-4 md:grid-cols-2">
          {campuses.map((c) => (
            <Card key={c._id} className={c.status === 'closed' ? 'opacity-70' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-bold">{c.name} <span className="ms-1 font-mono text-[11px] font-normal text-[#5b6b7b]">{c.code}</span></p>
                  <p className="text-xs text-[#5b6b7b]">{c.address || 'No address'}{c.phone ? ` · ${c.phone}` : ''}</p></div>
                <div className="flex gap-1">{c.isDefault && <Pill value="Approved">Main</Pill>}{c.status === 'closed' && <Pill value="None">Closed</Pill>}</div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-[#f7f6f2] p-2"><dt className="text-[11px] text-[#5b6b7b]">Classes</dt><dd className="font-bold">{c.classes}</dd></div>
                <div className="rounded-lg bg-[#f7f6f2] p-2"><dt className="text-[11px] text-[#5b6b7b]">Students</dt><dd className="font-bold">{c.students}</dd></div>
                <div className="rounded-lg bg-[#f7f6f2] p-2"><dt className="text-[11px] text-[#5b6b7b]">Limited admins</dt><dd className="font-bold">{c.admins}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === 'active' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setMove({ campus: c, ids: [] })}>Move classes here</button>}
                {wide && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setForm({ ...c })}>Edit</button>}
                {wide && !c.isDefault && c.status === 'active' && <button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.patch(`/campuses/${c._id}`, { status: 'closed' }), 'Campus closed')}>Close</button>}
                {wide && c.status === 'closed' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.patch(`/campuses/${c._id}`, { status: 'active' }), 'Campus reopened')}>Reopen</button>}
              </div>
            </Card>))}
        </div>
      </Loading>

      {wide && <Members active={active} onChanged={reload} />}

      {form && <Modal title={form._id ? 'Edit campus' : 'Add a campus'} onClose={() => setForm(null)}>
        <div className="space-y-3">
          <Field label="Name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {!form._id && <Field label="Short code" hint="Letters and numbers, for example NORTH"><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>}
          <Field label="Address"><input className={inputCls} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputCls} value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setForm(null)}>Cancel</button>
            <button disabled={busy || form.name.trim().length < 2} className={btnPrimary} onClick={async () => { const body = { name: form.name, address: form.address, phone: form.phone, ...(form._id ? {} : { code: form.code }) };
              if (await run(() => (form._id ? apiClient.patch(`/campuses/${form._id}`, body) : apiClient.post('/campuses', body)), form._id ? 'Campus saved' : 'Campus added')) setForm(null); }}>Save</button></div>
        </div></Modal>}

      {move && <Modal title={`Move classes to ${move.campus.name}`} onClose={() => setMove(null)}>
        <p className="mb-2 text-sm text-[#5b6b7b]">Students stay in their class, so they move with it.</p>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[#e3e7e7] p-2">
          {(cls.data?.classes || []).filter((c) => String(c.campusId) !== String(move.campus._id)).map((c) => (
            <label key={c._id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#f7f6f2]">
              <input type="checkbox" checked={move.ids.includes(c._id)} onChange={(e) => setMove({ ...move, ids: e.target.checked ? [...move.ids, c._id] : move.ids.filter((i) => i !== c._id) })} />
              <span className="font-semibold">{c.name}</span><span className="text-xs text-[#5b6b7b]">{c.students} students · now on {campuses.find((x) => String(x._id) === String(c.campusId))?.name || 'main campus'}</span></label>))}
          {(cls.data?.classes || []).filter((c) => String(c.campusId) !== String(move.campus._id)).length === 0 && <p className="p-3 text-sm text-[#5b6b7b]">Every class you can see is already on this campus.</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setMove(null)}>Cancel</button>
          <button disabled={busy || !move.ids.length} className={btnPrimary} onClick={async () => { if (await run(() => apiClient.post(`/campuses/${move.campus._id}/classes`, { classIds: move.ids }), 'Classes moved')) setMove(null); }}>Move {move.ids.length || ''}</button></div>
      </Modal>}

      {ov.error && <p role="alert" className="text-sm text-[#9f1239]">{errMsg({ message: ov.error })}</p>}
    </div>
  );
}

// Who is school-wide and who is tied to a campus. Read only by school-wide administrators, so it lives in its own component
// and is only mounted for them.
function Members({ active, onChanged }) {
  const mem = useGet('/campuses/members'); const [admin, setAdmin] = useState(null); const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => { setBusy(true); const r = await call(fn, ok, () => { mem.reload(); onChanged(); }); setBusy(false); return r; };
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Who works where</h3>
      <Card className="overflow-x-auto !p-0"><Loading g={mem}>
        {(mem.data?.admins || []).length === 0 ? <EmptyState title="No administrators" /> : (
          <table className="w-full min-w-[560px] text-start text-sm"><tbody>{mem.data.admins.map((a) => (
            <tr key={a._id} className="border-b border-[#e3e7e7]/60 last:border-0">
              <td className="px-4 py-3"><p className="font-semibold">{a.name}</p><p className="text-xs text-[#5b6b7b]">{a.email}</p></td>
              <td className="px-4 py-3 text-xs">{a.schoolWide ? <Pill value="Approved">Whole school</Pill> : a.memberships.map((m) => (
                <span key={m._id} className="me-1 inline-flex items-center gap-1 rounded-md bg-[#eef2f8] px-2 py-0.5 font-semibold text-[#234c91]">{m.campusName}
                  <button aria-label={`Remove ${a.name} from ${m.campusName}`} className="text-[#9f1239]" disabled={busy} onClick={() => run(() => apiClient.delete(`/campuses/members/${m._id}`), 'Removed')}>×</button></span>))}</td>
              <td className="px-4 py-3 text-end">{active.length > 0 && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setAdmin({ user: a, campusId: active[0]._id })}>Limit to a campus</button>}</td></tr>))}</tbody></table>)}
      </Loading></Card>
      {admin && <Modal title={`Limit ${admin.user.name} to a campus`} onClose={() => setAdmin(null)}>
        <p className="mb-3 rounded-lg bg-[#fbf0ec] px-3 py-2 text-xs text-[#8a4636]">From now on they will see only this campus. At least one administrator always stays school-wide.</p>
        <Field label="Campus"><select className={inputCls} value={admin.campusId} onChange={(e) => setAdmin({ ...admin, campusId: e.target.value })}>{active.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setAdmin(null)}>Cancel</button>
          <button disabled={busy} className={btnPrimary} onClick={async () => { if (await run(() => apiClient.post('/campuses/members', { userId: admin.user._id, campusId: admin.campusId }), 'Access limited')) setAdmin(null); }}>Limit access</button></div>
      </Modal>}
    </div>
  );
}
