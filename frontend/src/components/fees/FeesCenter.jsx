import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, CheckCircle2, Eye, Plus, Receipt, Shirt, Trash2, X, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { rs, StatusPill } from './FeesPanel';

const Card = ({ className = '', children }) => <div className={`rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm ${className}`}>{children}</div>;
const inputCls = 'w-full rounded-xl border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]';
const Field = ({ label, children }) => <div><label className="mb-1 block text-xs font-bold text-[#3b4a5c]">{label}</label>{children}</div>;
const btn = 'rounded-xl bg-[#2a5cac] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#234c91] disabled:opacity-50';
const TYPES = ['Uniform', 'Books', 'Admission', 'Exam', 'Trip', 'Other'];
const clsName = (c) => (c ? `${c.standard}${c.division ? '-' + c.division : ''}` : '');

const SUBTABS = [['proofs', 'Payment reviews', Receipt], ['charges', 'Other fees', Shirt], ['transport', 'Transport', Bus]];

const FeesCenter = ({ classes = [], students = [], transportOn = true }) => {
  const [sub, setSub] = useState('proofs');
  const tabs = SUBTABS.filter(([id]) => id !== 'transport' || transportOn);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setSub(id)} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black ${sub === id ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white text-[#3b4a5c] hover:bg-[#f7f6f2]'}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      {sub === 'proofs' && <Proofs />}
      {sub === 'charges' && <Charges classes={classes} students={students} />}
      {sub === 'transport' && transportOn && <Transport students={students} classes={classes} />}
    </div>
  );
};

/* ───────────── payment screenshots waiting for the school ───────────── */
const Proofs = () => {
  const [status, setStatus] = useState('Pending');
  const [data, setData] = useState({ proofs: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); const r = await apiClient.get('/fees/proofs', { params: { status } }); setData(r.data); }
    catch (e) { toast.error(e.response?.data?.message || 'Could not load payments'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const review = async (p, action, reviewNote = '') => {
    try {
      setBusy(true);
      await apiClient.put(`/fees/proofs/${p._id}/review`, { action, note: reviewNote });
      toast.success(action === 'approve' ? 'Marked as paid' : 'Payment rejected');
      setRejecting(null); setNote(''); setView(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {['Pending', 'Approved', 'Rejected'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-4 py-1.5 text-xs font-black ${status === s ? 'border-[#2a5cac] bg-[#eef2f8] text-[#2a5cac]' : 'border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>
            {s === 'Pending' ? 'To review' : s === 'Approved' ? 'Paid' : 'Rejected'} {data.counts?.[s] ? `(${data.counts[s]})` : ''}
          </button>
        ))}
      </div>
      {loading && <p className="py-8 text-center text-sm text-[#5b6b7b]">Loading...</p>}
      {!loading && data.proofs.length === 0 && <Card><p className="py-6 text-center text-sm italic text-[#5b6b7b]">{status === 'Pending' ? 'Nothing waiting. New payment screenshots from students and parents will appear here.' : 'No payments here.'}</p></Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.proofs.map((p) => (
          <Card key={p._id} className="space-y-3">
            <div className="flex gap-3">
              <button onClick={() => setView(p)} className="relative shrink-0 overflow-hidden rounded-xl border border-[#e3e7e7] bg-white" title="View screenshot">
                <img src={p.screenshotUrl} alt="payment" className="h-24 w-24 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-0.5 text-[10px] font-bold text-white"><Eye className="h-3 w-3" />View</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[#1b2837]">{p.studentId?.name || 'Student'}</p>
                <p className="text-xs font-semibold text-[#5b6b7b]">Class {clsName(p.studentId?.classId)}{p.studentId?.rollNumber ? ` · Roll ${p.studentId.rollNumber}` : ''}</p>
                <p className="mt-1 text-lg font-black text-[#2a5cac]">{rs(p.totalAmount)}</p>
                <p className="text-[11px] text-[#5b6b7b]">{p.method}{p.reference ? ` · ${p.reference}` : ''} · by {p.submittedByRole} · {new Date(p.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <ul className="space-y-1 rounded-xl bg-white px-3 py-2 text-xs text-[#3b4a5c]">
              {p.items.map((i, k) => <li key={k} className="flex justify-between gap-2"><span>{i.label}</span><b>{rs(i.amount)}</b></li>)}
            </ul>
            {p.note && <p className="rounded-xl bg-[#f7f6f2] px-3 py-2 text-xs italic text-[#3b4a5c]">"{p.note}"</p>}
            {p.status === 'Pending' ? (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => review(p, 'approve')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" />Mark as paid</button>
                <button disabled={busy} onClick={() => { setRejecting(p); setNote(''); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-black text-white hover:bg-rose-700"><XCircle className="h-4 w-4" />Reject</button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs"><StatusPill status={p.status === 'Approved' ? 'Paid' : 'Rejected'} /><span className="text-[#5b6b7b]">{p.reviewedAt ? new Date(p.reviewedAt).toLocaleDateString() : ''}{p.reviewNote ? ` · ${p.reviewNote}` : ''}</span></div>
            )}
          </Card>
        ))}
      </div>

      {view && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setView(null)}>
          <div className="relative max-h-[92vh] max-w-3xl overflow-auto rounded-2xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setView(null)} className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white"><X className="h-4 w-4" /></button>
            {/\.pdf($|\?)/i.test(view.screenshotUrl) ? <a className="block p-8 font-bold text-[#2a5cac] underline" href={view.screenshotUrl} target="_blank" rel="noopener noreferrer">Open PDF</a> : <img src={view.screenshotUrl} alt="payment proof" className="max-h-[88vh] rounded-xl" />}
          </div>
        </div>
      )}
      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-2xl">
            <h3 className="text-lg font-black">Reject payment of {rs(rejecting.totalAmount)}?</h3>
            <p className="mt-1 text-xs text-[#3b4a5c]">The parent will see your reason and can send a new screenshot.</p>
            <textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Screenshot is unclear / amount does not match" className={`${inputCls} mt-3`} />
            <div className="mt-4 flex gap-2"><button disabled={!note.trim() || busy} onClick={() => review(rejecting, 'reject', note)} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">Reject payment</button><button onClick={() => setRejecting(null)} className="rounded-xl border border-[#e3e7e7] bg-white px-4 py-2.5 text-xs font-bold">Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ───────────── uniform / books / admission / exam / trip fees ───────────── */
const Charges = ({ classes, students }) => {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ paid: 0, unpaid: 0 });
  const [filters, setFilters] = useState({ type: '', status: '', classId: '', q: '' });
  const [show, setShow] = useState(false);
  const blank = { title: '', type: 'Uniform', amount: '', dueDate: '', mode: 'class', classId: '', standard: '', studentIds: [], note: '', search: '' };
  const [f, setF] = useState(blank);

  const load = useCallback(async () => {
    try { const r = await apiClient.get('/fees/charges', { params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }); setRows(r.data.charges); setTotals(r.data.totals); }
    catch (e) { toast.error(e.response?.data?.message || 'Could not load fees'); }
  }, [filters]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);

  const standards = useMemo(() => Array.from(new Set(classes.map((c) => c.standard))), [classes]);
  const matches = useMemo(() => (f.search ? students.filter((s) => s.name?.toLowerCase().includes(f.search.toLowerCase())).slice(0, 8) : []), [students, f.search]);

  const create = async (e) => {
    e.preventDefault();
    const target = f.mode === 'class' ? { mode: 'class', classId: f.classId } : f.mode === 'standard' ? { mode: 'standard', standard: f.standard } : f.mode === 'students' ? { mode: 'students', studentIds: f.studentIds } : { mode: 'all' };
    try {
      const r = await apiClient.post('/fees/charges', { title: f.title, type: f.type, amount: Number(f.amount), dueDate: f.dueDate || undefined, note: f.note, target });
      toast.success(r.data.message); setShow(false); setF(blank); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not add fee'); }
  };
  const mark = async (c, status) => { try { await apiClient.put(`/fees/charges/${c._id}/mark`, { status }); toast.success(status === 'Paid' ? 'Marked as paid' : 'Marked as unpaid'); load(); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } };
  const del = async (c) => { if (!window.confirm('Delete this fee?')) return; try { await apiClient.delete(`/fees/charges/${c._id}`); toast.success('Deleted'); load(); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } };

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3">
        <input placeholder="Search student or fee..." value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className={`${inputCls} !w-52`} />
        <select className={`${inputCls} !w-auto`} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All types</option>{['Transport', ...TYPES].map((x) => <option key={x}>{x}</option>)}</select>
        <select className={`${inputCls} !w-auto`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Paid & unpaid</option><option>Unpaid</option><option>Paid</option></select>
        <select className={`${inputCls} !w-auto`} value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">All classes</option>{classes.map((c) => <option key={c._id} value={c._id}>{clsName(c)}</option>)}</select>
        <div className="ml-auto text-xs font-bold text-[#3b4a5c]">Unpaid <span className="text-[#be123c]">{rs(totals.unpaid)}</span> · Paid <span className="text-emerald-700">{rs(totals.paid)}</span></div>
        <button onClick={() => setShow(true)} className={`${btn} inline-flex items-center gap-1.5`}><Plus className="h-4 w-4" />Add fee</button>
      </Card>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-[10px] uppercase tracking-wider text-[#5b6b7b]"><tr>{['Student', 'Class', 'Fee', 'Amount', 'Due', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center italic text-[#5b6b7b]">No fees yet. Use "Add fee" for uniform, books, admission, exam or trip fees.</td></tr>}
            {rows.map((c) => (
              <tr key={c._id} className="border-b border-[#e3e7e7]/40 hover:bg-white/60">
                <td className="px-4 py-2.5 font-bold text-[#1b2837]">{c.studentId?.name || '—'}</td>
                <td className="px-4 py-2.5">{clsName(c.classId)}</td>
                <td className="px-4 py-2.5"><span className="mr-1.5 rounded-full bg-[#2a5cac]/10 px-2 py-0.5 text-[10px] font-black text-[#2a5cac]">{c.type}</span>{c.title}</td>
                <td className="px-4 py-2.5 font-black">{rs(c.amount)}</td>
                <td className="px-4 py-2.5">{c.dueDate ? new Date(c.dueDate).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2.5"><StatusPill status={c.status === 'Paid' ? 'Paid' : c.underReview ? 'Under review' : 'Unpaid'} /></td>
                <td className="px-4 py-2.5"><div className="flex gap-1">
                  {c.status === 'Paid' ? <button onClick={() => mark(c, 'Unpaid')} className="rounded-lg border border-[#e3e7e7] bg-white px-2 py-1 font-bold">Undo</button> : <button onClick={() => mark(c, 'Paid')} title="Record cash received at school" className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 font-bold text-emerald-800">Cash received</button>}
                  {c.status !== 'Paid' && <button onClick={() => del(c)} className="rounded-lg border border-[#e3e7e7] bg-white p-1.5 text-[#be123c]"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={create} className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="text-lg font-black">Add a fee</h3><button type="button" onClick={() => setShow(false)}><X className="h-5 w-5" /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Amount (PKR)"><input required type="number" min="1" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            </div>
            <Field label="Fee name"><input required className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Winter uniform set" /></Field>
            <Field label="Last date to pay (optional)"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
            <Field label="Charge to">
              <select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                <option value="class">One class</option><option value="standard">All sections of a standard</option><option value="students">Selected students</option><option value="all">Every student in the school</option>
              </select>
            </Field>
            {f.mode === 'class' && <Field label="Class"><select required className={inputCls} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">Choose...</option>{classes.map((c) => <option key={c._id} value={c._id}>{clsName(c)}</option>)}</select></Field>}
            {f.mode === 'standard' && <Field label="Standard"><select required className={inputCls} value={f.standard} onChange={(e) => setF({ ...f, standard: e.target.value })}><option value="">Choose...</option>{standards.map((x) => <option key={x}>{x}</option>)}</select></Field>}
            {f.mode === 'students' && (
              <div>
                <input className={inputCls} placeholder="Type a student name..." value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
                {matches.length > 0 && <div className="mt-1 rounded-xl border border-[#e3e7e7] bg-white">{matches.map((s) => <button type="button" key={s._id} onClick={() => setF({ ...f, studentIds: Array.from(new Set([...f.studentIds, s._id])), search: '' })} className="block w-full px-3 py-2 text-left text-xs hover:bg-[#f7f6f2]">{s.name} <span className="text-[#5b6b7b]">· {clsName(s.classId)}</span></button>)}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5">{f.studentIds.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#2a5cac]/10 px-2.5 py-1 text-[11px] font-bold text-[#2a5cac]">{students.find((s) => s._id === id)?.name}<button type="button" onClick={() => setF({ ...f, studentIds: f.studentIds.filter((x) => x !== id) })}><X className="h-3 w-3" /></button></span>)}</div>
              </div>
            )}
            <button className={btn}>Add fee</button>
          </form>
        </div>
      )}
    </div>
  );
};

/* ───────────── transport routes, students on routes, monthly fee ───────────── */
const Transport = ({ students, classes }) => {
  const [routes, setRoutes] = useState([]);
  const [assigns, setAssigns] = useState([]);
  const [route, setRoute] = useState(null);
  const [asg, setAsg] = useState({ routeId: '', pickupPoint: '', search: '', ids: [] });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([apiClient.get('/fees/transport/routes'), apiClient.get('/fees/transport/assignments')]);
      setRoutes(a.data.routes); setAssigns(b.data.assignments);
    } catch (e) { toast.error(e.response?.data?.message || 'Could not load transport'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveRoute = async (e) => {
    e.preventDefault();
    try {
      const body = { ...route, monthlyFee: Number(route.monthlyFee) };
      if (route._id) await apiClient.put(`/fees/transport/routes/${route._id}`, body); else await apiClient.post('/fees/transport/routes', body);
      toast.success('Route saved'); setRoute(null); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not save route'); }
  };
  const delRoute = async (r) => { if (!window.confirm(`Delete ${r.name}?`)) return; try { await apiClient.delete(`/fees/transport/routes/${r._id}`); load(); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } };
  const assign = async (routeId) => {
    if (!asg.ids.length) return toast.error('Choose at least one student');
    try { const r = await apiClient.post('/fees/transport/assign', { studentIds: asg.ids, routeId, pickupPoint: asg.pickupPoint }); toast.success(r.data.message); setAsg({ ...asg, ids: [], search: '' }); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const remove = async (a) => { try { await apiClient.post('/fees/transport/assign', { studentId: a.studentId._id, routeId: '' }); load(); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } };
  const generate = async () => {
    try { const r = await apiClient.post('/fees/transport/generate', { month }); toast.success(r.data.message); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const matches = asg.search ? students.filter((s) => s.name?.toLowerCase().includes(asg.search.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-black">Routes & monthly fee</h3><button onClick={() => setRoute({ name: '', monthlyFee: '', vehicle: '', driverName: '', driverPhone: '', isActive: true })} className={`${btn} inline-flex items-center gap-1`}><Plus className="h-4 w-4" />Route</button></div>
          {routes.length === 0 && <p className="py-4 text-center text-sm italic text-[#5b6b7b]">Add your first route (e.g. "Route 1 - G-10").</p>}
          {routes.map((r) => (
            <div key={r._id} className="flex items-center gap-3 rounded-2xl border border-[#e3e7e7] bg-white px-3 py-2.5">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{r.name}{!r.isActive && <span className="ml-2 text-[10px] text-[#5b6b7b]">(inactive)</span>}</p><p className="text-[11px] text-[#5b6b7b]">{[r.vehicle, r.driverName, r.driverPhone].filter(Boolean).join(' · ')} · {r.students} student(s)</p></div>
              <b className="text-sm text-[#2a5cac]">{rs(r.monthlyFee)}</b>
              <button onClick={() => setRoute(r)} className="rounded-lg border border-[#e3e7e7] px-2 py-1 text-[11px] font-bold">Edit</button>
              <button onClick={() => delRoute(r)} className="rounded-lg border border-[#e3e7e7] p-1.5 text-[#be123c]"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="rounded-2xl bg-[#f7f6f2] p-3">
            <p className="mb-2 text-xs font-bold text-[#3b4a5c]">Create this month's transport fee for every student on a route</p>
            <div className="flex gap-2"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto`} /><button onClick={generate} className={btn}>Create monthly fees</button></div>
            <p className="mt-1 text-[11px] text-[#5b6b7b]">Safe to press twice: a student never gets the same month twice.</p>
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-black">Put students on a route</h3>
          <input className={inputCls} placeholder="Type a student name..." value={asg.search} onChange={(e) => setAsg({ ...asg, search: e.target.value })} />
          {matches.length > 0 && <div className="rounded-xl border border-[#e3e7e7] bg-white">{matches.map((s) => <button key={s._id} onClick={() => setAsg({ ...asg, ids: Array.from(new Set([...asg.ids, s._id])), search: '' })} className="block w-full px-3 py-2 text-left text-xs hover:bg-[#f7f6f2]">{s.name} <span className="text-[#5b6b7b]">· {clsName(s.classId)}</span></button>)}</div>}
          <div className="flex flex-wrap gap-1.5">{asg.ids.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#2a5cac]/10 px-2.5 py-1 text-[11px] font-bold text-[#2a5cac]">{students.find((s) => s._id === id)?.name}<button onClick={() => setAsg({ ...asg, ids: asg.ids.filter((x) => x !== id) })}><X className="h-3 w-3" /></button></span>)}</div>
          <div className="flex flex-wrap gap-2">
            <select className={`${inputCls} !w-auto flex-1`} value={asg.routeId} onChange={(e) => setAsg({ ...asg, routeId: e.target.value })}><option value="">Choose route...</option>{routes.filter((r) => r.isActive).map((r) => <option key={r._id} value={r._id}>{r.name} - {rs(r.monthlyFee)}</option>)}</select>
            <input className={`${inputCls} !w-40`} placeholder="Pickup point" value={asg.pickupPoint} onChange={(e) => setAsg({ ...asg, pickupPoint: e.target.value })} />
            <button disabled={!asg.routeId} onClick={() => assign(asg.routeId)} className={btn}>Assign</button>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {assigns.map((a) => <div key={a._id} className="flex items-center justify-between rounded-xl border border-[#eef2f8] bg-white px-3 py-1.5 text-xs"><span><b>{a.studentId.name}</b> <span className="text-[#5b6b7b]">{clsName(a.studentId.classId)} · {a.routeId.name}{a.pickupPoint ? ` · ${a.pickupPoint}` : ''}</span></span><button onClick={() => remove(a)} className="text-[#be123c]"><X className="h-4 w-4" /></button></div>)}
          </div>
        </Card>
      </div>

      {route && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={saveRoute} className="w-full max-w-md space-y-3 rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="text-lg font-black">{route._id ? 'Edit route' : 'New route'}</h3><button type="button" onClick={() => setRoute(null)}><X className="h-5 w-5" /></button></div>
            <Field label="Route name"><input required className={inputCls} value={route.name} onChange={(e) => setRoute({ ...route, name: e.target.value })} /></Field>
            <Field label="Monthly fee (PKR)"><input required type="number" min="0" className={inputCls} value={route.monthlyFee} onChange={(e) => setRoute({ ...route, monthlyFee: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vehicle"><input className={inputCls} value={route.vehicle || ''} onChange={(e) => setRoute({ ...route, vehicle: e.target.value })} /></Field>
              <Field label="Driver"><input className={inputCls} value={route.driverName || ''} onChange={(e) => setRoute({ ...route, driverName: e.target.value })} /></Field>
            </div>
            <Field label="Driver phone"><input className={inputCls} value={route.driverPhone || ''} onChange={(e) => setRoute({ ...route, driverPhone: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" className="h-4 w-4 accent-[#2a5cac]" checked={route.isActive !== false} onChange={(e) => setRoute({ ...route, isActive: e.target.checked })} />Active</label>
            <button className={btn}>Save route</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default FeesCenter;
