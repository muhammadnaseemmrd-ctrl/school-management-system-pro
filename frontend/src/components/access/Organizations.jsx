import React, { useState } from 'react';
import { Copy, Network, UserCog } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note } from '../early/earlyKit';

// The people who run a group. A director signs in at /director/login, opens schools in their group
// and appoints the people who run them; they never read inside a school.
function Directors({ org, onClose }) {
  const g = useGet(`/organizations/${org._id}/directors`);
  const [form, setForm] = useState(null); const [busy, setBusy] = useState(false); const [made, setMade] = useState(null);
  const run = async (fn, ok) => { setBusy(true); const r = await call(fn, ok, g.reload); setBusy(false); return r; };
  const rows = g.data?.directors || [];
  return (
    <Modal title={`Directors of ${org.name}`} onClose={onClose} wide>
      <p className="text-sm text-[#5b6b7b]">A director opens schools in this group and appoints the people who run them. They sign in at <b className="font-mono">/director/login</b> and never see a school&apos;s own records.</p>
      <Loading g={g}>
        {rows.length === 0 ? <div className="mt-3"><Note>No director yet.</Note></div> : (
          <ul className="mt-3 divide-y divide-[#e3e7e7]">
            {rows.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold">{d.name}</span>
                <span className="font-mono text-xs text-[#5b6b7b]">{d.email}</span>
                <Pill value={d.isActive ? 'Approved' : 'Suspended'}>{d.isActive ? 'Active' : 'Suspended'}</Pill>
                {!d.canCreateSchools && <span className="rounded-full bg-[#f1f1ee] px-2 py-0.5 text-[11px] text-[#5b6b7b]">cannot open schools</span>}
                <span className="ms-auto flex gap-2">
                  <button className={`${btnGhost} !px-2 !py-1 !text-xs`} disabled={busy} onClick={() => run(async () => { const r = await apiClient.post(`/organizations/${org._id}/directors/${d._id}/reset`); setMade({ name: d.name, email: r.data.email, temporaryPassword: r.data.temporaryPassword }); return r; }, 'New password made')}>New password</button>
                  <button className={`${btnGhost} !px-2 !py-1 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.patch(`/organizations/${org._id}/directors/${d._id}`, { canCreateSchools: !d.canCreateSchools }), 'Saved')}>{d.canCreateSchools ? 'Stop new schools' : 'Allow new schools'}</button>
                  <button className={`${(d.isActive ? btnDanger : btnGhost)} !px-2 !py-1 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.patch(`/organizations/${org._id}/directors/${d._id}`, { isActive: !d.isActive }), d.isActive ? 'Suspended' : 'Reactivated')}>{d.isActive ? 'Suspend' : 'Reactivate'}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Loading>
      {made && (
        <div className="mt-3 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3 text-sm">
          <p className="font-bold text-[#1b2837]">First-time password for {made.name}</p>
          <p className="font-mono text-xs">{made.email} · {made.temporaryPassword}</p>
          <button className={`${btnGhost} mt-2 !px-3 !py-1.5 !text-xs`} onClick={() => { navigator.clipboard?.writeText(`${made.email} / ${made.temporaryPassword}`); toast.success('Copied'); }}><Copy className="h-3.5 w-3.5" /> Copy</button>
          <p className="mt-1 text-[11px] text-[#5b6b7b]">Shown once. Hand it over and ask them to change it.</p>
        </div>
      )}
      <div className="mt-4 flex justify-between gap-2">
        <button className={btnPrimary} onClick={() => setForm({ name: '', email: '', phone: '', title: 'Director' })}>Appoint a director</button>
        <button className={btnGhost} onClick={onClose}>Close</button>
      </div>
      {form && (
        <Modal title={`Appoint a director of ${org.name}`} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <Field label="Full name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email" hint="This is how they sign in."><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Mobile"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setForm(null)}>Cancel</button>
              <button
                disabled={busy || form.name.trim().length < 2 || !form.email.includes('@')}
                className={btnPrimary}
                onClick={async () => { const r = await run(async () => { const res = await apiClient.post(`/organizations/${org._id}/directors`, form); setMade({ name: form.name, email: res.data.director.email, temporaryPassword: res.data.temporaryPassword }); return res; }, 'Director appointed'); if (r) setForm(null); }}
              >
                Appoint
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

// Platform owner: groups of schools. Grouping only helps the owner; it never opens one school's records to another.
export default function Organizations() {
  const g = useGet('/organizations'); const un = useGet('/organizations/unassigned-schools');
  const [form, setForm] = useState(null); const [add, setAdd] = useState(null); const [busy, setBusy] = useState(false);
  const [dirs, setDirs] = useState(null);
  const reload = () => { g.reload(); un.reload(); };
  const run = async (fn, ok) => { setBusy(true); const r = await call(fn, ok, reload); setBusy(false); return r; };
  const orgs = g.data?.organizations || [];
  return (
    <div className="space-y-5">
      <Card><div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-lg font-bold"><Network className="h-5 w-5" /> Organizations</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#5b6b7b]">Put schools that belong to one owner or trust into a group. Schools in a group still cannot see each other's students, staff or money.</p></div>
        <button className={btnPrimary} onClick={() => setForm({ name: '', contactName: '', contactEmail: '' })}>New organization</button></div></Card>
      <Card>
        <details className="group" open={orgs.length === 0}>
          <summary className="cursor-pointer text-sm font-black text-[#2a5cac] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2a5cac]">How organizations work (read this first)</summary>
          <div className="mt-3 space-y-3 text-sm text-[#3b4a5c]">
            <ol className="list-decimal space-y-1.5 ps-5">
              <li><b>Create the organization.</b> It is just a name for one owner or trust, for example &quot;Sunrise Education Trust&quot;.</li>
              <li><b>Add schools to it.</b> Use &quot;Add a school&quot; and pick from schools that are not in a group yet. A school can be in one group at a time.</li>
              <li><b>Appoint a director.</b> Under &quot;Directors&quot;, give the owner&apos;s representative an email. They get a first-time password and sign in at <span className="font-mono">/director/login</span>.</li>
              <li><b>The director works across the group.</b> They open the schools of the group, open new schools if you allowed it, and appoint the people who run each school. They never read a school&apos;s students, staff or money.</li>
              <li><b>People in several linked schools.</b> If one email is used in two schools of the same group (for example a teacher at one branch and a parent at another), that person sees a Switch account button and moves between them without signing in again.</li>
            </ol>
            <p className="rounded-xl bg-[#f7f6f2] p-3"><b>Example:</b> You create &quot;Sunrise Trust&quot;, add &quot;Sunrise Boys&quot; and &quot;Sunrise Girls&quot;, and appoint Ms. Rana as director. She signs in, opens both schools, and appoints a principal for each. Sunrise Boys still cannot see Sunrise Girls&apos; records.</p>
            <p className="text-xs text-[#5b6b7b]"><b>Suspending</b> an organization stops new schools being added to it. <b>Removing</b> a school from a group does not delete the school or its data.</p>
          </div>
        </details>
      </Card>
      <Loading g={g}>{orgs.length === 0 ? <Card><EmptyState title="No organizations yet" text="Create one, then add schools to it." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">{orgs.map((o) => (
          <Card key={o._id}><div className="flex items-start justify-between gap-2"><div><p className="font-bold">{o.name}</p><p className="text-xs text-[#5b6b7b]">{o.contactName || 'No contact'}{o.contactEmail ? ` · ${o.contactEmail}` : ''}</p></div>
            <Pill value={o.status === 'active' ? 'Approved' : 'Suspended'}>{o.status === 'active' ? 'Active' : 'Suspended'}</Pill></div>
            <ul className="mt-3 divide-y divide-[#e3e7e7]/60 text-sm">{o.schools.length === 0 ? <li className="py-2 text-xs text-[#5b6b7b]">No schools yet</li> : o.schools.map((s) => (
              <li key={s._id} className="flex items-center justify-between py-2"><span><b>{s.name}</b> <span className="font-mono text-[11px] text-[#5b6b7b]">{s.code}</span></span>
                <button className={`${btnGhost} !px-2 !py-1 !text-xs`} disabled={busy} onClick={() => run(() => apiClient.delete(`/organizations/${o._id}/schools/${s._id}`), 'School removed from the group')}>Remove</button></li>))}</ul>
            <div className="mt-3 flex flex-wrap gap-2"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={o.status !== 'active'} onClick={() => setAdd({ org: o, schoolId: '' })}>Add a school</button>
              <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setDirs(o)}><UserCog className="h-3.5 w-3.5" /> Directors</button>
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

      {dirs && <Directors org={dirs} onClose={() => { setDirs(null); reload(); }} />}
    </div>
  );
}
