import React, { useEffect, useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { SCATTERED, PAIRS } from './siteData';
import SiteIcon from './SiteIcon';
import { Eyebrow, SectionHead } from './ui';
import { useInView, useReducedMotion } from './useMotion';

// Six everyday tools drift around the page, then pull into one connected workspace.
export default function ProblemSolution() {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView({ threshold: 0.35 });
  const [joined, setJoined] = useState(false);
  useEffect(() => { if (seen && !joined) { const t = setTimeout(() => setJoined(true), reduced ? 0 : 1400); return () => clearTimeout(t); } return undefined; }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = (i) => { const a = (-90 + i * (360 / SCATTERED.length)) * (Math.PI / 180); return [50 + Math.cos(a) * 36, 50 + Math.sin(a) * 33]; };

  return (
    <section id="problem" className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow="The everyday problem" title="Schools do a great deal. The tools they use do not talk to each other."
          text="Attendance on paper, fees in a spreadsheet, news in a chat group. Each piece works alone, but nobody sees the whole child, or the whole school." />
        <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div ref={ref} className="relative mx-auto aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-3xl border border-[#d5dbe0]"
            style={{ background: joined ? 'linear-gradient(135deg,#eef3fb,#f7f6f2)' : 'linear-gradient(135deg,#f3ece8,#f7f6f2)', transition: 'background 900ms ease' }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
              {SCATTERED.map((c, i) => { const [x, y] = ring(i); return <line key={c.id} x1="50" y1="50" x2={x} y2={y} stroke="#2a5cac" strokeWidth="0.5" vectorEffect="non-scaling-stroke" className={joined ? 'site-line-draw' : ''} style={{ opacity: joined ? 0.6 : 0, transition: 'opacity 700ms ease 500ms' }} />; })}
            </svg>
            <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center text-white sm:h-28 sm:w-28"
              style={{ background: 'linear-gradient(135deg,#2a5cac,#1d3c78)', boxShadow: '0 0 0 8px rgba(42,92,172,0.12)', opacity: joined ? 1 : 0.15, transform: `translate(-50%,-50%) scale(${joined ? 1 : 0.7})`, transition: 'opacity 700ms ease, transform 700ms ease' }}>
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <span className="mt-1 px-2 text-[11px] font-bold leading-tight sm:text-xs">One connected workspace</span>
            </div>
            {SCATTERED.map((c, i) => {
              const [rx, ry] = ring(i);
              const x = joined ? rx : c.x + 12; const y = joined ? ry : c.y + 6;
              return (
                <span key={c.id} className="site-chip absolute max-w-[42%] rounded-xl border px-3 py-2 text-center text-[11px] font-bold leading-tight shadow-sm sm:text-sm"
                  style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${joined ? 0 : c.r}deg)`, background: joined ? '#fff' : '#fbf5f3', borderColor: joined ? '#9db6e0' : '#e0c9c5', color: joined ? '#1d3c78' : '#7a4a3d' }}>
                  {c.label}
                </span>
              );
            })}
          </div>
          <div>
            <Eyebrow>From scattered to connected</Eyebrow>
            <p className="mt-3 font-display text-2xl font-bold leading-snug text-[#1b2837]">Aulensia puts the same information where everybody can use it.</p>
            <p className="mt-4 leading-7 text-[#3b4a5c]">Mark attendance once and parents see it, the principal sees it, and the report includes it. Record a fee once and the office, the family and the accounts all agree.</p>
            <button type="button" onClick={() => setJoined((v) => !v)} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#2a5cac] px-5 py-2.5 text-sm font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/30" aria-pressed={joined}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> {joined ? 'Show it scattered' : 'Bring it together'}
            </button>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAIRS.map((p, i) => (
            <div key={p.problem} className="reveal stagger-in rounded-2xl border border-[#e3e7e7] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md" style={{ transitionDelay: `${i * 40}ms` }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef2f8] text-[#2a5cac]"><SiteIcon name={p.icon} /></div>
              <p className="mt-4 text-sm font-semibold text-[#8a4636] line-through decoration-[#d9826a]/70">{p.problem}</p>
              <p className="mt-2 font-bold leading-6 text-[#1b2837]">{p.fix}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
