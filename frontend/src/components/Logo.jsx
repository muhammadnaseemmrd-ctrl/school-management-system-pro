import React from 'react';

// Aulensia mark: a bold "A" whose crossbar is an open page, on an ink-blue tile.
export const LogoMark = ({ className = 'h-10 w-10' }) => (
  <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Aulensia" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="14" fill="#2a5cac" />
    <path d="M32 11 49 53h-7.6L32 28.6 22.6 53H15z" fill="#ffffff" />
    <path d="M23.4 41.5c3.2-2 6.1-2 8.6 0 2.5-2 5.4-2 8.6 0v5.2c-3.2-2-6.1-2-8.6 0-2.5-2-5.4-2-8.6 0z" fill="#b86650" />
  </svg>
);

// Mark + name. `tone="light"` is for dark backgrounds.
const Logo = ({ size = 'md', subtitle, tone = 'dark', name = 'Aulensia' }) => {
  const box = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div className="flex items-center gap-3">
      <LogoMark className={`${box} shrink-0`} />
      <div className="min-w-0">
        <p className={`flex items-baseline gap-2 font-display text-xl font-bold leading-tight tracking-tight ${tone === 'light' ? 'text-white' : 'text-[#1b2837]'}`}>
          {name}<span lang="ur" dir="rtl" className={`font-urdu text-sm font-bold ${tone === 'light' ? 'text-[#d9826a]' : 'text-[#b86650]'}`}>اولینسیا</span>
        </p>
        {subtitle && <p className={`text-xs ${tone === 'light' ? 'text-[#c9d6ea]' : 'text-[#5b6b7b]'}`}>{subtitle}</p>}
      </div>
    </div>
  );
};

export default Logo;
