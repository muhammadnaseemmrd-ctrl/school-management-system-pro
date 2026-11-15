import { useEffect, useState } from 'react';
import apiClient from './apiClient';

// School name, logo and payment details (cached for the session)
let cache = null;
export const clearBranding = () => { cache = null; };
export default function useBranding(enabled = true) {
  const [branding, setBranding] = useState(cache);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const token = localStorage.getItem('accessToken');
    if (!token) return undefined;
    if (cache) { setBranding(cache); return undefined; }
    apiClient.get('/schools/branding').then((r) => { cache = r.data.branding; if (alive) setBranding(cache); }).catch(() => {});
    const refresh = () => { cache = null; apiClient.get('/schools/branding').then((r) => { cache = r.data.branding; if (alive) setBranding(cache); }).catch(() => {}); };
    window.addEventListener('branding-changed', refresh);
    return () => { alive = false; window.removeEventListener('branding-changed', refresh); };
  }, [enabled]);
  return branding;
}
