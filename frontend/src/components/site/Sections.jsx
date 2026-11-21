import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import apiClient from '../../utils/apiClient';
import useReveal from '../../utils/useReveal';
import { PAKISTAN, TRUST, FAQ, DEMO_LOGINS, DEMO_SCHOOL_CODE, FALLBACK_PLANS } from '../../pages/landing/content';
import { Eyebrow, SectionHead } from './ui';
import { useSite } from './SiteShell';
import { whatsappLink, WHATSAPP_DISPLAY } from './siteData';

const pkr = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;

export function Pakistan() {
  return (
    <section id="pakistan" className="scroll-mt-20 px-5 py-12 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-3xl p-7 text-white lg:p-12" style={{ background: '#0f1b2d' }}>
        <SectionHead light eyebrow="Made for Pakistan" title="It speaks the way your school already works" text="Rupees, JazzCash, CNIC, provinces and Urdu are part of the system, not an afterthought." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAKISTAN.map(({ icon: Icon, title, text }) => (
            <div key={title} className="reveal stagger-in rounded-2xl border p-5" style={{ borderColor: 'rgba(190,210,255,0.22)', background: 'rgba(255,255,255,0.05)' }}>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: '#e0896f', color: '#1b2837' }}><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <h3 className="mt-4 font-extrabold">{title}</h3>
              <p className="mt-2 text-sm leading-6" style={{ color: '#c9d6ea' }}>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 px-5 py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="Safe and in your hands" title="Your school data is separate, protected and downloadable" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <div key={title} className="reveal stagger-in flex gap-4 rounded-2xl border border-[#e3e7e7] bg-white p-5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#eef2f8] text-[#2a5cac]"><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <div><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#3b4a5c]">{text}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Shown only when a school has given written consent for its words to appear.
export function Proof() {
  const [proof, setProof] = useState([]);
  useEffect(() => { apiClient.get('/public/proof').then((r) => setProof(Array.isArray(r.data?.proof) ? r.data.proof : [])).catch(() => {}); }, []);
  useReveal([proof.length]);
  if (!proof.length) return null;
  return (
    <section id="proof" className="px-5 py-16 lg:px-8">
      <div className="mx-auto max-w-7xl"><SectionHead eyebrow="From schools using Aulensia" title="In their words" />
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {proof.map((t, i) => (<figure key={i} className="rounded-2xl border border-[#e3e7e7] bg-white p-6"><blockquote className="text-[#1b2837]">{t.quote}</blockquote><figcaption className="mt-4 text-sm text-[#5b6b7b]"><span className="font-bold text-[#1b2837]">{t.personName}</span>{t.personRole ? `, ${t.personRole}` : ''}<br />{t.schoolName}</figcaption></figure>))}
        </div></div>
    </section>
  );
}

export function Pricing() {
  const navigate = useNavigate(); const { openAsk } = useSite();
  const [yearly, setYearly] = useState(false);
  const [pricing, setPricing] = useState({ plans: FALLBACK_PLANS, offers: [], live: false });
  useEffect(() => {
    let off = false;
    apiClient.get('/public/plans').then((r) => { if (!off && r.data?.plans?.length) setPricing({ plans: r.data.plans, offers: r.data.offers || [], live: true }); }).catch(() => {});
    return () => { off = true; };
  }, []);
  useReveal([pricing.live]);
  const hasYearly = pricing.plans.some((p) => p.yearlyPricePKR > 0);
  const popular = pricing.plans.length >= 3 ? pricing.plans[1].slug : null;
  return (
    <section id="pricing" className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="Pricing" title="Simple plans in rupees" text="Start free. Move up when your school grows. Plans are set by the platform owner, so what you see here is what is on offer today." center />
        {pricing.offers.length > 0 && (
          <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-[#e3b4a4] bg-[#fbf0ec] p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a4636]">Running now</p>
            {pricing.offers.slice(0, 2).map((o) => (
              <p key={o.title} className="mt-2 font-bold text-[#1b2837]">{o.title}
                <span className="ms-2 rounded-lg bg-[#2a5cac] px-2.5 py-0.5 text-xs font-bold text-white">{o.discountType === 'percent' ? `${o.discountValue}% off` : `${pkr(o.discountValue)} off`}</span></p>
            ))}
          </div>
        )}
        {hasYearly && (
          <div className="mt-8 flex justify-center"><div className="inline-flex rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-1">
            {[['Monthly', false], ['Yearly', true]].map(([label, val]) => (
              <button key={label} type="button" onClick={() => setYearly(val)} aria-pressed={yearly === val} className={`rounded-lg px-5 py-2 text-sm font-bold transition ${yearly === val ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c]'}`}>{label}</button>
            ))}
          </div></div>
        )}
        <div className={`mt-8 grid gap-5 ${pricing.plans.length >= 3 ? 'lg:grid-cols-3' : pricing.plans.length === 2 ? 'lg:grid-cols-2' : ''}`}>
          {pricing.plans.map((p) => {
            const star = p.slug === popular; const showYear = yearly && p.yearlyPricePKR > 0; const amount = showYear ? p.yearlyPricePKR : p.pricePKR;
            return (
              <div key={p.slug} className={`relative flex flex-col rounded-2xl border p-7 ${star ? 'border-[#2a5cac] bg-[#2a5cac] text-white shadow-md' : 'border-[#e3e7e7] bg-white'}`}>
                {star && <span className="absolute -top-3 start-7 rounded-lg bg-[#d9826a] px-3 py-1 text-xs font-black text-[#1b2837]">Most popular</span>}
                <h3 className="text-xl font-black">{p.label}</h3>
                <p className={`mt-1 text-sm ${star ? 'text-[#e3e7e7]' : 'text-[#5b6b7b]'}`}>{p.description}</p>
                <p className="mt-5 flex items-baseline gap-1"><span className="text-4xl font-black">{amount === 0 ? 'Free' : pkr(amount)}</span>
                  {amount > 0 && <span className={`text-sm ${star ? 'text-[#e3e7e7]' : 'text-[#5b6b7b]'}`}>{showYear ? 'per year' : 'per month'}</span>}</p>
                <ul className={`mt-5 space-y-1 text-sm font-semibold ${star ? 'text-white' : 'text-[#2b3a4d]'}`}>
                  <li>{p.studentLimit ? `Up to ${p.studentLimit} students` : 'Unlimited students'}</li>
                  <li>{p.teacherLimit ? `Up to ${p.teacherLimit} teachers` : 'Unlimited teachers'}</li>
                </ul>
                <ul className="mt-5 flex-1 space-y-2 border-t border-current/10 pt-5 text-sm">
                  {p.features.map((f) => (<li key={f} className="flex gap-2"><Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${star ? 'text-[#d9826a]' : 'text-[#2a5cac]'}`} aria-hidden="true" /><span>{f}</span></li>))}
                </ul>
                <button type="button" onClick={() => navigate('/register')} className={`mt-7 rounded-lg px-5 py-3 font-bold transition ${star ? 'bg-[#f7f6f2] text-[#2a5cac] hover:bg-white' : 'bg-[#2a5cac] text-white hover:bg-[#234c91]'}`}>Start with {p.label}</button>
                {amount > 0 && <button type="button" onClick={() => openAsk('quote')} className={`mt-2 rounded-lg px-5 py-2 text-sm font-semibold underline-offset-4 hover:underline ${star ? 'text-white' : 'text-[#2a5cac]'}`}>Get a quote for my school</button>}
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-[#5b6b7b]">Every plan includes a separate school code, Urdu and English, and the weekly backup.</p>
      </div>
    </section>
  );
}

export function DemoSection() {
  const navigate = useNavigate();
  return (
    <section id="demo" className="scroll-mt-20 px-5 py-16 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-3xl border border-[#e3e7e7] bg-white p-7 lg:grid-cols-2 lg:p-10">
        <div>
          <Eyebrow>Try it yourself</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">Log in to a demo school</h2>
          <p className="mt-4 leading-7 text-[#3b4a5c]">Look around a sample school with real-looking classes, students and fees. Use the school code and any login below. It is shared demo data, so please do not enter real information.</p>
          <button type="button" onClick={() => navigate('/login')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#2a5cac] px-6 py-3 font-semibold text-white transition hover:bg-[#234c91]">Go to login <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button>
        </div>
        <div className="rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] p-5" dir="ltr" data-no-i18n>
          <p className="text-sm text-[#5b6b7b]">School code</p>
          <p className="mt-1 font-mono text-2xl font-black text-[#2a5cac]">{DEMO_SCHOOL_CODE}</p>
          <div className="mt-4 divide-y divide-[#e3e7e7] text-sm">
            {DEMO_LOGINS.map((d) => (<div key={d.role} className="grid grid-cols-[5rem_1fr] gap-x-3 py-3"><span className="font-bold text-[#1b2837]">{d.role}</span><span className="break-all font-mono text-[#3b4a5c]">{d.email}<br />{d.password}</span></div>))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 px-5 py-16 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <SectionHead eyebrow="Questions" title="Common questions, plain answers" center />
        <div className="mt-8 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-[#e3e7e7] bg-white px-5 py-4 open:bg-[#f7f6f2]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold"><span>{f.q}</span><ChevronDown className="h-5 w-5 flex-shrink-0 text-[#2a5cac] transition group-open:rotate-180" aria-hidden="true" /></summary>
              <p className="mt-3 leading-7 text-[#3b4a5c]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  const navigate = useNavigate(); const { openAsk } = useSite();
  return (
    <section className="px-5 pb-16 pt-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-3xl p-8 text-center text-white lg:p-14" style={{ background: 'linear-gradient(135deg,#2a5cac,#1d3c78)' }}>
        <h2 className="mx-auto max-w-3xl font-display text-3xl font-bold leading-tight sm:text-4xl">Give your school one place to work from.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[#dbe6fb]">Register in a minute, start on the Free plan, and upgrade only when you need to.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => navigate('/register')} className="inline-flex items-center gap-2 rounded-lg bg-[#d9826a] px-7 py-3 font-bold text-[#1b2837] transition hover:brightness-110">Register your school <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button>
          <button type="button" onClick={() => openAsk('demo')} className="rounded-lg border border-[#c9d6ea] px-7 py-3 font-bold transition hover:bg-white/10">Request a Demo</button>
          <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" data-no-i18n className="inline-flex items-center gap-2 rounded-lg border border-[#c9d6ea] px-6 py-3 font-bold transition hover:bg-white/10" aria-label={`Chat on WhatsApp ${WHATSAPP_DISPLAY}`}><FaWhatsapp className="h-5 w-5" aria-hidden="true" /> <bdi dir="ltr">{WHATSAPP_DISPLAY}</bdi></a>
        </div>
      </div>
    </section>
  );
}
