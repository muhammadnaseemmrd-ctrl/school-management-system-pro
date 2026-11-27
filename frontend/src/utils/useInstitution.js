// What kind of place this is: a school, a college, a university, an academy or a training
// institute. The server decides which screens each kind uses, so the menu here filters from the
// list it sends rather than keeping a second copy of the rules that could drift out of step.

import { useCallback, useEffect, useState } from 'react';
import apiClient from './apiClient';

const FALLBACK = { key: 'school', label: 'School', words: { learner: 'Student', learners: 'Students', group: 'Class', groups: 'Classes' }, hide: [] };

export default function useInstitution() {
  const [mine, setMine] = useState(null);
  const [types, setTypes] = useState([]);

  const load = useCallback(() => {
    apiClient.get('/schools/institution-types')
      .then((r) => { setMine(r.data.mine || FALLBACK); setTypes(r.data.types || []); })
      .catch(() => { setMine(FALLBACK); setTypes([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const shape = mine || FALLBACK;
  return {
    ready: !!mine,
    type: shape,
    types,
    // a screen this kind of place does not use
    hidden: (id) => (shape.hide || []).includes(id),
    // "Students" at a school, "Learners" at an academy, "Trainees" at an institute
    word: (k) => (shape.words && shape.words[k]) || FALLBACK.words[k] || '',
    reload: load,
  };
}
