// What a connector may be given, in words. Every scope says what it shares and whether it needs a second administrator to look at it first.
const SCOPES = {
  'roster.read': { label: 'Classes, teachers and children (names and class membership)', risk: 'low', categories: ['identity', 'class membership'], kinds: ['api_key', 'webhook'] },
  'roster.contact': { label: 'Email addresses and phone numbers of children and teachers', risk: 'high', categories: ['contact details'], kinds: ['api_key', 'webhook'] },
  'roster.guardians': { label: 'Which guardians belong to which child', risk: 'high', categories: ['guardian links'], kinds: ['api_key', 'webhook'] },
  'attendance.read': { label: 'Daily attendance of children', risk: 'high', categories: ['attendance'], kinds: ['api_key', 'webhook'] },
  'fees.read': { label: 'Fee payments received', risk: 'high', categories: ['fees'], kinds: ['api_key', 'webhook'] },
  'notices.read': { label: 'Published school notices', risk: 'low', categories: ['notices'], kinds: ['api_key', 'webhook'] },
  'lti.name': { label: 'The person\'s name, shown to the learning tool', risk: 'high', categories: ['name'], kinds: ['lti_tool'] },
  'lti.email': { label: 'The person\'s email address, shown to the learning tool', risk: 'high', categories: ['contact details'], kinds: ['lti_tool'] },
};
// events a webhook may ask for, and the scope each needs
const EVENTS = {
  'student.enrolled': { scope: 'roster.read', label: 'A child is enrolled' },
  'student.left': { scope: 'roster.read', label: 'A child leaves the school' },
  'payment.received': { scope: 'fees.read', label: 'A fee payment is received' },
  'attendance.absent': { scope: 'attendance.read', label: 'A child is marked absent' },
  'notice.published': { scope: 'notices.read', label: 'A notice is published' },
};
const KINDS = {
  api_key: { label: 'API key', help: 'A key for a system the school owns or trusts to read information. Shown once. Read-only.' },
  webhook: { label: 'Webhook', help: 'The school tells another system when something happens, with a signature the receiver can check.' },
  lti_tool: { label: 'Learning tool (LTI 1.3)', help: 'Lets teachers and students open an outside learning tool from Aulensia without a second sign-in.' },
  sso: { label: 'Sign-in provider (SSO)', help: 'Lets teachers and administrators sign in with the school\'s own account provider (OpenID Connect).' },
};
const HIGH = (scopes) => scopes.filter((s) => SCOPES[s] && SCOPES[s].risk === 'high');
// why a second administrator must look at it first (empty = it can go live straight away)
function reviewWhy(kind, scopes) {
  const why = HIGH(scopes).map((s) => `Shares: ${SCOPES[s].label}`);
  if (kind === 'sso') why.push('Lets people sign in to the school through another provider');
  if (kind === 'lti_tool') why.push('Sends information about people to an outside tool');
  return why;
}
const categoriesOf = (scopes) => [...new Set(scopes.flatMap((s) => (SCOPES[s] ? SCOPES[s].categories : [])))];
const RETRY_MINUTES = [1, 5, 30, 120, 360];     // after the 1st, 2nd... failed attempt; after the sixth failure the delivery is dead
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
const PAUSE_AFTER = 20;                          // consecutive failed deliveries before a webhook is paused
module.exports = { SCOPES, EVENTS, KINDS, HIGH, reviewWhy, categoriesOf, RETRY_MINUTES, MAX_ATTEMPTS, PAUSE_AFTER };
