import { useEffect } from 'react';

// Adds `.is-in` to every `.reveal` element once it scrolls into view (one-shot, no layout shift).
// Reduced motion is handled in CSS, so elements are simply visible. Without IntersectionObserver they show at once.
export default function useReveal(deps = []) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal:not(.is-in), .stagger-in:not(.is-in)'));
    if (!els.length) return undefined;
    if (typeof IntersectionObserver === 'undefined') { els.forEach((e) => e.classList.add('is-in')); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
