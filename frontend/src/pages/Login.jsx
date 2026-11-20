import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowRight, BookOpen, Building2, Eye, EyeOff, GraduationCap, Loader, Mail, Lock, ShieldCheck, Users } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { setUser, setSchool } from '../store/authSlice';
import apiClient from '../utils/apiClient';
import LanguageToggle from '../components/LanguageToggle';
import AppearanceToggle from '../components/AppearanceToggle';
import { useTheme } from '../theme/ThemeProvider';
import Logo from '../components/Logo';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Redirect if already authenticated
  useEffect(() => {
    const blocked = sessionStorage.getItem('blockedMessage');
    if (blocked) {
      sessionStorage.removeItem('blockedMessage');
      toast.error(blocked, { duration: 7000 });
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role) {
      navigate(`/${user.role}/dashboard`, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // On a school's own web address the school code is already known
  const { hostBrand } = useTheme();
  useEffect(() => { if (hostBrand?.school?.code) setFormData((f) => (f.schoolCode ? f : { ...f, schoolCode: hostBrand.school.code })); }, [hostBrand]);

  // Views: 'login', 'forgot', 'verify', 'reset'
  const [view, setView] = useState('login');
  
  // Login Form Data (kept blank by default)
  const [formData, setFormData] = useState({
    schoolCode: location.state?.schoolCode || '',
    email: location.state?.email || '',
    password: '',
  });

  // Forgot Password Flow States
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Timer states for verification code expiration (1 minute = 60s)
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Timer countdown hook
  useEffect(() => {
    let interval = null;
    if (view === 'verify' && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [view, timer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'schoolCode' ? value.toUpperCase() : value,
    }));
  };

  const validateLoginForm = () => {
    if (!formData.schoolCode.trim()) {
      toast.error('School code is required');
      return false;
    }

    if (!formData.email.includes('@')) {
      toast.error('Please enter a valid email');
      return false;
    }

    if (!formData.password) {
      toast.error('Password is required');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateLoginForm()) return;

    setLoading(true);

    try {
      const response = await apiClient.post('/auth/login', {
        email: formData.email,
        password: formData.password,
        schoolCode: formData.schoolCode,
      });

      const { user, school, accessToken, refreshToken } = response.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Clear the loggedOut guard so this fresh login is trusted
      sessionStorage.removeItem('loggedOut');

      dispatch(setUser(user));
      dispatch(setSchool(school));

      toast.success('Login successful!');

      setTimeout(() => {
        switch (user.role) {
          case 'admin':
            navigate('/admin/dashboard', { replace: true });
            break;
          case 'teacher':
            navigate('/teacher/dashboard', { replace: true });
            break;
          case 'student':
            navigate('/student/dashboard', { replace: true });
            break;
          case 'parent':
            navigate('/parent/dashboard', { replace: true });
            break;
          case 'superadmin':
            navigate('/superadmin/dashboard', { replace: true });
            break;
          default:
            navigate('/', { replace: true });
        }
      }, 1000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot password step 1: Request OTP code
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!forgotEmail.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: forgotEmail });
      toast.success('Verification code sent to your email.');
      setTimer(60);
      setCanResend(false);
      setView('verify');
    } catch (error) {
      toast.error(error.response?.data?.message || "User doesn't exist");
    } finally {
      setLoading(false);
    }
  };

  // Resend code handler
  const handleResendCode = async () => {
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: forgotEmail });
      toast.success('A new verification code has been sent to your email.');
      setResetCode('');
      setTimer(60);
      setCanResend(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  // Forgot password step 2: Verify OTP code
  const handleVerifyCodeSubmit = async (e) => {
    e.preventDefault();
    if (!resetCode.trim()) {
      toast.error('Verification code is required');
      return;
    }
    if (resetCode.length !== 5) {
      toast.error('Code must be exactly 5 characters');
      return;
    }

    if (timer === 0) {
      toast.error('Verification code has expired. Please resend code.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/verify-reset-code', { email: forgotEmail, code: resetCode });
      toast.success('Code verified successfully.');
      setView('reset');
    } catch (error) {
      toast.error('wrong code');
    } finally {
      setLoading(false);
    }
  };

  // Forgot password step 3: Reset password
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();

    const pwd = newPassword || '';
    const hasMinLength = pwd.length >= 6;
    const hasCapital = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd);

    if (!hasMinLength || !hasCapital || !hasNumber || !hasSpecial) {
      toast.error('Password does not meet validation requirements');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match. Please try again.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', {
        email: forgotEmail,
        code: resetCode,
        newPassword,
      });
      toast.success('Password reset successfully!');
      // Reset forms
      setNewPassword('');
      setConfirmPassword('');
      setForgotEmail('');
      setResetCode('');
      setView('login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2] px-4 py-10 text-[#1b2837] sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      <div className="fixed end-4 top-4 z-50 flex items-center gap-2"><AppearanceToggle /><LanguageToggle /></div>

      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        {/* Left Info Panel */}
        <div className="relative overflow-hidden rounded-2xl border border-[#e3e7e7] bg-paper p-8 lg:p-10">
          <div className="relative">
            <div className="mb-6">
              {hostBrand?.school ? (
                <div className="flex items-center gap-3" data-no-i18n>{hostBrand.school.logo && <img src={hostBrand.school.logo} alt="" className="h-14 w-14 rounded-2xl border border-[#e3e7e7] bg-white object-contain" />}<div><p className="text-xl font-extrabold text-[#1b2837]">{hostBrand.school.name}</p>{hostBrand.school.motto && <p className="text-sm text-[#5b6b7b]">{hostBrand.school.motto}</p>}</div></div>
              ) : <Logo size="lg" subtitle="Login portal" />}
            </div>

            <h1 className="max-w-xl text-5xl font-black leading-tight tracking-tight text-[#1b2837] lg:text-6xl">
              Login is the gate for the school system.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#3b4a5c]">
              Enter your school credentials to open the dashboard. The system will identify your role automatically.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ['JWT auth', 'Token based login flow', ShieldCheck],
                ['Role access', 'Automatic from credentials', Users],
                ['School code', 'Keeps each school separate', Building2],
                ['Reports', 'PDF and Excel exports later', GraduationCap],
              ].map(([title, description, Icon]) => (
                <div key={title} className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-4">
                  <Icon className="h-5 w-5 text-[#2a5cac]" />
                  <p className="mt-3 font-semibold text-[#1b2837]">{title}</p>
                  <p className="mt-1 text-sm text-[#3b4a5c]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 text-[#1b2837] sm:p-8">
          
          {/* VIEW: LOGIN */}
          {view === 'login' && (
            <>
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#5b6b7b]">Welcome back</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-[#1b2837]">Login to your dashboard</h2>
                <p className="mt-2 text-[#3b4a5c]">Use the school code you got during registration.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#3b4a5c]">School Code *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type="text"
                      name="schoolCode"
                      value={formData.schoolCode}
                      onChange={handleChange}
                      placeholder="e.g. SCHOOL001"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-4 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#3b4a5c]">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="admin@school.com"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-4 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-semibold text-[#3b4a5c]">Password *</label>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs font-semibold text-[#2a5cac] hover:text-[#234c91] transition"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-12 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-[#2a5cac] transition hover:text-[#2a5cac]">
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2a5cac] px-5 py-3.5 font-semibold text-white transition hover:bg-[#234c91] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    <>
                      Login to Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* VIEW: FORGOT PASSWORD */}
          {view === 'forgot' && (
            <>
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#5b6b7b]">Security Access</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-[#1b2837]">Forgot Password</h2>
                <p className="mt-2 text-[#3b4a5c]">Enter your registered email address to receive a verification code.</p>
              </div>

              <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#3b4a5c]">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="e.g. user@school.com"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-4 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2a5cac] px-5 py-3.5 font-semibold text-white transition hover:bg-[#234c91] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      Send Code
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setView('login')}
                className="mt-4 w-full text-center text-sm font-semibold text-[#2a5cac] hover:text-[#234c91] transition"
              >
                Back to Login
              </button>
            </>
          )}

          {/* VIEW: VERIFY OTP CODE */}
          {view === 'verify' && (
            <>
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#5b6b7b]">Code Sent</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-[#1b2837]">Enter Reset Code</h2>
                <p className="mt-2 text-[#3b4a5c]">
                  We sent a 5-character verification code to <strong>{forgotEmail}</strong>. Code is valid for exactly 1 minute.
                </p>
              </div>

              <form onSubmit={handleVerifyCodeSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#3b4a5c]">5-Character Code *</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type="text"
                      maxLength={5}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="e.g. A1#B2"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-4 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white tracking-widest text-center font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col items-center justify-between border border-[#e3e7e7] bg-[#f7f6f2] rounded-2xl p-4 my-2">
                  <span className="text-sm font-semibold text-[#3b4a5c]">
                    {timer > 0 ? (
                      <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                        Time remaining: 00:{timer < 10 ? '0' + timer : timer}
                      </span>
                    ) : (
                      <span className="text-red-700 font-bold">Code has expired!</span>
                    )}
                  </span>
                  
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={!canResend || loading}
                    className={`mt-2 text-xs font-bold underline transition ${
                      canResend
                        ? 'text-[#2a5cac] hover:text-[#234c91] cursor-pointer'
                        : 'text-[#2a5cac] cursor-not-allowed opacity-50'
                    }`}
                  >
                    Resend Code
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2a5cac] px-5 py-3.5 font-semibold text-white transition hover:bg-[#234c91] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify Code
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setView('login')}
                className="mt-4 w-full text-center text-sm font-semibold text-[#2a5cac] hover:text-[#234c91] transition"
              >
                Back to Login
              </button>
            </>
          )}

          {/* VIEW: RESET PASSWORD */}
          {view === 'reset' && (
            <>
              <div className="mb-6">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#5b6b7b]">Reset Security</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-[#1b2837]">Create New Password</h2>
                <p className="mt-2 text-[#3b4a5c]">Choose a secure password meeting all guidelines below.</p>
              </div>

              <form onSubmit={handleResetPasswordSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#3b4a5c]">New Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-12 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white"
                      required
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-3.5 text-[#2a5cac] transition hover:text-[#2a5cac]">
                      {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  {/* Password requirement visual check indicators */}
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="font-semibold text-[#3b4a5c]">Password requirements:</p>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${(newPassword || '').length >= 6 ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={(newPassword || '').length >= 6 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>Min 6 characters</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${/[A-Z]/.test(newPassword || '') ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={/[A-Z]/.test(newPassword || '') ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>1 capital letter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${/[0-9]/.test(newPassword || '') ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={/[0-9]/.test(newPassword || '') ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>1 number</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword || '') ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword || '') ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>1 special character</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#3b4a5c]">Confirm Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-[#2a5cac]" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="w-full rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] py-3 pl-10 pr-12 outline-none transition placeholder:text-[#8a97a5] focus:border-[#2a5cac] focus:bg-white"
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-3.5 text-[#2a5cac] transition hover:text-[#2a5cac]">
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2a5cac] px-5 py-3.5 font-semibold text-white transition hover:bg-[#234c91] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Resetting Password...
                    </>
                  ) : (
                    <>
                      Reset Password
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setView('login')}
                className="mt-4 w-full text-center text-sm font-semibold text-[#2a5cac] hover:text-[#234c91] transition"
              >
                Back to Login
              </button>
            </>
          )}

          {/* Bottom links (Register & Home) */}
          {view === 'login' && (
            <div className="mt-6 space-y-3 border-t border-[#e3e7e7] pt-5 text-sm text-[#3b4a5c]">
              <p className="text-center">
                Don&apos;t have a school account?{' '}
                <Link to="/register" className="font-semibold text-[#2a5cac] hover:text-[#234c91]">
                  Register here
                </Link>
              </p>
              <p className="text-center">
                <Link to="/" className="font-semibold text-[#2a5cac] hover:text-[#234c91]">
                  Back to home
                </Link>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}