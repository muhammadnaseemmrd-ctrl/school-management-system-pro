import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// The Training menu item shows only to people who have something there: an instructor with courses, or a student who has been made a learner.
export default function useTrainingPresence(role) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (role === 'student') { const r = await apiClient.get('/training/learn/me'); if (live) setHas(!!r.data.learner); }
        else if (role === 'teacher') { const r = await apiClient.get('/training/courses'); if (live) setHas(r.data.courses.length > 0); }
      } catch (e) { if (live) setHas(false); }
    })();
    return () => { live = false; };
  }, [role]);
  return has;
}
