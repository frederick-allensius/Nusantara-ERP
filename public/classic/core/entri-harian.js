// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Entri Harian  (entri-harian.js)   [Section 5, dual-view]
//
// The focused daily data-entry surface for the admin who runs the trading
// pickups (roles akunting + penjualan, and available to admin + manajer too).
// Four task cards for the daily work of the pickup flow, plus one secondary link:
//
//   • Catat Pengambilan     → _pickupView.openRecord      (a truck and its weight)
//   • Impor Rekap Timbangan → _pickupView.openRecapImport (Excel from the weighbridge)
//   • Tagih Pelanggan       → _pickupBilling.openCustomerBilling (invoice trips)
//   • Biaya Operasional     → _bankExtras.openOtherPayment (Transport, ATK,
//     Entertain …). The expense is posted as an otherPayments document through
//     the existing finance path — this module never hand-writes a GL journal.
//   • Buat PO (secondary)   → the erp-view.js create handler (addPO)
//
// Each task opens its menu entry (NSANav.open) so the sidebar highlight follows;
// the opener function is the fallback. Today's figures come from trips
// (Trading.isTrip), open weight alerts, unbilled trips and other payments.
//
// Which surfaces a role sees is decided by rbac.js (window.RBAC.surfaceFor /
// canViewSurface / ENTRI_ACTIONS); a card whose module the user cannot view is
// not shown. Every mutation is still checked by the rbac saveDB net and
// firestore.rules.
//
// Global-scope rule: classic <script>, IIFE-wrapped. Exposes the view renderer
// window.renderEntriHarian (picked up by erp-view.js getRenderer via late
// binding) plus window._entriHarian for its open/route helpers.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function db() {
    return window.DB || {};
  }
  function nav(v) {
    if (typeof window.navigate === 'function') window.navigate(v);
  }
  function toast(m, t) {
    if (typeof window.showToast === 'function') window.showToast(m, t);
  }
  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  // Local calendar date (not UTC — the office works in WIB).
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function canView(module) {
    var R = window.RBAC;
    return !module || !R || typeof R.canView !== 'function' || R.canView(module);
  }

  // The operational entry tasks, in order. Kept aligned with
  // window.RBAC.ENTRI_ACTIONS (the shared source of truth for "exactly the
  // operational entry tasks"). `tone` picks colour tokens (style.css .eh-tone-*).
  var TASKS = [
    {
      key: 'catatPengambilan',
      title: 'Catat Pengambilan',
      desc: 'Truk yang mengambil barang dan hasil timbangannya',
      tone: 'primary',
      action: 'ehCatat',
      module: 'purchases',
      icon: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    },
    {
      key: 'imporRekap',
      title: 'Impor Rekap Timbangan',
      desc: 'Excel dari bagian timbangan supplier, dicocokkan ke surat jalan',
      tone: 'info',
      action: 'ehRekap',
      module: 'purchases',
      icon: '<path d="M12 3v18"/><path d="M3 7h18"/><path d="M6 7l-3 6a3 3 0 0 0 6 0z"/><path d="M18 7l3 6a3 3 0 0 1-6 0z"/>',
    },
    {
      key: 'tagihPelanggan',
      title: 'Tagih Pelanggan',
      desc: 'Faktur dari pengambilan pelanggan per periode',
      tone: 'success',
      action: 'ehTagih',
      module: 'sales',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    },
    {
      key: 'biayaOperasional',
      title: 'Biaya Operasional',
      desc: 'Catat pengeluaran: Transport, ATK, Entertain',
      tone: 'warning',
      action: 'ehBiaya',
      module: 'gl',
      icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    },
  ];

  // Secondary entries, shown as a link under the cards.
  var SECONDARY = [{ key: 'po', title: 'Buat PO', action: 'ehPO', module: 'purchases' }];

  function _icon(paths) {
    return (
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths +
      '</svg>'
    );
  }

  // ── Today's operational summary (kept minimal, no analytics) ─────────────────
  function _todayCounts() {
    var t = today();
    var T = window.Trading;
    var dos = db().deliveryOrders || [];
    var trips =
      T && typeof T.isTrip === 'function'
        ? dos.filter(function (d) {
            return T.isTrip(d) && String(d.date || '').slice(0, 10) === t;
          })
        : [];
    var tripQty = {};
    trips.forEach(function (d) {
      var unit = ((d.lines && d.lines[0]) || {}).unit || '';
      tripQty[unit] = Math.round(((tripQty[unit] || 0) + T.netOf(d)) * 1000) / 1000;
    });
    var payments = (db().otherPayments || []).filter(function (p) {
      return p && String(p.date || '').slice(0, 10) === t;
    });
    return {
      trips: trips.length,
      tripQty: tripQty,
      alerts: T && typeof T.openAlerts === 'function' ? T.openAlerts().length : 0,
      unbilled: T && typeof T.unbilled === 'function' ? T.unbilled('sales').length : 0,
      biaya: payments.length,
    };
  }

  function _qtyText(map) {
    return Object.keys(map)
      .map(function (u) {
        return (
          Number(map[u]).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + (u ? ' ' + u : '')
        );
      })
      .join(' · ');
  }

  function renderEntriHarian() {
    var c = _todayCounts();
    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            {
              label: 'Pengambilan hari ini',
              value: String(c.trips),
              sub: c.trips ? _qtyText(c.tripQty) : 'Belum ada truk tercatat',
            },
            {
              label: 'Perubahan timbangan',
              value: String(c.alerts),
              sub: 'Menunggu ditindaklanjuti',
              color: c.alerts ? 'var(--warning)' : '',
            },
            {
              label: 'Belum ditagih',
              value: String(c.unbilled),
              sub: 'Pengambilan tanpa faktur',
              color: c.unbilled ? 'var(--warning)' : '',
            },
            {
              label: 'Biaya hari ini',
              value: String(c.biaya),
              sub: 'Pengeluaran dicatat',
            },
          ])
        : '';

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr('Entri Harian', 'Pekerjaan rutin pengambilan, penagihan, dan biaya', '', '')
        : '<div class="sec-hdr"><div><h1>Entri Harian</h1>' +
          '<p>Pekerjaan rutin pengambilan, penagihan, dan biaya</p></div></div>';

    var cards = TASKS.filter(function (task) {
      return canView(task.module);
    })
      .map(function (task) {
        return (
          '<button type="button" class="card eh-task eh-tone-' +
          task.tone +
          '" data-action="' +
          esc(task.action) +
          '">' +
          '<span class="eh-task-icon">' +
          _icon(task.icon) +
          '</span>' +
          '<span class="eh-task-text"><span class="eh-task-title">' +
          esc(task.title) +
          '</span><span class="eh-task-desc">' +
          esc(task.desc) +
          '</span></span>' +
          '<span class="eh-task-go" aria-hidden="true">' +
          _icon('<polyline points="9 18 15 12 9 6"/>') +
          '</span>' +
          '</button>'
        );
      })
      .join('');

    var secondary = SECONDARY.filter(function (s) {
      return canView(s.module);
    })
      .map(function (s) {
        return (
          '<button type="button" class="btn-ghost btn-sm" data-action="' +
          esc(s.action) +
          '">' +
          esc(s.title) +
          '</button>'
        );
      })
      .join('');

    return (
      header +
      stats +
      '<div class="eh-grid">' +
      cards +
      '</div>' +
      (secondary
        ? '<div class="eh-secondary"><span class="t-muted">Lainnya:</span>' + secondary + '</div>'
        : '')
    );
  }

  // ── Task routing ─────────────────────────────────────────────────────────────
  // Each task hands off to an existing feature so there is no duplicated logic.
  // Opening through the menu entry keeps the sidebar highlight on that entry;
  // when the menu is not available the opener is called directly.
  function _openEntry(label, owner, fn, missing) {
    if (window.NSANav && typeof window.NSANav.open === 'function' && window.NSANav.open(label)) {
      return;
    }
    var ex = window[owner];
    if (ex && typeof ex[fn] === 'function') {
      ex[fn]();
    } else {
      toast(missing, 'warning');
    }
  }

  function openCatatPengambilan() {
    _openEntry('Catat Pengambilan', '_pickupView', 'openRecord', 'Halaman pengambilan belum siap');
  }
  function openImporRekap() {
    _openEntry(
      'Impor Rekap Timbangan',
      '_pickupView',
      'openRecapImport',
      'Halaman impor rekap belum siap'
    );
  }
  function openTagihPelanggan() {
    _openEntry(
      'Tagih Pelanggan',
      '_pickupBilling',
      'openCustomerBilling',
      'Halaman tagih pelanggan belum siap'
    );
  }
  function openBiayaOperasional() {
    _openEntry(
      'Pengeluaran Lain',
      '_bankExtras',
      'openOtherPayment',
      'Modul pengeluaran belum siap'
    );
  }

  // erp-view.js dispatches create actions (addPO / addDO) from a single
  // document-level delegated click handler keyed on data-action. Emulate that
  // click with a synthetic element so the existing handler runs unchanged.
  function _fireAction(name) {
    var el = document.createElement('button');
    el.setAttribute('data-action', name);
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 0);
  }

  function openPO() {
    nav('purchase');
    setTimeout(function () {
      _fireAction('addPO');
    }, 0);
  }
  // Earlier tasks of this surface, still reachable for callers that use them
  // (Surat Jalan and Rekonsiliasi Timbangan are also in the sidebar).
  function openSuratJalan() {
    nav('logistics');
    setTimeout(function () {
      _fireAction('addDO');
    }, 0);
  }
  function openTimbangan() {
    var ex = window._pipelineExtras;
    if (ex && typeof ex.openReconciliation === 'function') {
      ex.openReconciliation();
    } else {
      toast('Modul rekonsiliasi belum siap', 'warning');
    }
  }

  function open() {
    nav('entriHarian');
  }

  // ── Event delegation for the task cards ──────────────────────────────────────
  var HANDLERS = {
    ehCatat: openCatatPengambilan,
    ehRekap: openImporRekap,
    ehTagih: openTagihPelanggan,
    ehBiaya: openBiayaOperasional,
    ehPO: openPO,
    ehDO: openSuratJalan,
    ehTimbangan: openTimbangan,
  };
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var fn = HANDLERS[btn.getAttribute('data-action')];
    if (fn) fn();
  });

  // ── Expose ───────────────────────────────────────────────────────────────────
  window.renderEntriHarian = renderEntriHarian;
  window._entriHarian = {
    open: open,
    openCatatPengambilan: openCatatPengambilan,
    openImporRekap: openImporRekap,
    openTagihPelanggan: openTagihPelanggan,
    openBiayaOperasional: openBiayaOperasional,
    openPO: openPO,
    openSuratJalan: openSuratJalan,
    openTimbangan: openTimbangan,
    // The ordered task keys this surface exposes (for tests / gating).
    tasks: TASKS.map(function (t) {
      return t.key;
    }),
    // Secondary entries under the cards.
    secondary: SECONDARY.map(function (s) {
      return s.key;
    }),
  };

  console.log('[EntriHarian] Daily data-entry surface ready');
})();
