'use strict';
/**
 * Sayt fayllarini o'qish, tahrirlangan va tarjima qilingan qiymatlarni qo'yish.
 * Kalit formati:  <sahifa>:<tur>-<raqam>
 *   t = matn (innerHTML)  i = rasm (src)  y = yozuv animatsiyasi (data-typed)
 *   h = havola (href)     -- data-edit-href atributi orqali
 *
 * Qiymat tartibi: admin tahriri (content) > standart tarjima (i18n) > o'zbekcha asl matn
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { DEFAULT_LANG, standardText } = require('./i18n');

const SITE_DIR = path.join(__dirname, '..', 'site');
const UPLOADS_DIR = path.join(SITE_DIR, 'uploads');
const IMG_DIR = path.join(SITE_DIR, 'img');

const TYPE_BY_CODE = { t: 'text', i: 'image', h: 'href', y: 'typed' };
const TRANSLATABLE = new Set(['text', 'typed']);

const PAGE_NAMES = {
  'index.html': 'Bosh sahifa',
  'navs/mkb-hi.html': 'Maktab hayoti',
  'navs/team.html': 'Maktab hodimlari',
  'navs/Alochilar.html': "A'lochilar",
  "navs/To'garaklar.html": "To'garaklar",
  'navs/Biz_bilan_boglaning.html': "Biz bilan bog'lanish",
  'navs/form.html': 'Forma',
};

const SECTION_NAMES = {
  header_container: 'Sarlavha va bosh qism',
  hero: 'Bosh qism',
  abaut: 'Maktab haqida',
  'team-section': 'Rahbariyat',
  school: "Maktab ko'rinishi",
  footer: 'Pastki qism',
};

const TAG_NAMES = {
  h1: 'Sarlavha', h2: 'Sarlavha', h3: 'Sarlavha', h4: 'Sarlavha', h5: 'Sarlavha', h6: 'Sarlavha',
  a: 'Havola matni', li: "Ro'yxat", button: 'Tugma', label: 'Yozuv', figcaption: 'Izoh',
  td: 'Jadval', th: 'Jadval',
};

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

function load(html) {
  return cheerio.load(html, { decodeEntities: false });
}

function safePagePath(relPath) {
  const abs = path.normalize(path.join(SITE_DIR, relPath));
  if (!abs.startsWith(SITE_DIR + path.sep)) return null;
  if (!abs.endsWith('.html')) return null;
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch (_) {
    return null;
  }
  return abs;
}

function toId(abs) {
  return path.relative(SITE_DIR, abs).split(path.sep).join('/');
}

function listPages() {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'uploads' || ent.name === 'node_modules') continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.name.endsWith('.html')) out.push(toId(abs));
    }
  };
  walk(SITE_DIR);
  return out.sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}

function readPage(id) {
  const abs = safePagePath(id);
  if (!abs) return null;
  return { abs, $: load(fs.readFileSync(abs, 'utf8')) };
}

function blockTypeOf(key) {
  const m = /:([tihy])-\d+$/.exec(key || '');
  return m ? TYPE_BY_CODE[m[1]] : null;
}

/** Elementning asl (o'zbekcha) qiymati */
function defaultOf($el, type) {
  if (type === 'text') return $el.html().trim();
  if (type === 'image') return $el.attr('src') || '';
  if (type === 'typed') return $el.attr('data-typed') || '';
  return $el.attr('href') || '';
}

function sectionOf($el) {
  const sec = $el.closest('section, header, footer, nav').first();
  if (!sec.length) return 'Asosiy qism';
  const id = sec.attr('id');
  return (id && SECTION_NAMES[id]) || 'Asosiy qism';
}

function labelOf($el, type) {
  const tag = ($el[0].tagName || '').toLowerCase();
  const text = $el.text().replace(/\s+/g, ' ').trim();
  if (type === 'image') {
    const src = $el.attr('src') || '';
    const name = /^https?:\/\//.test(src)
      ? 'Tashqi rasm (' + src.replace(/^https?:\/\//, '').split('/')[0] + ')'
      : src.split('/').pop().split('?')[0];
    return `Rasm: ${$el.attr('alt') || name}`;
  }
  if (type === 'href') {
    const icon = ($el.find('i').attr('class') || '').split(/\s+/).find((c) => c.startsWith('fa-'));
    const shownHref = ($el.attr('href') || '').slice(0, 60);
    return `Havola: ${text.slice(0, 60) || (icon ? icon.replace('fa-', '') + ' belgisi' : '(belgi)')} → ${shownHref}`;
  }
  if (type === 'typed') return 'Animatsiyali yozuv';
  return `${TAG_NAMES[tag] || 'Matn'}: ${text.slice(0, 90) || "(bo'sh)"}`;
}

/**
 * Bitta blok uchun tilga xos qiymatni hisoblaydi.
 * Qaytaradi: { value, standard, source }
 *   source: 'custom' (admin kiritgan) | 'standard' (lug'atdan) | 'original' (o'zbekcha asl)
 */
function resolve(lang, key, type, uzValue, overrides) {
  const std = TRANSLATABLE.has(type) ? standardText(lang, uzValue) : null;
  const standard = std !== null ? std : uzValue;
  if (has(overrides, key)) return { value: overrides[key], standard, source: 'custom' };
  return { value: standard, standard, source: std !== null ? 'standard' : 'original' };
}

/** Sahifadagi barcha tahrirlanadigan bloklar (berilgan til uchun) */
function collectBlocks($, pageId, lang = DEFAULT_LANG, overrides = {}) {
  const blocks = [];
  const add = (el, key, type) => {
    const $el = $(el);
    const uzValue = defaultOf($el, type);
    const r = resolve(lang, key, type, uzValue, overrides);
    blocks.push({
      key,
      type,
      section: sectionOf($el),
      label: labelOf($el, type),
      uzValue,
      standardValue: r.standard,
      value: r.value,
      source: r.source,
      overridden: r.source === 'custom',
      untranslated: lang !== DEFAULT_LANG && TRANSLATABLE.has(type) && r.source === 'original',
    });
  };

  $('[data-edit]').each((_, el) => {
    const key = $(el).attr('data-edit');
    const type = blockTypeOf(key);
    if (type) add(el, key, type);
  });
  $('[data-edit-href]').each((_, el) => add(el, $(el).attr('data-edit-href'), 'href'));
  return blocks;
}

function urlFor(lang, pageId) {
  const prefix = lang === DEFAULT_LANG ? '' : '/' + lang;
  return prefix + '/' + (pageId === 'index.html' ? '' : pageId);
}

/** Sarlavhadagi menyuga til almashtirgich qo'shadi */
function injectLanguageSwitcher($, pageId, lang) {
  const ul = $('.nav-list ul').first();
  if (!ul.length) return;
  const item = { uz: 'UZ', ru: 'RU', en: 'EN' };
  // Sayt CSS'i havolalarni blok qilib yubormasligi uchun inline uslub beramiz
  const linkStyle = 'display:inline-block;padding:0;margin:0;font-size:14px;letter-spacing:1px;';
  const links = ['uz', 'ru', 'en'].map((l) => {
    const weight = l === lang ? 'font-weight:700;text-decoration:underline;' : 'opacity:.75;';
    return `<a href="${urlFor(l, pageId)}" style="${linkStyle}${weight}">${item[l]}</a>`;
  });
  ul.append(
    `<li class="lang-switch" style="list-style:none;display:flex;align-items:center;gap:8px;padding:0 6px;">${links.join('<span style="opacity:.5">/</span>')}</li>`,
  );
}

/** Sahifani berilgan til va tahrirlarga ko'ra chiqarish */
function renderPage(abs, pageId, lang, overrides) {
  const $ = load(fs.readFileSync(abs, 'utf8'));

  $('[data-edit]').each((_, el) => {
    const key = $(el).attr('data-edit');
    const type = blockTypeOf(key);
    if (!type) return;
    const r = resolve(lang, key, type, defaultOf($(el), type), overrides);
    if (r.source === 'original') return; // o'zbekcha asl matn - o'zgarishsiz qoladi
    if (type === 'text') $(el).html(r.value);
    else if (type === 'image') $(el).attr('src', r.value);
    else if (type === 'typed') $(el).attr('data-typed', r.value);
  });

  $('[data-edit-href]').each((_, el) => {
    const key = $(el).attr('data-edit-href');
    if (has(overrides, key)) $(el).attr('href', overrides[key]);
  });

  $('html').attr('lang', lang);
  injectLanguageSwitcher($, pageId, lang);
  return $.html();
}

module.exports = {
  SITE_DIR,
  UPLOADS_DIR,
  IMG_DIR,
  PAGE_NAMES,
  load,
  safePagePath,
  listPages,
  readPage,
  blockTypeOf,
  collectBlocks,
  renderPage,
};
