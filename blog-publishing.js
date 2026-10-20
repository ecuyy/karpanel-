const fs = require('node:fs');

// Repository write access is the publication authority. No public write endpoint.
function loadPublishedPosts(filename, reservedSlugs = [], now = new Date()) {
  const input = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!Array.isArray(input)) throw new Error('Blog içerikleri dizi olmalı');
  const seen = new Set(reservedSlugs);
  const posts = input.map(post => {
    if (!post || typeof post !== 'object' || Array.isArray(post)) throw new Error('Geçersiz blog kaydı');
    if (typeof post.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || post.slug.length > 120 || seen.has(post.slug)) throw new Error('Geçersiz veya tekrarlanan blog slug');
    seen.add(post.slug);
    for (const field of ['baslik', 'ozet', 'icerik']) {
      if (typeof post[field] !== 'string' || !post[field].trim()) throw new Error('Eksik blog alanı: ' + field);
    }
    if (typeof post.yayinda !== 'boolean') throw new Error('yayinda boolean olmalı');
    const tarih = new Date(post.tarih);
    const guncelleme = new Date(post.guncelleme || post.tarih);
    if (typeof post.tarih !== 'string' || !Number.isFinite(+tarih) || !Number.isFinite(+guncelleme) || guncelleme < tarih) throw new Error('Geçersiz blog tarihi');
    const faq = post.faq || [];
    if (!Array.isArray(faq) || faq.some(item => !item || typeof item.soru !== 'string' || typeof item.cevap !== 'string')) throw new Error('Geçersiz FAQ');
    return { slug: post.slug, baslik: post.baslik.trim(), ozet: post.ozet.trim(), icerik: post.icerik.trim(), kapak: '', yayinda: post.yayinda, tarih, guncelleme, faq };
  });
  return posts.filter(post => post.yayinda && post.tarih <= now);
}

module.exports = { loadPublishedPosts };
