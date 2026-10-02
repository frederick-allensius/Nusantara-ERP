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
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px">' +
      '<label style="font-size:.75rem;color:var(--muted)">Periode dari</label>' +
      '<input type="date" class="form-input" style="padding:4px 8px;font-size:.75rem;width:138px"' +
      ' value="' +
      (periodFrom || '') +
      '" data-action="finPeriodFrom">' +
      '<label style="font-size:.75rem;color:var(--muted)">s/d</label>' +
      '<input type="date" class="form-input" style="padding:4px 8px;font-size:.75rem;width:138px"' +
      ' value="' +
      (periodTo || '') +
      '" data-action="finPeriodTo">' +
      (active
        ? '<button class="btn-ghost" data-action="finPeriodClear" style="font-size:.75rem;padding:3px 8px">× Hapus</button>'
        : '') +
      '</div>'
    );
  }

  // ── Section renderer helper ───────────────────────────────────────────────
  function sectionBlock(title, rows, opts) {
    opts = opts || {};
    var total = 0;
    var rowsHtml = '';
    rows.forEach(function (r) {
      var val = signedBalance(r);
      total += val;
      rowsHtml +=
        '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:7px 10px;font-size:.75rem;font-family:monospace;color:var(--muted)">' +
        esc(r.no) +
        '</td>' +
        '<td style="padding:7px 10px;font-size:.75rem">' +
        esc(r.name) +
        '</td>' +
        '<td style="padding:7px 10px;font-size:.75rem;text-align:right;font-weight:600' +
        (val < 0 ? ';color:var(--danger)' : '') +
        '">' +
        money(val) +
        '</td>' +
        '</tr>';
    });
    if (rows.length === 0) {
      rowsHtml =
        '<tr><td colspan="3" style="padding:10px;text-align:center;color:var(--muted);font-size:.75rem">Tidak ada data</td></tr>';
    }
    var totalColor = opts.totalColor || 'var(--text)';
    return (
      '<div style="margin-bottom:16px">' +
      '<div style="font-size:.8125rem;font-weight:700;padding:8px 10px;background:var(--bg);border-radius:8px 8px 0 0;border:1px solid var(--border);border-bottom:none">' +
      esc(title) +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-top:none">' +
      '<tbody>' +
      rowsHtml +
      '</tbody>' +
      '<tfoot><tr style="border-top:2px solid var(--border)">' +
      '<td colspan="2" style="padding:8px 10px;font-size:.75rem;font-weight:800;text-align:right">Total ' +
      esc(title) +
      '</td>' +
      '<td style="padding:8px 10px;font-size:.8125rem;font-weight:800;text-align:right;color:' +
      totalColor +
      '">' +
      money(total) +
      '</td>' +
      '</tr></tfoot>' +
      '</table>' +
      '</div>'
    );
  }

  // A subtotal bar (e.g. Gross Profit, Operating Income, Net Income). `level`
  // 'major' draws the bold boxed total; 'minor' a lighter inline subtotal. An
  // optional margin % (over revenue) is shown when `base` is provided.
  function subtotalBar(label, value, level, base) {
    var color = value >= 0 ? 'var(--success)' : 'var(--danger)';
    var marginHtml =
      typeof base === 'number' && base !== 0
        ? '<span style="font-size:.75rem;color:var(--muted);font-weight:600;margin-left:10px">' +
          ((value / base) * 100).toFixed(1) +
          '% dari pendapatan</span>'
        : '';
    if (level === 'major') {
      return (
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;margin:4px 0 16px;border:2px solid ' +
        color +
        ';border-radius:10px;background:' +
        color +
        '10">' +
        '<span style="font-size:.9375rem;font-weight:800">' +
        esc(label) +
        marginHtml +
        '</span>' +
        '<span style="font-size:.9375rem;font-weight:800;color:' +
        color +
        '">' +
        money(value) +
        '</span></div>'
      );
    }
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:16px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">' +
      '<span style="font-size:.8125rem;font-weight:800">' +
      esc(label) +
      marginHtml +
      '</span>' +
      '<span style="font-size:.8125rem;font-weight:800;color:' +
      color +
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
    var netColor = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Pendapatan', value: money(totalRevenue), sub: 'Penjualan bersih' },
            {
              label: 'Laba Kotor',
              value: money(grossProfit),
              sub: 'Pendapatan − HPP',
              color: grossProfit >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: 'Laba Usaha',
              value: money(operatingIncome),
              sub: 'Setelah beban operasional',
              color: operatingIncome >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: 'Laba Bersih',
              value: money(netProfit),
              sub: 'Setelah pajak',
              color: netColor,
            },
          ])
        : '';

    return (
      stats +
      '<div class="card">' +
      '<div style="font-size:.875rem;font-weight:700;margin-bottom:4px">Laporan Laba Rugi (Multi-Langkah)</div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-bottom:14px">' +
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

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Aset', value: money(totalAssets), sub: 'Lancar + Tetap' },
            {
              label: 'Total Kewajiban',
              value: money(totalLiabilities),
              sub: 'Hutang usaha & lainnya',
            },
            {
              label: 'Total Ekuitas',
              value: money(totalEquityPlusRE),
              sub: 'Modal + laba ditahan',
            },
            {
              label: 'Status',
              value: balanced ? 'Seimbang ✓' : 'Tidak Seimbang',
              sub: balanced ? 'Aset = Liabilitas + Ekuitas' : 'Periksa jurnal',
              color: balanced ? 'var(--success)' : 'var(--danger)',
            },
          ])
        : '';

    return (
      stats +
      '<div class="card">' +
      '<div style="font-size:.875rem;font-weight:700;margin-bottom:4px">Neraca (Balance Sheet)</div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-bottom:14px">Posisi per ' +
      esc(periodTo || 'hari ini') +
      ' · saldo kumulatif sejak awal pencatatan' +
      (periodFrom ? ' (tanggal mulai tidak dipakai untuk neraca)' : '') +
      '</div>' +
      '<div style="font-size:.8125rem;font-weight:700;color:var(--primary);margin-bottom:8px">ASET</div>' +
      (currentAssetRows.length > 0 ? sectionBlock('Aset Lancar', currentAssetRows) : '') +
      (nonCurrentAssetRows.length > 0
        ? sectionBlock('Aset Tetap & Lainnya', nonCurrentAssetRows)
        : '') +
      '<div style="display:flex;justify-content:flex-end;padding:10px 14px;margin-bottom:20px;border:2px solid var(--primary);border-radius:10px;background:rgba(59,130,246,0.15)">' +
      '<span style="font-size:.875rem;font-weight:800;color:var(--text)">Total Aset: ' +
      money(totalAssets) +
      '</span>' +
      '</div>' +
      '<div style="font-size:.8125rem;font-weight:700;color:var(--warning);margin-bottom:8px">KEWAJIBAN</div>' +
      (currentLiabRows.length > 0 ? sectionBlock('Kewajiban Lancar', currentLiabRows) : '') +
      (longTermLiabRows.length > 0
        ? sectionBlock('Kewajiban Jangka Panjang', longTermLiabRows)
        : '') +
      '<div style="font-size:.8125rem;font-weight:700;color:var(--success);margin-bottom:8px;margin-top:20px">EKUITAS</div>' +
      (equityRows.length > 0 ? sectionBlock('Modal', equityRows) : '') +
      (retainedEarnings !== 0
        ? '<div style="margin-bottom:16px">' +
          '<div style="font-size:.8125rem;font-weight:700;padding:8px 10px;background:var(--bg);border-radius:8px 8px 0 0;border:1px solid var(--border);border-bottom:none">Laba Periode Berjalan</div>' +
          '<table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-top:none">' +
          '<tbody><tr style="border-bottom:1px solid var(--border)">' +
          '<td style="padding:7px 10px;font-size:.75rem;font-family:monospace;color:var(--muted)">—</td>' +
          '<td style="padding:7px 10px;font-size:.75rem">Laba (Rugi) Periode Berjalan</td>' +
          '<td style="padding:7px 10px;font-size:.75rem;text-align:right;font-weight:600;color:' +
          (retainedEarnings >= 0 ? 'var(--success)' : 'var(--danger)') +
          '">' +
          money(retainedEarnings) +
          '</td>' +
          '</tr></tbody></table></div>'
        : '') +
      '<div style="display:flex;justify-content:flex-end;padding:10px 14px;margin-bottom:6px;border:2px solid var(--warning);border-radius:10px;background:rgba(245,158,11,0.15)">' +
      '<span style="font-size:.875rem;font-weight:800;color:var(--text)">Total Kewajiban + Ekuitas: ' +
      money(totalLiabEquity) +
      '</span>' +
      '</div>' +
      (balanced
        ? ''
        : '<div style="padding:8px 12px;background:var(--danger-bg);border:1px solid transparent;border-radius:8px;font-size:.75rem;color:var(--danger);margin-top:8px">' +
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

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            {
              label: 'Arus Operasional',
              value: money(netOperating),
              sub: 'Penjualan & pembelian',
              color: netOperating >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: 'Arus Investasi',
              value: money(netInvesting),
              sub: 'Aset tetap',
              color: netInvesting >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: 'Arus Pendanaan',
              value: money(netFinancing),
              sub: 'Modal & pinjaman',
              color: netFinancing >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: 'Arus Kas Bersih',
              value: money(netTotal),
              sub: 'Total seluruh aktivitas',
              color: netTotal >= 0 ? 'var(--success)' : 'var(--danger)',
            },
          ])
        : '';

    function cfSection(title, bucket, color) {
      var net = bucket.inflow - bucket.outflow;
      // Show up to 10 most recent details
      var recent = bucket.details.slice(-10).reverse();

      var detailHtml = '';
      if (recent.length > 0) {
        detailHtml =
          '<table style="width:100%;border-collapse:collapse;margin-top:8px">' +
          '<thead><tr style="background:var(--bg)">' +
          '<th style="padding:6px 10px;font-size:.75rem;font-weight:700;text-align:left">Tanggal</th>' +
          '<th style="padding:6px 10px;font-size:.75rem;font-weight:700;text-align:left">Keterangan</th>' +
          '<th style="padding:6px 10px;font-size:.75rem;font-weight:700;text-align:right">Masuk</th>' +
          '<th style="padding:6px 10px;font-size:.75rem;font-weight:700;text-align:right">Keluar</th>' +
          '</tr></thead><tbody>';
        recent.forEach(function (d) {
          detailHtml +=
            '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:5px 10px;font-size:.75rem;color:var(--muted)">' +
            esc(d.date || '') +
            '</td>' +
            '<td style="padding:5px 10px;font-size:.75rem">' +
            esc(d.desc) +
            '</td>' +
            '<td style="padding:5px 10px;font-size:.75rem;text-align:right;color:var(--success);font-weight:600">' +
            (d.type === 'inflow' ? money(d.amount) : '') +
            '</td>' +
            '<td style="padding:5px 10px;font-size:.75rem;text-align:right;color:var(--danger);font-weight:600">' +
            (d.type === 'outflow' ? money(d.amount) : '') +
            '</td>' +
            '</tr>';
        });
        if (bucket.details.length > 10) {
          detailHtml +=
            '<tr><td colspan="4" style="padding:6px 10px;font-size:.75rem;color:var(--muted);text-align:center">... dan ' +
            (bucket.details.length - 10) +
            ' transaksi lainnya</td></tr>';
        }
        detailHtml += '</tbody></table>';
      }

      return (
        '<div style="margin-bottom:20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:' +
        color +
        '10;border:1px solid ' +
        color +
        '30;border-radius:10px 10px ' +
        (recent.length > 0 ? '0 0' : '10px 10px') +
        '">' +
        '<div>' +
        '<div style="font-size:.8125rem;font-weight:700;color:' +
        color +
        '">' +
        esc(title) +
        '</div>' +
        '<div style="font-size:.75rem;color:var(--muted);margin-top:2px">Masuk: ' +
        money(bucket.inflow) +
        ' · Keluar: ' +
        money(bucket.outflow) +
        '</div>' +
        '</div>' +
        '<div style="font-size:.9375rem;font-weight:800;color:' +
        (net >= 0 ? 'var(--success)' : 'var(--danger)') +
        '">' +
        (net >= 0 ? '+' : '') +
        money(net) +
        '</div>' +
        '</div>' +
        (recent.length > 0
          ? '<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;overflow:hidden">' +
            detailHtml +
            '</div>'
          : '') +
        '</div>'
      );
    }

    var noData =
      operating.details.length === 0 &&
      investing.details.length === 0 &&
      financing.details.length === 0;

    return (
      stats +
      '<div class="card">' +
      '<div style="font-size:.875rem;font-weight:700;margin-bottom:14px">Laporan Arus Kas (Cash Flow)</div>' +
      (noData
        ? '<div style="padding:24px;text-align:center;color:var(--muted);font-size:.8125rem">Belum ada arus kas tercatat. Kas akan muncul setelah ada pembayaran (SO Paid / PO Paid) atau jurnal umum yang melibatkan akun kas.</div>'
        : cfSection('Aktivitas Operasional', operating, 'var(--primary)') +
          cfSection('Aktivitas Investasi', investing, 'var(--chart-4)') +
          cfSection('Aktivitas Pendanaan', financing, 'var(--warning)') +
          '<div style="display:flex;justify-content:flex-end;padding:12px 14px;border:2px solid ' +
          (netTotal >= 0 ? 'var(--success)' : 'var(--danger)') +
          ';border-radius:10px;background:' +
          (netTotal >= 0 ? 'var(--success)' : 'var(--danger)') +
          '10">' +
          '<span style="font-size:.9375rem;font-weight:800">Kenaikan (Penurunan) Kas Bersih: <span style="color:' +
          (netTotal >= 0 ? 'var(--success)' : 'var(--danger)') +
          '">' +
          money(netTotal) +
          '</span></span>' +
          '</div>') +
      '</div>'
    );
  }

  // ── Print / Export ────────────────────────────────────────────────────────
  function printReport() {
    var el = document.getElementById('view-financials');
    if (!el) return;
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
        '<style>body{font-family:system-ui,-apple-system,sans-serif;padding:20px;color:#222}' +
        'table{width:100%;border-collapse:collapse}td,th{padding:6px 10px;border-bottom:1px solid #ddd;font-size:.75rem;text-align:left}' +
        '.card{border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px}' +
        '.btn,.btn-ghost{display:none}' +
        '@media print{body{padding:0}}</style>' +
        '</head><body>' +
        '<h2 style="font-size:1.125rem;margin-bottom:4px">' +
        esc(title) +
        '</h2>' +
        '<div style="font-size:.75rem;color:#666;margin-bottom:16px">Dicetak: ' +
        new Date().toLocaleDateString('id-ID') +
        (periodFrom || periodTo
          ? ' | Periode: ' + (periodFrom || '...') + ' s/d ' + (periodTo || '...')
          : '') +
        '</div>' +
        el.querySelector('.card').outerHTML +
        '</body></html>'
    );
    w.document.close();
    w.print();
  }

  // ── Main renderer ─────────────────────────────────────────────────────────
  function renderFinancials() {
    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Laporan Keuangan',
            'Laba rugi, neraca, dan arus kas dari buku besar',
            'Cetak',
            'finPrint'
          )
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
