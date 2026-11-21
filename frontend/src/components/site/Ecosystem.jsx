import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CATEGORIES } from './siteData';
import SiteIcon from './SiteIcon';
import { SectionHead, tabKeys } from './ui';

export default function Ecosystem() {
  const [i, setI] = useState(0); const [open, setOpen] = useState(0);
  const cat = CATEGORIES[i]; const pick = (n) => { setI(n); setOpen(0); };
  return (
    <section id="platform" className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24" style={{ background: 'linear-gradient(180deg,#f7f6f2,#eef2f8 40%,#f7f6f2)' }}>
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="The platform" title="One ecosystem, twelve parts of school life"
          text="Choose a part to see what it does, who uses it and the everyday problem it solves. Everything shown is already working in Aulensia." />
        <div className="mt-10 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div role="tablist" aria-label="Parts of the platform" aria-orientation="vertical" className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {CATEGORIES.map((c, n) => (
              <button key={c.id} id={`eco-tab-${n}`} data-group="eco" role="tab" aria-selected={i === n} aria-controls="eco-panel" tabIndex={i === n ? 0 : -1} type="button"
                onClick={() => pick(n)} onKeyDown={(e) => tabKeys(e, CATEGORIES.length, i, pick)}
                className={`flex flex-shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/30 ${i === n ? 'border-[#2a5cac] bg-white text-[#1d3c78] shadow-md' : 'border-transparent text-[#3b4a5c] hover:bg-white/70'}`}>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white" style={{ background: c.color }}><SiteIcon name={c.icon} className="h-4 w-4" /></span>
                <span className="whitespace-nowrap lg:whitespace-normal">{c.title}</span>
              </button>
            ))}
          </div>

          <div id="eco-panel" role="tabpanel" aria-labelledby={`eco-tab-${i}`} key={cat.id} className="site-pop grid min-w-0 gap-6 rounded-3xl border border-[#d5dbe0] bg-white p-5 shadow-sm sm:p-7 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: cat.color }}><SiteIcon name={cat.icon} /></span>
                <h3 className="font-display text-2xl font-bold">{cat.title}</h3>
              </div>
              <p className="mt-3 leading-7 text-[#3b4a5c]">{cat.intro}</p>
              <ul className="mt-5 space-y-2">
                {cat.features.map((f, n) => (
                  <li key={f.t} className={`rounded-xl border transition ${open === n ? 'border-[#9db6e0] bg-[#f4f7fc]' : 'border-[#e3e7e7] bg-white'}`}>
                    <button type="button" onClick={() => setOpen(open === n ? -1 : n)} aria-expanded={open === n} aria-controls={`eco-f-${n}`} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/30">
                      <span>{f.t}</span><ChevronDown className={`h-4 w-4 flex-shrink-0 text-[#2a5cac] transition ${open === n ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open === n && (
                      <dl id={`eco-f-${n}`} className="site-pop grid gap-2 px-4 pb-4 text-sm leading-6">
                        <div><dt className="text-xs font-bold uppercase tracking-wider text-[#8a4636]">What it does</dt><dd className="text-[#2b3a4d]">{f.what}</dd></div>
                        <div><dt className="text-xs font-bold uppercase tracking-wider text-[#8a4636]">Who uses it</dt><dd className="text-[#2b3a4d]">{f.who}</dd></div>
                        <div><dt className="text-xs font-bold uppercase tracking-wider text-[#8a4636]">Why it matters</dt><dd className="font-semibold text-[#1d3c78]">{f.fix}</dd></div>
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <figure className="self-start">
              <div className="overflow-hidden rounded-2xl border border-[#d5dbe0] bg-[#f7f6f2] shadow-md">
                <div className="flex items-center gap-1.5 border-b border-[#e3e7e7] bg-white px-3 py-2" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-[#d9826a]" /><span className="h-2 w-2 rounded-full bg-[#e9c46a]" /><span className="h-2 w-2 rounded-full bg-[#2c776c]" /></div>
                <img src={`/showcase/${cat.shot}.webp`} alt={`A real Aulensia screen from the demo school, related to ${cat.title}`} width="1360" height="860" loading="lazy" decoding="async" className="block h-auto w-full" />
              </div>
              <figcaption className="mt-2 text-xs text-[#5b6b7b]">A real screen from the demo school.</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
