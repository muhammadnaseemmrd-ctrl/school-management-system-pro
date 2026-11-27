// "How it works": the map of everyone, and a flow for each role and each piece of work.
//
// Shown to every role. What a person sees is filtered to flows they take part in, so a teacher is
// not handed the platform owner's billing. The whole-system map is shown to everyone, because the
// commonest confusion is not what a screen does but who is on the other side of it.

import React, { useMemo, useState } from 'react';
import { Compass, Map as MapIcon, Workflow } from 'lucide-react';
import { ALL_FLOWS, ROLE_COLOR, ROLE_LABEL, flowsFor, groupsOf } from './flows';
import FlowDiagram from './FlowDiagram';
import RolesMap from './RolesMap';

export default function GuideCenter({ role = 'admin', showEverything = false }) {
  const mine = useMemo(() => (showEverything ? ALL_FLOWS : flowsFor(role)), [role, showEverything]);
  const groups = useMemo(() => groupsOf(mine), [mine]);
  const [pick, setPick] = useState('map');

  const flow = pick === 'map' ? null : mine.find((f) => f.id === pick) || ALL_FLOWS.find((f) => f.id === pick);

  // clicking a role chip inside a flow jumps to that role's own journey, when there is one
  const pickRole = (r) => {
    const target = ALL_FLOWS.find((f) => f.id === `role-${r}`);
    if (target) setPick(target.id);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-[#1b2837]">
          <Compass className="h-6 w-6 text-[#2a5cac]" /> How it works
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5b6b7b]">
          Each picture shows one flow from beginning to end: who starts it, who has to agree, what Aulensia does on its
          own, and where it finishes. Press play to watch it, or step through with the arrow keys.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <nav aria-label="Flows" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <button
            type="button"
            onClick={() => setPick('map')}
            aria-current={pick === 'map' ? 'page' : undefined}
            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm font-bold transition ${pick === 'map' ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white text-[#1b2837] hover:bg-[#f7f6f2]'}`}
          >
            <MapIcon className="h-4 w-4" /> Everyone, and who they answer to
          </button>

          {groups.map((g) => (
            <div key={g.group}>
              <p className="px-1 pb-1 text-[11px] font-black uppercase tracking-wider text-[#5b6b7b]">{g.group}</p>
              <ul className="space-y-1">
                {g.items.map((f) => {
                  const lead = f.steps[0]?.by || 'system';
                  const on = pick === f.id;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setPick(f.id)}
                        aria-current={on ? 'page' : undefined}
                        className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-start text-sm transition ${on ? 'border-[#2a5cac] bg-[#eef2f8] font-bold text-[#1b2837]' : 'border-transparent text-[#3b4a5c] hover:bg-[#f7f6f2]'}`}
                      >
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: ROLE_COLOR[lead] }} />
                        <span className="min-w-0">{f.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-[#5b6b7b]">What the colours mean</p>
            <ul className="mt-2 space-y-1">
              {['owner', 'director', 'admin', 'teacher', 'student', 'parent', 'system'].map((r) => (
                <li key={r} className="flex items-center gap-2 text-xs text-[#3b4a5c]">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLOR[r] }} />
                  {ROLE_LABEL[r]}
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0">
          {pick === 'map' ? <RolesMap /> : flow ? <FlowDiagram flow={flow} onPickRole={pickRole} /> : (
            <p className="rounded-2xl border border-dashed border-[#e3e7e7] p-10 text-center text-sm text-[#5b6b7b]">
              <Workflow className="mx-auto mb-2 h-6 w-6" />
              Choose a flow on the left.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
