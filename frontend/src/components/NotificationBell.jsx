import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../utils/apiClient';
import { disablePush, enablePush, pushStatus } from '../utils/push';
import { useLang } from '../i18n/LanguageContext';

const ICON = { notice: '📢', fee: '💰', homework: '📝', attendance: '🗓️', message: '✉️', complaint: '🛡️', offer: '🎁' };
const ago = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

// Bell with unread count. Checks for news every 40 seconds while the app is open
// (live sockets are not available on the free host) and supports phone/browser push.
const NotificationBell = () => {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState('off');
  const last = useRef(null);
  const box = useRef(null);

  const poll = useCallback(async () => {
    if (document.hidden || !localStorage.getItem('accessToken')) return;
    try {
      const r = await apiClient.get('/notifications', { params: { limit: 25 } });
      setItems(r.data.items); setUnread(r.data.unread);
      const newest = r.data.items[0];
      if (last.current !== null && newest && String(newest._id) !== last.current && !newest.readAt) toast(`${ICON[newest.type] || '🔔'} ${newest.title}`, { duration: 5000 });
      last.current = newest ? String(newest._id) : '';
    } catch (e) { /* ignore: next poll will retry */ }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 40000);
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', vis);
    pushStatus().then(setPush);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [poll]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = async (n) => {
    if (!n.readAt) apiClient.put(`/notifications/${n._id}/read`).catch(() => {});
    setOpen(false);
    if (!n.link) return;
    const same = new URL(n.link, window.location.origin).pathname === window.location.pathname;
    window.location.href = n.link;
    if (same) window.location.reload();
  };
  const readAll = async () => { await apiClient.put('/notifications/read-all').catch(() => {}); setItems((l) => l.map((x) => ({ ...x, readAt: x.readAt || new Date() }))); setUnread(0); };
  const togglePush = async () => {
    try {
      if (push === 'on') { await disablePush(); setPush('off'); toast.success(t('Phone / browser alerts are off')); }
      else { await enablePush(); setPush('on'); toast.success(t('Alerts are on. You will be notified even when the app is closed.')); }
    } catch (e) { toast.error(e.message || t('Could not turn on alerts')); setPush(await pushStatus()); }
  };

  return (
    <div className="relative" ref={box}>
      <button onClick={() => { setOpen(!open); if (!open) poll(); }} className="relative rounded-full border border-[#cfe0d6] bg-[#fbfdfb] p-2.5 text-[#0f6b4f] hover:bg-[#e3efe8]" aria-label={t('Notifications')}>
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-[22rem] max-w-[92vw] overflow-hidden rounded-2xl border border-[#cfe0d6] bg-[#fbfdfb] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#e1eee6] px-4 py-3">
            <p className="text-sm font-black text-[#0c2f25]">{t('Notifications')}</p>
            {unread > 0 && <button onClick={readAll} className="inline-flex items-center gap-1 text-xs font-bold text-[#0f6b4f] hover:underline"><CheckCheck className="h-4 w-4" />{t('Mark all read')}</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-[#4f7262]">{t('Nothing new yet.')}</p>}
            {items.map((n) => (
              <button key={n._id} onClick={() => go(n)} className={`flex w-full items-start gap-3 border-b border-[#e8f2ec] px-4 py-3 text-start hover:bg-[#edf5f0] ${n.readAt ? '' : 'bg-[#fff6df]'}`}>
                <span className="mt-0.5 text-lg">{ICON[n.type] || '🔔'}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm leading-snug text-[#0c2f25] ${n.readAt ? 'font-semibold' : 'font-black'}`}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-xs text-[#4d7262]">{n.body}</span>}
                </span>
                <span className="text-[10px] font-bold text-[#86a596]">{ago(n.createdAt)}</span>
              </button>
            ))}
          </div>
          {push !== 'unsupported' && (
            <div className="border-t border-[#e1eee6] bg-[#edf5f0] px-4 py-2.5">
              {push === 'blocked'
                ? <p className="text-xs text-[#4f7262]">{t('Alerts are blocked in your browser settings.')}</p>
                : <button onClick={togglePush} className="text-xs font-black text-[#0f6b4f] hover:underline">{push === 'on' ? t('Turn off phone / browser alerts') : t('Get alerts on this phone / browser, even when the app is closed')}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
