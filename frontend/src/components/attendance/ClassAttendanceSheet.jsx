import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Save, Lock, Info } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { useLang } from '../../i18n/LanguageContext';
import { STATUS, STATUS_ORDER } from './shared';

const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };

// The one screen the head master (or the admin) uses to take attendance:
// pick a date, see the class list, tick who is present, press Save.
const ClassAttendanceSheet = ({ classId, onSaved }) => {
  const { t, fmtDate, isRtl } = useLang();
  const [date, setDate] = useState('');
  const [sheet, setSheet] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/daily-attendance/class/${classId}`, { params: d ? { date: d } : {} });
      const s = res.data;
      setSheet(s);
      setDate(s.date);
      // students with no saved record start as Present: the head master only has to untick the absentees
      setRows(s.students.map((st) => ({ ...st, status: st.status || 'Present' })));
      setDirty(!s.marked);
    } catch (e) {
      toast.error(e.response?.data?.message || t('Could not load the class list'));
    } finally {
      setLoading(false);
    }
  }, [classId, t]);

  useEffect(() => { load(''); }, [load]);

  const counts = useMemo(() => {
    const c = { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const setStatus = (id, status) => {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, status, leftAt: status === 'HalfDay' ? r.leftAt : null } : r)));
    setDirty(true);
  };
  const setLeft = (id, leftAt) => { setRows((rs) => rs.map((r) => (r._id === id ? { ...r, leftAt } : r))); setDirty(true); };
  const markAllPresent = () => { setRows((rs) => rs.map((r) => ({ ...r, status: 'Present', leftAt: null }))); setDirty(true); };

  const changeDate = (d) => {
    if (dirty && sheet?.canEdit && !window.confirm(t('You have unsaved changes. Change the date anyway?'))) return;
    load(d);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/daily-attendance/class/${classId}`, {
        date,
        records: rows.map((r) => ({ studentId: r._id, status: r.status, leftAt: r.status === 'HalfDay' ? r.leftAt || undefined : undefined })),
      });
      toast.success(t('Attendance saved'));
      setDirty(false);
      await load(date);
      onSaved && onSaved();
    } catch (e) {
      toast.error(e.response?.data?.message || t('Could not save attendance'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !sheet) return <div className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-8 text-center text-[#3b4a5c]">{t('Loading...')}</div>;
  if (!sheet) return null;

  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const isToday = date === sheet.today;
  const readOnly = !sheet.canEdit;

  return (
    <div className="space-y-5">
      {/* class + date */}
      <div className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#5b6b7b]">{t('Daily attendance')}</p>
            <h2 className="text-2xl font-black text-[#1b2837] sm:text-3xl">{t('Class')} {sheet.class.name}</h2>
            {sheet.headMaster && <p className="mt-1 text-sm text-[#3b4a5c]">{t('Head master')}: <span className="font-bold">{sheet.headMaster.name}</span></p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => changeDate(addDays(date, -1))} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-[#2a5cac] hover:bg-[#f7f6f2]" aria-label={t('Previous day')}><PrevIcon className="h-5 w-5" /></button>
            <label className="relative">
              <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2a5cac]" />
              <input type="date" value={date} max={sheet.today} onChange={(e) => e.target.value && changeDate(e.target.value)} className="rounded-xl border border-[#e3e7e7] bg-white py-3 pe-3 ps-10 text-base font-bold text-[#1b2837] focus:border-[#2a5cac] focus:outline-none" />
            </label>
            <button type="button" onClick={() => changeDate(addDays(date, 1))} disabled={isToday} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-[#2a5cac] hover:bg-[#f7f6f2] disabled:opacity-40" aria-label={t('Next day')}><NextIcon className="h-5 w-5" /></button>
            {!isToday && <button type="button" onClick={() => changeDate(sheet.today)} className="rounded-xl bg-[#2a5cac] px-4 py-3 text-sm font-bold text-white hover:bg-[#234c91]">{t('Today')}</button>}
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-[#3b4a5c]">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${sheet.marked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sheet.marked ? t('Attendance for this date is already saved. You can still correct it below.') : t('Attendance is not taken for this date yet. Everyone starts as Present: untick the students who are absent, then press Save.')}</span>
        </div>
        {readOnly && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#e3e7e7] bg-white px-4 py-3 text-sm font-semibold text-[#3b4a5c]">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('This date is older than {days} days. Ask the school admin to change it.', { days: sheet.editWindowDays })}</span>
          </div>
        )}
      </div>

      {/* live counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((k) => (
          <div key={k} className={`rounded-2xl border px-4 py-3 ${STATUS[k].soft}`}>
            <p className="text-2xl font-black text-[#1b2837]">{counts[k]}</p>
            <p className="text-xs font-bold text-[#3b4a5c]">{t(STATUS[k].label)}</p>
          </div>
        ))}
      </div>

      {/* class list */}
      <div className="overflow-hidden rounded-3xl border border-[#e3e7e7] bg-[#ffffff] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e7e7] bg-[#f7f6f2] px-5 py-3">
          <p className="text-sm font-bold text-[#1b2837]">{t('{n} students', { n: rows.length })}</p>
          {!readOnly && (
            <button type="button" onClick={markAllPresent} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
              <CheckCheck className="h-4 w-4" /> {t('Mark everyone present')}
            </button>
          )}
        </div>
        <ul className="divide-y divide-[#eef2f8]">
          {rows.map((r) => {
            const present = r.status === 'Present' || r.status === 'Late' || r.status === 'HalfDay';
            return (
              <li key={r._id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 ${STATUS[r.status].soft.split(' ')[0]}`}>
                <span className="w-10 text-sm font-bold text-[#5b6b7b]">{r.rollNumber}</span>
                <span className="min-w-[8rem] flex-1 text-base font-bold text-[#1b2837]">{r.name}</span>

                <label className={`flex items-center gap-2 ${readOnly ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={present} disabled={readOnly} onChange={(e) => setStatus(r._id, e.target.checked ? 'Present' : 'Absent')} className="h-7 w-7 cursor-pointer accent-[#2c776c]" />
                  <span className="text-sm font-bold text-[#1b2837]">{t('Present')}</span>
                </label>

                <select value={r.status} disabled={readOnly} onChange={(e) => setStatus(r._id, e.target.value)} className="rounded-xl border border-[#e3e7e7] bg-white px-3 py-2 text-sm font-bold text-[#1b2837] focus:border-[#2a5cac] focus:outline-none" aria-label={t('Status')}>
                  {STATUS_ORDER.map((k) => <option key={k} value={k}>{t(STATUS[k].label)}</option>)}
                </select>

                {r.status === 'HalfDay' && (
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    {t('Left at')}
                    <input type="time" value={r.leftAt || ''} disabled={readOnly} onChange={(e) => setLeft(r._id, e.target.value)} className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm" />
                  </label>
                )}
              </li>
            );
          })}
          {!rows.length && <li className="px-5 py-8 text-center text-[#3b4a5c]">{t('There are no students in this class yet.')}</li>}
        </ul>
      </div>

      {!readOnly && rows.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3e7e7] bg-[#ffffff]/95 px-5 py-3 shadow-lg">
          <p className="text-sm font-semibold text-[#3b4a5c]">{dirty ? t('You have changes that are not saved yet') : t('All changes saved')}</p>
          <button type="button" onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-[#2a5cac] px-6 py-3 text-base font-black text-white shadow-sm hover:bg-[#234c91] disabled:opacity-50">
            <Save className="h-5 w-5" /> {saving ? t('Saving...') : t('Save attendance')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ClassAttendanceSheet;
