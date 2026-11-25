// Turns the link stored on a notification into a real dashboard address.
// The server writes links in several shapes ('#/care', '/admin?tab=safetyDesk', '/student#/record', '/admin/dashboard#/staff').
// Dashboards only understand "/<role>/dashboard#/<tab>", and name some tabs differently per role, so it is fixed in one place here.

const TAB_ALIASES = {
  admin: { care: 'careDesk', 'attendance-ops': 'attendance' },
  teacher: { care: 'careDesk', 'attendance-ops': 'attendanceDesk' },
  parent: { care: 'wellbeing', earlyYears: 'nursery', 'attendance-ops': 'attendance' },
  student: { care: 'support', wellbeing: 'support', 'attendance-ops': 'attendance' },
};

export function resolveNotificationLink(link, role) {
  if (!link || typeof link !== 'string') return null;
  let url;
  try { url = new URL(link, window.location.origin); } catch { return null; }
  if (url.origin !== window.location.origin) return null; // never send someone to another site from a notification

  const first = url.pathname.split('/').filter(Boolean)[0];
  const dashRole = ['admin', 'teacher', 'student', 'parent'].includes(first) ? first : role;
  if (!dashRole) return null;

  let tab = url.hash.replace(/^#\/?/, '') || url.searchParams.get('tab') || '';
  tab = (TAB_ALIASES[dashRole] || {})[tab] || tab;

  // Pages that are not a dashboard (for example /admin/studio or /driver) are kept as written.
  const rest = url.pathname.split('/').filter(Boolean);
  if (first && !['admin', 'teacher', 'student', 'parent'].includes(first)) return { path: url.pathname, hash: url.hash, search: url.search };
  if (rest.length > 1 && rest[1] !== 'dashboard') return { path: url.pathname, hash: url.hash, search: url.search };

  return { path: `/${dashRole}/dashboard`, hash: tab ? `#/${tab}` : '', search: '' };
}
