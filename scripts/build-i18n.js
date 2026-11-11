#!/usr/bin/env node
'use strict';
/**
 * i18n/source.js dan ru.json va en.json ni yaratadi.
 * Har bir o'zbekcha matn saytdagi asl matn bilan mos kelishini tekshiradi.
 */
const fs = require('fs');
const path = require('path');
const site = require('../lib/site');
const { norm } = require('../lib/i18n');

const rows = require('../i18n/source');
const DIR = path.join(__dirname, '..', 'i18n');

// Saytdagi barcha asl matnlar
const siteTexts = new Set();
for (const id of site.listPages()) {
  const page = site.readPage(id);
  for (const b of site.collectBlocks(page.$, id, 'uz')) {
    if (b.type === 'text' || b.type === 'typed') siteTexts.add(norm(b.uzValue));
  }
}

const ru = {}, en = {};
const unmatched = [];
for (const [uz, r, e] of rows) {
  if (!siteTexts.has(norm(uz))) unmatched.push(uz.slice(0, 70));
  ru[norm(uz)] = r;
  en[norm(uz)] = e;
}
fs.writeFileSync(path.join(DIR, 'ru.json'), JSON.stringify(ru, null, 2), 'utf8');
fs.writeFileSync(path.join(DIR, 'en.json'), JSON.stringify(en, null, 2), 'utf8');
console.log(`Tarjimalar: ${rows.length} ta. Saytda topilmadi: ${unmatched.length}`);
unmatched.forEach((u) => console.log('  - ' + u));
