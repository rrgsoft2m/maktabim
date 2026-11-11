'use strict';
/** Admin login va parol boshqaruvi: data/admin.json */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readAdmin() {
  if (!fs.existsSync(ADMIN_FILE)) return null;
  return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
}

function writeAdmin(obj) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
}

/** Birinchi ishga tushirishda admin yaratadi */
function ensureAdmin() {
  if (readAdmin()) return;
  const username = process.env.ADMIN_USER || 'admin';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }
  writeAdmin({ username, hash: bcrypt.hashSync(password, 12) });
  console.log('\n=== Admin hisobi yaratildi ===');
  console.log(`Login: ${username}`);
  if (generated) console.log(`Parol: ${password}   (buni saqlab qo'ying, keyin o'zgartirishingiz mumkin)`);
  console.log('==============================\n');
}

function username() {
  const a = readAdmin();
  return a ? a.username : null;
}

function verify(user, password) {
  const a = readAdmin();
  if (!a || user !== a.username) {
    bcrypt.compareSync(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'); // vaqt hujumini qiyinlashtirish
    return false;
  }
  return bcrypt.compareSync(password, a.hash);
}

function setPassword(password, user) {
  const a = readAdmin() || {};
  writeAdmin({
    username: user || a.username || 'admin',
    hash: bcrypt.hashSync(password, 12),
  });
}

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, 'session.key');
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(f, 'utf8').trim();
}

module.exports = { ensureAdmin, username, verify, setPassword, sessionSecret };
