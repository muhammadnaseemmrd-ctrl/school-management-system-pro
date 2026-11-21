import React, { useEffect, useState } from 'react';
import DriverApp from '../components/transport/DriverApp';

// The driver's private page. The link (`/driver#<id>.<key>`) is the way in: it is kept on this phone, taken out of the address bar, and sent in headers.
const STORE = 'driverLink'; const OK = /^[a-f0-9]{24}\.[A-Za-z0-9_-]{20,}$/;
const read = () => { try { return localStorage.getItem(STORE) || ''; } catch (e) { return ''; } };
export default function Driver() {
  const [link, setLink] = useState(() => { const h = window.location.hash.replace(/^#\/?/, ''); return OK.test(h) ? h : read(); });
  const [paste, setPaste] = useState(''); const [err, setErr] = useState('');
  useEffect(() => {
    document.title = 'Driver · Aulensia';
    const h = window.location.hash.replace(/^#\/?/, '');
    if (OK.test(h)) { try { localStorage.setItem(STORE, h); } catch (e) { /* kept in memory for this visit */ } window.history.replaceState(null, '', window.location.pathname); }
  }, []);
  const leave = () => { try { localStorage.removeItem(STORE); localStorage.removeItem('driverQueue'); } catch (e) { /* nothing stored */ } setLink(''); };
  const submit = (e) => { e.preventDefault(); const m = paste.match(/[a-f0-9]{24}\.[A-Za-z0-9_-]{20,}/); if (!m) { setErr('That does not look like a driver link. It ends with a long code.'); return; } try { localStorage.setItem(STORE, m[0]); } catch (x) { /* kept in memory */ } setErr(''); setLink(m[0]); };
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-3 py-5"><div className="mx-auto max-w-lg">
      {link ? <DriverApp link={link} onLeave={leave} /> : (
        <div className="space-y-4"><p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">Aulensia</p><h1 className="text-center text-2xl font-semibold text-[#1b2837]">Driver page</h1>
          <p className="text-center text-sm text-[#3b4a5c]">Use the private link the school gave you. Paste it here, or open it from the message you saved.</p>
          <form onSubmit={submit} className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Your private link</span><input className="w-full rounded-lg border border-[#e3e7e7] bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-[#2a5cac]" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/driver#…" autoComplete="off" /></label>{err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}<button className="mt-3 rounded-lg bg-[#2a5cac] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234c91]">Open my trips</button></form>
          <p className="text-center text-xs text-[#5b6b7b]">Lost your link? Ask the school office to make a new one.</p></div>)}
    </div></main>
  );
}
