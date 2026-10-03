// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Excel archive  (archive-export.js)
//
// One .xlsx with the main records of a year (or all years), readable without the
// app: for the year-end archive on an external disk and for people without app
// access (accountant, tax office). The JSON backup (Kelola Backup → Export ke
// File) stays the file to restore from; this workbook is for reading.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.NSAArchive.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function num(v) {
    return Number(v) || 0;
  }
  function inYear(d, year) {
    return !year || String((d && d.date) || '').slice(0, 4) === String(year);
  }
  function list(coll, year, dated) {
    return (db()[coll] || []).filter(function (d) {
      return d && (!dated || inYear(d, year));
    });
  }
  function sortByDate(rows) {
    return rows.slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
  }
  function statusLabel(type, s) {
    return window.DocEngine && typeof window.DocEngine.statusLabel === 'function'
      ? window.DocEngine.statusLabel(type, s)
      : s || '';
  }

  var T = { header: 'Tanggal', width: 12 };
  var NO = { header: 'Nomor', width: 22 };
  var MONEY = function (h) {
    return { header: h, width: 16, type: 'currency' };
  };

  function docSheet(name, type, coll, partyField, year) {
    return {
      name: name,
      columns: [
        T,
        NO,
        { header: partyField === 'customer' ? 'Pelanggan' : 'Supplier', width: 28 },
        { header: 'Status', width: 14 },
        MONEY('DPP'),
        MONEY('PPN'),
        MONEY('Total'),
        { header: 'Keterangan', width: 30 },
      ],
      // amount is the document total including PPN, so DPP = amount − tax.
      rows: sortByDate(list(coll, year, true)).map(function (d) {
        return [
          d.date || '',
          d.number || d.id,
          d[partyField] || '',
          statusLabel(type, d.status),
          num(d.amount) - num(d.tax),
          num(d.tax),
          num(d.amount),
          d.note || d.notes || '',
        ];
      }),
    };
  }

  function sheets(year) {
    var out = [];
    out.push({
      name: 'Pelanggan',
      columns: [
        { header: 'Kode', width: 10 },
        { header: 'Nama', width: 30 },
        { header: 'NPWP', width: 22 },
        { header: 'Alamat', width: 36 },
        { header: 'Telepon', width: 16 },
        { header: 'Email', width: 26 },
        { header: 'Termin (hari)', width: 12, type: 'int' },
      ],
      rows: (db().customers || []).map(function (c) {
        return [
          c.id,
          c.name,
          c.npwp || '',
          c.address || '',
          c.phone || '',
          c.email || '',
          num(c.termDays),
        ];
      }),
    });
    out.push({
      name: 'Supplier',
      columns: [
        { header: 'Kode', width: 10 },
        { header: 'Nama', width: 30 },
        { header: 'NPWP', width: 22 },
        { header: 'Alamat', width: 36 },
        { header: 'Telepon', width: 16 },
        { header: 'Termin (hari)', width: 12, type: 'int' },
      ],
      rows: (db().suppliers || []).map(function (s) {
        return [s.id, s.name, s.npwp || '', s.address || '', s.phone || '', num(s.termDays)];
      }),
    });
    out.push({
      name: 'Barang',
      columns: [
        { header: 'Kode', width: 12 },
        { header: 'Nama', width: 30 },
        { header: 'Kategori', width: 16 },
        { header: 'Satuan', width: 10 },
        { header: 'Stok', width: 10 },
        MONEY('Harga Beli'),
        MONEY('Harga Jual'),
      ],
      rows: (db().inventoryItems || []).map(function (i) {
        return [
          i.code || i.id,
          i.name,
          i.category || '',
          i.unit || '',
          num(i.stock),
          num(i.cost),
          num(i.sell),
        ];
      }),
    });
    out.push(docSheet('Pesanan Penjualan', 'SO', 'salesOrders', 'customer', year));
    out.push(docSheet('Pesanan Pembelian', 'PO', 'purchaseOrders', 'supplier', year));
    var trips = sortByDate(
      (db().deliveryOrders || []).filter(function (d) {
        return (
          d &&
          d.pickup === true &&
          d.status !== 'Pending' &&
          d.status !== 'Cancelled' &&
          inYear(d, year)
        );
      })
    );
    if (window.Trading && typeof window.Trading.tripRecapSheet === 'function') {
      out.push(window.Trading.tripRecapSheet(trips));
    }
    out.push(docSheet('Faktur Penjualan', 'SI', 'salesInvoices', 'customer', year));
    out.push(docSheet('Faktur Pembelian', 'PI', 'purchaseInvoices', 'supplier', year));
    function invoiceNo(invColl, r) {
      if (r.invoiceNumber) return r.invoiceNumber;
      var inv = (db()[invColl] || []).find(function (i) {
        return i && String(i.id) === String(r.invoiceId);
      });
      return (inv && inv.number) || r.invoiceId || '';
    }
    function settlementSheet(name, coll, partyField, invColl) {
      return {
        name: name,
        columns: [
          T,
          NO,
          { header: partyField === 'customer' ? 'Pelanggan' : 'Supplier', width: 28 },
          { header: 'Faktur', width: 22 },
          { header: 'Metode', width: 16 },
          { header: 'Status', width: 12 },
          MONEY('Jumlah'),
        ],
        rows: sortByDate(list(coll, year, true)).map(function (r) {
          return [
            r.date || '',
            r.number || r.id,
            r[partyField] || '',
            invoiceNo(invColl, r),
            r.paymentMethod || '',
            r.status || '',
            num(r.amount),
          ];
        }),
      };
    }
    out.push(
      settlementSheet('Penerimaan Pembayaran', 'salesReceipts', 'customer', 'salesInvoices')
    );
    out.push(
      settlementSheet('Pembayaran Supplier', 'purchasePayments', 'supplier', 'purchaseInvoices')
    );
    function cashSheet(name, coll, partyField) {
      return {
        name: name,
        columns: [
          T,
          NO,
          { header: partyField === 'payee' ? 'Penerima' : 'Pembayar', width: 28 },
          { header: 'Kategori', width: 18 },
          { header: 'Akun', width: 10 },
          { header: 'Metode', width: 14 },
          { header: 'Keterangan', width: 30 },
          MONEY('Jumlah'),
        ],
        rows: sortByDate(list(coll, year, true)).map(function (r) {
          return [
            r.date || '',
            r.number || r.id,
            r[partyField] || '',
            r.category || '',
            r.accountNo || '',
            r.method || '',
            r.notes || r.reference || '',
            num(r.amount),
          ];
        }),
      };
    }
    out.push(cashSheet('Pengeluaran Lain', 'otherPayments', 'payee'));
    out.push(cashSheet('Penerimaan Lain', 'otherDeposits', 'payer'));
    var jrows = [];
    sortByDate(list('journals', year, true)).forEach(function (j) {
      (j.lines || []).forEach(function (l) {
        jrows.push([
          j.date || '',
          j.number || j.id,
          l.accountNo,
          l.accountName || '',
          l.memo || '',
          num(l.debit),
          num(l.credit),
        ]);
      });
    });
    out.push({
      name: 'Jurnal',
      columns: [
        T,
        NO,
        { header: 'Akun', width: 10 },
        { header: 'Nama Akun', width: 28 },
        { header: 'Keterangan', width: 36 },
        MONEY('Debit'),
        MONEY('Kredit'),
      ],
      rows: jrows,
    });
    return out;
  }

  function years() {
    var set = {};
    [
      'salesOrders',
      'purchaseOrders',
      'salesInvoices',
      'purchaseInvoices',
      'journals',
      'otherPayments',
    ].forEach(function (c) {
      (db()[c] || []).forEach(function (d) {
        var y = String((d && d.date) || '').slice(0, 4);
        if (/^\d{4}$/.test(y)) set[y] = true;
      });
    });
    return Object.keys(set).sort().reverse();
  }

  function download(year) {
    if (!window.NSAXlsx) return false;
    window.NSAXlsx.download('arsip-nusantara-erp-' + (year || 'semua') + '.xlsx', sheets(year));
    return true;
  }

  window.NSAArchive = { sheets: sheets, years: years, download: download };
})();
