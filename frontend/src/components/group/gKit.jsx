import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
export * from '../analytics/anKit';

// "5 days", "Rs 250", "88%": the unit is always said, never left to guess
export const withUnit = (v, unit) => {
  if (v === null || v === undefined || v === '') return 'Not set';
  const n = Number(v).toLocaleString('en-PK');
  if (unit === 'percent') return `${n}%`; if (unit === 'rupees') return `Rs ${n}`; if (unit === 'days') return `${n} ${Number(v) === 1 ? 'day' : 'days'}`;
  if (unit === 'minutes') return `${n} ${Number(v) === 1 ? 'minute' : 'minutes'}`; if (unit === 'children') return `${n} ${Number(v) === 1 ? 'child' : 'children'}`;
  return `${n} ${unit}`;
};
export const SOURCE = { campus: ['Set for this campus', 'info'], group: ['Set for the group', 'good'], setting: ['The module\'s own setting', 'none'], default: ['Nothing set', 'none'] };
export const IGNORED = { locked: 'The group has locked this rule, so the campus value is set aside.', limits: 'The campus value is outside the group\'s limits, so it is set aside.' };

// who the person is here, and the campuses they may look at
export function useGroupAccess() {
  const [s, setS] = useState({ ready: false, wide: false, campuses: [] });
  useEffect(() => { let live = true; apiClient.get('/group/access').then((r) => { if (live) setS({ ready: true, ...r.data }); }).catch(() => { if (live) setS((x) => ({ ...x, ready: true, none: true })); }); return () => { live = false; }; }, []);
  return s;
}
