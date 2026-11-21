import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Home, Lock, AlertTriangle, ChevronRight, ChevronLeft, Wallet, Paperclip, Pin, ExternalLink, FileText, ClipboardList, MessageSquare, HeartPulse, ShieldCheck, MoreHorizontal, Library, BusFront } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import MyDocuments from '../../components/studio/MyDocuments';
import FamilyQuizResults from '../../components/assess/FamilyQuizResults';
import FamilyDesk from '../../components/attendance/FamilyDesk';
import FamilyNursery from '../../components/early/FamilyNursery';
import FamilyMessages from '../../components/comms/FamilyMessages';
import FamilyCare from '../../components/care/FamilyCare';
import LibraryMe from '../../components/library/LibraryMe';
import TransportMe from '../../components/transport/TransportMe';
import FamilySignals from '../../components/security/FamilySignals';
import { FamilyConsent } from '../../components/access/Consents';
import apiClient from '../../utils/apiClient';
import { useLang } from '../../i18n/LanguageContext';
import AttendanceReportView from '../../components/attendance/AttendanceReportView';
import { Ring, STATUS, StatusChip, todaySentence } from '../../components/attendance/shared';
import FeesPanel from '../../components/fees/FeesPanel';
import RichText, { extractLinks } from '../../components/RichText';
import usePlan from '../../utils/usePlan';
import ProfileEditor from '../../components/ProfileEditor';
import { openProxiedFile } from '../../utils/fileProxy';

const Card = ({ className = '', children }) => (
  <div className={`rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm ${className}`}>{children}</div>
);

const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };
const classLabel = (c) => (c ? `${c.standard}-${c.division}` : '—');
const BANNER = {
  Present: 'bg-emerald-700', Late: 'bg-[#8a4636]', HalfDay: 'bg-amber-700', Absent: 'bg-rose-700', Leave: 'bg-[#2a5cac]', None: 'bg-[#5b6b7b]',
};

const ALL_TABS = [['home', 'Home', Home], ['attendance', 'Attendance', CalendarDays], ['desk', 'Leave & alerts', Bell], ['messages', 'Messages & help', MessageSquare], ['wellbeing', 'Wellbeing', HeartPulse], ['quizzes', 'Quizzes & exams', ClipboardList], ['documents', 'Documents', FileText], ['consent', 'Permissions', ShieldCheck], ['library', 'Library & store', Library], ['bus', 'School bus', BusFront], ['devices', 'What devices recorded', ShieldCheck], ['fees', 'Fees', Wallet], ['notices', 'Notices', Bell], ['nursery', 'Nursery', Home], ['account', 'My account', Lock]];
const fileName = (u = '') => decodeURIComponent((u.split('?')[0].split('/').pop() || 'Attachment')).slice(0, 40);

const ParentDashboard = () => {
  const { t, fmtDate, isRtl } = useLang();
  const { has } = usePlan();
  const [nursery, setNursery] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { apiClient.get('/early/family/children').then((r) => setNursery((r.data.children || []).length > 0)).catch(() => setNursery(false)); }, []);
  const TABS = useMemo(() => ALL_TABS.filter(([id]) => (id === 'fees' ? has('fees') : id === 'notices' ? has('notices') : id === 'messages' ? has('messages') : id === 'nursery' ? nursery : true)), [has, nursery]);
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#/', '');
    return h === 'nursery' || TABS.some(([id]) => id === h) ? h : 'home';
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
        <button key={c._id} onClick={() => setChildId(c._id)} className={`rounded-full border px-5 py-3 text-sm font-black transition ${c._id === childId ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white text-[#3b4a5c] hover:bg-[#f7f6f2]'}`}>
          {c.name}
        </button>
      ))}
    </div>
  );
  const Arrow = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f7f6f2] pb-24 text-[#1b2837] md:pb-10">
      <Toaster position="top-center" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-[#5b6b7b]">{t('Welcome')}</p>
          <h1 className="text-3xl font-black">{data?.parent?.name || t('Parent')}</h1>
        </div>

        {/* big, simple tab buttons (bottom bar on phones) */}
        <nav aria-label={t('Main sections')} className={`fixed inset-x-0 bottom-0 z-30 grid ${TABS.length === 4 ? "grid-cols-4" : TABS.length > 4 ? "grid-cols-5" : "grid-cols-3"} border-t border-[#e3e7e7] bg-[#ffffff] md:static md:z-auto md:grid-cols-4 md:rounded-2xl md:border md:shadow-sm`}>
          {TABS.map(([id, label, Icon], i) => (
            <button key={id} onClick={() => { setTab(id); setMore(false); }} aria-current={tab === id ? 'page' : undefined} className={`${i >= 4 && TABS.length > 4 ? 'hidden md:flex' : 'flex'} flex-col items-center gap-1 px-2 py-3 text-xs font-black transition md:flex-row md:justify-center md:gap-2 md:text-sm ${tab === id ? 'bg-[#2a5cac] text-white md:rounded-2xl' : 'text-[#3b4a5c] hover:bg-[#f7f6f2] md:rounded-2xl'}`}>
              <Icon className="h-6 w-6 md:h-5 md:w-5" aria-hidden="true" /> {t(label)}
            </button>
          ))}
          {TABS.length > 4 && (
            <button onClick={() => setMore((v) => !v)} aria-expanded={more} aria-controls="parent-more" className={`flex flex-col items-center gap-1 px-2 py-3 text-xs font-black transition md:hidden ${TABS.slice(4).some(([id]) => id === tab) ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#f7f6f2]'}`}>
              <MoreHorizontal className="h-6 w-6" aria-hidden="true" /> {t('More')}
            </button>
          )}
        </nav>
        {more && TABS.length > 4 && (
          <div id="parent-more" role="group" aria-label={t('More sections')} className="fixed inset-x-0 bottom-[4.5rem] z-30 mx-3 grid grid-cols-2 gap-2 rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-3 shadow-xl md:hidden">
            {TABS.slice(4).map(([id, label, Icon]) => (
              <button key={id} onClick={() => { setTab(id); setMore(false); }} aria-current={tab === id ? 'page' : undefined} className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-black ${tab === id ? 'bg-[#2a5cac] text-white' : 'bg-[#f7f6f2] text-[#3b4a5c]'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" /> {t(label)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex h-56 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2a5cac] border-t-transparent" /></div>
        ) : (
          <>
            {tab === 'home' && (
              <div className="space-y-5">
                {data?.children.length === 0 && <Card><p className="text-base text-[#3b4a5c]">{t("No child is linked to your account yet. Please ask the school office to link your child's record.")}</p></Card>}
                {data?.children.map((c) => (
                  <div key={c._id} className="overflow-hidden rounded-3xl border border-[#e3e7e7] bg-[#ffffff] shadow-sm">
                    <div className="flex items-center gap-4 px-5 pt-5">
                      {c.photo ? <img src={c.photo} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2a5cac] text-2xl font-black text-white">{c.name.charAt(0)}</div>}
                      <div>
                        <h2 className="text-2xl font-black">{c.name}</h2>
                        <p className="text-sm font-semibold text-[#3b4a5c]">{t('Class')} {classLabel(c.class)}{c.rollNumber ? ` · ${t('Roll')} ${c.rollNumber}` : ''}</p>
                      </div>
                    </div>

                    {c.attendanceHidden ? (
                      <p className="mx-5 my-5 rounded-2xl bg-[#f7f6f2] px-5 py-4 text-sm font-semibold text-[#3b4a5c]">{t('Attendance is not shared on this account. Please contact the school office.')}</p>
                    ) : (<>
                    {/* TODAY - the one thing a parent wants to know */}
                    <div className={`mx-5 mt-4 rounded-2xl px-5 py-4 text-white ${BANNER[c.today.status] || BANNER.None}`}>
                      <p className="text-xs font-bold uppercase tracking-wide text-white/80">{t('Today')} · {fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      <p className="mt-1 text-xl font-black leading-snug">{todaySentence(t, c.name.split(' ')[0], c.today.status === 'None' ? null : c.today.status, c.today.leftAt)}</p>
                      {c.today.remarks && <p className="mt-1 text-sm text-white/90">{c.today.remarks}</p>}
                    </div>

                    {/* last 7 days */}
                    <div className="px-5 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5b6b7b]">{t('Last 7 days')}</p>
                      <div className="grid grid-cols-7 gap-1.5 text-center">
                        {c.strip.map((d) => (
                          <div key={d.date}>
                            <div className={`flex h-10 items-center justify-center rounded-xl text-sm font-black ${STATUS[d.status]?.cell || STATUS.None.cell}`}>{new Date(`${d.date}T00:00:00Z`).getUTCDate()}</div>
                            <p className="mt-1 text-[10px] font-bold text-[#5b6b7b]">{fmtDate(d.date, { weekday: 'short' })}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 px-5 py-5">
                      <Ring value={c.overall.percentage} total={c.overall.total} />
                      <div className="min-w-[10rem] flex-1 text-sm font-semibold text-[#3b4a5c]">
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
                    <button onClick={() => { setChildId(c._id); setTab('attendance'); }} className="flex w-full items-center justify-between border-t border-[#eef2f8] bg-[#f7f6f2] px-5 py-4 text-base font-black text-[#2a5cac] hover:bg-[#eef2f8]">
                      {t('See full attendance')} <Arrow className="h-5 w-5" />
                    </button>
                    </>)}
                  </div>
                ))}
              </div>
            )}

            {tab === 'attendance' && (
              <div className="space-y-4">
                <Switcher />
                {child ? (
                  <>
                    <Card><h2 className="text-2xl font-black">{child.name}</h2><p className="text-sm font-semibold text-[#3b4a5c]">{t('Attendance')} · {t('Class')} {classLabel(child.class)}</p><div className="mt-2"><StatusChip status={child.today.status} leftAt={child.today.leftAt} /></div></Card>
                    <AttendanceReportView report={report} today={today} threshold={data.threshold} loading={reportLoading} />
                  </>
                ) : <Card><p>{t('No child selected.')}</p></Card>}
              </div>
            )}

            {tab === 'documents' && <MyDocuments />}
            {tab === 'quizzes' && <FamilyQuizResults />}
            {tab === 'nursery' && <FamilyNursery />}
            {tab === 'messages' && <FamilyMessages />}
            {tab === 'wellbeing' && <FamilyCare role="parent" />}
            {tab === 'consent' && <FamilyConsent />}
            {tab === 'devices' && <FamilySignals />}
            {tab === 'bus' && (<div className="space-y-4"><Switcher />{childId ? <TransportMe key={childId} role="parent" childId={childId} /> : <Card><p>{t('No child selected.')}</p></Card>}</div>)}
            {tab === 'library' && (<div className="space-y-4"><Switcher />{childId ? <LibraryMe key={childId} role="parent" childId={childId} /> : <Card><p>{t('No child selected.')}</p></Card>}</div>)}
            {tab === 'desk' && <FamilyDesk role="parent" kids={(data?.children || []).filter((c) => !c.attendanceHidden)} />}

            {tab === 'fees' && (
              <div className="space-y-4">
                <Switcher />
                {child ? (
                  <>
                    <Card>
                      <h2 className="text-2xl font-black">{t('Fees')} · {child.name}</h2>
                      <p className="mt-1 text-sm font-semibold text-[#3b4a5c]">{t('Pay through your bank, JazzCash or Easypaisa, then upload the payment screenshot. The school checks it and marks the fee as paid.')}</p>
                    </Card>
                    <FeesPanel key={child._id} studentId={child._id} studentName={child.name} />
                  </>
                ) : <Card><p>{t('No child selected.')}</p></Card>}
              </div>
            )}

            {tab === 'notices' && (
              <div className="space-y-3">
                {notices.length === 0 && <Card><p className="py-4 text-center text-base text-[#5b6b7b]">{t('No notices right now.')}</p></Card>}
                {notices.map((n) => {
                  const links = extractLinks(n.content);
                  return (
                    <div key={n._id} className="flex items-start gap-3">
                      <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2a5cac] text-white"><Bell className="h-5 w-5" /></div>
                      {/* message-style bubble */}
                      <div className="min-w-0 flex-1 rounded-3xl rounded-tl-md border border-[#e3e7e7] bg-[#ffffff] px-5 py-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-black text-[#2a5cac]">{t('School')}</span>
                          {n.isPinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800"><Pin className="h-3 w-3" />{t('Pinned')}</span>}
                          <span className="rounded-full bg-[#2a5cac]/10 px-2 py-0.5 font-bold text-[#2a5cac]">{n.category}</span>
                          <span className="ml-auto text-[#5b6b7b]">{new Date(n.createdAt).toLocaleDateString()}</span>
                        </div>
                        <h3 className="mt-2 text-base font-black leading-snug">{n.title}</h3>
                        <RichText text={n.content} className="mt-1 text-base leading-7 text-[#1b2837]" />
                        {(links.length > 0 || (n.attachments || []).length > 0) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {links.slice(0, 4).map((u) => (
                              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#c9d6ea] bg-[#eef2f8] px-3 py-1.5 text-xs font-black text-[#2a5cac] hover:bg-[#dde7f5]"><ExternalLink className="h-3.5 w-3.5" />{t('Open link')}</a>
                            ))}
                            {(n.attachments || []).map((u) => (
                              <button key={u} onClick={() => openProxiedFile(u)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e3e7e7] bg-white px-3 py-1.5 text-xs font-black text-[#2a5cac] hover:bg-[#f7f6f2]"><Paperclip className="h-3.5 w-3.5" />{fileName(u)}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'account' && (
              <div className="space-y-5">
              <ProfileEditor />
              <Card>
                <h2 className="text-2xl font-black">{t('My account')}</h2>
                <p className="mt-1 text-sm text-[#3b4a5c]">{data?.parent?.email} · {data?.parent?.relationship}</p>
                <form onSubmit={changePassword} className="mt-5 space-y-3">
                  {[['old', 'Current password'], ['next', 'New password'], ['confirm', 'Confirm new password']].map(([k, l]) => (
                    <div key={k}>
                      <label className="mb-1 block text-sm font-bold text-[#3b4a5c]">{t(l)}</label>
                      <input type="password" required value={pwd[k]} onChange={(e) => setPwd({ ...pwd, [k]: e.target.value })} className="w-full rounded-xl border border-[#e3e7e7] bg-white px-4 py-3 text-base outline-none focus:border-[#2a5cac]" />
                    </div>
                  ))}
                  <p className="text-xs text-[#5b6b7b]">{t('Minimum 6 characters with one capital letter, one number and one special character.')}</p>
                  <button className="rounded-xl bg-[#2a5cac] px-6 py-3 text-base font-black text-white hover:bg-[#234c91]">{t('Update password')}</button>
                </form>
              </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
