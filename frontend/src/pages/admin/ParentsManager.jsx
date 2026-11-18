import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Pencil, Plus, Search, Trash2, X, UserCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';

const inputCls = 'w-full rounded-xl border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]';
const empty = { name: '', email: '', phone: '', relationship: 'Father', password: '', childIds: [] };
const cls = (c) => (c ? `${c.standard}-${c.division}` : '—');

const ParentsManager = () => {
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'create' | parentObj
  const [form, setForm] = useState(empty);
  const [studentSearch, setStudentSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, s] = await Promise.all([
        apiClient.get('/parents', { params: { search, limit: 200 } }),
        apiClient.get('/students', { params: { limit: 1000 } }),
      ]);
      setParents(p.data.parents);
      setStudents(s.data.students || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load parents');
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const linkedElsewhere = useMemo(() => {
    const m = new Map();
    parents.forEach((p) => p.children.forEach((c) => m.set(c._id, (m.get(c._id) || 0) + 1)));
    return m;
  }, [parents]);

  const filteredStudents = students.filter((s) =>
    `${s.name} ${s.rollNumber || ''} ${cls(s.classId)}`.toLowerCase().includes(studentSearch.toLowerCase()));

  const openCreate = () => { setForm(empty); setStudentSearch(''); setModal('create'); };
  const openEdit = (p) => {
    setForm({ name: p.name, email: p.email, phone: p.phone || '', relationship: p.relationship, password: '', childIds: p.children.map((c) => c._id), isActive: p.isActive });
    setStudentSearch(''); setModal(p);
  };
  const toggleChild = (id) => setForm((f) => ({ ...f, childIds: f.childIds.includes(id) ? f.childIds.filter((x) => x !== id) : [...f.childIds, id] }));

  // Pre-fill parent fields from the first selected student's father/mother record
  const prefillFromStudent = (who) => {
    const s = students.find((x) => x._id === form.childIds[0]);
    const src = s?.[who];
    if (!src?.name) return toast.error(`No ${who} details saved on that student`);
    setForm((f) => ({ ...f, name: src.name, email: src.email || f.email, phone: src.mobileNumber || f.phone, relationship: who === 'father' ? 'Father' : 'Mother' }));
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (modal === 'create') {
        await apiClient.post('/parents', form);
        toast.success('Parent account created');
      } else {
        const body = { name: form.name, phone: form.phone, relationship: form.relationship, childIds: form.childIds, isActive: form.isActive };
        if (form.password) body.newPassword = form.password;
        await apiClient.put(`/parents/${modal._id}`, body);
        toast.success('Parent updated');
      }
      setModal(null); load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const remove = async (p) => {
    try { await apiClient.delete(`/parents/${p._id}`); toast.success('Parent deleted'); setConfirmDelete(null); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-[#1b2837]"><UserCheck className="h-5 w-5" /> Parent accounts</h2>
            <p className="mt-1 text-sm text-[#5b6b7b]">Create login accounts for parents/guardians and link them to their children. Parents get a read-only dashboard with live attendance.</p>
          </div>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#2a5cac] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#234c91]"><Plus className="h-4 w-4" /> Add parent</button>
        </div>
        <div className="relative mt-4 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6b7b]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email or phone…" className={`${inputCls} pl-9`} /></div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e3e7e7] bg-[#ffffff] shadow-sm">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-[10px] uppercase tracking-wider text-[#5b6b7b]">
            <tr>{['Parent', 'Relation', 'Children linked', 'Status', 'Last login', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-10 text-center text-[#5b6b7b]">Loading…</td></tr>}
            {!loading && parents.length === 0 && <tr><td colSpan={6} className="py-10 text-center italic text-[#5b6b7b]">No parent accounts yet. Click “Add parent”.</td></tr>}
            {parents.map((p) => (
              <tr key={p._id} className="border-b border-[#e3e7e7]/40 hover:bg-white/60">
                <td className="px-4 py-3"><p className="font-bold text-[#1b2837]">{p.name}</p><p className="text-[10px] text-[#5b6b7b]">{p.email}{p.phone ? ` · ${p.phone}` : ''}</p></td>
                <td className="px-4 py-3">{p.relationship}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{p.children.length === 0 ? <span className="italic text-[#5b6b7b]">none</span> : p.children.map((c) => (
                  <span key={c._id} className="inline-flex items-center gap-1 rounded-full bg-[#2a5cac]/10 px-2 py-0.5 text-[10px] font-bold text-[#2a5cac]"><Link2 className="h-3 w-3" /> {c.name} ({cls(c.classId)})</span>))}</div></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${p.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-[#fff1f2] text-[#9f1239]'}`}>{p.isActive ? 'Active' : 'Disabled'}</span></td>
                <td className="px-4 py-3 text-[#5b6b7b]">{p.lastLogin ? new Date(p.lastLogin).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-3">
                  {confirmDelete === p._id ? (
                    <div className="flex items-center gap-1"><button onClick={() => remove(p)} className="rounded-lg bg-[#be123c] px-2.5 py-1.5 font-bold text-white">Confirm</button><button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-[#e3e7e7] bg-white px-2.5 py-1.5 font-bold">Cancel</button></div>
                  ) : (
                    <div className="flex gap-1"><button onClick={() => openEdit(p)} className="rounded-lg border border-[#e3e7e7] bg-white p-1.5 text-[#2a5cac] hover:bg-[#f7f6f2]"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setConfirmDelete(p._id)} className="rounded-lg border border-[#e3e7e7] bg-white p-1.5 text-[#be123c] hover:bg-[#fff1f2]"><Trash2 className="h-4 w-4" /></button></div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{modal === 'create' ? 'Add parent account' : `Edit ${modal.name}`}</h3><button onClick={() => setModal(null)} className="rounded-full p-1.5 hover:bg-[#2a5cac]/10"><X className="h-5 w-5" /></button></div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#3b4a5c]">1. Select child / children</label>
                <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search student by name, roll or class…" className={`${inputCls} mb-2`} />
                <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-xl border border-[#e3e7e7] bg-white p-2 sm:grid-cols-2">
                  {filteredStudents.map((s) => (
                    <label key={s._id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${form.childIds.includes(s._id) ? 'bg-[#2a5cac]/10 font-bold text-[#2a5cac]' : 'hover:bg-[#f7f6f2]'}`}>
                      <input type="checkbox" checked={form.childIds.includes(s._id)} onChange={() => toggleChild(s._id)} />
                      <span className="flex-1">{s.name} <span className="text-[#5b6b7b]">· {cls(s.classId)}{s.rollNumber ? ` · #${s.rollNumber}` : ''}</span></span>
                      {linkedElsewhere.get(s._id) ? <span className="rounded bg-amber-100 px-1.5 text-[9px] font-bold text-amber-800">has parent</span> : null}
                    </label>
                  ))}
                  {filteredStudents.length === 0 && <p className="p-2 text-xs italic text-[#5b6b7b]">No students match.</p>}
                </div>
              </div>

              {modal === 'create' && form.childIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-bold text-[#3b4a5c]">Quick fill from student record:</span>
                  <button type="button" onClick={() => prefillFromStudent('father')} className="rounded-full border border-[#e3e7e7] bg-white px-3 py-1 font-bold text-[#2a5cac] hover:bg-[#f7f6f2]">Father's details</button>
                  <button type="button" onClick={() => prefillFromStudent('mother')} className="rounded-full border border-[#e3e7e7] bg-white px-3 py-1 font-bold text-[#2a5cac] hover:bg-[#f7f6f2]">Mother's details</button></div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">Full name</label><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">Login email</label><input required type="email" disabled={modal !== 'create'} className={`${inputCls} disabled:bg-stone-100`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">Phone</label><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">Relationship</label><select className={inputCls} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}><option>Father</option><option>Mother</option><option>Guardian</option></select></div>
                <div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">{modal === 'create' ? 'Password' : 'New password (leave blank to keep)'}</label>
                  <input required={modal === 'create'} type="text" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6, 1 capital, 1 number, 1 special" /></div>
                {modal !== 'create' && (
                  <div className="flex items-end"><label className="flex items-center gap-2 text-xs font-bold text-[#3b4a5c]"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Account active</label></div>)}
              </div>
              <p className="text-[11px] text-[#5b6b7b]">The parent signs in at the normal login page using the <b>school code</b>, this email and password.</p>
              <button className="rounded-xl bg-[#2a5cac] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#234c91]">{modal === 'create' ? 'Create parent account' : 'Save changes'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentsManager;
