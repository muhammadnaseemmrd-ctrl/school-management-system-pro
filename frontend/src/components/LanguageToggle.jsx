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
      className={`inline-flex items-center gap-2 rounded-full border border-[#2f8f6f] bg-[#fbfdfb] px-3 py-2 text-sm font-bold text-[#0f6b4f] transition hover:bg-[#e3efe8] ${className}`}
    >
      <Languages size={16} />
      {lang === 'ur' ? 'English' : 'اردو'}
    </button>
  );
};

export default LanguageToggle;
