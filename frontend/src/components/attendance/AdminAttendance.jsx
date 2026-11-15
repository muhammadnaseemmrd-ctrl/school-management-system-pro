import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ArrowLeft, ArrowRight, CalendarDays, UserCheck, AlertCircle, CheckCircle2, Pencil } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { useLang } from '../../i18n/LanguageContext';
import ClassAttendanceSheet from './ClassAttendanceSheet';

// Admin view: which classes have taken attendance today, who is the head master of each class,
// and the ability to open any class sheet (admins can correct any date).
const AdminAttendance = ({ teachers = [], onChanged }) => {
  const { t, fmtDate, isRtl } = useLang();
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openClass, setOpenClass] = useState(null);
  const [editing, setEditing] = useState(null); // classId whose head master is being changed

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await apiClient.get('/daily-attendance/overview', { params: d ? { date: d } : {} });
      setData(res.data);
      setDate(res.data.date);
    } catch (e) {
      toast.error(e.response?.data?.message || t('Could not load attendance'));
    } finally { setLoading(false); }
  }, [t]);
  useEffect(() => { load(''); }, [load]);

  const assign = async (classId, teacherId) => {
    try {
      const res = await apiClient.put(`/classes/${classId}/head-master`, { teacherId: teacherId || null });
      toast.success(res.data.replaced ? t('Head master changed. The previous head master was replaced.') : t('Head master saved'));
      setEditing(null);
      load(date);
      onChanged && onChanged();
    } catch (e) { toast.error(e.response?.data?.message || t('Could not save head master')); }
  };

  const Back = isRtl ? ArrowRight : ArrowLeft;
  if (openClass) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setOpenClass(null); load(date); }} className="inline-flex items-center gap-2 rounded-xl border border-[#d9c5b0] bg-white px-4 py-2.5 text-sm font-bold text-[#7a4e2d] hover:bg-[#f4ecdf]"><Back className="h-4 w-4" /> {t('All classes')}</button>
        <ClassAttendanceSheet classId={openClass} />
      </div>
    );
  }

  const totals = data?.totals;
  const notMarked = data ? data.classes.filter((c) => !c.marked && c.students > 0) : [];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#3f2a1d]">{t('Attendance')}</h2>
            <p className="mt-1 max-w-xl text-sm text-[#6d4c35]">{t('Attendance is taken once a day by the head master of each class. You can see every class here and correct any date.')}</p>
          </div>
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7a4e2d]" />
            <input type="date" value={date} max={data?.today} onChange={(e) => e.target.value && load(e.target.value)} className="rounded-xl border border-[#d9c5b0] bg-white py-3 pe-3 ps-10 text-base font-bold text-[#3f2a1d] focus:border-[#7a4e2d] focus:outline-none" />
          </label>
        </div>
        {date && <p className="mt-3 text-sm font-semibold text-[#6d4c35]">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      </div>

      {totals && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[#d9c5b0] bg-[#fffaf3] px-4 py-3"><p className="text-3xl font-black">{totals.marked}<span className="text-lg text-[#8a6a50]">/{totals.classes}</span></p><p className="text-xs font-bold text-[#6d4c35]">{t('Classes marked')}</p></div>
          <div className={`rounded-2xl border px-4 py-3 ${notMarked.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-3xl font-black">{notMarked.length}</p><p className="text-xs font-bold text-[#6d4c35]">{t('Waiting for attendance')}</p></div>
          <div className={`rounded-2xl border px-4 py-3 ${totals.noHeadMaster ? 'border-[#fecdd3] bg-[#fff1f2]' : 'border-[#d9c5b0] bg-[#fffaf3]'}`}><p className="text-3xl font-black">{totals.noHeadMaster}</p><p className="text-xs font-bold text-[#6d4c35]">{t('Classes without head master')}</p></div>
        </div>
      )}

      {loading && !data ? <p className="p-8 text-center text-[#6d4c35]">{t('Loading...')}</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.classes.map((c) => (
            <div key={c.classId} className="rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-[#3f2a1d]">{t('Class')} {c.name}</h3>
                  <p className="text-xs font-semibold text-[#8a6a50]">{t('{n} students', { n: c.students })}</p>
                </div>
                {c.marked
                  ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> {t('Marked')}</span>
                  : <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> {t('Not marked yet')}</span>}
              </div>

              {c.marked && (
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[[c.present, 'Present', 'text-emerald-700'], [c.halfDay, 'Half day', 'text-amber-700'], [c.absent, 'Absent', 'text-[#be123c]'], [c.leave, 'On leave', 'text-[#0369a1]']].map(([v, l, col]) => (
                    <div key={l} className="rounded-xl bg-white px-1 py-2"><p className={`text-lg font-black ${col}`}>{v}</p><p className="text-[10px] font-bold text-[#8a6a50]">{t(l)}</p></div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-[#f4ecdf] px-4 py-3">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#8a6a50]"><UserCheck className="h-4 w-4" /> {t('Head master')}</p>
                {editing === c.classId ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select autoFocus defaultValue={c.headMaster?._id || ''} onChange={(e) => assign(c.classId, e.target.value)} className="min-w-[10rem] flex-1 rounded-xl border border-[#d9c5b0] bg-white px-3 py-2.5 text-sm font-bold">
                      <option value="">{t('— No head master —')}</option>
                      {teachers.map((tc) => <option key={tc._id} value={tc._id}>{tc.name}</option>)}
                    </select>
                    <button onClick={() => setEditing(null)} className="rounded-xl border border-[#d9c5b0] bg-white px-4 py-2.5 text-sm font-bold text-[#6d4c35]">{t('Cancel')}</button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className={`text-base font-black ${c.headMaster ? 'text-[#3f2a1d]' : 'text-[#be123c]'}`}>{c.headMaster?.name || t('Not assigned')}</p>
                    <button onClick={() => setEditing(c.classId)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#7a4e2d] hover:bg-white"><Pencil className="h-3.5 w-3.5" /> {c.headMaster ? t('Change') : t('Assign')}</button>
                  </div>
                )}
              </div>

              <button onClick={() => setOpenClass(c.classId)} disabled={!c.students} className="mt-4 w-full rounded-xl bg-[#7a4e2d] px-4 py-3 text-sm font-black text-white hover:bg-[#633d22] disabled:opacity-40">
                {c.marked ? t('View / correct attendance') : t('Take attendance')}
              </button>
            </div>
          ))}
          {data && !data.classes.length && <p className="col-span-full p-8 text-center text-[#6d4c35]">{t('No classes have been set up yet.')}</p>}
        </div>
      )}
    </div>
  );
};

export default AdminAttendance;
