// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Phone layout for plain tables  (ui/table-cards.js)
//
// Lists built for phones mark their cells with data-cell roles (.list-cards,
// mobile.css). Every other table in a page would scroll sideways on a phone.
// This gives those tables a fallback: each body cell gets its column title in
// data-label and the table the class .auto-cards; mobile.css then shows each
// row as a small card at ≤560px — the first cell as its title, the others as
// "Column  value" lines. From 561px up nothing changes.
//
// Skipped: .list-cards tables, tables with fewer than three columns, tables
// without a header row, tables in dialogs, and tables marked data-keep-table.
// Global-scope rule: classic <script>, IIFE-wrapped, exposes nothing.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const kids = (el, sel) => Array.from(el.children).filter(c => c.matches(sel));

  function headers(table) {
    const head = kids(table, 'thead')[0];
    const rows = head ? kids(head, 'tr') : [];
    const row = rows[rows.length - 1];
    if (!row) {
      return null;
    }
    const out = [];
    kids(row, 'th, td').forEach(th => {
      const span = Number(th.getAttribute('colspan')) || 1;
      const text = th.textContent.replace(/[↕↑↓]/g, '').replace(/\s+/g, ' ').trim();
      for (let i = 0; i < span; i++) {
        out.push(text);
      }
    });
    return out;
  }

  function label(table) {
    if (
      table.classList.contains('list-cards') ||
      table.hasAttribute('data-keep-table') ||
      table.closest('.modal, .modal-overlay, .pk-pop, .ask')
    ) {
      return;
    }
    const heads = headers(table);
    if (!heads || heads.length < 3) {
      return;
    }
    table.classList.add('auto-cards');
    kids(table, 'tbody, tfoot').forEach(section => {
      kids(section, 'tr').forEach(tr => {
        let col = 0;
        kids(tr, 'td, th').forEach(td => {
          const span = Number(td.getAttribute('colspan')) || 1;
          if (span === 1 && heads[col] !== undefined && !td.hasAttribute('data-label')) {
            td.setAttribute('data-label', heads[col]);
          }
          col += span;
        });
      });
    });
  }

  let queued = false;
  function scan() {
    queued = false;
    const root = document.getElementById('main-content');
    if (root) {
      root.querySelectorAll('table').forEach(label);
    }
  }
  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(scan);
    }
  }

  // Watches the whole body (the page area can be rebuilt); each scan looks at
  // the page area of that moment.
  function start() {
    if (typeof MutationObserver !== 'function' || !document.body) {
      return;
    }
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    queue();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
