import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Home, Lock, AlertTriangle, ChevronRight, ChevronLeft } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { useLang } from '../../i18n/LanguageContext';
import AttendanceReportView from '../../components/attendance/AttendanceReportView';
import { Ring, STATUS, StatusChip, todaySentence } from '../../components/attendance/shared';

const Card = ({ className = '', children }) => (
  <div className={`rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm ${className}`}>{children}</div>
);

const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };
const classLabel = (c) => (c ? `${c.standard}-${c.division}` : '—');
const BANNER = {
  Present: 'bg-emerald-500', Late: 'bg-orange-400', HalfDay: 'bg-amber-400', Absent: 'bg-[#f43f5e]', Leave: 'bg-[#0ea5e9]', None: 'bg-stone-400',
};

const TABS = [['home', 'Home', Home], ['attendance', 'Attendance', CalendarDays], ['notices', 'Notices', Bell], ['account', 'My account', Lock]];

const ParentDashboard = () => {
  const { t, fmtDate, isRtl } = useLang();
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#/', '');
    return TABS.some(([id]) => id === h) ? h : 'home';
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [childId, setChildId] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [notices, setNotices] = useState([]);
  const [pwd, setPwd] = useState({ old: '', next: '', confirm: '' });

  useEffect(() => { window.history.replaceState({ tab }, '', `${window.location.pathname}#/${tab}`); }, [tab]);

  const loadChildren = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/parents/me/children');
      setData(res.data);
      setChildId((cur) => cur || res.data.children[0]?._id || null);
    } catch (e) {
      toast.error(e.response?.data?.message || t('Could not load your children'));
    } finally { setLoading(false); }
  }, [t]);
  useEffect(() => { loadChildren(); }, [loadChildren]);
  useEffect(() => { apiClient.get('/notices/user/notices?limit=50').then((r) => setNotices(r.data.notices || [])).catch(() => {}); }, []);

  const today = data?.today;
  useEffect(() => {
    if (!childId || tab !== 'attendance' || !today) return undefined;
    let alive = true;
    setReportLoading(true);
    apiClient.get(`/parents/me/children/${childId}/attendance`, { params: { startDate: addDays(today, -179), endDate: today } })
      .then((r) => alive && setReport(r.data))
      .catch((e) => toast.error(e.response?.data?.message || t('Could not load attendance')))
      .finally(() => alive && setReportLoading(false));
    return () => { alive = false; };
  }, [childId, tab, today, t]);

  const child = useMemo(() => data?.children.find((c) => c._id === childId), [data, childId]);

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) return toast.error(t('New passwords do not match'));
    try {
      await apiClient.put('/auth/change-password', { oldPassword: pwd.old, newPassword: pwd.next });
      toast.success(t('Password changed successfully'));
      setPwd({ old: '', next: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.message || t('Could not change password')); }
  };

  const Switcher = () => data?.children.length > 1 && (
    <div className="flex flex-wrap gap-2">
      {data.children.map((c) => (
        <button key={c._id} onClick={() => setChildId(c._id)} className={`rounded-full border px-5 py-3 text-sm font-black transition ${c._id === childId ? 'border-[#7a4e2d] bg-[#7a4e2d] text-white' : 'border-[#d9c5b0] bg-white text-[#6d4c35] hover:bg-[#f4ecdf]'}`}>
          {c.name}
        </button>
      ))}
    </div>
  );
  const Arrow = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f4ecdf] pb-24 text-[#3f2a1d] md:pb-10">
      <Toaster position="top-center" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-[#8a6a50]">{t('Welcome')}</p>
          <h1 className="text-3xl font-black">{data?.parent?.name || t('Parent')}</h1>
        </div>

        {/* big, simple tab buttons (bottom bar on phones) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#d9c5b0] bg-[#fffaf3] md:static md:z-auto md:rounded-2xl md:border md:shadow-sm">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 px-2 py-3 text-xs font-black transition md:flex-row md:justify-center md:gap-2 md:text-sm ${tab === id ? 'bg-[#7a4e2d] text-white md:rounded-2xl' : 'text-[#6d4c35] hover:bg-[#f4ecdf] md:rounded-2xl'}`}>
              <Icon className="h-6 w-6 md:h-5 md:w-5" /> {t(label)}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="flex h-56 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#7a4e2d] border-t-transparent" /></div>
        ) : (
          <>
            {tab === 'home' && (
              <div className="space-y-5">
                {data?.children.length === 0 && <Card><p className="text-base text-[#6d4c35]">{t("No child is linked to your account yet. Please ask the school office to link your child's record.")}</p></Card>}
                {data?.children.map((c) => (
                  <div key={c._id} className="overflow-hidden rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] shadow-sm">
                    <div className="flex items-center gap-4 px-5 pt-5">
                      {c.photo ? <img src={c.photo} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7a4e2d] text-2xl font-black text-white">{c.name.charAt(0)}</div>}
                      <div>
                        <h2 className="text-2xl font-black">{c.name}</h2>
                        <p className="text-sm font-semibold text-[#6d4c35]">{t('Class')} {classLabel(c.class)}{c.rollNumber ? ` · ${t('Roll')} ${c.rollNumber}` : ''}</p>
                      </div>
                    </div>

                    {/* TODAY - the one thing a parent wants to know */}
                    <div className={`mx-5 mt-4 rounded-2xl px-5 py-4 text-white ${BANNER[c.today.status] || BANNER.None}`}>
                      <p className="text-xs font-bold uppercase tracking-wide text-white/80">{t('Today')} · {fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      <p className="mt-1 text-xl font-black leading-snug">{todaySentence(t, c.name.split(' ')[0], c.today.status === 'None' ? null : c.today.status, c.today.leftAt)}</p>
                      {c.today.remarks && <p className="mt-1 text-sm text-white/90">{c.today.remarks}</p>}
                    </div>

                    {/* last 7 days */}
                    <div className="px-5 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8a6a50]">{t('Last 7 days')}</p>
                      <div className="grid grid-cols-7 gap-1.5 text-center">
                        {c.strip.map((d) => (
                          <div key={d.date}>
                            <div className={`flex h-10 items-center justify-center rounded-xl text-sm font-black ${STATUS[d.status]?.cell || STATUS.None.cell}`}>{new Date(`${d.date}T00:00:00Z`).getUTCDate()}</div>
                            <p className="mt-1 text-[10px] font-bold text-[#8a6a50]">{fmtDate(d.date, { weekday: 'short' })}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 px-5 py-5">
                      <Ring value={c.overall.percentage} total={c.overall.total} />
                      <div className="min-w-[10rem] flex-1 text-sm font-semibold text-[#6d4c35]">
                        <p>{t('Present {a} of {b} school days', { a: c.overall.attendedDays, b: c.overall.total })}</p>
                        <p className="mt-1">{t('Absent')}: <b>{c.overall.absent}</b> · {t('Half day')}: <b>{c.overall.halfDay}</b> · {t('On leave')}: <b>{c.overall.leave}</b></p>
                      </div>
                    </div>

                    {c.lowAttendance && (
                      <div className="mx-5 mb-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <span>{t("{name}'s attendance is {pct}%, below {min}%. Please speak with the class head master.", { name: c.name.split(' ')[0], pct: c.overall.percentage, min: data.threshold })}</span>
                      </div>
                    )}
                    <button onClick={() => { setChildId(c._id); setTab('attendance'); }} className="flex w-full items-center justify-between border-t border-[#eadcc9] bg-[#f7efe4] px-5 py-4 text-base font-black text-[#7a4e2d] hover:bg-[#f0e0cd]">
                      {t('See full attendance')} <Arrow className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'attendance' && (
              <div className="space-y-4">
                <Switcher />
                {child ? (
                  <>
                    <Card><h2 className="text-2xl font-black">{child.name}</h2><p className="text-sm font-semibold text-[#6d4c35]">{t('Attendance')} · {t('Class')} {classLabel(child.class)}</p><div className="mt-2"><StatusChip status={child.today.status} leftAt={child.today.leftAt} /></div></Card>
                    <AttendanceReportView report={report} today={today} threshold={data.threshold} loading={reportLoading} />
                  </>
                ) : <Card><p>{t('No child selected.')}</p></Card>}
              </div>
            )}

            {tab === 'notices' && (
              <div className="space-y-4">
                {notices.length === 0 && <Card><p className="py-4 text-center text-base text-[#8a6a50]">{t('No notices right now.')}</p></Card>}
                {notices.map((n) => (
                  <Card key={n._id}>
                    <div className="flex flex-wrap items-center gap-2">
                      {n.isPinned && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">{t('Pinned')}</span>}
                      <span className="rounded-full bg-[#7a4e2d]/10 px-2.5 py-0.5 text-xs font-bold text-[#7a4e2d]">{n.category}</span>
                      <span className="text-xs text-[#8a6a50]">{new Date(n.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-black">{n.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-base leading-7 text-[#6d4c35]">{n.content}</p>
                  </Card>
                ))}
              </div>
            )}

            {tab === 'account' && (
              <Card>
                <h2 className="text-2xl font-black">{t('My account')}</h2>
                <p className="mt-1 text-sm text-[#6d4c35]">{data?.parent?.email} · {data?.parent?.relationship}</p>
                <form onSubmit={changePassword} className="mt-5 space-y-3">
                  {[['old', 'Current password'], ['next', 'New password'], ['confirm', 'Confirm new password']].map(([k, l]) => (
                    <div key={k}>
                      <label className="mb-1 block text-sm font-bold text-[#6d4c35]">{t(l)}</label>
                      <input type="password" required value={pwd[k]} onChange={(e) => setPwd({ ...pwd, [k]: e.target.value })} className="w-full rounded-xl border border-[#d9c5b0] bg-white px-4 py-3 text-base outline-none focus:border-[#7a4e2d]" />
                    </div>
                  ))}
                  <p className="text-xs text-[#8a6a50]">{t('Minimum 6 characters with one capital letter, one number and one special character.')}</p>
                  <button className="rounded-xl bg-[#7a4e2d] px-6 py-3 text-base font-black text-white hover:bg-[#633d22]">{t('Update password')}</button>
                </form>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
