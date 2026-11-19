const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { app } = require('./test-server.cjs');
const route = '/api/member/satin-alma-olcumu';
const parse = r => JSON.parse(r.body);
async function account() {
  const a = await app();
  const r = await a.request('/api/kayit', { ad: 'Measurement Test', email: 'owner@example.invalid', sifre: 'test-password-123', termsVersion: '2026-11-18' });
  return { a, headers: { cookie: r.headers['Set-Cookie'].split(';')[0], host: 'komisyonhesap.com' } };
}
async function pay(a, headers) {
  await a.request('/api/member/odeme-onay', { version: '2026-11-18' }, headers);
  await a.request('/api/odeme-token', {}, headers);
  a.setPayment({ paidPrice: '1600.00', installment: 3 });
  await a.request('/api/odeme-callback', 'token=test-checkout-token');
}
test('measurement requires an authenticated, account-owned provider receipt, not premium status or URL parameters', async () => {
  const { a, headers } = await account();
  assert.equal((await a.request(route)).status, 401);
  a.db.stores.users[0].premium = true;
  assert.equal(parse(await a.request(route + '?odeme=basarili', undefined, headers)).purchase, null);
  await pay(a, headers);
  assert.equal((await a.request(route + '?email=other@example.invalid', undefined, headers)).status, 403);
  a.db.stores.paymentReceipts[0].email = 'other@example.invalid';
  assert.equal(parse(await a.request(route, undefined, headers)).purchase, null);
});
test('verified purchase uses a stable nonpersonal ID and merchant revenue, excluding tax and bank installment charges', async () => {
  const { a, headers } = await account(); await pay(a, headers);
  const response = await a.request(route, undefined, headers), p = parse(response).purchase;
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.match(p.transactionId, /^kh_[a-f0-9]{32}$/);
  assert.equal(p.value, 1250); assert.equal(p.tax, 250); assert.equal(p.total, 1500); assert.equal(p.currency, 'TRY');
  assert.equal(parse(await a.request(route, undefined, headers)).purchase.transactionId, p.transactionId);
  assert(!response.body.includes('owner@example.invalid')); assert(!response.body.includes('p-1'));
  assert.equal(a.db.stores.paymentReceipts[0].paidTotal, 1600);
});
test('stale, future, invalid or unpaid receipts cannot create conversions', async () => {
  const { a, headers } = await account(); await pay(a, headers);
  const receipt = a.db.stores.paymentReceipts[0], original = { ...receipt };
  for (const change of [{ paidAt: new Date(Date.now() - 49 * 3600000) }, { paidAt: new Date(Date.now() + 60000) }, { paidAt: 'invalid' }, { total: 0 }, { total: 'invalid' }, { paidTotal: 1 }, { paidTotal: 'invalid' }, { currency: 'USD' }]) {
    Object.assign(receipt, original, change);
    assert.equal(parse(await a.request(route, undefined, headers)).purchase, null, JSON.stringify(change));
  }
});
const html = fs.readFileSync(__dirname + '/karpanel.html', 'utf8');
const purchaseCode = html.slice(html.indexOf('function trackPurchaseConversion('), html.indexOf('// ── NAVIGATION'));
function frontend(fetch) {
  const events = [], context = { PROXY: '', fetch, gtag: (...args) => events.push(args), trialEntryPoint: () => 'calculator_result' };
  vm.createContext(context); vm.runInContext(purchaseCode, context); return { context, events };
}
const purchase = { transactionId: 'kh_' + 'a'.repeat(32), currency: 'TRY', value: 1250, tax: 250, total: 1500 };
test('concurrent purchase callbacks emit once per transaction and retain the same ID for GA4 and Ads deduplication', async () => {
  const requests = [], f = frontend(async (...args) => { requests.push(args); return { ok: true, json: async () => ({ purchase }) }; });
  await Promise.all([f.context.trackPurchaseConversion(), f.context.trackPurchaseConversion()]);
  assert.equal(f.events.length, 2);
  assert.equal(f.events[0][1], 'purchase'); assert.equal(f.events[0][2].transaction_id, purchase.transactionId);
  assert.equal(f.events[0][2].value, 1250); assert.equal(f.events[0][2].tax, 250);
  assert.equal(f.events[1][1], 'conversion'); assert.equal(f.events[1][2].transaction_id, purchase.transactionId); assert.equal(f.events[1][2].value, 1500);
  assert.equal(requests[0][0], route); assert.equal(requests[0][1].cache, 'no-store'); assert.equal(requests[0][1].credentials, 'same-origin');
  const reloaded = frontend(async () => ({ ok: true, json: async () => ({ purchase }) }));
  await reloaded.context.trackPurchaseConversion();
  assert.equal(reloaded.events[0][2].transaction_id, purchase.transactionId);
});
test('unverified, malformed and failed receipt responses never emit purchases or interrupt the application', async () => {
  for (const fetch of [async () => { throw Error('offline'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ purchase: null }) }), async () => ({ ok: true, json: async () => ({ purchase: { ...purchase, transactionId: 'unsafe-provider-id' } }) })]) {
    const f = frontend(fetch); await f.context.trackPurchaseConversion(); assert.equal(f.events.length, 0);
  }
});
test('checkout starts only for authenticated members when the checkout flow opens', async () => {
  const code = html.slice(html.indexOf('async function odemeYap('), html.indexOf('async function odemeOnayla('));
  const events = [], opened = [], context = { currentUser: null, openAuth: type => opened.push(type), document: { getElementById: () => ({ classList: { add: name => opened.push(name) } }) }, gtag: (...args) => events.push(args), trialEntryPoint: () => 'excel_template' };
  vm.createContext(context); vm.runInContext(code, context);
  await context.odemeYap(); assert.equal(events.length, 0); assert.deepEqual(opened, ['giris']);
  context.currentUser = { premium: false }; await context.odemeYap();
  assert.equal(events[0][1], 'begin_checkout'); assert.equal(events[0][2].entry_point, 'excel_template'); assert.equal(events[0][2].value, 1250);
});
