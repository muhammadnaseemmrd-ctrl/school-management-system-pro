import React from 'react';

/* A small friendly robot helper, drawn in SVG. The colour of its eyes and chest light shows what it is doing:
   violet = thinking, cyan = watching, amber = waiting for a person, coral = alert, green = done. */
export const TONES = {
  ai: { main: '#a99bff', soft: 'rgba(169,155,255,0.28)' },
  live: { main: '#4fd8ea', soft: 'rgba(79,216,234,0.28)' },
  review: { main: '#ffc95e', soft: 'rgba(255,201,94,0.28)' },
  alert: { main: '#ff7f73', soft: 'rgba(255,127,115,0.3)' },
  done: { main: '#49e0a0', soft: 'rgba(73,224,160,0.28)' },
};

export default function AiRobot({ tone = 'ai', moving = true, className = '' }) {
  const t = TONES[tone] || TONES.ai;
  return (
    <svg viewBox="0 0 160 170" className={className} role="img" aria-label="A friendly helper robot" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="rb-head" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f2f0ff" /><stop offset="1" stopColor="#b9c4ff" /></linearGradient>
        <linearGradient id="rb-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9dcff" /><stop offset="1" stopColor="#8d9cf5" /></linearGradient>
        <radialGradient id="rb-glow"><stop offset="0" stopColor={t.main} stopOpacity="0.55" /><stop offset="1" stopColor={t.main} stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="80" cy="82" rx="74" ry="74" fill="url(#rb-glow)" style={{ transition: 'all 500ms' }} />
      <ellipse cx="80" cy="156" rx="32" ry="6" fill="rgba(0,0,0,0.35)" />
      <g className={moving ? 'ai-bob' : ''}>
        {/* orbiting sparks */}
        <g className={moving ? 'ai-orbit' : ''} style={{ transformOrigin: '80px 82px' }}>
          <circle cx="80" cy="6" r="3" fill={t.main} style={{ transition: 'fill 500ms' }} />
          <circle cx="150" cy="86" r="2.2" fill="#fff" opacity="0.8" />
          <circle cx="22" cy="118" r="2.6" fill={t.main} opacity="0.8" style={{ transition: 'fill 500ms' }} />
        </g>
        {/* antenna */}
        <line x1="80" y1="22" x2="80" y2="36" stroke="#b9c4ff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="18" r="6" fill={t.main} className={moving ? 'ai-blinkdot' : ''} style={{ transition: 'fill 500ms' }} />
        {/* ears */}
        <rect x="26" y="62" width="10" height="26" rx="5" fill="#7d8cf0" /><rect x="124" y="62" width="10" height="26" rx="5" fill="#7d8cf0" />
        {/* head */}
        <rect x="34" y="36" width="92" height="70" rx="28" fill="url(#rb-head)" />
        <rect x="44" y="47" width="72" height="46" rx="20" fill="#0b1226" />
        {/* eyes */}
        <g className={moving ? 'ai-blink' : ''} style={{ transformOrigin: '80px 68px' }}>
          <rect x="55" y="58" width="13" height="18" rx="6.5" fill={t.main} style={{ transition: 'fill 500ms' }} />
          <rect x="92" y="58" width="13" height="18" rx="6.5" fill={t.main} style={{ transition: 'fill 500ms' }} />
          <circle cx="60" cy="63" r="2.2" fill="#fff" opacity="0.85" /><circle cx="97" cy="63" r="2.2" fill="#fff" opacity="0.85" />
        </g>
        {/* mouth: smile when done, flat otherwise, small "o" on alert */}
        {tone === 'alert' ? <ellipse cx="80" cy="85" rx="4" ry="3.2" fill={t.main} /> : tone === 'done' ? <path d="M70 83 Q80 91 90 83" fill="none" stroke={t.main} strokeWidth="3" strokeLinecap="round" /> : <rect x="72" y="83" width="16" height="3" rx="1.5" fill={t.main} opacity="0.85" />}
        {/* body */}
        <rect x="48" y="110" width="64" height="42" rx="18" fill="url(#rb-body)" />
        <circle cx="80" cy="131" r="8" fill="#0b1226" /><circle cx="80" cy="131" r="4.5" fill={t.main} className={moving ? 'ai-blinkdot' : ''} style={{ transition: 'fill 500ms' }} />
        {/* arms */}
        <rect x="32" y="116" width="14" height="30" rx="7" fill="#7d8cf0" />
        <g className={moving ? 'ai-wave' : ''} style={{ transformOrigin: '121px 120px' }}><rect x="114" y="116" width="14" height="30" rx="7" fill="#7d8cf0" /></g>
      </g>
    </svg>
  );
}
