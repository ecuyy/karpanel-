'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const COOKIE = '__Host-kh_member';
const HOURS = 12 * 60 * 60 * 1000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$16384$8$1$' + salt + '$' + key.toString('hex');
}
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string' || password.length > 1024) return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$16384$8$1' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const key = await scrypt(password, parts[4], 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, Buffer.from(parts[5], 'hex'));
}
function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
async function checkPassword(db, user, password) {
  if (!user || typeof password !== 'string' || password.length > 1024) return false;
  if (user.passwordHash) return verifyPassword(password, user.passwordHash);
  if (!constantEqual(user.sifre, password)) return false;
  const passwordHash = await hashPassword(password);
  await db.collection('users').updateOne({ _id: user._id, sifre: user.sifre }, { $set: { passwordHash }, $unset: { sifre: '' } });
  return true;
}
async function migrateLegacyPasswords(db) {
  const rows = await db.collection('users').find({ sifre: { $type: 'string' } }).project({ _id: 1, sifre: 1, passwordHash: 1 }).toArray();
  for (const user of rows) {
    const passwordHash = user.passwordHash || await hashPassword(user.sifre);
    await db.collection('users').updateOne({ _id: user._id, sifre: user.sifre }, { $set: { passwordHash }, $unset: { sifre: '' } });
  }
  return rows.length;
}
function publicMember(user) {
  const started = new Date(user.trialBaslangic || user.kayitTarihi || 0);
  const trialEnd = new Date(started.getTime() + 3 * 86400000);
  const paid = !!user.premium && (!user.uyelikBitis || new Date(user.uyelikBitis) > new Date());
  const trialAktif = !paid && trialEnd > new Date();
  return { ad: user.ad, email: user.email, premium: paid || trialAktif, odemeTarihi: user.odemeTarihi || null, uyelikBitis: user.uyelikBitis || null, fatura: user.fatura || null, trialAktif, trialBitti: !paid && !trialAktif, trialBitisTarihi: trialEnd, trialKalanGun: trialAktif ? Math.ceil((trialEnd - Date.now()) / 86400000) : 0 };
}
function createMemberSecurity(getDb) {
  const attempts = new Map();
  function allow(req, group, maximum = 12) {
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const key = group + ':' + ip, now = Date.now();
    let item = attempts.get(key);
    if (!item || item.until < now) item = { count: 0, until: now + 10 * 60000 };
    item.count++; attempts.set(key, item);
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    return item.count <= maximum;
  }
  function sessionId(req) {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? hash(token) : null;
  }
  function cookie(token, age) { return COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + age; }
  async function issue(req, res, user, remember = false) {
    const db = getDb(), previous = sessionId(req), token = crypto.randomBytes(32).toString('hex');
    if (previous) await db.collection('memberSessions').deleteOne({ _id: previous });
    const ms = remember ? 30 * 86400000 : HOURS;
    await db.collection('memberSessions').insertOne({ _id: hash(token), email: user.email, createdAt: new Date(), expiresAt: new Date(Date.now() + ms) });
    res.setHeader('Set-Cookie', cookie(token, ms / 1000));
  }
  async function member(req) {
    const db = getDb(), id = sessionId(req);
    if (!db || !id) return null;
    const session = await db.collection('memberSessions').findOne({ _id: id, expiresAt: { $gt: new Date() } });
    return session ? db.collection('users').findOne({ email: session.email }) : null;
  }
  async function logout(req, res) {
    const id = sessionId(req), db = getDb();
    if (id && db) await db.collection('memberSessions').deleteOne({ _id: id });
    res.setHeader('Set-Cookie', cookie('', 0));
  }
  async function revoke(email) { await getDb().collection('memberSessions').deleteMany({ email }); }
  return { allow, issue, member, logout, revoke };
}
module.exports = { hashPassword, verifyPassword, checkPassword, migrateLegacyPasswords, publicMember, createMemberSecurity };
