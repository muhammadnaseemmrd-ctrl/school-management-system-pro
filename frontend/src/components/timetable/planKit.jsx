import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { errMsg } from '../ui';

// one-shot fetch with reload
export const useGet = (path, params) => {
  const [s, setS] = useState({ data: null, loading: true, error: '' }); const q = JSON.stringify(params || {});
  const load = useCallback(async () => {
    setS((x) => ({ ...x, loading: true }));
    try { const r = await apiClient.get(path, { params: JSON.parse(q) }); setS({ data: r.data, loading: false, error: '' }); } catch (e) { setS({ data: null, loading: false, error: errMsg(e, 'Could not load') }); }
  }, [path, q]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
};
export const call = async (fn, ok, after) => { try { const r = await fn(); if (ok) toast.success(typeof ok === 'function' ? ok(r) : ok); if (after) await after(r); return r; } catch (e) { toast.error(errMsg(e)); return null; } };
export const DAYS6 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const KINDS = ['Classroom', 'Lab', 'Library', 'Hall', 'Sports', 'Computer', 'Other'];
export const COVER_TONE = { Needed: 'Pending', Proposed: 'Pending', Assigned: 'Approved', Cancelled: 'None' };
export const SWAP_TONE = { Requested: 'Pending', PeerAccepted: 'Pending', Approved: 'Approved', Declined: 'Suspended', Cancelled: 'None' };
export const SWAP_LABEL = { Requested: 'Waiting for colleague', PeerAccepted: 'Waiting for approval', Approved: 'Approved', Declined: 'Declined', Cancelled: 'Cancelled' };
export const fmtDay = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
export const todayLocal = () => new Date().toLocaleDateString('en-CA');
