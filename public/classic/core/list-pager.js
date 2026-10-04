// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — List pager  (list-pager.js)
//
// One page of a long list and the "1–25 dari 479 · ‹ Prev · Next ›" bar under
// it, for lists that would otherwise render every record (journals, cash
// history, period report). The caller keeps the page number and handles the
// action named in `action` (the button carries data-val = target page).
//
//   NSAPager.page(arr, page, size)            → { rows, page, pages, total }
//   NSAPager.html({ total, page, size, action, type })
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.NSAPager.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }

  function page(arr, p, size) {
    var list = arr || [];
    var n = Math.max(1, Math.floor(size) || 25);
    var pages = Math.max(1, Math.ceil(list.length / n));
    var cur = Math.min(Math.max(1, Math.floor(p) || 1), pages);
    return {
      rows: list.slice((cur - 1) * n, cur * n),
      page: cur,
      pages: pages,
      total: list.length,
    };
  }

  function html(o) {
    var n = Math.max(1, Math.floor(o.size) || 25);
    var total = o.total || 0;
    var pages = Math.max(1, Math.ceil(total / n));
    if (pages <= 1) return '';
    var cur = Math.min(Math.max(1, Math.floor(o.page) || 1), pages);
    var typeAttr = o.type ? ' data-type="' + esc(o.type) + '"' : '';
    function btn(target, label, off) {
      return (
        '<button type="button" class="btn-ghost" data-action="' +
        esc(o.action) +
        '"' +
        typeAttr +
        ' data-val="' +
        target +
        '"' +
        (off ? ' disabled' : '') +
        '>' +
        label +
        '</button>'
      );
    }
    return (
      '<div class="list-pager"><span>' +
      ((cur - 1) * n + 1) +
      '–' +
      Math.min(cur * n, total) +
      ' dari ' +
      total +
      '</span>' +
      btn(cur - 1, '‹ Prev', cur === 1) +
      btn(cur + 1, 'Next ›', cur === pages) +
      '</div>'
    );
  }

  window.NSAPager = { page: page, html: html };
})();
