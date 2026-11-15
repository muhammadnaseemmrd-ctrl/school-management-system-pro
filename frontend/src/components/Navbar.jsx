import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { BookOpen, LogOut, Menu, Shield, X } from 'lucide-react';
import { clearAuth } from '../store/authSlice';
import { useLang } from '../i18n/LanguageContext';
import LanguageToggle from './LanguageToggle';
import NotificationBell from './NotificationBell';
import useBranding, { clearBranding } from '../utils/useBranding';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, school } = useSelector((state) => state.auth);
  const { t } = useLang();
  const isSchoolUser = !!user && user.role !== 'superadmin';
  const branding = useBranding(isSchoolUser);

  const handleLogout = () => {
    clearBranding();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('adminActiveTab');
    localStorage.removeItem('teacherActiveTab');
    localStorage.removeItem('studentActiveTab');
    localStorage.removeItem('parentActiveTab');
    localStorage.removeItem('superadminActiveTab');
    const loginPath = user?.role === 'superadmin' ? '/superadmin/login' : '/login';
    dispatch(clearAuth());
    // Replace the entire history stack so back button can't return to dashboard
    window.history.replaceState(null, '', loginPath);
    navigate(loginPath, { replace: true });
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-[#d9c5b0] bg-[#f7efe4]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            {isSchoolUser && branding?.logo ? (
              <img src={branding.logo} alt="" className="h-10 w-10 rounded-2xl border border-[#d9c5b0] bg-white object-contain shadow-sm" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7a4e2d] text-[#f7efe4] shadow-sm">
                <BookOpen size={20} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="max-w-[11rem] truncate text-lg font-extrabold tracking-tight text-[#3f2a1d] sm:max-w-xs">{(isSchoolUser && branding?.name) || 'SchoolHub'}</h1>
              <p className="text-xs text-[#7f634e]">{user?.role === 'superadmin' ? t('Platform console') : t('School management system')}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user && (
              <div className="flex items-center gap-2 rounded-full border border-[#d9c5b0] bg-[#fffaf3] px-3 py-2 text-sm text-[#6d4c35]">
                <Shield size={16} className="text-[#7a4e2d]" />
                <span className="capitalize">{t(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</span>
                {school?.name && <span className="text-[#8a6a50]">· {school.name}</span>}
              </div>
            )}
            {isSchoolUser && <NotificationBell />}
            <LanguageToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-full border border-[#b68c67] bg-[#fffaf3] px-4 py-2 text-sm font-semibold text-[#7a4e2d] transition hover:bg-[#f0e0cd]"
            >
              {t('Logout')}
              <LogOut size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {isSchoolUser && <NotificationBell />}
            <LanguageToggle />
            <button onClick={() => setIsOpen(!isOpen)} className="rounded-full border border-[#b68c67] bg-[#fffaf3] p-2 text-[#7a4e2d]">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-[#d9c5b0] pb-4 pt-3 md:hidden">
            {user && (
              <div className="mb-3 rounded-2xl border border-[#d9c5b0] bg-[#fffaf3] px-4 py-3 text-sm text-[#6d4c35]">
                {t('Signed in as')} <span className="font-semibold capitalize">{t(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-2xl border border-[#b68c67] bg-[#fffaf3] px-4 py-3 text-start text-sm font-semibold text-[#7a4e2d] transition hover:bg-[#f0e0cd]"
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
