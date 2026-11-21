import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// Every teacher can report a fault, so the menu item always shows; this tells the screen whether they may also raise requests or work in the purchasing office.
export default function useProcurePresence() {
  const [s, setS] = useState({ officer: false, request: false });
  useEffect(() => {
    let live = true;
    (async () => { try { const r = await apiClient.get('/procure/access'); if (live) setS({ officer: !!r.data.officer, request: !!r.data.request }); } catch (e) { if (live) setS({ officer: false, request: false }); } })();
    return () => { live = false; };
  }, []);
  return s;
}
