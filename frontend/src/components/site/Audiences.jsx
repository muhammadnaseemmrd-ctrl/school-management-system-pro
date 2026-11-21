import React from 'react';
import { AUDIENCES, INSTITUTIONS } from './siteData';
import SiteIcon from './SiteIcon';
import { SectionHead } from './ui';

export default function Audiences() {
  return (
    <section id="who" className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="Who it's for" title="Built for everyone who makes a school work" text="Each person gets their own simple view, with only what they need." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a, i) => (
            <div key={a.t} className="reveal stagger-in group rounded-2xl border border-[#e3e7e7] bg-white p-5 transition hover:-translate-y-1 hover:border-[#9db6e0] hover:shadow-lg" style={{ transitionDelay: `${(i % 4) * 50}ms` }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2f8] text-[#2a5cac] transition group-hover:bg-[#2a5cac] group-hover:text-white"><SiteIcon name={a.icon} /></span>
              <h3 className="mt-4 font-bold text-[#1b2837]">{a.t}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#3b4a5c]">{a.text}</p>
            </div>
          ))}
        </div>
        <div className="reveal mt-12 rounded-3xl border border-[#d5dbe0] bg-white p-6 lg:p-8">
          <h3 className="font-display text-2xl font-bold">For every kind of institution</h3>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {INSTITUTIONS.map((n) => (<li key={n.t}><p className="font-bold text-[#1d3c78]">{n.t}</p><p className="mt-1 text-sm leading-6 text-[#3b4a5c]">{n.text}</p></li>))}
          </ul>
        </div>
      </div>
    </section>
  );
}
