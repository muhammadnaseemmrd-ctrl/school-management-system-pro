// One flow, drawn as a track you can watch or step through.
//
// The animation is not decoration: the thing a written guide cannot show is that step four is
// somebody *else*, and that step five happens without anybody. Colour says who, the shape of the
// node says what kind of step it is, and the marker travelling the track says where you are.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, Cpu, Pause, Play, RotateCcw, ShieldCheck, User } from 'lucide-react';
import { KIND_LABEL, ROLE_COLOR, ROLE_LABEL } from './flows';
import { useReducedMotion } from '../site/useMotion';
import './guide.css';

const KIND_ICON = { person: User, system: Cpu, check: ShieldCheck, wait: Clock, done: Check };
const HOLD = 2600;      // how long one step is shown before moving on

export default function FlowDiagram({ flow, onPickRole }) {
  const still = useReducedMotion();
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(!still);
  const timer = useRef(null);
  const live = useRef(null);

  const last = flow.steps.length - 1;

  // start again whenever a different flow is chosen
  useEffect(() => { setAt(0); setPlaying(!still); }, [flow.id, still]);

  useEffect(() => {
    if (!playing || still) return undefined;
    timer.current = setTimeout(() => setAt((n) => (n >= last ? 0 : n + 1)), at === last ? HOLD * 1.6 : HOLD);
    return () => clearTimeout(timer.current);
  }, [at, playing, still, last]);

  // a screen reader hears the step change without watching it
  useEffect(() => {
    if (live.current) live.current.textContent = `Step ${at + 1} of ${flow.steps.length}: ${flow.steps[at].title}`;
  }, [at, flow]);

  const go = useCallback((n) => { setPlaying(false); setAt(Math.max(0, Math.min(last, n))); }, [last]);

  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(last); }
  };

  const step = flow.steps[at];
  const Icon = KIND_ICON[step.kind] || User;
  const colour = ROLE_COLOR[step.by] || ROLE_COLOR.system;

  // who takes part in this flow, in the order they first appear
  const cast = [];
  for (const s of flow.steps) if (!cast.includes(s.by) && ROLE_LABEL[s.by]) cast.push(s.by);

  return (
    <section aria-labelledby={`flow-${flow.id}`} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`flow-${flow.id}`} className="text-xl font-black text-[#1b2837]">{flow.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-[#5b6b7b]">{flow.blurb}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!still && (
            <button type="button" onClick={() => setPlaying(!playing)} className="inline-flex items-center gap-2 rounded-full border border-[#e3e7e7] bg-white px-3 py-1.5 text-xs font-bold text-[#4f5f70]">
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? 'Pause' : 'Play'}
            </button>
          )}
          <button type="button" onClick={() => go(0)} className="inline-flex items-center gap-2 rounded-full border border-[#e3e7e7] bg-white px-3 py-1.5 text-xs font-bold text-[#4f5f70]">
            <RotateCcw className="h-3.5 w-3.5" /> Start again
          </button>
        </div>
      </div>

      {/* who takes part */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[#5b6b7b]">Who takes part</span>
        {cast.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onPickRole && onPickRole(r)}
            disabled={!onPickRole}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold disabled:cursor-default"
            style={{ borderColor: ROLE_COLOR[r], color: ROLE_COLOR[r] }}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: ROLE_COLOR[r] }} />
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      {/* the track */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
      <ol
        className="flex gap-2 overflow-x-auto rounded-2xl border border-[#e3e7e7] bg-white p-3"
        tabIndex={0}
        onKeyDown={onKey}
        aria-label={`${flow.title}: ${flow.steps.length} steps. Use the left and right arrow keys to step through.`}
      >
        {flow.steps.map((s, i) => {
          const c = ROLE_COLOR[s.by] || ROLE_COLOR.system;
          const here = i === at;
          const past = i < at;
          const I = KIND_ICON[s.kind] || User;
          return (
            <li key={`${flow.id}-${i}`} className="flex min-w-0 flex-1 items-center gap-2" style={{ minWidth: '7.5rem' }}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={here ? 'step' : undefined}
                className="group min-w-0 flex-1 rounded-xl p-2 text-start transition"
                style={{ background: here ? `${c}14` : 'transparent' }}
              >
                <span className="relative flex items-center gap-2">
                  {here && !still && playing && <span aria-hidden="true" className="guide-ring absolute h-7 w-7 rounded-full" style={{ border: `2px solid ${c}` }} />}
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: here || past ? c : '#c6cdd6' }}
                  >
                    <I className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold" style={{ color: here ? c : '#5b6b7b' }}>{ROLE_LABEL[s.by] || 'Aulensia'}</span>
                    <span className={`block truncate text-xs ${here ? 'font-bold text-[#1b2837]' : 'text-[#5b6b7b]'}`}>{s.title}</span>
                  </span>
                </span>
              </button>
              {i < last && <span aria-hidden="true" className="h-px w-4 flex-shrink-0 bg-[#c6cdd6]" />}
            </li>
          );
        })}
      </ol>

      {/* the step you are on */}
      <div className="rounded-2xl border border-[#e3e7e7] bg-white p-5" style={{ borderInlineStartWidth: 5, borderInlineStartColor: colour }}>
        <div key={`${flow.id}-${at}`} className={still ? '' : 'guide-step'}>
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: colour }}>
            <Icon className="h-4 w-4" />
            {ROLE_LABEL[step.by] || 'Aulensia'}
            <span className="rounded-full bg-[#f1f1ee] px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-[#4f5f70]">{KIND_LABEL[step.kind]}</span>
            <span className="text-[#5b6b7b]">Step {at + 1} of {flow.steps.length}</span>
          </p>
          <h3 className="mt-2 text-lg font-black text-[#1b2837]">{step.title}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#3b4a5c]">{step.text}</p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => go(at - 1)} disabled={at === 0} className="inline-flex items-center gap-1 rounded-full border border-[#e3e7e7] px-3 py-1.5 text-xs font-bold text-[#4f5f70] disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <button type="button" onClick={() => go(at + 1)} disabled={at === last} className="inline-flex items-center gap-1 rounded-full border border-[#e3e7e7] px-3 py-1.5 text-xs font-bold text-[#4f5f70] disabled:opacity-40">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span ref={live} aria-live="polite" className="sr-only" />
        </div>
      </div>

      {/* the same thing in words, for anyone who would rather read it or cannot see the track */}
      <details className="rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] p-4">
        <summary className="cursor-pointer text-sm font-bold text-[#1b2837]">Read the whole flow as a list</summary>
        <ol className="mt-3 space-y-3">
          {flow.steps.map((s, i) => (
            <li key={`t-${flow.id}-${i}`} className="text-sm">
              <span className="font-bold" style={{ color: ROLE_COLOR[s.by] || ROLE_COLOR.system }}>{i + 1}. {ROLE_LABEL[s.by] || 'Aulensia'} — {s.title}</span>
              <span className="block text-[#3b4a5c]">{s.text}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
