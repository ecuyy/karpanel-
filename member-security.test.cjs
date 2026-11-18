const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { app, memory } = require('./test-server.cjs');
const security = require('./member-security');
const account = (email = 'owner@example.invalid') => ({ ad: 'Test Account', email, sifre: 'test-password-123', termsVersion: '2026-11-18' });
const cookieOf = response => ({ cookie: response.headers['Set-Cookie'].split(';')[0], host: 'komisyonhesap.com' });
async function signup(a, email) { return a.request('/api/kayit', account(email)); }
const parse = r => JSON.parse(r.body);

test('passwords have unique salted scrypt hashes; migration preserves paid membership and products', async () => {
  const hash = await security.hashPassword('example-password');
  assert(await security.verifyPassword('example-password', hash));
  assert(!(await security.verifyPassword('wrong', hash)));
  assert.notEqual(hash, await security.hashPassword('example-password'));
  const db = memory();
  await db.collection('users').insertOne({ email: 'old@example.invalid', sifre: 'legacy-password', premium: true, uyelikBitis: new Date('2030-01-01') });
  await db.collection('urunler').insertOne({ email: 'old@example.invalid', urunler: [{ title: 'Preserved product' }] });
  const a = await app(db), user = db.stores.users[0];
  assert.equal(user.sifre, undefined); assert(await security.verifyPassword('legacy-password', user.passwordHash));
  assert.equal(user.premium, true); assert.equal(db.stores.urunler[0].urunler.length, 1);
  const login = await a.request('/api/giris', { email: user.email, sifre: 'legacy-password' });
  assert.equal(login.status, 200); assert.equal(parse(login).user.premium, true);
});
test('registration requires document acceptance and returns only a secure, server-verified session', async () => {
  const a = await app();
  assert.equal((await a.request('/api/kayit', { ...account(), termsVersion: undefined })).status, 400);
  const r = await signup(a); assert.equal(r.status, 200);
  assert.match(r.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
  assert(!r.body.includes('passwordHash')); assert(!r.body.includes('test-password-123'));
  assert.equal(a.db.stores.users[0].sifre, undefined);
  assert.equal(a.db.stores.users[0].termsVersion, '2026-11-18');
  assert.equal((await a.request('/api/member/oturum', undefined, cookieOf(r))).status, 200);
  assert.equal((await a.request('/api/giris', { email: account().email, sifre: { $ne: '' } })).status, 401);
});
test('anonymous, forged, cross-origin and cross-account product or invoice requests cannot access data', async () => {
  const a = await app(); const login = await signup(a), headers = cookieOf(login);
  for (const route of ['/api/urunler/yukle?email=owner@example.invalid', '/api/member/oturum']) assert.equal((await a.request(route)).status, 401);
  assert.equal((await a.request('/api/urunler/kaydet', { email: account().email, urunler: [] })).status, 401);
  assert.equal((await a.request('/api/urunler/yukle', undefined, { cookie: '__Host-kh_member=' + 'a'.repeat(64) })).status, 401);
  assert.equal((await a.request('/api/urunler/kaydet', { email: 'other@example.invalid', urunler: [] }, headers)).status, 403);
  assert.equal((await a.request('/api/fatura/kaydet', { email: { $ne: '' }, fatura: {} }, headers)).status, 403);
  assert.equal((await a.request('/api/urunler/yukle?email=other@example.invalid', undefined, headers)).status, 403);
  assert.equal((await a.request('/api/urunler/kaydet', { urunler: [] }, { ...headers, origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await a.request('/api/urunler/kaydet', { urunler: [{ title: 'Own product' }] }, headers)).status, 200);
  assert.equal(parse(await a.request('/api/urunler/yukle', undefined, headers)).urunler[0].title, 'Own product');
});
test('member sessions survive restarts, expire, and are revoked at logout', async () => {
  const a = await app(), login = await signup(a), headers = cookieOf(login);
  const restarted = await app(a.db);
  assert.equal((await restarted.request('/api/member/oturum', undefined, headers)).status, 200);
  assert.equal((await restarted.request('/api/member/cikis', {}, headers)).status, 200);
  assert.equal((await a.request('/api/member/oturum', undefined, headers)).status, 401);
  const again = await a.request('/api/giris', { email: account().email, sifre: account().sifre });
  a.db.stores.memberSessions[0].expiresAt = new Date(0);
  assert.equal((await a.request('/api/member/oturum', undefined, cookieOf(again))).status, 401);
});
test('changing a password verifies the old password and revokes all other sessions', async () => {
  const a = await app(), first = await signup(a), headers = cookieOf(first);
  const second = await a.request('/api/giris', { email: account().email, sifre: account().sifre });
  assert.equal((await a.request('/api/sifre-degistir', { eskiSifre: 'wrong', yeniSifre: 'new-password-123' }, headers)).status, 401);
  const changed = await a.request('/api/sifre-degistir', { eskiSifre: account().sifre, yeniSifre: 'new-password-123' }, headers);
  assert.equal(changed.status, 200);
  assert.equal((await a.request('/api/member/oturum', undefined, cookieOf(second))).status, 401);
  assert.equal((await a.request('/api/member/oturum', undefined, cookieOf(changed))).status, 200);
  assert.equal((await a.request('/api/giris', { email: account().email, sifre: account().sifre })).status, 401);
  assert.equal((await a.request('/api/giris', { email: account().email, sifre: 'new-password-123' })).status, 200);
});
test('data requests are authenticated and admin deletion removes linked products and sessions', async () => {
  const a = await app(), login = await signup(a), headers = cookieOf(login);
  assert.equal((await a.request('/api/member/veri-talebi', { tip: 'silme' })).status, 401);
  const request = await a.request('/api/member/veri-talebi', { tip: 'silme', aciklama: '<script>example</script>' }, headers);
  assert.equal(request.status, 200); assert.equal(a.db.stores.privacyRequests[0].email, account().email);
  await a.request('/api/urunler/kaydet', { urunler: [{ title: 'Owned data' }] }, headers);
  const admin = await a.request('/api/admin/giris', { sifre: 'test-admin' }), adminHeaders = cookieOf(admin);
  const list = await a.request('/admin/veri-talepleri', undefined, adminHeaders);
  assert.equal(list.status, 200); assert(!list.body.includes('<script>example</script>')); assert(list.body.includes('&lt;script&gt;'));
  assert.equal((await a.request('/api/admin/sil', { email: account().email }, adminHeaders)).status, 200);
  assert.equal(a.db.stores.users.length, 0); assert.equal(a.db.stores.urunler.length, 0); assert.equal(a.db.stores.memberSessions.length, 0);
});
test('payment is bound to its authenticated owner, legal acceptance, amount and provider token', async () => {
  const a = await app(), login = await signup(a), headers = cookieOf(login);
  assert.equal((await a.request('/api/odeme-token', {}, headers)).status, 400);
  assert.equal((await a.request('/api/member/odeme-onay', { version: 'old' }, headers)).status, 400);
  assert.equal((await a.request('/api/member/odeme-onay', { version: '2026-11-18' }, headers)).status, 200);
  assert.equal((await a.request('/api/odeme-token', {}, headers)).status, 200);
  assert.equal(a.db.stores.pendingPayments[0].email, account().email);
  const paid = await a.request('/api/odeme-callback?email=other@example.invalid', 'token=test-checkout-token');
  assert.equal(paid.status, 200); assert.equal(a.db.stores.users[0].premium, true);
  const end = a.db.stores.users[0].uyelikBitis;
  assert.equal(a.db.stores.paymentReceipts[0].email, account().email);
  assert.equal((await a.request('/api/odeme-callback', 'token=test-checkout-token')).status, 303);
  assert.equal(a.db.stores.users[0].uyelikBitis, end);
  assert.equal((await a.request('/api/odeme-callback?email=owner@example.invalid', 'token=unknown-token')).status, 400);
});
test('a successful-looking payment with the wrong amount cannot activate premium', async () => {
  const a = await app(), login = await signup(a), headers = cookieOf(login);
  await a.request('/api/member/odeme-onay', { version: '2026-11-18' }, headers);
  await a.request('/api/odeme-token', {}, headers); a.setPayment({ paidPrice: '1.00' });
  await a.request('/api/odeme-callback', 'token=test-checkout-token');
  assert.equal(a.db.stores.users[0].premium, false);
});
test('all legal pages and consent code are public, while signup and payment record their versions', async () => {
  const a = await app();
  for (const slug of ['kvkk', 'gizlilik', 'kullanim', 'cerez', 'mesafeli', 'onbilgi', 'teslimat', 'sirket']) {
    const r = await a.request('/yasal/' + slug); assert.equal(r.status, 200); assert.match(r.body, /18 Kasım 2026/); assert.match(r.body, /privacy.js/);
  }
  assert.equal((await a.request('/privacy.js')).status, 200);
  assert((await a.request('/legal-content.js')).body.includes('KH_POLICY_CONTENT'));
  assert(!fs.readFileSync(__dirname + '/karpanel.html', 'utf8').includes('sunucularımızda saklanmaz'));
});

test('password reset tokens expire, are single-use, and never remain as plaintext in the database', async () => {
  const crypto = require('node:crypto'), a = await app(), login = await signup(a);
  const token = 'b'.repeat(64), tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await a.db.collection('users').updateOne({ email: account().email }, { $set: { resetTokenHash: tokenHash, resetTokenExpiry: new Date(Date.now() + 60000) } });
  const reset = await a.request('/api/sifre-sifirla-token', { token, yeniSifre: 'reset-password-123' });
  assert.equal(reset.status, 200);
  assert.equal(a.db.stores.users[0].resetTokenHash, undefined); assert.equal(a.db.stores.users[0].sifre, undefined);
  assert.equal((await a.request('/api/member/oturum', undefined, cookieOf(login))).status, 401);
  assert.equal((await a.request('/api/sifre-sifirla-token', { token, yeniSifre: 'other-password-123' })).status, 400);
  assert.equal((await a.request('/api/giris', { email: account().email, sifre: 'reset-password-123' })).status, 200);
  await a.db.collection('users').updateOne({ email: account().email }, { $set: { resetTokenHash: tokenHash, resetTokenExpiry: new Date(0) } });
  assert.equal((await a.request('/api/sifre-sifirla-token', { token, yeniSifre: 'expired-password-123' })).status, 400);
  assert.equal((await a.request('/sifre-sifirla?token=%3Cscript%3E')).status, 400);
});


test('verified installment payments retain the agreed basket price and actual charged total', async () => {
  const a = await app(), login = await signup(a), headers = cookieOf(login);
  await a.request('/api/member/odeme-onay', { version: '2026-11-18' }, headers);
  await a.request('/api/odeme-token', {}, headers); a.setPayment({ price: '1500.00', paidPrice: '1600.00', installment: 3 });
  await a.request('/api/odeme-callback', 'token=test-checkout-token');
  assert.equal(a.db.stores.users[0].premium, true); assert.equal(a.db.stores.paymentReceipts[0].total, 1500); assert.equal(a.db.stores.paymentReceipts[0].paidTotal, 1600);
});
