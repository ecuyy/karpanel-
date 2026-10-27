'use strict';
// Read-only live SEO checks. Does not log in, modify data or execute calculations.
const assert = require('node:assert/strict');
const origin = 'https://komisyonhesap.com';
const errors = [];
const titles = new Map();
const results = [];
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
async function get(url, method = 'GET') {
  const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  return { response, html: await response.text() };
}
async function check(url) {
  const issues = [];
  try {
    const { response, html } = await get(url);
    if (response.status !== 200) issues.push('HTTP ' + response.status);
    const head = await get(url, 'HEAD');
    if (head.response.status !== response.status) issues.push('HEAD / GET durum kodu eşleşmiyor: ' + head.response.status);
    if (head.html.length) issues.push('HEAD yanıtında gövde var');
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim();
    if (!title) issues.push('Başlık eksik');
    else if (titles.has(title)) issues.push('Aynı başlık: ' + titles.get(title));
    else titles.set(title, url);
    if ([...html.matchAll(/<h1(?:\s[^>]*)?>/gi)].length !== 1) issues.push('Tam olarak bir H1 olmalı');
    if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) issues.push('Meta açıklaması eksik');
    const canonical = (html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) || [])[1];
    if (!canonical || decode(canonical) !== url) issues.push('Canonical eşleşmiyor: ' + canonical);
    if (/noindex/i.test(response.headers.get('x-robots-tag') || '') || /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)) issues.push('Dizin oluşturma engellenmiş');
    const blocks = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) issues.push('Yapısal veri eksik');
    blocks.forEach(m => { try { JSON.parse(m[1]); } catch { issues.push('Geçersiz JSON-LD'); } });
    results.push({ url, status: response.status, title, issues });
  } catch (e) { issues.push(e.message); results.push({ url, issues }); }
  if (issues.length) errors.push({ url, issues });
}
(async () => {
  const { response, html } = await get(origin + '/sitemap.xml');
  assert.equal(response.status, 200, 'Sitemap HTTP 200 olmalı');
  const urls = [...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decode(m[1]));
  assert(urls.length >= 7, 'Sitemap ana sayfaları içermeli');
  assert.equal(new Set(urls).size, urls.length, 'Sitemap tekrar eden URL içeremez');
  assert(urls.every(u => u.startsWith(origin + '/') && !/[?#]/.test(u)), 'Yalnızca standart, herkese açık site URL’leri');
  // Three workers keep the audit light on the production service.
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < urls.length) await check(urls[next++]);
  }));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), pages: urls.length, passed: urls.length - errors.length, errors, results }, null, 2));
  if (errors.length) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
