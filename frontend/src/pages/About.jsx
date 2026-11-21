import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import SiteShell, { useSite } from '../components/site/SiteShell';
import SiteIcon from '../components/site/SiteIcon';
import { Eyebrow, SectionHead } from '../components/site/ui';
import { Pakistan, Trust } from '../components/site/Sections';
import { CATEGORIES, PRINCIPLES, WHATSAPP_DISPLAY, whatsappLink } from '../components/site/siteData';
import useReveal from '../utils/useReveal';

const FACTS = [
  [String(CATEGORIES.length), 'parts of school life in one platform'],
  ['6', 'kinds of sign-in: owner, administrator, teacher, parent, student and partner'],
  ['2', 'languages, English and Urdu, right to left included'],
  ['100%', 'separate data for every school'],
];
const STEPS = [
  ['Set up', 'Register your school, bring in your classes and students from a sheet, and choose who can do what.'],
  ['Run the day', 'Teachers take attendance and enter marks. The office handles fees and notices. Everyone works from the same record.'],
  ['Stay informed', 'Parents see attendance, fees and notices on their phone. Leaders see what needs attention first.'],
];

function Body() {
  const { openAsk } = useSite();
  useReveal([]);
  return (
    <>
      <section className="relative overflow-hidden px-5 py-16 text-white lg:px-8 lg:py-24" style={{ background: 'radial-gradient(ellipse 70% 80% at 80% 20%, #1d3c78 0%, #0f1b2d 65%)' }}>
        <div className="mx-auto max-w-4xl">
          <Eyebrow light>About us</Eyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">We are building one calm place for the whole school.</h1>
          <p className="mt-6 text-lg leading-8" style={{ color: '#c9d6ea' }}>Aulensia is a school management system made in Pakistan. It brings admissions, classes, attendance, exams, fees, staff, families and campus life together, so teachers spend their time teaching and parents always know what is happening.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => openAsk('demo')} className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold" style={{ background: '#e0896f', color: '#1b2837' }}>Request a Demo <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button>
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" data-no-i18n className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 font-semibold" style={{ borderColor: 'rgba(200,215,245,0.5)' }} aria-label={`Chat on WhatsApp ${WHATSAPP_DISPLAY}`}><FaWhatsapp className="h-5 w-5" aria-hidden="true" /> <bdi dir="ltr">{WHATSAPP_DISPLAY}</bdi></a>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
          <div className="reveal">
            <Eyebrow>Why we exist</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">Schools already do the work. The tools should keep up.</h2>
            <p className="mt-4 leading-7 text-[#3b4a5c]">Many schools still run on paper registers, fee spreadsheets and chat groups. Each piece works alone, but nobody sees the whole picture. We built Aulensia so the same facts reach everyone who needs them, with a clear record of who changed what.</p>
            <p className="mt-4 leading-7 text-[#3b4a5c]">We start from how Pakistani schools really work: fees in rupees, payment proofs from mobile wallets, CNIC and B-Form numbers, provinces, and families who read Urdu as easily as English.</p>
          </div>
          <dl className="reveal grid grid-cols-2 gap-4">
            {FACTS.map(([v, l]) => (<div key={l} className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><dt className="font-display text-4xl font-bold text-[#2a5cac]">{v}</dt><dd className="mt-1 text-sm leading-5 text-[#3b4a5c]">{l}</dd></div>))}
          </dl>
        </div>
      </section>

      <section className="px-5 py-12 lg:px-8" style={{ background: '#eef2f8' }}>
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="What we believe" title="Principles we build by" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.t} className="reveal stagger-in rounded-2xl border border-[#d5dbe0] bg-white p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2f8] text-[#2a5cac]"><SiteIcon name={p.icon} /></span>
                <h3 className="mt-4 font-bold">{p.t}</h3><p className="mt-1.5 text-sm leading-6 text-[#3b4a5c]">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="What it covers" title="Everything a school does, in one place" />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <li key={c.id} className="reveal stagger-in flex gap-3 rounded-2xl border border-[#e3e7e7] bg-white p-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: c.color }}><SiteIcon name={c.icon} className="h-5 w-5" /></span>
                <div><p className="font-bold">{c.title}</p><p className="mt-0.5 text-sm leading-5 text-[#3b4a5c]">{c.intro}</p></div>
              </li>
            ))}
          </ul>
          <p className="mt-6"><Link to="/#platform" className="font-semibold text-[#2a5cac] underline underline-offset-4">Explore the platform on the home page</Link></p>
        </div>
      </section>

      <section className="px-5 pb-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="How it works" title="Three simple stages" />
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map(([t, d], i) => (<li key={t} className="reveal stagger-in rounded-2xl border border-[#e3e7e7] bg-white p-6"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2a5cac] font-bold text-white">{i + 1}</span><h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-2 text-sm leading-6 text-[#3b4a5c]">{d}</p></li>))}
          </ol>
        </div>
      </section>

      <Pakistan />
      <Trust />

      <section className="px-5 pb-16 pt-4 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-[#d5dbe0] bg-white p-8 text-center lg:p-12">
          <h2 className="font-display text-3xl font-bold">Talk to us</h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-[#3b4a5c]">Tell us about your school and we will show you how Aulensia would fit. The quickest way to reach us is WhatsApp.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href={whatsappLink('Hello Aulensia, I would like to talk about my school.')} target="_blank" rel="noopener noreferrer" data-no-i18n className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-bold text-white" style={{ background: '#0f7a6a' }} aria-label={`Chat on WhatsApp ${WHATSAPP_DISPLAY}`}><FaWhatsapp className="h-5 w-5" aria-hidden="true" /> <bdi dir="ltr">{WHATSAPP_DISPLAY}</bdi></a>
            <button type="button" onClick={() => openAsk('demo')} className="rounded-lg border border-[#2a5cac] px-6 py-3 font-bold text-[#2a5cac] hover:bg-[#eef2f8]">Request a Demo</button>
            <Link to="/register" className="rounded-lg bg-[#2a5cac] px-6 py-3 font-bold text-white hover:bg-[#234c91]">Register your school</Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default function About() {
  return (<SiteShell><Body /></SiteShell>);
}
