import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser, setSchool } from '../store/authSlice';
import apiClient from '../utils/apiClient';

const WORDS = { denied: 'The provider did not sign you in.', unverified: 'Your provider has not verified this email address.', domain: 'This email address is not from a domain the school allows.', no_account: 'There is no account for this email address at the school. Ask an administrator to add you.', inactive: 'This account has been deactivated.', failed: 'Signing in did not work. Please try again.' };

// Where the school's own account provider sends people back. The one-time code in the address is traded for a normal sign-in.
export default function SsoComplete() {
  const [q] = useSearchParams(); const navigate = useNavigate(); const dispatch = useDispatch(); const [error, setError] = useState(''); const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    const code = q.get('code'); const err = q.get('error');
    window.history.replaceState({}, '', '/sso-complete');                                   // the code is single-use, but it should not stay in the address bar
    if (err || !code) { setError(WORDS[err] || q.get('message') || WORDS.failed); return; }
    apiClient.post('/sso/exchange', { code }).then((r) => {
      const { user, school, accessToken, refreshToken } = r.data;
      localStorage.setItem('accessToken', accessToken); localStorage.setItem('refreshToken', refreshToken); sessionStorage.removeItem('loggedOut');
      dispatch(setUser(user)); dispatch(setSchool(school)); navigate(`/${user.role}/dashboard`, { replace: true });
    }).catch((e) => setError(e.response?.data?.message || WORDS.failed));
  }, [q, dispatch, navigate]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#e3e7e7] bg-white p-8 text-center shadow-sm">
        {error ? (<><h1 className="text-xl font-bold text-[#1b2837]">Could not sign you in</h1><p role="alert" className="mt-3 text-sm text-[#3b4a5c]">{error}</p><Link to="/login" className="mt-5 inline-block rounded-xl bg-[#2a5cac] px-5 py-2.5 text-sm font-semibold text-white">Back to sign in</Link></>)
          : (<><h1 className="text-xl font-bold text-[#1b2837]">Signing you in…</h1><p role="status" className="mt-3 text-sm text-[#5b6b7b]">Please wait a moment.</p></>)}
      </div>
    </main>
  );
}
