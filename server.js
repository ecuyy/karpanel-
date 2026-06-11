const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://info_db_user:rWUh1N0WLUblIVTa@karpanel.g062rms.mongodb.net/?appName=karpanel';
const ADMIN_SIFRE = process.env.ADMIN_SIFRE || 'karpanel2026admin';

let db;

// MongoDB bağlantısı
MongoClient.connect(MONGO_URI).then(client => {
  db = client.db('karpanel');
  console.log('✅ MongoDB bağlandı!');
}).catch(err => {
  console.error('❌ MongoDB bağlantı hatası:', err.message);
});

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  corsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  const parsed = url.parse(req.url, true);

  // Ana sayfa
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    const filePath = path.join(__dirname, 'karpanel.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('karpanel.html bulunamadi'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Health check
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', mongo: db ? 'connected' : 'disconnected' }));
    return;
  }

  // robots.txt
  if (parsed.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`User-agent: *\nAllow: /\nSitemap: https://karpanel.onrender.com/sitemap.xml\nDisallow: /api/\nDisallow: /admin`);
    return;
  }

  // sitemap.xml
  if (parsed.pathname === '/sitemap.xml') {
    const today = new Date().toISOString().split('T')[0];
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://karpanel.onrender.com/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
  <url><loc>https://karpanel.onrender.com/#nasil</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>
  <url><loc>https://karpanel.onrender.com/#fiyat</loc><lastmod>${today}</lastmod><priority>0.9</priority></url>
  <url><loc>https://karpanel.onrender.com/#iletisim</loc><lastmod>${today}</lastmod><priority>0.7</priority></url>
</urlset>`);
    return;
  }

  // ── KULLANICI API ──

  // Kayıt ol
  if (parsed.pathname === '/api/kayit' && req.method === 'POST') {
    const body = await getBody(req);
    const { ad, email, sifre } = body;
    if (!ad || !email || !sifre) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tüm alanlar gerekli' })); return;
    }
    if (!db) { res.writeHead(500); res.end(JSON.stringify({ error: 'DB bağlantısı yok' })); return; }
    const mevcut = await db.collection('users').findOne({ email });
    if (mevcut) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bu e-posta zaten kayıtlı' })); return;
    }
    const user = { ad, email, sifre, premium: false, kayitTarihi: new Date(), odemeTarihi: null, uyelikBitis: null };
    await db.collection('users').insertOne(user);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, user: { ad, email, premium: false } }));
    return;
  }

  // Giriş yap
  if (parsed.pathname === '/api/giris' && req.method === 'POST') {
    const body = await getBody(req);
    const { email, sifre } = body;
    if (!db) { res.writeHead(500); res.end(JSON.stringify({ error: 'DB bağlantısı yok' })); return; }
    const user = await db.collection('users').findOne({ email, sifre });
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'E-posta veya şifre hatalı' })); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, user: { ad: user.ad, email: user.email, premium: user.premium, odemeTarihi: user.odemeTarihi, uyelikBitis: user.uyelikBitis } }));
    return;
  }

  // Ödeme yap
  if (parsed.pathname === '/api/odeme' && req.method === 'POST') {
    const body = await getBody(req);
    const { email } = body;
    if (!db) { res.writeHead(500); res.end(JSON.stringify({ error: 'DB bağlantısı yok' })); return; }
    const odemeTarihi = new Date();
    const uyelikBitis = new Date();
    uyelikBitis.setFullYear(uyelikBitis.getFullYear() + 1);
    await db.collection('users').updateOne({ email }, { $set: { premium: true, odemeTarihi, uyelikBitis } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uyelikBitis }));
    return;
  }

  // Şifre değiştir
  if (parsed.pathname === '/api/sifre-degistir' && req.method === 'POST') {
    const body = await getBody(req);
    const { email, eskiSifre, yeniSifre } = body;
    if (!db) { res.writeHead(500); res.end(JSON.stringify({ error: 'DB bağlantısı yok' })); return; }
    const user = await db.collection('users').findOne({ email, sifre: eskiSifre });
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mevcut şifre hatalı' })); return;
    }
    await db.collection('users').updateOne({ email }, { $set: { sifre: yeniSifre } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── ADMİN API ──

  // Admin giriş
  if (parsed.pathname === '/api/admin/giris' && req.method === 'POST') {
    const body = await getBody(req);
    if (body.sifre !== ADMIN_SIFRE) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Hatalı admin şifresi' })); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, token: ADMIN_SIFRE }));
    return;
  }

  // Admin - tüm kullanıcılar
  if (parsed.pathname === '/api/admin/users' && req.method === 'GET') {
    if (parsed.query.token !== ADMIN_SIFRE) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Yetkisiz' })); return;
    }
    if (!db) { res.writeHead(500); res.end(JSON.stringify({ error: 'DB yok' })); return; }
    const users = await db.collection('users').find({}, { projection: { sifre: 0 } }).sort({ kayitTarihi: -1 }).toArray();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
    return;
  }

  // Admin - premium ver/al
  if (parsed.pathname === '/api/admin/premium' && req.method === 'POST') {
    const body = await getBody(req);
    if (body.token !== ADMIN_SIFRE) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Yetkisiz' })); return;
    }
    const { email, aktif } = body;
    const uyelikBitis = aktif ? (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d; })() : null;
    await db.collection('users').updateOne({ email }, { $set: { premium: aktif, odemeTarihi: aktif ? new Date() : null, uyelikBitis } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Admin - şifre sıfırla
  if (parsed.pathname === '/api/admin/sifre-sifirla' && req.method === 'POST') {
    const body = await getBody(req);
    if (body.token !== ADMIN_SIFRE) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Yetkisiz' })); return;
    }
    const { email, yeniSifre } = body;
    await db.collection('users').updateOne({ email }, { $set: { sifre: yeniSifre } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Admin - kullanıcı sil
  if (parsed.pathname === '/api/admin/sil' && req.method === 'POST') {
    const body = await getBody(req);
    if (body.token !== ADMIN_SIFRE) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Yetkisiz' })); return;
    }
    await db.collection('users').deleteOne({ email: body.email });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Admin sayfası
  if (parsed.pathname === '/admin') {
    const adminHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KarPanel Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:#0F1A2E;color:#fff;min-height:100vh}
.login{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}
.login-box{background:#1A2D4A;border-radius:16px;padding:2.5rem;width:100%;max-width:380px}
.logo{font-size:22px;font-weight:900;color:#fff;text-align:center;margin-bottom:1.5rem}
.logo em{color:#F27A1A;font-style:normal}
input{width:100%;padding:11px 14px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.08);color:#fff;font-family:inherit;outline:none;margin-bottom:10px}
input::placeholder{color:rgba(255,255,255,.35)}
input:focus{border-color:#F27A1A}
.btn{width:100%;padding:12px;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
.btn-primary{background:#F27A1A;color:#fff}
.btn-danger{background:#DC2626;color:#fff;font-size:12px;padding:6px 12px;width:auto;border-radius:6px}
.btn-success{background:#059669;color:#fff;font-size:12px;padding:6px 12px;width:auto;border-radius:6px}
.btn-warning{background:#D97706;color:#fff;font-size:12px;padding:6px 12px;width:auto;border-radius:6px}
.panel{display:none;padding:2rem;max-width:1200px;margin:0 auto}
.panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:2rem}
.panel-title{font-size:24px;font-weight:900}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem}
.stat{background:#1A2D4A;border-radius:12px;padding:1.25rem;text-align:center}
.stat-val{font-size:32px;font-weight:900;color:#F27A1A}
.stat-label{font-size:12px;color:rgba(255,255,255,.5);margin-top:4px}
table{width:100%;border-collapse:collapse;background:#1A2D4A;border-radius:12px;overflow:hidden}
th{padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.4);border-bottom:1px solid rgba(255,255,255,.08)}
td{padding:12px 16px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.05)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.03)}
.badge{display:inline-flex;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-green{background:rgba(5,150,105,.2);color:#34D399;border:1px solid rgba(5,150,105,.3)}
.badge-gray{background:rgba(255,255,255,.08);color:rgba(255,255,255,.4)}
.badge-red{background:rgba(220,38,38,.2);color:#F87171;border:1px solid rgba(220,38,38,.3)}
.actions{display:flex;gap:6px;flex-wrap:wrap}
.err{color:#F87171;font-size:13px;text-align:center;margin-top:8px}
</style>
</head>
<body>
<!-- Login -->
<div class="login" id="login-section">
  <div class="login-box">
    <div class="logo">Kar<em>Panel</em> Admin</div>
    <input type="password" id="admin-sifre" placeholder="Admin şifresi" onkeydown="if(event.key==='Enter')adminGiris()">
    <button class="btn btn-primary" onclick="adminGiris()">Giriş Yap</button>
    <div class="err" id="admin-err"></div>
  </div>
</div>

<!-- Panel -->
<div class="panel" id="admin-panel">
  <div class="panel-header">
    <div class="panel-title">🛠️ KarPanel Admin</div>
    <button class="btn btn-danger" onclick="adminCikis()">Çıkış</button>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val" id="stat-toplam">0</div><div class="stat-label">Toplam Üye</div></div>
    <div class="stat"><div class="stat-val" id="stat-premium">0</div><div class="stat-label">Premium</div></div>
    <div class="stat"><div class="stat-val" id="stat-ucretsiz">0</div><div class="stat-label">Ücretsiz</div></div>
    <div class="stat"><div class="stat-val" id="stat-bitis">0</div><div class="stat-label">Bu Ay Bitiyor</div></div>
  </div>
  <table id="users-table">
    <thead>
      <tr>
        <th>Ad</th>
        <th>E-posta</th>
        <th>Kayıt Tarihi</th>
        <th>Durum</th>
        <th>Üyelik Bitiş</th>
        <th>İşlem</th>
      </tr>
    </thead>
    <tbody id="users-tbody"></tbody>
  </table>
</div>

<script>
let adminToken = '';

async function adminGiris(){
  const sifre = document.getElementById('admin-sifre').value;
  const r = await fetch('/api/admin/giris', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sifre})});
  const d = await r.json();
  if(d.ok){
    adminToken = sifre;
    document.getElementById('login-section').style.display='none';
    document.getElementById('admin-panel').style.display='block';
    yukleCullanicilari();
  } else {
    document.getElementById('admin-err').textContent = d.error || 'Hatalı şifre';
  }
}

function adminCikis(){
  adminToken='';
  document.getElementById('login-section').style.display='flex';
  document.getElementById('admin-panel').style.display='none';
  document.getElementById('admin-sifre').value='';
}

async function yukleCullanicilari(){
  const r = await fetch('/api/admin/users?token='+adminToken);
  const users = await r.json();
  
  const bugun = new Date();
  const birAySonra = new Date(); birAySonra.setMonth(birAySonra.getMonth()+1);
  
  let premium=0, ucretsiz=0, bitiyorCount=0;
  users.forEach(u => {
    if(u.premium) premium++;
    else ucretsiz++;
    if(u.uyelikBitis){
      const bitis = new Date(u.uyelikBitis);
      if(bitis < birAySonra && bitis > bugun) bitiyorCount++;
    }
  });
  
  document.getElementById('stat-toplam').textContent = users.length;
  document.getElementById('stat-premium').textContent = premium;
  document.getElementById('stat-ucretsiz').textContent = ucretsiz;
  document.getElementById('stat-bitis').textContent = bitiyorCount;
  
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = users.map(u => {
    const kayit = u.kayitTarihi ? new Date(u.kayitTarihi).toLocaleDateString('tr-TR') : '—';
    const bitis = u.uyelikBitis ? new Date(u.uyelikBitis).toLocaleDateString('tr-TR') : '—';
    const bitisDate = u.uyelikBitis ? new Date(u.uyelikBitis) : null;
    const bitis30 = bitisDate && bitisDate < birAySonra && bitisDate > bugun;
    const badge = u.premium 
      ? (bitis30 ? '<span class="badge badge-red">⚠️ Bitiyor</span>' : '<span class="badge badge-green">Premium ✓</span>')
      : '<span class="badge badge-gray">Ücretsiz</span>';
    return \`<tr>
      <td>\${u.ad}</td>
      <td>\${u.email}</td>
      <td>\${kayit}</td>
      <td>\${badge}</td>
      <td style="color:\${bitis30?'#F87171':'inherit'}">\${bitis}</td>
      <td><div class="actions">
        \${u.premium 
          ? \`<button class="btn btn-warning" onclick="premiumDegistir('\${u.email}',false)">Premium Al</button>\`
          : \`<button class="btn btn-success" onclick="premiumDegistir('\${u.email}',true)">Premium Ver</button>\`}
        <button class="btn btn-primary" style="background:#2563EB" onclick="sifreSifirla('\${u.email}')">Şifre</button>
        <button class="btn btn-danger" onclick="kullaniciSil('\${u.email}','\${u.ad}')">Sil</button>
      </div></td>
    </tr>\`;
  }).join('');
}

async function premiumDegistir(email, aktif){
  if(!confirm(aktif ? email+' kullanıcısına premium ver?' : email+' kullanıcısının premiumunu al?')) return;
  await fetch('/api/admin/premium',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:adminToken,email,aktif})});
  yukleCullanicilari();
}

async function sifreSifirla(email){
  const yeni = prompt(email+' için yeni şifre girin:');
  if(!yeni||yeni.length<6){alert('Şifre en az 6 karakter olmalı');return;}
  await fetch('/api/admin/sifre-sifirla',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:adminToken,email,yeniSifre:yeni})});
  alert('Şifre güncellendi!');
}

async function kullaniciSil(email, ad){
  if(!confirm(ad+' ('+email+') kullanıcısını silmek istediğinden emin misin?')) return;
  await fetch('/api/admin/sil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:adminToken,email})});
  yukleCullanicilari();
}
</script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(adminHtml);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint bulunamadi' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('✅ KarPanel Sunucusu Başladı!');
  console.log('🌐 http://localhost:' + PORT);
  console.log('🛠️  Admin: http://localhost:' + PORT + '/admin');
  console.log('');
});
