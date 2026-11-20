import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ur from './ur';
import { startAutoTranslate, stopAutoTranslate } from './autoTranslate';
import { getOverride, onOverrides } from './overrides';

// English text is the key. Missing Urdu entries fall back to the English text, so a screen that is
// only partly translated still works. {name} style placeholders are replaced from `vars`.
const LanguageContext = createContext({ lang: 'en', t: (k) => k, setLang: () => {}, isRtl: false, locale: 'en-GB', fmtDate: () => '' });

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('lang') === 'ur' ? 'ur' : 'en'; } catch (e) { return 'en'; }
  });
  const isRtl = lang === 'ur';
  const [ov, setOv] = useState(0); // the school's own wording changed
  useEffect(() => onOverrides(() => setOv((n) => n + 1)), []);

  useEffect(() => {
    try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.body.classList.toggle('lang-ur', isRtl);
    if (isRtl) startAutoTranslate(); else stopAutoTranslate();
    return () => stopAutoTranslate();
  }, [lang, isRtl, ov]);

  const t = useCallback((key, vars) => {
    const s = (lang === 'ur' && (getOverride(key) || ur[key])) || key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : s;
  }, [lang, ov]);

  const locale = isRtl ? 'ur-PK' : 'en-GB';
  const fmtDate = useCallback((key, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!key) return '';
    return new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', ...opts });
  }, [locale]);

  const value = useMemo(() => ({ lang, setLang: setLangState, t, isRtl, locale, fmtDate }), [lang, t, isRtl, locale, fmtDate]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLang = () => useContext(LanguageContext);
