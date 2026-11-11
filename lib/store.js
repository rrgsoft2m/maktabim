'use strict';
/**
 * Admin tomonidan kiritilgan o'zgarishlar: data/content.json
 *   { uz: { key: value }, ru: { ... }, en: { ... } }
 */
const fs = require('fs');
const path = require('path');
const { LANGS } = require('./i18n');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'content.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

let data = {};
if (fs.existsSync(FILE)) data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// Eski (tilsiz) formatni yangi formatga o'tkazish
if (Object.keys(data).some((k) => k.includes(':'))) {
  data = { uz: data };
}
for (const l of LANGS) if (!data[l]) data[l] = {};

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

module.exports = {
  all: (lang) => ({ ...data[lang] }),
  set(lang, key, value) {
    data[lang][key] = value;
    save();
  },
  del(lang, key) {
    delete data[lang][key];
    save();
  },
  usesFile(url) {
    return LANGS.some((l) => Object.values(data[l]).includes(url));
  },
};
