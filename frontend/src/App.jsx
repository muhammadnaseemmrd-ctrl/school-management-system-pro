import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { clearAuth, setUser, setSchool } from './store/authSlice';
import apiClient from './utils/apiClient';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import SchoolRegistration from './pages/SchoolRegistration';
const VerifyDocument = lazy(() => import('./pages/VerifyDocument'));
const VerifyTranscript = lazy(() => import('./pages/VerifyTranscript'));
const VerifyCredential = lazy(() => import('./pages/VerifyCredential'));
const SponsorReport = lazy(() => import('./pages/SponsorReport'));
const Courses = lazy(() => import('./pages/Courses'));
const Learn = lazy(() => import('./pages/Learn'));
const Driver = lazy(() => import('./pages/Driver'));
const ProposalPage = lazy(() => import('./pages/ProposalPage'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));
const ParentDashboard = lazy(() => import('./pages/parent/Dashboard'));
import SuperAdminLogin from './pages/superadmin/Login';
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/Dashboard'));
import AgentLogin from './pages/agent/Login';
const AgentDashboard = lazy(() => import('./pages/agent/Dashboard'));

// Components
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      // If user explicitly logged out this browser session, reject stale tokens
      if (!token || sessionStorage.getItem('loggedOut')) {
        dispatch(clearAuth());
        setLoading(false);
        return;
      }

      try {
        const response = await apiClient.get('/auth/profile');
        // Successful login — clear any stale loggedOut flag
        sessionStorage.removeItem('loggedOut');
        try { localStorage.setItem('aulensia-profile', JSON.stringify(response.data.user)); } catch { /* storage full */ }
        dispatch(setUser(response.data.user));
        dispatch(setSchool(response.data.user.schoolId));
      } catch (error) {
        // No network is not the same as signed out: a teacher reopening the app offline keeps their place (PRD E11)
        let kept = null; try { kept = !error.response ? JSON.parse(localStorage.getItem('aulensia-profile') || 'null') : null; } catch { kept = null; }
        if (kept && kept.role) { dispatch(setUser(kept)); dispatch(setSchool(kept.schoolId)); }
        else { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); dispatch(clearAuth()); }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [dispatch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-[#2a5cac]"></div>
          <p className="mt-4 text-[#2a5cac]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-canvas">
        <a href="#main-content" onClick={(e) => { const m = document.getElementById('main-content'); if (m) { e.preventDefault(); m.focus(); m.scrollIntoView(); } }} className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-[#2a5cac] focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:text-white">Skip to content</a>
        {isAuthenticated && <Navbar />}
        <div id="main-content" tabIndex={-1} className="outline-none">
        <Suspense fallback={<div className="mx-auto max-w-7xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading"><div className="skeleton h-10 w-64" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}</div></div>}>
        <Routes>
          <Route
            path="/"
            element={isAuthenticated && user?.role ? <Navigate to={`/${user.role}/dashboard`} replace /> : <Landing />}
          />
          <Route
            path="/login"
            element={isAuthenticated && user?.role ? <Navigate to={`/${user.role}/dashboard`} replace /> : <Login />}
          />
          <Route path="/proposal/:token" element={<ProposalPage />} />
          <Route path="/verify" element={<VerifyDocument />} />
          <Route path="/verify/:token" element={<VerifyDocument />} />
          <Route path="/verify-transcript" element={<VerifyTranscript />} />
          <Route path="/verify-transcript/:key" element={<VerifyTranscript />} />
          <Route path="/verify-credential" element={<VerifyCredential />} />
          <Route path="/verify-credential/:key" element={<VerifyCredential />} />
          <Route path="/sponsor/:key" element={<SponsorReport />} />
          <Route path="/courses/:code" element={<Courses />} />
          <Route path="/courses/:code/:slug" element={<Courses />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/driver" element={<Driver />} />
          <Route
            path="/superadmin/login"
            element={isAuthenticated && user?.role ? <Navigate to={`/${user.role}/dashboard`} replace /> : <SuperAdminLogin />}
          />
          <Route
            path="/agent/login"
            element={isAuthenticated && user?.role ? <Navigate to={`/${user.role}/dashboard`} replace /> : <AgentLogin />}
          />
          <Route
            path="/register"
            element={isAuthenticated && user?.role ? <Navigate to={`/${user.role}/dashboard`} replace /> : <SchoolRegistration />}
          />

          {isAuthenticated ? (
            <>
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher/*"
                element={
                  <ProtectedRoute requiredRole="teacher">
                    <TeacherDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/*"
                element={
                  <ProtectedRoute requiredRole="student">
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/parent/*"
                element={
                  <ProtectedRoute requiredRole="parent">
                    <ParentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/superadmin/*"
                element={
                  <ProtectedRoute requiredRole="superadmin">
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agent/*"
                element={
                  <ProtectedRoute requiredRole="agent">
                    <AgentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to={user?.role ? `/${user.role}/dashboard` : '/'} />} />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/" />} />
          )}
        </Routes>
        </Suspense>
        </div>
      </div>
    </Router>
  );
}

export default App;
