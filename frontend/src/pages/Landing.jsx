import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  GraduationCap,
  Inbox,
  MessageSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import LanguageToggle from '../components/LanguageToggle';
import Logo from '../components/Logo';

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useSelector((state) => state.auth);

  const services = [
    {
      icon: Users,
      title: 'Student records',
      text: 'Keep admission details, class data, attendance and progress in one place.',
    },
    {
      icon: GraduationCap,
      title: 'Teacher tools',
      text: 'Assign classes, manage subjects, take attendance and enter marks without extra steps.',
    },
    {
      icon: Bell,
      title: 'Notices and alerts',
      text: 'Share announcements, reminders and updates with students, teachers and parents.',
    },
    {
      icon: MessageSquare,
      title: 'Communication',
      text: 'Use complaints, messages and replies to keep school communication clear.',
    },
  ];

  const issues = [
    'Manual registers make attendance and marks hard to track.',
    'Separate systems for students, teachers and notices waste time.',
    'School data gets mixed when there is no proper role-based access.',
    'Parents and students need a simple place to check updates and homework.',
  ];

  const platformPoints = [
    'One login for admin, teacher and student roles.',
    'Multi-school setup with separate data for each school.',
    'Cleaner workflows for attendance, marks, timetable and homework.',
    'Simple dashboard style screens that are easy to understand.',
  ];

  return (
    <div className="min-h-screen bg-[#e9f2ed] text-[#0c2f25]">
      <div className="fixed end-4 bottom-4 z-50"><LanguageToggle /></div>
      {!isAuthenticated && (
        <nav className="sticky top-0 z-30 border-b border-[#aec7ba] bg-[#edf5f0]/95 backdrop-blur-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
            <Logo subtitle="School management system for Pakistan" />

            <div className="hidden items-center gap-2 md:flex">
              <button onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full px-4 py-2 text-sm font-semibold text-[#355e4d] transition hover:bg-[#e1eee6]">
                About Us
              </button>
              <button onClick={() => document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full px-4 py-2 text-sm font-semibold text-[#355e4d] transition hover:bg-[#e1eee6]">
                Platform
              </button>
              <button onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full px-4 py-2 text-sm font-semibold text-[#355e4d] transition hover:bg-[#e1eee6]">
                Services
              </button>
              <button onClick={() => navigate('/login')} className="rounded-full border border-[#2f8f6f] px-4 py-2 text-sm font-semibold text-[#0f6b4f] transition hover:bg-[#e3efe8]">
                Login
              </button>
            </div>
          </div>
        </nav>
      )}

      <section className="px-5 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#aec7ba] bg-[#e8f2ec] px-4 py-2 text-sm text-[#0f6b4f]">
              <span className="h-2 w-2 rounded-full bg-[#0f6b4f]" />
              Simple school management for daily use
            </div>
            <h1 className="mt-6 max-w-2xl text-5xl font-black leading-tight tracking-tight lg:text-6xl">
              A school platform that keeps admin work, teachers and students in one easy system.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#355e4d]">
              Darsgah is a school management platform built for Pakistan: attendance, marks, notices, homework, fees in PKR with JazzCash / Easypaisa / bank proof, and parent communication, in English and Urdu.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <button onClick={() => navigate('/register')} className="inline-flex items-center gap-2 rounded-full bg-[#0f6b4f] px-6 py-3 font-semibold text-[#edf5f0] transition hover:bg-[#0b5340]">
                Register School
                <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => navigate('/login')} className="inline-flex items-center gap-2 rounded-full border border-[#2f8f6f] bg-[#edf5f0] px-6 py-3 font-semibold text-[#0f6b4f] transition hover:bg-[#e3efe8]">
                Login
              </button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['3', 'User roles'],
                ['15+', 'Backend models'],
                ['14+', 'Route groups'],
                ['1', 'Multi-school system'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-3xl border border-[#cfe0d6] bg-[#f4f8f5] p-4">
                  <p className="text-3xl font-black text-[#0f6b4f]">{value}</p>
                  <p className="mt-1 text-sm text-[#355e4d]">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#cfe0d6] bg-[#f7fbf8] p-5 shadow-lg shadow-[#2f8f6f]/15">
            <div className="rounded-[1.5rem] border border-[#d3e4da] bg-[#fbfdfb] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#4f7262]">What this platform does</p>
                  <h2 className="text-2xl font-extrabold text-[#0c2f25]">One place for school operations</h2>
                </div>
                <div className="rounded-2xl bg-[#e3efe8] px-3 py-2 text-sm font-semibold text-[#0f6b4f]">
                  Easy to use
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Attendance', ClipboardList],
                  ['Marks', BarChart3],
                  ['Notices', Bell],
                  ['Messages', Inbox],
                ].map(([label, Icon]) => (
                  <div key={label} className="rounded-2xl border border-[#dbe9e1] bg-[#edf5f0] p-4">
                    <Icon className="h-5 w-5 text-[#0f6b4f]" />
                    <p className="mt-3 font-semibold text-[#0c2f25]">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-[#d3e4da] bg-[#e9f2ed] p-4">
                <p className="text-sm font-semibold text-[#0f6b4f]">Login</p>
                <p className="mt-2 text-sm leading-6 text-[#355e4d]">
                  Use the login page to enter the school code, email and password. Each role sees only the parts it should use.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-[#cfe0d6] bg-[#f7fbf8] p-6 lg:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4f7262]">About Us</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[#0c2f25]">Built for normal school work, not for show.</h2>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-[#355e4d]">
            This platform is made to handle the repeated tasks schools do every day. It keeps student records, teacher actions, notices and school communication together so the system feels simple instead of scattered.
          </p>
        </div>
      </section>

      <section id="platform" className="px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4f7262]">What is this platform</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-[#0c2f25]">A multi-school management system for admins, teachers and students.</h2>
            <p className="mt-4 text-lg leading-8 text-[#355e4d]">
              It works like a shared dashboard for the whole school, with role-based access so every user sees only what matters to them.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {platformPoints.map((point) => (
              <div key={point} className="rounded-3xl border border-[#cfe0d6] bg-[#fbfdfb] p-5">
                <CheckCircle className="h-5 w-5 text-[#0f6b4f]" />
                <p className="mt-3 text-sm leading-6 text-[#355e4d]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-[#cfe0d6] bg-[#f7fbf8] p-6 lg:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4f7262]">What issues it solves</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0c2f25]">It replaces the slow, messy parts of school admin.</h2>
            <div className="mt-5 space-y-4">
              {issues.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl bg-[#edf5f0] px-4 py-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#0f6b4f]" />
                  <p className="text-sm leading-6 text-[#355e4d]">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#cfe0d6] bg-[#f7fbf8] p-6 lg:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4f7262]">Login</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0c2f25]">The login page is the entry point for the whole app.</h2>
            <p className="mt-4 text-lg leading-8 text-[#355e4d]">
              Admins register the school first, then use login to access the dashboard. Teachers and students use the same base system with their own role permissions.
            </p>
            <button onClick={() => navigate('/login')} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0f6b4f] px-6 py-3 font-semibold text-[#edf5f0] transition hover:bg-[#0b5340]">
              Go to Login
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section id="services" className="px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4f7262]">Services</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-[#0c2f25]">The platform gives the services a school usually needs every week.</h2>
            <p className="mt-4 text-lg leading-8 text-[#355e4d]">
              Instead of jumping between tools, the school can use one system for records, communication and daily updates.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <div key={service.title} className="rounded-[1.75rem] border border-[#cfe0d6] bg-[#fbfdfb] p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f2ec] text-[#0f6b4f]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-[#0c2f25]">{service.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#355e4d]">{service.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-[#cfe0d6] bg-[#0f6b4f] p-8 text-[#edf5f0]">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#e3efe8]">Start here</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight">Login, register and manage the school from one place.</h2>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[#e3efe8]">
                The app is built for direct school work, with a clear landing page that explains what it does before the user logs in.
              </p>
            </div>
            <button onClick={() => navigate('/register')} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#edf5f0] px-6 py-3 font-semibold text-[#0f6b4f] transition hover:bg-white">
              Register School
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}