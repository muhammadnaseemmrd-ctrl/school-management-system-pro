import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Toaster, toast } from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { setUser, setSchool } from '../../store/authSlice';
import LanguageToggle from '../../components/LanguageToggle';
import AppearanceToggle from '../../components/AppearanceToggle';
import { LogoMark } from '../../components/Logo';
import { useLang } from '../../i18n/LanguageContext';
import { inputCls, btnPrimary, errMsg } from '../../components/ui';

const AgentLogin = () => {
  const { t } = useLang();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await apiClient.post('/agent/login', form);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      sessionStorage.removeItem('loggedOut');
      dispatch(setUser(data.user));
      dispatch(setSchool(null));
      navigate('/agent/dashboard', { replace: true });
    } catch (err) {
      toast.error(errMsg(err, 'Sign-in failed'));
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f6f2] px-4">
      <Toaster position="top-right" />
      <div className="fixed end-4 top-4 z-50 flex items-center gap-2"><AppearanceToggle /><LanguageToggle /></div>
      <div className="page-ready w-full max-w-md rounded-2xl border border-[#e3e7e7] bg-white p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <div>
            <h1 className="font-display text-xl font-bold text-[#1b2837]">{t('Partner portal')}</h1>
            <p className="text-xs text-[#5b6b7b]">{t('Aulensia · Agent sign-in')}</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">{t('Email')}</span>
            <input type="email" required autoFocus autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">{t('Password')}</span>
            <div className="relative">
              <input type={show ? 'text' : 'password'} required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${inputCls} pe-11`} />
              <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 text-[#5b6b7b]">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <button disabled={loading} className={`${btnPrimary} w-full`}>{loading ? t('Signing in…') : t('Sign in')}</button>
        </form>
        <p className="mt-6 text-center text-xs text-[#5b6b7b]">
          {t('Partner accounts are created by the Aulensia team.')} <Link to="/" className="font-semibold text-[#2a5cac] underline">{t('Back to home')}</Link>
        </p>
      </div>
    </div>
  );
};

export default AgentLogin;
