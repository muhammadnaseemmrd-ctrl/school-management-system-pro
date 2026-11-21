import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// A teacher sees these menus only when an administrator gave them a part in it. Nothing is shown while we are still asking.
export default function usePresence() {
  const [s, setS] = useState({ ready: false, advancement: false, security: false });
  useEffect(() => {
    let live = true;
    (async () => {
      const [a, c] = await Promise.all([apiClient.get('/advancement/me').catch(() => null), apiClient.get('/security/me').catch(() => null)]);
      if (!live) return; const d = a?.data;
      setS({ ready: true, advancement: !!(d && (d.alumni || d.giving || d.quality || d.board || d.wide)), security: !!c?.data?.operate });
    })();
    return () => { live = false; };
  }, []);
  return s;
}
