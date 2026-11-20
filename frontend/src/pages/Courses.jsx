import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { plain, money, day, TBadge } from '../components/training/tkit';

const KEY_STORE = 'learnerKey';
const msg = (e, fb) => e?.response?.data?.message || fb;
const field = 'w-full rounded-lg border border-[#e3e7e7] bg-white px-3 py-2.5 text-sm text-[#1b2837] outline-none focus:border-[#2a5cac]';
const btn = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#2a5cac] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#234c91] disabled:opacity-60';
const ghost = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3e7e7] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b2837] hover:bg-[#f7f6f2]';

function Shell({ school, children }) {
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="text-center"><p className="text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{school?.name || 'Aulensia'}</p></header>
        {children}
        <footer className="pt-4 text-center text-xs text-[#5b6b7b]">Already a learner? <Link className="text-[#2a5cac] underline" to="/learn">Open your courses</Link> · <Link className="text-[#2a5cac] underline" to="/verify-credential">Check a certificate</Link></footer>
      </div>
    </main>
  );
}

// Buying: name, email, consent. Nothing is paid here: the school sends payment details and confirms the payment when it arrives.
function Checkout({ code, target, currency, terms, onClose }) {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', cohortId: target.cohorts?.[0]?._id || '', installments: 1, coupon: '', consent: false, website: '' });
  const [quote, setQuote] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(null); const [copied, setCopied] = useState(false);
  const ref = target.bundleId ? { bundleId: target.bundleId } : { courseId: target.courseId };
  useEffect(() => {
    let live = true; const t = setTimeout(() => { plain.post(`/public/training/${code}/quote`, { ...ref, coupon: f.coupon || undefined, installments: Number(f.installments) || 1 }).then((r) => live && setQuote(r.data)).catch(() => live && setQuote(null)); }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.coupon, f.installments, code, target.courseId, target.bundleId]);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await plain.post(`/public/training/${code}/checkout`, { ...ref, name: f.name, email: f.email, phone: f.phone, cohortId: f.cohortId || undefined, installments: Number(f.installments) || 1, coupon: f.coupon || undefined, consent: f.consent, website: f.website }); setDone(r.data); } catch (x) { setErr(msg(x, 'We could not place your order. Please try again.')); setBusy(false); }
  };
  if (done) {
    const link = done.key ? `${window.location.origin}/learn#${done.key}` : '';
    return (
      <section className="rounded-2xl border border-[#9ad0b6] bg-white p-5" aria-live="polite">
        <h2 className="text-lg font-semibold text-[#1f6b4d]">{done.free ? 'You are in' : 'Your order is placed'}</h2>
        <p className="mt-1 text-sm">{done.order.title} · order {done.order.orderNo}{done.order.total ? ` · ${money(done.order.total, done.order.currency)}` : ''}</p>
        {done.message && <p className="mt-2 text-sm text-[#3b4a5c]">{done.message}</p>}
        {link && <div className="mt-3"><p className="text-xs font-semibold text-[#3b4a5c]">Your private link</p><div className="mt-1 break-all rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-3 font-mono text-xs" data-testid="private-link">{link}</div><div className="mt-2 flex flex-wrap gap-2"><button className={ghost} onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch (e) { setCopied(false); } }}>{copied ? 'Copied' : 'Copy the link'}</button><button className={btn} onClick={() => { try { localStorage.setItem(KEY_STORE, done.key); } catch (e) { /* the link still works from the copy */ } nav('/learn'); }}>Open my courses</button></div></div>}
        {!done.free && done.paymentInstructions && <div className="mt-4 rounded-xl bg-[#f7f6f2] p-3 text-sm"><b>How to pay</b><p className="mt-1 whitespace-pre-wrap">{done.paymentInstructions}</p><p className="mt-2 text-xs text-[#5b6b7b]">After you pay, open your courses, go to "My orders" and send the payment reference. The course opens when the school confirms your payment.</p></div>}
      </section>
    );
  }
  return (
    <form onSubmit={go} className="rounded-2xl border border-[#e3e7e7] bg-white p-5" aria-label={`Order ${target.title}`}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[#1b2837]">Order: {target.title}</h2><button type="button" className={ghost} onClick={onClose}>Close</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Your name</span><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} autoComplete="name" /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Email</span><input className={field} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Phone (optional)</span><input className={field} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
        {target.cohorts?.length > 0 && <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Which run</span><select className={field} value={f.cohortId} onChange={(e) => setF({ ...f, cohortId: e.target.value })}>{target.cohorts.map((c) => <option key={c._id} value={c._id}>{c.name}{c.startsAt ? ` · starts ${day(c.startsAt)}` : ''}{c.seatsLeft !== null ? ` · ${c.seatsLeft} seats left` : ''}</option>)}</select></label>}
        {target.price > 0 && (target.maxInstalments || 1) > 1 && <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Pay in instalments (up to {target.maxInstalments})</span><input className={field} type="number" min="1" max={target.maxInstalments} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></label>}
        {target.price > 0 && <label className="block"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Discount code (optional)</span><input className={field} value={f.coupon} onChange={(e) => setF({ ...f, coupon: e.target.value })} maxLength={24} /></label>}
        <div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label></div>
      </div>
      {quote && quote.total >= 0 && target.price > 0 && (
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 rounded-xl bg-[#f7f6f2] p-3 text-sm" aria-live="polite">
          <dt>Price</dt><dd>{money(quote.list, currency)}</dd>{quote.discount > 0 && <><dt>Discount</dt><dd>− {money(quote.discount, currency)}</dd></>}<dt>{quote.taxLabel || 'Tax'} ({quote.taxPercent ?? terms?.taxPercent ?? 0}%)</dt><dd>{money(quote.tax, currency)}</dd><dt className="font-semibold">Total</dt><dd className="font-semibold">{money(quote.total, currency)}</dd>
          {quote.installments?.length > 1 && <><dt className="col-span-2 mt-1 text-xs text-[#5b6b7b]">{quote.installments.map((i) => `${money(i.amount, currency)} by ${day(i.due)}`).join(' · ')}</dt></>}
          {quote.couponNote && <dt className="col-span-2 text-xs text-[#9f1239]">{quote.couponNote}</dt>}
        </dl>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} required /> <span>I agree to the terms below.{terms ? ` Refunds within ${terms.refundDays} days. ${terms.jurisdiction || ''}` : ''}</span></label>
      {err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}
      <div className="mt-3"><button className={btn} disabled={busy || !f.consent}>{busy ? 'Placing your order…' : target.price > 0 ? 'Place the order' : 'Join for free'}</button><p className="mt-2 text-xs text-[#5b6b7b]">You do not pay on this page. After you order, the school shows how to pay and opens the course when it confirms your payment.</p></div>
    </form>
  );
}

function List({ code }) {
  const [s, setS] = useState({ loading: true, data: null, error: '' }); const [buy, setBuy] = useState(null);
  useEffect(() => { document.title = 'Courses · Aulensia'; let live = true; plain.get(`/public/training/${code}`).then((r) => live && setS({ loading: false, data: r.data, error: '' })).catch((e) => live && setS({ loading: false, data: null, error: e.response?.status === 404 ? 'This school has no courses on sale right now.' : 'We could not load the courses. Please try again.' })); return () => { live = false; }; }, [code]);
  const d = s.data;
  return (
    <Shell school={d?.school}>
      {s.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Loading"><div className="skeleton h-24" /></div>}
      {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
      {d && (
        <>
          <div className="text-center"><h1 className="text-2xl font-semibold text-[#1b2837]">{d.headline || 'Courses'}</h1>{d.about && <p className="mx-auto mt-2 max-w-2xl text-sm text-[#3b4a5c]">{d.about}</p>}</div>
          <ul className="grid gap-3 sm:grid-cols-2">{d.courses.map((c) => (
            <li key={c._id}><article className="h-full rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]"><Link className="hover:underline" to={`/courses/${code}/${c.slug}`}>{c.title}</Link></h2>{c.headline && <p className="text-xs text-[#5b6b7b]">{c.headline}</p>}<p className="mt-1 text-sm text-[#3b4a5c]">{c.summary}</p><p className="mt-2 text-sm font-semibold">{c.price ? money(c.price, d.currency) : 'Free'}{c.level ? <span className="font-normal text-[#5b6b7b]"> · {c.level}</span> : null}</p>{c.nextCohort && <p className="text-xs text-[#5b6b7b]">Next start {day(c.nextCohort)}</p>}<div className="mt-3"><Link className={btn} to={`/courses/${code}/${c.slug}`} aria-label={`See ${c.title}`}>See the course</Link></div></article></li>
          ))}</ul>
          {d.bundles.length > 0 && <><h2 className="text-lg font-semibold text-[#1b2837]">Bundles and learning paths</h2><ul className="grid gap-3 sm:grid-cols-2">{d.bundles.map((b) => <li key={b._id}><article className="h-full rounded-2xl border border-[#e3e7e7] bg-white p-5"><h3 className="font-semibold">{b.title}</h3><p className="mt-1 text-sm text-[#3b4a5c]">{b.summary}</p><p className="mt-2 text-sm font-semibold">{money(b.price, d.currency)} <span className="font-normal text-[#5b6b7b]">· {b.courses} courses{b.ordered ? ', taken in order' : ''}</span></p><div className="mt-3"><button className={btn} onClick={() => setBuy(b)} aria-label={`Order ${b.title}`}>Order this bundle</button></div></article></li>)}</ul></>}
          {buy && <Checkout code={code} currency={d.currency} target={{ bundleId: buy._id, title: buy.title, price: buy.price, cohorts: [], maxInstalments: 1 }} onClose={() => setBuy(null)} />}
        </>
      )}
    </Shell>
  );
}

function Course({ code, slug }) {
  const [s, setS] = useState({ loading: true, data: null, error: '' }); const [buy, setBuy] = useState(false); const [open, setOpen] = useState({});
  useEffect(() => { let live = true; plain.get(`/public/training/${code}/course/${slug}`).then((r) => { if (live) { setS({ loading: false, data: r.data, error: '' }); document.title = `${r.data.course.title} · ${r.data.school.name}`; } }).catch((e) => live && setS({ loading: false, data: null, error: e.response?.status === 404 ? 'We could not find that course.' : 'We could not load the course. Please try again.' })); return () => { live = false; }; }, [code, slug]);
  const d = s.data; const c = d?.course;
  return (
    <Shell school={d?.school}>
      <Link className="text-sm text-[#2a5cac] underline" to={`/courses/${code}`}>All courses</Link>
      {s.loading && <div className="rounded-2xl border border-[#e3e7e7] bg-white p-6" role="status" aria-label="Loading"><div className="skeleton h-32" /></div>}
      {s.error && <div className="rounded-2xl border border-[#e3b4ac] bg-[#fff8f6] p-5 text-sm text-[#9f1239]" role="alert">{s.error}</div>}
      {d && (
        <>
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5">
            <h1 className="text-2xl font-semibold text-[#1b2837]">{c.title}</h1>{c.landing?.headline && <p className="mt-1 text-[#3b4a5c]">{c.landing.headline}</p>}<p className="mt-2 text-sm text-[#3b4a5c]">{c.summary}</p>
            <p className="mt-3 text-sm"><b>{c.price ? money(c.price, d.currency) : 'Free'}</b> · {c.lessons} lessons · {c.hours >= 1 ? `about ${c.hours} hours` : `about ${Math.max(1, Math.round(c.hours * 60))} minutes`}{c.level ? ` · ${c.level}` : ''}{c.access?.days ? ` · ${c.access.days} days of access` : ' · no end to access'}{c.installments?.max > 1 ? ` · up to ${c.installments.max} instalments` : ''}</p>
            <div className="mt-3"><button className={btn} onClick={() => setBuy(true)}>{c.price ? 'Order this course' : 'Join for free'}</button></div>
          </section>
          {buy && <Checkout code={code} currency={d.currency} terms={d.terms} target={{ courseId: c._id, title: c.title, price: c.price, cohorts: d.cohorts, maxInstalments: c.installments?.max }} onClose={() => setBuy(false)} />}
          {c.landing?.outcomes?.length > 0 && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">What you will be able to do</h2><ul className="mt-2 list-disc ps-5 text-sm">{c.landing.outcomes.map((o, i) => <li key={i}>{o}</li>)}</ul></section>}
          {(c.landing?.requirements?.length > 0 || c.landing?.audience) && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">Before you start</h2>{c.landing.audience && <p className="mt-1 text-sm">Who it is for: {c.landing.audience}</p>}{c.landing.requirements?.length > 0 && <ul className="mt-2 list-disc ps-5 text-sm">{c.landing.requirements.map((o, i) => <li key={i}>{o}</li>)}</ul>}</section>}
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">Syllabus</h2>
            {d.syllabus.map((m, mi) => <div key={mi} className="mt-3"><h3 className="text-sm font-semibold">{m.title}</h3><ul className="mt-1 grid gap-1 text-sm">{m.lessons.map((l, li) => { const k = `${mi}-${li}`; return <li key={k} className="rounded-lg border border-[#f0f1f1] px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span>{l.title} <span className="text-xs text-[#5b6b7b]">· {l.kind}{l.minutes ? ` · ${l.minutes} min` : ''}</span></span>{l.preview && <button className="text-xs font-semibold text-[#2a5cac] underline" aria-expanded={!!open[k]} onClick={() => setOpen({ ...open, [k]: !open[k] })} aria-label={`Free preview of ${l.title}`}>{open[k] ? 'Hide the preview' : 'Free preview'}</button>}</div>{open[k] && l.body && <p className="mt-2 whitespace-pre-wrap rounded bg-[#f7f6f2] p-2 text-xs">{l.body}</p>}</li>; })}</ul></div>)}
            {c.skills?.length > 0 && <p className="mt-3 text-xs text-[#5b6b7b]">Skills on your certificate: {c.skills.map((x) => x.name || x.code).join(', ')}</p>}
          </section>
          {d.instructors.length > 0 && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">Your instructors</h2><ul className="mt-2 grid gap-2 text-sm">{d.instructors.map((i, k) => <li key={k}><b>{i.name}</b>{i.credentials ? <span className="text-xs text-[#5b6b7b]"> · {i.credentials}</span> : null}{i.bio && <p>{i.bio}</p>}</li>)}</ul></section>}
          {d.cohorts.length > 0 && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">Dates</h2><ul className="mt-2 grid gap-1 text-sm">{d.cohorts.map((x) => <li key={x._id}>{x.name} · {x.mode === 'self' ? 'self-paced' : `${x.sessions} live sessions`} · {day(x.startsAt)} to {day(x.endsAt)}{x.seatsLeft !== null ? ` · ${x.seatsLeft} seats left` : ''}</li>)}</ul></section>}
          {c.landing?.faq?.length > 0 && <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5"><h2 className="font-semibold text-[#1b2837]">Questions</h2><dl className="mt-2 grid gap-2 text-sm">{c.landing.faq.map((f, i) => <div key={i}><dt className="font-semibold">{f.q}</dt><dd className="text-[#3b4a5c]">{f.a}</dd></div>)}</dl></section>}
          <section className="rounded-2xl border border-[#e3e7e7] bg-white p-5 text-sm"><h2 className="font-semibold text-[#1b2837]">Terms</h2><p className="mt-1">{d.terms.taxPercent ? `${d.terms.taxLabel || 'Tax'} of ${d.terms.taxPercent}% is added to the price. ` : 'No tax is added. '}You can ask for a refund within {d.terms.refundDays} days of paying. {d.terms.jurisdiction}</p>{c.price > 0 && <p className="mt-1 text-xs text-[#5b6b7b]">You pay the school directly. Nothing is charged on this page.</p>}</section>
        </>
      )}
    </Shell>
  );
}

export default function Courses() { const { code, slug } = useParams(); return slug ? <Course code={String(code).toUpperCase()} slug={slug} /> : <List code={String(code).toUpperCase()} />; }
