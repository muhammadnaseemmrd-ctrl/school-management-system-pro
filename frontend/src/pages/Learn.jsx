import React, { useEffect, useMemo, useState } from 'react';
import LearnerApp from '../components/training/LearnerApp';
import { linkApi } from '../components/training/lkit';

// The learner's private page. The link (`/learn#lk_…`) is the way in: it is kept in this browser, taken out of the address bar,
// and sent in a header. Nobody needs a password.
const KEY_STORE = 'learnerKey'; const OK = /^lk_[a-f0-9]{48}$/;
const read = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
export default function Learn() {
  const [key, setKey] = useState(() => { const h = window.location.hash.replace(/^#\/?/, ''); return OK.test(h) ? h : read(); });
  const [paste, setPaste] = useState(''); const [err, setErr] = useState('');
  useEffect(() => {
    document.title = 'My courses · Aulensia';
    const h = window.location.hash.replace(/^#\/?/, '');
    if (OK.test(h)) { try { localStorage.setItem(KEY_STORE, h); } catch (e) { /* kept in memory for this visit */ } window.history.replaceState(null, '', window.location.pathname); }
  }, []);
  const api = useMemo(() => (key ? linkApi(key) : null), [key]);
  const leave = () => { try { localStorage.removeItem(KEY_STORE); } catch (e) { /* nothing stored */ } setKey(''); };
  const submit = (e) => { e.preventDefault(); const m = paste.match(/lk_[a-f0-9]{48}/); if (!m) { setErr('That does not look like a private link. It ends with lk_ and a long code.'); return; } try { localStorage.setItem(KEY_STORE, m[0]); } catch (x) { /* kept in memory */ } setErr(''); setKey(m[0]); };
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {api ? <LearnerApp api={api} onSignOut={leave} /> : (
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">Aulensia</p>
            <h1 className="text-center text-2xl font-semibold text-[#1b2837]">Open your courses</h1>
            <p className="text-center text-sm text-[#3b4a5c]">Use the private link the school gave you. Paste it here, or open it from the message you saved.</p>
            <form onSubmit={submit} className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Your private link</span><input className="w-full rounded-lg border border-[#e3e7e7] bg-white px-3 py-2.5 font-mono text-xs text-[#1b2837] outline-none focus:border-[#2a5cac]" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/learn#lk_…" autoComplete="off" /></label>{err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}<button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#2a5cac] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234c91]">Open my courses</button></form>
            <p className="text-center text-xs text-[#5b6b7b]">Lost your link? Ask the school to make a new one.</p>
          </div>
        )}
      </div>
    </main>
  );
}
