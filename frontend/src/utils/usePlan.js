import { useEffect, useState } from 'react';
import apiClient from './apiClient';

// Which modules the school's plan switches on. While loading (or on error) everything shows,
// the server still blocks anything that is locked.
export default function usePlan() {
  const [plan, setPlan] = useState(null);
  useEffect(() => {
    let alive = true;
    apiClient.get('/schools/my-plan').then((r) => alive && setPlan(r.data)).catch(() => {});
    return () => { alive = false; };
  }, []);
  const has = (key) => !plan || !plan.features || plan.features[key] !== false;
  return { plan, has };
}
