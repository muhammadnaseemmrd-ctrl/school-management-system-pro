import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import { JOURNEYS } from './siteData';
import SiteIcon from './SiteIcon';
import { SectionHead, tabKeys } from './ui';
import { useSite } from './SiteShell';

// "A day with Aulensia": pick a person, then step through their real screens. The highlighted box shows where to look.
export default function Walkthrough() {
  const { jump } = useSite();
  const [j, setJ] = useState(0); const [s, setS] = useState(0);
  const journey = JOURNEYS[j]; const step = journey.steps[s]; const last = s === journey.steps.length - 1;
  const pick = (n) => { setJ(n); setS(0); };
  const [x, y, w, h] = step.rect;
  return (
    <section id="how" className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24" style={{ background: '#0f1b2d', color: '#fff' }}>
      <div className="mx-auto max-w-7xl">
        <SectionHead light eyebrow="How it works" title="A day with Aulensia" text="Pick who you are and follow a typical day on the real screens of the demo school." />
        <div role="tablist" aria-label="Choose a person" className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {JOURNEYS.map((r, n) => (
            <button key={r.id} id={`day-tab-${n}`} data-group="day" role="tab" aria-selected={j === n} aria-controls="day-panel" tabIndex={j === n ? 0 : -1} type="button" onClick={() => pick(n)} onKeyDown={(e) => tabKeys(e, JOURNEYS.length, j, pick)}
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              style={j === n ? { background: '#fff', color: '#12294e', borderColor: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: '#dbe6fb', borderColor: 'rgba(200,215,245,0.3)' }}>
              <SiteIcon name={r.icon} className="h-4 w-4" /> {r.label}
            </button>
          ))}
        </div>
        <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${j}`} className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: 'rgba(190,210,255,0.25)', background: '#f7f6f2' }}>
            <div className="relative aspect-[1360/860] w-full overflow-hidden">
              <img key={step.shot} src={`/showcase/${step.shot}.webp`} alt={`Screen: ${step.t}`} width="1360" height="860" decoding="async" className="site-pop absolute inset-0 h-full w-full" />
              <div aria-hidden="true" className="site-hotspot pointer-events-none absolute rounded-xl border-2" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, borderColor: '#e0896f', transition: 'left 600ms cubic-bezier(.2,.8,.2,1), top 600ms cubic-bezier(.2,.8,.2,1), width 600ms cubic-bezier(.2,.8,.2,1), height 600ms cubic-bezier(.2,.8,.2,1)' }}>
                <span className="site-pulse-dot absolute -end-1.5 -top-1.5 h-3.5 w-3.5 rounded-full" style={{ background: '#e0896f' }} />
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: '#9fb6dc' }}>{journey.blurb}</p>
            <div key={`${j}-${s}`} className="site-in-right mt-4 flex-1 rounded-2xl border p-5" style={{ borderColor: 'rgba(190,210,255,0.25)', background: 'rgba(255,255,255,0.06)' }} aria-live="polite">
              <p className="text-sm font-bold" style={{ color: '#f0a58c' }}>Step {s + 1} of {journey.steps.length}</p>
              <h3 className="mt-1 font-display text-2xl font-bold">{step.t}</h3>
              <p className="mt-3 leading-7" style={{ color: '#c9d6ea' }}>{step.text}</p>
            </div>
            <div className="mt-4 flex items-center gap-1.5" role="group" aria-label="Steps">
              {journey.steps.map((st, n) => (
                <button key={n} type="button" onClick={() => setS(n)} aria-label={`Go to step ${n + 1}: ${st.t}`} aria-current={n === s ? 'step' : undefined} className="h-2.5 flex-1 rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: n <= s ? '#e0896f' : 'rgba(255,255,255,0.2)' }} />
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setS(Math.max(0, s - 1))} disabled={s === 0} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition disabled:opacity-40 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ borderColor: 'rgba(200,215,245,0.5)', color: '#fff' }}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> Previous</button>
              {last ? (
                <button type="button" onClick={() => jump('demo')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: '#e0896f', color: '#1b2837' }}><Play className="h-4 w-4" aria-hidden="true" /> See it in action</button>
              ) : (
                <button type="button" onClick={() => setS(s + 1)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: '#fff', color: '#12294e' }}>Next <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
