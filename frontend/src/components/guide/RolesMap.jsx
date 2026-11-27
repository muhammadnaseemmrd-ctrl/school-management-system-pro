// The whole product on one picture: who creates whom, and who may see what.
//
// Drawn rather than listed, because the thing people get wrong is not what a role is called — it
// is which way the arrows point and where they stop.

import React, { useState } from 'react';
import { Pause, Play, ShieldCheck } from 'lucide-react';
import { MAP, ROLE_COLOR } from './flows';
import { useReducedMotion } from '../site/useMotion';
import './guide.css';

const W = 1000;
const H = 560;
const at = (n) => ({ x: (n.x / 100) * W, y: (n.y / 100) * H });

// A node is a rounded box; edges meet it at the middle of an edge, not at its corner.
const BOX = { w: 186, h: 58 };

const edgePath = (a, b) => {
  const p = at(a); const q = at(b);
  const down = q.y > p.y;
  const y1 = p.y + (down ? BOX.h / 2 : -BOX.h / 2);
  const y2 = q.y - (down ? BOX.h / 2 : -BOX.h / 2);
  const mid = (y1 + y2) / 2;
  return `M ${p.x} ${y1} C ${p.x} ${mid}, ${q.x} ${mid}, ${q.x} ${y2}`;
};

export default function RolesMap() {
  const still = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [hot, setHot] = useState(null);
  const moving = playing && !still;

  const byId = Object.fromEntries(MAP.nodes.map((n) => [n.id, n]));
  const lit = (id) => !hot || hot === id || MAP.edges.some((e) => (e.from === hot && e.to === id) || (e.to === hot && e.from === id));

  return (
    <section aria-labelledby="roles-map-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="roles-map-title" className="text-xl font-black text-[#1b2837]">{MAP.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-[#5b6b7b]">{MAP.blurb}</p>
        </div>
        {!still && (
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="inline-flex items-center gap-2 rounded-full border border-[#e3e7e7] bg-white px-3 py-1.5 text-xs font-bold text-[#4f5f70]"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause the movement' : 'Play the movement'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e3e7e7] bg-white p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[42rem]"
          role="img"
          aria-label="A map of every role. The platform owner creates groups and appoints agents. A group has a director, who opens schools. A school is run by an administrator, who adds teachers and admits students, and each student is linked to a parent."
        >
          <defs>
            <marker id="guide-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a94a6" />
            </marker>
          </defs>

          {/* the lines first, so the boxes sit on top of them */}
          {MAP.edges.map((e, i) => {
            const a = byId[e.from]; const b = byId[e.to];
            if (!a || !b) return null;
            const d = edgePath(a, b);
            const on = lit(e.from) && lit(e.to);
            return (
              <g key={`${e.from}-${e.to}`} opacity={on ? 1 : 0.18} style={{ transition: 'opacity 180ms' }}>
                <path
                  d={d}
                  className={still ? '' : 'guide-line'}
                  style={{ animationDelay: `${i * 90}ms` }}
                  fill="none"
                  stroke="#c6cdd6"
                  strokeWidth="2"
                  strokeDasharray={e.dashed ? '6 6' : undefined}
                  markerEnd="url(#guide-arrow)"
                />
                {moving && (
                  <circle r="4" fill={ROLE_COLOR[a.role]} className="guide-spark" style={{ offsetPath: `path('${d}')`, animationDelay: `${i * 320}ms` }} />
                )}
                <text
                  x={(at(a).x + at(b).x) / 2}
                  y={(at(a).y + at(b).y) / 2}
                  dy="-4"
                  textAnchor="middle"
                  fontSize="12"
                  fill="#5b6b7b"
                  style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 4 }}
                >
                  {e.label}
                </text>
              </g>
            );
          })}

          {/* the roles */}
          {MAP.nodes.map((n, i) => {
            const p = at(n);
            const c = ROLE_COLOR[n.role];
            const on = lit(n.id);
            return (
              <g
                key={n.id}
                className={still ? '' : 'guide-pop'}
                style={{ animationDelay: `${i * 70}ms`, opacity: on ? 1 : 0.3, transition: 'opacity 180ms', cursor: 'pointer' }}
                onMouseEnter={() => setHot(n.id)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(n.id)}
                onBlur={() => setHot(null)}
                tabIndex={0}
                role="group"
                aria-label={`${n.label}. ${n.sub}`}
              >
                {moving && hot === n.id && <rect x={p.x - BOX.w / 2} y={p.y - BOX.h / 2} width={BOX.w} height={BOX.h} rx="14" fill="none" stroke={c} strokeWidth="2" className="guide-ring" />}
                <rect x={p.x - BOX.w / 2} y={p.y - BOX.h / 2} width={BOX.w} height={BOX.h} rx="14" fill="#ffffff" stroke={c} strokeWidth={hot === n.id ? 3 : 2} />
                <rect x={p.x - BOX.w / 2} y={p.y - BOX.h / 2} width="5" height={BOX.h} rx="2.5" fill={c} />
                <text x={p.x - BOX.w / 2 + 16} y={p.y - 6} fontSize="15" fontWeight="800" fill="#1b2837">{n.label}</text>
                <text x={p.x - BOX.w / 2 + 16} y={p.y + 14} fontSize="11.5" fill="#5b6b7b">{n.sub}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rounded-2xl border border-[#e3e7e7] bg-[#f7f6f2] p-4">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#1f5e53]">
          <ShieldCheck className="h-4 w-4" /> Where the arrows stop
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm text-[#1b2837]">
          {MAP.walls.map((w) => <li key={w} className="flex gap-2"><span aria-hidden="true" className="text-[#1f5e53]">•</span><span>{w}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
