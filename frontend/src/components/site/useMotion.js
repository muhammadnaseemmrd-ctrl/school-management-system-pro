import { useEffect, useRef, useState } from 'react';

// True when the visitor has asked their device for less motion.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(q.matches);
    q.addEventListener ? q.addEventListener('change', on) : q.addListener(on);
    return () => { q.removeEventListener ? q.removeEventListener('change', on) : q.removeListener(on); };
  }, []);
  return reduced;
}

// True once the element has been on screen (one-shot by default), or while it is on screen when `once` is false.
export function useInView(options = {}) {
  const { once = true, margin = '0px 0px -10% 0px', threshold = 0.15 } = options;
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); if (once) io.disconnect(); } else if (!once) setSeen(false); });
    }, { rootMargin: margin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [once, margin, threshold]);
  return [ref, seen];
}

// True on phones and other narrow screens, so heavy scenes can be lighter there.
export function useNarrow(max = 768) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < max);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < max);
    window.addEventListener('resize', on, { passive: true });
    return () => window.removeEventListener('resize', on);
  }, [max]);
  return narrow;
}
