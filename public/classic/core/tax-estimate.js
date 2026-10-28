// ══════════════════════════════════════════════════════════════════════════════
//  TAX ESTIMATE  — E18 "Laporan Perkiraan Pajak"
//
//  A MONTHLY estimate of three taxes, read straight from the GL journals:
//    • PPN masa   = PPN Keluaran (210201) − PPN Masukan (130101) for the month
//    • PPh 21     = effective rate × (Beban Gaji 610301 + Beban Tunjangan 610302)
//    • PPh 25     = PPh-25 rate × monthly net profit (Revenue − COGS − Expenses)
//
//  The figures are ESTIMATES ONLY — the official calculation is done by the
//  company's tax preparer (plan E18: "Angka bersifat perkiraan saja"). The two
//  PPh figures use assumption rates the user can set in Pengaturan Pajak
//  (settings.tax.pph21Rate / settings.tax.pph25Rate); sane defaults are used
//  when unset, and the report states plainly that they are assumptions.
//
//  On-screen report + Excel export (NSAXlsx). No custom print format, per E18.
//  IIFE-wrapped classic <script>; exposes ONLY window._taxEstimate.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(Math.round(v || 0)) : 'Rp ' + Math.round(v || 0);
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // Account numbers (gl.js chart of accounts).
  var ACC = {
    ppnOut: '210201', // Hutang PPN (PPN Keluaran)
    ppnIn: '130101', // PPN Masukan
    salary: '610301', // Beban Gaji
    allowance: '610302', // Beban Tunjangan
    revenue: ['400001'], // Penjualan
    salesDiscount: '400004', // Diskon Penjualan (contra-revenue)
    cogs: '510101', // Beban Pokok Penjualan
  };

  // Default ASSUMPTION rates for the two PPh estimates (fractions). Overridable
  // via settings.tax.pph21Rate / pph25Rate. These are deliberately simple flat
  // rates for a rough estimate — the real figures come from the tax preparer.
  var DEFAULT_PPH21_RATE = 0.05; // ~5% effective of gross payroll (rough)
  var DEFAULT_PPH25_RATE = 0.0125; // 1.25% of revenue proxy / monthly instalment

  var MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  function periodLabel(p) {
    return MONTHS[Number(p.slice(5, 7)) - 1] + ' ' + p.slice(0, 4);
  }
  function monthFile(p) {
    return p.replace('-', '');
  }

  function taxCfg() {
    var t = (db().settings && db().settings.tax) || {};
    return {
      pph21Rate: typeof t.pph21Rate === 'number' ? t.pph21Rate : DEFAULT_PPH21_RATE,
      pph25Rate: typeof t.pph25Rate === 'number' ? t.pph25Rate : DEFAULT_PPH25_RATE,
      pph21IsDefault: typeof t.pph21Rate !== 'number',
      pph25IsDefault: typeof t.pph25Rate !== 'number',
    };
  }

  // Every month that appears in the journals, newest first; always includes the
  // current month so a fresh install still has a period to show.
  function periods() {
    var set = {};
    set[today().slice(0, 7)] = true;
    (db().journals || []).forEach(function (j) {
      if (j && j.date) set[String(j.date).slice(0, 7)] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  // Sum (debit − credit) for a set of account numbers over one month (YYYY-MM).
  function netForAccounts(period, accNos) {
    var want = {};
    (Array.isArray(accNos) ? accNos : [accNos]).forEach(function (n) {
      want[n] = true;
    });
    var net = 0;
    (db().journals || []).forEach(function (j) {
      if (!j || String(j.date || '').slice(0, 7) !== period) return;
      (j.lines || []).forEach(function (l) {
        if (!want[l.accountNo]) return;
        net += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      });
    });
    return net;
  }

  // The estimate for one month. All figures are rounded rupiah.
  function estimate(period) {
    var cfg = taxCfg();

    // PPN: a liability (210201) sits on the credit side, an asset (130101) on the
    // debit side. masa = keluaran − masukan; if masukan > keluaran it is a
    // carry-forward (lebih bayar), shown as a negative "kurang bayar".
    var ppnKeluaran = -netForAccounts(period, ACC.ppnOut); // credit-normal → flip sign
    var ppnMasukan = netForAccounts(period, ACC.ppnIn); // debit-normal
    var ppnMasa = Math.round(ppnKeluaran - ppnMasukan);

    // PPh 21: effective rate × gross payroll (salary + allowances), both expenses.
    var payroll = netForAccounts(period, ACC.salary) + netForAccounts(period, ACC.allowance);
    var pph21 = Math.round(Math.max(0, payroll) * cfg.pph21Rate);

    // PPh 25: monthly instalment estimate. Net profit = revenue − sales discount
    // − COGS − operating expenses (all 61xxxx expense accounts). Revenue is
    // credit-normal; COGS/expense debit-normal.
    var revenue = -netForAccounts(period, ACC.revenue); // credit-normal → flip
    var salesDiscount = netForAccounts(period, ACC.salesDiscount); // contra-revenue (debit)
    var cogs = netForAccounts(period, ACC.cogs);
    // All operating-expense accounts (610xxx) for the month.
    var expenses = 0;
    (db().journals || []).forEach(function (j) {
      if (!j || String(j.date || '').slice(0, 7) !== period) return;
      (j.lines || []).forEach(function (l) {
        if (/^61\d{4}$/.test(String(l.accountNo || ''))) {
          expenses += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        }
      });
    });
    var netProfit = Math.round(revenue - salesDiscount - cogs - expenses);
    var pph25 = Math.round(Math.max(0, netProfit) * cfg.pph25Rate);

    return {
      period: period,
      ppnKeluaran: Math.round(ppnKeluaran),
      ppnMasukan: Math.round(ppnMasukan),
      ppnMasa: ppnMasa,
      payroll: Math.round(payroll),
      pph21Rate: cfg.pph21Rate,
      pph21: pph21,
      revenue: Math.round(revenue - salesDiscount),
      cogs: Math.round(cogs),
      expenses: Math.round(expenses),
      netProfit: netProfit,
      pph25Rate: cfg.pph25Rate,
      pph25: pph25,
      totalEstimate: Math.max(0, ppnMasa) + pph21 + pph25,
      pph21IsDefault: cfg.pph21IsDefault,
      pph25IsDefault: cfg.pph25IsDefault,
    };
  }

  // ── On-screen report ──────────────────────────────────────────────────────
  var _period = null;

  function injectView(html) {
    window.invalidateView && window.invalidateView('tax');
    window.navigate && window.navigate('tax');
    setTimeout(function () {
      var el = document.getElementById('view-tax');
      if (el) el.innerHTML = html;
    }, 0);
  }

  function statCard(label, value, sub) {
    return (
      '<div class="card stat-card"><div class="stat-label">' +
      esc(label) +
      '</div><div class="stat-val">' +
      esc(value) +
      '</div>' +
      (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '') +
      '</div>'
    );
  }

  function row(label, value, opts) {
    opts = opts || {};
    return (
      '<tr' +
      (opts.strong ? ' style="font-weight:bold"' : '') +
      '><td class="td-p">' +
      esc(label) +
      '</td><td class="td-p" style="text-align:right">' +
      esc(value) +
      '</td></tr>'
    );
  }

  function open() {
    var ps = periods();
    var period = _period && ps.indexOf(_period) !== -1 ? _period : ps[0];
    var e = estimate(period);

    var pOpts = ps
      .map(function (p) {
        return (
          '<option value="' + esc(p) + '"' + (p === period ? ' selected' : '') + '>' +
          esc(periodLabel(p)) + '</option>'
        );
      })
      .join('');

    var pctLabel = function (r, isDefault) {
      return (r * 100).toFixed(2).replace(/\.?0+$/, '') + '%' + (isDefault ? ' (asumsi default)' : '');
    };

    var html =
      '<div class="sec-hdr"><div><h1>Laporan Perkiraan Pajak</h1>' +
      '<p>Perkiraan PPN masa, PPh 21 dan PPh 25 per bulan.</p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<select class="form-select" id="te-period" aria-label="Masa pajak" style="width:auto">' +
      pOpts +
      '</select>' +
      '<button class="btn-ghost" data-action="teExportExcel">Ekspor Excel</button></div></div>' +

      '<div class="notice notice-warning"><div><strong>Perhatian — angka perkiraan.</strong> ' +
      'Laporan ini hanya perkiraan untuk perencanaan. Perhitungan pajak resmi dilakukan oleh ' +
      'petugas/konsultan pajak. Tarif PPh 21 dan PPh 25 di bawah adalah asumsi yang dapat diubah ' +
      'di Pengaturan Pajak.</div></div>' +

      '<div class="stat-row">' +
      statCard('PPN Masa', money(Math.max(0, e.ppnMasa)), periodLabel(period)) +
      statCard('PPh 21 (perkiraan)', money(e.pph21), 'Tarif ' + pctLabel(e.pph21Rate, e.pph21IsDefault)) +
      statCard('PPh 25 (perkiraan)', money(e.pph25), 'Tarif ' + pctLabel(e.pph25Rate, e.pph25IsDefault)) +
      statCard('Total Perkiraan', money(e.totalEstimate), 'PPN + PPh 21 + PPh 25') +
      '</div>' +

      // PPN detail
      '<div class="card"><div class="card-head"><div class="card-title">PPN Masa — ' +
      esc(periodLabel(period)) + '</div></div>' +
      '<div style="overflow-x:auto"><table class="data-table" style="width:100%"><tbody>' +
      row('PPN Keluaran (dari penjualan)', money(e.ppnKeluaran)) +
      row('PPN Masukan (dari pembelian)', money(e.ppnMasukan)) +
      row(e.ppnMasa >= 0 ? 'PPN kurang bayar (disetor)' : 'PPN lebih bayar (dikompensasi)',
          money(Math.abs(e.ppnMasa)), { strong: true }) +
      '</tbody></table></div></div>' +

      // PPh 21 detail
      '<div class="card"><div class="card-head"><div class="card-title">PPh 21 — perkiraan atas gaji</div></div>' +
      '<div style="overflow-x:auto"><table class="data-table" style="width:100%"><tbody>' +
      row('Dasar: Beban Gaji + Tunjangan', money(e.payroll)) +
      row('Tarif perkiraan', pctLabel(e.pph21Rate, e.pph21IsDefault)) +
      row('Perkiraan PPh 21', money(e.pph21), { strong: true }) +
      '</tbody></table></div></div>' +

      // PPh 25 detail
      '<div class="card"><div class="card-head"><div class="card-title">PPh 25 — perkiraan angsuran</div></div>' +
      '<div style="overflow-x:auto"><table class="data-table" style="width:100%"><tbody>' +
      row('Pendapatan (neto diskon)', money(e.revenue)) +
      row('Beban Pokok Penjualan', money(e.cogs)) +
      row('Beban Operasional', money(e.expenses)) +
      row('Perkiraan Laba Bersih', money(e.netProfit)) +
      row('Tarif perkiraan', pctLabel(e.pph25Rate, e.pph25IsDefault)) +
      row('Perkiraan PPh 25', money(e.pph25), { strong: true }) +
      '</tbody></table></div></div>' +

      '<details class="tax-explain"><summary>Penjelasan perhitungan</summary><p>' +
      'PPN masa = PPN Keluaran − PPN Masukan dari jurnal bulan tersebut. ' +
      'PPh 21 = tarif asumsi × (Beban Gaji + Beban Tunjangan). ' +
      'PPh 25 = tarif asumsi × perkiraan laba bersih (Pendapatan − HPP − Beban Operasional). ' +
      'Ubah tarif asumsi PPh 21/25 di Pengaturan Pajak. Semua angka adalah perkiraan.' +
      '</p></details>';

    injectView(html);
  }

  // ── Excel export ────────────────────────────────────────────────────────────
  function exportExcel() {
    var ps = periods();
    var period = _period && ps.indexOf(_period) !== -1 ? _period : ps[0];
    var e = estimate(period);
    if (!window.NSAXlsx || typeof window.NSAXlsx.download !== 'function') {
      toast('Modul ekspor Excel belum siap', 'warning');
      return;
    }
    var columns = [
      { header: 'Keterangan', width: 42, type: 'text' },
      { header: 'Nilai (Rp)', width: 20, type: 'currency' },
    ];
    var pct = function (r) {
      return (r * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
    };
    var rows = [
      ['LAPORAN PERKIRAAN PAJAK — ' + periodLabel(period), ''],
      ['(angka perkiraan; perhitungan resmi oleh petugas pajak)', ''],
      ['', ''],
      ['PPN MASA', ''],
      ['PPN Keluaran', e.ppnKeluaran],
      ['PPN Masukan', e.ppnMasukan],
      [e.ppnMasa >= 0 ? 'PPN kurang bayar' : 'PPN lebih bayar', Math.abs(e.ppnMasa)],
      ['', ''],
      ['PPh 21 (perkiraan, tarif ' + pct(e.pph21Rate) + ')', ''],
      ['Dasar: Beban Gaji + Tunjangan', e.payroll],
      ['Perkiraan PPh 21', e.pph21],
      ['', ''],
      ['PPh 25 (perkiraan, tarif ' + pct(e.pph25Rate) + ')', ''],
      ['Pendapatan (neto diskon)', e.revenue],
      ['Beban Pokok Penjualan', e.cogs],
      ['Beban Operasional', e.expenses],
      ['Perkiraan Laba Bersih', e.netProfit],
      ['Perkiraan PPh 25', e.pph25],
      ['', ''],
      ['TOTAL PERKIRAAN PAJAK', e.totalEstimate],
    ];
    window.NSAXlsx.download('perkiraan_pajak_' + monthFile(period) + '.xlsx', [
      { name: 'Perkiraan Pajak', columns: columns, rows: rows },
    ]);
    toast('Laporan perkiraan pajak diekspor', 'success');
  }

  // ── Events ────────────────────────────────────────────────────────────────
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'te-period') {
      _period = ev.target.value;
      open();
    }
  });

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'teExportExcel') exportExcel();
  });

  window._taxEstimate = {
    open: open,
    estimate: estimate,
    periods: periods,
  };
  console.log('[TaxEstimate] E18 tax estimate ready');
})();
