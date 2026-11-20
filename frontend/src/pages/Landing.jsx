import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowRight, BarChart3, Bell, Check, ChevronDown, CheckCircle, Menu, X, XCircle, UserCheck, Wallet,
} from 'lucide-react';
import LanguageToggle from '../components/LanguageToggle';
import Logo from '../components/Logo';
import apiClient from '../utils/apiClient';
import useReveal from '../utils/useReveal';
import DemoRequest, { captureCampaign } from '../components/DemoRequest';
import {
  NAV, HERO_CHIPS, STATS, BEFORE_AFTER, MODULES, ROLES, STEPS, PAKISTAN, TRUST, FAQ,
  DEMO_LOGINS, DEMO_SCHOOL_CODE, FALLBACK_PLANS, ROADMAP,
} from './landing/content';

const pkr = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const Eyebrow = ({ children }) => (
  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#b86650]">{children}</p>
);

const SectionHead = ({ eyebrow, title, text, center }) => (
  <div className={`reveal max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-[#1b2837] sm:text-4xl">{title}</h2>
    {text && <p className="mt-4 text-lg leading-8 text-[#3b4a5c]">{text}</p>}
  </div>
);

/* A small, honest picture of what the admin dashboard looks like. Numbers are samples. */
const DashboardPreview = () => (
  <div className="rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] p-3 shadow-md">
    <div className="flex items-center gap-1.5 px-2 pb-3 pt-1">
      <span className="h-2.5 w-2.5 rounded-full bg-[#c0483a]/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#d9826a]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#2c776c]" />
      <span className="ms-3 rounded-lg bg-[#f7f6f2] px-3 py-1 text-[11px] font-semibold text-[#5b6b7b]">Admin dashboard · sample</span>
    </div>
    <div className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Students', '482', UserCheck],
          ['Present today', '94%', CheckCircle],
          ['Fees received', 'Rs 1.2M', Wallet],
        ].map(([label, value, Icon]) => (
          <div key={label} className="rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3">
            <Icon className="h-4 w-4 text-[#2a5cac]" />
            <p className="mt-2 text-lg font-black text-[#1b2837] sm:text-xl">{value}</p>
            <p className="text-[11px] text-[#5b6b7b]">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-[#e3e7e7] p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[#1b2837]">Attendance this week</p>
          <BarChart3 className="h-4 w-4 text-[#2a5cac]" />
        </div>
        <div className="mt-3 flex h-24 items-end gap-2">
          {[92, 95, 90, 96, 94, 88].map((h, i) => (
            <div key={i} className="bar-grow flex-1 rounded-t-md bg-[#2a5cac]" style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div className="mt-1 flex gap-2 text-[10px] text-[#5b6b7b]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d} className="flex-1 text-center">{d}</span>)}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#fbf0ec] p-3">
        <Bell className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#b86650]" />
        <div>
          <p className="text-xs font-bold text-[#1b2837]">New notice: Parent–teacher meeting</p>
          <p className="text-[11px] text-[#7a4a3d]">Sent to parents and teachers</p>
        </div>
      </div>
    </div>
  </div>
);

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [menu, setMenu] = useState(false);
  const [role, setRole] = useState('admin');
  const [yearly, setYearly] = useState(false);
  const [pricing, setPricing] = useState({ plans: FALLBACK_PLANS, offers: [], live: false });
  const [ask, setAsk] = useState(null); // 'demo' | 'quote' | 'question' while the request form is open
  const [proof, setProof] = useState([]); // only real, consented customer words; empty means the section is not shown
  useEffect(() => { captureCampaign(); apiClient.get('/public/proof').then((r) => setProof(Array.isArray(r.data?.proof) ? r.data.proof : [])).catch(() => {}); }, []);

  useEffect(() => {
    let off = false;
    apiClient.get('/public/plans')
      .then((r) => { if (!off && r.data?.plans?.length) setPricing({ plans: r.data.plans, offers: r.data.offers || [], live: true }); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  useReveal([pricing.live]);

  const activeRole = useMemo(() => ROLES.find((r) => r.id === role) || ROLES[0], [role]);
  const hasYearly = pricing.plans.some((p) => p.yearlyPricePKR > 0);
  const popular = pricing.plans.length >= 3 ? pricing.plans[1].slug : null;

  const jump = (id) => { setMenu(false); goTo(id); };

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-[#1b2837]">
      <div className="fixed end-4 bottom-4 z-50"><LanguageToggle /></div>

      {/* ───────── Top bar ───────── */}
      {!isAuthenticated && (
        <header className="sticky top-0 z-40 border-b border-[#a9b4bf] bg-[#f7f6f2]/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Aulensia home" className="text-start">
              <Logo subtitle="School management system for Pakistan" />
            </button>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => jump(n.id)} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#3b4a5c] transition hover:bg-[#eef2f8]">{n.label}</button>
              ))}
            </nav>
            <div className="hidden items-center gap-2 lg:flex">
              <button onClick={() => navigate('/agent/login')} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#3b4a5c] transition hover:bg-[#eef2f8]">Partner sign-in</button>
              <button onClick={() => navigate('/login')} className="rounded-lg border border-[#2a5cac] px-4 py-2 text-sm font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8]">Login</button>
              <button onClick={() => navigate('/register')} className="rounded-lg bg-[#2a5cac] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#234c91]">Register School</button>
            </div>
            <button onClick={() => setMenu((v) => !v)} className="rounded-xl border border-[#a9b4bf] p-2 text-[#2a5cac] lg:hidden" aria-label="Menu" aria-expanded={menu}>
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {menu && (
            <div className="border-t border-[#e3e7e7] bg-[#f7f6f2] px-5 pb-4 lg:hidden">
              <div className="grid gap-1 py-3">
                {NAV.map((n) => (
                  <button key={n.id} onClick={() => jump(n.id)} className="rounded-xl px-3 py-3 text-start text-sm font-semibold text-[#3b4a5c] hover:bg-[#eef2f8]">{n.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => navigate('/login')} className="rounded-lg border border-[#2a5cac] px-4 py-3 text-sm font-semibold text-[#2a5cac]">Login</button>
                <button onClick={() => navigate('/register')} className="rounded-lg bg-[#2a5cac] px-4 py-3 text-sm font-semibold text-white">Register School</button>
              </div>
            </div>
          )}
        </header>
      )}

      {/* ───────── Hero ───────── */}
      <section className="px-5 pb-14 pt-12 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#b86650]">Built in Pakistan, for Pakistani schools</p>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Run your whole school from one simple place.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#3b4a5c]">
              Aulensia brings attendance, marks, homework, fees, notices and parent updates together. Admin, teachers, students and parents each get their own easy screen, in English and Urdu.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => navigate('/register')} className="inline-flex items-center gap-2 rounded-lg bg-[#2a5cac] px-6 py-3 font-semibold text-white transition hover:bg-[#234c91]">
                Register your school <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </button>
              <button onClick={() => setAsk('demo')} className="inline-flex items-center gap-2 rounded-lg border border-[#2a5cac] bg-[#f7f6f2] px-6 py-3 font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8]">
                Book a demo
              </button>
              <button onClick={() => jump('features')} className="inline-flex items-center gap-2 rounded-lg border border-[#a9b4bf] bg-[#f7f6f2] px-6 py-3 font-semibold text-[#3b4a5c] transition hover:bg-[#eef2f8]">
                See all features
              </button>
              <button onClick={() => jump('demo')} className="inline-flex items-center gap-2 rounded-lg px-4 py-3 font-semibold text-[#3b4a5c] transition hover:bg-[#eef2f8]">
                Try the demo
              </button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2">
              {HERO_CHIPS.map((c) => (
                <li key={c} className="rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-1.5 text-sm font-semibold text-[#3b4a5c]">{c}</li>
              ))}
            </ul>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* ───────── Numbers ───────── */}
      <section className="px-5 pb-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-3xl border border-[#e3e7e7] bg-[#f7f6f2] p-4 sm:p-5">
              <p className="text-3xl font-black text-[#2a5cac] sm:text-4xl"><span dir="ltr" className="inline-block">{s.value}</span></p>
              <p className="mt-1 font-bold">{s.label}</p>
              <p className="mt-1 text-sm text-[#5b6b7b]">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── Before / after ───────── */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Why a school needs it" title="From scattered registers to one clear system" text="Most schools already do all of this work. Aulensia just puts it in one place so nothing is lost and nobody has to ask twice." />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e0c9c5] bg-[#fbf5f3] p-6">
              <p className="font-black text-[#a8392d]">Without it</p>
              <ul className="mt-4 space-y-3">
                {BEFORE_AFTER.before.map((t) => (
                  <li key={t} className="flex gap-3 text-[#5b3b36]"><XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#c0483a]" /><span>{t}</span></li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#a9b4bf] bg-[#f7f6f2] p-6">
              <p className="font-black text-[#2a5cac]">With Aulensia</p>
              <ul className="mt-4 space-y-3">
                {BEFORE_AFTER.after.map((t) => (
                  <li key={t} className="flex gap-3 text-[#2b3a4d]"><CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#2a5cac]" /><span>{t}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Features" title="Everything a school does every week" text="Twelve modules that work together. Each one is simple on its own, and they share the same student records." />
          <div className="stagger-in mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2f8] text-[#2a5cac]"><Icon className="h-6 w-6" /></div>
                <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#3b4a5c]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Roles ───────── */}
      <section id="roles" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Who uses it" title="A clear screen for every person in the school" text="Pick a role to see exactly what that person can do." />
          <div role="tablist" aria-label="Roles" className="mt-8 flex gap-2 overflow-x-auto pb-2">
            {ROLES.map((r) => {
              const Icon = r.icon; const on = r.id === role;
              return (
                <button key={r.id} role="tab" aria-selected={on} onClick={() => setRole(r.id)}
                  className={`inline-flex flex-shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition ${on ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-[#f7f6f2] text-[#3b4a5c] hover:bg-[#eef2f8]'}`}>
                  <Icon className="h-4 w-4" />{r.tab}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" className="mt-4 grid gap-6 rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] p-6 lg:grid-cols-[0.8fr_1.2fr] lg:p-8">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2a5cac] text-white"><activeRole.icon className="h-7 w-7" /></div>
              <h3 className="mt-5 text-2xl font-black leading-tight">{activeRole.headline}</h3>
              <p className="mt-3 leading-7 text-[#3b4a5c]">{activeRole.text}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {activeRole.points.map((p) => (
                <li key={p} className="flex gap-3 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-4 text-sm leading-6 text-[#2b3a4d]">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#2a5cac]" /><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="How it works" title="Up and running in four steps" center />
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2a5cac] text-lg font-black text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-extrabold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#3b4a5c]">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── Pakistan ───────── */}
      <section id="pakistan" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl bg-[#1b2837] p-7 text-white lg:p-12">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#d9826a]">Made for Pakistan</p>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">It speaks the way your school already works</h2>
            <p className="mt-4 text-lg leading-8 text-[#c9d6ea]">Rupees, JazzCash, CNIC, provinces and Urdu are part of the system, not an afterthought.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PAKISTAN.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-3xl border border-[#234c91] bg-[#223246] p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d9826a] text-[#1b2837]"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-4 font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#c9d6ea]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Trust ───────── */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Safe and in your hands" title="Your school data is separate, protected and downloadable" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-[#e3e7e7] bg-[#ffffff] p-5">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#eef2f8] text-[#2a5cac]"><Icon className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-extrabold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#3b4a5c]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Roadmap ───────── */}
      <section id="roadmap" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Roadmap" title="What is live today and what we are building next" text="Phase 1 is working now. Phases 2 and 3 are on the way." />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {ROADMAP.map((ph) => {
              const badge = ph.tone === 'live' ? 'bg-[#2a5cac] text-white' : ph.tone === 'next' ? 'bg-[#d9826a] text-[#1b2837]' : 'bg-[#eef2f8] text-[#3b4a5c]';
              return (
                <div key={ph.phase} className={`flex flex-col rounded-2xl border p-6 ${ph.tone === 'live' ? 'border-[#2a5cac] bg-[#f7f6f2]' : 'border-[#e3e7e7] bg-[#ffffff]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-wider text-[#5b6b7b]">{ph.phase}</p>
                    <span className={`rounded-lg px-3 py-1 text-xs font-bold ${badge}`}>{ph.status}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-black leading-snug">{ph.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#3b4a5c]">{ph.text}</p>
                  <ul className="mt-5 space-y-3">
                    {ph.items.map(({ icon: Icon, t }) => (
                      <li key={t} className="flex gap-3 text-sm leading-6 text-[#2b3a4d]">
                        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#eef2f8] text-[#2a5cac]"><Icon className="h-4 w-4" /></span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── What schools say: shown only when the owner holds consent for each entry ───────── */}
      {proof.length > 0 && (
        <section id="proof" className="px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl"><SectionHead eyebrow="From schools using Aulensia" title="In their words" />
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {proof.map((t, i) => (<figure key={i} className="rounded-2xl border border-[#e3e7e7] bg-white p-6"><blockquote className="text-[#1b2837]">{t.quote}</blockquote><figcaption className="mt-4 text-sm text-[#5b6b7b]"><span className="font-bold text-[#1b2837]">{t.personName}</span>{t.personRole ? `, ${t.personRole}` : ''}<br />{t.schoolName}</figcaption></figure>))}
            </div></div>
        </section>
      )}

      {/* ───────── Pricing ───────── */}
      <section id="pricing" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="Pricing" title="Simple plans in rupees" text="Start free. Move up when your school grows. Plans are set by the platform owner, so what you see here is what is on offer today." center />

          {pricing.offers.length > 0 && (
            <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-[#e3b4a4] bg-[#fbf0ec] p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b86650]">Running now</p>
              {pricing.offers.slice(0, 2).map((o) => (
                <p key={o.title} className="mt-2 font-bold text-[#1b2837]">
                  {o.title}
                  <span className="ms-2 rounded-lg bg-[#2a5cac] px-2.5 py-0.5 text-xs font-bold text-white">
                    {o.discountType === 'percent' ? `${o.discountValue}% off` : `${pkr(o.discountValue)} off`}
                  </span>
                </p>
              ))}
            </div>
          )}

          {hasYearly && (
            <div className="mt-8 flex justify-center">
              <div className="inline-flex rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-1">
                {[['Monthly', false], ['Yearly', true]].map(([label, val]) => (
                  <button key={label} onClick={() => setYearly(val)} aria-pressed={yearly === val}
                    className={`rounded-lg px-5 py-2 text-sm font-bold transition ${yearly === val ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c]'}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          <div className={`mt-8 grid gap-5 ${pricing.plans.length >= 3 ? 'lg:grid-cols-3' : pricing.plans.length === 2 ? 'lg:grid-cols-2' : ''}`}>
            {pricing.plans.map((p) => {
              const star = p.slug === popular;
              const showYear = yearly && p.yearlyPricePKR > 0;
              const amount = showYear ? p.yearlyPricePKR : p.pricePKR;
              return (
                <div key={p.slug} className={`relative flex flex-col rounded-2xl border p-7 ${star ? 'border-[#2a5cac] bg-[#2a5cac] text-white shadow-md' : 'border-[#e3e7e7] bg-[#ffffff]'}`}>
                  {star && <span className="absolute -top-3 start-7 rounded-lg bg-[#d9826a] px-3 py-1 text-xs font-black text-[#1b2837]">Most popular</span>}
                  <h3 className="text-xl font-black">{p.label}</h3>
                  <p className={`mt-1 text-sm ${star ? 'text-[#e3e7e7]' : 'text-[#5b6b7b]'}`}>{p.description}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-black">{amount === 0 ? 'Free' : pkr(amount)}</span>
                    {amount > 0 && <span className={`text-sm ${star ? 'text-[#e3e7e7]' : 'text-[#5b6b7b]'}`}>{showYear ? 'per year' : 'per month'}</span>}
                  </p>
                  <ul className={`mt-5 space-y-1 text-sm font-semibold ${star ? 'text-white' : 'text-[#2b3a4d]'}`}>
                    <li>{p.studentLimit ? `Up to ${p.studentLimit} students` : 'Unlimited students'}</li>
                    <li>{p.teacherLimit ? `Up to ${p.teacherLimit} teachers` : 'Unlimited teachers'}</li>
                  </ul>
                  <ul className="mt-5 flex-1 space-y-2 border-t border-current/10 pt-5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2"><Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${star ? 'text-[#d9826a]' : 'text-[#2a5cac]'}`} /><span>{f}</span></li>
                    ))}
                  </ul>
                  <button onClick={() => navigate('/register')}
                    className={`mt-7 rounded-lg px-5 py-3 font-bold transition ${star ? 'bg-[#f7f6f2] text-[#2a5cac] hover:bg-white' : 'bg-[#2a5cac] text-white hover:bg-[#234c91]'}`}>
                    Start with {p.label}
                  </button>
                  {amount > 0 && <button onClick={() => setAsk('quote')} className={`mt-2 rounded-lg px-5 py-2 text-sm font-semibold underline-offset-4 hover:underline ${star ? 'text-white' : 'text-[#2a5cac]'}`}>Get a quote for my school</button>}
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-sm text-[#5b6b7b]">Every plan includes a separate school code, Urdu and English, and the weekly backup.</p>
        </div>
      </section>

      {/* ───────── Demo ───────── */}
      <section id="demo" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] p-7 lg:grid-cols-[1fr_1fr] lg:p-10">
          <div>
            <Eyebrow>Try it yourself</Eyebrow>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Log in to a demo school</h2>
            <p className="mt-4 leading-7 text-[#3b4a5c]">
              Look around a sample school with real-looking classes, students and fees. Use the school code and any login below. It is shared demo data, so please do not enter real information.
            </p>
            <button onClick={() => navigate('/login')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#2a5cac] px-6 py-3 font-semibold text-white transition hover:bg-[#234c91]">
              Go to login <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
          <div className="rounded-3xl border border-[#e3e7e7] bg-[#ffffff] p-5" dir="ltr" data-no-i18n>
            <p className="text-sm text-[#5b6b7b]">School code</p>
            <p className="mt-1 font-mono text-2xl font-black text-[#2a5cac]">{DEMO_SCHOOL_CODE}</p>
            <div className="mt-4 divide-y divide-[#eef2f8] text-sm">
              {DEMO_LOGINS.map((d) => (
                <div key={d.role} className="grid grid-cols-[5rem_1fr] gap-x-3 py-3">
                  <span className="font-bold text-[#1b2837]">{d.role}</span>
                  <span className="break-all font-mono text-[#3b4a5c]">{d.email}<br />{d.password}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="scroll-mt-20 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionHead eyebrow="Questions" title="Common questions, plain answers" center />
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-[#e3e7e7] bg-[#ffffff] px-5 py-4 open:bg-[#f7f6f2]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                  <span>{f.q}</span>
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-[#2a5cac] transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 leading-7 text-[#3b4a5c]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Final call ───────── */}
      <section className="px-5 pb-16 pt-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl bg-[#2a5cac] p-8 text-center text-white lg:p-14">
          <h2 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-4xl">Give your school one place to work from.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[#e3e7e7]">Register in a minute, start on the Free plan, and upgrade only when you need to.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={() => navigate('/register')} className="inline-flex items-center gap-2 rounded-lg bg-[#d9826a] px-7 py-3 font-bold text-[#1b2837] transition hover:bg-[#d9826a]">
              Register your school <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </button>
            <button onClick={() => setAsk('demo')} className="rounded-lg border border-[#c9d6ea] px-7 py-3 font-bold transition hover:bg-[#234c91]">Book a demo</button>
            <button onClick={() => navigate('/login')} className="rounded-lg border border-[#c9d6ea] px-7 py-3 font-bold transition hover:bg-[#234c91]">Login</button>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-[#a9b4bf] bg-[#f7f6f2] px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo subtitle="School management system for Pakistan" />
            <p className="mt-4 text-sm leading-6 text-[#5b6b7b]">Attendance, marks, homework, fees and parent updates for schools in Pakistan.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm font-semibold text-[#3b4a5c]">
            {NAV.map((n) => (<button key={n.id} onClick={() => goTo(n.id)} className="text-start hover:text-[#2a5cac]">{n.label}</button>))}
            <button onClick={() => navigate('/login')} className="text-start hover:text-[#2a5cac]">Login</button>
            <button onClick={() => navigate('/register')} className="text-start hover:text-[#2a5cac]">Register School</button>
            <button onClick={() => navigate('/agent/login')} className="text-start hover:text-[#2a5cac]">Partner sign-in</button>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-7xl border-t border-[#e3e7e7] pt-5 text-sm text-[#5b6b7b]">© 2026 Aulensia. All rights reserved.</p>
      </footer>
      <DemoRequest open={!!ask} interest={ask || 'demo'} onClose={() => setAsk(null)} />
    </div>
  );
}
