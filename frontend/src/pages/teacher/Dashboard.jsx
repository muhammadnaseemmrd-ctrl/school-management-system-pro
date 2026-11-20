import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, BookOpen, CheckCircle, ClipboardList, ScanLine, GraduationCap, LayoutGrid, 
  Users, Wand2, Search, Mail, Phone, Calendar, MapPin, Lock, Unlock, Clock,
  User, FileText, Send, Image, History, ShieldAlert, DollarSign, Award, X, Bell, BookOpenCheck, Menu, Trash2, Plus
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import ProfileEditor from '../../components/ProfileEditor';
import MyStaffRecord from './MyStaffRecord';
import AttendanceDesk from '../../components/attendance/AttendanceDesk';
import SafetyDesk from '../../components/safety/SafetyDesk';
import EarlyDesk from '../../components/early/EarlyDesk';
import DocStudio from '../../components/studio/DocStudio';
import AssessDesk from '../../components/assess/AssessDesk';
import OmrDesk from '../../components/omr/OmrDesk';
import TeacherTimetableDesk from '../../components/timetable/TeacherTimetableDesk';
import TeacherToday from '../../components/today/TeacherToday';
import { openProxiedFile } from '../../utils/fileProxy';
import { useLang } from '../../i18n/LanguageContext';
import ClassAttendanceSheet from '../../components/attendance/ClassAttendanceSheet';

const TeacherDashboard = () => {
  const { t } = useLang();
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#/', '');
    const validTabs = ['overview', 'students', 'homework', 'notices', 'timetable', 'attendance', 'marks', 'profile', 'grievances', 'security', 'staff', 'attendanceDesk', 'safetyDesk', 'timetablePlan', 'today', 'earlyYears', 'studio', 'assessments', 'omr'];
    if (hash && validTabs.includes(hash)) {
      return hash;
    }
    return null;
  };

  const [activeTab, setActiveTab] = useState(() => {
    const tabFromHash = getTabFromHash();
    if (tabFromHash) return tabFromHash;
    return localStorage.getItem('teacherActiveTab') || 'today';
  });

  useEffect(() => {
    // Ensure hash is set on initial mount
    const tabFromHash = getTabFromHash();
    const initialTab = tabFromHash || activeTab;
    const pageUrl = `${window.location.pathname}#/${initialTab}`;
    window.history.replaceState({ tab: initialTab, sentinel: 0 }, '', pageUrl);
    // Fill the history stack with 30 sentinel entries so the back button
    // can never escape to Google or any external page
    for (let i = 1; i <= 30; i++) {
      window.history.pushState({ tab: initialTab, sentinel: i }, '', pageUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('teacherActiveTab', activeTab);
    // Keep hash in sync when tab changes programmatically
    window.history.pushState({ tab: activeTab }, '', `${window.location.pathname}#/${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (e) => {
      const pageUrl = `${window.location.pathname}#/${activeTab}`;
      // Replenish sentinel stack — push 5 entries back each time to keep the buffer deep
      for (let i = 0; i < 5; i++) {
        window.history.pushState({ tab: activeTab, sentinel: i }, '', pageUrl);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [selectedDirSubjectId, setSelectedDirSubjectId] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [expandedAllDivsStd, setExpandedAllDivsStd] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [studioAccess, setStudioAccess] = useState(false);
  useEffect(() => { apiClient.get('/studio/overview').then((r) => setStudioAccess(!!(r.data.can?.manage || r.data.can?.issue || r.data.can?.print))).catch(() => setStudioAccess(false)); }, []);
  const [myGrievances, setMyGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teacherTimetables, setTeacherTimetables] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Homework management states
  const [assignedHomework, setAssignedHomework] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Homework creation form states
  const [hwSubjectId, setHwSubjectId] = useState('');
  const [hwSubjectName, setHwSubjectName] = useState('');
  const [hwClassStandard, setHwClassStandard] = useState('');
  const [hwClassDivision, setHwClassDivision] = useState('');
  const [hwTitle, setHwTitle] = useState('');
  const [hwDescription, setHwDescription] = useState('');
  const [hwDueDate, setHwDueDate] = useState('');

  // Notices state
  const [notices, setNotices] = useState([]);

  // Marks entry states
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedMarksClassId, setSelectedMarksClassId] = useState('');
  const [activeExamGroupKey, setActiveExamGroupKey] = useState('');
  const [marksEntries, setMarksEntries] = useState({}); // studentId -> { marks: '', passStatus: 'Pass', remarks: '' }
  const [isSavingMarks, setIsSavingMarks] = useState(false);
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [newExamForm, setNewExamForm] = useState({ name: '', date: '', maxMarks: 100, passingMarks: 35, subjectId: '', classId: '' });

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

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/students');
      setStudents(res.data.students || []);

      const resClasses = await apiClient.get('/classes?limit=1000').catch(() => ({ data: { classes: [] } }));
      setAllClasses(resClasses.data.classes || []);

      const resProfile = await apiClient.get('/auth/profile');
      setProfileData(resProfile.data.user || null);

      const resGrievances = await apiClient.get('/complaints/my');
      setMyGrievances(resGrievances.data.complaints || []);

      const resHomework = await apiClient.get('/homework?limit=1000').catch(() => ({ data: { homework: [] } }));
      setAssignedHomework(resHomework.data.homework || []);

      const resSubjects = await apiClient.get('/subjects').catch(() => ({ data: { subjects: [] } }));
      setSubjects(resSubjects.data.subjects || []);

      const resNotices = await apiClient.get('/notices/user/notices?limit=100').catch(() => ({ data: { notices: [] } }));
      setNotices(resNotices.data.notices || []);

      const resExams = await apiClient.get('/marks/exams?limit=1000').catch(() => ({ data: { exams: [] } }));
      setExams(resExams.data.exams || []);

      const resTimetables = await apiClient.get('/timetables').catch(() => ({ data: { timetables: [] } }));
      setTeacherTimetables(resTimetables.data.timetables || []);

    } catch (error) {
      console.error('Error fetching teacher dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHomework = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/homework', {
        classStandard: hwClassStandard,
        classDivision: hwClassDivision,
        subjectId: hwSubjectId,
        subjectName: hwSubjectName,
        title: hwTitle,
        description: hwDescription,
        dueDate: hwDueDate,
      });
      toast.success('Homework assigned successfully!');
      setHwClassStandard('');
      setHwClassDivision('');
      setHwSubjectId('');
      setHwSubjectName('');
      setHwTitle('');
      setHwDescription('');
      setHwDueDate('');
      fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign homework');
    }
  };

  const handleDeleteHomework = async (hwId) => {
    if (!window.confirm('Delete this homework assignment? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/homework/${hwId}`);
      fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete homework');
    }
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    const classId = newExamForm.classId;
    const subId = newExamForm.subjectId;
    if (!classId) {
      toast.error('Please select a class!');
      return;
    }
    if (!subId) {
      toast.error('Please select a subject!');
      return;
    }
    try {
      await apiClient.post('/marks/exams', {
        name: newExamForm.name,
        date: newExamForm.date || new Date().toISOString().split('T')[0],
        totalMarks: Number(newExamForm.maxMarks),
        passingMarks: Number(newExamForm.passingMarks),
        classId,
        subjectId: subId
      });
      toast.success('Exam/Assessment created successfully!');
      setShowAddExamModal(false);
      setNewExamForm({ name: '', date: '', maxMarks: 100, passingMarks: 35, subjectId: '', classId: '' });
      fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create exam');
    }
  };

  const handleSaveMarks = async (e) => {
    e.preventDefault();
    if (!selectedExamId || !selectedSubjectId || !selectedMarksClassId) {
      toast.error('Please select Class, Exam, and Subject!');
      return;
    }
    
    // classStudents
    const classStudents = students.filter(
      (s) => {
        const cId = s.classId?._id || s.classId;
        return cId && cId.toString() === selectedMarksClassId.toString();
      }
    );

    const examObj = exams.find(ex => ex._id === selectedExamId);
    const outOfMarks = examObj ? (examObj.totalMarks || examObj.maxMarks) : 100;

    const marksData = [];
    for (const student of classStudents) {
      const entry = marksEntries[student._id];
      if (entry && entry.marks !== undefined && entry.marks !== '') {
        marksData.push({
          studentId: student._id,
          marks: Number(entry.marks),
          outOfMarks: Number(outOfMarks),
          passStatus: entry.passStatus || 'Pass',
          remarks: entry.remarks || ''
        });
      }
    }

    if (marksData.length === 0) {
      toast.error('No student marks entered!');
      return;
    }

    try {
      setIsSavingMarks(true);
      await apiClient.post('/marks/bulk', {
        examId: selectedExamId,
        subjectId: selectedSubjectId,
        marksData
      });
      toast.success('Marks entered/updated successfully!');
      fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save student marks');
    } finally {
      setIsSavingMarks(false);
    }
  };

  useEffect(() => {
    const fetchExistingMarks = async () => {
      if (!selectedExamId || !selectedSubjectId) {
        setMarksEntries({});
        return;
      }
      try {
        const res = await apiClient.get(`/marks/exam/${selectedExamId}`);
        const results = res.data.results || [];
        
        // Filter by selected subject
        const subjectResults = results.filter(r => r.subjectId?._id === selectedSubjectId || r.subjectId === selectedSubjectId);
        
        // Map studentId -> { marks, passStatus, remarks }
        const entries = {};
        for (const item of subjectResults) {
          const sId = item.studentId?._id || item.studentId;
          entries[sId] = {
            marks: item.marks,
            passStatus: item.passStatus || (item.marks >= item.outOfMarks * 0.35 ? 'Pass' : 'Fail'),
            remarks: item.remarks || ''
          };
        }
        setMarksEntries(entries);
      } catch (err) {
        console.error('Failed to load existing marks:', err);
      }
    };
    fetchExistingMarks();
  }, [selectedExamId, selectedSubjectId]);

  // Synchronize activeExamGroupKey based on exams list and teacher assigned standards
  useEffect(() => {
    const assignedStds = new Set();
    if (profileData?.subjectClassAssignments) {
      profileData.subjectClassAssignments.forEach(ass => {
        if (ass.classId?.standard) {
          assignedStds.add(ass.classId.standard.toString());
        }
      });
    }
    if (profileData?.isClassTeacher && profileData.classTeacherOf?.standard) {
      assignedStds.add(profileData.classTeacherOf.standard.toString());
    }

    const relevantExams = exams.filter(ex => {
      const std = ex.classId?.standard;
      return std && assignedStds.has(std.toString());
    });

    const seenGroupKeys = new Set();
    relevantExams.forEach(ex => {
      const std = ex.classId?.standard;
      const dateStr = ex.date ? new Date(ex.date).toISOString().split('T')[0] : '';
      const groupKey = `${ex.name} (Std ${std}) - ${dateStr}`;
      seenGroupKeys.add(groupKey);
    });

    if (seenGroupKeys.size > 0) {
      if (!activeExamGroupKey || !seenGroupKeys.has(activeExamGroupKey)) {
        setActiveExamGroupKey([...seenGroupKeys][0]);
      }
    } else {
      setActiveExamGroupKey('');
    }
  }, [exams, profileData, activeExamGroupKey]);

  // Synchronize selectedExamId based on active exam sub-tab and class selection
  useEffect(() => {
    if (!activeExamGroupKey || !selectedMarksClassId) {
      setSelectedExamId('');
      return;
    }
    
    const relevantExams = exams.filter(ex => {
      const std = ex.classId?.standard;
      return std;
    });
    
    const matchedGroupExam = relevantExams.find(ex => {
      const dateStr = ex.date ? new Date(ex.date).toISOString().split('T')[0] : '';
      const groupKey = `${ex.name} (Std ${ex.classId?.standard}) - ${dateStr}`;
      return groupKey === activeExamGroupKey;
    });

    if (!matchedGroupExam) {
      setSelectedExamId('');
      return;
    }

    const specificExam = exams.find(ex => 
      ex.name === matchedGroupExam.name && 
      (ex.date ? new Date(ex.date).toISOString().split('T')[0] : '') === (matchedGroupExam.date ? new Date(matchedGroupExam.date).toISOString().split('T')[0] : '') &&
      ex.classId?._id?.toString() === selectedMarksClassId.toString()
    );

    setSelectedExamId(specificExam ? specificExam._id : '');
  }, [activeExamGroupKey, selectedMarksClassId, exams]);

  useEffect(() => {
    fetchDashboardData();
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
      fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to raise grievance');
    }
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.rollNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Real homework figures for this teacher (previously hard-coded)
  const myHomework = (assignedHomework || []).filter((hw) => {
    const tId = hw.teacherId?._id || hw.teacherId;
    return tId && profileData?._id && tId.toString() === profileData._id.toString();
  });
  const pendingHomeworkCount = myHomework.reduce((n, hw) => n + Math.max(0, (hw.totalStudents || 0) - (hw.submittedCount || 0)), 0);
  const ungradedCount = myHomework.reduce((n, hw) => n + (hw.submissions || []).filter((x) => ['Submitted', 'Late'].includes(x.status) && (x.marks === undefined || x.marks === null)).length, 0);

  const stats = [
    { icon: Users, title: 'Total Students', value: students.length, tone: 'bg-sky-500/10 text-sky-700' },
    { icon: BookOpen, title: 'Classes Assigned', value: profileData?.subjectClassAssignments ? [...new Set(profileData.subjectClassAssignments.map(ass => ass.classId?._id || ass.classId).filter(Boolean))].length : 0, tone: 'bg-emerald-500/10 text-emerald-700' },
    { icon: CheckCircle, title: 'Pending Homework', value: pendingHomeworkCount, tone: 'bg-amber-500/10 text-amber-700' },
    { icon: AlertCircle, title: 'Ungraded Submissions', value: ungradedCount, tone: 'bg-rose-500/10 text-rose-700' },
  ];

  return (
    <div className="min-h-screen bg-[#f7f6f2] flex flex-col md:flex-row text-[#1b2837]">
      <Toaster position="top-right" />
      
      {/* Sidebar Navigation */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#ffffff] border-r border-[#e3e7e7] transform transition-transform duration-300 ease-in-out p-5 flex flex-col justify-between shadow-2xl md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-ml-64'} shrink-0`}>
        <div className="space-y-6 flex-1 overflow-y-auto pr-1">
          <div className="flex items-center justify-between border-b border-[#e3e7e7]/30 pb-4">
            <div>
              <h2 className="font-black text-[#2a5cac] tracking-wide text-lg">SCHOOL PORTAL</h2>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase">Teacher Desk</p>
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
                  ['overview', 'Overview', LayoutGrid],
                  ['students', 'Students List', Users],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveTab(id);
                      setSearchQuery('');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === id ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Management</p>
              <div className="space-y-1">
                {[
                  ['homework', 'Homework & Grading', ClipboardList],
                  ['notices', 'Notice Board', Bell],
                  ['timetable', 'My Class Timetable', Calendar],
                  ['attendanceDesk', 'Attendance desk', CheckCircle],
                  ['today', 'Today', Clock],
                  ['safetyDesk', 'Gate & safety', ShieldAlert],
                  ['earlyYears', 'Nursery', Users],
                  ['timetablePlan', 'Timetable & cover', Calendar],
                  ['staff', 'My staff record', Users],
                  ['assessments', 'Quizzes & exams', ClipboardList],
                  ['omr', 'Paper exams (OMR)', ScanLine],
                  ...(studioAccess ? [['studio', 'Documents studio', FileText]] : []),
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveTab(id);
                      setSearchQuery('');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === id ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}

                {profileData?.isClassTeacher && (
                  <button
                    onClick={() => {
                      setActiveTab('attendance');
                      setSearchQuery('');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'attendance' ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
                  >
                    <CheckCircle className="h-4 w-4" /> {t('Take Attendance')}
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Marks Entry</p>
              <div className="space-y-1 mb-2">
                <button
                  onClick={() => {
                    setActiveTab('marks');
                    setSelectedMarksClassId('');
                    setSelectedSubjectId('');
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'marks' && !selectedMarksClassId && !selectedSubjectId
                      ? 'bg-[#2a5cac] text-white' 
                      : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'
                  }`}
                >
                  <BookOpenCheck className="h-4 w-4" /> Marks Entry & View
                </button>
              </div>
              <div className="space-y-1 pl-2 border-l border-[#e3e7e7]/45 ml-2">
                {profileData?.subjectClassAssignments?.map((ass, index) => {
                  if (!ass.classId || !ass.subjectId) return null;
                  const label = `Std ${ass.classId.standard}${ass.classId.division} - ${ass.subjectId.name}`;
                  const isSelected = activeTab === 'marks' && 
                                     selectedMarksClassId === ass.classId._id && 
                                     selectedSubjectId === ass.subjectId._id;
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setActiveTab('marks');
                        setSelectedMarksClassId(ass.classId._id);
                        setSelectedSubjectId(ass.subjectId._id);
                        const firstEx = exams.find(e => e.classId?._id?.toString() === ass.classId._id.toString());
                        if (firstEx) {
                          const dateStr = firstEx.date ? new Date(firstEx.date).toISOString().split('T')[0] : '';
                          setActiveExamGroupKey(`${firstEx.name} (Std ${ass.classId.standard}) - ${dateStr}`);
                        }
                        setIsSidebarOpen(false);
                      }}
                      className={`w-full text-left block px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        isSelected 
                          ? 'bg-[#2a5cac] text-white' 
                          : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'
                      }`}
                    >
                      📝 {label}
                    </button>
                  );
                })}

                {profileData?.isClassTeacher && profileData.classTeacherOf && (
                  <button
                    onClick={() => {
                      setActiveTab('marks');
                      setSelectedMarksClassId(profileData.classTeacherOf._id);
                      setSelectedSubjectId('');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full text-left block px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      activeTab === 'marks' && selectedMarksClassId === profileData.classTeacherOf._id && !selectedSubjectId
                        ? 'bg-[#2a5cac] text-white' 
                        : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'
                    }`}
                  >
                    ⭐ {t('Std')} {profileData.classTeacherOf.standard}{profileData.classTeacherOf.division} ({t('Head master')})
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#5b6b7b] font-bold uppercase tracking-wider mb-2 px-2">Account & settings</p>
              <div className="space-y-1">
                {[
                  ['profile', 'My Detailed Profile', User],
                  ['grievances', 'Raise Grievance / Complaint', ShieldAlert],
                  ['security', 'Account Security', Lock],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveTab(id);
                      setSearchQuery('');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === id ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`}
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
              <h1 className="text-sm md:text-base font-black tracking-tight uppercase">Welcome, {profileData?.name || 'Teacher'}</h1>
            </div>
          </div>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2a5cac] border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {profileData?.isClassTeacher && profileData.classTeacherOf?._id && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#2a5cac] p-6 text-white shadow-md">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#e3e7e7]">{t('You are the head master of')}</p>
                      <h2 className="mt-1 text-3xl font-black">{t('Class')} {profileData.classTeacherOf.standard}{profileData.classTeacherOf.division}</h2>
                      <p className="mt-1 text-sm text-[#eef2f8]">{t('Take the attendance of your class once a day, during your first period.')}</p>
                    </div>
                    <button onClick={() => setActiveTab('attendance')} className="inline-flex items-center gap-2 rounded-2xl bg-[#ffffff] px-6 py-4 text-base font-black text-[#2a5cac] shadow hover:bg-white">
                      <CheckCircle className="h-5 w-5" /> {t('Take Attendance')}
                    </button>
                  </div>
                )}
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

                <div className="grid gap-6 md:grid-cols-3">
                  {/* Class Teacher Profile Block */}
                  <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[#5b6b7b]">Designation</span>
                      <h3 className="text-xl font-black text-[#1b2837] mt-1">Class Teacher Assignment</h3>
                      <p className="mt-2 text-xs text-[#3b4a5c]">
                        Class teachers manage standard student registers, class notices, and class attendance rosters.
                      </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-[#e3e7e7]/20">
                      {profileData?.isClassTeacher && profileData.classTeacherOf ? (
                        <div className="rounded-2xl bg-[#2a5cac] p-4 text-center">
                          <p className="text-[10px] uppercase font-bold tracking-widest text-[#e3e7e7]">Assigned Class</p>
                          <h4 className="text-2xl font-black text-white mt-1">
                            Std {profileData.classTeacherOf.standard} ({profileData.classTeacherOf.division})
                          </h4>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-[#f7f6f2] p-4 text-center text-[#5b6b7b] font-semibold text-xs border border-dashed border-[#e3e7e7]">
                          Not currently assigned as Class Teacher
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Teaching Workload Work assignments */}
                  <div className="md:col-span-2 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#e3e7e7]/20">
                      <div>
                        <h2 className="text-xl font-bold text-[#1b2837]">My Teaching Assignments</h2>
                        <p className="text-xs text-[#5b6b7b]">Subjects and class divisions assigned to you by school administrators.</p>
                      </div>
                      <GraduationCap className="h-5 w-5 text-[#2a5cac]" />
                    </div>

                    {profileData?.subjectClassAssignments && profileData.subjectClassAssignments.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2 max-h-[320px] overflow-y-auto pr-1">
                        {profileData.subjectClassAssignments.map((ass, index) => {
                          if (!ass.classId || !ass.subjectId) return null;
                          return (
                            <div key={index} className="rounded-2xl bg-[#f7f6f2] p-4 flex flex-col justify-between border border-[#e3e7e7]/30 hover:shadow-sm transition">
                              <div>
                                <span className="text-[9px] uppercase font-bold tracking-wider text-[#5b6b7b]">Subject</span>
                                <h4 className="font-bold text-[#1b2837] text-sm">{ass.subjectId.name}</h4>
                                <p className="text-[10px] text-[#5b6b7b] font-medium">Code: {ass.subjectId.code}</p>
                              </div>
                              <div className="mt-4 pt-2 border-t border-[#e3e7e7]/20 flex justify-between items-center">
                                <span className="text-[9px] uppercase font-bold tracking-wider text-[#5b6b7b]">Division</span>
                                <span className="rounded-lg bg-[#2a5cac] px-2 py-0.5 text-xs font-black text-white">
                                  Std {ass.classId.standard} ({ass.classId.division})
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-[#5b6b7b] italic border border-dashed border-[#e3e7e7] rounded-2xl bg-[#f7f6f2]/30 text-xs">
                        No subject assignments configured by admin.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* NOTICES TAB */}
            {activeTab === 'notices' && (
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

            {/* MARKS TAB */}
            {activeTab === 'marks' && (() => {
              const availableClasses = [];
              const seenClassIds = new Set();
              if (profileData?.subjectClassAssignments) {
                profileData.subjectClassAssignments.forEach(ass => {
                  const cls = ass.classId;
                  if (cls && cls._id && !seenClassIds.has(cls._id.toString())) {
                    seenClassIds.add(cls._id.toString());
                    availableClasses.push(cls);
                  }
                });
              }
              if (profileData?.isClassTeacher && profileData.classTeacherOf?._id) {
                const ctCls = profileData.classTeacherOf;
                if (!seenClassIds.has(ctCls._id.toString())) {
                  seenClassIds.add(ctCls._id.toString());
                  availableClasses.push(ctCls);
                }
              }

              // Group relevant exams by (name, standard) to find standard-wise exams
              const assignedStds = new Set();
              if (profileData?.subjectClassAssignments) {
                profileData.subjectClassAssignments.forEach(ass => {
                  if (ass.classId?.standard) {
                    assignedStds.add(ass.classId.standard.toString());
                  }
                });
              }
              if (profileData?.isClassTeacher && profileData.classTeacherOf?.standard) {
                assignedStds.add(profileData.classTeacherOf.standard.toString());
              }

              const relevantExams = exams.filter(ex => {
                const std = ex.classId?.standard;
                return std && assignedStds.has(std.toString());
              });

              const examGroups = [];
              const seenGroupKeys = new Set();
              relevantExams.forEach(ex => {
                const std = ex.classId?.standard;
                const dateStr = ex.date ? new Date(ex.date).toISOString().split('T')[0] : '';
                const groupKey = `${ex.name} (Std ${std}) - ${dateStr}`;
                if (!seenGroupKeys.has(groupKey)) {
                  seenGroupKeys.add(groupKey);
                  examGroups.push({
                    key: groupKey,
                    name: ex.name,
                    standard: std,
                    date: dateStr,
                  });
                }
              });

              const matchedGroup = examGroups.find(g => g.key === activeExamGroupKey) || examGroups[0];

              const groupClasses = matchedGroup 
                ? availableClasses.filter(cls => cls.standard.toString() === matchedGroup.standard.toString())
                : [];

              const availableSubjects = (() => {
                if (!selectedMarksClassId) return [];
                const isCtOfSelected = profileData?.isClassTeacher && profileData.classTeacherOf?._id?.toString() === selectedMarksClassId.toString();
                if (isCtOfSelected) {
                  return subjects;
                }
                const list = [];
                const seenSubIds = new Set();
                if (profileData?.subjectClassAssignments) {
                  profileData.subjectClassAssignments.forEach(ass => {
                    const clsId = ass.classId?._id || ass.classId;
                    if (clsId && clsId.toString() === selectedMarksClassId.toString() && ass.subjectId) {
                      const subId = ass.subjectId._id || ass.subjectId;
                      if (!seenSubIds.has(subId.toString())) {
                        seenSubIds.add(subId.toString());
                        list.push(ass.subjectId);
                      }
                    }
                  });
                }
                return list;
              })();

              const isSubjectTeacher = (() => {
                if (!selectedMarksClassId || !selectedSubjectId) return false;
                if (profileData?.subjectClassAssignments) {
                  return profileData.subjectClassAssignments.some(ass => {
                    const cId = ass.classId?._id || ass.classId;
                    const sId = ass.subjectId?._id || ass.subjectId;
                    return cId && cId.toString() === selectedMarksClassId.toString() &&
                           sId && sId.toString() === selectedSubjectId.toString();
                  });
                }
                return false;
              })();

              const activeClassObj = availableClasses.find(c => c._id.toString() === selectedMarksClassId.toString());
              const activeClassLabel = activeClassObj ? `Class ${activeClassObj.standard}-${activeClassObj.division}` : '';

              const activeExamObj = exams.find(ex => ex._id === selectedExamId);

              return (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm flex justify-between items-center flex-wrap gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-[#1b2837]">Assessment & Marks Directory</h2>
                      <p className="text-sm text-[#5b6b7b]">Add/Edit exam scores for classes you teach, or view student report cards if you are a class teacher.</p>
                    </div>
                  </div>

                  {/* Dynamic Exam-Standard wise tabs */}
                  {examGroups.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pb-2 border-b border-[#e3e7e7]">
                      {examGroups.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => {
                            setActiveExamGroupKey(g.key);
                            setSelectedMarksClassId('');
                            setSelectedSubjectId('');
                            setSelectedExamId('');
                          }}
                          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
                            (activeExamGroupKey === g.key || (!activeExamGroupKey && matchedGroup?.key === g.key))
                              ? 'bg-[#2a5cac] text-white shadow-sm'
                              : 'bg-[#f7f6f2] text-[#5b6b7b] border border-[#e3e7e7] hover:bg-[#f7f6f2]'
                          }`}
                        >
                          {g.name} (Std {g.standard}) - {g.date ? new Date(g.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-8 text-[#5b6b7b] italic border border-dashed border-[#e3e7e7] rounded-2xl bg-[#ffffff]">
                      No active exams announced for your standards yet.
                    </div>
                  )}

                  {matchedGroup && (
                    <form onSubmit={handleSaveMarks} className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-3 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-5 shadow-sm">
                        <div>
                          <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Select Class Division *</label>
                          <select
                            required
                            value={selectedMarksClassId}
                            onChange={(e) => {
                              setSelectedMarksClassId(e.target.value);
                              setSelectedSubjectId('');
                              setSelectedExamId('');
                            }}
                            className="w-full rounded-xl border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm outline-none"
                          >
                            <option value="">-- Choose Class --</option>
                            {groupClasses.map((cls) => (
                              <option key={cls._id} value={cls._id}>
                                Std {cls.standard} ({cls.division})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Select Subject *</label>
                          <select
                            required
                            disabled={!selectedMarksClassId}
                            value={selectedSubjectId}
                            onChange={(e) => {
                              setSelectedSubjectId(e.target.value);
                            }}
                            className="w-full rounded-xl border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm outline-none disabled:opacity-50"
                          >
                            <option value="">-- Choose Subject --</option>
                            {availableSubjects.map((sub) => (
                              <option key={sub._id} value={sub._id}>
                                {sub.name} ({sub.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Exam Details</label>
                          <div className="w-full rounded-xl border border-[#e3e7e7] bg-white/60 px-3 py-2.5 text-xs text-[#3b4a5c] font-semibold flex flex-col justify-center min-h-[42px]">
                            {activeExamObj ? (
                              <>
                                <p><span className="font-black">Date:</span> {new Date(activeExamObj.date).toLocaleDateString()}</p>
                                <p><span className="font-black">Marks:</span> Max {activeExamObj.totalMarks || activeExamObj.maxMarks} / Pass {activeExamObj.passingMarks}</p>
                              </>
                            ) : (
                              <span className="italic text-[#5b6b7b]">No exam link active for standard division</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {selectedMarksClassId && selectedSubjectId && !isSubjectTeacher && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3.5 font-semibold">
                          ⚠️ [Read-Only View] You are viewing marks as a Class Teacher. Only the assigned subject teacher can add/edit marks for this subject.
                        </div>
                      )}

                      {selectedExamId && selectedSubjectId && selectedMarksClassId && (
                        <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
                          <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg text-[#1b2837]">
                              Student Grades List - {activeClassLabel}
                            </h3>
                            <span className="text-xs font-semibold text-[#5b6b7b]">
                              Out of Marks: {activeExamObj?.totalMarks || activeExamObj?.maxMarks || 100}
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-2xl border border-[#e3e7e7]">
                            <table className="w-full text-left border-collapse bg-white">
                              <thead>
                                <tr className="bg-[#f7f6f2] text-xs font-bold text-[#3b4a5c] uppercase">
                                  <th className="p-3 w-20">Roll No.</th>
                                  <th className="p-3">Student Name</th>
                                  <th className="p-3 w-36">Marks Obtained</th>
                                  <th className="p-3 w-40">Pass / Fail Status</th>
                                  <th className="p-3">Remarks / Feedback</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#f7f6f2] text-sm text-[#3b4a5c]">
                              {(() => {
                                const classStudents = students.filter(
                                  (s) => {
                                    const cId = s.classId?._id || s.classId;
                                    return cId && cId.toString() === selectedMarksClassId.toString();
                                  }
                                );
                                
                                if (classStudents.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan="5" className="p-6 text-center italic text-[#5b6b7b]">
                                          No students registered in this class.
                                        </td>
                                      </tr>
                                    );
                                }

                                return classStudents.map((student) => {
                                  const entry = marksEntries[student._id] || { marks: '', passStatus: 'Pass', remarks: '' };
                                  const maxVal = exams.find(ex => ex._id === selectedExamId)?.totalMarks || 100;
                                  
                                  return (
                                    <tr key={student._id} className="hover:bg-[#ffffff]/50">
                                      <td className="p-3 font-semibold">{student.rollNumber || 'N/A'}</td>
                                      <td className="p-3">
                                        <p className="font-bold text-[#1b2837]">{student.name}</p>
                                        <p className="text-[10px] text-[#5b6b7b]">{student.email}</p>
                                      </td>
                                      <td className="p-3">
                                        <input
                                          type="number"
                                          disabled={!isSubjectTeacher}
                                          min="0"
                                          max={maxVal}
                                          value={entry.marks}
                                          placeholder={`0-${maxVal}`}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            const passing = maxVal * 0.35;
                                            const autoPassStatus = val !== '' && Number(val) >= passing ? 'Pass' : 'Fail';
                                            setMarksEntries({
                                              ...marksEntries,
                                              [student._id]: {
                                                ...entry,
                                                marks: val,
                                                passStatus: autoPassStatus
                                              }
                                            });
                                          }}
                                          className="w-full rounded-lg border border-[#e3e7e7] bg-[#ffffff] px-2.5 py-1.5 text-sm outline-none focus:border-[#2a5cac] disabled:opacity-60"
                                        />
                                      </td>
                                      <td className="p-3">
                                        <select
                                          disabled={!isSubjectTeacher}
                                          value={entry.passStatus}
                                          onChange={(e) => {
                                            setMarksEntries({
                                              ...marksEntries,
                                              [student._id]: {
                                                ...entry,
                                                passStatus: e.target.value
                                              }
                                            });
                                          }}
                                          className="w-full rounded-lg border border-[#e3e7e7] bg-[#ffffff] px-2 py-1.5 text-xs font-bold outline-none disabled:opacity-60"
                                        >
                                          <option value="Pass">Pass</option>
                                          <option value="Fail">Fail</option>
                                        </select>
                                      </td>
                                      <td className="p-3">
                                        <input
                                          type="text"
                                          disabled={!isSubjectTeacher}
                                          placeholder={isSubjectTeacher ? "Feedback remarks..." : "Read-only view"}
                                          value={entry.remarks}
                                          onChange={(e) => {
                                            setMarksEntries({
                                              ...marksEntries,
                                              [student._id]: {
                                                ...entry,
                                                remarks: e.target.value
                                              }
                                            });
                                          }}
                                          className="w-full rounded-lg border border-[#e3e7e7] bg-[#ffffff] px-3 py-1.5 text-xs outline-none focus:border-[#2a5cac] disabled:opacity-60"
                                        />
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>

                        {isSubjectTeacher && (
                          <div className="flex justify-end pt-2">
                            <button
                              type="submit"
                              disabled={isSavingMarks}
                              className="rounded-xl bg-[#2a5cac] px-6 py-3 text-sm font-bold text-white hover:bg-[#234c91] transition shadow-md disabled:opacity-50"
                            >
                              {isSavingMarks ? 'Saving Student Grades...' : 'Save Class Marks'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                )}
              </div>
            );
          })()}



            {/* STUDENTS TAB */}
            {activeTab === 'students' && (() => {
              // 1. Get all unique subjects taught by the teacher
              const uniqueSubjects = [];
              const seenSubs = new Set();
              if (profileData?.subjectClassAssignments) {
                profileData.subjectClassAssignments.forEach(ass => {
                  const sub = ass.subjectId;
                  // sub could be an unpopulated ObjectId string or a full object
                  const subId = sub?._id || (typeof sub === 'string' ? sub : null);
                  if (sub && sub._id && !seenSubs.has(subId.toString())) {
                    seenSubs.add(subId.toString());
                    uniqueSubjects.push(sub);
                  }
                });
              }

              // BACK NAVIGATION HELPER
              const handleBackClick = () => {
                if (selectedClassId) {
                  setSelectedClassId(null);
                } else if (expandedAllDivsStd) {
                  setExpandedAllDivsStd(null);
                } else if (selectedDirSubjectId) {
                  setSelectedDirSubjectId(null);
                }
              };

              // --- STATE 1: NO SUBJECT SELECTED (Show Subject Cards) ---
              if (!selectedDirSubjectId) {
                return (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-[#1b2837]">My Subject Directories</h2>
                      <p className="text-sm text-[#5b6b7b]">Select a subject to view assigned standards, divisions, and students.</p>
                    </div>
                    {uniqueSubjects.length === 0 ? (
                      <p className="text-sm text-[#5b6b7b] italic text-center py-10 bg-[#f7f6f2]/30 rounded-3xl border border-[#e3e7e7]/60">
                        No subject assignments found. Please contact the administrator.
                      </p>
                    ) : (
                      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                        {uniqueSubjects.map(sub => {
                          const classCount = profileData.subjectClassAssignments.filter(
                            ass => {
                              const subId = ass.subjectId?._id || ass.subjectId;
                              return subId && subId.toString() === sub._id.toString();
                            }
                          ).length;
                          return (
                            <div
                              key={sub._id}
                              onClick={() => {
                                setSelectedDirSubjectId(sub._id.toString());
                                setExpandedAllDivsStd(null);
                                setSelectedClassId(null);
                              }}
                              className="group cursor-pointer rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm hover:shadow-md hover:border-[#2a5cac] transition duration-300 space-y-4"
                            >
                              <div className="flex justify-between items-center">
                                <div className="h-12 w-12 rounded-2xl bg-[#2a5cac] text-white flex items-center justify-center font-bold text-lg group-hover:scale-105 transition duration-200">
                                  <BookOpen className="h-6 w-6" />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                  {classCount} Class{classCount !== 1 ? 'es' : ''}
                                </span>
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-[#1b2837] group-hover:text-[#2a5cac] transition">{sub.name}</h3>
                                <p className="text-xs text-[#5b6b7b]">{sub.code}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const selectedSubObj = selectedDirSubjectId
                ? uniqueSubjects.find(s => s._id && s._id.toString() === selectedDirSubjectId.toString())
                : null;

              // --- STATE 4: CLASS DIVISION SELECTED (Show Student List) ---
              if (selectedClassId) {
                const activeClass = allClasses.find(c => c._id.toString() === selectedClassId.toString());
                const classLabel = activeClass ? `Class ${activeClass.standard} (${activeClass.division})` : 'Class Directory';

                const filteredStudents = students.filter(s => {
                  const sClassId = s.classId?._id || s.classId;
                  const matchesSearch = s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.rollNumber?.toLowerCase().includes(searchQuery.toLowerCase());
                  return sClassId && String(sClassId) === String(selectedClassId) && matchesSearch;
                });

                return (
                  <div className="space-y-6">
                    {/* Navigation bar */}
                    <div className="flex items-center gap-2 text-sm text-[#5b6b7b]">
                      <button onClick={handleBackClick} className="font-bold text-[#2a5cac] hover:underline text-xs">
                        ← Back
                      </button>
                      <span>/</span>
                      <span className="cursor-pointer hover:text-[#2a5cac] text-xs" onClick={() => { setSelectedClassId(null); setExpandedAllDivsStd(null); }}>
                        {selectedSubObj?.name}
                      </span>
                      <span>/</span>
                      {expandedAllDivsStd && (
                        <>
                          <span className="cursor-pointer hover:text-[#2a5cac] text-xs" onClick={() => setSelectedClassId(null)}>
                            Std {expandedAllDivsStd}
                          </span>
                          <span>/</span>
                        </>
                      )}
                      <span className="font-bold text-[#1b2837] text-xs">{classLabel}</span>
                    </div>

                    <div className="flex justify-between items-center flex-wrap gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-[#1b2837]">{classLabel} Student List</h2>
                        <p className="text-sm text-[#5b6b7b]">Viewing students enrolled in {selectedSubObj?.name} for this class.</p>
                      </div>
                      <div className="relative w-full max-w-sm">
                        <Search className="absolute left-4 top-3 h-4 w-4 text-[#2a5cac]" />
                        <input
                          type="text"
                          placeholder="Search students..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full text-xs rounded-xl border border-[#e3e7e7] bg-[#ffffff] py-2.5 pl-10 pr-4 outline-none focus:border-[#2a5cac]"
                        />
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      {filteredStudents.length > 0 ? (
                        filteredStudents.map((student) => (
                          <div key={student._id} className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4 hover:shadow-md transition">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="text-lg font-bold text-[#1b2837]">{student.name}</h3>
                                <div className="flex gap-2 mt-1">
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#2a5cac]/10 text-[#2a5cac]">
                                    Roll: {student.rollNumber || 'Not Assigned'}
                                  </span>
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#2a5cac]/10 text-[#2a5cac]">
                                    Reg: {student.registrationNumber || 'N/A'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2a5cac] text-white shrink-0">
                                <User className="h-4.5 w-4.5" />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#f7f6f2] pt-3">
                              <div className="flex items-center gap-1.5 text-[#3b4a5c] min-w-0">
                                <Mail className="h-3.5 w-3.5 text-[#2a5cac] shrink-0" />
                                <span className="truncate">{student.email}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[#3b4a5c]">
                                <Phone className="h-3.5 w-3.5 text-[#2a5cac] shrink-0" />
                                <span>{student.phone || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[#3b4a5c]">
                                <BookOpen className="h-3.5 w-3.5 text-[#2a5cac] shrink-0" />
                                <span>Class: {student.classId?.standard || student.classId}{student.division}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[#3b4a5c]">
                                <Calendar className="h-3.5 w-3.5 text-[#2a5cac] shrink-0" />
                                <span>DOB: {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-2 text-center py-10 text-[#5b6b7b] bg-[#f7f6f2]/20 rounded-2xl border border-[#e3e7e7]/45 border-dashed text-xs">
                          No students found in this class division.
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // --- STATE 3: EXPANDED ALL DIVISION CARD (Show Division Cards) ---
              if (expandedAllDivsStd) {
                // Find all assigned divisions for this standard and subject
                const assignedDivisions = profileData.subjectClassAssignments
                  .filter(ass => {
                    const subId = ass.subjectId?._id || ass.subjectId;
                    return subId && subId.toString() === selectedDirSubjectId.toString() &&
                           ass.classId?.standard === expandedAllDivsStd;
                  })
                  .map(ass => ass.classId)
                  .filter(Boolean)
                  .sort((a, b) => a.division.localeCompare(b.division));

                return (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-sm text-[#5b6b7b]">
                      <button onClick={handleBackClick} className="font-bold text-[#2a5cac] hover:underline text-xs">
                        ← Back
                      </button>
                      <span>/</span>
                      <span className="cursor-pointer hover:text-[#2a5cac] text-xs" onClick={() => setExpandedAllDivsStd(null)}>
                        {selectedSubObj?.name}
                      </span>
                      <span>/</span>
                      <span className="font-bold text-[#1b2837] text-xs">Standard {expandedAllDivsStd} Divisions</span>
                    </div>

                    <div>
                      <h2 className="text-xl font-bold text-[#1b2837]">{selectedSubObj?.name} - Standard {expandedAllDivsStd}</h2>
                      <p className="text-sm text-[#5b6b7b]">Select a division below to view the class student directory.</p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                      {assignedDivisions.map(cls => (
                        <div
                          key={cls._id}
                          onClick={() => setSelectedClassId(cls._id.toString())}
                          className="group cursor-pointer rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm hover:shadow-md hover:border-[#2a5cac] transition duration-300 space-y-4"
                        >
                          <div className="flex justify-between items-center">
                            <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm group-hover:scale-105 transition duration-200">
                              <Users className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                              Division {cls.division}
                            </span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-[#1b2837] group-hover:text-[#2a5cac] transition">
                              Std {cls.standard} - {cls.division}
                            </h3>
                            <p className="text-xs text-[#5b6b7b]">Taught Subject: {selectedSubObj?.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // --- STATE 2: SUBJECT SELECTED, NO SPECIFIC CLASS (Show Class/Standard Cards) ---
              // Find all assigned classes for this subject
              const assignedClassIds = profileData.subjectClassAssignments
                .filter(ass => {
                  const subId = ass.subjectId?._id || ass.subjectId;
                  return subId && subId.toString() === selectedDirSubjectId.toString();
                })
                .map(ass => ass.classId?._id || ass.classId)
                .filter(Boolean);

              // Group by standard
              const stdGroups = {};
              assignedClassIds.forEach(cid => {
                const cls = allClasses.find(c => c._id.toString() === cid.toString());
                if (cls) {
                  const std = cls.standard;
                  if (!stdGroups[std]) stdGroups[std] = [];
                  stdGroups[std].push(cls);
                }
              });

              const sortedStds = Object.keys(stdGroups).sort((a, b) => {
                const order = { 'playgroup': 1, 'nursery': 2, 'junior kg': 3, 'senior kg': 4 };
                const aVal = order[a.toLowerCase()] || parseInt(a, 10) + 10 || 99;
                const bVal = order[b.toLowerCase()] || parseInt(b, 10) + 10 || 99;
                return aVal - bVal;
              });

              return (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-sm text-[#5b6b7b]">
                    <button onClick={handleBackClick} className="font-bold text-[#2a5cac] hover:underline text-xs">
                      ← Back
                    </button>
                    <span>/</span>
                    <span className="font-bold text-[#1b2837] text-xs">{selectedSubObj?.name}</span>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-[#1b2837]">{selectedSubObj?.name} Classes</h2>
                    <p className="text-sm text-[#5b6b7b]">Select a class or standard to view student directories.</p>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                    {sortedStds.map(std => {
                      const teacherCls = stdGroups[std];
                      const schoolCls = allClasses.filter(c => c.standard === std);
                      const teachesAllDivisions = teacherCls.length === schoolCls.length && schoolCls.length > 0;

                      if (teachesAllDivisions) {
                        return (
                          <div
                            key={std}
                            onClick={() => setExpandedAllDivsStd(std)}
                            className="group cursor-pointer rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm hover:shadow-md hover:border-[#2a5cac] transition duration-300 space-y-4"
                          >
                            <div className="flex justify-between items-center">
                              <div className="h-10 w-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-sm group-hover:scale-105 transition duration-200">
                                <GraduationCap className="h-5 w-5" />
                              </div>
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                All Divisions ({teacherCls.length})
                              </span>
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-[#1b2837] group-hover:text-[#2a5cac] transition">
                                Standard {std}
                              </h3>
                              <p className="text-xs text-[#5b6b7b]">Click to view all divisions ({teacherCls.map(c => c.division).join(', ')})</p>
                            </div>
                          </div>
                        );
                      } else {
                        // Teaches only specific divisions, render them directly
                        return teacherCls.map(cls => (
                          <div
                            key={cls._id}
                            onClick={() => setSelectedClassId(cls._id.toString())}
                            className="group cursor-pointer rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm hover:shadow-md hover:border-[#2a5cac] transition duration-300 space-y-4"
                          >
                            <div className="flex justify-between items-center">
                              <div className="h-10 w-10 rounded-xl bg-[#2a5cac] text-white flex items-center justify-center font-bold text-sm group-hover:scale-105 transition duration-200">
                                <Users className="h-5 w-5" />
                              </div>
                              <span className="text-[10px] font-bold text-[#2a5cac] bg-[#2a5cac]/10 px-2 py-0.5 rounded-full">
                                Division {cls.division}
                              </span>
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-[#1b2837] group-hover:text-[#2a5cac] transition">
                                Std {cls.standard} - {cls.division}
                              </h3>
                              <p className="text-xs text-[#5b6b7b]">Click to view class directory</p>
                            </div>
                          </div>
                        ));
                      }
                    })}
                  </div>
                </div>
              );
            })()}

            {/* HOMEWORK TAB */}
            {activeTab === 'homework' && (
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                
                {/* Assign New Homework Form */}
                <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
                  <h2 className="text-xl font-bold text-[#1b2837] flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#2a5cac]" />
                    Assign New Homework
                  </h2>
                  <p className="text-sm text-[#5b6b7b]">Assign homework to a specific class standard and division.</p>

                  <form onSubmit={handleCreateHomework} className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Subject *</label>
                      <select
                        required
                        value={hwSubjectId}
                        onChange={(e) => {
                          const sId = e.target.value;
                          setHwSubjectId(sId);
                          const sub = subjects.find(s => s._id === sId);
                          setHwSubjectName(sub ? sub.name : '');
                          setHwClassStandard('');
                          setHwClassDivision('');
                        }}
                        className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac] focus:bg-white"
                      >
                        <option value="">-- Select Subject --</option>
                        {(() => {
                          const assignedSubjects = [];
                          const seenSubIds = new Set();
                          if (profileData?.subjectClassAssignments) {
                            profileData.subjectClassAssignments.forEach(ass => {
                              const sub = ass.subjectId;
                              if (sub && !seenSubIds.has(sub._id)) {
                                seenSubIds.add(sub._id);
                                assignedSubjects.push(sub);
                              }
                            });
                          }
                          return assignedSubjects.map(sub => (
                            <option key={sub._id} value={sub._id}>{sub.name}</option>
                          ));
                        })()}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Class Standard *</label>
                        <select
                          required
                          disabled={!hwSubjectId}
                          value={hwClassStandard}
                          onChange={(e) => {
                            setHwClassStandard(e.target.value);
                            setHwClassDivision('');
                          }}
                          className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac] focus:bg-white disabled:opacity-50"
                        >
                          <option value="">-- Select Standard --</option>
                          {(() => {
                            const assignedStandards = [];
                            const seenStds = new Set();
                             if (profileData?.subjectClassAssignments && hwSubjectId) {
                               profileData.subjectClassAssignments.forEach(ass => {
                                 const subId = ass.subjectId?._id || ass.subjectId;
                                 if (subId && subId.toString() === hwSubjectId.toString()) {
                                   const std = ass.classId?.standard;
                                   if (std && !seenStds.has(std)) {
                                     seenStds.add(std);
                                     assignedStandards.push(std);
                                   }
                                 }
                               });
                             }
                             return assignedStandards.sort().map(std => (
                               <option key={std} value={std}>{std.match(/^\d+$/) ? `Standard ${std}` : std}</option>
                             ));
                           })()}
                         </select>
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Class Division/Section *</label>
                         <select
                           required
                           disabled={!hwClassStandard}
                           value={hwClassDivision}
                           onChange={(e) => setHwClassDivision(e.target.value)}
                           className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac] focus:bg-white disabled:opacity-50"
                         >
                           <option value="">-- Select Division --</option>
                           {(() => {
                             const assignedDivisions = [];
                             if (profileData?.subjectClassAssignments && hwSubjectId && hwClassStandard) {
                               profileData.subjectClassAssignments.forEach(ass => {
                                 const subId = ass.subjectId?._id || ass.subjectId;
                                 if (subId && subId.toString() === hwSubjectId.toString() && ass.classId?.standard === hwClassStandard) {
                                   const div = ass.classId?.division;
                                   if (div && !assignedDivisions.includes(div)) {
                                     assignedDivisions.push(div);
                                   }
                                 }
                               });
                             }
                             return assignedDivisions.sort().map(div => (
                               <option key={div} value={div}>{div}</option>
                             ));
                           })()}
                         </select>
                       </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Homework Title *</label>
                      <input
                        type="text"
                        required
                        placeholder="E.g., Chapter 3 Geometry Proofs"
                        value={hwTitle}
                        onChange={(e) => setHwTitle(e.target.value)}
                        className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Detailed Instructions / Description *</label>
                      <textarea
                        required
                        placeholder="Write assignment instructions here..."
                        value={hwDescription}
                        onChange={(e) => setHwDescription(e.target.value)}
                        className="w-full h-24 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Due Date *</label>
                      <input
                        type="date"
                        required
                        value={hwDueDate}
                        onChange={(e) => setHwDueDate(e.target.value)}
                        className="w-full rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2.5 text-sm outline-none focus:border-[#2a5cac]"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-[#2a5cac] py-2.5 text-sm font-bold text-white hover:bg-[#234c91] transition"
                    >
                      Assign Homework
                    </button>
                  </form>
                </div>

                {/* Assigned Homework & Track Submissions */}
                <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
                  <h2 className="text-xl font-bold text-[#1b2837] flex items-center gap-2">
                    <History className="h-5 w-5 text-[#2a5cac]" />
                    Assigned Homework Tracker
                  </h2>
                  <p className="text-sm text-[#5b6b7b]">Monitor student submissions and grade their work.</p>

                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {assignedHomework.filter(hw => {
                      const tId = hw.teacherId?._id || hw.teacherId;
                      return tId && tId.toString() === profileData?._id.toString();
                    }).length > 0 ? (
                      assignedHomework
                        .filter(hw => {
                          const tId = hw.teacherId?._id || hw.teacherId;
                          return tId && tId.toString() === profileData?._id.toString();
                        })
                        .map((hw) => (
                          <div key={hw._id} className="border border-[#e3e7e7] rounded-2xl bg-white p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2a5cac]/10 text-[#2a5cac]">
                                  Class {hw.classId?.standard || 'N/A'}-{hw.classId?.division || 'N/A'} | {hw.subjectId?.name || 'N/A'}
                                </span>
                                <h3 className="font-bold text-[#1b2837] mt-2">{hw.title}</h3>
                              </div>
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="text-right text-xs">
                                  <span className="font-bold text-emerald-700">✅ Submitted: {hw.submittedCount || 0}</span>
                                  <span className="font-bold text-amber-700 ml-2">⏳ Pending: {Math.max(0, (hw.totalStudents || 0) - (hw.submittedCount || 0))}</span>
                                  <span className="text-[#2a5cac] font-semibold ml-2">/ {hw.totalStudents || 0} Total</span>
                                  <p className="text-[10px] text-[#5b6b7b] mt-0.5">Due: {new Date(hw.dueDate).toLocaleDateString()}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHomework(hw._id)}
                                  className="flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 transition"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete HW
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-[#3b4a5c] leading-relaxed bg-[#f7f6f2] p-2.5 rounded-xl">{hw.description}</p>
                            
                            {/* Expand Submissions */}
                            <div className="border-t border-[#f7f6f2] pt-3 mt-2 space-y-2">
                              <h4 className="text-xs font-bold text-[#2a5cac]">Student Submissions:</h4>
                              {hw.submissions && hw.submissions.length > 0 ? (
                                <div className="space-y-2 pl-2">
                                  {hw.submissions.map((sub) => {
                                    // Look up student details if populated
                                    const studentDetail = students.find(s => s._id === sub.studentId || s._id === sub.studentId?._id) || sub.studentId;
                                    return (
                                      <div key={sub._id || sub.studentId} className="bg-[#ffffff] border border-[#e3e7e7] p-2.5 rounded-xl text-xs space-y-1">
                                        <div className="flex justify-between items-center">
                                          <span className="font-bold text-[#1b2837]">{studentDetail?.name || 'Unknown Student'}</span>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            sub.reasonForMissing
                                              ? 'bg-rose-500/10 text-rose-700'
                                              : 'bg-emerald-500/10 text-emerald-700'
                                          }`}>
                                            {sub.reasonForMissing ? 'Excuse Logged' : sub.status}
                                          </span>
                                        </div>

                                        {sub.fileUrl && (
                                          <p className="text-[11px] text-[#3b4a5c]">
                                            Submission File:{' '}
                                            <button
                                              type="button"
                                              onClick={() => openProxiedFile(sub.fileUrl)}
                                              className="underline font-bold text-[#2a5cac] hover:text-[#234c91]"
                                            >
                                              View Document
                                            </button>
                                          </p>
                                        )}

                                        {sub.reasonForMissing && (
                                          <p className="text-[11px] text-rose-700 italic bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                                            <strong>Excuse Details:</strong> {sub.reasonForMissing}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-[#5b6b7b] italic pl-2">No student submissions yet.</p>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-[#5b6b7b] italic text-center py-6">You have not assigned any homework yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* DAILY ATTENDANCE (class head master only) */}
            {activeTab === 'attendance' && (
              profileData?.isClassTeacher && profileData.classTeacherOf?._id ? (
                <ClassAttendanceSheet classId={profileData.classTeacherOf._id} />
              ) : (
                <div className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-8 text-center text-[#3b4a5c]">
                  <p className="text-lg font-black text-[#1b2837]">{t('You are not a head master')}</p>
                  <p className="mt-2 text-sm">{t('Only the head master of a class takes the daily attendance. Ask the school admin to assign you a class.')}</p>
                </div>
              )
            )}

            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
          <div className="mb-6 space-y-2">
            <h2 className="text-xl font-black text-[#1b2837]">Edit my profile & documents</h2>
            <ProfileEditor />
          </div>
        )}

        {activeTab === 'profile' && profileData && (
              <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-6">
                
                {/* Banner */}
                <div className="flex flex-col md:flex-row items-center gap-6 pb-6 border-b border-[#f7f6f2]">
                  <div className="h-24 w-24 rounded-full bg-[#2a5cac]/10 text-[#2a5cac] flex items-center justify-center font-bold text-3xl">
                    {profileData.name.charAt(0)}
                  </div>
                  <div className="text-center md:text-left space-y-1">
                    <h2 className="text-2xl font-black text-[#1b2837]">{profileData.name}</h2>
                    <p className="text-[#5b6b7b] text-sm font-semibold">Teacher Code: {profileData.staffCode || 'N/A'} | ID: {profileData.employeeId || 'N/A'}</p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                      <span className="bg-[#2a5cac]/10 text-[#2a5cac] text-xs font-bold px-3 py-1 rounded-full">
                        Dept: {profileData.department || 'N/A'}
                      </span>
                      <span className="bg-sky-500/10 text-sky-700 text-xs font-bold px-3 py-1 rounded-full font-mono">
                        Designation: {profileData.designation || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid gap-6 md:grid-cols-2">
                  
                  {/* Category 1: Professional */}
                  <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                    <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                      <GraduationCap className="h-4 w-4" /> Professional Record
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-[#3b4a5c]">
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Employment Type:</span>{profileData.employmentType || 'N/A'}</div>
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Experience:</span>{profileData.experience ? `${profileData.experience} Years` : 'N/A'}</div>
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Joining Date:</span>{profileData.joiningDate ? profileData.joiningDate.split('T')[0] : 'N/A'}</div>
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Previous School:</span>{profileData.previousSchool || 'N/A'}</div>
                      <div className="col-span-2"><span className="font-semibold block text-xs text-[#5b6b7b]">Class Teacher of:</span>{profileData.classTeacherOf ? `Class ${profileData.classTeacherOf.standard || 'N/A'} (${profileData.classTeacherOf.division || 'N/A'})` : 'No Class Assigned'}</div>
                    </div>
                  </div>

                  {/* Category 2: Payroll */}
                  <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                    <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                      <DollarSign className="h-4 w-4" /> Payroll & Banking
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-[#3b4a5c]">
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Bank Name:</span>{profileData.salaryDetails?.bankName || 'N/A'}</div>
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Account Number:</span>{profileData.salaryDetails?.accountNumber || 'N/A'}</div>
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">IFSC Code:</span>{profileData.salaryDetails?.ifscCode || 'N/A'}</div>
                      <div><span className="font-semibold block text-xs text-[#5b6b7b]">Net Salary:</span>Rs. {profileData.salaryDetails?.netSalary || 'N/A'}</div>
                    </div>
                  </div>

                  {/* Category 3: Qualifications */}
                  <div className="col-span-2 rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                    <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                      <Award className="h-4 w-4" /> Academic Qualifications
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {profileData.qualifications && profileData.qualifications.length > 0 ? (
                        profileData.qualifications.map((q, idx) => (
                          <div key={idx} className="border border-[#f7f6f2] p-3 rounded-xl bg-[#ffffff]">
                            <span className="font-bold text-[#1b2837] text-sm block">{q.degree}</span>
                            <span className="text-xs text-[#5b6b7b] block">{q.university || 'N/A'} ({q.year || 'N/A'})</span>
                            <span className="text-xs text-[#5b6b7b] block mt-1 font-semibold">Score: {q.percentageCGPA || 'N/A'}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#5b6b7b] italic">No qualifications listed.</p>
                      )}
                    </div>
                  </div>

                  {/* Category 4: Documents */}
                  <div className="col-span-2 rounded-2xl border border-[#e3e7e7] bg-white p-5 space-y-3">
                    <h3 className="font-bold text-[#2a5cac] flex items-center gap-2 border-b pb-2">
                      <FileText className="h-4 w-4" /> Personal Documents
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      {[
                        ['B-Form / CNIC Copy', profileData.documents?.cnicCopy],
                        ['NTN Certificate', profileData.documents?.ntnCertificate],
                        ['Degree Certificates', profileData.documents?.degreeCertificates],
                        ['Resume', profileData.documents?.resume],
                      ].map(([label, url]) => (
                        <div key={label} className="border border-[#f7f6f2] p-2 rounded-xl bg-[#ffffff] flex justify-between items-center">
                          <span className="font-bold text-[#3b4a5c]">{label}</span>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="bg-[#2a5cac] text-white hover:bg-[#234c91] px-2.5 py-1 rounded-lg font-bold">
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

            {/* GRIEVANCES TAB */}
            {activeTab === 'grievances' && (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                
                {/* Form */}
                <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4">
                  <h2 className="text-xl font-bold text-[#1b2837] flex items-center gap-2">
                    <Send className="h-5 w-5 text-[#2a5cac]" />
                    Raise a Grievance
                  </h2>
                  <p className="text-sm text-[#5b6b7b]">Submit details of your query to the school administrator.</p>

                  <form onSubmit={handleRaiseGrievance} className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Grievance Title *</label>
                      <input
                        type="text"
                        required
                        value={grievanceTitle}
                        onChange={(e) => setGrievanceTitle(e.target.value)}
                        placeholder="E.g., Salary allowance query"
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
                        placeholder="Describe the complaint..."
                        className="w-full h-28 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm outline-none focus:border-[#2a5cac]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#3b4a5c] mb-1">Photo of Issue (Optional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="block w-full text-xs text-[#5b6b7b] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#2a5cac]/10 file:text-[#2a5cac] hover:file:bg-[#2a5cac]/20"
                      />
                      {uploadingPhoto && <p className="text-xs text-amber-600 mt-1">Uploading...</p>}
                      {grievancePhoto && (
                        <p className="text-xs text-green-600 mt-1 font-bold">✓ Upload complete!</p>
                      )}
                    </div>

                    <button type="submit" className="w-full rounded-xl bg-[#2a5cac] py-2.5 text-sm font-bold text-white hover:bg-[#234c91] transition">
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
                              <a href={complaint.attachments[0]} target="_blank" rel="noopener noreferrer" className="text-[10px] underline font-bold text-[#2a5cac]">
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
                      <p className="text-sm text-[#5b6b7b] italic text-center py-6">No complaints raised yet.</p>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TIMETABLE TAB */}
            {activeTab === 'timetable' && (() => {
              const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              
              const getSortedTimeSlots = () => {
                const slotsSet = new Set();
                teacherTimetables.forEach(t => {
                  t.slots?.forEach(s => {
                    if (s.startTime && s.endTime) {
                      if (s.isBreak || (s.teacherId?._id?.toString() === profileData?._id?.toString() || s.teacherId?.toString() === profileData?._id?.toString())) {
                        slotsSet.add(`${s.startTime} - ${s.endTime}`);
                      }
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
                // 1. Check if it is a break
                for (const t of teacherTimetables) {
                  if (t.dayOfWeek?.toLowerCase() === day.toLowerCase()) {
                    const foundBreak = t.slots?.find(s => `${s.startTime} - ${s.endTime}` === slot && s.isBreak);
                    if (foundBreak) {
                      return (
                        <div className="p-2 bg-[#eef2f8]/40 border border-dashed border-[#2a5cac]/40 rounded-xl text-center text-[10px] text-[#5b6b7b] font-extrabold select-none">
                          ☕ {foundBreak.breakName || 'Break'}
                        </div>
                      );
                    }
                  }
                }

                let match = null;
                let className = '';
                for (const t of teacherTimetables) {
                  if (t.dayOfWeek?.toLowerCase() === day.toLowerCase()) {
                    const found = t.slots?.find(s => 
                      `${s.startTime} - ${s.endTime}` === slot && 
                      (s.teacherId?._id?.toString() === profileData?._id?.toString() || s.teacherId?.toString() === profileData?._id?.toString())
                    );
                    if (found) {
                      match = found;
                      className = t.classId ? `Std ${t.classId.standard} (${t.classId.division})` : 'Class';
                      break;
                    }
                  }
                }
                if (!match) return null;
                return (
                  <div className="p-2 bg-[#2a5cac]/5 border border-[#2a5cac]/10 rounded-xl text-center shadow-xs">
                    <p className="font-bold text-[#2a5cac] text-xs leading-tight">{match.subjectId?.name || 'Subject'}</p>
                    <p className="text-[10px] text-[#5b6b7b] mt-1 font-bold">{className}</p>
                  </div>
                );
              };

              return (
                <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 shadow-sm space-y-4 overflow-x-auto printable-timetable">
                  <div className="flex justify-between items-center border-b border-[#e3e7e7]/35 pb-2 no-print">
                    <div>
                      <h2 className="text-xl font-bold text-[#1b2837]">My Class Timetable</h2>
                      <p className="text-xs text-[#5b6b7b]">Weekly class schedule view (Days of Week vs Time Slots)</p>
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
                    <h2 className="text-lg font-bold text-[#2a5cac] mt-1">Teacher Timetable — {profileData?.name || 'My Schedule'}</h2>
                    <p className="text-xs text-[#5b6b7b]">Employee ID: {profileData?.employeeId || ''} | Dept: {profileData?.department || ''}</p>
                  </div>

                  {timeSlots.length > 0 ? (
                    <div className="min-w-[800px] border border-[#e3e7e7] rounded-2xl overflow-hidden bg-white shadow-sm">
                      <table className="w-full text-left border-collapse">
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
                                   for (const t of teacherTimetables) {
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
                                   <td key={slot} className="p-2 border-r border-[#e3e7e7]/40 last:border-r-0 min-w-[150px]">
                                     {cell || (
                                       <div className="p-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center text-[10px] text-gray-300 font-bold">
                                         Free Period
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
                      No scheduled lectures found in the timetable for you yet.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TAB 5: PASSWORD SECURITY */}
            {activeTab === 'staff' && <MyStaffRecord />}
            {activeTab === 'attendanceDesk' && <AttendanceDesk role="teacher" />}
            {activeTab === 'studio' && studioAccess && <DocStudio />}
            {activeTab === 'assessments' && <AssessDesk />}
            {activeTab === 'omr' && <OmrDesk />}
            {activeTab === 'safetyDesk' && <SafetyDesk role="teacher" meId={profileData?._id} />}
            {activeTab === 'earlyYears' && <EarlyDesk />}
            {activeTab === 'timetablePlan' && <TeacherTimetableDesk meId={profileData?._id} />}
            {activeTab === 'today' && <TeacherToday onNavigate={setActiveTab} />}

            {activeTab === 'security' && (
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

          </>
        )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;