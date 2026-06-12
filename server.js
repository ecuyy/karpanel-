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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --or:#F27A1A;--or2:#FF8C38;
  --bg:#0B1120;--bg2:#111827;--bg3:#1C2A3F;--bg4:#243044;
  --border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.14);
  --text:#F1F5F9;--t2:rgba(255,255,255,.55);--t3:rgba(255,255,255,.28);
  --green:#10B981;--gbg:rgba(16,185,129,.12);--gbr:rgba(16,185,129,.25);
  --red:#EF4444;--rbg:rgba(239,68,68,.12);--rbr:rgba(239,68,68,.25);
  --yellow:#F59E0B;--ybg:rgba(245,158,11,.12);
  --blue:#3B82F6;--bbg:rgba(59,130,246,.12);
}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}

/* ── LOGIN ── */
.login-page{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;background:radial-gradient(ellipse at 50% 0%,rgba(242,122,26,.12) 0%,transparent 60%)}
.login-card{
  background:var(--bg2);border:1px solid var(--border2);border-radius:24px;
  padding:2.5rem;width:100%;max-width:400px;
  box-shadow:0 24px 80px rgba(0,0,0,.5);
}
.login-logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:2rem}
.login-logo-icon{
  width:44px;height:44px;border-radius:12px;
  background:linear-gradient(135deg,var(--or),var(--or2));
  display:flex;align-items:center;justify-content:center;
  font-size:20px;box-shadow:0 4px 16px rgba(242,122,26,.35);
}
.login-logo-text{font-size:20px;font-weight:900;letter-spacing:-.5px}
.login-logo-text em{color:var(--or);font-style:normal}
.login-subtitle{text-align:center;font-size:13px;color:var(--t2);margin-bottom:1.75rem;line-height:1.5}
.field{margin-bottom:14px}
.field-label{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;display:block}
.field-input{
  width:100%;padding:12px 16px;
  border:1.5px solid var(--border2);border-radius:10px;
  font-size:14px;font-weight:500;background:var(--bg3);color:var(--text);
  font-family:'Inter',sans-serif;outline:none;transition:all .2s;
}
.field-input:focus{border-color:var(--or);background:var(--bg4);box-shadow:0 0 0 3px rgba(242,122,26,.15)}
.field-input::placeholder{color:var(--t3)}
.btn-login{
  width:100%;padding:13px;border:none;border-radius:10px;
  font-size:14px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;
  background:linear-gradient(135deg,var(--or),var(--or2));color:#fff;
  transition:all .2s;margin-top:4px;letter-spacing:.01em;
  box-shadow:0 4px 16px rgba(242,122,26,.3);
}
.btn-login:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(242,122,26,.45)}
.btn-login:active{transform:translateY(0)}
.login-err{
  color:var(--red);font-size:13px;text-align:center;
  margin-top:12px;padding:10px 14px;
  background:var(--rbg);border:1px solid var(--rbr);border-radius:8px;
  display:none;
}

/* ── MAIN LAYOUT ── */
.app{display:none;min-height:100vh;flex-direction:column}

/* TOPBAR */
.topbar{
  background:var(--bg2);border-bottom:1px solid var(--border);
  padding:0 2rem;height:64px;
  display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:100;
  backdrop-filter:blur(20px);
}
.topbar-left{display:flex;align-items:center;gap:12px}
.topbar-logo-icon{
  width:34px;height:34px;border-radius:9px;
  background:linear-gradient(135deg,var(--or),var(--or2));
  display:flex;align-items:center;justify-content:center;font-size:15px;
}
.topbar-title{font-size:16px;font-weight:800;letter-spacing:-.3px}
.topbar-badge{
  font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;
  background:rgba(242,122,26,.15);color:var(--or);border:1px solid rgba(242,122,26,.25);
  letter-spacing:.05em;text-transform:uppercase;
}
.topbar-right{display:flex;align-items:center;gap:10px}
.topbar-refresh{
  padding:8px 14px;border:1.5px solid var(--border2);border-radius:8px;
  font-size:12px;font-weight:600;cursor:pointer;color:var(--t2);
  background:transparent;font-family:'Inter',sans-serif;transition:all .15s;
  display:flex;align-items:center;gap:6px;
}
.topbar-refresh:hover{border-color:var(--or);color:var(--or)}
.btn-logout{
  padding:8px 18px;border:none;border-radius:8px;
  font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;
  background:var(--rbg);color:var(--red);border:1px solid var(--rbr);transition:all .15s;
}
.btn-logout:hover{background:var(--red);color:#fff}

/* CONTENT */
.content{padding:2rem;max-width:1300px;margin:0 auto;width:100%;flex:1}

/* STATS */
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem}
.stat-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:16px;
  padding:1.5rem;position:relative;overflow:hidden;transition:border-color .2s;
}
.stat-card:hover{border-color:var(--border2)}
.stat-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,var(--or),var(--or2));opacity:0;transition:.2s;
}
.stat-card:hover::before{opacity:1}
.stat-icon{font-size:22px;margin-bottom:.75rem;display:block}
.stat-val{font-size:36px;font-weight:900;letter-spacing:-1.5px;line-height:1;margin-bottom:.35rem}
.stat-label{font-size:12px;font-weight:600;color:var(--t2);letter-spacing:.02em}
.stat-card.orange .stat-val{color:var(--or)}
.stat-card.green .stat-val{color:var(--green)}
.stat-card.blue .stat-val{color:var(--blue)}
.stat-card.red .stat-val{color:var(--red)}

/* SEARCH BAR */
.table-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;gap:12px;flex-wrap:wrap}
.table-title{font-size:16px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:8px}
.count-chip{
  font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;
  background:rgba(242,122,26,.15);color:var(--or);border:1px solid rgba(242,122,26,.2);
}
.search-box{
  position:relative;display:flex;align-items:center;
}
.search-icon{position:absolute;left:12px;font-size:13px;color:var(--t3);pointer-events:none}
.search-inp{
  padding:9px 13px 9px 35px;
  border:1.5px solid var(--border2);border-radius:9px;
  font-size:13px;background:var(--bg3);color:var(--text);
  font-family:'Inter',sans-serif;width:220px;outline:none;transition:all .15s;
}
.search-inp:focus{border-color:var(--or);background:var(--bg4)}
.search-inp::placeholder{color:var(--t3)}

/* TABLE */
.table-wrap{
  background:var(--bg2);border:1px solid var(--border);
  border-radius:16px;overflow:hidden;
}
.data-table{width:100%;border-collapse:collapse;font-size:13px}
.data-table thead{background:var(--bg3)}
.data-table th{
  padding:12px 18px;text-align:left;
  font-size:10px;font-weight:800;color:var(--t3);
  text-transform:uppercase;letter-spacing:.1em;
  border-bottom:1px solid var(--border);
  white-space:nowrap;
}
.data-table td{
  padding:14px 18px;border-bottom:1px solid var(--border);
  vertical-align:middle;
}
.data-table tr:last-child td{border-bottom:none}
.data-table tbody tr{transition:background .12s}
.data-table tbody tr:hover td{background:rgba(255,255,255,.025)}

/* USER CELL */
.user-cell{display:flex;align-items:center;gap:10px}
.user-av{
  width:34px;height:34px;border-radius:50%;
  background:linear-gradient(135deg,var(--or),var(--or2));
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:900;color:#fff;flex-shrink:0;
}
.user-name{font-weight:700;color:var(--text);font-size:13px}
.user-email-sub{font-size:11px;color:var(--t3);margin-top:1px}

.email-cell{color:var(--t2);font-size:12px}
.date-cell{color:var(--t2);font-size:12px;white-space:nowrap}
.date-cell.warning{color:var(--yellow)}

/* BADGE */
.badge{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}
.badge-premium{background:var(--gbg);color:var(--green);border:1px solid var(--gbr)}
.badge-free{background:rgba(255,255,255,.06);color:var(--t3);border:1px solid var(--border)}
.badge-warning{background:var(--ybg);color:var(--yellow);border:1px solid rgba(245,158,11,.3)}
.badge-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.badge-premium .badge-dot{background:var(--green)}
.badge-free .badge-dot{background:var(--t3)}
.badge-warning .badge-dot{background:var(--yellow);animation:pulse .8s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ACTIONS */
.actions{display:flex;gap:6px;align-items:center}
.act-btn{
  padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;
  cursor:pointer;font-family:'Inter',sans-serif;border:none;transition:all .15s;
  display:flex;align-items:center;gap:4px;
}
.act-premium{background:var(--gbg);color:var(--green);border:1px solid var(--gbr)}
.act-premium:hover{background:var(--green);color:#fff}
.act-remove{background:var(--ybg);color:var(--yellow);border:1px solid rgba(245,158,11,.3)}
.act-remove:hover{background:var(--yellow);color:#000}
.act-pass{background:var(--bbg);color:var(--blue);border:1px solid rgba(59,130,246,.3)}
.act-pass:hover{background:var(--blue);color:#fff}
.act-del{background:var(--rbg);color:var(--red);border:1px solid var(--rbr)}
.act-del:hover{background:var(--red);color:#fff}

/* EMPTY */
.empty-state{text-align:center;padding:4rem 2rem;color:var(--t3)}
.empty-icon{font-size:40px;margin-bottom:.75rem;opacity:.4;display:block}
.empty-title{font-size:16px;font-weight:800;color:var(--t2);margin-bottom:.35rem}
.empty-sub{font-size:13px}

/* LOADING */
.loading{text-align:center;padding:3rem;color:var(--t2);font-size:14px}
.spin{display:inline-block;width:20px;height:20px;border:2px solid var(--border2);border-top-color:var(--or);border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}

/* TOAST */
.toast{
  position:fixed;bottom:24px;right:24px;z-index:999;
  padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;
  display:flex;align-items:center;gap:8px;
  transform:translateY(80px);opacity:0;transition:all .3s;pointer-events:none;
}
.toast.show{transform:translateY(0);opacity:1}
.toast-success{background:var(--gbg);color:var(--green);border:1px solid var(--gbr)}
.toast-error{background:var(--rbg);color:var(--red);border:1px solid var(--rbr)}
.toast-info{background:var(--bbg);color:var(--blue);border:1px solid rgba(59,130,246,.3)}

/* RESPONSIVE */
@media(max-width:768px){
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .topbar{padding:0 1rem}
  .content{padding:1rem}
}
</style>
</head>
<body>

<!-- LOGIN -->
<div class="login-page" id="login-page">
  <div class="login-card">
    <div class="login-logo">
      <div class="login-logo-icon">🛠️</div>
      <div class="login-logo-text">Kar<em>Panel</em></div>
    </div>
    <div class="login-subtitle">Admin paneline giriş yapmak için<br>şifrenizi girin</div>
    <div class="field">
      <label class="field-label">Admin Şifresi</label>
      <input class="field-input" type="password" id="admin-sifre" placeholder="••••••••••" onkeydown="if(event.key==='Enter')adminGiris()">
    </div>
    <button class="btn-login" onclick="adminGiris()">Giriş Yap →</button>
    <div class="login-err" id="admin-err"></div>
  </div>
</div>

<!-- APP -->
<div class="app" id="app">
  <!-- Topbar -->
  <div class="topbar">
    <div class="topbar-left">
      <div class="topbar-logo-icon">🛠️</div>
      <div class="topbar-title">KarPanel</div>
      <div class="topbar-badge">Admin</div>
    </div>
    <div class="topbar-right">
      <button class="topbar-refresh" onclick="yukleCullanicilari()">↻ Yenile</button>
      <button class="btn-logout" onclick="adminCikis()">Çıkış</button>
    </div>
  </div>

  <!-- Content -->
  <div class="content">
    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card orange">
        <span class="stat-icon">👥</span>
        <div class="stat-val" id="stat-toplam">—</div>
        <div class="stat-label">Toplam Üye</div>
      </div>
      <div class="stat-card green">
        <span class="stat-icon">⭐</span>
        <div class="stat-val" id="stat-premium">—</div>
        <div class="stat-label">Premium</div>
      </div>
      <div class="stat-card blue">
        <span class="stat-icon">🆓</span>
        <div class="stat-val" id="stat-ucretsiz">—</div>
        <div class="stat-label">Ücretsiz</div>
      </div>
      <div class="stat-card red">
        <span class="stat-icon">⏰</span>
        <div class="stat-val" id="stat-bitis">—</div>
        <div class="stat-label">Bu Ay Bitiyor</div>
      </div>
    </div>

    <!-- Table -->
    <div class="table-header">
      <div class="table-title">
        Üyeler
        <span class="count-chip" id="user-count">0 üye</span>
      </div>
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input class="search-inp" type="text" id="search-inp" placeholder="Ad veya e-posta ara..." oninput="araFiltre(this.value)">
      </div>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Kullanıcı</th>
            <th>E-posta</th>
            <th>Kayıt Tarihi</th>
            <th>Durum</th>
            <th>Üyelik Bitiş</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody id="users-tbody">
          <tr><td colspan="6"><div class="loading"><span class="spin"></span>Yükleniyor...</div></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
let adminToken = '';
let allUsers = [];

function toast(msg, type='info'){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast toast-'+type+' show';
  setTimeout(()=>t.className='toast',3500);
}

async function adminGiris(){
  const btn = document.querySelector('.btn-login');
  const errEl = document.getElementById('admin-err');
  const sifre = document.getElementById('admin-sifre').value;
  if(!sifre){ errEl.textContent='Şifre giriniz'; errEl.style.display='block'; return; }
  btn.textContent='Giriş yapılıyor...'; btn.disabled=true;
  try{
    const r = await fetch('/api/admin/giris', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sifre})});
    const d = await r.json();
    if(d.ok){
      adminToken = sifre;
      document.getElementById('login-page').style.display='none';
      document.getElementById('app').style.display='flex';
      yukleCullanicilari();
    } else {
      errEl.textContent = d.error || 'Hatalı şifre';
      errEl.style.display='block';
    }
  }catch(e){
    errEl.textContent='Bağlantı hatası. Tekrar deneyin.';
    errEl.style.display='block';
  }
  btn.textContent='Giriş Yap →'; btn.disabled=false;
}

function adminCikis(){
  adminToken='';
  allUsers=[];
  document.getElementById('login-page').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('admin-sifre').value='';
}

async function yukleCullanicilari(){
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML='<tr><td colspan="6"><div class="loading"><span class="spin"></span>Yükleniyor...</div></td></tr>';
  try{
    const r = await fetch('/api/admin/users?token='+adminToken);
    if(!r.ok) throw new Error('Yetkisiz');
    allUsers = await r.json();
    renderUsers(allUsers);
  }catch(e){
    tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">⚠️</span><div class="empty-title">Yüklenemedi</div><div class="empty-sub">'+e.message+'</div></div></td></tr>';
  }
}

function renderUsers(users){
  const bugun = new Date();
  const birAySonra = new Date(); birAySonra.setMonth(birAySonra.getMonth()+1);
  let premium=0, ucretsiz=0, bitiyor=0;
  users.forEach(u=>{
    if(u.premium) premium++; else ucretsiz++;
    if(u.uyelikBitis){ const b=new Date(u.uyelikBitis); if(b<birAySonra&&b>bugun) bitiyor++; }
  });
  document.getElementById('stat-toplam').textContent=allUsers.length;
  document.getElementById('stat-premium').textContent=premium;
  document.getElementById('stat-ucretsiz').textContent=ucretsiz;
  document.getElementById('stat-bitis').textContent=bitiyor;
  document.getElementById('user-count').textContent=users.length+' üye';

  const tbody = document.getElementById('users-tbody');
  if(!users.length){
    tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">🔍</span><div class="empty-title">Sonuç bulunamadı</div><div class="empty-sub">Farklı bir kelime deneyin</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u=>{
    const kayit = u.kayitTarihi ? new Date(u.kayitTarihi).toLocaleDateString('tr-TR') : '—';
    const bitisDate = u.uyelikBitis ? new Date(u.uyelikBitis) : null;
    const bitis30 = bitisDate && bitisDate < birAySonra && bitisDate > bugun;
    const bitisStr = bitisDate ? bitisDate.toLocaleDateString('tr-TR') : '—';
    const av = (u.ad||'?').charAt(0).toUpperCase();
    const badge = u.premium
      ? (bitis30
          ? '<span class="badge badge-warning"><span class="badge-dot"></span>Bitiyor</span>'
          : '<span class="badge badge-premium"><span class="badge-dot"></span>Premium</span>')
      : '<span class="badge badge-free"><span class="badge-dot"></span>Ücretsiz</span>';
    const premiumBtn = u.premium
      ? \`<button class="act-btn act-remove" onclick="premiumDegistir('\${u.email}',false)">⬇ Al</button>\`
      : \`<button class="act-btn act-premium" onclick="premiumDegistir('\${u.email}',true)">⭐ Ver</button>\`;
    return \`<tr>
      <td>
        <div class="user-cell">
          <div class="user-av">\${av}</div>
          <div>
            <div class="user-name">\${u.ad}</div>
          </div>
        </div>
      </td>
      <td><span class="email-cell">\${u.email}</span></td>
      <td><span class="date-cell">\${kayit}</span></td>
      <td>\${badge}</td>
      <td><span class="date-cell\${bitis30?' warning':''}">\${bitisStr}</span></td>
      <td>
        <div class="actions">
          \${premiumBtn}
          <button class="act-btn act-pass" onclick="sifreSifirla('\${u.email}')">🔑 Şifre</button>
          <button class="act-btn act-del" onclick="kullaniciSil('\${u.email}','\${u.ad}')">🗑</button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

function araFiltre(q){
  const lower = q.toLowerCase();
  const filtered = allUsers.filter(u=>
    (u.ad||'').toLowerCase().includes(lower) ||
    (u.email||'').toLowerCase().includes(lower)
  );
  renderUsers(filtered);
}

async function premiumDegistir(email, aktif){
  if(!confirm(aktif ? email+' kullanıcısına 1 yıllık premium ver?' : email+' kullanıcısının premiumunu al?')) return;
  try{
    await fetch('/api/admin/premium',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:adminToken,email,aktif})});
    toast(aktif ? '⭐ Premium verildi: '+email : '🔄 Premium alındı: '+email, aktif?'success':'info');
    yukleCullanicilari();
  }catch(e){ toast('Hata: '+e.message,'error'); }
}

async function sifreSifirla(email){
  const yeni = prompt(email+' için yeni şifre (en az 6 karakter):');
  if(!yeni||yeni.length<6){ alert('Şifre en az 6 karakter olmalı'); return; }
  try{
    await fetch('/api/admin/sifre-sifirla',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:adminToken,email,yeniSifre:yeni})});
    toast('🔑 Şifre güncellendi: '+email,'success');
  }catch(e){ toast('Hata','error'); }
}

async function kullaniciSil(email, ad){
  if(!confirm(ad+' ('+email+') silinecek. Emin misin?')) return;
  try{
    await fetch('/api/admin/sil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:adminToken,email})});
    toast('🗑 Silindi: '+email,'info');
    yukleCullanicilari();
  }catch(e){ toast('Hata','error'); }
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
