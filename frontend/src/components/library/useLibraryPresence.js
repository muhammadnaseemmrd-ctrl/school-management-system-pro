import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// The Library menu item shows for students and teachers whose school has it switched on, and tells a teacher whether they also work the desk or the store till.
export default function useLibraryPresence(role) {
  const [s, setS] = useState({ has: false, desk: false, till: false });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const me = await apiClient.get('/library/me/enabled'); let acc = { data: {} };
        if (role === 'teacher') acc = await apiClient.get('/library/access').catch(() => ({ data: {} }));
        if (live) setS({ has: me.data.enabled !== false, desk: !!acc.data.desk, till: !!acc.data.till });
      } catch (e) { if (live) setS({ has: false, desk: false, till: false }); }
    })();
    return () => { live = false; };
  }, [role]);
  return s;
}
