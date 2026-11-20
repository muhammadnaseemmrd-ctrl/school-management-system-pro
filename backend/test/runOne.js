// Runs a single smoke module on its own (fast feedback):  node test/runOne.js earlyChecks
process.env.VERCEL = '1'; process.env.DATABASE_URL = 'pglite:memory'; process.env.SEED_DEMO = 'true';
process.env.JWT_SECRET = 'test-secret'; process.env.JWT_REFRESH_SECRET = 'test-refresh'; process.env.SUPERADMIN_EMAIL = 'owner@test.local'; process.env.SUPERADMIN_PASSWORD = 'Super@12345';
const http = require('http'); const app = require('../server'); let base; let failures = 0; let checks = 0;
const log = (ok, msg) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
async function call(method, url, token, body, extra) { const res = await fetch(base + '/api' + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(extra || {}) }, body: body ? JSON.stringify(body) : undefined }); let data = null; try { data = await res.json(); } catch { /* not json */ } return { status: res.status, data }; }
const expect = async (label, p, ok = [200, 201]) => { const r = await p; const good = ok.includes(r.status); log(good, `${label} -> ${r.status}${good ? '' : ' ' + JSON.stringify(r.data).slice(0, 260)}`); return r; };
(async () => {
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; await call('GET', '/schools/branding');
  const login = async (email, password) => { const r = await call('POST', '/auth/login', null, { email, password, schoolCode: 'DEMO01' }); return r.data && (r.data.token || r.data.accessToken); };
  const tokens = { admin: await login('admin@demo.school', 'Demo@1234'), teacher: await login('sara.khan@demo.school', 'Teacher@123'), student: await login('ayesha.khan@demo.school', 'Student@123'), parent: await login('parent@demo.school', 'Parent@123') };
  for (const m of String(process.argv[2]).split(',')) await require('./' + m)({ call, expect, log, tokens, base });
  console.log(`\n${checks - failures}/${checks} checks passed`); server.close(); process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(2); });
