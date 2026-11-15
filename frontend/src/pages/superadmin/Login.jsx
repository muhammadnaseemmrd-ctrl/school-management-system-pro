import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Toaster, toast } from 'react-hot-toast';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { setUser, setSchool } from '../../store/authSlice';
import LanguageToggle from '../../components/LanguageToggle';

const SuperAdminLogin = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await apiClient.post('/superadmin/login', form);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      sessionStorage.removeItem('loggedOut');
      dispatch(setUser(data.user));
      dispatch(setSchool(null));
      toast.success('Welcome back');
      navigate('/superadmin/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#2b1c12] px-4">
      <Toaster position="top-right" />
      <div className="fixed end-4 top-4 z-50"><LanguageToggle /></div>
      <div className="w-full max-w-md rounded-[2rem] border border-[#5a3d27] bg-[#3a2616] p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c28a42] text-[#2b1c12]"><ShieldCheck size={24} /></div>
          <div>
            <h1 className="text-xl font-black text-[#f7efe4]">Platform Console</h1>
            <p className="text-xs text-[#d8b08c]">SchoolHub · Super Admin sign-in</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#d8b08c]">Email</label>
            <input type="email" required autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl border border-[#5a3d27] bg-[#2b1c12] px-4 py-3 text-sm text-[#f7efe4] outline-none focus:border-[#c28a42]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#d8b08c]">Password</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-xl border border-[#5a3d27] bg-[#2b1c12] px-4 py-3 pr-11 text-sm text-[#f7efe4] outline-none focus:border-[#c28a42]" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#d8b08c]">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <button disabled={loading} className="w-full rounded-xl bg-[#c28a42] py-3 text-sm font-black text-[#2b1c12] transition hover:bg-[#d49b52] disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-[#a98466]">Restricted area for the platform owner. <Link to="/login" className="font-bold text-[#d8b08c] underline">School login</Link></p>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
