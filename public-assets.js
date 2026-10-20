'use strict';
// Separate transport/caching from the original page: never rewrite calculation code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

function createPublicAssets(root) {
  const assets = new Map();
  const digest = data => crypto.createHash('sha256').update(data).digest('hex').slice(0, 20);
  function resource(data, type, cache) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const item = { raw, type, cache, etag: 'W/"' + digest(raw) + '"' };
    if (/^(text\/|application\/javascript|image\/svg\+xml)/.test(type)) {
      item.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } });
      item.gzip = zlib.gzipSync(raw, { level: 6 });
    }
    return item;
  }
  function add(data, extension, type) {
    const name = '/assets/kh-' + digest(data) + '.' + extension;
    if (!assets.has(name)) assets.set(name, resource(data, type, 'public, max-age=31536000, immutable'));
    return name;
  }
  let html = fs.readFileSync(path.join(root, 'karpanel.html'), 'utf8');
  // Retain the exact CSS bytes, including responsive rules and animations.
  html = html.replace(/<style>([\s\S]*?)<\/style>/g, (_, css) =>
    '<link rel="stylesheet" href="' + add(css, 'css', 'text/css; charset=utf-8') + '">');
  const bodyStart = html.indexOf('<body');
  const preload = [];
  // Classic defer scripts execute in document order, before DOMContentLoaded.
  // Head analytics and structured data remain inline and unchanged.
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (tag, js, offset) => {
    if (offset < bodyStart) return tag;
    const src = add(js, 'js', 'application/javascript; charset=utf-8');
    if (Buffer.byteLength(js) > 10000) preload.push('<link rel="preload" as="script" href="' + src + '">');
    return '<script defer src="' + src + '"></script>';
  });
  // Decode only markup assets, after executable scripts have been removed.
  html = html.replace(/data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/g, (_, subtype, bytes) => {
    const extension = subtype === 'svg+xml' ? 'svg' : subtype === 'jpeg' ? 'jpg' : subtype;
    return add(Buffer.from(bytes, 'base64'), extension, 'image/' + subtype);
  });
  html = html.replace('</head>', preload.join('\n') + '\n</head>');
  const home = resource(html, 'text/html; charset=utf-8', 'public, max-age=60, stale-while-revalidate=300');
  const pages = new Map([['/', home], ['/index.html', home]]);
  for (const slug of ['trendyol-komisyon-hesaplama', 'trendyol-maliyet-hesaplama', 'trendyol-net-kar-hesaplama', 'trendyol-stopaj-hesaplama', 'trendyolda-zarar-eden-urun-nasil-bulunur']) {
    const page = resource(fs.readFileSync(path.join(root, slug + '.html')), 'text/html; charset=utf-8', 'public, max-age=300');
    pages.set('/' + slug, page);
    pages.set('/' + slug + '/', page);
  }
  return function servePublic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const item = assets.get(pathname) || pages.get(pathname);
    if (!item) return false;
    const qualities = new Map((req.headers['accept-encoding'] || '').toLowerCase().split(',').map(part => {
      const [name, ...params] = part.trim().split(';');
      const q = params.find(p => p.trim().startsWith('q='));
      const value = q ? Number(q.trim().slice(2)) : 1;
      return [name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0];
    }));
    const quality = name => qualities.get(name) ?? qualities.get('*') ?? 0;
    const encoding = ['br', 'gzip'].filter(name => item[name] && quality(name) > 0).sort((a, b) => quality(b) - quality(a))[0];
    const data = encoding ? item[encoding] : item.raw;
    const headers = {
      'Content-Type': item.type, 'Cache-Control': item.cache,
      ETag: item.etag, Vary: 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff'
    };
    if (encoding) headers['Content-Encoding'] = encoding;
    const matches = (req.headers['if-none-match'] || '').split(',').map(tag => tag.trim().replace(/^W\//, ''));
    if (matches.includes('*') || matches.includes(item.etag.replace(/^W\//, ''))) {
      res.writeHead(304, headers); res.end(); return true;
    }
    headers['Content-Length'] = data.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
    return true;
  };
}
module.exports = { createPublicAssets };
