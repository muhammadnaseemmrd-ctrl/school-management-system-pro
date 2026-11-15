// Pure helpers for once-a-day attendance (no database access, easy to test).
//   Present = 1 day, Late = 1 day (arrived late but attended), HalfDay = 0.5 day,
//   Absent = 0, Leave = 0 (counted as a school day that was missed).
const LOW_ATTENDANCE_THRESHOLD = 75;
const WEIGHT = { Present: 1, Late: 1, HalfDay: 0.5, Absent: 0, Leave: 0 };

const dayKey = (d) => new Date(d).toISOString().split('T')[0];

const tallyDaily = (records) => {
  const t = { total: records.length, present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, attendedDays: 0 };
  for (const r of records) {
    if (r.status === 'Present') t.present++;
    else if (r.status === 'Late') t.late++;
    else if (r.status === 'HalfDay') t.halfDay++;
    else if (r.status === 'Absent') t.absent++;
    else if (r.status === 'Leave') t.leave++;
    t.attendedDays += WEIGHT[r.status] ?? 0;
  }
  t.percentage = t.total ? Number(((t.attendedDays / t.total) * 100).toFixed(1)) : 0;
  return t;
};

const buildDailyReport = (records) => {
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  const stats = tallyDaily(sorted);
  const daily = sorted.map((r) => ({ date: dayKey(r.date), status: r.status, leftAt: r.leftAt || null, remarks: r.remarks || '' }));

  const byMonth = new Map();
  for (const r of sorted) {
    const m = dayKey(r.date).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(r);
  }
  const monthly = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, rows]) => ({ month, ...tallyDaily(rows) }));

  return {
    stats: { ...stats, lowAttendance: stats.total > 0 && stats.percentage < LOW_ATTENDANCE_THRESHOLD, threshold: LOW_ATTENDANCE_THRESHOLD },
    daily,
    monthly,
  };
};

module.exports = { LOW_ATTENDANCE_THRESHOLD, WEIGHT, dayKey, tallyDaily, buildDailyReport };
