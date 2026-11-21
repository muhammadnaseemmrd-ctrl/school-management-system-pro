import React, { useRef, useState } from 'react';
import { SHOTS } from './siteData';
import { SectionHead, tabKeys } from './ui';
import { useReducedMotion } from './useMotion';

// Real screens in a frame that leans a little towards the pointer. Small dots point out what to look at.
export default function Showcase() {
  const reduced = useReducedMotion(); const frame = useRef(null);
  const [i, setI] = useState(0); const shot = SHOTS[i];
  const move = (e) => {
    if (reduced || !frame.current || e.pointerType === 'touch') return;
    const r = frame.current.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
    frame.current.style.setProperty('--ry', `${(-4 + px * 5).toFixed(2)}deg`); frame.current.style.setProperty('--rx', `${(2 - py * 4).toFixed(2)}deg`);
  };
  const reset = () => { frame.current?.style.removeProperty('--ry'); frame.current?.style.removeProperty('--rx'); };
  return (
    <section id="screens" className="scroll-mt-20 overflow-x-clip px-5 py-16 lg:px-8 lg:py-24" style={{ background: 'linear-gradient(180deg,#eef2f8,#f7f6f2)' }}>
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="The product" title="Real screens, not mock-ups" text="These are screenshots of the demo school. Pick a screen to see it, and hover over the dots to see what to look at." />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_250px] lg:items-start">
          <div onPointerMove={move} onPointerLeave={reset} className="min-w-0 [perspective:1400px]">
            <div ref={frame} className={`${reduced ? '' : 'site-tilt'} overflow-hidden rounded-2xl border border-[#c9d3df] bg-white shadow-2xl`}>
              <div className="flex items-center gap-1.5 border-b border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-[#d9826a]" /><span className="h-2.5 w-2.5 rounded-full bg-[#e9c46a]" /><span className="h-2.5 w-2.5 rounded-full bg-[#2c776c]" />
                <span className="ms-3 rounded-md bg-white px-3 py-0.5 text-[11px] font-semibold text-[#5b6b7b]">{shot.label}</span></div>
              <div className="relative">
                <img key={shot.id} src={`/showcase/${shot.id}.webp`} alt={`${shot.label}, seen by the ${shot.who.toLowerCase()}`} width="1360" height="860" loading="lazy" decoding="async" className="site-pop block h-auto w-full" />
                {shot.pins.map((p, n) => (
                  <span key={p.t} className="group absolute" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                    <button type="button" aria-label={p.t} className="relative -ms-2.5 -mt-2.5 flex h-5 w-5 items-center justify-center rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ background: '#e0896f' }}>
                      <span className="site-pulse-dot absolute inset-0 rounded-full" style={{ background: '#e0896f' }} /><span className="relative text-[10px] font-black text-[#1b2837]">{n + 1}</span>
                    </button>
                    <span className="pointer-events-none absolute start-4 top-3 z-10 hidden whitespace-nowrap rounded-md bg-[#0f1b2d] px-2 py-1 text-[11px] font-semibold text-white group-hover:block group-focus-within:block">{p.t}</span>
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-4 text-sm text-[#3b4a5c]"><span className="font-bold text-[#1b2837]">{shot.who}.</span> {shot.note}</p>
            <ol className="mt-1 text-sm text-[#5b6b7b]">{shot.pins.map((p, n) => (<li key={p.t}>{n + 1}. {p.t}</li>))}</ol>
          </div>
          <div role="tablist" aria-label="Choose a screen" aria-orientation="vertical" className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {SHOTS.map((s, n) => (
              <button key={s.id} id={`shot-tab-${n}`} data-group="shot" role="tab" aria-selected={i === n} tabIndex={i === n ? 0 : -1} type="button" onClick={() => setI(n)} onKeyDown={(e) => tabKeys(e, SHOTS.length, i, setI)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-xl border p-2 text-start text-xs font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/30 ${i === n ? 'border-[#2a5cac] bg-white shadow-md' : 'border-transparent hover:bg-white/70'}`}>
                <img src={`/showcase/${s.id}.webp`} alt="" width="64" height="40" loading="lazy" decoding="async" className="h-10 w-16 flex-shrink-0 rounded border border-[#e3e7e7] object-cover object-top" />
                <span className="whitespace-nowrap lg:whitespace-normal"><span className="block text-[#1b2837]">{s.label}</span><span className="block font-semibold text-[#5b6b7b]">{s.who}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
