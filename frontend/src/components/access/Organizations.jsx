import React, { useState } from 'react';
import { Network } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note } from '../early/earlyKit';

// Platform owner: groups of schools. Grouping only helps the owner; it never opens one school's records to another.
export default function Organizations() {
  const g = useGet('/organizations'); const un = useGet('/organizations/unassigned-schools');
  const [form, setForm] = useState(null); const [add, setAdd] = useState(null); const [busy, setBusy] = useState(false);
  const reload = () => { g.reload(); un.reload(); };
  const run = async (fn, ok) => { setBusy(true); const r = await call(fn, ok, reload); setBusy(false); return r; };
  const orgs = g.data?.organizations || [];
  return (
    <div className="space-y-5">
      <Card><div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-lg font-bold"><Network className="h-5 w-5" /> Organizations</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#5b6b7b]">Put schools that belong to one owner or trust into a group. Schools in a group still cannot see each other's students, staff or money.</p></div>
        <button className={btnPrimary} onClick={() => setForm({ name: '', contactName: '', contactEmail: '' })}>New organization</button></div></Card>
      <Loading g={g}>{orgs.length === 0 ? <Card><EmptyState title="No organizations yet" text="Create one, then add schools to it." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">{orgs.map((o) => (
          <Card key={o._id}><div className="flex items-start justify-between gap-2"><div><p className="font-bold">{o.name}</p><p className="text-xs text-[#5b6b7b]">{o.contactName || 'No contact'}{o.contactEmail ? ` · ${o.contactEmail}` : ''}</p></div>
            <Pill value={o.status === 'active' ? 'Approved' : 'Suspended'}>{o.status === 'active' ? 'Active' : 'Suspended'}</Pill></div>
            <ul className="mt-3 divide-y divide-[#e3e7e7]/60 text-sm">{o.schools.length === 0 ? <li className="py-2 text-xs text-[#5b6b7b]">No schools yet</li> : o.schools.map((s) => (
              <li key={s._id} className="flex items-center justify-between py-2"><span><b>{s.name}</b> <span className="font-mono text-[11px] text-[#5b6b7b]">{s.code}</span></span>
                <button className={`${btnGhost} !px-2 !py-1 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.delete(`/organizations/${o._id}/schools/${s._id}`), 'School removed from the group')}>Remove</button></li>))}</ul>
            <div className="mt-3 flex gap-2"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={o.status !== 'active'} onClick={() => setAdd({ org: o, schoolId: '' })}>Add a school</button>
              <button className={`${o.status === 'active' ? btnDanger : btnGhost} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.patch(`/organizations/${o._id}`, { status: o.status === 'active' ? 'suspended' : 'active' }), o.status === 'active' ? 'Suspended' : 'Reactivated')}>{o.status === 'active' ? 'Suspend' : 'Reactivate'}</button></div></Card>))}</div>)}</Loading>

      {form && <Modal title="New organization" onClose={() => setForm(null)}><div className="space-y-3">
        <Field label="Name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Contact name"><input className={inputCls} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
        <Field label="Contact email"><input type="email" className={inputCls} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setForm(null)}>Cancel</button>
          <button disabled={busy || form.name.trim().length < 2} className={btnPrimary} onClick={async () => { if (await run(() => apiClient.post('/organizations', form), 'Organization created')) setForm(null); }}>Create</button></div></div></Modal>}

      {add && <Modal title={`Add a school to ${add.org.name}`} onClose={() => setAdd(null)}>
        <Field label="School"><select className={inputCls} value={add.schoolId} onChange={(e) => setAdd({ ...add, schoolId: e.target.value })}><option value="">Choose…</option>{(un.data?.schools || []).map((s) => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}</select></Field>
        {(un.data?.schools || []).length === 0 && <div className="mt-3"><Note>Every school already belongs to a group.</Note></div>}
        <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setAdd(null)}>Cancel</button>
          <button disabled={busy || !add.schoolId} className={btnPrimary} onClick={async () => { if (await run(() => apiClient.post(`/organizations/${add.org._id}/schools`, { schoolId: add.schoolId }), 'School added')) setAdd(null); }}>Add</button></div></Modal>}
    </div>
  );
}
