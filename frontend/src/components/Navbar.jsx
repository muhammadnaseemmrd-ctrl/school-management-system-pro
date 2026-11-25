import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { BookOpen, LogOut, Menu, Shield, X } from 'lucide-react';
import { clearAuth } from '../store/authSlice';
import { useLang } from '../i18n/LanguageContext';
import LanguageToggle from './LanguageToggle';
import AppearanceToggle from './AppearanceToggle';
import NotificationBell from './NotificationBell';
import SwitchAccount from './SwitchAccount';
import useBranding, { clearBranding } from '../utils/useBranding';
import { pickSchoolName } from '../utils/schoolName';
import { LogoMark } from './Logo';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, school } = useSelector((state) => state.auth);
  const { t, lang } = useLang();
  const isSchoolUser = !!user && user.role !== 'superadmin' && user.role !== 'agent' && user.role !== 'director';
  const branding = useBranding(isSchoolUser);

  const handleLogout = () => {
    clearBranding();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('aulensia-profile');
    Object.keys(localStorage).filter((k) => k.startsWith('aulensia-cache:')).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('adminActiveTab');
    localStorage.removeItem('teacherActiveTab');
    localStorage.removeItem('studentActiveTab');
    localStorage.removeItem('parentActiveTab');
    localStorage.removeItem('superadminActiveTab');
    localStorage.removeItem('agentActiveTab');
    const loginPath = user?.role === 'superadmin' ? '/superadmin/login' : user?.role === 'agent' ? '/agent/login' : '/login';
    dispatch(clearAuth());
    // Replace the entire history stack so back button can't return to dashboard
    window.history.replaceState(null, '', loginPath);
    navigate(loginPath, { replace: true });
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-[#e3e7e7] bg-[#f7f6f2]/90">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {isSchoolUser && branding?.logo ? (
              <img src={branding.logo} alt="" className="h-10 w-10 rounded-2xl border border-[#e3e7e7] bg-white object-contain shadow-sm" />
            ) : (
              <LogoMark className="h-10 w-10 drop-shadow-sm" />
            )}
            <div className="min-w-0">
              <h1 className="max-w-[8rem] truncate text-lg font-extrabold tracking-tight text-[#1b2837] sm:max-w-xs">{(isSchoolUser && pickSchoolName(branding, lang)) || 'Aulensia'}</h1>
              <p className="text-xs text-[#5b6b7b]">{user?.role === 'superadmin' ? t('Platform console') : user?.role === 'agent' ? t('Partner portal') : user?.role === 'director' ? t('Group office') : t('School management system')}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user && (
              <div className="flex items-center gap-2 rounded-full border border-[#e3e7e7] bg-[#ffffff] px-3 py-2 text-sm text-[#3b4a5c]">
                <Shield size={16} className="text-[#2a5cac]" />
                <span className="capitalize">{t(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</span>
                {school?.name && <span className="text-[#5b6b7b]">· {pickSchoolName(school, lang)}</span>}
              </div>
            )}
            {isSchoolUser && <SwitchAccount />}
            {(isSchoolUser || user?.role === 'agent' || user?.role === 'director') && <NotificationBell />}
            <AppearanceToggle />
            <LanguageToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-full border border-[#2a5cac] bg-[#ffffff] px-4 py-2 text-sm font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8]"
            >
              {t('Logout')}
              <LogOut size={16} />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 md:hidden">
            {(isSchoolUser || user?.role === 'agent') && <NotificationBell />}
            <AppearanceToggle />
            <LanguageToggle />
            <button onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close menu' : 'Open menu'} aria-expanded={isOpen} className="rounded-full border border-[#2a5cac] bg-[#ffffff] p-2 text-[#2a5cac]">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-[#e3e7e7] pb-4 pt-3 md:hidden">
            {user && (
              <div className="mb-3 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] px-4 py-3 text-sm text-[#3b4a5c]">
                {t('Signed in as')} <span className="font-semibold capitalize">{t(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</span>
              </div>
            )}
            {isSchoolUser && <SwitchAccount block />}
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-2xl border border-[#2a5cac] bg-[#ffffff] px-4 py-3 text-start text-sm font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8]"
            >
              {t('Logout')}
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
