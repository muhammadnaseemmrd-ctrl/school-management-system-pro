import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, Building2, CheckCircle2, Copy, GraduationCap, KeyRound, Lock, Menu, PauseCircle, PlayCircle,
  Plus, Search, Trash2, Users, X, Wallet, UserCheck, CalendarClock, Layers, Pencil, Gift,
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import apiClient from '../../utils/apiClient';

const PLAN_COLORS = { free: '#b68c67', standard: '#7a4e2d', premium: '#c28a42' };
const EXTRA = ['#0ea5e9', '#10b981', '#8b5cf6', '#f43f5e', '#14b8a6', '#f59e0b'];
const planColor = (k, i = 0) => PLAN_COLORS[k] || EXTRA[i % EXTRA.length];
const pkr = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const blankOffer = { title: '', description: '', code: '', discountType: 'percent', discountValue: 20, planSlugs: [], validFrom: '', validUntil: '', isActive: true };
const blankPlan = { slug: '', label: '', description: '', pricePKR: 0, yearlyPricePKR: 0, studentLimit: 100, teacherLimit: 10, isActive: true, features: {} };
const Card = ({ className = '', children }) => <div className={`rounded-[1.75rem] border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm ${className}`}>{children}</div>;
const Field = ({ label, children }) => (<div><label className="mb-1 block text-xs font-bold text-[#6d4c35]">{label}</label>{children}</div>);
const inputCls = 'w-full rounded-xl border border-[#d9c5b0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7a4e2d]';

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
    <div className={`max-h-[90vh] w-full overflow-y-auto rounded-[1.75rem] border border-[#d9c5b0] bg-[#fffaf3] p-6 shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black text-[#3f2a1d]">{title}</h3><button onClick={onClose} className="rounded-full p-1.5 hover:bg-[#7a4e2d]/10"><X className="h-5 w-5" /></button></div>
      {children}
    </div>
  </div>
);

const TABS = [['overview', 'Platform Overview', BarChart3], ['schools', 'Schools (Tenants)', Building2], ['plans', 'Plans & Pricing', Layers], ['offers', 'Offers', Gift], ['security', 'Account Security', Lock]];

const emptyForm = { name: '', code: '', email: '', phone: '', city: '', adminName: '', adminEmail: '', adminPassword: '', plan: 'free', subscriptionExpiresAt: '', timezone: 'Asia/Karachi' };

const SuperAdminDashboard = () => {
  const [tab, setTab] = useState(() => localStorage.getItem('superadminActiveTab') || 'overview');
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [stats, setStats] = useState(null);
  const [plans, setPlans] = useState({});
  const [featureList, setFeatureList] = useState([]);
  const [planForm, setPlanForm] = useState(null); // plan being created/edited
  const [offers, setOffers] = useState([]);
  const [offerForm, setOfferForm] = useState(null);
  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, currentPage: 1 });
  const [filters, setFilters] = useState({ search: '', status: '', plan: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {type, school?}
  const [form, setForm] = useState(emptyForm);
  const [edit, setEdit] = useState({});
  const [suspendReason, setSuspendReason] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [tempPwd, setTempPwd] = useState(null);
  const [pwd, setPwd] = useState({ old: '', next: '', confirm: '' });

  useEffect(() => { localStorage.setItem('superadminActiveTab', tab); }, [tab]);

  const loadStats = useCallback(async () => {
    try { const r = await apiClient.get('/superadmin/stats'); setStats(r.data.stats); setPlans(r.data.plans); setFeatureList(r.data.features || []); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to load stats'); }
  }, []);

  const loadSchools = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiClient.get('/superadmin/schools', { params: { ...filters, limit: 10 } });
      setSchools(r.data.schools); setPagination(r.data.pagination);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load schools'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setTimeout(loadSchools, 250); return () => clearTimeout(t); }, [loadSchools]);

  const loadOffers = useCallback(async () => {
    try { const r = await apiClient.get('/superadmin/offers'); setOffers(r.data.offers); } catch (e) { toast.error(e.response?.data?.message || 'Failed to load offers'); }
  }, []);
  useEffect(() => { loadOffers(); }, [loadOffers]);
  const saveOffer = async (e) => {
    e.preventDefault();
    const body = { ...offerForm, discountValue: Number(offerForm.discountValue) || 0, validFrom: offerForm.validFrom || undefined, validUntil: offerForm.validUntil || '' };
    try {
      if (offerForm._id) await apiClient.put(`/superadmin/offers/${offerForm._id}`, body); else await apiClient.post('/superadmin/offers', body);
      toast.success(offerForm._id ? 'Offer saved' : 'Offer created. School admins were notified.'); setOfferForm(null); loadOffers();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not save offer'); }
  };
  const removeOffer = async (o) => {
    if (!window.confirm(`Delete "${o.title}"? Schools using it go back to the normal price.`)) return;
    try { await apiClient.delete(`/superadmin/offers/${o._id}`); toast.success('Offer deleted'); loadOffers(); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };
  const toggleOffer = async (o) => { try { await apiClient.put(`/superadmin/offers/${o._id}`, { isActive: !o.isActive }); loadOffers(); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); } };

  const refresh = () => { loadStats(); loadSchools(); loadOffers(); };
  const close = () => { setModal(null); setTempPwd(null); setConfirmCode(''); setSuspendReason(''); };

  const createSchool = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/superadmin/schools', {
        name: form.name, code: form.code, email: form.email, phone: form.phone, address: { city: form.city },
        adminName: form.adminName, adminEmail: form.adminEmail, adminPassword: form.adminPassword, plan: form.plan,
        subscriptionExpiresAt: form.subscriptionExpiresAt || undefined, timezone: form.timezone || undefined,
      });
      toast.success('School created'); setForm(emptyForm); close(); refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not create school'); }
  };

  const openEdit = (s) => {
    setEdit({ offerId: s.offerId || '', plan: s.plan, studentLimit: s.studentLimit, teacherLimit: s.teacherLimit, subscriptionExpiresAt: s.subscriptionExpiresAt ? s.subscriptionExpiresAt.slice(0, 10) : '', timezone: s.timezone || 'UTC' });
    setModal({ type: 'edit', school: s });
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.put(`/superadmin/schools/${modal.school._id}`, {
        plan: edit.plan, studentLimit: Number(edit.studentLimit), teacherLimit: Number(edit.teacherLimit), subscriptionExpiresAt: edit.subscriptionExpiresAt || '', timezone: edit.timezone, offerId: edit.offerId || '',
      });
      toast.success('Subscription updated'); close(); refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
  };

  const setStatus = async (s, isActive, reason = '') => {
    try {
      await apiClient.patch(`/superadmin/schools/${s._id}/status`, { isActive, reason });
      toast.success(isActive ? 'School activated' : 'School suspended'); close(); refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const resetAdmin = async (s) => {
    try { const r = await apiClient.post(`/superadmin/schools/${s._id}/reset-admin-password`, {}); setTempPwd(r.data); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const deleteSchool = async (e) => {
    e.preventDefault();
    try {
      await apiClient.delete(`/superadmin/schools/${modal.school._id}`, { data: { confirmCode } });
      toast.success('School deleted'); close(); refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) return toast.error('New passwords do not match');
    try {
      await apiClient.put('/auth/change-password', { oldPassword: pwd.old, newPassword: pwd.next });
      toast.success('Password changed'); setPwd({ old: '', next: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const savePlan = async (e) => {
    e.preventDefault();
    const body = { ...planForm, pricePKR: Number(planForm.pricePKR) || 0, yearlyPricePKR: Number(planForm.yearlyPricePKR) || 0, studentLimit: Number(planForm.studentLimit) || 0, teacherLimit: Number(planForm.teacherLimit) || 0 };
    try {
      if (planForm._editing) {
        const r = await apiClient.put(`/superadmin/plans/${planForm.slug}`, body);
        toast.success(r.data.schoolsUpdated ? `Plan saved. ${r.data.schoolsUpdated} school(s) updated.` : 'Plan saved');
      } else { await apiClient.post('/superadmin/plans', body); toast.success('Plan created'); }
      setPlanForm(null); refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not save plan'); }
  };
  const removePlan = async (slug) => {
    if (!window.confirm('Delete this plan? This cannot be undone.')) return;
    try { await apiClient.delete(`/superadmin/plans/${slug}`); toast.success('Plan deleted'); refresh(); }
    catch (err) { toast.error(err.response?.data?.message || 'Could not delete'); }
  };

  const copy = (t) => { navigator.clipboard?.writeText(t); toast.success('Copied'); };
  const expiry = (s) => (s.subscriptionExpiresAt ? new Date(s.subscriptionExpiresAt).toLocaleDateString() : 'Never');
  const limitText = (n) => (n === 0 ? '∞' : n);

  const kpis = stats && [
    ['Schools', stats.totalSchools, `${stats.activeSchools} active · ${stats.suspendedSchools} suspended`, Building2, 'bg-amber-500/10 text-amber-700'],
    ['Students', stats.totalStudents, 'across all schools', GraduationCap, 'bg-emerald-500/10 text-emerald-700'],
    ['Teachers', stats.totalTeachers, 'across all schools', Users, 'bg-[#0ea5e9]/10 text-[#0369a1]'],
    ['Parents', stats.totalParents, 'linked accounts', UserCheck, 'bg-[#f43f5e]/10 text-[#be123c]'],
    ['Est. monthly income', pkr(stats.mrr), 'from plan prices', Wallet, 'bg-violet-500/10 text-violet-700'],
    ['New (30 days)', stats.newSchools30d, 'school sign-ups', Plus, 'bg-teal-500/10 text-teal-700'],
    ['Attendance today', stats.attendanceToday, 'records marked', CheckCircle2, 'bg-lime-500/10 text-lime-700'],
    ['Expiring ≤14d', stats.expiringSoon, 'subscriptions', CalendarClock, 'bg-orange-500/10 text-orange-700'],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#f4ecdf] text-[#3f2a1d] md:flex-row">
      <Toaster position="top-right" />
      <div className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 transform flex-col border-r border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-2xl transition-transform duration-300 md:relative md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full md:-ml-64'}`}>
        <div className="flex items-center justify-between border-b border-[#d9c5b0]/30 pb-4">
          <div><h2 className="text-lg font-black tracking-wide text-[#7a4e2d]">PLATFORM</h2><p className="text-[10px] font-bold uppercase text-[#8a6a50]">Super Admin Console</p></div>
          <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-[#7a4e2d] md:hidden"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 space-y-1">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setTab(id); if (window.innerWidth < 768) setOpen(false); }} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${tab === id ? 'bg-[#7a4e2d] text-[#f7efe4]' : 'text-[#6d4c35] hover:bg-[#7a4e2d]/10'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/35 md:hidden" />}

      <div className="flex max-h-screen flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl flex-1 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(!open)} className="rounded-xl border border-[#d9c5b0] bg-white p-2.5 text-[#7a4e2d] shadow-sm"><Menu className="h-5 w-5" /></button>
            <div className="flex-1 rounded-2xl bg-gradient-hero p-3.5 shadow-sm"><h1 className="text-sm font-black uppercase md:text-base">SaaS Platform Console</h1></div>
          </div>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(kpis || []).map(([t, v, sub, Icon, tone]) => (
                  <Card key={t}><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-5 w-5" /></div>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-[#8a6a50]">{t}</p><p className="text-3xl font-black">{v}</p><p className="text-xs text-[#8a6a50]">{sub}</p></Card>
                ))}
              </div>
              {stats && (
                <div className="grid gap-6 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <h3 className="mb-3 text-lg font-bold">New schools — last 6 months</h3>
                    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.signups} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eadcc9" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8a6a50' }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8a6a50' }} /><Tooltip />
                      <Bar dataKey="count" name="Schools" fill="#7a4e2d" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card>
                    <h3 className="mb-3 text-lg font-bold">Plan distribution</h3>
                    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart>
                      <Pie data={Object.entries(stats.planDistribution).map(([k, v]) => ({ name: plans[k]?.label || k, key: k, value: v })).filter((x) => x.value > 0)} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {Object.keys(stats.planDistribution).filter((k) => stats.planDistribution[k] > 0).map((k, i) => <Cell key={k} fill={planColor(k, i)} />)}</Pie><Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* SCHOOLS */}
          {tab === 'schools' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a6a50]" />
                  <input placeholder="Search name, code or email…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} className={`${inputCls} pl-9`} /></div>
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} className={`${inputCls} !w-auto`}><option value="">All status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
                <select value={filters.plan} onChange={(e) => setFilters({ ...filters, plan: e.target.value, page: 1 })} className={`${inputCls} !w-auto`}><option value="">All plans</option>{Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select>
                <button onClick={() => setModal({ type: 'create' })} className="inline-flex items-center gap-2 rounded-xl bg-[#7a4e2d] px-4 py-2.5 text-xs font-bold text-[#f7efe4] hover:bg-[#633d22]"><Plus className="h-4 w-4" /> Add school</button>
              </Card>

              <Card className="overflow-x-auto !p-0">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="border-b border-[#d9c5b0] bg-[#f7efe4] text-[10px] uppercase tracking-wider text-[#8a6a50]">
                    <tr>{['School', 'Code', 'Plan', 'Students', 'Teachers', 'Parents', 'Expires', 'Status', 'Actions'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loading && <tr><td colSpan={9} className="py-10 text-center text-[#8a6a50]">Loading…</td></tr>}
                    {!loading && schools.length === 0 && <tr><td colSpan={9} className="py-10 text-center italic text-[#8a6a50]">No schools found.</td></tr>}
                    {schools.map((s) => (
                      <tr key={s._id} className="border-b border-[#d9c5b0]/40 hover:bg-white/60">
                        <td className="px-4 py-3"><p className="font-bold text-[#3f2a1d]">{s.name}</p><p className="text-[10px] text-[#8a6a50]">{s.adminId?.email || s.email}</p></td>
                        <td className="px-4 py-3 font-mono font-bold">{s.code}</td>
                        <td className="px-4 py-3"><span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase text-white" style={{ background: planColor(s.plan, Object.keys(plans).indexOf(s.plan)) }}>{plans[s.plan]?.label || s.plan}</span></td>
                        <td className="px-4 py-3">{s.counts.students}<span className="text-[#8a6a50]"> / {limitText(s.studentLimit)}</span></td>
                        <td className="px-4 py-3">{s.counts.teachers}<span className="text-[#8a6a50]"> / {limitText(s.teacherLimit)}</span></td>
                        <td className="px-4 py-3">{s.counts.parents}</td>
                        <td className="px-4 py-3">{expiry(s)}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${s.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-[#fff1f2] text-[#9f1239]'}`}>{s.isActive ? 'Active' : 'Suspended'}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button title="Edit plan / limits" onClick={() => openEdit(s)} className="rounded-lg border border-[#d9c5b0] bg-white p-1.5 text-[#7a4e2d] hover:bg-[#f4ecdf]"><Pencil className="h-4 w-4" /></button>
                            {s.isActive
                              ? <button title="Suspend" onClick={() => setModal({ type: 'suspend', school: s })} className="rounded-lg border border-[#d9c5b0] bg-white p-1.5 text-amber-700 hover:bg-amber-50"><PauseCircle className="h-4 w-4" /></button>
                              : <button title="Activate" onClick={() => setStatus(s, true)} className="rounded-lg border border-[#d9c5b0] bg-white p-1.5 text-emerald-700 hover:bg-emerald-50"><PlayCircle className="h-4 w-4" /></button>}
                            <button title="Reset admin password" onClick={() => { setModal({ type: 'reset', school: s }); resetAdmin(s); }} className="rounded-lg border border-[#d9c5b0] bg-white p-1.5 text-[#0369a1] hover:bg-[#f0f9ff]"><KeyRound className="h-4 w-4" /></button>
                            <button title="Delete school" onClick={() => setModal({ type: 'delete', school: s })} className="rounded-lg border border-[#d9c5b0] bg-white p-1.5 text-[#be123c] hover:bg-[#fff1f2]"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="flex items-center justify-between text-xs text-[#6d4c35]">
                <span>{pagination.total} school(s)</span>
                <div className="flex gap-2">
                  <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} className="rounded-lg border border-[#d9c5b0] bg-white px-3 py-1.5 font-bold disabled:opacity-40">Prev</button>
                  <span className="px-2 py-1.5 font-bold">{pagination.currentPage} / {pagination.pages || 1}</span>
                  <button disabled={filters.page >= pagination.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} className="rounded-lg border border-[#d9c5b0] bg-white px-3 py-1.5 font-bold disabled:opacity-40">Next</button>
                </div>
              </div>
            </div>
          )}

          {/* PLANS */}
          {tab === 'plans' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-2xl"><h2 className="text-xl font-bold">Plans & pricing (PKR)</h2><p className="mt-1 text-sm text-[#7f634e]">Set the price, student/teacher limits and which features each plan includes. Changes apply immediately: schools on a plan lose or gain the features at once. New schools sign up on <b>Free</b>; move them to a paid plan from the Schools tab.</p></div>
                <button onClick={() => setPlanForm({ ...blankPlan, features: Object.fromEntries(featureList.map((f) => [f.key, true])) })} className="inline-flex items-center gap-2 rounded-xl bg-[#7a4e2d] px-4 py-2.5 text-xs font-bold text-[#f7efe4] hover:bg-[#633d22]"><Plus className="h-4 w-4" /> New plan</button>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(plans).map(([k, p], i) => (
                  <Card key={k} className={`space-y-3 ${p.isActive === false ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between"><span className="inline-block rounded-full px-3 py-1 text-[11px] font-black uppercase text-white" style={{ background: planColor(k, i) }}>{p.label}</span>
                      {p.isActive === false && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-600">Hidden</span>}</div>
                    <div><p className="text-3xl font-black">{pkr(p.pricePKR)}<span className="text-sm font-semibold text-[#8a6a50]"> / month</span></p>
                      {p.yearlyPricePKR > 0 && <p className="text-xs font-semibold text-[#8a6a50]">or {pkr(p.yearlyPricePKR)} / year</p>}</div>
                    {p.description && <p className="text-xs text-[#7f634e]">{p.description}</p>}
                    <p className="text-sm text-[#6d4c35]">{p.studentLimit ? `Up to ${p.studentLimit}` : 'Unlimited'} students · {p.teacherLimit ? `Up to ${p.teacherLimit}` : 'Unlimited'} teachers</p>
                    <ul className="grid grid-cols-1 gap-1 text-xs">
                      {featureList.map((f) => (<li key={f.key} className={p.features?.[f.key] ? 'font-semibold text-emerald-800' : 'text-[#a58b76] line-through'}>{p.features?.[f.key] ? '✓' : '✕'} {f.label}</li>))}
                    </ul>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setPlanForm({ ...p, slug: k, _editing: true, features: { ...(p.features || {}) } })} className="flex-1 rounded-xl border border-[#d9c5b0] bg-white px-3 py-2 text-xs font-bold text-[#7a4e2d] hover:bg-[#f4ecdf]"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button>
                      <button onClick={() => removePlan(k)} className="rounded-xl border border-[#d9c5b0] bg-white px-3 py-2 text-[#be123c] hover:bg-[#fff1f2]" title="Delete plan"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* OFFERS */}
          {tab === 'offers' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-2xl"><h2 className="text-xl font-bold">Offers & discounts</h2><p className="mt-1 text-sm text-[#7f634e]">Create a promotion (for example "Admission season 25% off"). Live offers appear to every school admin under School Setup, and they get a notification. To give an offer to a school, pick it in the school's Edit (pencil) window.</p></div>
                <button onClick={() => setOfferForm({ ...blankOffer })} className="inline-flex items-center gap-2 rounded-xl bg-[#7a4e2d] px-4 py-2.5 text-xs font-bold text-[#f7efe4] hover:bg-[#633d22]"><Plus className="h-4 w-4" /> New offer</button>
              </Card>
              {offers.length === 0 && <Card><p className="py-6 text-center text-sm italic text-[#8a6a50]">No offers yet.</p></Card>}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {offers.map((o) => {
                  const expired = o.validUntil && new Date(o.validUntil) < new Date();
                  return (
                    <Card key={o._id} className={`space-y-2 ${!o.isActive || expired ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-2"><p className="text-base font-black">🎁 {o.title}</p><span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-white">{o.discountType === 'percent' ? `${o.discountValue}% off` : `Rs ${o.discountValue} off`}</span></div>
                      {o.description && <p className="text-xs text-[#6d4c35]">{o.description}</p>}
                      <p className="text-[11px] font-semibold text-[#8a6a50]">{o.code ? `Code ${o.code} · ` : ''}{o.planSlugs?.length ? `Plans: ${o.planSlugs.join(', ')}` : 'All plans'} · {o.validUntil ? `until ${new Date(o.validUntil).toLocaleDateString()}` : 'no end date'}</p>
                      <p className="text-[11px] text-[#8a6a50]">{o.schoolsUsing} school(s) using · {expired ? 'Expired' : o.isActive ? 'Live' : 'Paused'}</p>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setOfferForm({ ...o, validFrom: o.validFrom ? o.validFrom.slice(0, 10) : '', validUntil: o.validUntil ? o.validUntil.slice(0, 10) : '' })} className="flex-1 rounded-xl border border-[#d9c5b0] bg-white px-3 py-2 text-xs font-bold text-[#7a4e2d] hover:bg-[#f4ecdf]"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button>
                        <button onClick={() => toggleOffer(o)} className="rounded-xl border border-[#d9c5b0] bg-white px-3 py-2 text-xs font-bold text-[#6d4c35] hover:bg-[#f4ecdf]">{o.isActive ? 'Pause' : 'Resume'}</button>
                        <button onClick={() => removeOffer(o)} className="rounded-xl border border-[#d9c5b0] bg-white px-3 py-2 text-[#be123c] hover:bg-[#fff1f2]" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECURITY */}
          {tab === 'security' && (
            <Card className="max-w-lg"><h2 className="text-xl font-bold">Change your password</h2>
              <form onSubmit={changePassword} className="mt-4 space-y-3">
                {[['old', 'Current password'], ['next', 'New password'], ['confirm', 'Confirm new password']].map(([k, l]) => (
                  <Field key={k} label={l}><input type="password" required value={pwd[k]} onChange={(e) => setPwd({ ...pwd, [k]: e.target.value })} className={inputCls} /></Field>
                ))}
                <button className="rounded-xl bg-[#7a4e2d] px-5 py-2.5 text-xs font-bold text-[#f7efe4]">Update password</button>
              </form></Card>
          )}
        </div>
      </div>

      {/* MODALS */}
      {offerForm && (
        <Modal title={offerForm._id ? 'Edit offer' : 'New offer'} onClose={() => setOfferForm(null)} wide>
          <form onSubmit={saveOffer} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Offer title"><input required className={inputCls} value={offerForm.title} onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} placeholder="e.g. Admission season special" /></Field></div>
            <div className="sm:col-span-2"><Field label="Description"><textarea rows={2} className={inputCls} value={offerForm.description || ''} onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })} /></Field></div>
            <Field label="Discount type"><select className={inputCls} value={offerForm.discountType} onChange={(e) => setOfferForm({ ...offerForm, discountType: e.target.value })}><option value="percent">Percent (%)</option><option value="fixed">Fixed amount per month (PKR)</option></select></Field>
            <Field label={offerForm.discountType === 'percent' ? 'Discount (%)' : 'Discount (PKR / month)'}><input required type="number" min="1" className={inputCls} value={offerForm.discountValue} onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })} /></Field>
            <Field label="Offer code (optional)"><input className={`${inputCls} uppercase`} value={offerForm.code || ''} onChange={(e) => setOfferForm({ ...offerForm, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Valid until (blank = no end)"><input type="date" className={inputCls} value={offerForm.validUntil || ''} onChange={(e) => setOfferForm({ ...offerForm, validUntil: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-bold text-[#6d4c35]">Applies to plans (none ticked = all plans)</p>
              <div className="flex flex-wrap gap-2">{Object.entries(plans).map(([k, p]) => (
                <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${offerForm.planSlugs?.includes(k) ? 'border-[#7a4e2d] bg-[#f7efe4]' : 'border-[#d9c5b0] bg-white'}`}>
                  <input type="checkbox" className="accent-[#7a4e2d]" checked={!!offerForm.planSlugs?.includes(k)} onChange={(e) => setOfferForm({ ...offerForm, planSlugs: e.target.checked ? [...(offerForm.planSlugs || []), k] : (offerForm.planSlugs || []).filter((x) => x !== k) })} />{p.label}</label>))}</div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-[#6d4c35] sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[#7a4e2d]" checked={offerForm.isActive !== false} onChange={(e) => setOfferForm({ ...offerForm, isActive: e.target.checked })} /> Live (visible to school admins)</label>
            <div className="sm:col-span-2"><button className="rounded-xl bg-[#7a4e2d] px-5 py-2.5 text-xs font-bold text-[#f7efe4]">{offerForm._id ? 'Save offer' : 'Create offer'}</button></div>
          </form>
        </Modal>
      )}
      {planForm && (
        <Modal title={planForm._editing ? `Edit plan - ${planForm.label}` : 'New plan'} onClose={() => setPlanForm(null)} wide>
          <form onSubmit={savePlan} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Plan name"><input required className={inputCls} value={planForm.label} onChange={(e) => setPlanForm({ ...planForm, label: e.target.value })} placeholder="e.g. Gold" /></Field>
              <Field label="Description (optional)"><input className={inputCls} value={planForm.description || ''} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} /></Field>
              <Field label="Monthly price (PKR)"><input type="number" min="0" className={inputCls} value={planForm.pricePKR} onChange={(e) => setPlanForm({ ...planForm, pricePKR: e.target.value })} /></Field>
              <Field label="Yearly price (PKR, 0 = not offered)"><input type="number" min="0" className={inputCls} value={planForm.yearlyPricePKR} onChange={(e) => setPlanForm({ ...planForm, yearlyPricePKR: e.target.value })} /></Field>
              <Field label="Student limit (0 = unlimited)"><input type="number" min="0" className={inputCls} value={planForm.studentLimit} onChange={(e) => setPlanForm({ ...planForm, studentLimit: e.target.value })} /></Field>
              <Field label="Teacher limit (0 = unlimited)"><input type="number" min="0" className={inputCls} value={planForm.teacherLimit} onChange={(e) => setPlanForm({ ...planForm, teacherLimit: e.target.value })} /></Field>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-[#6d4c35]">Features included in this plan</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {featureList.map((f) => (
                  <label key={f.key} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-xs ${planForm.features?.[f.key] ? 'border-[#7a4e2d] bg-[#f7efe4]' : 'border-[#d9c5b0] bg-white'}`}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#7a4e2d]" checked={!!planForm.features?.[f.key]} onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, [f.key]: e.target.checked } })} />
                    <span><b className="block text-[#3f2a1d]">{f.label}</b><span className="text-[#8a6a50]">{f.desc}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-[#6d4c35]"><input type="checkbox" className="h-4 w-4 accent-[#7a4e2d]" checked={planForm.isActive !== false} onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })} /> Available when adding schools</label>
            {planForm._editing && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Saving also sets the student/teacher limits of every school on this plan to the values above.</p>}
            <button className="rounded-xl bg-[#7a4e2d] px-5 py-2.5 text-xs font-bold text-[#f7efe4]">{planForm._editing ? 'Save plan' : 'Create plan'}</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'create' && (
        <Modal title="Add a school (tenant)" onClose={close} wide>
          <form onSubmit={createSchool} className="grid gap-3 sm:grid-cols-2">
            <Field label="School name"><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="School code (used to log in)"><input required className={`${inputCls} uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="School email"><input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><input required className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="City"><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Plan"><select className={inputCls} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{Object.entries(plans).filter(([, p]) => p.isActive !== false).map(([k, p]) => <option key={k} value={k}>{p.label} - {pkr(p.pricePKR)}/mo</option>)}</select></Field>
            <Field label="Admin name"><input required className={inputCls} value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} /></Field>
            <Field label="Admin email"><input required type="email" className={inputCls} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} /></Field>
            <Field label="Admin password"><input required type="text" className={inputCls} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="Min 6, 1 capital, 1 number, 1 special" /></Field>
            <Field label="Subscription expires (optional)"><input type="date" className={inputCls} value={form.subscriptionExpiresAt} onChange={(e) => setForm({ ...form, subscriptionExpiresAt: e.target.value })} /></Field>
            <Field label="School time zone (attendance clock)"><input className={inputCls} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Karachi" /></Field>
            <div className="sm:col-span-2"><button className="rounded-xl bg-[#7a4e2d] px-5 py-2.5 text-xs font-bold text-[#f7efe4]">Create school</button></div>
          </form>
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title={`Subscription — ${modal.school.name}`} onClose={close}>
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Plan"><select className={inputCls} value={edit.plan} onChange={(e) => { const p = plans[e.target.value]; setEdit({ ...edit, plan: e.target.value, studentLimit: p.studentLimit, teacherLimit: p.teacherLimit }); }}>{Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label} ({pkr(p.pricePKR)}/mo)</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Student limit (0 = unlimited)"><input type="number" min="0" className={inputCls} value={edit.studentLimit} onChange={(e) => setEdit({ ...edit, studentLimit: e.target.value })} /></Field>
              <Field label="Teacher limit (0 = unlimited)"><input type="number" min="0" className={inputCls} value={edit.teacherLimit} onChange={(e) => setEdit({ ...edit, teacherLimit: e.target.value })} /></Field>
            </div>
            <Field label="Offer for this school (optional)"><select className={inputCls} value={edit.offerId || ''} onChange={(e) => setEdit({ ...edit, offerId: e.target.value })}><option value="">No offer</option>{offers.map((o) => <option key={o._id} value={o._id}>{o.title} ({o.discountType === 'percent' ? `${o.discountValue}%` : `Rs ${o.discountValue}`} off){o.isActive ? '' : ' - paused'}</option>)}</select></Field>
            <Field label="School time zone"><input className={inputCls} value={edit.timezone || ''} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })} placeholder="Asia/Karachi" /></Field>
            <Field label="Expires on (blank = never)"><input type="date" className={inputCls} value={edit.subscriptionExpiresAt} onChange={(e) => setEdit({ ...edit, subscriptionExpiresAt: e.target.value })} /></Field>
            <button className="rounded-xl bg-[#7a4e2d] px-5 py-2.5 text-xs font-bold text-[#f7efe4]">Save changes</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'suspend' && (
        <Modal title={`Suspend ${modal.school.name}?`} onClose={close}>
          <p className="text-sm text-[#6d4c35]">All users of this school will be signed out and blocked until you reactivate it. No data is deleted.</p>
          <Field label="Reason shown to school users (optional)"><input className={`${inputCls} mt-2`} value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="e.g. Subscription unpaid" /></Field>
          <button onClick={() => setStatus(modal.school, false, suspendReason)} className="mt-4 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white">Suspend school</button>
        </Modal>
      )}

      {modal?.type === 'reset' && (
        <Modal title={`Admin password — ${modal.school.name}`} onClose={close}>
          {!tempPwd ? <p className="text-sm text-[#6d4c35]">Generating…</p> : (
            <div className="space-y-3 text-sm">
              <p className="text-[#6d4c35]">A new temporary password was set for <b>{tempPwd.adminEmail}</b>. Share it securely; they should change it after logging in.</p>
              <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 font-mono text-base font-black">{tempPwd.temporaryPassword}<button onClick={() => copy(tempPwd.temporaryPassword)}><Copy className="h-4 w-4 text-[#7a4e2d]" /></button></div>
            </div>
          )}
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Delete school permanently" onClose={close}>
          <p className="text-sm text-[#9f1239]">This permanently deletes <b>{modal.school.name}</b> and ALL its students, teachers, parents, attendance, marks and notices. This cannot be undone.</p>
          <form onSubmit={deleteSchool} className="mt-3 space-y-3">
            <Field label={`Type the school code (${modal.school.code}) to confirm`}><input className={inputCls} value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} /></Field>
            <button disabled={confirmCode.trim().toUpperCase() !== modal.school.code.toUpperCase()} className="rounded-xl bg-[#be123c] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">Delete forever</button>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
