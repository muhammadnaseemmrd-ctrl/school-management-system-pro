import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../utils/apiClient';
import { useLang } from '../i18n/LanguageContext';

// Shown only to someone whose e-mail has more than one account (for example a teacher who is also a parent):
// switch between them without signing in again. `block` lays it out as a full-width list for the phone menu.
const SwitchAccount = ({ block = false }) => {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    let live = true;
    apiClient.get('/auth/accounts').then((r) => { if (live) setData(r.data); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open || block) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, block]);

  if (!data || data.accounts.length < 2) return null;

  const pick = async (a) => {
    if (busy || a.id === data.current.id) return;
    setBusy(true);
    try {
      const r = await apiClient.post('/auth/switch-account', { id: a.id, role: a.role });
      localStorage.setItem('accessToken', r.data.accessToken);
      localStorage.setItem('refreshToken', r.data.refreshToken);
      // The saved day, profile and last tab belong to the account we are leaving.
      Object.keys(localStorage).filter((k) => k.startsWith('aulensia-cache:') || k.endsWith('ActiveTab') || k === 'aulensia-profile').forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem('loggedOut');
      window.location.assign(`/${r.data.user.role}/dashboard`);
    } catch (e) {
      toast.error(e.response?.data?.message || t('Could not switch account'));
      setBusy(false);
    }
  };

  const list = (
    <ul className="space-y-1" role="menu" aria-label={t('Switch account')}>
      {data.accounts.map((a) => {
        const current = a.id === data.current.id;
        return (
          <li key={`${a.role}-${a.id}`} role="none">
            <button type="button" role="menuitem" disabled={busy || current} onClick={() => pick(a)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-[#f7f6f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2a5cac] disabled:cursor-default">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold capitalize text-[#1b2837]">{t(a.role.charAt(0).toUpperCase() + a.role.slice(1))}: {a.name}</span>
                <span className="block truncate text-xs text-[#5b6b7b]">{a.schoolName}</span>
              </span>
              {current && <Check className="h-4 w-4 shrink-0 text-[#2a5cac]" aria-label={t('Current account')} />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (block) {
    return (
      <div className="mb-3 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-2">
        <p className="px-3 pb-1 pt-2 text-xs font-black uppercase tracking-wider text-[#5b6b7b]">{t('Switch account')}</p>
        {list}
      </div>
    );
  }

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-[#e3e7e7] bg-[#ffffff] px-3 py-2 text-sm font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2a5cac]">
        <ArrowLeftRight size={16} />{t('Switch account')}
      </button>
      {open && <div className="absolute end-0 z-50 mt-2 w-72 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-2 shadow-2xl">{list}</div>}
    </div>
  );
};

export default SwitchAccount;
