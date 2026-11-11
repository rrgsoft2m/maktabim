/*
 * Admin paneldan boshqariladigan yozuv animatsiyasi.
 * Matn elementdagi data-typed atributidan olinadi (har qator - bitta jumla).
 * Tezlik va kechikish: data-typed-speed, data-typed-delay.
 */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof Typed === 'undefined') return;

  document.querySelectorAll('[data-typed]').forEach(function (el) {
    var strings = (el.getAttribute('data-typed') || '')
      .split(/\r?\n/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (!strings.length) return;

    var speed = Number(el.getAttribute('data-typed-speed'));
    var delay = Number(el.getAttribute('data-typed-delay'));

    new Typed(el, {
      strings: strings,
      typeSpeed: isNaN(speed) ? 50 : speed,
      startDelay: isNaN(delay) ? 1000 : delay,
    });
  });
});
