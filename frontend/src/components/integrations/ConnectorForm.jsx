import React, { useState } from 'react';
import { Modal, Field, inputCls, btnGhost, btnPrimary, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, KIND_LABEL, KIND_HELP, useCatalog, lines, Tag, Note } from './iKit';

const ROLE_WORDS = { teacher: 'Teachers', student: 'Students', admin: 'Administrators' };
const Checks = ({ legend, items, value, onChange, hint }) => (
  <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[#1b2837]">{legend}</legend>{hint && <p className="text-xs text-[#5b6b7b]">{hint}</p>}
    <div className="mt-1 grid gap-1.5">{items.map((i) => (
      <label key={i.k} className="flex items-start gap-2 text-sm text-[#1b2837]"><input type="checkbox" className="mt-1" checked={value.includes(i.k)} onChange={(e) => onChange(e.target.checked ? [...value, i.k] : value.filter((x) => x !== i.k))} /><span>{i.label}{i.tag}</span></label>))}</div></fieldset>
);

// One form for making and changing a connection. Only what the chosen kind needs is shown.
export default function ConnectorForm({ existing, onClose, onDone }) {
  const cat = useCatalog(); const acc = useGet('/group/access');
  const ex = existing || null; const cfg = (ex && ex.config) || {};
  const [kind, setKind] = useState(ex ? ex.kind : 'api_key'); const [name, setName] = useState(ex ? ex.name : ''); const [purpose, setPurpose] = useState(ex ? ex.purpose : '');
  const [scopes, setScopes] = useState(ex ? ex.scopes : []);
  const [ips, setIps] = useState((cfg.allowedIps || []).join('\n')); const [camps, setCamps] = useState(cfg.campusIds || []); const [quota, setQuota] = useState(ex ? ex.quotaPerHour : 1000); const [days, setDays] = useState('');
  const [url, setUrl] = useState(cfg.url || ''); const [events, setEvents] = useState(cfg.events || []);
  const [loginUrl, setLoginUrl] = useState(cfg.loginUrl || ''); const [target, setTarget] = useState(cfg.targetLinkUri || ''); const [redirects, setRedirects] = useState((cfg.redirectUris || []).join('\n')); const [roles, setRoles] = useState(cfg.roles || (kind === 'sso' ? ['admin', 'teacher'] : ['teacher', 'student'])); const [place, setPlace] = useState(cfg.target || 'window'); const [custom, setCustom] = useState(Object.entries(cfg.custom || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [issuer, setIssuer] = useState(cfg.issuer || ''); const [authEp, setAuthEp] = useState(cfg.authorizationEndpoint || ''); const [tokenEp, setTokenEp] = useState(cfg.tokenEndpoint || ''); const [jwks, setJwks] = useState(cfg.jwksUri || ''); const [clientId, setClientId] = useState(cfg.clientId || ''); const [clientSecret, setClientSecret] = useState(''); const [domains, setDomains] = useState((cfg.allowedDomains || []).join('\n'));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const c = cat.data; const mine = c ? c.scopes.filter((s) => s.kinds.includes(kind)) : []; const evs = c ? c.events.filter((e) => scopes.includes(e.scope)) : [];
  const pickKind = (k) => { setKind(k); setScopes([]); setEvents([]); setRoles(k === 'sso' ? ['admin', 'teacher'] : ['teacher', 'student']); };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      let config = {}; const extra = {};
      if (kind === 'api_key') { config = { allowedIps: lines(ips), campusIds: camps }; extra.quotaPerHour = Number(quota); if (days) extra.expiresInDays = Number(days); }
      if (kind === 'webhook') config = { url, events: events.filter((x) => evs.some((y) => y.event === x)) };
      if (kind === 'lti_tool') config = { loginUrl, targetLinkUri: target, redirectUris: lines(redirects), roles, target: place, custom: Object.fromEntries(lines(custom).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })) };
      if (kind === 'sso') config = { issuer, authorizationEndpoint: authEp, tokenEndpoint: tokenEp, jwksUri: jwks, clientId, allowedDomains: lines(domains), roles };
      const body = { name, purpose, scopes, config, ...extra, ...(kind === 'sso' && clientSecret ? { clientSecret } : {}) };
      const r = ex ? await apiClient.put(`/integrations/connectors/${ex.id}`, body) : await apiClient.post('/integrations/connectors', { kind, ...body });
      await onDone(r.data);
    } catch (x) { setErr(errMsg(x, 'That did not work.')); setBusy(false); }
  };
  const needsReview = c && (kind === 'sso' || scopes.some((s) => (c.scopes.find((y) => y.scope === s) || {}).risk === 'high'));
  return (
    <Modal title={ex ? `Change: ${ex.name}` : 'Add a connection'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {!ex && <div className="sm:col-span-2"><Field label="What kind of connection is it?" hint={KIND_HELP[kind]}><select className={inputCls} value={kind} onChange={(e) => pickKind(e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>}
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} /></Field>
        <Field label="Why does the school need it?" hint="Kept in the record. At least 10 characters."><input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} required minLength={10} maxLength={300} /></Field>
        {kind !== 'sso' && c && <Checks legend="What may it see?" hint="Choose only what it needs. Anything marked sensitive waits for a second administrator." items={mine.map((s) => ({ k: s.scope, label: s.label, tag: s.risk === 'high' ? <> <Tag tone="warn">Sensitive</Tag></> : null }))} value={scopes} onChange={setScopes} />}
        {kind === 'api_key' && (<>
          <Field label="Calls allowed per hour"><input className={inputCls} type="number" min={10} max={20000} value={quota} onChange={(e) => setQuota(e.target.value)} /></Field>
          {!ex && <Field label="Lasts for (days)" hint="Leave empty for no end date."><input className={inputCls} type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></Field>}
          <div className="sm:col-span-2"><Field label="Only from these addresses (optional)" hint="One IP address per line."><textarea className={inputCls} rows={2} value={ips} onChange={(e) => setIps(e.target.value)} /></Field></div>
          {acc.data && acc.data.campuses.length > 1 && <Checks legend="Only these campuses (optional)" hint="Leave all unchecked for the whole school." items={acc.data.campuses.map((x) => ({ k: x.campusId, label: x.name }))} value={camps} onChange={setCamps} />}
        </>)}
        {kind === 'webhook' && (<>
          <div className="sm:col-span-2"><Field label="Web address that receives the events" hint="Must start with https://"><input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} required /></Field></div>
          {evs.length ? <Checks legend="Which events?" items={evs.map((x) => ({ k: x.event, label: x.label }))} value={events} onChange={setEvents} /> : <p className="text-sm text-[#5b6b7b] sm:col-span-2">Choose what it may see above, and the events you can send appear here.</p>}
        </>)}
        {kind === 'lti_tool' && (<>
          <Field label="The tool's login address"><input className={inputCls} type="url" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} required /></Field>
          <Field label="The tool's launch address"><input className={inputCls} type="url" value={target} onChange={(e) => setTarget(e.target.value)} required /></Field>
          <div className="sm:col-span-2"><Field label="Addresses the tool may be sent back to" hint="One per line, exactly as the tool lists them."><textarea className={inputCls} rows={2} value={redirects} onChange={(e) => setRedirects(e.target.value)} required /></Field></div>
          <Checks legend="Who may open it?" items={Object.entries(ROLE_WORDS).map(([k, v]) => ({ k, label: v }))} value={roles} onChange={setRoles} />
          <Field label="Opens in"><select className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)}><option value="window">A new window</option><option value="iframe">A frame</option></select></Field>
          <div className="sm:col-span-2"><Field label="Extra values for the tool (optional)" hint="One per line as name=value, such as course=maths7."><textarea className={inputCls} rows={2} value={custom} onChange={(e) => setCustom(e.target.value)} /></Field></div>
        </>)}
        {kind === 'sso' && (<>
          <Field label="Issuer"><input className={inputCls} type="url" value={issuer} onChange={(e) => setIssuer(e.target.value)} required /></Field>
          <Field label="Client id"><input className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)} required /></Field>
          <Field label="Sign-in address"><input className={inputCls} type="url" value={authEp} onChange={(e) => setAuthEp(e.target.value)} required /></Field>
          <Field label="Token address"><input className={inputCls} type="url" value={tokenEp} onChange={(e) => setTokenEp(e.target.value)} required /></Field>
          <Field label="Keys address"><input className={inputCls} type="url" value={jwks} onChange={(e) => setJwks(e.target.value)} required /></Field>
          <Field label={ex ? 'New client secret (leave empty to keep the old one)' : 'Client secret (optional)'}><input className={inputCls} type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Allowed email domains" hint="One per line, such as school.edu.pk. Only people with an account in Aulensia can sign in; nobody is created."><textarea className={inputCls} rows={2} value={domains} onChange={(e) => setDomains(e.target.value)} required /></Field></div>
          <Checks legend="Who may sign in this way?" items={[{ k: 'admin', label: 'Administrators' }, { k: 'teacher', label: 'Teachers' }]} value={roles} onChange={setRoles} />
        </>)}
        {needsReview && <div className="sm:col-span-2"><Note tone="warn">This shares sensitive information or changes how people sign in, so another administrator must look at it before it goes live.</Note></div>}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : ex ? 'Save changes' : 'Add connection'}</button></div>
      </form>
    </Modal>
  );
}
