// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Entri Harian  (entri-harian.js)   [Section 5, dual-view]
//
// The focused, minimal daily data-entry surface for the Admin/Accounting
// personas (roles akunting + penjualan, and available to admin + manajer too).
// It surfaces EXACTLY the operational entry tasks and nothing else — no
// executive analytics clutter:
//
//   • PO                  → Buat Purchase Order        (data-action addPO)
//   • Surat Jalan (DO)    → Buat Delivery Order         (data-action addDO)
//   • Timbangan           → Rekonsiliasi Penerimaan     (_pipelineExtras,
//                           weighbridge capture + reconciliation, FEAT-002)
//   • Biaya Operasional   → Other Payment / pengeluaran (_bankExtras) with the
//     (Transport, ATK, Entertain) categories. The expense is posted as an
//     otherPayments document through the existing finance path — this module
//     never hand-writes a GL journal.
//
// Which surfaces a role sees is decided by rbac.js (window.RBAC.surfaceFor /
// canViewSurface / ENTRI_ACTIONS). This module is show/hide composition only;
// every mutation is still checked by the rbac saveDB net and firestore.rules.
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
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // The operational entry tasks, in order. Kept aligned with
  // window.RBAC.ENTRI_ACTIONS (the shared source of truth for "exactly the
  // operational entry tasks").
  var TASKS = [
    {
      key: 'po',
      title: 'Purchase Order',
      desc: 'Buat PO pembelian ke supplier',
      color: '#F59E0B',
      action: 'ehPO',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    },
    {
      key: 'suratJalan',
      title: 'Surat Jalan (DO)',
      desc: 'Buat Delivery Order / surat jalan pengiriman',
      color: '#10B981',
      action: 'ehDO',
      icon: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    },
    {
      key: 'timbangan',
      title: 'Timbangan & Rekonsiliasi',
      desc: 'Catat bruto/tara/netto dan rekonsiliasi penerimaan',
      color: '#6366F1',
      action: 'ehTimbangan',
      icon: '<path d="M12 3v18"/><path d="M3 7h18"/><path d="M6 7l-3 6a3 3 0 0 0 6 0z"/><path d="M18 7l3 6a3 3 0 0 1-6 0z"/>',
    },
    {
      key: 'biayaOperasional',
      title: 'Biaya Operasional',
      desc: 'Catat pengeluaran: Transport, ATK, Entertain',
      color: '#EC4899',
      action: 'ehBiaya',
      icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    },
  ];

  function _icon(paths, color) {
    return (
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' +
      color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      '</svg>'
    );
  }

  // ── Today's operational summary (kept minimal, no analytics) ─────────────────
  function _todayCounts() {
    var t = today();
    var startsToday = function (arr, field) {
      return (arr || []).filter(function (o) {
        return o && (o[field] || '').slice(0, 10) === t;
      }).length;
    };
    var pos = db().purchaseOrders || [];
    var dos = db().deliveryOrders || [];
    var receipts = db().goodsReceipts || [];
    var pending = receipts.filter(function (r) {
      return r && !r.reconciled;
    }).length;
    var payments = db().otherPayments || [];
    return {
      po: startsToday(pos, 'date'),
      suratJalan: startsToday(dos, 'date'),
      pendingRecon: pending,
      biaya: startsToday(payments, 'date'),
    };
  }

  function renderEntriHarian() {
    var c = _todayCounts();
    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'PO Hari Ini', value: String(c.po), sub: 'Dibuat hari ini' },
            {
              label: 'Surat Jalan Hari Ini',
              value: String(c.suratJalan),
              sub: 'Pengiriman',
              color: '#10B981',
            },
            {
              label: 'Menunggu Rekonsiliasi',
              value: String(c.pendingRecon),
              sub: 'Penerimaan belum direkonsiliasi',
              color: '#F59E0B',
            },
            {
              label: 'Biaya Hari Ini',
              value: String(c.biaya),
              sub: 'Pengeluaran dicatat',
              color: '#EC4899',
            },
          ])
        : '';

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Entri Harian',
            'Tugas entri operasional harian — fokus tanpa gangguan',
            '',
            ''
          )
        : '<div class="sec-hdr"><div><h1>Entri Harian</h1>' +
          '<p>Tugas entri operasional harian — fokus tanpa gangguan</p></div></div>';

    var cards = TASKS.map(function (task) {
      return (
        '<button class="card" data-action="' +
        esc(task.action) +
        '" style="text-align:left;cursor:pointer;border:1px solid var(--border);display:flex;gap:14px;align-items:flex-start;padding:18px">' +
        '<div style="flex:0 0 44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:' +
        task.color +
        '22">' +
        _icon(task.icon, task.color) +
        '</div>' +
        '<div style="flex:1">' +
        '<div style="font-size:15px;font-weight:700;color:var(--text)">' +
        esc(task.title) +
        '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:3px">' +
        esc(task.desc) +
        '</div>' +
        '</div>' +
        '<div style="font-size:20px;color:' +
        task.color +
        ';font-weight:700">+</div>' +
        '</button>'
      );
    }).join('');

    return (
      header +
      stats +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:4px">' +
      cards +
      '</div>'
    );
  }

  // ── Task routing ─────────────────────────────────────────────────────────────
  // Each task hands off to an existing feature so there is no duplicated logic:
  //   PO / DO   → the erp-view.js create handlers (showAddPO / showAddDO), reached
  //               by navigating to the host view then firing its create action.
  //   Timbangan → _pipelineExtras.openReconciliation (weighbridge + reconcile).
  //   Biaya     → _bankExtras.openOtherPayment (posts an otherPayments document).
  function _fireAction(name) {
    // erp-view.js dispatches create actions (addPO / addDO) from a single
    // document-level delegated click handler keyed on data-action. Emulate that
    // click with a synthetic element so the existing handler runs unchanged —
    // no duplicated create logic here.
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
  function openBiayaOperasional() {
    var ex = window._bankExtras;
    if (ex && typeof ex.openOtherPayment === 'function') {
      ex.openOtherPayment();
    } else {
      toast('Modul pengeluaran belum siap', 'warning');
    }
  }

  function open() {
    nav('entriHarian');
  }

  // ── Event delegation for the task cards ──────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    switch (btn.getAttribute('data-action')) {
      case 'ehPO':
        openPO();
        break;
      case 'ehDO':
        openSuratJalan();
        break;
      case 'ehTimbangan':
        openTimbangan();
        break;
      case 'ehBiaya':
        openBiayaOperasional();
        break;
    }
  });

  // ── Expose ───────────────────────────────────────────────────────────────────
  window.renderEntriHarian = renderEntriHarian;
  window._entriHarian = {
    open: open,
    openPO: openPO,
    openSuratJalan: openSuratJalan,
    openTimbangan: openTimbangan,
    openBiayaOperasional: openBiayaOperasional,
    // The ordered task keys this surface exposes (for tests / gating).
    tasks: TASKS.map(function (t) {
      return t.key;
    }),
  };

  console.log('[EntriHarian] Daily data-entry surface ready');
})();
