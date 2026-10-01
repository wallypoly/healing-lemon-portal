const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let ok = 0;
function test(name, fn) {
  try { fn(); console.log('✓', name); ok++; }
  catch (e) { console.error('✗', name, '\n ', e.message); process.exitCode = 1; }
}
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function has(p) { return fs.existsSync(path.join(root, p)); }
function assert(v, msg) { if (!v) throw new Error(msg); }

test('single Firebase architecture has no production SQLite/server.js', () => {
  assert(!has('server.js'), 'legacy server.js should not exist');
  assert(!has('data/life-train.db'), 'SQLite database should not exist');
  assert(!read('package.json').includes('better-sqlite3'), 'root package should not depend on SQLite');
});
test('Firebase runtime files exist', () => {
  for (const p of ['firebase.json','firestore.rules','storage.rules','functions/index.js','public/assets/firebase-config.js']) assert(has(p), `missing ${p}`);
});
test('custom browser auth token was removed', () => {
  const core = read('public/assets/core.js');
  assert(!core.includes('lt_token'), 'legacy lt_token found');
  assert(core.includes('getIdToken()'), 'Firebase ID token not used');
});
test('receipt upload is private Firebase Storage path', () => {
  const core = read('public/assets/core.js');
  const rules = read('storage.rules');
  assert(core.includes('receipts/${user.uid}/${registrationId}/'), 'receipt path is not user scoped');
  assert(rules.includes('request.auth.uid == uid'), 'storage owner rule missing');
});
test('seat reservation counts pending registrations', () => {
  const fn = read('functions/index.js');
  assert(fn.includes("['pending_payment', 'paid', 'confirmed', 'attended']"), 'holding status invariant missing');
  assert(fn.includes('reserved_count'), 'reserved_count transaction missing');
});
test('user creation is admin-only', () => {
  const fn = read('functions/index.js');
  assert(fn.includes("app.post('/admin/users', requireAdmin"), 'user creation must require admin');
});
test('Healing Lemon UI uses Ning-Mon and yellow/blue brand', () => {
  const css = read('public/assets/style.css');
  const app = read('public/app.html');
  assert(css.includes('--gold:#FFE45E') && css.includes('--brand:#2188F5'), 'brand colors missing');
  assert(app.includes('ningmon-front.webp'), 'Ning-Mon not present in app hero');
});
test('no insecure default password shipped in UI', () => {
  const joined = ['public/login.html','public/assets/login.js','README.md'].map(read).join('\n');
  assert(!joined.includes('ChangeMe123!'), 'default password found');
});

if (!process.exitCode) console.log(`\n${ok} architecture smoke checks passed.`);
