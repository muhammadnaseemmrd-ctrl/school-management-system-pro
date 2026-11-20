import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import apiClient from '../utils/apiClient';
import { setOverrides, setMissingSender, resetMissing } from '../i18n/overrides';
import { useLang } from '../i18n/LanguageContext';
import { cssFor, clean, DEFAULTS, DARK_PAPER } from './color';

// School colours, dark mode and the school's own web address (PRD E27).
// The build turned every colour in the app into a variable; this works out the values and writes them into one <style>.
const CACHE = 'aul-theme-cache'; const MODE = 'aul-mode'; const HOST = 'aul-host-brand';
const ThemeContext = createContext({ tokens: DEFAULTS, mode: 'light', userMode: 'auto', setUserMode: () => {}, preview: () => {}, previewing: false, hostBrand: null, reloadTheme: () => {}, version: 0 });
export const useTheme = () => useContext(ThemeContext);

const readManifest = () => {
  const out = new Set();
  const take = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').split(',').filter(Boolean).forEach((x) => out.add(x));
  try { take(getComputedStyle(document.documentElement).getPropertyValue('--aul-colors')); } catch (e) { /* ignore */ }
  if (import.meta.env.DEV) document.querySelectorAll('style').forEach((st) => { const m = /--aul-colors:\s*"([^"]*)"/g; let r; while ((r = m.exec(st.textContent || ''))) take(r[1]); });
  return [...out].join(',');
};
const systemDark = () => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } };
const pickMode = (tokens, userMode, sys) => (userMode === 'light' || userMode === 'dark' ? userMode : tokens.mode === 'system' ? (sys ? 'dark' : 'light') : tokens.mode);
const platformHost = (h) => !h || h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || /\.(vercel\.app|onrender\.com|netlify\.app|herokuapp\.com)$/.test(h);

export function ThemeProvider({ children }) {
  const { user, isAuthenticated } = useSelector((s) => s.auth);
  const { lang } = useLang();
  const schoolUser = !!user && isAuthenticated && user.role !== 'superadmin' && user.role !== 'agent';
  const [live, setLive] = useState(() => { try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); return c ? { tokens: clean(c.tokens), version: c.version || 0 } : { tokens: { ...DEFAULTS }, version: 0 }; } catch (e) { return { tokens: { ...DEFAULTS }, version: 0 }; } });
  const [hostBrand, setHostBrand] = useState(() => { try { return JSON.parse(sessionStorage.getItem(HOST) || 'null'); } catch (e) { return null; } });
  const [userMode, setUserModeState] = useState(() => { try { const m = localStorage.getItem(MODE); return m === 'light' || m === 'dark' ? m : 'auto'; } catch (e) { return 'auto'; } });
  const [sys, setSys] = useState(systemDark);
  const [draft, setDraft] = useState(null); // a theme being tried in the studio, not saved
  const manifest = useRef('');

  useEffect(() => { try { const q = window.matchMedia('(prefers-color-scheme: dark)'); const f = () => setSys(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); } catch (e) { return undefined; } }, []);

  // who owns this web address? (the school's own address, not the shared one)
  useEffect(() => {
    const host = window.location.hostname.toLowerCase(); if (platformHost(host)) return;
    apiClient.get('/public/brand', { params: { host } }).then((r) => { setHostBrand(r.data); try { sessionStorage.setItem(HOST, JSON.stringify(r.data)); } catch (e) { /* ignore */ } }).catch(() => { setHostBrand(null); try { sessionStorage.removeItem(HOST); } catch (e) { /* ignore */ } });
  }, []);

  const reloadTheme = useCallback(() => apiClient.get('/theme/current').then((r) => setLive({ tokens: clean(r.data.tokens), version: r.data.version || 0 })).catch(() => {}), []);
  const reloadWording = useCallback(() => apiClient.get('/theme/i18n/overrides').then((r) => setOverrides(r.data.ur)).catch(() => {}), []);
  useEffect(() => {
    if (schoolUser) { reloadTheme(); reloadWording(); return undefined; }
    setOverrides({}); setLive({ tokens: hostBrand ? clean(hostBrand.theme) : { ...DEFAULTS }, version: 0 });
    return undefined;
  }, [schoolUser, hostBrand, reloadTheme, reloadWording]);
  useEffect(() => { const f = () => { reloadTheme(); reloadWording(); }; window.addEventListener('theme-changed', f); return () => window.removeEventListener('theme-changed', f); }, [reloadTheme, reloadWording]);

  // labels without Urdu (only while Urdu is on and someone is signed in)
  useEffect(() => {
    if (!schoolUser || lang !== 'ur') { setMissingSender(null); return undefined; }
    resetMissing(); setMissingSender((labels) => { apiClient.post('/theme/i18n/missing', { labels }).catch(() => {}); });
    return () => setMissingSender(null);
  }, [schoolUser, lang]);

  const tokens = draft || live.tokens; const mode = pickMode(tokens, userMode, sys);
  useEffect(() => {
    const m = manifest.current || (manifest.current = readManifest());
    let el = document.getElementById('aul-theme'); if (!el) { el = document.createElement('style'); el.id = 'aul-theme'; document.head.appendChild(el); }
    el.textContent = cssFor(tokens, mode, m);
    const root = document.documentElement; root.dataset.theme = mode; root.style.colorScheme = mode;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', mode === 'dark' ? DARK_PAPER : tokens.primary);
    if (!draft) { try { localStorage.setItem(CACHE, JSON.stringify({ tokens, version: live.version, mode: tokens.mode, light: cssFor(tokens, 'light', m), dark: cssFor(tokens, 'dark', m) })); } catch (e) { /* ignore */ } }
  }, [tokens, mode, draft, live.version]);

  const setUserMode = useCallback((m) => { setUserModeState(m); try { if (m === 'auto') localStorage.removeItem(MODE); else localStorage.setItem(MODE, m); } catch (e) { /* ignore */ } }, []);
  const preview = useCallback((t) => setDraft(t ? clean(t) : null), []);
  const value = useMemo(() => ({ tokens: live.tokens, mode, userMode, setUserMode, preview, previewing: !!draft, hostBrand, reloadTheme, reloadWording, version: live.version }), [live, mode, userMode, setUserMode, preview, draft, hostBrand, reloadTheme, reloadWording]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
