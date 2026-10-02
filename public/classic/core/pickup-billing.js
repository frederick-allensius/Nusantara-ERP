// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Billing from pickups  (pickup-billing.js)
//
// Invoices made from trading trips (window.Trading, trading.js):
//   openCustomerBilling  Tagih Pelanggan — a customer's trips in a period
//                        (weekly, typically) become one sales invoice
//   openSupplierBilling  Tagihan Supplier — record the supplier's bill against our
//                        trips: tonnage and price compared before it is saved
//
// Renders into #view-pickups (shared with pickup-view.js). Global-scope rule:
// classic <script>, IIFE-wrapped; exposes window._pickupBilling.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }

  function inject(title, sub) {
    if (typeof window.invalidateView === 'function') window.invalidateView('pickups');
    if (typeof window.navigate === 'function') window.navigate('pickups');
    var el = document.getElementById('view-pickups');
    if (!el) return;
    var hdr =
      typeof window.secHdr === 'function'
        ? window.secHdr(title, sub)
        : '<div class="sec-hdr"><div><h1>' +
          esc(title) +
          '</h1><p>' +
          esc(sub) +
          '</p></div></div>';
    el.innerHTML =
      hdr + '<div class="card"><div class="empty-inline">Halaman sedang disiapkan.</div></div>';
  }

  window._pickupBilling = {
    openCustomerBilling: function () {
      inject('Tagih Pelanggan', 'Faktur dari pengambilan pelanggan per periode');
    },
    openSupplierBilling: function () {
      inject('Tagihan Supplier', 'Catat tagihan supplier dan cocokkan dengan pengambilan');
    },
  };
})();
