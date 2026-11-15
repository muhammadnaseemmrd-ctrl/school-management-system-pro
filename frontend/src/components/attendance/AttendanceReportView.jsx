import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLang } from '../../i18n/LanguageContext';
import { Legend, MonthCalendar, Ring, StatusChip, STATUS } from './shared';

// Calendar + totals + day list for one student. Used by the student screen and inside the parent screen.
// props: report = { stats, daily:[{date,status,leftAt,remarks}], monthly }, today (YYYY-MM-DD), threshold
const AttendanceReportView = ({ report, today, threshold = 75, loading }) => {
  const { t, fmtDate } = useLang();
  const stats = report?.stats || { total: 0, present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, percentage: 0 };
  const daily = report?.daily || [];
  const byDate = useMemo(() => Object.fromEntries(daily.map((d) => [d.date, d])), [daily]);
  const [month, setMonth] = useState(() => { const d = new Date(`${today || new Date().toISOString().split('T')[0]}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); });
  const [selected, setSelected] = useState(null);
  const sel = selected ? byDate[selected] : null;
  const recent = [...daily].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);

  const tiles = [
    ['Present', stats.present + stats.late], ['HalfDay', stats.halfDay], ['Absent', stats.absent], ['Leave', stats.leave],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5 rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm">
        <Ring value={stats.percentage} total={stats.total} />
        <div className="min-w-[10rem] flex-1">
          <p className="text-sm font-semibold text-[#6d4c35]">{t('Out of {n} school days', { n: stats.total })}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map(([k, v]) => (
              <div key={k} className={`rounded-2xl border px-3 py-2 ${STATUS[k].soft}`}>
                <p className="text-xl font-black text-[#3f2a1d]">{v}</p>
                <p className="text-[11px] font-bold text-[#6d4c35]">{k === 'Present' ? t('Days present') : t(STATUS[k].label)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats.total > 0 && stats.percentage < threshold && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{t('Attendance is below {n}%. Please make sure school is not missed.', { n: threshold })}</span>
        </div>
      )}

      <div className="rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm">
        <MonthCalendar month={month} onMonthChange={(m) => { setMonth(m); setSelected(null); }} byDate={byDate} today={today} selected={selected} onSelect={setSelected} loading={loading} />
        <div className="mt-4"><Legend /></div>
        {sel && (
          <div className={`mt-4 rounded-2xl border px-4 py-3 ${STATUS[sel.status].soft}`}>
            <p className="text-sm font-black text-[#3f2a1d]">{fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <div className="mt-1"><StatusChip status={sel.status} leftAt={sel.leftAt} /></div>
            {sel.remarks && <p className="mt-2 text-sm text-[#6d4c35]">{sel.remarks}</p>}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[#d9c5b0] bg-[#fffaf3] p-5 shadow-sm">
        <h3 className="mb-3 text-base font-black text-[#3f2a1d]">{t('Recent days')}</h3>
        {recent.length ? (
          <ul className="divide-y divide-[#eadcc9]">
            {recent.map((d) => (
              <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm font-bold text-[#3f2a1d]">{fmtDate(d.date)}</span>
                <StatusChip status={d.status} leftAt={d.leftAt} />
              </li>
            ))}
          </ul>
        ) : <p className="py-4 text-center text-sm text-[#8a6a50]">{t('No attendance has been recorded yet.')}</p>}
      </div>
    </div>
  );
};

export default AttendanceReportView;
