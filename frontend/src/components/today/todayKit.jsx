import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { flush, useSync } from '../../utils/syncQueue';
import { btnGhost } from '../ui';

export const hm = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

// Always honest about what is saved where: a queued change is "waiting", never "saved"
export const SyncBanner = ({ onFailed }) => {
  const s = useSync();
  return (
    <div className="space-y-2" aria-live="polite">
      {!s.online && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" /><span>You are offline. You can keep taking registers, writing notes and entering marks. They stay on this device and are sent when the connection returns.</span></div>}
      {s.queued.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cfe0f5] bg-[#f3f8fe] px-3 py-2 text-sm text-[#1b2837]"><span className="flex items-center gap-2"><RefreshCw className={`h-4 w-4 ${s.syncing ? 'animate-spin' : ''}`} />{s.syncing ? 'Sending…' : `${s.queued.length} change${s.queued.length === 1 ? ' is' : 's are'} waiting on this device. Not saved on the server yet.`}</span>{s.online && !s.syncing && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => flush()}>Send now</button>}</div>}
      {s.failed.length > 0 && <button onClick={onFailed} className="flex w-full items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-start text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{s.failed.length} change{s.failed.length === 1 ? ' was' : 's were'} refused by the server and need your attention. Tap to review.</span></button>}
    </div>
  );
};
export const SyncChip = () => {
  const s = useSync();
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.online ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{s.online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{s.online ? 'Online' : 'Offline'}{s.queued.length > 0 && ` · ${s.queued.length} waiting`}{s.lastSyncAt && s.online && s.queued.length === 0 && ` · synced ${hm(s.lastSyncAt)}`}</span>;
};
