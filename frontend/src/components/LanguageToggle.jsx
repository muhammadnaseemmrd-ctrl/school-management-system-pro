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
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#2a5cac] bg-[#ffffff] px-2.5 py-2 text-sm sm:gap-2 sm:px-3 font-bold text-[#2a5cac] transition hover:bg-[#eef2f8] ${className}`}
    >
      <Languages size={16} />
      {lang === 'ur' ? 'English' : 'اردو'}
    </button>
  );
};

export default LanguageToggle;
