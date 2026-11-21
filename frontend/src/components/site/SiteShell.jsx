import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaWhatsapp } from 'react-icons/fa';
import { ArrowRight, Menu, X } from 'lucide-react';
import Logo from '../Logo';
import LanguageToggle from '../LanguageToggle';
import DemoRequest, { captureCampaign } from '../DemoRequest';
import { NAV, WHATSAPP_DISPLAY, whatsappLink } from './siteData';
import './site.css';

const Ctx = createContext({ openAsk: () => {}, jump: () => {} });
export const useSite = () => useContext(Ctx);

const WA_GREEN = '#0f7a6a'; // dark enough for white text and a white icon (contrast above 5:1)

// Moves to a part of the home page, or to the home page first when the visitor is somewhere else.
function useJump() {
  const nav = useNavigate(); const loc = useLocation();
  return useCallback((id) => {
    if (id === 'about') { nav('/about'); return; }
    if (loc.pathname !== '/') { nav(id === 'top' ? '/' : `/#${id}`); return; }
    if (id === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [nav, loc.pathname]);
}

export function WhatsAppButton({ className = '' }) {
  return (
    <a href={whatsappLink()} target="_blank" rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp" title={`WhatsApp ${WHATSAPP_DISPLAY}`}
      className={`group inline-flex items-center gap-2 rounded-full px-3.5 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-[1.03] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40 ${className}`}
      style={{ background: WA_GREEN }}>
      <FaWhatsapp className="h-6 w-6" aria-hidden="true" />
      <span className="hidden sm:inline">Chat on WhatsApp</span>
    </a>
  );
}

function Header({ onDemo }) {
  const [menu, setMenu] = useState(false); const [solid, setSolid] = useState(false);
  const loc = useLocation(); const jump = useJump();
  useEffect(() => { const on = () => setSolid(window.scrollY > 8); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  const click = (e, item) => { e.preventDefault(); setMenu(false); jump(item.id); };
  const here = (item) => (item.id === 'about' ? loc.pathname === '/about' : false);
  return (
    <header className={`sticky top-0 z-40 border-b transition-colors ${solid ? 'border-[#a9b4bf] bg-[#f7f6f2]/90 backdrop-blur' : 'border-transparent bg-[#f7f6f2]/70 backdrop-blur-sm'}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <Link to="/" aria-label="Aulensia home" className="text-start" onClick={(e) => { if (loc.pathname === '/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.id} href={n.to} onClick={(e) => click(e, n)} aria-current={here(n) ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold transition hover:bg-[#eef2f8] ${here(n) ? 'text-[#2a5cac]' : 'text-[#3b4a5c]'}`}>{n.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 xl:flex">
          <Link to="/login" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-[#3b4a5c] transition hover:bg-[#eef2f8]">Login</Link>
          <Link to="/register" className="whitespace-nowrap rounded-lg border border-[#2a5cac] px-4 py-2 text-sm font-semibold text-[#2a5cac] transition hover:bg-[#eef2f8]">Register School</Link>
          <button type="button" onClick={onDemo} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#2a5cac] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#234c91]">Request a Demo <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button>
        </div>
        <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-xl border border-[#a9b4bf] p-2 text-[#2a5cac] xl:hidden" aria-label="Menu" aria-expanded={menu} aria-controls="site-menu">
          {menu ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {menu && (
        <div id="site-menu" className="max-h-[80vh] overflow-y-auto border-t border-[#e3e7e7] bg-[#f7f6f2] px-5 pb-5 xl:hidden">
          <nav aria-label="Main" className="grid gap-1 py-3">
            {NAV.map((n) => (<a key={n.id} href={n.to} onClick={(e) => click(e, n)} className="rounded-xl px-3 py-3 text-sm font-semibold text-[#3b4a5c] hover:bg-[#eef2f8]">{n.label}</a>))}
            <Link to="/agent/login" className="rounded-xl px-3 py-3 text-sm font-semibold text-[#3b4a5c] hover:bg-[#eef2f8]">Partner sign-in</Link>
          </nav>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/login" className="rounded-lg border border-[#2a5cac] px-4 py-3 text-center text-sm font-semibold text-[#2a5cac]">Login</Link>
            <Link to="/register" className="rounded-lg border border-[#2a5cac] px-4 py-3 text-center text-sm font-semibold text-[#2a5cac]">Register School</Link>
          </div>
          <button type="button" onClick={() => { setMenu(false); onDemo(); }} className="mt-3 w-full rounded-lg bg-[#2a5cac] px-4 py-3 text-sm font-semibold text-white">Request a Demo</button>
        </div>
      )}
    </header>
  );
}

function Footer({ onDemo }) {
  const jump = useJump();
  const link = (id, label) => (<a href={id === 'about' ? '/about' : id === 'top' ? '/' : `/#${id}`} onClick={(e) => { e.preventDefault(); jump(id); }} className="hover:text-[#2a5cac]">{label}</a>);
  return (
    <footer className="border-t border-[#a9b4bf] bg-[#f7f6f2] px-5 py-12 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo subtitle="School management system for Pakistan" />
          <p className="mt-4 text-sm leading-6 text-[#5b6b7b]">One connected workspace for admissions, classrooms, attendance, fees, staff, families and campus life, in English and Urdu.</p>
          <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" data-no-i18n className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: WA_GREEN }}>
            <FaWhatsapp className="h-5 w-5" aria-hidden="true" /> <bdi dir="ltr">{WHATSAPP_DISPLAY}</bdi>
          </a>
        </div>
        <nav aria-label="Explore" className="text-sm font-semibold text-[#3b4a5c]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a4636]">Explore</p>
          <ul className="mt-3 space-y-2">
            <li>{link('top', 'Overview')}</li><li>{link('platform', 'Platform')}</li><li>{link('how', 'How it works')}</li><li>{link('who', "Who it's for")}</li><li>{link('pricing', 'Pricing')}</li><li>{link('faq', 'FAQ')}</li>
          </ul>
        </nav>
        <nav aria-label="Company" className="text-sm font-semibold text-[#3b4a5c]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a4636]">Aulensia</p>
          <ul className="mt-3 space-y-2">
            <li>{link('about', 'About us')}</li>
            <li><button type="button" onClick={onDemo} className="text-start hover:text-[#2a5cac]">Request a Demo</button></li>
            <li><a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="hover:text-[#2a5cac]">Contact on WhatsApp</a></li>
          </ul>
        </nav>
        <nav aria-label="Product" className="text-sm font-semibold text-[#3b4a5c]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a4636]">Product</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/login" className="hover:text-[#2a5cac]">Login</Link></li>
            <li><Link to="/register" className="hover:text-[#2a5cac]">Register School</Link></li>
            <li><Link to="/agent/login" className="hover:text-[#2a5cac]">Partner sign-in</Link></li>
            <li><a href="/#demo" onClick={(e) => { e.preventDefault(); jump('demo'); }} className="hover:text-[#2a5cac]">Try the demo school</a></li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-7xl border-t border-[#e3e7e7] pt-5 text-sm text-[#5b6b7b]">© 2026 Aulensia. All rights reserved.</p>
    </footer>
  );
}

export default function SiteShell({ children }) {
  const [ask, setAsk] = useState(null); const jump = useJump();
  const { isAuthenticated } = useSelector((state) => state.auth); // signed-in people already have the app's own bar
  useEffect(() => { captureCampaign(); }, []);
  const value = useMemo(() => ({ openAsk: (i = 'demo') => setAsk(i), jump }), [jump]);
  return (
    <Ctx.Provider value={value}>
      <div className="min-h-screen bg-[#f7f6f2] text-[#1b2837]">
        {!isAuthenticated && <Header onDemo={() => setAsk('demo')} />}
        <main>{children}</main>
        <Footer onDemo={() => setAsk('demo')} />
        <div className="fixed end-4 bottom-4 z-50 flex flex-col items-end gap-3">
          <WhatsAppButton />
          <LanguageToggle />
        </div>
        <DemoRequest open={!!ask} interest={ask || 'demo'} onClose={() => setAsk(null)} />
      </div>
    </Ctx.Provider>
  );
}
