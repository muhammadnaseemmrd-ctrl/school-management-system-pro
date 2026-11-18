import React from 'react';
import { CheckCircle2, XCircle, Clock, LogOut, Palmtree, CircleSlash, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '../../i18n/LanguageContext';

// One colour language for attendance everywhere: green present, amber half day / late, red absent, blue leave
export const STATUS = {
  Present: { label: 'Present', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', cell: 'bg-emerald-500 text-white', soft: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  Late: { label: 'Late', chip: 'bg-orange-50 text-orange-800 border-orange-200', cell: 'bg-orange-400 text-white', soft: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400', icon: Clock },
  HalfDay: { label: 'Half day', chip: 'bg-amber-50 text-amber-800 border-amber-200', cell: 'bg-amber-400 text-white', soft: 'bg-amber-50 border-amber-200', dot: 'bg-amber-400', icon: LogOut },
  Absent: { label: 'Absent', chip: 'bg-[#fff1f2] text-[#9f1239] border-[#fecdd3]', cell: 'bg-[#f43f5e] text-white', soft: 'bg-[#fff1f2] border-[#fecdd3]', dot: 'bg-[#f43f5e]', icon: XCircle },
  Leave: { label: 'On leave', chip: 'bg-[#eef2f8] text-[#234c91] border-[#c9d6ea]', cell: 'bg-[#5b87c9] text-white', soft: 'bg-[#eef2f8] border-[#c9d6ea]', dot: 'bg-[#5b87c9]', icon: Palmtree },
  None: { label: 'Not marked yet', chip: 'bg-stone-100 text-stone-600 border-stone-200', cell: 'bg-stone-100 text-stone-400', soft: 'bg-stone-50 border-stone-200', dot: 'bg-stone-300', icon: CircleSlash },
};

export const STATUS_ORDER = ['Present', 'Late', 'HalfDay', 'Absent', 'Leave'];

export const StatusChip = ({ status, leftAt, className = '' }) => {
  const { t } = useLang();
  const s = STATUS[status] || STATUS.None;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${s.chip} ${className}`}>
      <Icon className="h-3.5 w-3.5" /> {t(s.label)}{status === 'HalfDay' && leftAt ? ` · ${leftAt}` : ''}
    </span>
  );
};

export const Legend = () => {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-[#3b4a5c]">
      {['Present', 'Late', 'HalfDay', 'Absent', 'Leave'].map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${STATUS[k].dot}`} /> {t(STATUS[k].label)}</span>
      ))}
    </div>
  );
};

// Month grid coloured by status. `byDate` maps YYYY-MM-DD -> { status, leftAt }
export const MonthCalendar = ({ month, onMonthChange, byDate, today, selected, onSelect, loading }) => {
  const { t, locale, isRtl } = useLang();
  const y = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const Prev = isRtl ? ChevronRight : ChevronLeft;
  const Next = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => onMonthChange(new Date(Date.UTC(y, m - 1, 1)))} className="rounded-xl border border-[#e3e7e7] bg-white p-2.5 text-[#2a5cac] hover:bg-[#f7f6f2]" aria-label={t('Previous month')}><Prev className="h-5 w-5" /></button>
        <span className="text-base font-black text-[#1b2837]">{month.toLocaleDateString(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={() => onMonthChange(new Date(Date.UTC(y, m + 1, 1)))} className="rounded-xl border border-[#e3e7e7] bg-white p-2.5 text-[#2a5cac] hover:bg-[#f7f6f2]" aria-label={t('Next month')}><Next className="h-5 w-5" /></button>
      </div>
      <div className={`grid grid-cols-7 gap-1.5 text-center transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {weekdays.map((d) => <div key={d} className="pb-1 text-[11px] font-bold uppercase tracking-wide text-[#5b6b7b]">{t(d)}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`b${i}`} />;
          const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const rec = byDate[key];
          const st = STATUS[rec?.status || 'None'];
          const weekend = [5, 6].includes((lead + day - 1) % 7);
          return (
            <button
              key={key} type="button" disabled={!rec}
              onClick={() => onSelect && onSelect(selected === key ? null : key)}
              className={`h-11 rounded-xl text-sm font-bold transition sm:h-12 ${rec ? `${st.cell} cursor-pointer hover:scale-105` : weekend ? 'bg-[#f7f6f2]/60 text-[#a9b4bf]' : 'bg-stone-50 text-stone-300'} ${key === today ? 'ring-2 ring-[#2a5cac] ring-offset-1' : ''} ${selected === key ? 'scale-105 ring-2 ring-[#1b2837]' : ''}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Big percentage ring used on parent + student screens
export const Ring = ({ value, total, size = 112 }) => {
  const { t } = useLang();
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(100, value) : 0;
  const color = !total ? '#d6d3d1' : pct >= 90 ? '#2c776c' : pct >= 75 ? '#b86650' : '#f43f5e';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eef2f8" strokeWidth="12" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-[#1b2837]">{total ? `${value}%` : "—"}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#5b6b7b]">{t('attendance')}</span>
      </div>
    </div>
  );
};

// Plain-language sentence for a day status, e.g. "Ayesha was present today"
export const todaySentence = (t, name, status, leftAt) => {
  switch (status) {
    case 'Present': return t('{name} is present today', { name });
    case 'Late': return t('{name} came late today', { name });
    case 'HalfDay': return leftAt ? t('{name} left school early today at {time}', { name, time: leftAt }) : t('{name} left school early today', { name });
    case 'Absent': return t('{name} is absent today', { name });
    case 'Leave': return t('{name} is on leave today', { name });
    default: return t("{name}'s attendance is not marked yet today", { name });
  }
};
