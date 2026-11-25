import { useEffect, useRef } from 'react';

// Dashboards scroll inside their own container (not the window), so a tab change would otherwise
// leave the reader halfway down the new page. Attach the returned ref to that container.
export default function useScrollTop(key) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [key]);
  return ref;
}
