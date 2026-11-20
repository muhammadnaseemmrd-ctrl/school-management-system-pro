import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// The registrar menu item shows only to people who have something there: a student placed in a programme,
// or an instructor with sections or advisees. Schools that do not use the registrar never see it.
export default function useRegistrarPresence(role) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        if (role === 'student') { const r = await apiClient.get('/registrar/me'); if (live) setHas(!!r.data.program || r.data.terms.length > 0); }
        else if (role === 'teacher') { const [a, b] = await Promise.all([apiClient.get('/registrar/my/sections'), apiClient.get('/registrar/my/advisees')]); if (live) setHas(a.data.sections.length > 0 || b.data.advisees.length > 0); }
      } catch (e) { if (live) setHas(false); }
    };
    run(); return () => { live = false; };
  }, [role]);
  return has;
}
