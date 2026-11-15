import React from 'react';

// Darsgah mark: an open book under a pointed (Mughal-style) arch, in Pakistan green and gold.
export const LogoMark = ({ className = 'h-10 w-10' }) => (
  <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Darsgah" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="16" fill="#0f6b4f" />
    <path d="M18 27V21c0-7 6-12 14-17 8 5 14 10 14 17v6" fill="none" stroke="#e0a526" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M32 50c-5-3.6-12-4.6-18-3V30.5c6-1.6 13-.6 18 3z" fill="#ffffff" />
    <path d="M32 50c5-3.6 12-4.6 18-3V30.5c-6-1.6-13-.6-18 3z" fill="#cfe6da" />
  </svg>
);

// Mark + name. `tone="light"` is for dark backgrounds.
const Logo = ({ size = 'md', subtitle, tone = 'dark', name = 'Darsgah' }) => {
  const box = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div className="flex items-center gap-3">
      <LogoMark className={`${box} shrink-0 drop-shadow-sm`} />
      <div className="min-w-0">
        <p className={`flex items-baseline gap-2 text-lg font-extrabold leading-tight tracking-tight ${tone === 'light' ? 'text-[#edf5f0]' : 'text-[#0c2f25]'}`}>
          {name}<span lang="ur" dir="rtl" className={`text-sm font-bold ${tone === 'light' ? 'text-[#e0a526]' : 'text-[#b27d0e]'}`}>درسگاہ</span>
        </p>
        {subtitle && <p className={`text-xs ${tone === 'light' ? 'text-[#a9d6c0]' : 'text-[#4f7262]'}`}>{subtitle}</p>}
      </div>
    </div>
  );
};

export default Logo;
