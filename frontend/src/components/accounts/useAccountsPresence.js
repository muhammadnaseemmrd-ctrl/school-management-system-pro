import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

// A teacher sees the Accounts menu only when an administrator has given them a part in the books (prepare, approve or read).
export default function useAccountsPresence() {
  const [s, setS] = useState({ prepare: false, approve: false, audit: false, admin: false, ready: false, has: false });
  useEffect(() => {
    let live = true;
    (async () => { try { const r = await apiClient.get('/accounts/access'); if (live) setS({ prepare: !!r.data.prepare, approve: !!r.data.approve, audit: !!r.data.audit, admin: !!r.data.admin, ready: !!r.data.ready, has: !!(r.data.prepare || r.data.approve || r.data.audit || r.data.admin) }); } catch (e) { if (live) setS((x) => ({ ...x, has: false })); } })();
    return () => { live = false; };
  }, []);
  return s;
}
