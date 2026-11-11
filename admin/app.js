'use strict';

const TYPE_LABEL = { text: 'Matn', image: 'Rasm', href: 'Havola', typed: 'Animatsiya' };
const LANG_NAME = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
const state = {
  lang: 'uz', pages: [], pageId: null, pageName: '', blocks: [],
  filter: 'all', query: '', onMediaPick: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** DOM yordamchisi: h('div', {class:'x', onclick: fn}, [children]) */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(url, { method = 'GET', json, form } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (json !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(json);
  }
  if (form) opts.body = form;

  const res = await fetch('/api/' + url, opts);
  let data = {};
  try { data = await res.json(); } catch (_) { /* bo'sh javob */ }

  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('auth/')) showLogin();
    throw new Error(data.error || `Xatolik (${res.status})`);
  }
  return data;
}

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = ''; }, 3000);
}

/** Sayt ichidagi nisbiy yo'lni (./img/a.jpg) admin sahifasida ko'rsatish uchun */
function siteUrl(value) {
  if (!value) return '';
  if (/^(https?:|data:)/.test(value)) return value;
  try {
    return new URL(value, location.origin + '/' + (state.pageId || '')).pathname;
  } catch (_) {
    return value;
  }
}

// ---------- Kirish / chiqish ----------

function showLogin() {
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
}

async function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  await loadPages();
  if (!state.pageId && state.pages.length) await selectPage(state.pages[0].id);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#login-error').textContent = '';
  try {
    await api('auth/login', { method: 'POST', json: { username: f.username.value, password: f.password.value } });
    f.password.value = '';
    await showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  await api('auth/logout', { method: 'POST' }).catch(() => {});
  state.pageId = null;
  showLogin();
});

// ---------- Til ----------

function setLang(lang) {
  state.lang = lang;
  $$('#lang-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  loadPages().then(() => {
    if (state.pageId) refreshPage();
  });
}

$$('#lang-tabs button').forEach((btn) => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

// ---------- Sahifalar ----------

async function loadPages() {
  const data = await api('admin/pages?lang=' + state.lang);
  state.pages = data.pages;
  renderPageList();
}

function renderPageList() {
  const ul = $('#page-list');
  ul.innerHTML = '';
  for (const p of state.pages) {
    const stats = [`${p.changed}/${p.total} o'zgartirilgan`];
    if (state.lang !== 'uz') stats.push(p.untranslated ? `${p.untranslated} ta tarjima kerak` : 'tarjima tayyor');
    ul.append(h('li', { class: p.id === state.pageId ? 'active' : '' }, [
      h('button', { type: 'button', onclick: () => selectPage(p.id) }, [
        h('span', { class: 'pname' }, p.name),
        h('small', { class: p.untranslated && state.lang !== 'uz' ? 'warn' : '' }, stats.join(' · ')),
      ]),
      h('a', {
        href: (state.lang === 'uz' ? '' : '/' + state.lang) + '/' + (p.id === 'index.html' ? '' : p.id),
        target: '_blank', rel: 'noopener', title: "Sahifani ko'rish",
      }, '↗'),
    ]));
  }
}

async function selectPage(id) {
  state.pageId = id;
  renderPageList();
  await refreshPage();
}

async function refreshPage() {
  if (!state.pageId) return;
  const y = window.scrollY;
  const data = await api('admin/page?lang=' + state.lang + '&id=' + encodeURIComponent(state.pageId));
  state.pageName = data.name;
  state.blocks = data.blocks;
  $('#page-title').textContent = `${data.name} · ${LANG_NAME[state.lang]}`;
  $('#page-note').textContent = state.lang === 'uz'
    ? "Har bir o'zgarish darhol saytda ko'rinadi."
    : `${LANG_NAME[state.lang]} tilidagi matnlar. Tarjimasi yo'q matnlar o'zbekcha ko'rinadi.`;
  renderBlocks();
  loadPages().catch(() => {});
  window.scrollTo(0, y);
}

// ---------- Bloklar ----------

function renderBlocks() {
  const box = $('#blocks');
  box.innerHTML = '';
  const q = state.query.toLowerCase();

  const items = state.blocks.filter((b) => {
    if (state.filter === 'untranslated') { if (!b.untranslated) return false; }
    else if (state.filter !== 'all' && b.type !== state.filter) return false;
    return !q || `${b.label} ${b.value} ${b.uzValue}`.toLowerCase().includes(q);
  });

  if (!items.length) {
    box.append(h('p', { class: 'muted' }, 'Hech narsa topilmadi.'));
    return;
  }

  const groups = new Map();
  for (const b of items) {
    if (!groups.has(b.section)) groups.set(b.section, []);
    groups.get(b.section).push(b);
  }
  for (const [section, list] of groups) {
    box.append(h('h3', { class: 'section-title' }, section));
    for (const b of list) box.append(blockCard(b));
  }
}

function statusBadge(b) {
  if (b.source === 'custom') return h('span', { class: 'badge badge-changed' }, "o'zgartirilgan");
  if (b.source === 'standard') return h('span', { class: 'badge badge-standard' }, 'standart tarjima');
  if (b.untranslated) return h('span', { class: 'badge badge-warn' }, 'tarjima kerak');
  return null;
}

function blockCard(b) {
  return h('div', { class: 'card' + (b.source === 'custom' ? ' changed' : ''), 'data-key': b.key }, [
    h('div', { class: 'card-head' }, [
      h('span', { class: `badge badge-${b.type}` }, TYPE_LABEL[b.type]),
      h('span', { class: 'card-label' }, b.label),
      statusBadge(b),
    ]),
    b.type === 'image' ? imageEditor(b) : textEditor(b),
  ]);
}

function resetLabel() {
  return state.lang === 'uz' ? 'Asliga qaytarish' : 'Standart tarjimaga qaytarish';
}

function textEditor(b) {
  const multiline = b.type === 'text' || b.type === 'typed';
  const input = multiline
    ? h('textarea', { rows: Math.min(10, Math.max(2, Math.ceil(b.value.length / 80) + (b.value.match(/\n/g) || []).length)) })
    : h('input', { type: 'text' });
  input.value = b.value;

  const hint = {
    text: 'HTML teglar ishlatish mumkin: <strong>, <br>, <span>.',
    typed: 'Har bir qator alohida jumla bo‘lib, ketma-ket yoziladi.',
    href: 'Misollar: https://..., tel:+998..., mailto:..., ./navs/team.html',
  }[b.type];

  const details = (state.lang !== 'uz' && multiline)
    ? h('details', {}, [h('summary', {}, "O'zbekcha asl matn"), h('pre', {}, b.uzValue || '(bo‘sh)')])
    : null;

  return h('div', { class: 'editor' }, [
    input,
    h('p', { class: 'hint' }, hint),
    details,
    h('div', { class: 'actions' }, [
      h('button', { type: 'button', class: 'primary', onclick: () => saveBlock(b.key, input.value) }, 'Saqlash'),
      b.source === 'custom'
        ? h('button', { type: 'button', class: 'ghost', onclick: () => resetBlock(b.key) }, resetLabel())
        : null,
    ]),
  ]);
}

function imageEditor(b) {
  return h('div', { class: 'editor image-editor' }, [
    h('img', { class: 'thumb', src: siteUrl(b.value), alt: '' }),
    h('div', { class: 'path' }, b.value),
    h('div', { class: 'actions' }, [
      h('button', { type: 'button', class: 'primary', onclick: () => openMedia((url) => saveBlock(b.key, url)) }, 'Rasmni almashtirish'),
      b.source === 'custom'
        ? h('button', { type: 'button', class: 'ghost', onclick: () => resetBlock(b.key) }, resetLabel())
        : null,
    ]),
  ]);
}

async function saveBlock(key, value) {
  try {
    await api('admin/block', { method: 'PUT', json: { key, value, lang: state.lang } });
    toast('Saqlandi');
    await refreshPage();
  } catch (err) {
    toast(err.message, true);
  }
}

async function resetBlock(key) {
  if (!confirm("O'zgarish bekor qilinsinmi? Qiymat standart holatiga qaytadi.")) return;
  try {
    await api('admin/block/reset', { method: 'POST', json: { key, lang: state.lang } });
    toast('Qaytarildi');
    await refreshPage();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- Rasm kutubxonasi ----------

function openMedia(onPick) {
  state.onMediaPick = onPick;
  renderMedia().catch((err) => toast(err.message, true));
  $('#media-dialog').showModal();
}

async function renderMedia() {
  const { items } = await api('admin/media');
  const grid = $('#media-grid');
  grid.innerHTML = '';
  if (!items.length) grid.append(h('p', { class: 'muted' }, "Hali rasm yo'q. Yangi rasm yuklang."));

  for (const it of items) {
    grid.append(h('div', { class: 'tile' }, [
      h('img', {
        src: it.url,
        alt: it.name,
        loading: 'lazy',
        title: 'Tanlash',
        onclick: () => {
          $('#media-dialog').close();
          if (state.onMediaPick) state.onMediaPick(it.url);
        },
      }),
      h('div', { class: 'tile-meta' }, [
        h('span', { title: it.name }, it.name),
        h('span', { class: 'badge' }, it.source),
      ]),
      it.deletable ? h('button', { type: 'button', class: 'ghost small', onclick: () => deleteMedia(it.name) }, "O'chirish") : null,
    ]));
  }
}

async function deleteMedia(name) {
  if (!confirm(`"${name}" rasmini o'chirilsinmi?`)) return;
  try {
    await api('admin/media', { method: 'DELETE', json: { name } });
    toast("Rasm o'chirildi");
    await renderMedia();
  } catch (err) {
    toast(err.message, true);
  }
}

$('#media-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api('admin/media', { method: 'POST', form: fd });
    toast("Rasm yuklandi. Endi uni ro'yxatdan tanlang");
    await renderMedia();
  } catch (err) {
    toast(err.message, true);
  } finally {
    e.target.value = '';
  }
});

// ---------- Dialoglar, qidiruv, filtr ----------

$$('dialog [data-close]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('dialog').close()));

$('#btn-password').addEventListener('click', () => {
  $('#password-form').reset();
  $('#password-dialog').showModal();
});

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.newPassword.value !== f.confirm.value) {
    toast('Yangi parollar bir xil emas', true);
    return;
  }
  try {
    await api('admin/password', {
      method: 'POST',
      json: { current: f.current.value, newPassword: f.newPassword.value },
    });
    toast("Parol o'zgartirildi");
    f.reset();
    $('#password-dialog').close();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#search').addEventListener('input', (e) => {
  state.query = e.target.value.trim();
  renderBlocks();
});

$$('#filters button').forEach((btn) => btn.addEventListener('click', () => {
  state.filter = btn.dataset.filter;
  $$('#filters button').forEach((b) => b.classList.toggle('active', b === btn));
  renderBlocks();
}));

// ---------- Ishga tushirish ----------

(async function init() {
  try {
    const me = await api('auth/me');
    if (me.user) await showApp();
    else showLogin();
  } catch (_) {
    showLogin();
  }
})();
