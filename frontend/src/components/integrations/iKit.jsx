import React from 'react';
import { Tag, useGet } from '../group/gKit';
export { useGet, call, Tabs, Loading, Note, Table, Td, Reason, AskForm, Tag, Value, Bar, dt, day, PageBar, download } from '../group/gKit';
export { ShowOnce } from '../training/tkit';

export const KIND_LABEL = { api_key: 'API key', webhook: 'Webhook', lti_tool: 'Learning tool', sso: 'Sign-in provider' };
export const KIND_HELP = {
  api_key: 'A key for a system the school trusts to read information. It can only read, and it is shown once.',
  webhook: 'The school tells another system when something happens, with a signature the other system can check.',
  lti_tool: 'Teachers and students open an outside learning tool from Aulensia without a second sign-in.',
  sso: 'Teachers and administrators sign in with the school\'s own account provider.',
};
const CSTATUS = { draft: ['Not turned on', 'none'], pending_review: ['Waiting for review', 'warn'], active: ['On', 'good'], paused: ['Paused', 'warn'], revoked: ['Removed', 'bad'] };
export const CStatus = ({ s }) => { const m = CSTATUS[s] || [s, 'none']; return <Tag tone={m[1]}>{m[0]}</Tag>; };
const DSTATUS = { pending: ['Waiting to be sent', 'info'], delivered: ['Delivered', 'good'], failed: ['Will try again', 'warn'], dead: ['Gave up', 'bad'] };
export const DStatus = ({ s }) => { const m = DSTATUS[s] || [s, 'none']; return <Tag tone={m[1]}>{m[0]}</Tag>; };
export const useCatalog = () => useGet('/integrations/catalog');
export const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
