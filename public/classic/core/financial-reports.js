// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Financial Reports  (financial-reports.js)
// Phase 5: P/L (Laba Rugi), Balance Sheet (Neraca), Cash Flow (Arus Kas)
// over the General Ledger engine.
//
// Data source: GL.trialBalance() for P/L and Balance Sheet (account-type
// grouping); raw journals for Cash Flow (cash-account movement analysis).
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderFinancials (+ ERP action registrations).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'pl'; // 'pl' | 'bs' | 'cf'
  let periodFrom = '';
  let periodTo = '';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + v;
  }
  function db() {
    return window.DB || {};
  }
  function round(n) {
    return Math.round(Number(n) || 0);
  }

  // ── Account type classification ───────────────────────────────────────────
  const ASSET_TYPES = new Set([
    'CASH_BANK',
    'ACCOUNT_RECEIVABLE',
    'INVENTORY',
    'OTHER_CURRENT_ASSET',
    'FIXED_ASSET',
    'OTHER_ASSET',
  ]);
  const LIABILITY_TYPES = new Set([
    'ACCOUNT_PAYABLE',
    'OTHER_CURRENT_LIABILITY',
    'LONG_TERM_LIABILITY',
  ]);
  const EQUITY_TYPES = new Set(['EQUITY']);
  const REVENUE_TYPES = new Set(['REVENUE', 'OTHER_INCOME']);
  const EXPENSE_TYPES = new Set(['COGS', 'EXPENSE', 'OTHER_EXPENSE']);
  const CASH_TYPES = new Set(['CASH_BANK']);

  const TYPE_LABEL = {
    CASH_BANK: 'Kas & Bank',
    ACCOUNT_RECEIVABLE: 'Piutang Usaha',
    INVENTORY: 'Persediaan',
    OTHER_CURRENT_ASSET: 'Aset Lancar Lain',
    FIXED_ASSET: 'Aset Tetap',
    ACCUMULATED_DEPRECIATION: 'Akumulasi Penyusutan',
    OTHER_ASSET: 'Aset Lain',
    ACCOUNT_PAYABLE: 'Hutang Usaha',
    OTHER_CURRENT_LIABILITY: 'Kewajiban Lancar Lain',
    LONG_TERM_LIABILITY: 'Kewajiban Jangka Panjang',
    EQUITY: 'Ekuitas',
    REVENUE: 'Pendapatan',
    COGS: 'Harga Pokok Penjualan',
    EXPENSE: 'Beban Operasional',
    OTHER_EXPENSE: 'Beban Lain-lain',
    OTHER_INCOME: 'Pendapatan Lain-lain',
  };

  // ── Period-filtered trial balance ─────────────────────────────────────────
  // When a date range is set, recompute the trial balance from only the
  // journals within that range.
  // `cumulative` (balance sheet): every journal up to the end date, ignoring the
  // start date — a position report is always a running total. Without it
  // (income statement) only journals inside the range count.
  function filteredTrialBalance(cumulative) {
    if (!window.GL) {
      return { rows: [], totalDebit: 0, totalCredit: 0, balanced: true };
    }
    if ((cumulative || !periodFrom) && !periodTo) {
      return window.GL.trialBalance();
    }

    window.GL.ensureChart();
    const chart = db().accountsChart || [];
    const journals = db().journals || [];
    const fromMs = !cumulative && periodFrom ? Date.parse(periodFrom) : -Infinity;
    const toMs = periodTo ? Date.parse(periodTo) : Infinity;

    const sums = new Map();
    journals.forEach(function (j) {
      var jDate = Date.parse(j.date);
      if (jDate < fromMs || jDate > toMs) return;
      (j.lines || []).forEach(function (l) {
        var cur = sums.get(l.accountNo) || { debit: 0, credit: 0 };
        cur.debit += Number(l.debit) || 0;
        cur.credit += Number(l.credit) || 0;
        sums.set(l.accountNo, cur);
      });
    });

    var rows = [];
    var totalDebit = 0;
    var totalCredit = 0;
    var order = chart.map(function (a) {
      return a.no;
    });
    var seen = new Set(order);
    sums.forEach(function (_v, no) {
      if (!seen.has(no)) {
        order.push(no);
        seen.add(no);
      }
    });
    order.forEach(function (no) {
      var acc = chart.find(function (a) {
        return a.no === no;
      }) || { no: no, name: window.GL.accountName(no), type: 'UNKNOWN' };
      var s = sums.get(acc.no);
      if (!s) return;
      var net = s.debit - s.credit;
      var debit = round(net > 0 ? net : 0);
      var credit = round(net < 0 ? -net : 0);
      if (debit === 0 && credit === 0) return;
      rows.push({ no: acc.no, name: acc.name, type: acc.type, debit: debit, credit: credit });
      totalDebit += debit;
      totalCredit += credit;
    });
    return {
      rows: rows,
      totalDebit: totalDebit,
      totalCredit: totalCredit,
      balanced: totalDebit === totalCredit,
    };
  }

  // ── Signed balance for an account row ─────────────────────────────────────
  // Revenue/liability/equity accounts have a normal credit balance (positive
  // when credit > debit). Asset/expense accounts have a normal debit balance.
  function signedBalance(row) {
    if (
      REVENUE_TYPES.has(row.type) ||
      LIABILITY_TYPES.has(row.type) ||
      EQUITY_TYPES.has(row.type)
    ) {
      return row.credit - row.debit;
    }
    return row.debit - row.credit;
  }

  // ── Tab buttons ───────────────────────────────────────────────────────────
  function tabBtn(id, label) {
    var on = activeTab === id;
    return (
      '<button class="seg-tab' +
      (on ? ' active' : '') +
      '" role="tab" aria-selected="' +
      on +
      '" data-action="finTab" data-val="' +
      id +
      '">' +
      esc(label) +
      '</button>'
    );
  }

  // ── Period selector bar ───────────────────────────────────────────────────
  function periodBar() {
    var active = periodFrom || periodTo;
    return (
      '<div class="fin-period">' +
      '<label>Periode dari</label>' +
      '<input type="date" class="form-input"' +
      ' value="' +
      (periodFrom || '') +
      '" data-action="finPeriodFrom">' +
      '<label>s/d</label>' +
      '<input type="date" class="form-input"' +
      ' value="' +
      (periodTo || '') +
      '" data-action="finPeriodTo">' +
      (active ? '<button class="btn-ghost" data-action="finPeriodClear">× Hapus</button>' : '') +
      '</div>'
    );
  }

  // ── Statement typography (style.css .fin-…) ───────────────────────────────
  // Section headings medium weight, account lines regular, totals and subtotals
  // bold. Colour only carries meaning: a negative amount is red, and the bottom
  // line (Laba Bersih, kenaikan kas bersih) is green or red.
  function amountClass(value) {
    return value < 0 ? ' fin-neg' : '';
  }
  function bottomLineClass(value) {
    return value < 0 ? ' fin-neg' : ' fin-pos';
  }

  // ── Section renderer helper ───────────────────────────────────────────────
  function sectionBlock(title, rows) {
    var total = 0;
    var rowsHtml = '';
    rows.forEach(function (r) {
      var val = signedBalance(r);
      total += val;
      rowsHtml +=
        '<tr>' +
        '<td class="acct-no">' +
        esc(r.no) +
        '</td>' +
        '<td>' +
        esc(r.name) +
        '</td>' +
        '<td class="t-num' +
        amountClass(val) +
        '">' +
        money(val) +
        '</td>' +
        '</tr>';
    });
    if (rows.length === 0) {
      rowsHtml = '<tr><td colspan="3" class="fin-none">Tidak ada data</td></tr>';
    }
    return (
      '<div class="fin-sec">' +
      '<div class="fin-sec-head">' +
      esc(title) +
      '</div>' +
      '<table class="fin-lines">' +
      '<tbody>' +
      rowsHtml +
      '</tbody>' +
      '<tfoot><tr class="fin-total">' +
      '<td colspan="2">Total ' +
      esc(title) +
      '</td>' +
      '<td class="t-num' +
      amountClass(total) +
      '">' +
      money(total) +
      '</td>' +
      '</tr></tfoot>' +
      '</table>' +
      '</div>'
    );
  }

  // A subtotal bar (e.g. Gross Profit, Operating Income, Net Income). `level`
  // 'major' marks the bottom line; 'minor' an intermediate subtotal. An
  // optional margin % (over revenue) is shown when `base` is provided.
  function subtotalBar(label, value, level, base) {
    var marginHtml =
      typeof base === 'number' && base !== 0
        ? '<span class="fin-pct">' + ((value / base) * 100).toFixed(1) + '% dari pendapatan</span>'
        : '';
    var major = level === 'major';
    return (
      '<div class="fin-subtotal' +
      (major ? ' fin-major' : '') +
      '">' +
      '<span>' +
      esc(label) +
      marginHtml +
      '</span>' +
      '<span class="t-num' +
      (major ? bottomLineClass(value) : amountClass(value)) +
      '">' +
      money(value) +
      '</span></div>'
    );
  }

  // ── Profit & Loss (Laba Rugi) — full multi-step income statement ───────────
  function plTab() {
    var tb = filteredTrialBalance();
    var revenueRows = [];
    var cogsRows = [];
    var expenseRows = [];
    var taxRows = [];
    var otherIncomeRows = [];
    var otherExpenseRows = [];

    // Income-tax expense is shown on its own line in a standard P&L, so split it
    // out of operating expenses by account name (Beban Pajak Penghasilan / PPh).
    var isTaxAccount = function (r) {
      return /pajak penghasilan|\bpph\b|income tax/i.test(String(r.name || ''));
    };

    tb.rows.forEach(function (r) {
      switch (r.type) {
        case 'REVENUE':
          revenueRows.push(r);
          break;
        case 'COGS':
          cogsRows.push(r);
          break;
        case 'EXPENSE':
          (isTaxAccount(r) ? taxRows : expenseRows).push(r);
          break;
        case 'OTHER_INCOME':
          otherIncomeRows.push(r);
          break;
        case 'OTHER_EXPENSE':
          otherExpenseRows.push(r);
          break;
      }
    });

    var sum = function (rows) {
      return rows.reduce(function (s, r) {
        return s + signedBalance(r);
      }, 0);
    };

    var totalRevenue = sum(revenueRows);
    var totalCOGS = sum(cogsRows);
    var grossProfit = totalRevenue - totalCOGS;
    var totalExpense = sum(expenseRows);
    var operatingIncome = grossProfit - totalExpense;
    var totalOtherIncome = sum(otherIncomeRows);
    var totalOtherExpense = sum(otherExpenseRows);
    var incomeBeforeTax = operatingIncome + totalOtherIncome - totalOtherExpense;
    var totalTax = sum(taxRows);
    var netProfit = incomeBeforeTax - totalTax;


    // The tab names the statement; the card opens with the period it covers.
    return (
      '<div class="card fin-statement">' +
      '<div class="fin-meta">' +
      (periodFrom || periodTo
        ? 'Periode ' + esc(periodFrom || '…') + ' s/d ' + esc(periodTo || '…')
        : 'Seluruh periode') +
      '</div>' +
      sectionBlock('Pendapatan', revenueRows) +
      sectionBlock('Harga Pokok Penjualan (HPP)', cogsRows) +
      subtotalBar('Laba Kotor', grossProfit, 'minor', totalRevenue) +
      sectionBlock('Beban Operasional', expenseRows) +
      subtotalBar('Laba Usaha (Operasional)', operatingIncome, 'minor', totalRevenue) +
      (otherIncomeRows.length > 0 ? sectionBlock('Pendapatan Lain-lain', otherIncomeRows) : '') +
      (otherExpenseRows.length > 0 ? sectionBlock('Beban Lain-lain', otherExpenseRows) : '') +
      subtotalBar('Laba Sebelum Pajak', incomeBeforeTax, 'minor', totalRevenue) +
      sectionBlock('Beban Pajak Penghasilan', taxRows) +
      subtotalBar('Laba Bersih', netProfit, 'major', totalRevenue) +
      '</div>'
    );
  }

  // ── Balance Sheet (Neraca) ────────────────────────────────────────────────
  function bsTab() {
    var tb = filteredTrialBalance(true);

    var cashRows = [];
    var receivableRows = [];
    var inventoryRows = [];
    var otherCurrentAssetRows = [];
    var fixedAssetRows = [];
    var otherAssetRows = [];
    var payableRows = [];
    var otherCurrentLiabRows = [];
    var longTermLiabRows = [];
    var equityRows = [];

    tb.rows.forEach(function (r) {
      switch (r.type) {
        case 'CASH_BANK':
          cashRows.push(r);
          break;
        case 'ACCOUNT_RECEIVABLE':
          receivableRows.push(r);
          break;
        case 'INVENTORY':
          inventoryRows.push(r);
          break;
        case 'OTHER_CURRENT_ASSET':
          otherCurrentAssetRows.push(r);
          break;
        case 'FIXED_ASSET':
          fixedAssetRows.push(r);
          break;
        case 'OTHER_ASSET':
          otherAssetRows.push(r);
          break;
        case 'ACCOUNT_PAYABLE':
          payableRows.push(r);
          break;
        case 'OTHER_CURRENT_LIABILITY':
          otherCurrentLiabRows.push(r);
          break;
        case 'LONG_TERM_LIABILITY':
          longTermLiabRows.push(r);
          break;
        case 'EQUITY':
          equityRows.push(r);
          break;
      }
    });

    var currentAssetRows = cashRows.concat(receivableRows, inventoryRows, otherCurrentAssetRows);
    var nonCurrentAssetRows = fixedAssetRows.concat(otherAssetRows);
    var allAssetRows = currentAssetRows.concat(nonCurrentAssetRows);
    var currentLiabRows = payableRows.concat(otherCurrentLiabRows);
    var allLiabRows = currentLiabRows.concat(longTermLiabRows);

    var totalAssets = allAssetRows.reduce(function (s, r) {
      return s + signedBalance(r);
    }, 0);
    var totalLiabilities = allLiabRows.reduce(function (s, r) {
      return s + signedBalance(r);
    }, 0);
    var totalEquity = equityRows.reduce(function (s, r) {
      return s + signedBalance(r);
    }, 0);

    // Retained earnings = Revenue − Expenses (not yet closed to equity)
    var revenueTotal = 0;
    var expenseTotal = 0;
    tb.rows.forEach(function (r) {
      if (REVENUE_TYPES.has(r.type)) revenueTotal += signedBalance(r);
      if (EXPENSE_TYPES.has(r.type)) expenseTotal += signedBalance(r);
    });
    var retainedEarnings = revenueTotal - expenseTotal;
    var totalEquityPlusRE = totalEquity + retainedEarnings;
    var totalLiabEquity = totalLiabilities + totalEquityPlusRE;
    var balanced = Math.abs(totalAssets - totalLiabEquity) < 1;


    function groupHead(label) {
      return '<div class="fin-group">' + label + '</div>';
    }
    function grandTotal(label, value) {
      return (
        '<div class="fin-grand"><span>' +
        label +
        '</span><span class="t-num' +
        amountClass(value) +
        '">' +
        money(value) +
        '</span></div>'
      );
    }

    return (
      '<div class="card fin-statement">' +
      '<div class="fin-meta">Posisi per ' +
      esc(periodTo || 'hari ini') +
      ' · saldo kumulatif sejak awal pencatatan' +
      (periodFrom ? ' (tanggal mulai tidak dipakai untuk neraca)' : '') +
      '</div>' +
      groupHead('ASET') +
      (currentAssetRows.length > 0 ? sectionBlock('Aset Lancar', currentAssetRows) : '') +
      (nonCurrentAssetRows.length > 0
        ? sectionBlock('Aset Tetap & Lainnya', nonCurrentAssetRows)
        : '') +
      grandTotal('Total Aset', totalAssets) +
      groupHead('KEWAJIBAN') +
      (currentLiabRows.length > 0 ? sectionBlock('Kewajiban Lancar', currentLiabRows) : '') +
      (longTermLiabRows.length > 0
        ? sectionBlock('Kewajiban Jangka Panjang', longTermLiabRows)
        : '') +
      groupHead('EKUITAS') +
      (equityRows.length > 0 ? sectionBlock('Modal', equityRows) : '') +
      (retainedEarnings !== 0
        ? '<div class="fin-sec">' +
          '<div class="fin-sec-head">Laba Periode Berjalan</div>' +
          '<table class="fin-lines">' +
          '<tbody><tr>' +
          '<td class="acct-no">—</td>' +
          '<td>Laba (Rugi) Periode Berjalan</td>' +
          '<td class="t-num' +
          amountClass(retainedEarnings) +
          '">' +
          money(retainedEarnings) +
          '</td>' +
          '</tr></tbody></table></div>'
        : '') +
      grandTotal('Total Kewajiban + Ekuitas', totalLiabEquity) +
      (balanced
        ? '<div class="fin-ok">Seimbang · Aset = Kewajiban + Ekuitas</div>'
        : '<div class="fin-alert">' +
          'Neraca tidak seimbang. Selisih: ' +
          money(Math.abs(totalAssets - totalLiabEquity)) +
          '. Periksa jurnal yang belum balanced.' +
          '</div>') +
      '</div>'
    );
  }

  // ── Cash Flow (Arus Kas) ──────────────────────────────────────────────────
  function cfTab() {
    var journals = db().journals || [];
    var fromMs = periodFrom ? Date.parse(periodFrom) : -Infinity;
    var toMs = periodTo ? Date.parse(periodTo) : Infinity;
    var chart = db().accountsChart || [];

    function accType(no) {
      var a = chart.find(function (x) {
        return x.no === no;
      });
      return a ? a.type : 'UNKNOWN';
    }
    function accName(no) {
      var a = chart.find(function (x) {
        return x.no === no;
      });
      return a ? a.name : no;
    }

    // Cash flow = sum of movements on CASH_BANK accounts, grouped by counter-
    // party account type. Each journal line that hits a cash account represents
    // a cash inflow (debit on cash) or outflow (credit on cash). The counter-
    // party account tells us whether it's operating, investing, or financing.
    var operating = { inflow: 0, outflow: 0, details: [] };
    var investing = { inflow: 0, outflow: 0, details: [] };
    var financing = { inflow: 0, outflow: 0, details: [] };

    journals.forEach(function (j) {
      var jDate = Date.parse(j.date);
      if (jDate < fromMs || jDate > toMs) return;

      var lines = j.lines || [];
      // Find cash lines and their counter-party accounts
      var cashLines = [];
      var counterLines = [];
      lines.forEach(function (l) {
        if (CASH_TYPES.has(accType(l.accountNo))) {
          cashLines.push(l);
        } else {
          counterLines.push(l);
        }
      });

      if (cashLines.length === 0) return;

      // Determine the dominant counter-party type
      var counterType = 'UNKNOWN';
      if (counterLines.length > 0) {
        counterType = accType(counterLines[0].accountNo);
      }

      // Classify cash movement
      var bucket;
      if (
        counterType === 'FIXED_ASSET' ||
        counterType === 'OTHER_ASSET' ||
        counterType === 'ACCUMULATED_DEPRECIATION'
      ) {
        bucket = investing;
      } else if (EQUITY_TYPES.has(counterType) || counterType === 'LONG_TERM_LIABILITY') {
        bucket = financing;
      } else {
        bucket = operating;
      }

      cashLines.forEach(function (cl) {
        var d = Number(cl.debit) || 0;
        var c = Number(cl.credit) || 0;
        if (d > 0) {
          bucket.inflow += d;
          bucket.details.push({
            date: j.date,
            desc:
              j.memo ||
              (j.source && j.source.docId
                ? j.source.docType + ' ' + j.source.docId
                : accName(cl.accountNo)),
            amount: d,
            type: 'inflow',
          });
        }
        if (c > 0) {
          bucket.outflow += c;
          bucket.details.push({
            date: j.date,
            desc:
              j.memo ||
              (j.source && j.source.docId
                ? j.source.docType + ' ' + j.source.docId
                : accName(cl.accountNo)),
            amount: c,
            type: 'outflow',
          });
        }
      });
    });

    var netOperating = operating.inflow - operating.outflow;
    var netInvesting = investing.inflow - investing.outflow;
    var netFinancing = financing.inflow - financing.outflow;
    var netTotal = netOperating + netInvesting + netFinancing;


    // One block per activity: heading, Masuk/Keluar line, the net (a subtotal,
    // bold; red when negative) and the latest movements in regular weight.
    function cfSection(title, bucket) {
      var net = bucket.inflow - bucket.outflow;
      // Show up to 10 most recent details
      var recent = bucket.details.slice(-10).reverse();

      var detailHtml = '';
      if (recent.length > 0) {
        detailHtml =
          '<div class="fin-cf-scroll"><table class="fin-cf-lines">' +
          '<thead><tr>' +
          '<th>Tanggal</th>' +
          '<th>Keterangan</th>' +
          '<th class="t-num">Masuk</th>' +
          '<th class="t-num">Keluar</th>' +
          '</tr></thead><tbody>';
        recent.forEach(function (d) {
          detailHtml +=
            '<tr>' +
            '<td class="t-muted">' +
            esc(d.date || '') +
            '</td>' +
            '<td>' +
            esc(d.desc) +
            '</td>' +
            '<td class="t-num">' +
            (d.type === 'inflow' ? money(d.amount) : '') +
            '</td>' +
            '<td class="t-num">' +
            (d.type === 'outflow' ? money(d.amount) : '') +
            '</td>' +
            '</tr>';
        });
        if (bucket.details.length > 10) {
          detailHtml +=
            '<tr><td colspan="4" class="fin-none">... dan ' +
            (bucket.details.length - 10) +
            ' transaksi lainnya</td></tr>';
        }
        detailHtml += '</tbody></table></div>';
      }

      return (
        '<div class="fin-cf">' +
        '<div class="fin-cf-head">' +
        '<div>' +
        '<div class="fin-sec-title">' +
        esc(title) +
        '</div>' +
        '<div class="fin-cf-io">Masuk: ' +
        money(bucket.inflow) +
        ' · Keluar: ' +
        money(bucket.outflow) +
        '</div>' +
        '</div>' +
        '<div class="fin-cf-net t-num' +
        amountClass(net) +
        '">' +
        (net >= 0 ? '+' : '') +
        money(net) +
        '</div>' +
        '</div>' +
        detailHtml +
        '</div>'
      );
    }

    var noData =
      operating.details.length === 0 &&
      investing.details.length === 0 &&
      financing.details.length === 0;

    return (
      '<div class="card fin-statement">' +
      (noData
        ? '<div class="fin-empty">Belum ada arus kas tercatat. Kas akan muncul setelah ada pembayaran (SO Paid / PO Paid) atau jurnal umum yang melibatkan akun kas.</div>'
        : cfSection('Aktivitas Operasional', operating) +
          cfSection('Aktivitas Investasi', investing) +
          cfSection('Aktivitas Pendanaan', financing) +
          '<div class="fin-subtotal fin-major">' +
          '<span>Kenaikan (Penurunan) Kas Bersih</span>' +
          '<span class="t-num' +
          bottomLineClass(netTotal) +
          '">' +
          money(netTotal) +
          '</span>' +
          '</div>') +
      '</div>'
    );
  }

  // ── Print / Export ────────────────────────────────────────────────────────
  // The print window has no app stylesheet, so it carries its own paper palette
  // (as tokens) and the statement classes (.fin-…) it needs.
  var PRINT_CSS =
    ':root{--text:#222;--muted:#666;--border:#ddd;--danger:#b91c1c;--success:#15803d}' +
    'body{font-family:system-ui,-apple-system,sans-serif;padding:20px;color:var(--text)}' +
    'h2{font-size:1.125rem;margin-bottom:4px}' +
    'table{width:100%;border-collapse:collapse}' +
    'td,th{padding:6px 10px;border-bottom:1px solid var(--border);font-size:.75rem;text-align:left;font-weight:400}' +
    '.card{border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px}' +
    '.btn,.btn-ghost{display:none}' +
    '.t-num{text-align:right;white-space:nowrap}' +
    '.t-muted,.acct-no,.fin-meta,.fin-pct,.fin-cf-io,.fin-printed{color:var(--muted)}' +
    '.fin-meta,.fin-printed{font-size:.75rem;margin-bottom:14px}' +
    '.fin-group{font-size:.8125rem;font-weight:600;margin:18px 0 6px}' +
    '.fin-sec,.fin-cf{margin-bottom:14px}' +
    '.fin-sec-head,.fin-sec-title{font-size:.8125rem;font-weight:600;padding:6px 0}' +
    '.fin-total td,.fin-subtotal,.fin-grand,.fin-cf-net{font-weight:700}' +
    '.fin-subtotal,.fin-grand,.fin-cf-head{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-top:1px solid var(--muted);margin-bottom:14px;font-size:.8125rem}' +
    '.fin-cf-head{border-top:0;padding:6px 0;margin:0}' +
    '.fin-pct{font-weight:400;margin-left:10px;font-size:.75rem}' +
    '.fin-neg,.fin-alert{color:var(--danger)}' +
    '.fin-pos{color:var(--success)}' +
    '@media print{body{padding:0}}';

  function printReport() {
    var el = document.getElementById('view-financials');
    var statement = el && el.querySelector('.fin-statement');
    if (!statement) return;
    var title =
      activeTab === 'pl'
        ? 'Laporan Laba Rugi'
        : activeTab === 'bs'
          ? 'Neraca (Balance Sheet)'
          : 'Laporan Arus Kas';
    var w = window.open('', '_blank');
    w.document.write(
      '<!DOCTYPE html><html><head><title>' +
        esc(title) +
        '</title>' +
        '<style>' +
        PRINT_CSS +
        '</style>' +
        '</head><body>' +
        '<h2>' +
        esc(title) +
        '</h2>' +
        '<div class="fin-printed">Dicetak: ' +
        new Date().toLocaleDateString('id-ID') +
        (periodFrom || periodTo
          ? ' | Periode: ' + esc(periodFrom || '...') + ' s/d ' + esc(periodTo || '...')
          : '') +
        '</div>' +
        statement.outerHTML +
        '</body></html>'
    );
    w.document.close();
    w.print();
  }

  // ── Main renderer ─────────────────────────────────────────────────────────
  function renderFinancials() {
    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr('Laporan Keuangan', '', 'Cetak', 'finPrint')
        : '<h1>Laporan Keuangan</h1>';
    var body = '';
    if (activeTab === 'bs') body = bsTab();
    else if (activeTab === 'cf') body = cfTab();
    else body = plTab();

    return (
      header +
      '<div class="seg-tabs" role="tablist" aria-label="Laporan keuangan">' +
      tabBtn('pl', 'Laba Rugi') +
      tabBtn('bs', 'Neraca') +
      tabBtn('cf', 'Arus Kas') +
      '</div>' +
      periodBar() +
      body
    );
  }

  function refresh() {
    var el = document.getElementById('view-financials');
    if (el) el.innerHTML = renderFinancials();
  }

  // ── Wire up ───────────────────────────────────────────────────────────────
  window.renderFinancials = renderFinancials;

  // Tab → its sidebar entry (ui/nav.js), kept highlighted when switching tabs.
  var TAB_ENTRY = { pl: 'Laba Rugi', bs: 'Neraca', cf: 'Arus Kas' };
  function syncMenu() {
    if (TAB_ENTRY[activeTab] && window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive(TAB_ENTRY[activeTab]);
    }
  }

  function _navToTab(tab) {
    activeTab = tab;
    if (typeof window.invalidateView === 'function') window.invalidateView('financials');
    if (typeof window.navigate === 'function') window.navigate('financials');
    syncMenu();
  }
  window._financialExtras = {
    openPL:        function () { _navToTab('pl'); },
    openBS:        function () { _navToTab('bs'); },
    openCF:        function () { _navToTab('cf'); },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('finTab', function (_id, _type, val) {
      if (val) {
        activeTab = val;
        refresh();
        syncMenu();
      }
      return true;
    });
    window.ERP.registerAction('finPrint', function () {
      printReport();
      return true;
    });
  }

  // Period filter listeners — delegated
  document.addEventListener('change', function (e) {
    if (e.target.dataset.action === 'finPeriodFrom') {
      periodFrom = e.target.value;
      refresh();
    } else if (e.target.dataset.action === 'finPeriodTo') {
      periodTo = e.target.value;
      refresh();
    }
  });
  document.addEventListener('click', function (e) {
    if (
      e.target.dataset.action === 'finPeriodClear' ||
      (e.target.parentElement && e.target.parentElement.dataset.action === 'finPeriodClear')
    ) {
      periodFrom = '';
      periodTo = '';
      refresh();
    }
  });
})();
