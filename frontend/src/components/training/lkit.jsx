import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { plain } from './tkit';
import { errMsg } from '../ui';

// What the learner's screens talk through. A private link sends the link as a header and never a staff token;
// a student signed in as a student uses their ordinary sign-in.
export const linkApi = (key) => {
  const h = { 'X-Learner-Key': key };
  return {
    kind: 'link',
    get: (path, params) => plain.get(`/training/learn${path}`, { params, headers: h }),
    post: (path, body) => plain.post(`/training/learn${path}`, body || {}, { headers: h }),
    blob: (path) => plain.get(`/training/learn${path}`, { responseType: 'blob', headers: h }),
  };
};
export const studentApi = {
  kind: 'student',
  get: (path, params) => apiClient.get(`/training/learn${path}`, { params }),
  post: (path, body) => apiClient.post(`/training/learn${path}`, body || {}),
  blob: (path) => apiClient.get(`/training/learn${path}`, { responseType: 'blob' }),
};

export function useLGet(api, path, params) {
  const [s, setS] = useState({ data: null, loading: true, error: '', status: 0 }); const q = JSON.stringify(params || {});
  const load = useCallback(async () => {
    setS((x) => ({ ...x, loading: true }));
    try { const r = await api.get(path, JSON.parse(q)); setS({ data: r.data, loading: false, error: '', status: 200 }); } catch (e) { setS({ data: null, loading: false, error: errMsg(e, 'Could not load'), status: e.response?.status || 0, code: e.response?.data?.code }); }
  }, [api, path, q]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}
