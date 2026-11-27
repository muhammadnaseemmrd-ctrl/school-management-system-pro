// The group office: every school in the group, how big each one is, who runs it, and the doors to
// open a new school or appoint somebody to run one.
//
// There is nothing here from inside a school — no child, no mark, no fee. A group office sees the
// shape of the group and acts on the schools themselves.

import React, { useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  Building2, ChevronLeft, Copy, KeyRound, Loader2, Plus, School as SchoolIcon,
  ShieldCheck, UserPlus, Users,
} from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Stat, btnGhost, btnPrimary, btnDanger, errMsg, inputCls, fmtDate } from '../../components/ui';
import GroupFinance from '../../components/director/GroupFinance';

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-[#5b6b7b]">{hint}</span>}
  </label>
);

// A first-time password is shown once and must be carried away by hand.
const Credentials = ({ title, items, onClose }) => (
  <Modal title={title} onClose={onClose}>
    <p className="text-sm text-[#5b6b7b]">Write these down or copy them now. The password is shown only this once.</p>
    <div className="mt-3 space-y-2">
      {items.map((it) => (
        <div key={it.email} className="rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3">
          <p className="font-bold text-[#1b2837]">{it.name}</p>
          <dl className="mt-1 grid grid-cols-[9rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-[#5b6b7b]">School code</dt><dd className="font-mono">{it.schoolCode}</dd>
            <dt className="text-[#5b6b7b]">Sign-in email</dt><dd className="font-mono break-all">{it.email}</dd>
            <dt className="text-[#5b6b7b]">First password</dt><dd className="font-mono">{it.temporaryPassword}</dd>
          </dl>
          <button
            type="button"
            className={`${btnGhost} mt-2 !px-3 !py-1.5 !text-xs`}
            onClick={() => { navigator.clipboard?.writeText(`School code: ${it.schoolCode}\nEmail: ${it.email}\nPassword: ${it.temporaryPassword}`); toast.success('Copied'); }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
      ))}
    </div>
    <div className="mt-4 flex justify-end"><button type="button" className={btnPrimary} onClick={onClose}>Done</button></div>
  </Modal>
);

/* ── one school ── */
function SchoolView({ id, onBack, onChanged, canAppoint }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(null);
  const [creds, setCreds] = useState(null);
  const [close, setClose] = useState(null);

  const load = useCallback(() => {
    apiClient.get(`/director/schools/${id}`).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e, 'Could not open that school')));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>;
  const s = d.school;

  const appoint = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post(`/director/schools/${id}/admins`, add);
      setCreds([{ name: r.data.admin.name, email: r.data.admin.email, temporaryPassword: r.data.temporaryPassword, schoolCode: r.data.schoolCode }]);
      setAdd(null); load(); onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not appoint them')); }
    setBusy(false);
  };

  const reset = async (u) => {
    try {
      const r = await apiClient.post(`/director/schools/${id}/admins/${u._id}/reset`);
      setCreds([{ name: u.name, email: r.data.email, temporaryPassword: r.data.temporaryPassword, schoolCode: r.data.schoolCode }]);
    } catch (e) { toast.error(errMsg(e, 'Could not reset the password')); }
  };

  const setActive = async (u, active) => {
    try { await apiClient.post(`/director/schools/${id}/admins/${u._id}/active`, { active }); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not change that')); }
  };

  const setOpen = async (open, reason) => {
    try { await apiClient.post(`/director/schools/${id}/open`, { open, reason }); setClose(null); load(); onChanged(); toast.success(open ? 'The school is open again' : 'The school is closed'); }
    catch (e) { toast.error(errMsg(e, 'Could not change that')); }
  };

  return (
    <div className="space-y-5">
      <button type="button" className={btnGhost} onClick={onBack}><ChevronLeft className="h-4 w-4" /> All schools</button>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[#1b2837]">{s.name}</h2>
            {s.nameUr && <p className="text-lg text-[#1b2837]" dir="rtl" lang="ur">{s.nameUr}</p>}
            <p className="mt-1 text-sm text-[#5b6b7b]">{s.institutionLabel || 'School'} · code <b className="font-mono">{s.code}</b> · {s.email} · {s.phone}{s.city ? ` · ${s.city}` : ''}</p>
            {!s.isActive && <p className="mt-2 inline-block rounded-full bg-[#fff1f2] px-3 py-1 text-xs font-bold text-[#9f1239]">Closed — nobody here can sign in</p>}
          </div>
          <div className="flex gap-2">
            {s.isActive
              ? <button type="button" className={btnDanger} onClick={() => setClose({ reason: '' })}>Close this school</button>
              : <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>Open it again</button>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Children" value={s.counts.students} />
          <Stat label="Teachers" value={s.counts.teachers} />
          <Stat label="Classes" value={s.counts.classes} />
          <Stat label="Branches" value={s.counts.campuses} />
          <Stat label="People running it" value={s.counts.admins} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#1b2837]">Who runs this school</h3>
            <p className="text-xs text-[#5b6b7b]">They sign in at the school's own door with the school code {s.code}.</p>
          </div>
          {canAppoint && <button type="button" className={btnPrimary} onClick={() => setAdd({ name: '', email: '', phone: '', title: 'Principal' })}><UserPlus className="h-4 w-4" /> Appoint somebody</button>}
        </div>
        <div className="mt-3 overflow-auto rounded-xl border border-[#e3e7e7]">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f6f2] text-xs uppercase tracking-wider text-[#4f5f70]">
              <tr><th className="px-3 py-2 text-start">Name</th><th className="px-3 py-2 text-start">Signs in with</th><th className="px-3 py-2 text-start">Last seen</th><th className="px-3 py-2 text-end">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e3e7e7] bg-white">
              {d.admins.map((a) => (
                <tr key={a._id}>
                  <td className="px-3 py-2 font-semibold text-[#1b2837]">{a.name}{!a.isActive && <span className="ms-2 rounded-full bg-[#f1f1ee] px-2 py-0.5 text-[11px] text-[#5b6b7b]">switched off</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#5b6b7b]">{a.email}</td>
                  <td className="px-3 py-2 text-[#5b6b7b]">{a.lastLogin ? fmtDate(a.lastLogin) : 'never'}</td>
                  <td className="px-3 py-2 text-end">
                    {canAppoint && (
                      <span className="inline-flex gap-2">
                        <button type="button" className={`${btnGhost} !px-2.5 !py-1 !text-xs`} onClick={() => reset(a)}><KeyRound className="h-3.5 w-3.5" /> New password</button>
                        <button type="button" className={`${btnGhost} !px-2.5 !py-1 !text-xs`} onClick={() => setActive(a, !a.isActive)}>{a.isActive ? 'Switch off' : 'Switch on'}</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {!!d.campuses.length && (
        <Card>
          <h3 className="text-lg font-black text-[#1b2837]">Its branches</h3>
          <p className="text-xs text-[#5b6b7b]">Branches are set up inside the school by the people who run it.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.campuses.map((c) => (
              <li key={c._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm">
                <span className="font-semibold text-[#1b2837]">{c.name}</span>
                <span className="ms-2 font-mono text-xs text-[#5b6b7b]">{c.code}</span>
                {c.isDefault && <span className="ms-2 rounded-full bg-[#e8eefb] px-2 py-0.5 text-[11px] font-bold text-[#234c91]">main</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {add && (
        <Modal title="Appoint somebody to run this school" onClose={() => setAdd(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><input className={inputCls} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Title"><input className={inputCls} value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="Principal" /></Field>
            <Field label="Email" hint="This is how they sign in."><input type="email" className={inputCls} value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
            <Field label="Mobile"><input className={inputCls} value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setAdd(null)}>Cancel</button>
            <button type="button" className={btnPrimary} disabled={busy || add.name.trim().length < 2 || !add.email.includes('@')} onClick={appoint}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Appoint
            </button>
          </div>
        </Modal>
      )}

      {close && (
        <Modal title={`Close ${s.name}?`} onClose={() => setClose(null)}>
          <p className="text-sm text-[#5b6b7b]">Nobody at this school will be able to sign in until you open it again. Nothing is deleted.</p>
          <Field label="Why"><input className={`${inputCls} mt-2`} value={close.reason} onChange={(e) => setClose({ reason: e.target.value })} placeholder="Building work until April" /></Field>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setClose(null)}>Cancel</button>
            <button type="button" className={btnDanger} disabled={close.reason.trim().length < 5} onClick={() => setOpen(false, close.reason)}>Close the school</button>
          </div>
        </Modal>
      )}

      {creds && <Credentials title="First-time sign-in" items={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}

/* ── the group ── */
export default function DirectorDashboard() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [make, setMake] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState(null);
  const [tab, setTab] = useState('schools');
  const [kinds, setKinds] = useState([]);
  useEffect(() => { apiClient.get('/director/institution-types').then((r) => setKinds(r.data.types || [])).catch(() => {}); }, []);

  const load = useCallback(() => {
    apiClient.get('/director/overview').then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load the group')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post('/director/schools', make);
      setCreds([{ name: r.data.admin.name, email: r.data.admin.email, temporaryPassword: r.data.admin.temporaryPassword, schoolCode: r.data.admin.schoolCode }]);
      setMake(null); load();
      toast.success('The school is open');
    } catch (e) { toast.error(errMsg(e, 'Could not open the school')); }
    setBusy(false);
  };

  return (
    <div className="page-ready mx-auto max-w-7xl px-4 py-6">
      <Toaster position="top-right" />
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e3e7e7] bg-white px-4 py-3">
        <Building2 className="h-6 w-6 text-[#2a5cac]" />
        <div className="flex-1">
          <p className="font-display text-base font-bold text-[#1b2837]">{d?.organization?.name || 'Group office'}</p>
          <p className="text-xs text-[#5b6b7b]">{d?.director?.title || 'Director'}{d?.director ? ` · ${d.director.name}` : ''}</p>
        </div>
      </div>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Group office sections">
        {[{ id: 'schools', label: 'Schools' }, { id: 'finance', label: 'Money' }].map((x) => (
          <button
            key={x.id}
            type="button"
            aria-current={tab === x.id ? 'page' : undefined}
            onClick={() => { setTab(x.id); setOpen(null); }}
            className={`rounded-full px-4 py-2 text-sm font-bold ${tab === x.id ? 'bg-[#1b2837] text-white' : 'bg-white text-[#4f5f70] border border-[#e3e7e7]'}`}
          >
            {x.label}
          </button>
        ))}
      </nav>

      <main className="space-y-5">
        {tab === 'finance' ? <GroupFinance /> : !d ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>
        ) : open ? (
          <SchoolView id={open} onBack={() => { setOpen(null); load(); }} onChanged={load} canAppoint={d.director.canAppointAdmins} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Schools" value={d.totals.schools} sub={`${d.totals.open} open`} />
              <Stat label="Children" value={d.totals.students.toLocaleString()} />
              <Stat label="Teachers" value={d.totals.teachers.toLocaleString()} />
              <Stat label="Classes" value={d.totals.classes.toLocaleString()} />
              <Stat label="Branches" value={d.totals.campuses.toLocaleString()} />
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm text-[#5b6b7b]">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1f5e53]" />
              <span>
                The group office sees how big each school is and who runs it. It does not open a child's record, a mark or a
                fee — for that, ask the school to give you an account of your own there.
              </span>
            </p>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-[#1b2837]">Schools in this group</h2>
                  <p className="text-xs text-[#5b6b7b]">Open one to see who runs it, appoint somebody, or close it.</p>
                </div>
                {d.director.canCreateSchools && (
                  <button type="button" className={btnPrimary} onClick={() => setMake({ name: '', nameUr: '', institutionType: 'school', code: '', email: '', phone: '', city: '', adminName: '', adminEmail: '' })}>
                    <Plus className="h-4 w-4" /> Open a school
                  </button>
                )}
              </div>

              {!d.schools.length ? (
                <div className="mt-4 rounded-xl border border-dashed border-[#e3e7e7] p-10 text-center">
                  <SchoolIcon className="mx-auto h-8 w-8 text-[#5b6b7b]" />
                  <p className="mt-2 font-semibold text-[#1b2837]">No schools yet</p>
                  <p className="text-sm text-[#5b6b7b]">Open the first one and name the person who will run it.</p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {d.schools.map((s) => (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => setOpen(s._id)}
                      className="rounded-xl border border-[#e3e7e7] bg-white p-4 text-start transition hover:border-[#2a5cac] hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-[#1b2837]">{s.name}</p>
                          <p className="font-mono text-xs text-[#5b6b7b]">{s.code}{s.city ? ` · ${s.city}` : ''}</p>
                          <p className="text-xs font-semibold text-[#2a5cac]">{s.institutionLabel || 'School'}</p>
                        </div>
                        <Building2 className="h-4 w-4 flex-shrink-0 text-[#2a5cac]" />
                      </div>
                      {!s.isActive && <p className="mt-2 inline-block rounded-full bg-[#fff1f2] px-2 py-0.5 text-[11px] font-bold text-[#9f1239]">closed</p>}
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-[#f7f6f2] p-2"><dt className="text-[11px] text-[#5b6b7b]">Children</dt><dd className="font-bold text-[#1b2837]">{s.counts.students}</dd></div>
                        <div className="rounded-lg bg-[#f7f6f2] p-2"><dt className="text-[11px] text-[#5b6b7b]">Teachers</dt><dd className="font-bold text-[#1b2837]">{s.counts.teachers}</dd></div>
                        <div className="rounded-lg bg-[#f7f6f2] p-2"><dt className="text-[11px] text-[#5b6b7b]">Branches</dt><dd className="font-bold text-[#1b2837]">{s.counts.campuses}</dd></div>
                      </dl>
                      <p className="mt-2 flex items-center gap-1 text-xs text-[#5b6b7b]"><Users className="h-3.5 w-3.5" /> {s.principalName || 'nobody named yet'}</p>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>

      {make && (
        <Modal title="Open a school in this group" onClose={() => setMake(null)} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="School name"><input className={inputCls} value={make.name} onChange={(e) => setMake({ ...make, name: e.target.value })} placeholder="Iqra Model School, Satellite Town" /></Field>
            <Field label="What kind of institution" hint={(kinds.find((k) => k.key === make.institutionType) || {}).blurb || 'It decides which screens the staff there see.'}>
              <select className={inputCls} value={make.institutionType} onChange={(e) => setMake({ ...make, institutionType: e.target.value })}>
                {(kinds.length ? kinds : [{ key: 'school', label: 'School' }]).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </Field>
            <Field label="School name in Urdu" hint="Optional. Shown while a page is in Urdu."><input className={inputCls} dir="rtl" lang="ur" value={make.nameUr} onChange={(e) => setMake({ ...make, nameUr: e.target.value })} /></Field>
            <Field label="School code" hint="People type this when they sign in."><input className={`${inputCls} font-mono uppercase`} value={make.code} onChange={(e) => setMake({ ...make, code: e.target.value.toUpperCase() })} placeholder="IQ-ST" /></Field>
            <Field label="City"><input className={inputCls} value={make.city} onChange={(e) => setMake({ ...make, city: e.target.value })} /></Field>
            <Field label="School email"><input type="email" className={inputCls} value={make.email} onChange={(e) => setMake({ ...make, email: e.target.value })} /></Field>
            <Field label="School phone"><input className={inputCls} value={make.phone} onChange={(e) => setMake({ ...make, phone: e.target.value })} /></Field>
          </div>
          <div className="mt-4 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3">
            <p className="text-sm font-bold text-[#1b2837]">Who will run it</p>
            <p className="text-xs text-[#5b6b7b]">They get a first-time password, shown once when the school opens.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Their name"><input className={inputCls} value={make.adminName} onChange={(e) => setMake({ ...make, adminName: e.target.value })} /></Field>
              <Field label="Their email"><input type="email" className={inputCls} value={make.adminEmail} onChange={(e) => setMake({ ...make, adminEmail: e.target.value })} /></Field>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setMake(null)}>Cancel</button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || make.name.trim().length < 2 || make.code.trim().length < 2 || !make.email.includes('@') || !make.phone.trim() || make.adminName.trim().length < 2 || !make.adminEmail.includes('@')}
              onClick={create}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Open the school
            </button>
          </div>
        </Modal>
      )}

      {creds && <Credentials title="The school is open" items={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}
