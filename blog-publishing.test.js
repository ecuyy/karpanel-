const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPublishedPosts } = require('./blog-publishing');
const sample = { slug: 'ornek-yazi', baslik: 'Örnek', ozet: 'Özet', icerik: '## Başlık\n\nİçerik', yayinda: true, tarih: '2026-10-20T07:00:00Z' };
function load(input, reserved = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'));
  try {
    const file = path.join(dir, 'posts.json');
    fs.writeFileSync(file, JSON.stringify(input));
    return loadPublishedPosts(file, reserved, new Date('2026-10-20T08:00:00Z'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('published content loads with dates and excludes arbitrary database fields', () => {
  const [post] = load([{ ...sample, _id: 'injected', unknown: true }]);
  assert.equal(post.baslik, 'Örnek');
  assert.ok(post.tarih instanceof Date);
  assert.equal(post.guncelleme.toISOString(), sample.tarih.replace('Z', '.000Z'));
  assert.equal(post._id, undefined);
});
test('drafts and future posts cannot become public fallback content', () => {
  assert.deepEqual(load([{ ...sample, yayinda: false }]), []);
  assert.deepEqual(load([{ ...sample, tarih: '2027-01-01T00:00:00Z' }]), []);
});
test('conflicts with existing editorial slugs and duplicate entries reject the batch', () => {
  assert.throws(() => load([sample], [sample.slug]));
  assert.throws(() => load([sample, sample]));
});
test('malformed publication records are rejected', () => {
  for (const input of [{}, [null], [{ ...sample, tarih: 'bad' }], [{ ...sample, yayinda: 'true' }], [{ ...sample, icerik: '' }], [{ ...sample, slug: '../admin' }], [{ ...sample, faq: [null] }]]) {
    assert.throws(() => load(input));
  }
});
test('repository content validates', () => {
  assert.doesNotThrow(() => loadPublishedPosts(path.join(__dirname, 'blog-posts.json')));
});
