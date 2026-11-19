// Offline queue (PRD E11). A change made with no network waits on this device with its own id and is sent when the connection
// returns. The server applies each id once, so a retry can never write twice. A queued change is never shown as confirmed.
import { useSyncExternalStore } from 'react';
import apiClient from './apiClient';

const newId = (p = 'm') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const newLocalId = () => newId('d');
const who = () => { try { const t = localStorage.getItem('accessToken'); return t ? JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).userId || 'anon' : 'anon'; } catch { return 'anon'; } };
const K = () => `aulensia-sync:${who()}`;
export const deviceId = () => { try { let d = localStorage.getItem('aulensia-device'); if (!d) { d = newId('dev'); localStorage.setItem('aulensia-device', d); } return d; } catch { return 'device'; } };

let st = null; const subs = new Set(); let timer = null; let busy = false; let snapshot = null;
const load = () => { try { const j = JSON.parse(localStorage.getItem(K()) || 'null'); return j && j.queue ? { ...j, queue: j.queue.map((x) => ({ ...x, inFlight: false })) } : { queue: [], failed: [], recent: [], lastSyncAt: null }; } catch { return { queue: [], failed: [], recent: [], lastSyncAt: null }; } };
const save = () => { try { localStorage.setItem(K(), JSON.stringify({ queue: st.queue, failed: st.failed, recent: st.recent, lastSyncAt: st.lastSyncAt })); } catch { /* storage full or blocked: the change stays in memory for this session */ } };
const ensure = () => { if (!st || st.owner !== who()) { st = { ...load(), owner: who(), syncing: false, online: typeof navigator === 'undefined' ? true : navigator.onLine, openConflicts: 0 }; } return st; };
const emit = () => { snapshot = null; subs.forEach((f) => f()); };
const view = () => { ensure(); if (!snapshot) snapshot = { queued: st.queue, failed: st.failed, recent: st.recent, syncing: st.syncing, online: st.online, lastSyncAt: st.lastSyncAt, openConflicts: st.openConflicts }; return snapshot; };

// when an earlier change for the same thing was just applied, the next queued one starts from that result, not from the old version
const rebase = (applied, result, next) => {
  if (next.entityKey !== applied.entityKey) return;
  if (applied.kind === 'draft' && result.revision) next.baseRevision = result.revision;
  if (applied.kind === 'marks') next.payload = { ...next.payload, base: { marks: applied.payload.marks, remarks: applied.payload.remarks || '' } };
  if (applied.kind === 'attendance' || applied.kind === 'period') { const b = { ...(next.payload.base || {}) }; (applied.payload.records || []).forEach((r) => { b[String(r.studentId)] = r.status; }); next.payload = { ...next.payload, base: b }; }
};
const record = (item, result) => { st.recent = [{ at: new Date().toISOString(), kind: item.kind, label: item.label || '', status: result.status, message: result.message || '' }, ...st.recent].slice(0, 25); };

export async function flush() {
  ensure(); if (busy || !st.queue.length || !navigator.onLine) return; busy = true; st.syncing = true; emit();
  try {
    while (st.queue.length) {
      const batch = st.queue.slice(0, 25); batch.forEach((b) => { b.inFlight = true; });
      let res; try { res = await apiClient.post('/sync/push', { mutations: batch.map(({ mutationId, kind, entityKey, baseRevision, capturedAt, payload }) => ({ mutationId, kind, entityKey, baseRevision, capturedAt, payload })), deviceId: deviceId() }); }
      catch (e) { batch.forEach((b) => { b.inFlight = false; }); if (!e.response) { st.online = false; break; } if (e.response.status >= 500) break; if (e.response.status === 401 || e.response.status === 403) break; batch.forEach((b) => { st.queue = st.queue.filter((x) => x.mutationId !== b.mutationId); st.failed.push({ ...b, error: e.response.data?.message || 'The server refused this change.' }); }); continue; }
      let progressed = false;
      for (const r of res.data.results) {
        const item = st.queue.find((x) => x.mutationId === r.mutationId); if (!item) continue;
        item.inFlight = false; if (r.status === 'Retry') continue;
        st.queue = st.queue.filter((x) => x.mutationId !== r.mutationId); progressed = true;
        if (r.status === 'Rejected') st.failed.push({ ...item, error: r.message || 'The server refused this change.' });
        else if (['Applied'].includes(r.status)) st.queue.forEach((n) => rebase(item, r, n));
        record(item, r);
      }
      st.openConflicts = res.data.openConflicts ?? st.openConflicts; st.lastSyncAt = new Date().toISOString();
      if (!progressed) break;
    }
  } finally { busy = false; st.syncing = false; save(); emit(); }
}

// Send now when online; keep on this device otherwise. Returns { sent, result } or { queued }.
export async function submit(m) {
  ensure(); const item = { mutationId: newId(), kind: m.kind, entityKey: m.entityKey || '', baseRevision: m.baseRevision || 0, capturedAt: new Date().toISOString(), payload: m.payload, label: m.label || '', createdAt: new Date().toISOString() };
  // an unsent change to the same thing is replaced by this one, keeping where it started from
  const prior = st.queue.find((x) => x.entityKey && x.entityKey === item.entityKey && x.kind === item.kind && !x.inFlight);
  if (prior) { prior.payload = item.kind === 'marks' || item.kind === 'attendance' || item.kind === 'period' ? { ...item.payload, base: prior.payload.base } : item.payload; prior.capturedAt = item.capturedAt; prior.label = item.label || prior.label; save(); emit(); if (navigator.onLine) flush(); return { queued: true, item: prior }; }
  st.queue.push(item); save(); emit();
  if (!navigator.onLine) return { queued: true, item };
  item.inFlight = true;
  try {
    const r = await apiClient.post('/sync/push', { mutations: [{ mutationId: item.mutationId, kind: item.kind, entityKey: item.entityKey, baseRevision: item.baseRevision, capturedAt: item.capturedAt, payload: item.payload }], deviceId: deviceId() });
    const out = r.data.results[0]; item.inFlight = false; if (out.status === 'Retry') return { queued: true, item };
    st.queue = st.queue.filter((x) => x.mutationId !== item.mutationId); st.openConflicts = r.data.openConflicts ?? st.openConflicts; st.lastSyncAt = new Date().toISOString(); st.queue.forEach((n) => out.status === 'Applied' && rebase(item, out, n)); record(item, out); save(); emit();
    return { sent: true, result: out };
  } catch (e) {
    item.inFlight = false; if (!e.response) { st.online = false; emit(); return { queued: true, item }; }
    st.queue = st.queue.filter((x) => x.mutationId !== item.mutationId); save(); emit(); throw e;
  }
}
export const discard = (mutationId, from = 'failed') => { ensure(); if (from === 'failed') st.failed = st.failed.filter((x) => x.mutationId !== mutationId); else st.queue = st.queue.filter((x) => x.mutationId !== mutationId); save(); emit(); };
export const setOpenConflicts = (n) => { ensure(); if (st.openConflicts !== n) { st.openConflicts = n; emit(); } };

const start = () => {
  if (typeof window === 'undefined' || timer) return; timer = setInterval(() => { ensure(); if (st.queue.length && navigator.onLine) flush(); }, 30000);
  window.addEventListener('online', () => { ensure(); st.online = true; emit(); flush(); }); window.addEventListener('offline', () => { ensure(); st.online = false; emit(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
};
export function useSync() { start(); return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, view, view); }

// what the device last saw of the teacher's day, so the screen still opens with no network
export const cacheKey = (name) => `aulensia-cache:${name}:${who()}`;
export const readCache = (name) => { try { return JSON.parse(localStorage.getItem(cacheKey(name)) || 'null'); } catch { return null; } };
export const writeCache = (name, v) => { try { localStorage.setItem(cacheKey(name), JSON.stringify(v)); } catch { /* storage full */ } };
