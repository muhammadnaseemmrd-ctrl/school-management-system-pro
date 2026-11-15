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
import { LogoMark } from './Logo';

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
    <nav className="sticky top-0 z-40 border-b border-[#cfe0d6] bg-[#edf5f0]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            {isSchoolUser && branding?.logo ? (
              <img src={branding.logo} alt="" className="h-10 w-10 rounded-2xl border border-[#cfe0d6] bg-white object-contain shadow-sm" />
            ) : (
              <LogoMark className="h-10 w-10 drop-shadow-sm" />
            )}
            <div className="min-w-0">
              <h1 className="max-w-[11rem] truncate text-lg font-extrabold tracking-tight text-[#0c2f25] sm:max-w-xs">{(isSchoolUser && branding?.name) || 'Darsgah'}</h1>
              <p className="text-xs text-[#4d7262]">{user?.role === 'superadmin' ? t('Platform console') : t('School management system')}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user && (
              <div className="flex items-center gap-2 rounded-full border border-[#cfe0d6] bg-[#fbfdfb] px-3 py-2 text-sm text-[#355e4d]">
                <Shield size={16} className="text-[#0f6b4f]" />
                <span className="capitalize">{t(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</span>
                {school?.name && <span className="text-[#4f7262]">· {school.name}</span>}
              </div>
            )}
            {isSchoolUser && <NotificationBell />}
            <LanguageToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-full border border-[#2f8f6f] bg-[#fbfdfb] px-4 py-2 text-sm font-semibold text-[#0f6b4f] transition hover:bg-[#e3efe8]"
            >
              {t('Logout')}
              <LogOut size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {isSchoolUser && <NotificationBell />}
            <LanguageToggle />
            <button onClick={() => setIsOpen(!isOpen)} className="rounded-full border border-[#2f8f6f] bg-[#fbfdfb] p-2 text-[#0f6b4f]">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-[#cfe0d6] pb-4 pt-3 md:hidden">
            {user && (
              <div className="mb-3 rounded-2xl border border-[#cfe0d6] bg-[#fbfdfb] px-4 py-3 text-sm text-[#355e4d]">
                {t('Signed in as')} <span className="font-semibold capitalize">{t(user.role.charAt(0).toUpperCase() + user.role.slice(1))}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-2xl border border-[#2f8f6f] bg-[#fbfdfb] px-4 py-3 text-start text-sm font-semibold text-[#0f6b4f] transition hover:bg-[#e3efe8]"
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
