import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { useLang } from '../../i18n/LanguageContext';
import AttendanceReportView from './AttendanceReportView';
import { STATUS, STATUS_ORDER } from './shared';

// Inside the admin's student profile: the student's attendance + a small form to fix one day
const StudentAttendanceAdmin = ({ studentId, attendance, today, onChanged }) => {
  const { t } = useLang();
  const [form, setForm] = useState({ date: today, status: 'Present', leftAt: '', remarks: '' });
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.put('/daily-attendance/student-day', { studentId, ...form, leftAt: form.status === 'HalfDay' ? form.leftAt : undefined });
      toast.success(t('Attendance saved'));
      onChanged && onChanged();
    } catch (err) { toast.error(err.response?.data?.message || t('Could not save attendance')); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="grid items-end gap-3 rounded-2xl border border-[#e3e7e7] bg-white p-4 sm:grid-cols-2 md:grid-cols-5">
        <div className="md:col-span-5"><p className="text-sm font-black text-[#1b2837]">{t('Correct a day')}</p></div>
        <label className="text-xs font-bold text-[#3b4a5c]">{t('Date')}
          <input type="date" required max={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-xl border border-[#e3e7e7] px-3 py-2.5 text-sm font-bold" />
        </label>
        <label className="text-xs font-bold text-[#3b4a5c]">{t('Status')}
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full rounded-xl border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm font-bold">
            {STATUS_ORDER.map((k) => <option key={k} value={k}>{t(STATUS[k].label)}</option>)}
          </select>
        </label>
        <label className={`text-xs font-bold text-[#3b4a5c] ${form.status === 'HalfDay' ? '' : 'opacity-40'}`}>{t('Left at')}
          <input type="time" disabled={form.status !== 'HalfDay'} value={form.leftAt} onChange={(e) => setForm({ ...form, leftAt: e.target.value })} className="mt-1 w-full rounded-xl border border-[#e3e7e7] px-3 py-2.5 text-sm font-bold" />
        </label>
        <label className="text-xs font-bold text-[#3b4a5c]">{t('Note (optional)')}
          <input value={form.remarks} maxLength={200} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="mt-1 w-full rounded-xl border border-[#e3e7e7] px-3 py-2.5 text-sm" />
        </label>
        <button disabled={saving} className="rounded-xl bg-[#2a5cac] px-4 py-2.5 text-sm font-black text-white hover:bg-[#234c91] disabled:opacity-50">{saving ? t('Saving...') : t('Save')}</button>
      </form>
      <AttendanceReportView report={attendance && { stats: attendance.stats, daily: attendance.records, monthly: attendance.monthly }} today={today} />
    </div>
  );
};

export default StudentAttendanceAdmin;
