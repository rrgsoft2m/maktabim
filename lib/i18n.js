'use strict';
/** Til sozlamalari va tarjima lug'atlari (i18n/ru.json, i18n/en.json) */
const fs = require('fs');
const path = require('path');

const LANGS = ['uz', 'ru', 'en'];
const DEFAULT_LANG = 'uz';
const LANG_LABEL = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
const DICT_DIR = path.join(__dirname, '..', 'i18n');

const dicts = {};
for (const l of LANGS) {
  if (l === DEFAULT_LANG) continue;
  const f = path.join(DICT_DIR, `${l}.json`);
  dicts[l] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
}

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

/** O'zbekcha matn uchun standart tarjimani qaytaradi, bo'lmasa null */
function standardText(lang, uzValue) {
  if (lang === DEFAULT_LANG || !dicts[lang]) return null;
  const k = norm(uzValue);
  return Object.prototype.hasOwnProperty.call(dicts[lang], k) ? dicts[lang][k] : null;
}

function parseLang(x) {
  return LANGS.includes(x) ? x : DEFAULT_LANG;
}

module.exports = { LANGS, DEFAULT_LANG, LANG_LABEL, norm, standardText, parseLang };
