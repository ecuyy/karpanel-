const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function setup(saved) {
  const nodes = {}, added = [], storage = new Map(), cookies = new Map([['_ga_old', 'old']]); let reloads = 0;
  if (saved) storage.set('kh_privacy_v1', JSON.stringify({ version: '2026-11-18', at: Date.now(), ...saved }));
  const node = id => nodes[id] || (nodes[id] = { id, hidden: false, checked: false, events: {}, setAttribute(k, v) { this[k] = v; }, addEventListener(name, fn) { this.events[name] = fn; }, focus() {} });
  const document = { readyState: 'complete', referrer: '', head: { appendChild(n) { added.push(n); } }, body: { appendChild(n) { nodes[n.id] = n; } }, createElement: tag => ({ tag, setAttribute() {}, addEventListener(name, fn) { this.events = this.events || {}; this.events[name] = fn; } }), getElementById: node };
  Object.defineProperty(document, 'cookie', { get: () => [...cookies].map(([k, v]) => k + '=' + v).join(';'), set: text => { const name = text.split('=')[0]; if (text.includes('Max-Age=0')) cookies.delete(name); } });
  const window = {}, location = { origin: 'https://komisyonhesap.com', pathname: '/', hostname: 'komisyonhesap.com', reload() { reloads++; } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/privacy.js', 'utf8'), { window, document, location, localStorage: { getItem: key => storage.get(key), setItem: (k, v) => storage.set(k, v) }, Date });
  return { window, nodes, added, storage, cookies, get reloads() { return reloads; }, scripts: () => added.filter(n => n.tag === 'script'), click: id => node(id).events.click() };
}
test('before a choice and after rejection no Google code or queued event is created', () => {
  const a = setup(); assert.equal(a.scripts().length, 0);
  a.window.gtag('event', 'signup'); a.window.gtag('event', 'conversion', { send_to: 'AW-123' });
  assert.equal(a.window.dataLayer.length, 0);
  a.click('kh-cookie-reject'); assert.equal(a.scripts().length, 0);
  assert.equal(a.cookies.size, 0); assert.equal(JSON.parse(a.storage.get('kh_privacy_v1')).analytics, false);
  assert.equal(setup({ analytics: false, marketing: false }).scripts().length, 0);
});
test('analytics and marketing are separate opt-ins and events follow the selected purpose', () => {
  const a = setup(); a.window.khOpenCookiePreferences();
  a.nodes['kh-cookie-analytics'].checked = true; a.click('kh-cookie-save');
  assert.equal(a.scripts().length, 1); assert(a.scripts()[0].src.includes('G-2YV09HMHWK'));
  const configs = a.window.dataLayer.filter(row => row[0] === 'config');
  assert.equal(configs.length, 1); assert.equal(configs[0][1], 'G-2YV09HMHWK');
  const before = a.window.dataLayer.length; a.window.gtag('event', 'conversion', { send_to: 'AW-123' }); assert.equal(a.window.dataLayer.length, before);
  a.window.gtag('event', 'calculator_use'); assert.equal(a.window.dataLayer.length, before + 1);
  const b = setup({ analytics: false, marketing: true }); assert(b.scripts()[0].src.includes('AW-16989542935'));
  assert.equal(b.window.dataLayer.filter(row => row[0] === 'config').length, 1);
});
test('withdrawing a previously accepted purpose clears cookies and reloads with rejected defaults', () => {
  const a = setup({ analytics: true, marketing: true });
  assert.equal(a.scripts().length, 1); a.click('kh-cookie-reject');
  assert.equal(a.reloads, 1); assert.equal(a.cookies.size, 0);
  const saved = JSON.parse(a.storage.get('kh_privacy_v1')); assert.equal(saved.analytics, false); assert.equal(saved.marketing, false);
  assert.equal(setup(saved).scripts().length, 0);
});
test('every public calculator and the blog use the common consent controller', () => {
  const files = ['karpanel.html', ...fs.readdirSync(__dirname).filter(name => /^trendyol.*\.html$/.test(name))];
  for (const file of files) { const html = fs.readFileSync(__dirname + '/' + file, 'utf8'); assert(html.includes('src="/privacy.js"'), file); assert(!html.includes("script.src='https://www.googletagmanager.com"), file); }
  assert(fs.readFileSync(__dirname + '/server.js', 'utf8').includes('<script src="/privacy.js"></script>'));
});
