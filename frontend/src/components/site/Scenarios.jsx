import React, { useEffect, useState } from 'react';
import { SCENARIOS } from './siteData';
import SiteIcon from './SiteIcon';
import { SectionHead, tabKeys } from './ui';
import { useInView, useReducedMotion } from './useMotion';

// Four short stories. The highlight walks along the steps by itself while it is on screen; touching a step takes over.
export default function Scenarios() {
  const reduced = useReducedMotion(); const [ref, seen] = useInView({ once: false, threshold: 0.3 });
  const [k, setK] = useState(0); const [a, setA] = useState(0); const [manual, setManual] = useState(false);
  const sc = SCENARIOS[k];
  useEffect(() => { if (!seen || manual || reduced) return undefined; const t = setInterval(() => setA((v) => (v + 1) % sc.nodes.length), 2200); return () => clearInterval(t); }, [seen, manual, reduced, sc]);
  const pick = (n) => { setK(n); setA(0); setManual(false); };
  return (
    <section id="stories" ref={ref} className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="Stories from school life" title="See how one record travels" text="Each story follows real steps that Aulensia already handles, from the first form to the final report." />
        <div role="tablist" aria-label="Choose a story" className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {SCENARIOS.map((s, n) => (
            <button key={s.id} id={`sc-tab-${n}`} data-group="sc" role="tab" aria-selected={k === n} aria-controls="sc-panel" tabIndex={k === n ? 0 : -1} type="button" onClick={() => pick(n)} onKeyDown={(e) => tabKeys(e, SCENARIOS.length, k, pick)}
              className={`inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/30 ${k === n ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#c9d3df] bg-white text-[#3b4a5c] hover:bg-[#eef2f8]'}`}>
              <SiteIcon name={s.icon} className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </div>
        <div id="sc-panel" role="tabpanel" aria-labelledby={`sc-tab-${k}`} key={sc.id}>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {sc.nodes.map((n, i) => {
            const on = a === i; const done = i < a;
            return (
              <li key={n.t} className="site-pop relative" style={{ animationDelay: `${i * 70}ms` }}>
                <button type="button" onClick={() => { setA(i); setManual(true); }} aria-current={on ? 'step' : undefined}
                  className={`flex h-full w-full flex-col rounded-2xl border p-4 text-start transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/30 ${on ? 'border-[#2a5cac] bg-white shadow-lg -translate-y-1' : done ? 'border-[#9db6e0] bg-[#f4f7fc]' : 'border-[#e3e7e7] bg-white'}`}>
                  <span className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${on ? 'bg-[#2a5cac] text-white' : 'bg-[#eef2f8] text-[#2a5cac]'}`}><SiteIcon name={n.icon} /></span>
                    <span className="text-xs font-bold text-[#5b6b7b]">{i + 1}</span>
                  </span>
                  <span className="mt-3 font-bold text-[#1b2837]">{n.t}</span>
                  <span className="mt-1 text-sm leading-5 text-[#3b4a5c]">{n.text}</span>
                  <span aria-hidden="true" className="mt-3 h-1 rounded-full bg-[#e3e7e7]"><span className="block h-1 rounded-full bg-[#2a5cac]" style={{ width: on || done ? '100%' : '0%', transition: reduced ? 'none' : 'width 700ms ease' }} /></span>
                </button>
              </li>
            );
          })}
        </ol>
        </div>
      </div>
    </section>
  );
}
