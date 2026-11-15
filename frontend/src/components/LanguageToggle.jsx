import React from 'react';
import { Languages } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';

// One-tap switch between English and Urdu
const LanguageToggle = ({ className = '' }) => {
  const { lang, setLang } = useLang();
  const next = lang === 'ur' ? 'en' : 'ur';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={lang === 'ur' ? 'Switch to English' : 'اردو میں تبدیل کریں'}
      className={`inline-flex items-center gap-2 rounded-full border border-[#b68c67] bg-[#fffaf3] px-3 py-2 text-sm font-bold text-[#7a4e2d] transition hover:bg-[#f0e0cd] ${className}`}
    >
      <Languages size={16} />
      {lang === 'ur' ? 'English' : 'اردو'}
    </button>
  );
};

export default LanguageToggle;
