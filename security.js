'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const COOKIE = '__Host-kh_user';
const SESSION_MS = 30 * 86400000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function cookie(token, remember = false) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${remember ? '; Max-Age=' + SESSION_MS / 1000 : ''}`;
}
function sessionId(req) {
  const part = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  const token = part ? part.slice(COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(token) ? digest(token) : null;
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, hex] = stored.split('$');
    if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
    return crypto.timingSafeEqual(await scrypt(password, salt, 64), Buffer.from(hex, 'hex'));
  }
  // Existing accounts keep their password; upgrade only after a successful login.
  return crypto.timingSafeEqual(Buffer.from(digest(password)), Buffer.from(digest(stored)));
}
async function migratePasswords(db) {
  // Small sequential batches keep memory bounded and avoid saturating the worker pool.
  const cursor=db.collection('users').find({sifre:{$type:'string'}},{projection:{_id:1,sifre:1}});
  for await (const user of cursor) {
    if(!user.sifre.startsWith('scrypt$')) {
      const hash=await hashPassword(user.sifre);
      // A password change or login during migration must never be overwritten.
      await db.collection('users').updateOne({_id:user._id,sifre:user.sifre},{$set:{sifre:hash}});
    }
  }
}
function passwordVersion(user) { return digest(user.sifre || ''); }
function membership(user, now = Date.now()) {
  const owner = user.email === 'info@ecuyy.com';
  let end = user.uyelikBitis ? new Date(user.uyelikBitis) : null;
  if (!end && user.odemeTarihi) { end = new Date(user.odemeTarihi); end.setFullYear(end.getFullYear() + 1); }
  const paid = owner || !!(user.premium && (!end || end.getTime() > now));
  const start = new Date(user.trialBaslangic || user.kayitTarihi || 0);
  const trialEnd = new Date(start.getTime() + 3 * 86400000);
  const trial = !paid && trialEnd.getTime() >= now;
  return { ad: user.ad, email: user.email, premium: paid || trial,
    odemeTarihi: user.odemeTarihi || null, uyelikBitis: owner ? null : end,
    fatura: user.fatura || null, trialAktif: trial, trialBitti: !paid && !trial,
    trialBitisTarihi: trialEnd, trialKalanGun: trial ? Math.ceil((trialEnd - now) / 86400000) : 0 };
}
async function issueSession(db, req, res, user, remember) {
  const sessions = db.collection('userSessions');
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const old = sessionId(req); if (old) await sessions.deleteOne({ _id: old });
  const token = crypto.randomBytes(32).toString('hex');
  await sessions.insertOne({ _id: digest(token), email: user.email, passwordVersion: passwordVersion(user), expiresAt: new Date(Date.now() + SESSION_MS) });
  res.setHeader('Set-Cookie', cookie(token, remember));
}
async function authenticatedUser(db, req) {
  const id = sessionId(req); if (!id || !db) return null;
  const session = await db.collection('userSessions').findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection('users').findOne({ email: session.email });
  return user && session.passwordVersion === passwordVersion(user) ? user : null;
}
function headers(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Keep the existing inline UI handlers and payment provider working.
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://www.gstatic.com https://*.iyzipay.com https://*.iyzico.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.iyzipay.com https://*.iyzico.com; font-src 'self' data: https://fonts.gstatic.com https://*.iyzipay.com; img-src 'self' data: https:; connect-src 'self' https:; frame-src https:; form-action 'self' https://*.iyzipay.com https://*.iyzico.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (req.url.split('?')[0] === '/odeme') res.setHeader('Content-Security-Policy',"default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; img-src 'self' data: https:; connect-src 'self' https:; frame-src https:; form-action 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!req.headers.origin) return true;
  try { const origin = new URL(req.headers.origin); return ['https:', 'http:'].includes(origin.protocol) && origin.host === req.headers.host; } catch { return false; }
}
function readBody(req) {
  if (req.bodyPromise) return req.bodyPromise;
  req.bodyPromise = new Promise((resolve, reject) => {
    let body = '', size = 0, exceeded = false;
    req.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > 12 * 1024 * 1024) { exceeded = true; body = ''; } else if (!exceeded) body += chunk; });
    req.on('error', reject);
    req.on('end', () => {
      if (exceeded) return reject(Object.assign(new Error('İstek çok büyük'), { status: 413 }));
      let data; try { data = JSON.parse(body || '{}'); } catch { return reject(Object.assign(new Error('Geçersiz JSON'), { status: 400 })); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return reject(Object.assign(new Error('Geçersiz istek'), { status: 400 }));
      for (const key of ['email', 'ad', 'sifre', 'eskiSifre', 'yeniSifre', 'token']) {
        if (key in data && (typeof data[key] !== 'string' || data[key].length > 4096)) return reject(Object.assign(new Error('Geçersiz alan: ' + key), { status: 400 }));
      }
      resolve(data);
    });
  });
  return req.bodyPromise;
}
function createRateLimiter() {
  const buckets=new Map();
  return function rateLimit(req,res,pathname,body) {
    const limits={'/api/giris':30,'/api/kayit':10,'/api/admin/giris':20,'/api/sifre-sifirla-mail':5,'/api/sifre-sifirla-token':20};
    if(!limits[pathname])return true;
    const now=Date.now(),windowMs=15*60*1000;
    // The proxy's observed client address plus account; no user-supplied forwarded headers.
    const key=pathname+'|'+(req.socket.remoteAddress||'unknown')+'|'+(typeof body.email==='string'?body.email.toLowerCase():'');
    if(buckets.size>=10000){for(const [id,value] of buckets){if(value.until<=now)buckets.delete(id);}}
    let bucket=buckets.get(key);
    if(!bucket||bucket.until<=now){
      if(buckets.size>=10000){res.setHeader('Retry-After','60');json(res,429,{error:'Çok fazla istek. Lütfen daha sonra deneyin.'});return false;}
      bucket={count:0,until:now+windowMs};buckets.set(key,bucket);
    }
    if(++bucket.count>limits[pathname]){res.setHeader('Retry-After',String(Math.ceil((bucket.until-now)/1000)));json(res,429,{error:'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.'});return false;}
    return true;
  };
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
module.exports = { cookie, sessionId, hashPassword, verifyPassword, passwordVersion, membership, issueSession, authenticatedUser, headers, sameOrigin, readBody, json, digest, createRateLimiter, migratePasswords };
