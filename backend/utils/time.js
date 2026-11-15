// School-local "now": day name, HH:MM minutes since midnight and YYYY-MM-DD key.
// Period windows must follow the school's clock, not the hosting server's (usually UTC).
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const nowInTz = (tz = 'UTC', at = new Date()) => {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return nowInTz('UTC', at);
  }
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  const hour = parseInt(p.hour, 10) % 24;
  const minutes = hour * 60 + parseInt(p.minute, 10);
  return {
    dayName: p.weekday,
    minutes,
    dateKey: `${p.year}-${p.month}-${p.day}`,
    dateUTC: new Date(`${p.year}-${p.month}-${p.day}T00:00:00.000Z`), // how attendance dates are stored
  };
};

const timeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

const isValidTz = (tz) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
};

module.exports = { nowInTz, timeToMinutes, isValidTz, DAY };
