// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Pengambilan pages  (pickup-view.js)
//
// Screens for the trading pickup flow over window.Trading (trading.js):
//   openOrders        PO Pengambilan — pickup POs with quota/cut-off progress and
//                     their surat jalan; open a confirmed PO for pickup
//   openRecord        Catat Pengambilan — record a truck (phone-friendly)
//   openRecapImport   Impor Rekap Timbangan — Excel from the weighbridge
//   openWeightChanges Perubahan Timbangan — weight changes and open alerts
//   openTripRecap     Rekap Pengambilan — trips per period, export to Excel
//
// Renders into #view-pickups. Global-scope rule: classic <script>, IIFE-wrapped;
// exposes window.renderPickups and window._pickupView.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }

  var _page = 'orders';

  function header(title, sub) {
    return typeof window.secHdr === 'function'
      ? window.secHdr(title, sub)
      : '<div class="sec-hdr"><div><h1>' + esc(title) + '</h1><p>' + esc(sub) + '</p></div></div>';
  }

  var PAGES = {
    orders: ['PO Pengambilan', 'PO supplier yang diambil bertahap oleh truk pelanggan'],
    record: ['Catat Pengambilan', 'Catat truk yang mengambil barang dan hasil timbangannya'],
    recap: ['Impor Rekap Timbangan', 'Rekap Excel dari bagian timbangan supplier'],
    changes: ['Perubahan Timbangan', 'Berat yang berubah setelah dicatat'],
    tripRecap: ['Rekap Pengambilan', 'Semua pengambilan per periode'],
  };

  function renderPickups() {
    var p = PAGES[_page] || PAGES.orders;
    return (
      header(p[0], p[1]) +
      '<div class="card"><div class="empty-inline">Halaman sedang disiapkan.</div></div>'
    );
  }

  function show(page) {
    _page = page;
    if (typeof window.invalidateView === 'function') window.invalidateView('pickups');
    if (typeof window.navigate === 'function') window.navigate('pickups');
  }

  window.renderPickups = renderPickups;
  window._pickupView = {
    openOrders: function () {
      show('orders');
    },
    openRecord: function () {
      show('record');
    },
    openRecapImport: function () {
      show('recap');
    },
    openWeightChanges: function () {
      show('changes');
    },
    openTripRecap: function () {
      show('tripRecap');
    },
  };
})();
