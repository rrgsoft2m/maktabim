#!/usr/bin/env node
'use strict';
/**
 * Bir martalik skript: sayt HTML fayllariga tahrirlanadigan joylarni belgilaydi.
 *   - rasmlar                 -> data-edit="<sahifa>:i-NNN"
 *   - matnli elementlar       -> data-edit="<sahifa>:t-NNN"
 *   - havolalar (href)        -> data-edit-href="<sahifa>:h-NNN"
 *   - yozuv animatsiyasi (JS) -> data-edit="<sahifa>:y-NNN" + data-typed matni
 * Qayta ishga tushirsa, allaqachon belgilangan fayllarni o'tkazib yuboradi.
 */
const fs = require('fs');
const path = require('path');
const { load, SITE_DIR } = require('../lib/site');

const INLINE = new Set(['br', 'strong', 'b', 'em', 'span', 'small', 'u', 'mark']);
const SKIP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript',
  'option', 'select', 'textarea', 'svg', 'iframe', 'input']);
const TYPED_INIT_SRC = 'js/typed-init.js';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'uploads' || ent.name === 'node_modules') continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (ent.name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const tagOf = (el) => (el.tagName || el.name || '').toLowerCase();

function allInline($, el) {
  return $(el).children().toArray().every(
    (c) => c.type === 'tag' && INLINE.has(tagOf(c)) && allInline($, c),
  );
}

function isTextBlock($, el) {
  return $(el).text().trim() !== '' && allInline($, el);
}

function annotateFile(abs) {
  const rel = path.relative(SITE_DIR, abs).split(path.sep).join('/');
  const html = fs.readFileSync(abs, 'utf8');
  if (html.includes('data-edit')) {
    console.log(`  o'tkazildi (allaqachon belgilangan): ${rel}`);
    return null;
  }

  const $ = load(html);
  const counters = { t: 0, i: 0, h: 0, y: 0 };
  const next = (code) => {
    counters[code] += 1;
    return `${rel}:${code}-${String(counters[code]).padStart(3, '0')}`;
  };
  const stats = { t: 0, i: 0, h: 0, y: 0 };

  // 1) Yozuv animatsiyalari (Typed.js) - JS faylidagi matnni HTML'ga ko'chiramiz
  let typedInjected = false;
  $('script[src]').each((_, s) => {
    const src = $(s).attr('src');
    if (/^(https?:)?\/\//.test(src)) return;
    const file = path.join(path.dirname(abs), src);
    if (!fs.existsSync(file)) return;
    const code = fs.readFileSync(file, 'utf8');
    if (!/new Typed\(/.test(code)) return;

    const selM = /new\s+Typed\(\s*['"`]([^'"`]+)['"`]/.exec(code);
    const optM = /let\s+options\s*=\s*(\{[\s\S]*?\})\s*;/.exec(code);
    const target = selM ? $(selM[1]).first() : null;
    if (optM && target && target.length && !target.attr('data-edit')) {
      const opts = new Function('return ' + optM[1])();
      target.attr('data-edit', next('y'));
      target.attr('data-typed', (opts.strings || []).join('\n'));
      target.attr('data-typed-speed', String(opts.typeSpeed ?? 50));
      target.attr('data-typed-delay', String(opts.startDelay ?? 1000));
      stats.y += 1;
    }
    $(s).remove(); // eski skriptni olib tashlaymiz, uning o'rniga umumiy skript qo'yiladi
    typedInjected = true;
  });

  // 2) Rasm va matn/havolalarni DFS bo'yicha belgilash
  const visit = (parent) => {
    $(parent).children().each((_, el) => {
      if (el.type !== 'tag') return;
      const tag = tagOf(el);
      if (SKIP.has(tag) || $(el).attr('data-edit')) return;

      if (tag === 'img') {
        if ($(el).attr('src')) {
          $(el).attr('data-edit', next('i'));
          stats.i += 1;
        }
        return;
      }

      if (tag === 'a') {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !/^javascript:/i.test(href)) {
          $(el).attr('data-edit-href', next('h'));
          stats.h += 1;
        }
      }

      if (isTextBlock($, el)) {
        $(el).attr('data-edit', next('t'));
        stats.t += 1;
        return;
      }
      visit(el);
    });
  };
  visit($.root());

  // 3) Animatsiya skriptini ulaymiz (typescript.js dan keyin)
  if (typedInjected) {
    const relToJs = path.relative(path.dirname(abs), path.join(SITE_DIR, TYPED_INIT_SRC)).split(path.sep).join('/');
    const srcAttr = relToJs.startsWith('.') ? relToJs : './' + relToJs;
    const tag = `<script src="${srcAttr}"></script>`;
    const tsScript = $('script[src]').filter((_, e) => /typescript\.js$/.test($(e).attr('src') || '')).first();
    if (tsScript.length) tsScript.after(tag);
    else $('body').append(tag);
  }

  fs.writeFileSync(abs, $.html(), 'utf8');
  return { rel, stats };
}

function main() {
  const files = walk(SITE_DIR);
  let total = { t: 0, i: 0, h: 0, y: 0 };
  for (const f of files) {
    const res = annotateFile(f);
    if (!res) continue;
    const { rel, stats } = res;
    console.log(`  ${rel}: matn=${stats.t}, rasm=${stats.i}, havola=${stats.h}, animatsiya=${stats.y}`);
    for (const k of Object.keys(total)) total[k] += stats[k];
  }
  console.log(`\nJami: matn=${total.t}, rasm=${total.i}, havola=${total.h}, animatsiya=${total.y}`);
}

main();
