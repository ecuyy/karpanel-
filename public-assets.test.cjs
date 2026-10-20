const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { createPublicAssets } = require('./public-assets');
const serve = createPublicAssets(__dirname);
function request(pathname, headers = {}, method = 'GET') {
  const res = { writeHead(status, fields) { this.status = status; this.headers = fields; }, end(body) { this.body = body || Buffer.alloc(0); } };
  res.handled = serve({ method, headers }, res, pathname);
  return res;
}
const original = fs.readFileSync(__dirname + '/karpanel.html', 'utf8');
const home = request('/');
const html = home.body.toString();
test('styles, executable scripts and images preserve their exact content', () => {
  const css = original.match(/<style>([\s\S]*?)<\/style>/)[1];
  const cssURL = html.match(/href="(\/assets\/[^\"]+\.css)"/)[1];
  assert.equal(request(cssURL).body.toString(), css);
  const scripts = [...original.matchAll(/<script>([\s\S]*?)<\/script>/g)].slice(1).map(m => m[1]);
  const urls = [...html.matchAll(/<script defer src="([^\"]+)"><\/script>/g)].map(m => m[1]);
  assert.equal(urls.length, scripts.length);
  urls.forEach((url, i) => { const js = request(url).body.toString(); assert.equal(js, scripts[i]); new vm.Script(js); });
  const images = [...original.matchAll(/data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/g)];
  const assetImages = [...html.matchAll(/\/assets\/kh-[a-f0-9]+\.(?:png|jpg|svg|webp)/g)].map(m => m[0]);
  assert.equal(images.length, assetImages.length);
  images.forEach((image, i) => assert.deepEqual(request(assetImages[i]).body, Buffer.from(image[2], 'base64')));
  assert(home.body.length < Buffer.byteLength(original) * 0.35);
});
test('compressed representations roundtrip, respect q=0, and support conditional GET/HEAD', () => {
  for (const [encoding, decode] of [['br', zlib.brotliDecompressSync], ['gzip', zlib.gunzipSync]]) {
    const response = request('/', { 'accept-encoding': encoding });
    assert.equal(response.headers['Content-Encoding'], encoding);
    assert.deepEqual(decode(response.body), home.body);
    assert.equal(response.headers.Vary, 'Accept-Encoding');
    assert.equal(response.headers['Content-Length'], response.body.length);
  }
  assert.equal(request('/', { 'accept-encoding': 'br;q=0,gzip;q=0' }).headers['Content-Encoding'], undefined);
  assert.equal(request('/', { 'accept-encoding': 'br;q=0.5,gzip;q=1' }).headers['Content-Encoding'], 'gzip');
  assert.equal(request('/', { 'if-none-match': '"other", ' + home.headers.ETag }).status, 304);
  assert.equal(request('/', {}, 'HEAD').body.length, 0);
  const url = html.match(/href="(\/assets\/[^\"]+\.css)"/)[1];
  assert.match(request(url).headers['Cache-Control'], /max-age=31536000, immutable/);
});
test('private routes, APIs, unknown assets and writes never enter the public cache', () => {
  for (const pathname of ['/admin', '/api/giris', '/api/admin/users', '/assets/../server.js', '/assets/missing.js']) assert.equal(request(pathname).handled, false);
  assert.equal(request('/', {}, 'POST').handled, false);
  for (const slug of ['trendyol-komisyon-hesaplama', 'trendyol-maliyet-hesaplama', 'trendyol-net-kar-hesaplama', 'trendyol-stopaj-hesaplama', 'trendyolda-zarar-eden-urun-nasil-bulunur']) {
    assert.deepEqual(request('/' + slug).body, fs.readFileSync(__dirname + '/' + slug + '.html'));
    assert.equal(request('/' + slug + '/').status, 200);
  }
});
console.log(JSON.stringify({ htmlBefore: Buffer.byteLength(original), htmlAfter: home.body.length, brotliHTML: request('/', { 'accept-encoding': 'br' }).body.length }));
