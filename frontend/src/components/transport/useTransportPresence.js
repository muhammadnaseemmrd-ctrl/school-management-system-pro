import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// A teacher sees the Transport menu only when an administrator has given them the dispatcher or manager permission.
export default function useTransportPresence() {
  const [s, setS] = useState({ manage: false, dispatch: false });
  useEffect(() => {
    let live = true;
    (async () => { try { const r = await apiClient.get('/transport/access'); if (live) setS({ manage: !!r.data.manage, dispatch: !!r.data.dispatch }); } catch (e) { if (live) setS({ manage: false, dispatch: false }); } })();
    return () => { live = false; };
  }, []);
  return s;
}
