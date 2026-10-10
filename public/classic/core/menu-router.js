// ══════════════════════════════════════════════════════════════════════════════
//  MENU ROUTER  (window.NSAMenu)
//  ----------------------------------------------------------------------------
//  Maps sidebar entries (ui/nav.js MENU_CONFIG, keyed by label) to the feature
//  openers exposed by the *-extras and view modules. Entries without a route
//  simply open their view.
//
//  ROUTES: label → [ <window global holding the opener>, <method>, ...args ]
//  The openers handle their own navigation, so the router only invokes them.
//  Openers that live in a lazily-loaded view chunk (lazy-views.js) are invoked
//  once the chunk has loaded.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var ROUTES = {
    // ── Penjualan ────────────────────────────────────────────────────────────
    'Penawaran Penjualan': ['_quotationExtras', 'openSalesQuotation'],
    'Faktur Penjualan': ['_invoiceExtras', 'openSalesInvoice'],
    'Penerimaan Pembayaran': ['_invoiceExtras', 'openSalesReceipt'],
    'Uang Muka Penjualan': ['_salesPurchaseExtras', 'openSalesDP'],
    'Retur Penjualan': ['_returnExtras', 'openSalesReturn'],
    'Target Penjualan': ['_salesPurchaseExtras', 'openSalesTarget'],
    Pelanggan: ['_masterExtras', 'openCustomers'],

    // ── Pembelian ────────────────────────────────────────────────────────────
    'Penawaran Pembelian': ['_quotationExtras', 'openPurchaseQuotation'],
    'Penerimaan Barang': ['_salesPurchaseExtras', 'openReceiveItem'],
    'Rekonsiliasi Timbangan': ['_pipelineExtras', 'openReconciliation'],
    'Validasi SJ Supplier': ['SJValidation', 'openValidation'],
    'Faktur Pembelian': ['_invoiceExtras', 'openPurchaseInvoice'],
    'Pembayaran ke Supplier': ['_invoiceExtras', 'openPurchasePayment'],
    'Uang Muka Pembelian': ['_salesPurchaseExtras', 'openPurchaseDP'],
    'Retur Pembelian': ['_returnExtras', 'openPurchaseReturn'],
    'Harga Supplier': ['_salesPurchaseExtras', 'openSupplierPrice'],
    Supplier: ['_masterExtras', 'openSuppliers'],

    // ── Persediaan ───────────────────────────────────────────────────────────
    Gudang: ['_warehouseExtras', 'openTab', 'warehouses'],
    'Transfer Antar Gudang': ['_warehouseExtras', 'openTab', 'transfers'],
    'Permintaan Barang': ['_inventoryExtras', 'openItemRequisition'],
    'Job Costing': ['_inventoryExtras', 'openJobCosting'],

    // ── Kas & Bank ───────────────────────────────────────────────────────────
    'Pengeluaran Lain': ['_bankExtras', 'openOtherPayment'],
    'Penerimaan Lain': ['_bankExtras', 'openOtherDeposit'],
    'Transfer Antar Rekening': ['_bankExtras', 'openBankTransfer'],
    'Rekening Koran': ['_bankExtras', 'openBankStatement'],
    'Riwayat Kas & Bank': ['_bankExtras', 'openBankHistory'],
    'Rekonsiliasi Bank': ['_bankExtras', 'openBankReconcile'],

    // ── Akuntansi ────────────────────────────────────────────────────────────
    'Neraca Saldo': ['_ledgerExtras', 'openTab', 'trial'],
    Jurnal: ['_ledgerExtras', 'openTab', 'journals', 'all'],
    'Jurnal Umum': ['_ledgerExtras', 'openTab', 'journals', 'manual'],
    'Bagan Akun': ['_ledgerExtras', 'openTab', 'chart'],
    'Riwayat Akun': ['_budgetGLExtras', 'openAccountHistory'],
    'Audit Jurnal': ['_budgetGLExtras', 'openAuditJournal'],
    'Biaya Akrual': ['_budgetGLExtras', 'openExpenseAccrual'],
    Penggajian: ['_budgetGLExtras', 'openPayroll'],
    Anggaran: ['_budgetGLExtras', 'openBudget'],
    'Realisasi Anggaran': ['_budgetGLExtras', 'openBudgetMonitor'],
    'Transfer Anggaran': ['_budgetGLExtras', 'openBudgetTransfer'],
    'Ekspor Coretax': ['_taxExtras', 'openEFakturCTAS'],

    // ── Aset Tetap ───────────────────────────────────────────────────────────
    'Kategori Aset': ['_assetExtras', 'openAssetCategory'],
    'Golongan Aset Fiskal': ['_assetExtras', 'openFiscalCategory'],
    'Riwayat Perubahan Aset': ['_assetExtras', 'openAssetEdited'],
    'Mutasi Aset': ['_assetExtras', 'openAssetTransfer'],
    'Pelepasan Aset': ['_assetExtras', 'openFADisposition'],
    'Aset per Lokasi': ['_assetExtras', 'openAssetPerLocation'],

    // ── Laporan ──────────────────────────────────────────────────────────────
    'Daftar Laporan': ['_reportExtras', 'openReportList'],
    'Laba Rugi': ['_financialExtras', 'openPL'],
    Neraca: ['_financialExtras', 'openBS'],
    'Arus Kas': ['_financialExtras', 'openCF'],
    'Rekap PPN': ['_reportExtras', 'openSPTPPN'],

    // ── Data Master ──────────────────────────────────────────────────────────
    Karyawan: ['_masterExtras', 'openEmployee'],
    Kontak: ['_masterExtras', 'openContact'],
    'Kategori Pelanggan': ['_masterExtras', 'openCustomerCategory'],
    'Kategori Supplier': ['_masterExtras', 'openSupplierCategory'],
    'Kategori Penjualan': ['_settingsExtras', 'openSalesCategory'],
    'Satuan Barang': ['_inventoryExtras', 'openItemUnit'],
    'Kategori Barang': ['_inventoryExtras', 'openItemCategory'],
    'Merek Barang': ['_inventoryExtras', 'openItemBrand'],

    // ── Pengaturan ───────────────────────────────────────────────────────────
    'Profil Perusahaan': ['_companyProfile', 'open'],
    'Termin Pembayaran': ['_settingsExtras', 'openPaymentTerm'],
    'Metode Pengiriman': ['_settingsExtras', 'openShipment'],
    Kalender: ['_settingsExtras', 'openCalendar'],
    'Transaksi Favorit': ['_settingsExtras', 'openFavTransaction'],
    'Log Aktivitas': ['_settingsExtras', 'openActivityLog'],
    'Recycle Bin': ['_trashExtras', 'openRecycleBin'],

    // ── Not in the sidebar (docs/02-PETA-MODUL-DAN-NAVIGASI.md §2) ────────────
    'Mata Uang': ['_settingsExtras', 'openCurrency'],
    'SmartLink e-Banking': ['_bankExtras', 'openSmartLink'],
    'Kirim Faktur Pajak via Email': ['_taxExtras', 'openTaxInvoiceEmail'],
    'e-Faktur Format Lama': ['_taxExtras', 'openEFakturLegacy'],
    'Analisis Bisnis': ['_reportExtras', 'openAIAnalysis'],
    'Laporan per Periode': ['_funnelReport', 'openCustomRange'],
    'Entri Harian': ['_entriHarian', 'open'],

    // ── Pengambilan (trading pickups) ───────────────────────────────────────
    'PO Pengambilan': ['_pickupView', 'openOrders'],
    'Catat Pengambilan': ['_pickupView', 'openRecord'],
    'Impor Rekap Timbangan': ['_pickupView', 'openRecapImport'],
    'Kotak Masuk Rekap': ['_recapInbox', 'open'],
    'Perubahan Timbangan': ['_pickupView', 'openWeightChanges'],
    'Rekap Pengambilan': ['_pickupView', 'openTripRecap'],
    'Tagih Pelanggan': ['_pickupBilling', 'openCustomerBilling'],
    'Tagihan Supplier': ['_pickupBilling', 'openSupplierBilling'],
  };

  // Opener globals defined inside a lazily-loaded view chunk → that view id.
  var LAZY_GLOBALS = {
    _ledgerExtras: 'ledger',
    _financialExtras: 'financials',
    _quotationExtras: 'quotations',
    _returnExtras: 'returns',
    _warehouseExtras: 'warehouse',
    _invoiceExtras: 'invoices',
  };

  // → 'missing' when the opener isn't defined (yet), otherwise whether it ran.
  function invoke(label, route) {
    var target = window[route[0]];
    var fn = target && target[route[1]];
    if (typeof fn !== 'function') {
      return 'missing';
    }
    try {
      fn.apply(target, route.slice(2));
      return true;
    } catch (e) {
      console.error('[NSAMenu] error opening "' + label + '":', e);
      return false;
    }
  }

  // handle(viewId, label) → true when the entry was handled, false to let nav.js
  // fall back to a plain navigate(viewId).
  function handle(viewId, label) {
    var route = ROUTES[label];
    if (!route) {
      return false;
    }
    var result = invoke(label, route);
    if (result !== 'missing') {
      return result;
    }

    var lazyView = LAZY_GLOBALS[route[0]];
    if (lazyView && typeof window.ensureView === 'function') {
      // Show the view's loading state, then open the entry once the chunk is in.
      // Both callbacks settle in the same microtask run, so the view's default
      // screen is never painted in between.
      if (typeof window.navigate === 'function') {
        window.navigate(lazyView);
      }
      window
        .ensureView(lazyView)
        .then(function () {
          if (invoke(label, route) === 'missing') {
            console.warn('[NSAMenu] opener missing for "' + label + '"');
          }
        })
        .catch(function (err) {
          console.error('[NSAMenu] could not load "' + label + '":', err);
        });
      return true;
    }

    console.warn('[NSAMenu] opener not ready for "' + label + '" (' + route[0] + '.' + route[1] + ')');
    return false;
  }

  window.NSAMenu = { handle: handle, routes: ROUTES };
})();
