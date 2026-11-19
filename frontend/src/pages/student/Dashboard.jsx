import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, BookOpen, CheckCircle, Clock, ClipboardList, LayoutGrid, 
  MessageSquare, Sparkles, Lock, User, FileText, Send, Image, History, 
  MapPin, Phone, ShieldAlert, BookOpenCheck, Bell, Menu, X, DollarSign, Calendar 
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import MyDocuments from '../../components/studio/MyDocuments';
import FamilyDesk from '../../components/attendance/FamilyDesk';
import apiClient from '../../utils/apiClient';
import usePlan from '../../utils/usePlan';
import ProfileEditor from '../../components/ProfileEditor';
import FeesPanel from '../../components/fees/FeesPanel';
import { openProxiedFile } from '../../utils/fileProxy';
import { useLang } from '../../i18n/LanguageContext';
import AttendanceReportView from '../../components/attendance/AttendanceReportView';
import { StatusChip } from '../../components/attendance/shared';

const StudentDashboard = () => {
  const { t } = useLang();
  const { has } = usePlan();
  const [profileData, setProfileData] = useState(null);
  const [myGrievances, setMyGrievances] = useState([]);
  const [studentHomework, setStudentHomework] = useState([]);
  const [attendanceData, setAttendanceData] = useState(null);
  const [notices, setNotices] = useState([]);
  const [studentMarks, setStudentMarks] = useState([]);
  const [homeworkIssues, setHomeworkIssues] = useState({});
  const [uploadingHomeworkId, setUploadingHomeworkId] = useState(null);
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#/', '');
    const validTabs = ['dashboard', 'homework', 'attendance', 'notices', 'timetable', 'marks', 'fees', 'profile', 'grievances', 'security', 'desk', 'documents'];
    if (hash && validTabs.includes(hash)) {
      return hash;
    }
    return null;
  };

  const [activeSubTab, setActiveSubTab] = useState(() => {
    const tabFromHash = getTabFromHash();
    if (tabFromHash) return tabFromHash;
    return localStorage.getItem('studentActiveTab') || 'dashboard';
  });

  useEffect(() => {
    // Ensure hash is set on initial mount
    const tabFromHash = getTabFromHash();
    const initialTab = tabFromHash || activeSubTab;
    const pageUrl = `${window.location.pathname}#/${initialTab}`;
    window.history.replaceState({ tab: initialTab, sentinel: 0 }, '', pageUrl);
    // Fill the history stack with 30 sentinel entries so the back button
    // can never escape to Google or any external page
    for (let i = 1; i <= 30; i++) {
      window.history.pushState({ tab: initialTab, sentinel: i }, '', pageUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('studentActiveTab', activeSubTab);
    // Keep hash in sync when tab changes programmatically
    window.history.pushState({ tab: activeSubTab }, '', `${window.location.pathname}#/${activeSubTab}`);
  }, [activeSubTab]);

  useEffect(() => {
    const handlePopState = (e) => {
      const pageUrl = `${window.location.pathname}#/${activeSubTab}`;
      // Replenish sentinel stack — push 5 entries back each time to keep the buffer deep
      for (let i = 0; i < 5; i++) {
        window.history.pushState({ tab: activeSubTab, sentinel: i }, '', pageUrl);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeSubTab]);
  const [loading, setLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [classTimetable, setClassTimetable] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [feeRecord, setFeeRecord] = useState(null);
  const [feeStructure, setFeeStructure] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPayingFee, setIsPayingFee] = useState(false);

  // Password change states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Grievance form states
  const [grievanceTitle, setGrievanceTitle] = useState('');
  const [grievanceDescription, setGrievanceDescription] = useState('');
  const [grievanceCategory, setGrievanceCategory] = useState('Facilities');
  const [grievancePriority, setGrievancePriority] = useState('Medium');
  const [grievancePhoto, setGrievancePhoto] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const stats = [
    { icon: CheckCircle, title: 'Attendance', value: attendanceData?.stats?.percentage ? `${attendanceData.stats.percentage}%` : '0%', tone: 'bg-emerald-500/10 text-emerald-700' },
    { icon: BookOpen, title: 'Average Marks', value: dashboardStats?.averageMarks !== undefined ? `${dashboardStats.averageMarks}%` : '0%', tone: 'bg-sky-500/10 text-sky-700' },
    { icon: Clock, title: 'Pending Homework', value: String(studentHomework.filter(hw => !hw.submissions?.some(s => s.studentId === profileData?._id || s.studentId?._id === profileData?._id)).length), tone: 'bg-amber-500/10 text-amber-700' },
    { icon: AlertCircle, title: 'Upcoming Exams', value: dashboardStats?.upcomingExams !== undefined ? String(dashboardStats.upcomingExams) : '0', tone: 'bg-rose-500/10 text-rose-700' },
  ];

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      const resProfile = await apiClient.get('/auth/profile');
      setProfileData(resProfile.data.user || null);

      const resStats = await apiClient.get('/dashboard/student').catch(() => ({ data: { stats: {} } }));
      setDashboardStats(resStats.data.stats || null);

      const resGrievances = await apiClient.get('/complaints/my');
      setMyGrievances(resGrievances.data.complaints || []);

      const resHomework = await apiClient.get('/homework/student').catch(() => ({ data: { homework: [] } }));
      setStudentHomework(resHomework.data.homework || []);

      const resAttendance = await apiClient.get('/daily-attendance/student/my/report').catch(() => ({ data: null }));
      setAttendanceData(resAttendance.data || null);

      const resNotices = await apiClient.get('/notices/user/notices?limit=100').catch(() => ({ data: { notices: [] } }));
      setNotices(resNotices.data.notices || []);

      const resMarks = await apiClient.get(`/marks/student/${resProfile.data.user._id}`).catch(() => ({ data: { marks: [] } }));
      setStudentMarks(resMarks.data.marks || []);

      const resSubjects = await apiClient.get('/subjects').catch(() => ({ data: { subjects: [] } }));
      setSubjects(resSubjects.data.subjects || []);


      if (resProfile.data.user?.classId?._id || resProfile.data.user?.classId) {
        const classId = resProfile.data.user.classId._id || resProfile.data.user.classId;
        const resTimetable = await apiClient.get(`/timetables/class/${classId}`).catch(() => ({ data: { timetables: [] } }));
        setClassTimetable(resTimetable.data.timetables || []);
      }
    } catch (err) {
      console.error('Error fetching student details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleHomeworkUpload = async (e, homeworkId) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', 'homework-submission');

    setUploadingHomeworkId(homeworkId);
    try {
      const resUpload = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileUrl = resUpload.data.url;

      await apiClient.post(`/homework/${homeworkId}/submit`, { fileUrl });
      toast.success('Homework submitted successfully!');
      fetchStudentData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Homework submission failed.');
    } finally {
      setUploadingHomeworkId(null);
    }
  };

  const handleHomeworkIssueSubmit = async (homeworkId) => {
    const issue = homeworkIssues[homeworkId];
    if (!issue || !issue.trim()) {
      toast.error('Please enter a proper issue/reason.');
      return;
    }

    try {
      await apiClient.post(`/homework/${homeworkId}/submit`, {
        reasonForMissing: issue
      });
      toast.success('Reason submitted successfully!');
      setHomeworkIssues(prev => ({ ...prev, [homeworkId]: '' }));
      fetchStudentData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit reason.');
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const pwd = newPassword || '';
    const isValid = pwd.length >= 6 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd);
    if (!isValid) {
      setError('Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/change-password', {
        oldPassword,
        newPassword
      });
      setSuccess('Password updated successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', 'complaint');

    setUploadingPhoto(true);
    try {
      const res = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setGrievancePhoto(res.data.url);
      toast.success('Photo uploaded successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRaiseGrievance = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/complaints', {
        title: grievanceTitle,
        description: grievanceDescription,
        category: grievanceCategory,
        priority: grievancePriority,
        attachments: grievancePhoto ? [grievancePhoto] : [],
      });
      toast.success('Grievance raised successfully!');
      setGrievanceTitle('');
      setGrievanceDescription('');
      setGrievancePhoto('');
      fetchStudentData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to raise grievance');
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2] flex flex-col md:flex-row text-[#1b2837]">
      <Toaster position="top-right" />
      
      {/* Sidebar Navigation */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#ffffff] border-r border-[#e3e7e7] transform transition-transform duration-300 ease-in-out p-5 flex flex-col justify-between shadow-2xl md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-ml-64'} shrink-0`}>
        <div className="space-y-6 flex-1 overflow-y-auto pr-1">
          <div className="flex items-center justify-between border-b border-[#e3e7e7]/30 pb-4">
            <div>
              <h2 className="font-black text-[#2a5cac] tracking-wide text-lg">SCHOOL PORTAL</h2>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase">Student Desk</p>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden rounded-full p-1.5 hover:bg-[#2a5cac]/10 text-[#2a5cac]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Directories</p>
              <div className="space-y-1">
                {[
                  ['dashboard', 'Dashboard Overview', LayoutGrid],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveSubTab(id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSubTab === id ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Academics</p>
              <div className="space-y-1">
                {[
                  ['homework', 'My Homework', ClipboardList],
                  ['attendance', 'Roster & Attendance', CheckCircle],
                  ['desk', 'Leave, alerts & check-in', Bell],
                  ['documents', 'My documents', FileText],
                  ['notices', 'Notice Board', Bell],
                  ['timetable', 'My Class Timetable', Calendar],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveSubTab(id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSubTab === id ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Academic Marks</p>
              <div className="space-y-1 pl-2 border-l border-[#e3e7e7]/45 ml-2">
                <button
                  onClick={() => {
                    setActiveSubTab('marks');
                    setSelectedSubjectId('');
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full text-left block px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    activeSubTab === 'marks' && !selectedSubjectId
                      ? 'bg-[#2a5cac] text-white' 
                      : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'
                  }`}
                >
                  📊 All Subjects Report Card
                </button>

                {(() => {
                  const studentClassStd = profileData?.classId?.standard?.toString();
                  const studentSubjects = subjects.filter(sub => sub.standard?.toString() === studentClassStd);
                  return studentSubjects.map((sub) => {
                    const isSelected = activeSubTab === 'marks' && selectedSubjectId === sub._id;
                    return (
                      <button
                        key={sub._id}
                        onClick={() => {
                          setActiveSubTab('marks');
                          setSelectedSubjectId(sub._id);
                          setIsSidebarOpen(false);
                        }}
                        className={`w-full text-left block px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          isSelected 
                            ? 'bg-[#2a5cac] text-white' 
                            : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'
                        }`}
                      >
                        📝 {sub.name}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {has('fees') && <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Payments</p>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setActiveSubTab('fees');
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSubTab === 'fees' ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                >
                  <DollarSign className="h-4 w-4" /> Fees & Payments
                </button>
              </div>
            </div>}

            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Account & security</p>
              <div className="space-y-1">
                {[
                  ['profile', 'My Detailed Profile', User],
                  ['grievances', 'Raise Grievance / Complaint', ShieldAlert],
                  ['security', 'Account Security', Lock],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveSubTab(id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSubTab === id ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 z-45 bg-black/35 md:hidden"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 max-h-screen flex flex-col">
        <div className="max-w-7xl mx-auto space-y-6 w-full flex-1">
          {/* Top Header Row with Hamburger Trigger */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-xl border border-[#e3e7e7] bg-white p-2.5 text-[#2a5cac] hover:bg-[#2a5cac]/10 transition shadow-sm"
              title="Toggle Sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex-1 rounded-2xl bg-paper p-3.5 text-[#1b2837] shadow-sm flex justify-between items-center flex-wrap gap-4">
              <h1 className="text-sm md:text-base font-black tracking-tight uppercase">Welcome, {profileData?.name || 'Student'}</h1>
            </div>
          </div>

        {/* TAB 1: OVERVIEW */}
        {activeSubTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-[#5b6b7b]">{item.title}</p>
                    <p className="mt-1 text-3xl font-black text-[#1b2837]">{item.value}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-6 lg:grid-cols-1">
              <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[#1b2837]">Today&apos;s focus</h2>
                    <p className="mt-1 text-sm text-[#5b6b7b]">A student should see only what is important.</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-[#2a5cac]" />
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    'Mathematics homework is due tomorrow.',
                    'Science period starts at 11:00 AM.',
                    'Check the notice board for annual day practice.',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl bg-[#f7f6f2] px-4 py-3 text-sm leading-6 text-[#3b4a5c]">{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1.5: HOMEWORK */}
        {activeSubTab === 'homework' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1b2837]">My Homework Assignments</h2>
              <p className="mt-1 text-sm text-[#5b6b7b]">View class work assigned by your teachers. Upload files before the deadline, or submit explanations for late items.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {studentHomework.length > 0 ? (
                studentHomework.map((hw) => {
                  const studentSubmission = hw.submissions?.find(
                    (s) => s.studentId?._id === profileData?._id || s.studentId === profileData?._id
                  );
                  const isPastDue = new Date() > new Date(hw.dueDate);

                  return (
                    <div key={hw._id} className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4 hover:shadow-md transition">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2a5cac]/10 text-[#2a5cac]">
                            Subject: {hw.subjectId?.name || 'N/A'}
                          </span>
                          <h3 className="text-lg font-bold text-[#1b2837] mt-2">{hw.title}</h3>
                          <p className="text-xs text-[#5b6b7b] mt-0.5">Assigned by: {hw.teacherId?.name || 'Teacher'}</p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            studentSubmission 
                              ? studentSubmission.status === 'Submitted' || studentSubmission.status === 'Late'
                                ? 'bg-emerald-500/10 text-emerald-700'
                                : 'bg-amber-500/10 text-amber-700'
                              : isPastDue
                                ? 'bg-rose-500/10 text-rose-700'
                                : 'bg-sky-500/10 text-sky-700'
                          }`}>
                            {studentSubmission 
                              ? studentSubmission.reasonForMissing
                                ? 'Excuse Logged'
                                : studentSubmission.status
                              : isPastDue
                                ? 'Missed'
                                : 'Pending'}
                          </span>
                          <p className="text-[10px] text-[#5b6b7b] mt-1 font-bold">
                            Due: {new Date(hw.dueDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="text-sm text-[#3b4a5c] space-y-2 bg-[#f7f6f2] p-3 rounded-2xl">
                        <p><strong>Instructions:</strong> {hw.description || 'No description provided.'}</p>
                      </div>

                      {/* Submitted State */}
                      {studentSubmission && (
                        <div className="border-t border-[#f7f6f2] pt-3 space-y-2">
                          <p className="text-xs font-bold text-[#2a5cac]">My Submission Detail:</p>
                          {studentSubmission.fileUrl && (
                            <p className="text-xs text-[#3b4a5c]">
                              Submitted File:{' '}
                              <button
                                type="button"
                                onClick={() => openProxiedFile(studentSubmission.fileUrl)}
                                className="underline font-bold text-[#2a5cac] hover:text-[#234c91]"
                              >
                                View Document
                              </button>
                            </p>
                          )}
                          {studentSubmission.reasonForMissing && (
                            <p className="text-xs text-rose-700 italic">
                              <strong>Missed Deadline Excuse:</strong> {studentSubmission.reasonForMissing}
                            </p>
                          )}
                          {studentSubmission.submittedDate && (
                            <p className="text-[10px] text-[#5b6b7b]">
                              Submitted On: {new Date(studentSubmission.submittedDate).toLocaleString()}
                            </p>
                          )}
                          {studentSubmission.marks !== undefined && (
                            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 mt-2 text-xs">
                              <p className="font-bold text-emerald-800">Grade: {studentSubmission.marks} Marks</p>
                              {studentSubmission.feedback && <p className="text-emerald-700 mt-0.5">Teacher Feedback: {studentSubmission.feedback}</p>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Submission (If not submitted/excused yet) */}
                      {!studentSubmission && (
                        <div className="border-t border-[#f7f6f2] pt-3">
                          {!isPastDue ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-[#3b4a5c]">Upload Assignment File *</label>
                              <input
                                type="file"
                                onChange={(e) => handleHomeworkUpload(e, hw._id)}
                                disabled={uploadingHomeworkId === hw._id}
                                className="block w-full text-xs text-[#5b6b7b] file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#2a5cac]/10 file:text-[#2a5cac] hover:file:bg-[#2a5cac]/20"
                              />
                              {uploadingHomeworkId === hw._id && (
                                <p className="text-xs text-amber-600">Uploading and submitting...</p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-rose-700">Due date passed. Explain reason for missing *</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Type explanation why homework was missed..."
                                  value={homeworkIssues[hw._id] || ''}
                                  onChange={(e) => setHomeworkIssues(prev => ({ ...prev, [hw._id]: e.target.value }))}
                                  className="flex-1 rounded-xl border border-rose-300 bg-[#f7f6f2] px-3 py-2 text-xs outline-none focus:border-rose-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleHomeworkIssueSubmit(hw._id)}
                                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition"
                                >
                                  Submit Reason
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 text-center py-10 text-[#5b6b7b]">
                  No homework assignments found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1.6: NOTICES */}
        {activeSubTab === 'notices' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1b2837]">School Notice Board</h2>
              <p className="mt-1 text-sm text-[#5b6b7b]">Stay updated with the latest events, exam schedules, achievements, and results.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {notices && notices.length > 0 ? (
                notices.map((notice) => {
                  const isPdf = notice.attachments?.[0]?.toLowerCase().endsWith('.pdf');
                  return (
                    <div key={notice._id} className="rounded-2xl border border-[#e3e7e7] bg-white p-5 shadow-sm space-y-3 relative hover:shadow-md transition">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex gap-2 flex-wrap items-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              notice.category === 'Event'
                                ? 'bg-sky-500/10 text-sky-700'
                                : notice.category === 'Achievement'
                                  ? 'bg-amber-500/10 text-amber-700'
                                  : notice.category === 'Exam'
                                    ? 'bg-rose-500/10 text-rose-700'
                                    : notice.category === 'Result'
                                      ? 'bg-emerald-500/10 text-emerald-700'
                                      : 'bg-gray-500/10 text-gray-700'
                            }`}>
                              {notice.category}
                            </span>
                            {notice.isPinned && (
                              <span className="bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md">
                                Pinned
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-base text-[#1b2837] mt-1.5">{notice.title}</h3>
                          <p className="text-[10px] text-[#5b6b7b] mt-0.5">By: {notice.createdBy?.name || 'Admin'} | To: {notice.targetAudience} | {new Date(notice.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <p className="text-xs text-[#3b4a5c] bg-[#ffffff] p-3 rounded-xl whitespace-pre-line">{notice.content}</p>
                      {notice.attachments && notice.attachments.length > 0 && notice.attachments[0] && (
                        <div className="pt-2">
                          <a
                            href={notice.attachments[0].includes('cloudinary.com') ? notice.attachments[0].replace('/upload/', '/upload/fl_attachment/') : notice.attachments[0]}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#2a5cac] hover:underline"
                          >
                            <FileText className="h-4 w-4" /> Download Attached Document {isPdf ? '(PDF)' : ''}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 text-center py-10 text-[#5b6b7b]">
                  No notices published yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1.65: MARKS */}
        {activeSubTab === 'marks' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1b2837]">My Academic Marks</h2>
              <p className="mt-1 text-sm text-[#5b6b7b]">Review your exam results, subject scores, teacher feedback, and average performance status.</p>
            </div>

            {(() => {
              const filteredMarks = selectedSubjectId
                ? studentMarks.filter(m => (m.subjectId?._id || m.subjectId)?.toString() === selectedSubjectId.toString())
                : studentMarks;

              const totalObtained = filteredMarks.reduce((sum, m) => sum + Number(m.marks || 0), 0);
              const totalMax = filteredMarks.reduce((sum, m) => sum + Number(m.outOfMarks || 0), 0);
              const avgPercentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(2) : '0.00';
              
              const passedCount = filteredMarks.filter(m => m.passStatus === 'Pass').length;
              const failedCount = filteredMarks.filter(m => m.passStatus === 'Fail').length;

              return (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm space-y-2">
                      <p className="text-xs font-bold text-[#5b6b7b] uppercase tracking-wider">Average Score</p>
                      <p className="text-3xl font-black text-[#2a5cac]">{avgPercentage}%</p>
                      <p className="text-xs text-[#5b6b7b]">Weighted average across all subjects</p>
                    </div>
                    <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm space-y-2">
                      <p className="text-xs font-bold text-[#5b6b7b] uppercase tracking-wider">Total Exams Marked</p>
                      <p className="text-3xl font-black text-[#2a5cac]">{filteredMarks.length}</p>
                      <p className="text-xs text-[#5b6b7b]">Grades recorded in current term</p>
                    </div>
                    <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm space-y-2">
                      <p className="text-xs font-bold text-[#5b6b7b] uppercase tracking-wider">Pass / Fail Status</p>
                      <div className="flex gap-4 items-center mt-2">
                        <span className="text-sm font-semibold text-[#3b4a5c]">
                          Passed: <span className="text-emerald-700 font-bold">{passedCount}</span>
                        </span>
                        <span className="text-sm font-semibold text-[#3b4a5c]">
                          Failed: <span className="text-rose-700 font-bold">{failedCount}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
                    <h3 className="font-bold text-lg text-[#1b2837]">Report Card</h3>
                    <div className="overflow-x-auto rounded-2xl border border-[#e3e7e7]">
                      <table className="w-full text-left border-collapse bg-white">
                        <thead>
                          <tr className="bg-[#f7f6f2] text-xs font-bold text-[#3b4a5c] uppercase">
                            <th className="p-3">Exam Name</th>
                            <th className="p-3">Subject</th>
                            <th className="p-3">Marks Obtained</th>
                            <th className="p-3">Percentage</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3">Remarks / Feedback</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f7f6f2] text-sm text-[#3b4a5c]">
                          {filteredMarks && filteredMarks.length > 0 ? (
                            filteredMarks.map((m) => (
                              <tr key={m._id} className="hover:bg-[#ffffff]/50">
                                <td className="p-3 font-semibold">{m.examId?.name || 'Test/Assessment'}</td>
                                <td className="p-3 font-bold text-[#1b2837]">{m.subjectId?.name || 'N/A'}</td>
                                <td className="p-3 font-semibold">{m.marks} / {m.outOfMarks}</td>
                                <td className="p-3">{m.percentage}%</td>
                                <td className="p-3 text-center">
                                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    m.passStatus === 'Pass' 
                                      ? 'bg-emerald-500/10 text-emerald-700' 
                                      : m.passStatus === 'Fail' 
                                        ? 'bg-rose-500/10 text-rose-700' 
                                        : 'bg-gray-500/10 text-gray-700'
                                  }`}>
                                    {m.passStatus || 'N/A'}
                                  </span>
                                </td>
                                <td className="p-3 text-xs italic">{m.remarks || 'No remarks provided.'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="6" className="p-6 text-center italic text-[#5b6b7b]">
                                No academic marks have been recorded yet for this view.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {activeSubTab === 'documents' && <MyDocuments />}
        {activeSubTab === 'desk' && <FamilyDesk role="student" kids={profileData ? [{ _id: profileData._id, name: profileData.name }] : []} />}

        {/* TAB 1.7: ATTENDANCE (once a day, marked by the class head master) */}
        {activeSubTab === 'attendance' && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-2xl font-black text-[#1b2837]">{t('My Attendance')}</h2>
              <p className="mt-1 text-sm text-[#5b6b7b]">{t('Your class head master marks attendance once every school day.')}</p>
              <div className="mt-3"><StatusChip status={attendanceData?.todayStatus || 'None'} leftAt={attendanceData?.daily?.find((d) => d.date === attendanceData?.today)?.leftAt} /></div>
            </div>
            <AttendanceReportView report={attendanceData} today={attendanceData?.today} threshold={attendanceData?.stats?.threshold || 75} />
          </div>
        )}

        {/* TAB 2: PROFILE */}
        {activeSubTab === 'profile' && (
          <div className="mb-6 space-y-2">
            <h2 className="text-xl font-black text-[#1b2837]">Edit my profile & documents</h2>
            <ProfileEditor />
          </div>
        )}

        {activeSubTab === 'profile' && profileData && (
          <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-6">
            
            {/* Main Header / Banner */}
            <div className="flex flex-col md:flex-row items-center gap-6 pb-6 border-b border-[#f7f6f2]">
              {profileData.photo ? (
                <img 
                  src={profileData.photo} 
                  alt={profileData.name} 
                  className="h-28 w-28 rounded-full object-cover border-2 border-[#2a5cac] shadow-sm"
                />
              ) : (
                <div className="h-28 w-28 rounded-full bg-[#2a5cac]/10 text-[#2a5cac] flex items-center justify-center font-bold text-3xl">
                  {profileData.name.charAt(0)}
                </div>
              )}
              <div className="text-center md:text-left space-y-1">
                <h2 className="text-2xl font-black text-[#1b2837]">{profileData.fullName || profileData.name}</h2>
                <p className="text-[#5b6b7b] text-sm font-semibold">Student ID: {profileData._id} | Roll: {profileData.rollNumber || 'N/A'}</p>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                  <span className="bg-[#2a5cac]/10 text-[#2a5cac] text-xs font-bold px-3 py-1 rounded-full">
                    Class: {profileData.classId?.standard || 'N/A'} ({profileData.division || 'N/A'})
                  </span>
                  <span className="bg-sky-500/10 text-sky-700 text-xs font-bold px-3 py-1 rounded-full font-mono">
                    Admission No: {profileData.admissionNumber || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Grid Details */}
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* Category 0: Personal Details */}
              <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                  <User className="h-4 w-4" /> Personal Details
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm text-[#3b4a5c]">
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">First Name:</span>{profileData.firstName || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Middle Name:</span>{profileData.middleName || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Last Name:</span>{profileData.lastName || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Gender:</span>{profileData.gender || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Date of Birth:</span>{profileData.dateOfBirth ? profileData.dateOfBirth.split('T')[0] : 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">B-Form / CNIC No.:</span>{profileData.cnicNumber || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Nationality:</span>{profileData.nationality || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Religion:</span>{profileData.religion || 'N/A'}</div>
                  <div className="col-span-2"><span className="font-semibold block text-xs text-[#5b6b7b]">Mother Tongue:</span>{profileData.motherTongue || 'N/A'}</div>
                </div>
              </div>

              {/* Category 1: Academic */}
              <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                  <LayoutGrid className="h-4 w-4" /> Academic Records
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm text-[#3b4a5c]">
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">House:</span>{profileData.house || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Academic Year:</span>{profileData.academicYear || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Medium:</span>{profileData.medium || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Admission Date:</span>{profileData.admissionDate ? profileData.admissionDate.split('T')[0] : 'N/A'}</div>
                  <div className="col-span-2">
                    <span className="font-semibold block text-xs text-[#5b6b7b]">Previous School:</span>
                    {profileData.previousSchool || 'Fresh'}
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold block text-xs text-[#5b6b7b]">Enrolled Subjects:</span>
                    <p className="text-xs mt-1 bg-[#f7f6f2] p-2 rounded-xl text-[#1b2837] font-semibold">
                      {profileData.subjectsEnrolled && profileData.subjectsEnrolled.length > 0
                        ? profileData.subjectsEnrolled.map(s => s.name || s).join(', ')
                        : 'No Subjects Enrolled'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 2: Parent Details */}
              <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                  <User className="h-4 w-4" /> Parent / Guardian details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm text-[#3b4a5c]">
                  <div className="border-r border-[#f7f6f2] pr-2">
                    <span className="font-bold block text-xs text-[#2a5cac] mb-1">Father</span>
                    <p><span className="text-[#5b6b7b] text-xs">Name:</span> {profileData.father?.name || 'N/A'}</p>
                    <p><span className="text-[#5b6b7b] text-xs">Occ:</span> {profileData.father?.occupation || 'N/A'}</p>
                    <p><span className="text-[#5b6b7b] text-xs">Ph:</span> {profileData.father?.mobileNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-bold block text-xs text-[#2a5cac] mb-1">Mother</span>
                    <p><span className="text-[#5b6b7b] text-xs">Name:</span> {profileData.mother?.name || 'N/A'}</p>
                    <p><span className="text-[#5b6b7b] text-xs">Occ:</span> {profileData.mother?.occupation || 'N/A'}</p>
                    <p><span className="text-[#5b6b7b] text-xs">Ph:</span> {profileData.mother?.mobileNumber || 'N/A'}</p>
                  </div>
                  {profileData.guardian?.name && (
                    <div className="col-span-2 border-t pt-2 mt-1">
                      <span className="font-bold block text-xs text-[#2a5cac]">Guardian (Different)</span>
                      <p className="text-xs mt-1">
                        Name: {profileData.guardian.name} | Relation: {profileData.guardian.relationship} | Ph: {profileData.guardian.mobileNumber}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Category 3: Contact & Address */}
              <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                  <Phone className="h-4 w-4" /> Contact Information
                </h3>
                <div className="text-sm text-[#3b4a5c] space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <p><span className="text-[#5b6b7b] text-xs font-bold block">Mobile:</span>{profileData.mobileNumber || 'N/A'}</p>
                    <p><span className="text-[#5b6b7b] text-xs font-bold block">Alt Mobile:</span>{profileData.alternateMobileNumber || 'N/A'}</p>
                  </div>
                  <p><span className="text-[#5b6b7b] text-xs font-bold block">Current Address:</span>{profileData.currentAddress || 'N/A'}</p>
                  <p><span className="text-[#5b6b7b] text-xs font-bold block">Permanent Address:</span>{profileData.permanentAddress || 'N/A'}</p>
                </div>
              </div>

              {/* Category 4: Health & Transport */}
              <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                  <AlertCircle className="h-4 w-4" /> Health & School Bus
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm text-[#3b4a5c]">
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Blood Group:</span>{profileData.bloodGroup || 'N/A'}</div>
                  <div><span className="font-semibold block text-xs text-[#5b6b7b]">Disability:</span>{profileData.disability || 'No'}</div>
                  <div className="col-span-2"><span className="font-semibold block text-xs text-[#5b6b7b]">Medical Conditions:</span>{profileData.medicalConditions || 'None'}</div>
                  <div className="col-span-2 border-t pt-2">
                    <span className="font-bold block text-xs text-[#2a5cac]">School Bus settings:</span>
                    <p className="text-xs mt-1">
                      Uses Bus: {profileData.usesSchoolBus} 
                      {profileData.usesSchoolBus === 'Yes' && ` (Route: ${profileData.busRoute || 'N/A'} | Stop: ${profileData.busStop || 'N/A'} | Number: ${profileData.busNumber || 'N/A'})`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 5: Documents */}
              <div className="col-span-2 rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                  <FileText className="h-4 w-4" /> Uploaded Registry Documents
                </h3>
                <div className="grid gap-2 sm:grid-cols-3 text-xs">
                  {[
                    ['Birth Certificate', profileData.documents?.birthCertificate],
                    ['B-Form / CNIC Copy', profileData.documents?.cnicCopy],
                    ['Previous Marksheet', profileData.documents?.previousMarksheet],
                    ['Transfer Certificate', profileData.documents?.transferCertificate],
                    ['Leaving Certificate', profileData.documents?.leavingCertificate],
                    ['Passport Photo', profileData.documents?.passportPhoto],
                    ['Parent ID Proof', profileData.documents?.parentIdProof],
                    ['Address Proof', profileData.documents?.addressProof],
                  ].map(([label, url]) => (
                    <div key={label} className="border border-[#f7f6f2] p-2 rounded-xl bg-[#ffffff] flex justify-between items-center">
                      <span className="font-bold text-[#3b4a5c]">{label}</span>
                      {url ? (
                        <a 
                          href={url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="bg-[#2a5cac] text-white hover:bg-[#234c91] px-2.5 py-1 rounded-lg font-bold"
                        >
                          View File
                        </a>
                      ) : (
                        <span className="text-[#5b6b7b] italic">Not Uploaded</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: GRIEVANCES */}
        {activeSubTab === 'grievances' && (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            
            {/* Form to Raise Grievance */}
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-[#1b2837] flex items-center gap-2">
                <Send className="h-5 w-5 text-[#2a5cac]" />
                Raise a Grievance
              </h2>
              <p className="text-sm text-[#5b6b7b]">Submit your issue directly to the school administration. You can upload an issue photo if relevant.</p>

              <form onSubmit={handleRaiseGrievance} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Grievance / Complaint Title *</label>
                  <input
                    type="text"
                    required
                    value={grievanceTitle}
                    onChange={(e) => setGrievanceTitle(e.target.value)}
                    placeholder="E.g., Classroom fan not working"
                    className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Category *</label>
                    <select
                      value={grievanceCategory}
                      onChange={(e) => setGrievanceCategory(e.target.value)}
                      className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                    >
                      {['Facilities', 'Academic', 'Behavioral', 'Profile Update', 'Other'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Priority *</label>
                    <select
                      value={grievancePriority}
                      onChange={(e) => setGrievancePriority(e.target.value)}
                      className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                    >
                      {['Low', 'Medium', 'High'].map(pr => (
                        <option key={pr} value={pr}>{pr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Explain Detail Message *</label>
                  <textarea
                    required
                    value={grievanceDescription}
                    onChange={(e) => setGrievanceDescription(e.target.value)}
                    placeholder="Explain what needs to be fixed..."
                    className="w-full h-28 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Attachment / Photo of Issue (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="block w-full text-xs text-[#5b6b7b] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#2a5cac]/10 file:text-[#2a5cac] hover:file:bg-[#2a5cac]/20"
                  />
                  {uploadingPhoto && <p className="text-xs text-amber-600 mt-1">Uploading photo...</p>}
                  {grievancePhoto && (
                    <p className="text-xs text-green-600 mt-1 font-bold">✓ Photo uploaded successfully!</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#2a5cac] py-2.5 text-sm font-bold text-white hover:bg-[#234c91] transition"
                >
                  Submit Grievance
                </button>
              </form>
            </div>

            {/* Grievance History */}
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-[#1b2837] flex items-center gap-2">
                <History className="h-5 w-5 text-[#2a5cac]" />
                Complaint History
              </h2>
              <p className="text-sm text-[#5b6b7b]">See active and resolved support tickets.</p>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {myGrievances.length > 0 ? (
                  myGrievances.map((complaint) => (
                    <div key={complaint._id} className="border border-[#e3e7e7] rounded-2xl bg-white p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[#5b6b7b]">{new Date(complaint.createdAt).toLocaleDateString()}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                          complaint.status === 'Resolved' 
                            ? 'bg-emerald-500/10 text-emerald-700' 
                            : complaint.status === 'In Progress' 
                              ? 'bg-amber-500/10 text-amber-700' 
                              : 'bg-rose-500/10 text-rose-700'
                        }`}>
                          {complaint.status === 'In Progress' ? 'Under Process' : (complaint.status === 'Resolved' ? 'Completed' : 'Pending')}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-[#1b2837]">{complaint.title}</h4>
                      <p className="text-xs text-[#3b4a5c] leading-relaxed bg-[#f7f6f2] p-2 rounded-xl">
                        {complaint.description}
                      </p>
                      {complaint.attachments && complaint.attachments.length > 0 && (
                        <div className="pt-1">
                          <a href={complaint.attachments[0]} target="_blank" rel="noopener noreferrer" className="text-[10px] underline font-bold text-[#2a5cac] hover:text-[#234c91]">
                            View Attached Photo
                          </a>
                        </div>
                      )}
                      {complaint.resolution ? (
                        <div className="border-t border-[#f7f6f2] pt-2 mt-2">
                          <span className="text-xs font-bold text-emerald-700 block">Revert Message from Admin:</span>
                          <p className="text-xs text-[#3b4a5c] italic mt-0.5">{complaint.resolution}</p>
                        </div>
                      ) : (
                        complaint.status === 'In Progress' && (
                          <p className="text-[11px] text-amber-600 font-semibold italic">Admin is currently processing your request.</p>
                        )
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#5b6b7b] italic text-center py-6">You have not raised any grievances yet.</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: PASSWORD SECURITY */}
        {activeSubTab === 'security' && (
          <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-[#1b2837] flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#2a5cac]" />
              Update Security Password
            </h2>
            <p className="mt-1 text-sm text-[#5b6b7b]">Change your password. Keep your account details secure.</p>

            <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 text-xs font-semibold p-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-emerald-50 text-emerald-700 text-xs font-semibold p-3 rounded-xl border border-emerald-200">
                  {success}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#3b4a5c] mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                />
                <div className="mt-1.5 space-y-1 text-[10px]">
                  <p className="font-semibold text-[#3b4a5c]">Password requirements:</p>
                  <div className="grid grid-cols-2 gap-1 mt-0.5">
                    <div className="flex items-center gap-1">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${(newPassword || '').length >= 6 ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={(newPassword || '').length >= 6 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>Min 6 characters</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${/[A-Z]/.test(newPassword || '') ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={/[A-Z]/.test(newPassword || '') ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>1 capital letter</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${/[0-9]/.test(newPassword || '') ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={/[0-9]/.test(newPassword || '') ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>1 number</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword || '') ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword || '') ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>1 special character</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#2a5cac] py-2.5 text-sm font-bold text-white hover:bg-[#234c91] transition disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        )}

        {/* TAB: TIMETABLE */}
        {activeSubTab === 'timetable' && (() => {
          const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          
          const getSortedTimeSlots = () => {
            const slotsSet = new Set();
            classTimetable.forEach(t => {
              t.slots?.forEach(s => {
                if (s.startTime && s.endTime) {
                  slotsSet.add(`${s.startTime} - ${s.endTime}`);
                }
              });
            });
            const toMin = (hhmm) => {
              const [h, m] = hhmm.split(':').map(Number);
              return h * 60 + m;
            };
            return [...slotsSet].sort((a, b) => toMin(a.split(' - ')[0]) - toMin(b.split(' - ')[0]));
          };

          const timeSlots = getSortedTimeSlots();

          const getCellContent = (day, slot) => {
            const tday = classTimetable.find(t => t.dayOfWeek?.toLowerCase() === day.toLowerCase());
            if (!tday || !tday.slots) return null;
            const match = tday.slots.find(s => `${s.startTime} - ${s.endTime}` === slot);
            if (!match) return null;
            if (match.isBreak) {
              return (
                <div className="p-2 bg-[#eef2f8]/40 border border-dashed border-[#2a5cac]/40 rounded-xl text-center text-[10px] text-[#5b6b7b] font-extrabold select-none">
                  ☕ {match.breakName || 'Break'}
                </div>
              );
            }
            return (
              <div className="p-2 bg-[#f7f6f2] border border-[#e3e7e7] rounded-xl text-center shadow-xs">
                <p className="font-bold text-[#1b2837] text-xs leading-tight">{match.subjectId?.name || 'Subject'}</p>
                <p className="text-[10px] text-[#5b6b7b] mt-1 font-semibold">{match.teacherId?.name || 'Teacher'}</p>
              </div>
            );
          };

          const classNameStr = profileData?.classId
            ? `Std ${profileData.classId.standard} (${profileData.classId.division})`
            : 'My Class';

          return (
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4 printable-timetable">
              <div className="flex justify-between items-center border-b border-[#e3e7e7]/35 pb-2 no-print">
                <div>
                  <h2 className="text-xl font-bold text-[#1b2837]">Class Timetable</h2>
                  <p className="text-xs text-[#5b6b7b]">Weekly class timetable for {classNameStr}</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#2a5cac] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#234c91] transition flex items-center gap-1.5 no-print"
                >
                  📥 Download / Print Timetable
                </button>
              </div>

              {/* Print Only Header (Visible during printing) */}
              <div className="hidden print:block mb-4 text-center">
                <h1 className="text-2xl font-black text-[#1b2837]">{profileData?.schoolName || 'School Hub'}</h1>
                <h2 className="text-lg font-bold text-[#2a5cac] mt-1">Class Timetable — {classNameStr}</h2>
                <p className="text-xs text-[#5b6b7b]">Academic Year: 2026-2027</p>
              </div>

              {timeSlots.length > 0 ? (
                <div className="min-w-full overflow-x-auto border border-[#e3e7e7] rounded-2xl bg-white shadow-sm">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-[#f7f6f2] border-b border-[#e3e7e7]">
                        <th className="p-4 text-xs font-black text-[#3b4a5c] border-r border-[#e3e7e7] w-32 bg-[#f7f6f2]">
                          Day / Time
                        </th>
                        {timeSlots.map(slot => (
                          <th key={slot} className="p-4 text-xs font-black text-[#3b4a5c] text-center border-r border-[#e3e7e7]/40 last:border-r-0">
                            {slot}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daysOrder.map((day, dayIdx) => (
                        <tr key={day} className="border-b border-[#e3e7e7]/60 last:border-b-0 hover:bg-[#ffffff]/45 transition">
                          <td className="p-4 text-xs font-black text-[#2a5cac] border-r border-[#e3e7e7] bg-[#f7f6f2]">
                            {day}
                          </td>
                          {timeSlots.map(slot => {
                            const breakMatch = (() => {
                              for (const t of classTimetable) {
                                const match = t.slots?.find(s => `${s.startTime} - ${s.endTime}` === slot);
                                if (match && match.isBreak) return match;
                              }
                              return null;
                            })();

                            if (breakMatch) {
                              if (dayIdx !== 0) return null;
                              return (
                                <td key={slot} rowSpan={daysOrder.length} className="p-2 border-r border-[#e3e7e7]/40 last:border-r-0 min-w-[80px] bg-[#eef2f8]/30 text-center font-extrabold text-[#5b6b7b] align-middle select-none">
                                  <div className="flex flex-col items-center justify-center space-y-1 py-4">
                                    <span>☕</span>
                                    <span className="uppercase tracking-widest text-[9px] font-black" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>
                                      {breakMatch.breakName || 'BREAK'}
                                    </span>
                                  </div>
                                </td>
                              );
                            }

                            const cell = getCellContent(day, slot);
                            return (
                              <td key={slot} className="p-2 border-r border-[#e3e7e7]/40 last:border-r-0 min-w-[140px]">
                                {cell || (
                                  <div className="p-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center text-[10px] text-gray-300 font-bold">
                                    Free
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-[#5b6b7b] italic text-sm">
                  No lectures are currently scheduled for your class division.
                </div>
              )}
            </div>
          );
        })()}

        {/* TAB: FEES */}
        {activeSubTab === 'fees' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1b2837]">Fees & Payments</h2>
              <p className="text-sm text-[#5b6b7b]">Pay through your bank, JazzCash or Easypaisa, then upload the payment screenshot here. The school checks it and marks the fee as paid.</p>
            </div>
            <FeesPanel />
          </div>
        )}

        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;