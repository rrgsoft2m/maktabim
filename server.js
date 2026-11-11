'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const site = require('./lib/site');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { LANGS, DEFAULT_LANG, parseLang } = require('./lib/i18n');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_DIR = path.join(__dirname, 'admin');
const MAX_UPLOAD = 10 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// ---------- Yordamchi funksiyalar ----------

/** Matnni xavfsizroq holatga keltiradi (admin kiritadi, lekin skript/iframe/on* ni olib tashlaymiz) */
function sanitizeHtml(s) {
  return String(s)
    .replace(/<\s*(script|iframe|object|embed|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function isExistingMedia(url) {
  if (typeof url !== 'string') return false;
  if (!(url.startsWith('/uploads/') || url.startsWith('/img/'))) return false;
  const abs = path.normalize(path.join(site.SITE_DIR, url));
  if (!abs.startsWith(site.SITE_DIR + path.sep)) return false;
  try {
    return fs.statSync(abs).isFile();
  } catch (_) {
    return false;
  }
}

/** Blokni kalit bo'yicha topadi - faqat haqiqatan mavjud bloklarni tahrirlashga ruxsat beramiz */
function findBlock(key, lang) {
  if (typeof key !== 'string') return null;
  const idx = key.lastIndexOf(':');
  if (idx < 0) return null;
  const pageId = key.slice(0, idx);
  const page = site.readPage(pageId);
  if (!page) return null;
  return site.collectBlocks(page.$, pageId, lang).find((b) => b.key === key) || null;
}

function normalizeValue(block, raw) {
  if (typeof raw !== 'string') throw new HttpError(400, "Qiymat matn bo'lishi kerak");
  switch (block.type) {
    case 'text':
      return sanitizeHtml(raw).slice(0, 50000);
    case 'typed':
      return raw
        .split(/\r?\n/)
        .map((s) => sanitizeHtml(s).trim())
        .filter(Boolean)
        .join('\n');
    case 'href': {
      const v = raw.trim();
      if (!v) throw new HttpError(400, "Havola bo'sh bo'lmasligi kerak");
      if (v.length > 2000) throw new HttpError(400, 'Havola juda uzun');
      if (/^\s*(javascript|data|vbscript):/i.test(v)) throw new HttpError(400, "Bunday havolaga ruxsat yo'q");
      return v;
    }
    case 'image': {
      const v = raw.trim();
      if (!isExistingMedia(v)) throw new HttpError(400, "Rasm topilmadi. Avval rasmni kutubxonaga yuklang");
      return v;
    }
    default:
      throw new HttpError(400, "Noma'lum blok turi");
  }
}

// ---------- Rasm yuklash ----------

const IMAGE_EXT = { jpg: '.jpg', png: '.png', gif: '.gif', webp: '.webp' };

/** Fayl mazmunidan (magic bytes) haqiqiy rasm turini aniqlaydi - faqat sarlavhaga ishonmaymiz */
function detectImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return IMAGE_EXT.jpg;
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return IMAGE_EXT.png;
  if (buf.length >= 6 && (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a')) return IMAGE_EXT.gif;
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return IMAGE_EXT.webp;
  return null;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, site.UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, 'tmp-' + crypto.randomBytes(10).toString('hex')),
  }),
  limits: { fileSize: MAX_UPLOAD, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new HttpError(400, 'Faqat rasm fayli yuklash mumkin'));
    cb(null, true);
  },
});

// ---------- Ilova ----------

fs.mkdirSync(site.UPLOADS_DIR, { recursive: true });
auth.ensureAdmin();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

// /ru/... va /en/... prefiksini ajratib olamiz; qolgan yo'l o'zgarmasdan qoladi
app.use((req, res, next) => {
  const m = /^\/(uz|ru|en)(?=\/|$)/.exec(req.url);
  req.lang = DEFAULT_LANG;
  if (m) {
    req.lang = m[1];
    req.url = req.url.slice(m[0].length) || '/';
  }
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(
  session({
    name: 'cms.sid',
    secret: auth.sessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === '1',
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

// ---------- Login (oddiy brute-force himoyasi) ----------

const attempts = new Map();

app.post('/api/auth/login', (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  if (rec.until > now) {
    return res.status(429).json({ error: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring" });
  }

  const username = String((req.body && req.body.username) || '');
  const password = String((req.body && req.body.password) || '');
  if (!auth.verify(username, password)) {
    rec.count += 1;
    if (rec.count >= 5) {
      rec.until = now + 15 * 60 * 1000;
      rec.count = 0;
    }
    attempts.set(ip, rec);
    return res.status(401).json({ error: "Login yoki parol noto'g'ri" });
  }

  attempts.delete(ip);
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = username;
    res.json({ ok: true });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: (req.session && req.session.user) || null });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Avval tizimga kiring' });
}

// ---------- Admin API ----------

const admin = express.Router();

admin.get('/pages', (req, res) => {
  const lang = parseLang(req.query.lang);
  const overrides = store.all(lang);
  const pages = site.listPages().map((id) => {
    const page = site.readPage(id);
    const blocks = site.collectBlocks(page.$, id, lang, overrides);
    return {
      id,
      name: site.PAGE_NAMES[id] || page.$('title').first().text().trim() || id,
      total: blocks.length,
      changed: blocks.filter((b) => b.source === 'custom').length,
      untranslated: blocks.filter((b) => b.untranslated).length,
    };
  });
  res.json({ lang, pages });
});

admin.get('/page', (req, res) => {
  const id = String(req.query.id || '');
  const lang = parseLang(req.query.lang);
  const page = site.readPage(id);
  if (!page) throw new HttpError(404, 'Sahifa topilmadi');
  const blocks = site.collectBlocks(page.$, id, lang, store.all(lang));
  res.json({ id, lang, name: site.PAGE_NAMES[id] || id, blocks });
});

admin.put('/block', (req, res) => {
  const { key, value } = req.body || {};
  const lang = parseLang(req.body && req.body.lang);
  const block = findBlock(key, lang);
  if (!block) throw new HttpError(404, 'Blok topilmadi');
  const v = normalizeValue(block, value);
  store.set(lang, key, v);
  res.json({ ok: true, value: v });
});

admin.post('/block/reset', (req, res) => {
  const { key } = req.body || {};
  const lang = parseLang(req.body && req.body.lang);
  if (!findBlock(key, lang)) throw new HttpError(404, 'Blok topilmadi');
  store.del(lang, key);
  res.json({ ok: true });
});

admin.get('/media', (req, res) => {
  const items = [];
  for (const name of fs.readdirSync(site.UPLOADS_DIR)) {
    if (name.startsWith('.') || name.startsWith('tmp-')) continue;
    const st = fs.statSync(path.join(site.UPLOADS_DIR, name));
    items.push({ name, url: '/uploads/' + name, source: 'yuklangan', deletable: true, mtime: st.mtimeMs });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  if (fs.existsSync(site.IMG_DIR)) {
    for (const name of fs.readdirSync(site.IMG_DIR).sort()) {
      if (!/\.(jpe?g|png|gif|webp)$/i.test(name)) continue;
      items.push({ name, url: '/img/' + name, source: 'sayt', deletable: false });
    }
  }
  res.json({ items });
});

admin.post('/media', upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Fayl tanlanmagan');
  const fd = fs.openSync(req.file.path, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);

  const ext = detectImage(head);
  if (!ext) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(400, 'Fayl haqiqiy rasm emas (JPG, PNG, GIF, WEBP bo\'lishi kerak)');
  }
  const name = crypto.randomBytes(10).toString('hex') + ext;
  fs.renameSync(req.file.path, path.join(site.UPLOADS_DIR, name));
  res.status(201).json({ ok: true, url: '/uploads/' + name });
});

admin.delete('/media', (req, res) => {
  const name = path.basename(String((req.body && req.body.name) || ''));
  const abs = path.join(site.UPLOADS_DIR, name);
  if (!name || !fs.existsSync(abs)) throw new HttpError(404, 'Rasm topilmadi');
  if (store.usesFile('/uploads/' + name)) {
    throw new HttpError(409, "Bu rasm saytda ishlatilmoqda. Avval uni boshqa rasm bilan almashtiring");
  }
  fs.unlinkSync(abs);
  res.json({ ok: true });
});

admin.post('/password', (req, res) => {
  const { current, newPassword } = req.body || {};
  if (!auth.verify(auth.username(), String(current || ''))) {
    throw new HttpError(400, "Joriy parol noto'g'ri");
  }
  if (String(newPassword || '').length < 8) {
    throw new HttpError(400, 'Yangi parol kamida 8 ta belgidan iborat bo\'lishi kerak');
  }
  auth.setPassword(String(newPassword));
  res.json({ ok: true });
});

app.use('/api/admin', requireAuth, admin);

// API xatolarini JSON ko'rinishida qaytaramiz
app.use('/api', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Rasm hajmi 10 MB dan oshmasligi kerak' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.expose ? err.message : 'Serverda xatolik yuz berdi' });
});

// ---------- Ommaviy sayt ----------

// Barcha HTML sahifalar tahrirlangan holatda chiqariladi
app.get(/\.html$|\/$/, (req, res, next) => {
  let rel;
  try {
    rel = decodeURIComponent(req.path);
  } catch (_) {
    return next();
  }
  if (rel.endsWith('/')) rel += 'index.html';
  rel = rel.replace(/^\/+/, '');

  const abs = site.safePagePath(rel);
  if (!abs) return next();
  const html = site.renderPage(abs, rel, req.lang, store.all(req.lang));
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

app.use('/admin', express.static(ADMIN_DIR, { extensions: ['html'] }));
app.use(express.static(site.SITE_DIR, { dotfiles: 'ignore', index: false }));

app.use((req, res) => {
  res.status(404).type('html').send('<h1>404 - Sahifa topilmadi</h1><p><a href="/">Bosh sahifa</a></p>');
});

app.listen(PORT, () => {
  console.log(`Sayt:            http://localhost:${PORT}/`);
  console.log(`Admin panel:     http://localhost:${PORT}/admin/`);
});
