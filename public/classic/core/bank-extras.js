// ══════════════════════════════════════════════════════════════════════════════
//  BANK EXTRAS  — Other Payment, Other Deposit, Bank Transfer, SmartLink,
//                 Bank Statement, Bank History, Bank Reconcile
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function save() {
    window.saveDB && window.saveDB();
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function uid(p) {
    return (p || 'X') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  // Local calendar date (toISOString() is UTC and lags a day before 07:00 WIB).
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function modal(t, b, f, w) {
    window.openModal && window.openModal(t, b, f || '', w);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }
  function ensureArr(key) {
    if (!window.DB[key]) window.DB[key] = [];
    return window.DB[key];
  }
  function ensureSettings(key, def) {
    if (!db().settings) window.DB.settings = {};
    if (db().settings[key] == null) db().settings[key] = def;
    return db().settings[key];
  }
  function injectView(html) {
    window.invalidateView && window.invalidateView('finance');
    window.navigate && window.navigate('finance');
    setTimeout(function () {
      var el = document.getElementById('view-finance');
      if (el) el.innerHTML = html;
    }, 0);
  }

  // Pengeluaran Lain categories. 'Transport' was offered for a while next to
  // 'Transportasi'; records saved with it read as Transportasi everywhere (list,
  // recap, export) while the stored value stays as it is — see normCategory().
  var PAY_CATS = [
    'ATK',
    'Entertain',
    'Utilities',
    'Sewa',
    'Gaji',
    'Transportasi',
    'Pemeliharaan',
    'Asuransi',
    'Pajak',
    'Biaya Bank',
    'Reimbursement',
    'Lainnya',
  ];
  var CATEGORY_ALIASES = { transport: 'Transportasi' };
  function normCategory(category) {
    var c = String(category == null ? '' : category).trim();
    return CATEGORY_ALIASES[c.toLowerCase()] || c;
  }
  var DEP_CATS = ['Penjualan', 'Penerimaan Lainnya', 'Refund', 'Bunga Bank', 'Lainnya'];
  var PAY_METHODS = ['Transfer Bank', 'Tunai', 'Cek', 'Giro', 'QRIS'];

  // Document number via the shared numbering engine (PREFIX.YYYY.MM.NNNNN). Numbers
  // already used in the collection are skipped, so a number is never issued twice.
  var DOC_COLLECTIONS = { OP: 'otherPayments', OD: 'otherDeposits', BT: 'bankTransfers' };
  function docNumber(prefix, date) {
    return window.DocEngine
      ? window.DocEngine.nextNumber(prefix, date, {
          sequences: db().numberSequences,
          docs: db()[DOC_COLLECTIONS[prefix]] || [],
          commit: true,
        })
      : prefix + '-' + Date.now();
  }

  // Ledger account a Kas & Bank record posts against (gl.js): the account chosen
  // on the form, defaulting by category. The default mapping REQUIRES USER
  // CONFIRMATION (docs/04-AKUNTANSI.md §6).
  var ACCOUNT_TYPES = {
    expense: ['EXPENSE', 'COGS', 'OTHER_EXPENSE'],
    income: ['REVENUE', 'OTHER_INCOME'],
  };
  // Accounts per category (gl.js DEFAULT_CHART). Other categories post to
  // 610101 Beban Operasional Lain / 710101 Pendapatan Lain-lain.
  var EXPENSE_CATEGORY_ACCOUNTS = {
    Gaji: '610301',
    'Biaya Bank': '610401',
    Reimbursement: '610101',
  };
  var INCOME_CATEGORY_ACCOUNTS = { Penjualan: '400001', 'Bunga Bank': '710101' };
  function defaultAccountFor(kind, category) {
    var c = normCategory(category);
    if (kind === 'expense') return EXPENSE_CATEGORY_ACCOUNTS[c] || '610101';
    return INCOME_CATEGORY_ACCOUNTS[c] || '710101';
  }
  function accountOptionsHTML(kind, selected) {
    if (window.GL && typeof window.GL.ensureChart === 'function') window.GL.ensureChart();
    var types = ACCOUNT_TYPES[kind];
    return (db().accountsChart || [])
      .filter(function (a) {
        return types.indexOf(a.type) !== -1;
      })
      .map(function (a) {
        return (
          '<option value="' +
          esc(a.no) +
          '"' +
          (a.no === selected ? ' selected' : '') +
          '>' +
          esc(a.no + ' — ' + a.name) +
          '</option>'
        );
      })
      .join('');
  }
  function accountLabel(no) {
    var a = (db().accountsChart || []).find(function (x) {
      return x.no === no;
    });
    return a ? a.name : no || '';
  }
  // Keep the account select in step with the category until the user picks one.
  function wireCategoryAccount(catId, accountId, kind) {
    var cat = document.getElementById(catId);
    var acc = document.getElementById(accountId);
    if (!cat || !acc) return;
    var touched = false;
    acc.addEventListener('change', function () {
      touched = true;
    });
    cat.addEventListener('change', function () {
      if (!touched) acc.value = defaultAccountFor(kind, cat.value);
    });
  }

  // ── Bank Accounts (seed) ──────────────────────────────────────────────────
  function getBankAccounts() {
    return ensureSettings('bankAccounts', [
      {
        id: 'BA001',
        name: 'BCA - Rekening Utama',
        bank: 'BCA',
        accountNumber: '***-***-****',
        currency: 'IDR',
      },
      {
        id: 'BA002',
        name: 'Mandiri - Operasional',
        bank: 'Mandiri',
        accountNumber: '***-***-****',
        currency: 'IDR',
      },
    ]);
  }

  function bankAccountOpts(selected) {
    return getBankAccounts()
      .map(function (a) {
        return (
          '<option value="' +
          esc(a.id) +
          '"' +
          (a.id === selected ? ' selected' : '') +
          '>' +
          esc(a.name) +
          '</option>'
        );
      })
      .join('');
  }

  function bankAccountById(id) {
    return (
      getBankAccounts().find(function (a) {
        return a.id === id;
      }) || null
    );
  }
  // Where the money moved, as the ledger books it (gl.js bankAccountGL): the cash
  // method goes through Kas, any other method through the chosen bank account.
  function sourceLabel(rec) {
    if (rec.method === 'Tunai') return 'Kas';
    var acc = bankAccountById(rec.bankAccountId);
    return acc ? acc.name : rec.bankAccountId || '';
  }
  function accountText(no) {
    if (!no) return '';
    var name = accountLabel(no);
    return name && name !== no ? no + ' — ' + name : no;
  }
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function statRowHTML(items) {
    if (typeof window.statRow === 'function') return window.statRow(items);
    return (
      '<div class="stat-row" style="grid-template-columns:repeat(' +
      items.length +
      ',1fr)">' +
      items
        .map(function (s) {
          return (
            '<div class="card stat-card"><div class="stat-label">' +
            esc(s.label) +
            '</div><div class="stat-val" style="color:' +
            (s.color || 'var(--text)') +
            '">' +
            esc(s.value) +
            '</div><div class="stat-sub">' +
            esc(s.sub) +
            '</div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  // ── Period recap and Excel export (Pengeluaran Lain / Penerimaan Lain) ──────
  var MONTHS_ID = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  var KINDS = {
    expense: {
      collection: 'otherPayments',
      party: 'payee',
      partyLabel: 'Penerima',
      sheetName: 'Pengeluaran',
      fileName: 'Pengeluaran-Lain',
    },
    income: {
      collection: 'otherDeposits',
      party: 'payer',
      partyLabel: 'Pembayar',
      sheetName: 'Penerimaan',
      fileName: 'Penerimaan-Lain',
    },
  };
  // Period shown per page: 'YYYY-MM' or 'all'. Starts at the current month.
  var _period = { expense: null, income: null };
  function currentPeriod(kind) {
    return _period[kind] || today().slice(0, 7);
  }
  function isAllPeriods(period) {
    return !period || period === 'all';
  }
  function periodLabel(period) {
    if (isAllPeriods(period)) return 'Semua periode';
    var m = /^(\d{4})-(\d{2})$/.exec(String(period));
    return m && MONTHS_ID[parseInt(m[2], 10) - 1]
      ? MONTHS_ID[parseInt(m[2], 10) - 1] + ' ' + m[1]
      : String(period);
  }
  function dateLabel(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
    return m ? parseInt(m[3], 10) + ' ' + periodLabel(m[1] + '-' + m[2]) : String(date || '');
  }
  // Records of a period. The recap and the export leave out cancelled records, as
  // the ledger does (gl.js); the list on screen keeps them (withCancelled).
  function rowsInPeriod(rows, period, withCancelled) {
    return (rows || []).filter(function (r) {
      if (!r || (r.status === 'Cancelled' && !withCancelled)) return false;
      return isAllPeriods(period) || String(r.date || '').slice(0, 7) === period;
    });
  }
  // Totals per category for a period ('YYYY-MM', or 'all'/empty for every period),
  // largest first. `kind` ('expense' | 'income') fills in the default account of
  // records saved without one.
  function recapByCategory(rows, period, kind) {
    var map = {};
    var list = [];
    var total = 0;
    rowsInPeriod(rows, period).forEach(function (r) {
      var cat = normCategory(r.category) || 'Tanpa kategori';
      if (!map[cat]) {
        map[cat] = { category: cat, count: 0, amount: 0, accounts: [] };
        list.push(map[cat]);
      }
      var acc = r.accountNo || (kind ? defaultAccountFor(kind, cat) : '');
      if (acc && map[cat].accounts.indexOf(acc) === -1) map[cat].accounts.push(acc);
      map[cat].count += 1;
      map[cat].amount = round2(map[cat].amount + (Number(r.amount) || 0));
      total = round2(total + (Number(r.amount) || 0));
    });
    list.sort(function (a, b) {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
    });
    var count = list.reduce(function (s, c) {
      return s + c.count;
    }, 0);
    return {
      period: isAllPeriods(period) ? 'all' : period,
      label: periodLabel(period),
      rows: list,
      total: total,
      count: count,
    };
  }
  function periodOptionsHTML(rows, selected) {
    var months = {};
    months[today().slice(0, 7)] = true;
    (rows || []).forEach(function (r) {
      var m = String((r && r.date) || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) months[m] = true;
    });
    if (!isAllPeriods(selected)) months[selected] = true;
    return (
      '<option value="all"' +
      (isAllPeriods(selected) ? ' selected' : '') +
      '>Semua periode</option>' +
      Object.keys(months)
        .sort()
        .reverse()
        .map(function (m) {
          return (
            '<option value="' +
            esc(m) +
            '"' +
            (m === selected ? ' selected' : '') +
            '>' +
            esc(periodLabel(m)) +
            '</option>'
          );
        })
        .join('')
    );
  }
  // Workbook for people without app access (the accountant): sheet 1 lists the
  // records of the period, sheet 2 the totals per category. Sheet format: see
  // xlsx-export.js (window.NSAXlsx).
  function buildRecapSheets(kind, rows, period) {
    var k = KINDS[kind];
    var list = rowsInPeriod(rows, period).sort(function (a, b) {
      var da = String(a.date || '');
      var dB = String(b.date || '');
      if (da !== dB) return da < dB ? -1 : 1;
      var na = String(a.number || a.id || '');
      var nb = String(b.number || b.id || '');
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    var recap = recapByCategory(rows, period, kind);
    var suffix = isAllPeriods(period) ? 'Semua' : period;
    return [
      {
        name: k.sheetName + ' ' + suffix,
        columns: [
          { header: 'Tanggal', width: 12 },
          { header: 'No.', width: 20 },
          { header: k.partyLabel, width: 28 },
          { header: 'Kategori', width: 18 },
          { header: 'Akun', width: 34 },
          { header: 'Metode', width: 14 },
          { header: 'Rekening', width: 24 },
          { header: 'Keterangan', width: 36 },
          { header: 'Jumlah', width: 16, type: 'currency' },
        ],
        rows: list.map(function (r) {
          var cat = normCategory(r.category);
          return [
            r.date || '',
            r.number || r.id || '',
            r[k.party] || '',
            cat,
            accountText(r.accountNo || defaultAccountFor(kind, cat)),
            r.method || '',
            sourceLabel(r),
            [r.notes, r.reference ? 'Ref. ' + r.reference : ''].filter(Boolean).join(' · '),
            Number(r.amount) || 0,
          ];
        }),
      },
      {
        name: 'Rekap Kategori',
        columns: [
          { header: 'Kategori', width: 22 },
          { header: 'Akun', width: 40 },
          { header: 'Transaksi', width: 12, type: 'int' },
          { header: 'Jumlah', width: 18, type: 'currency' },
        ],
        rows: recap.rows
          .map(function (c) {
            return [c.category, c.accounts.map(accountText).join(', '), c.count, c.amount];
          })
          .concat([['Total', '', recap.count, recap.total]]),
      },
    ];
  }
  function recapFileName(kind, period) {
    return KINDS[kind].fileName + '-' + (isAllPeriods(period) ? 'Semua' : period) + '.xlsx';
  }
  function exportRecap(kind) {
    var k = KINDS[kind];
    if (!k) return;
    var period = currentPeriod(kind);
    var sheets = buildRecapSheets(kind, ensureArr(k.collection), period);
    if (!sheets[0].rows.length) {
      toast('Tidak ada transaksi untuk diekspor (' + periodLabel(period) + ')', 'warning');
      return;
    }
    if (!window.NSAXlsx || typeof window.NSAXlsx.download !== 'function') {
      toast('Ekspor Excel belum tersedia', 'warning');
      return;
    }
    window.NSAXlsx.download(recapFileName(kind, period), sheets);
    toast('File Excel dibuat', 'success');
  }
  // Page top shared by Pengeluaran Lain and Penerimaan Lain: header with period
  // selector and export, totals, and the per-category recap of the period.
  // Row "⋯" menu (erp-view.js rowActionsMenu); plain buttons when it is absent.
  function rowMenu(label, items) {
    if (typeof window.rowActionsMenu === 'function') return window.rowActionsMenu(label, items);
    return items
      .filter(function (it) {
        return it && it !== '-';
      })
      .map(function (it) {
        return (
          '<button class="' +
          (it.danger ? 'btn-danger-text' : 'btn-ghost') +
          ' btn-sm" data-action="' +
          it.action +
          '" data-id="' +
          esc(it.id) +
          '">' +
          esc(it.label) +
          '</button>'
        );
      })
      .join(' ');
  }

  function recapPageTopHTML(kind, title, desc, addAction, addLabel) {
    var k = KINDS[kind];
    var all = ensureArr(k.collection);
    var period = currentPeriod(kind);
    var recap = recapByCategory(all, period, kind);
    var stats = [
      {
        label: isAllPeriods(period) ? 'Total semua periode' : 'Total ' + recap.label,
        value: money(recap.total),
        sub: recap.count + ' transaksi',
      },
    ];
    if (!isAllPeriods(period)) {
      var overall = recapByCategory(all, 'all', kind);
      stats.push({
        label: 'Sepanjang waktu',
        value: money(overall.total),
        sub: overall.count + ' transaksi',
      });
    }
    var body = recap.rows.length
      ? recap.rows
          .map(function (c) {
            return (
              '<tr><td>' +
              esc(c.category) +
              '</td><td class="t-muted">' +
              esc(c.accounts.map(accountText).join(', ')) +
              '</td><td class="t-num">' +
              c.count +
              '</td><td class="t-num">' +
              money(c.amount) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="4" class="t-muted" style="text-align:center;padding:16px">Tidak ada transaksi pada periode ini.</td></tr>';
    return (
      '<div class="sec-hdr"><div><h1>' +
      esc(title) +
      '</h1>' +
      (desc ? '<p>' + esc(desc) + '</p>' : '') +
      '</div>' +
      '<div><select class="form-select" data-action="bxPeriod" data-kind="' +
      kind +
      '" aria-label="Periode" style="width:auto;min-width:11rem">' +
      periodOptionsHTML(all, period) +
      '</select>' +
      '<button class="btn-ghost" data-action="bxExport" data-kind="' +
      kind +
      '">Ekspor Excel</button>' +
      '<button class="btn" data-action="' +
      addAction +
      '">' +
      esc(addLabel) +
      '</button></div></div>' +
      statRowHTML(stats) +
      '<div class="card"><div class="card-head"><div class="card-title">Rekap per kategori — ' +
      esc(recap.label) +
      '</div></div>' +
      '<div class="table-wrap"><table class="data-table compact"><thead><tr><th>Kategori</th><th>Akun</th>' +
      '<th class="t-num">Transaksi</th><th class="t-num">Jumlah</th></tr></thead><tbody>' +
      body +
      '</tbody>' +
      (recap.rows.length
        ? '<tfoot><tr><td>Total</td><td></td><td class="t-num">' +
          recap.count +
          '</td><td class="t-num">' +
          money(recap.total) +
          '</td></tr></tfoot>'
        : '') +
      '</table></div></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  OTHER PAYMENT (pengeluaran non-PO)
  // ══════════════════════════════════════════════════════════════════════════
  function openOtherPayment() {
    var period = currentPeriod('expense');
    var payments = rowsInPeriod(ensureArr('otherPayments'), period, true).reverse();

    var rows = payments.length
      ? payments
          .map(function (p) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:.75rem;white-space:nowrap">' +
              esc(p.date) +
              '</td>' +
              '<td class="td-p"><span class="doc-no">' +
              esc(p.number || p.id) +
              '</span></td>' +
              '<td class="td-p">' +
              esc(p.payee || '—') +
              '</td>' +
              '<td class="td-p"><span class="cat">' +
              esc(normCategory(p.category) || '—') +
              '</span><div class="bank-sub">' +
              esc(accountLabel(p.accountNo || defaultAccountFor('expense', p.category))) +
              '</div></td>' +
              '<td class="td-p" style="font-size:.75rem">' +
              esc(p.method || '—') +
              '</td>' +
              '<td class="td-p t-num">' +
              money(p.amount) +
              '</td>' +
              '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
              esc(p.notes || '') +
              '</td>' +
              '<td class="td-p row-menu-cell">' +
              rowMenu(p.number || p.id, [{ label: 'Hapus', action: 'delOP', id: p.id, danger: true }]) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">' +
        (ensureArr('otherPayments').length
          ? 'Tidak ada pengeluaran pada ' + esc(periodLabel(period)) + '.'
          : 'Belum ada pengeluaran dicatat.') +
        '</td></tr>';

    injectView(
      recapPageTopHTML(
        'expense',
        'Pengeluaran Lain',
        '',
        'addOP',
        '+ Catat Pengeluaran'
      ) +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th>Tanggal</th><th>No.</th><th>Penerima</th>' +
        '<th>Kategori</th><th>Metode</th><th class="t-num">Jumlah</th>' +
        '<th>Keterangan</th><th></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addOPModal() {
    var catOpts = PAY_CATS.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');
    var methOpts = PAY_METHODS.map(function (m) {
      return '<option>' + esc(m) + '</option>';
    }).join('');
    modal(
      'Catat Pengeluaran',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="op-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Rekening Bank</label><select class="form-select" id="op-bank">' +
        bankAccountOpts() +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Penerima / Payee</label><input class="form-input" id="op-payee" placeholder="Nama vendor, pihak penerima...">' +
        '<div class="form-hint">Reimbursement: isi nama orang yang diganti uangnya.</div></div>' +
        '<div class="form-group"><label class="form-label">Kategori</label><select class="form-select" id="op-cat">' +
        catOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Jumlah (Rp)</label><input class="form-input" id="op-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Metode</label><select class="form-select" id="op-method">' +
        methOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Akun Beban</label><select class="form-select" id="op-account">' +
        accountOptionsHTML('expense', defaultAccountFor('expense', PAY_CATS[0])) +
        '</select><div class="form-hint">Jurnal: akun ini di debit, kas/bank di kredit.</div></div>' +
        '<div class="form-group"><label class="form-label">No. Referensi</label><input class="form-input" id="op-ref" placeholder="No. kwitansi, bukti transfer (opsional)"></div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="op-notes" placeholder="Uraian pengeluaran"></div>',
      '<button class="btn" id="saveOP">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveOP');
      if (!btn) return;
      wireCategoryAccount('op-cat', 'op-account', 'expense');
      btn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('op-amount').value) || 0;
        var payee = document.getElementById('op-payee').value.trim();
        if (!payee || amount <= 0) {
          toast('Penerima dan jumlah wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('otherPayments');
        var opDate = document.getElementById('op-date').value || today();
        var num = docNumber('OP', opDate);
        arr.push({
          id: 'OP-' + Date.now(),
          number: num,
          accountNo: document.getElementById('op-account').value,
          date: opDate,
          bankAccountId: document.getElementById('op-bank').value,
          payee: payee,
          category: document.getElementById('op-cat').value,
          amount: amount,
          method: document.getElementById('op-method').value,
          reference: document.getElementById('op-ref').value.trim(),
          notes: document.getElementById('op-notes').value.trim(),
          createdAt: today(),
        });
        save();
        closeM();
        toast('Pengeluaran dicatat', 'success');
        openOtherPayment();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  OTHER DEPOSIT (penerimaan non-SO)
  // ══════════════════════════════════════════════════════════════════════════
  function openOtherDeposit() {
    var period = currentPeriod('income');
    var deposits = rowsInPeriod(ensureArr('otherDeposits'), period, true).reverse();

    var rows = deposits.length
      ? deposits
          .map(function (d) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:.75rem;white-space:nowrap">' +
              esc(d.date) +
              '</td>' +
              '<td class="td-p"><span class="doc-no">' +
              esc(d.number || d.id) +
              '</span></td>' +
              '<td class="td-p">' +
              esc(d.payer || '—') +
              '</td>' +
              '<td class="td-p"><span class="cat">' +
              esc(normCategory(d.category) || '—') +
              '</span><div class="bank-sub">' +
              esc(accountLabel(d.accountNo || defaultAccountFor('income', d.category))) +
              '</div></td>' +
              '<td class="td-p" style="font-size:.75rem">' +
              esc(d.method || '—') +
              '</td>' +
              '<td class="td-p t-num">' +
              money(d.amount) +
              '</td>' +
              '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
              esc(d.notes || '') +
              '</td>' +
              '<td class="td-p row-menu-cell">' +
              rowMenu(d.number || d.id, [{ label: 'Hapus', action: 'delOD', id: d.id, danger: true }]) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">' +
        (ensureArr('otherDeposits').length
          ? 'Tidak ada penerimaan pada ' + esc(periodLabel(period)) + '.'
          : 'Belum ada penerimaan dicatat.') +
        '</td></tr>';

    injectView(
      recapPageTopHTML(
        'income',
        'Penerimaan Lain',
        '',
        'addOD',
        '+ Catat Penerimaan'
      ) +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th>Tanggal</th><th>No.</th><th>Dari</th>' +
        '<th>Kategori</th><th>Metode</th><th class="t-num">Jumlah</th>' +
        '<th>Keterangan</th><th></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addODModal() {
    var catOpts = DEP_CATS.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');
    var methOpts = PAY_METHODS.map(function (m) {
      return '<option>' + esc(m) + '</option>';
    }).join('');
    modal(
      'Catat Penerimaan',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="od-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Rekening Bank</label><select class="form-select" id="od-bank">' +
        bankAccountOpts() +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Dari / Pembayar</label><input class="form-input" id="od-payer" placeholder="Nama pengirim..."></div>' +
        '<div class="form-group"><label class="form-label">Kategori</label><select class="form-select" id="od-cat">' +
        catOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Jumlah (Rp)</label><input class="form-input" id="od-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Metode</label><select class="form-select" id="od-method">' +
        methOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Akun Pendapatan</label><select class="form-select" id="od-account">' +
        accountOptionsHTML('income', defaultAccountFor('income', DEP_CATS[0])) +
        '</select><div class="form-hint">Jurnal: kas/bank di debit, akun ini di kredit.</div></div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="od-notes" placeholder="Uraian penerimaan"></div>',
      '<button class="btn" id="saveOD">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveOD');
      if (!btn) return;
      wireCategoryAccount('od-cat', 'od-account', 'income');
      btn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('od-amount').value) || 0;
        var payer = document.getElementById('od-payer').value.trim();
        if (!payer || amount <= 0) {
          toast('Pengirim dan jumlah wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('otherDeposits');
        var odDate = document.getElementById('od-date').value || today();
        var num = docNumber('OD', odDate);
        arr.push({
          id: 'OD-' + Date.now(),
          number: num,
          accountNo: document.getElementById('od-account').value,
          date: odDate,
          bankAccountId: document.getElementById('od-bank').value,
          payer: payer,
          category: document.getElementById('od-cat').value,
          amount: amount,
          method: document.getElementById('od-method').value,
          notes: document.getElementById('od-notes').value.trim(),
          createdAt: today(),
        });
        save();
        closeM();
        toast('Penerimaan dicatat', 'success');
        openOtherDeposit();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  BANK TRANSFER
  // ══════════════════════════════════════════════════════════════════════════
  function openBankTransfer() {
    var transfers = ensureArr('bankTransfers').slice().reverse();

    var rows = transfers.length
      ? transfers
          .map(function (t) {
            var accounts = getBankAccounts();
            var fromAcc = accounts.find(function (a) {
              return a.id === t.fromAccountId;
            });
            var toAcc = accounts.find(function (a) {
              return a.id === t.toAccountId;
            });
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:.75rem;white-space:nowrap">' +
              esc(t.date) +
              '</td>' +
              '<td class="td-p"><span class="doc-no">' +
              esc(t.number || t.id) +
              '</span></td>' +
              '<td class="td-p" style="font-size:.75rem">' +
              esc(fromAcc ? fromAcc.name : t.fromAccountId) +
              '</td>' +
              '<td class="td-p" style="color:var(--muted)">→</td>' +
              '<td class="td-p" style="font-size:.75rem">' +
              esc(toAcc ? toAcc.name : t.toAccountId) +
              '</td>' +
              '<td class="td-p t-num">' +
              money(t.amount) +
              '</td>' +
              '<td class="td-p t-num">' +
              (t.fee ? money(t.fee) : '—') +
              '</td>' +
              '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
              esc(t.notes || '') +
              '</td>' +
              '<td class="td-p row-menu-cell">' +
              rowMenu(t.number || t.id, [{ label: 'Hapus', action: 'delBT', id: t.id, danger: true }]) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Belum ada transfer antar rekening.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Transfer Antar Rekening</h1><p>Otomatis dijurnal.</p></div>' +
        '<button class="btn" data-action="addBT">+ Buat Transfer</button></div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th>Tanggal</th><th>No.</th><th>Dari</th><th></th>' +
        '<th>Ke</th><th class="t-num">Jumlah</th><th class="t-num">Biaya</th>' +
        '<th>Keterangan</th><th></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addBTModal() {
    var accounts = getBankAccounts();
    var accOpts1 = accounts
      .map(function (a) {
        return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>';
      })
      .join('');
    var accOpts2 = accOpts1;
    modal(
      'Transfer Antar Rekening',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="bt-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Referensi</label><input class="form-input" id="bt-ref" placeholder="No. transfer (opsional)"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Dari Rekening</label><select class="form-select" id="bt-from">' +
        accOpts1 +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Ke Rekening</label><select class="form-select" id="bt-to">' +
        accOpts2 +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Jumlah (Rp)</label><input class="form-input" id="bt-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Biaya Transfer (Rp)</label><input class="form-input" id="bt-fee" type="number" min="0" value="0"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="bt-notes" placeholder="Opsional"></div>',
      '<button class="btn" id="saveBT">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveBT');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('bt-amount').value) || 0;
        var from = document.getElementById('bt-from').value;
        var to = document.getElementById('bt-to').value;
        if (from === to) {
          toast('Rekening asal dan tujuan tidak boleh sama', 'warning');
          return;
        }
        if (amount <= 0) {
          toast('Jumlah wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('bankTransfers');
        var btDate = document.getElementById('bt-date').value || today();
        var num = docNumber('BT', btDate);
        arr.push({
          id: 'BT-' + Date.now(),
          number: num,
          date: btDate,
          fromAccountId: from,
          toAccountId: to,
          amount: amount,
          fee: parseFloat(document.getElementById('bt-fee').value) || 0,
          reference: document.getElementById('bt-ref').value.trim(),
          notes: document.getElementById('bt-notes').value.trim(),
          createdAt: today(),
        });
        save();
        closeM();
        toast('Transfer dicatat', 'success');
        openBankTransfer();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 4  SMARTLINK e-BANKING
  // ══════════════════════════════════════════════════════════════════════════
  function openSmartLink() {
    var cfg = ensureSettings('smartlink', {
      enabled: false,
      bankCode: '',
      apiKey: '',
      webhookUrl: '',
    });
    var accounts = getBankAccounts();
    var accRows = accounts
      .map(function (a) {
        return (
          '<tr><td class="td-p">' +
          esc(a.name) +
          '</td>' +
          '<td class="td-p">' +
          esc(a.bank) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(a.accountNumber) +
          '</td>' +
          '<td class="td-p"><span class="badge badge-warning">Manual</span></td>' +
          '</tr>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>SmartLink e-Banking</h1><p>Integrasi perbankan elektronik</p></div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
        '<div style="width:44px;height:44px;border-radius:10px;background:var(--info-bg);display:flex;align-items:center;justify-content:center">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--info)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>' +
        '<div><div class="card-title">Status Koneksi</div>' +
        '<div style="font-size:.75rem;color:var(--muted)">Koneksi API perbankan</div></div>' +
        '<span class="badge badge-warning" style="margin-left:auto">Belum Terhubung</span>' +
        '</div>' +
        '<div style="padding:16px;background:var(--surface-sunken);border-radius:8px;font-size:.75rem;color:var(--muted);line-height:1.6">' +
        '<strong>Untuk mengaktifkan SmartLink e-Banking:</strong><br>' +
        '1. Daftarkan perusahaan Anda ke program corporate banking bank terpilih<br>' +
        '2. Dapatkan API Key dan Webhook URL dari portal developer bank<br>' +
        '3. Masukkan kredensial di bawah ini dan klik Simpan<br>' +
        '<em style="color:var(--danger)">Catatan: Integrasi langsung memerlukan kontrak bisnis dengan bank.</em>' +
        '</div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-head"><div class="card-title">Konfigurasi API</div></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Kode Bank</label>' +
        '<input class="form-input" id="sl-bank" value="' +
        esc(cfg.bankCode) +
        '" placeholder="BCA, Mandiri, BNI, BRI..."></div>' +
        '<div class="form-group"><label class="form-label">API Key</label>' +
        '<input class="form-input" id="sl-apikey" type="password" value="' +
        esc(cfg.apiKey) +
        '" placeholder="••••••••••••••••"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Webhook URL (opsional)</label>' +
        '<input class="form-input" id="sl-webhook" value="' +
        esc(cfg.webhookUrl) +
        '" placeholder="https://..."></div>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
        '<button class="btn" id="saveSmartLink">Simpan Konfigurasi</button>' +
        '<button class="btn-ghost" id="testSmartLink">Test Koneksi</button></div></div>' +
        '<div class="card"><div class="card-head"><div class="card-title">Rekening Terdaftar</div></div>' +
        '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
        '<th>Nama Rekening</th><th>Bank</th>' +
        '<th>No. Rekening</th><th>Status</th>' +
        '</tr></thead><tbody>' +
        accRows +
        '</tbody></table></div>'
    );

    setTimeout(function () {
      var saveBtn = document.getElementById('saveSmartLink');
      var testBtn = document.getElementById('testSmartLink');
      if (saveBtn)
        saveBtn.addEventListener('click', function () {
          cfg.bankCode = document.getElementById('sl-bank').value.trim();
          cfg.apiKey = document.getElementById('sl-apikey').value.trim();
          cfg.webhookUrl = document.getElementById('sl-webhook').value.trim();
          save();
          toast('Konfigurasi disimpan', 'success');
        });
      if (testBtn)
        testBtn.addEventListener('click', function () {
          toast('Koneksi API belum tersedia (mode demo)', 'warning');
        });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 5  BANK STATEMENT
  // ══════════════════════════════════════════════════════════════════════════
  // Rekening koran are entered and kept on the Rekonsiliasi Bank page: this is
  // the list card under the reconciliation. The Rekening Koran menu label opens
  // that page.
  function statementsCardHTML(statements, accounts) {
    var rows = statements
      .slice()
      .reverse()
      .map(function (s) {
        var acc = accounts.find(function (a) {
          return a.id === s.accountId;
        });
        var entryCount = (s.entries || []).length;
        var totalDebit = (s.entries || []).reduce(function (x, e) {
          return x + (e.debit || 0);
        }, 0);
        var totalCredit = (s.entries || []).reduce(function (x, e) {
          return x + (e.credit || 0);
        }, 0);
        return (
          '<tr>' +
          '<td class="td-p"><span class="doc-no">' +
          esc(s.id) +
          '</span></td>' +
          '<td class="td-p">' +
          esc(acc ? acc.name : s.accountId) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(s.period) +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          entryCount +
          ' baris</td>' +
          '<td class="td-p t-num">' +
          money(totalDebit) +
          '</td>' +
          '<td class="td-p t-num">' +
          money(totalCredit) +
          '</td>' +
          '<td class="td-p" style="text-align:right;white-space:nowrap">' +
          '<button class="btn-ghost btn-sm" data-action="bxReconcileOpen" data-id="' +
          esc(s.id) +
          '">Rekonsiliasi</button>' +
          rowMenu(s.id, [
            { label: 'Detail', action: 'viewBS', id: s.id },
            '-',
            { label: 'Hapus', action: 'delBS', id: s.id, danger: true },
          ]) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="card" style="overflow-x:auto">' +
      '<div class="card-head"><div class="card-title">Rekening koran tersimpan</div></div>' +
      '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr><th>ID</th><th>Rekening</th><th>Periode</th>' +
      '<th style="text-align:center">Baris</th><th class="t-num">Total Debit</th>' +
      '<th class="t-num">Total Kredit</th><th></th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div>'
    );
  }

  function openBankStatement() {
    openBankReconcile();
  }

  function addBSModal() {
    modal(
      'Input Rekening Koran',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Rekening Bank</label><select class="form-select" id="bs-acc">' +
        bankAccountOpts() +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Periode (YYYY-MM)</label><input class="form-input" id="bs-period" type="month" value="' +
        today().slice(0, 7) +
        '"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="bs-opening">Saldo Awal (Rp)</label><input class="form-input" id="bs-opening" type="number" step="any" placeholder="Opsional"></div>' +
        '<div class="form-group"><label class="form-label" for="bs-closing">Saldo Akhir (Rp)</label><input class="form-input" id="bs-closing" type="number" step="any" placeholder="Opsional"></div>' +
        '</div>' +
        '<div class="form-hint">Saldo akhir dibandingkan dengan saldo buku besar di Rekonsiliasi Bank.</div>' +
        '<div style="font-size:.75rem;font-weight:600;margin:12px 0 8px;color:var(--muted)">Entri Transaksi</div>' +
        '<div id="bs-lines-wrap">' +
        _bsLineHTML() +
        '</div>' +
        '<button type="button" class="btn-ghost" data-action="addBSLine" style="font-size:.75rem;margin-top:6px">+ Tambah Baris</button>',
      '<button class="btn" id="saveBS">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>',
      true
    );
    setTimeout(function () {
      var btn = document.getElementById('saveBS');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var accId = document.getElementById('bs-acc').value;
        var period = document.getElementById('bs-period').value;
        var entries = [];
        document.querySelectorAll('#bs-lines-wrap .bs-row').forEach(function (row) {
          var date = row.querySelector('.bs-date').value;
          var desc = row.querySelector('.bs-desc').value.trim();
          var debit = parseFloat(row.querySelector('.bs-debit').value) || 0;
          var credit = parseFloat(row.querySelector('.bs-credit').value) || 0;
          if (desc) entries.push({ date: date, description: desc, debit: debit, credit: credit });
        });
        var opening = numOrNull(document.getElementById('bs-opening').value);
        var closing = numOrNull(document.getElementById('bs-closing').value);
        if (!/^\d{4}-\d{2}$/.test(period)) {
          toast('Periode wajib diisi', 'warning');
          return;
        }
        if (!entries.length && closing == null) {
          toast('Isi minimal 1 baris transaksi atau saldo akhir', 'warning');
          return;
        }
        var arr = ensureArr('bankStatements');
        var seq = arr.length + 1;
        var num;
        do {
          num = 'BS.' + period.replace('-', '.') + '.' + String(seq++).padStart(3, '0');
        } while (findStatement(num));
        arr.push({
          id: num,
          accountId: accId,
          period: period,
          uploadDate: today(),
          openingBalance: opening,
          closingBalance: closing,
          entries: entries,
        });
        _reconcileId = num;
        save();
        closeM();
        toast('Rekening koran disimpan', 'success');
        openBankReconcile();
      });
    }, 60);
  }

  function _bsLineHTML() {
    return (
      '<div class="bs-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">' +
      '<input class="form-input bs-date" type="date" value="' +
      today() +
      '" style="width:130px;font-size:.75rem">' +
      '<input class="form-input bs-desc" placeholder="Keterangan" style="flex:1;font-size:.75rem">' +
      '<input class="form-input bs-debit" type="number" min="0" placeholder="Debit" style="width:110px;font-size:.75rem">' +
      '<input class="form-input bs-credit" type="number" min="0" placeholder="Kredit" style="width:110px;font-size:.75rem">' +
      '<button type="button" class="btn-ghost" data-action="delBSLine" style="font-size:1.125rem;padding:0 6px;line-height:1;flex:none">×</button></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 6  BANK HISTORY
  // ══════════════════════════════════════════════════════════════════════════
  // The movement list shows 25 rows per page (list-pager.js); Total Masuk /
  // Keluar / Net Posisi cover every movement. Opening the page starts at page 1.
  var HISTORY_PAGE_SIZE = 25;
  var _historyPage = 1;

  // Every cash & bank movement, newest first.
  function bankHistoryEntries() {
    var entries = [];
    var accounts = getBankAccounts();
    var accMap = {};
    accounts.forEach(function (a) {
      accMap[a.id] = a.name;
    });

    (db().paymentLogs || []).forEach(function (p) {
      // Rows created by applying a down payment moved no cash (the down payment did).
      if (p.method === 'Down Payment' || p.source === 'DP') return;
      entries.push({
        date: p.date || '',
        type: p.type === 'SO' ? 'Pembayaran pesanan jual' : 'Pembayaran pesanan beli',
        ref: p.orderId || '',
        amount: p.amount || 0,
        flow: p.type === 'SO' ? 'in' : 'out',
        method: p.method || '',
        note: p.note || '',
      });
    });
    (db().salesReceipts || []).forEach(function (r) {
      if (r.status !== 'Posted') return;
      entries.push({
        date: r.date || '',
        type: 'Penerimaan faktur',
        ref: r.number || r.id,
        amount: r.amount || 0,
        flow: 'in',
        method: r.paymentMethod || '',
        note: (r.customer || '') + (r.invoiceNumber ? ' — ' + r.invoiceNumber : ''),
      });
    });
    (db().purchasePayments || []).forEach(function (r) {
      if (r.status !== 'Posted') return;
      entries.push({
        date: r.date || '',
        type: 'Pembayaran faktur',
        ref: r.number || r.id,
        amount: r.amount || 0,
        flow: 'out',
        method: r.paymentMethod || '',
        note: (r.supplier || '') + (r.invoiceNumber ? ' — ' + r.invoiceNumber : ''),
      });
    });
    (db().salesDownPayments || []).forEach(function (d) {
      entries.push({
        date: d.date || '',
        type: 'Uang muka penjualan',
        ref: d.id,
        amount: d.amount || 0,
        flow: 'in',
        method: d.method || 'Tunai',
        note: d.customerName || '',
      });
    });
    (db().purchaseDownPayments || []).forEach(function (d) {
      entries.push({
        date: d.date || '',
        type: 'Uang muka pembelian',
        ref: d.id,
        amount: d.amount || 0,
        flow: 'out',
        method: d.method || 'Tunai',
        note: d.supplierName || '',
      });
    });
    (db().otherPayments || []).forEach(function (p) {
      entries.push({
        date: p.date || '',
        type: 'Pengeluaran lain',
        ref: p.number || p.id,
        amount: p.amount || 0,
        flow: 'out',
        method: p.method || '',
        note: p.payee + (p.notes ? ' — ' + p.notes : ''),
      });
    });
    (db().otherDeposits || []).forEach(function (d) {
      entries.push({
        date: d.date || '',
        type: 'Penerimaan lain',
        ref: d.number || d.id,
        amount: d.amount || 0,
        flow: 'in',
        method: d.method || '',
        note: d.payer + (d.notes ? ' — ' + d.notes : ''),
      });
    });
    (db().bankTransfers || []).forEach(function (t) {
      entries.push({
        date: t.date || '',
        type: 'Transfer rekening',
        ref: t.number || t.id,
        amount: t.amount || 0,
        flow: 'transfer',
        method: 'Transfer',
        note:
          (accMap[t.fromAccountId] || t.fromAccountId) +
          ' → ' +
          (accMap[t.toAccountId] || t.toAccountId),
      });
    });

    entries.sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });
    return entries;
  }

  // The movement table for the current page and the pager under it.
  function bankHistoryListHTML(entries) {
    var pg = window.NSAPager.page(entries, _historyPage, HISTORY_PAGE_SIZE);
    _historyPage = pg.page;
    var rows =
      pg.rows
        .map(function (e) {
          // Money out is the negative movement: red, the rest plain.
          var prefix = e.flow === 'in' ? '+' : e.flow === 'out' ? '−' : '⇄';
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:.75rem;white-space:nowrap">' +
            esc(e.date) +
            '</td>' +
            '<td class="td-p"><span class="cat">' +
            esc(e.type) +
            '</span></td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(e.ref) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
            esc(e.method) +
            '</td>' +
            '<td class="td-p t-num' +
            (e.flow === 'out' ? ' fin-neg' : '') +
            '">' +
            prefix +
            ' ' +
            money(e.amount) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
            esc(e.note) +
            '</td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Belum ada riwayat transaksi bank.</td></tr>';

    return (
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr><th>Tanggal</th><th>Tipe</th><th>Referensi</th>' +
      '<th>Metode</th><th class="t-num">Jumlah</th><th>Keterangan</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div>' +
      window.NSAPager.html({ total: pg.total, page: pg.page, size: HISTORY_PAGE_SIZE, action: 'bxHistoryPage' })
    );
  }

  function openBankHistory() {
    _historyPage = 1;
    var entries = bankHistoryEntries();

    var totalIn = entries
      .filter(function (e) {
        return e.flow === 'in';
      })
      .reduce(function (s, e) {
        return s + e.amount;
      }, 0);
    var totalOut = entries
      .filter(function (e) {
        return e.flow === 'out';
      })
      .reduce(function (s, e) {
        return s + e.amount;
      }, 0);

    injectView(
      '<div class="sec-hdr"><div><h1>Riwayat Kas &amp; Bank</h1><p>' +
        entries.length.toLocaleString('id-ID') +
        ' transaksi</p></div></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Masuk</div><div class="stat-val">' +
        money(totalIn) +
        '</div><div class="stat-sub">Pelanggan, uang muka &amp; penerimaan lain</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Total Keluar</div><div class="stat-val">' +
        money(totalOut) +
        '</div><div class="stat-sub">Supplier, uang muka &amp; pengeluaran lain</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Net Posisi</div><div class="stat-val' +
        (totalIn - totalOut < 0 ? ' fin-neg' : '') +
        '">' +
        money(Math.abs(totalIn - totalOut)) +
        '</div><div class="stat-sub">' +
        (totalIn - totalOut >= 0 ? 'Surplus' : 'Defisit') +
        '</div></div>' +
        '</div>' +
        '<div class="card" id="bx-history-list">' +
        bankHistoryListHTML(entries) +
        '</div>'
    );
  }

  // Pager: repaint only the movement list, so the page keeps its place.
  function showBankHistoryPage(page) {
    _historyPage = page;
    var host = document.getElementById('bx-history-list');
    if (host) host.innerHTML = bankHistoryListHTML(bankHistoryEntries());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 7  BANK RECONCILE
  // ══════════════════════════════════════════════════════════════════════════
  // Statement lines are matched by index: bs.reconciled[i] is the tick, and
  // bs.matches[i] = { docType, docId } links a line recorded from this page to the
  // Pengeluaran Lain / Penerimaan Lain record it created.
  var _reconcileId = null;

  function findStatement(id) {
    if (!id) return null;
    return (
      ensureArr('bankStatements').find(function (s) {
        return s.id === id;
      }) || null
    );
  }
  function numOrNull(v) {
    if (v == null || String(v).trim() === '') return null;
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }
  function lastDayOf(period) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
    if (!m) return '';
    return period + '-' + pad2(new Date(parseInt(m[1], 10), parseInt(m[2], 10), 0).getDate());
  }
  function statementTotals(bs) {
    return (bs.entries || []).reduce(
      function (t, e) {
        t.debit = round2(t.debit + (Number(e.debit) || 0));
        t.credit = round2(t.credit + (Number(e.credit) || 0));
        return t;
      },
      { debit: 0, credit: 0 }
    );
  }
  // Closing balance of a statement: as entered, else the opening balance plus the
  // credits minus the debits of the lines entered; null when neither is known.
  function statementBalance(bs) {
    if (!bs) return null;
    if (isNum(bs.closingBalance)) return round2(bs.closingBalance);
    if (isNum(bs.openingBalance)) {
      var t = statementTotals(bs);
      return round2(bs.openingBalance + t.credit - t.debit);
    }
    return null;
  }
  // Ledger balance (debit − credit) of an account over the journals dated up to and
  // including `uptoDate` (all journals when empty).
  function ledgerBalance(accountNo, uptoDate) {
    var sum = 0;
    (db().journals || []).forEach(function (j) {
      if (!j || (uptoDate && String(j.date || '').slice(0, 10) > uptoDate)) return;
      (j.lines || []).forEach(function (l) {
        if (l.accountNo === accountNo) sum += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      });
    });
    return round2(sum);
  }
  function bankGL(bankAccountId) {
    return window.GL && typeof window.GL.bankAccountGL === 'function'
      ? window.GL.bankAccountGL(bankAccountId)
      : '';
  }
  // Statement vs ledger for the statement's bank account at the end of its period.
  function reconcileSummary(bs) {
    var accountNo = bankGL(bs.accountId);
    var periodEnd = lastDayOf(bs.period);
    var stmt = statementBalance(bs);
    var ledger = accountNo ? ledgerBalance(accountNo, periodEnd) : null;
    var diff = stmt == null || ledger == null ? null : round2(stmt - ledger);
    var reconciled = bs.reconciled || {};
    return {
      accountNo: accountNo,
      periodEnd: periodEnd,
      statementBalance: stmt,
      ledgerBalance: ledger,
      difference: diff,
      balanced: diff == null ? null : Math.abs(diff) < 0.005,
      lines: (bs.entries || []).length,
      matched: (bs.entries || []).filter(function (_e, i) {
        return !!reconciled[i];
      }).length,
      // Other bank accounts booked to the same ledger account.
      sharedWith: getBankAccounts()
        .filter(function (a) {
          return a.id !== bs.accountId && accountNo && bankGL(a.id) === accountNo;
        })
        .map(function (a) {
          return a.name;
        }),
    };
  }

  // ── Bank charges and interest ───────────────────────────────────────────────
  // Small bank items (admin and transfer fees, interest, tax on interest) are often
  // missing from the books, so the ledger drifts from the statement. Fees and tax
  // become Pengeluaran Lain (category Biaya Bank), interest Penerimaan Lain (Bunga
  // Bank). The default chart has no account for tax on interest, so it posts to
  // 610101 — REQUIRES USER CONFIRMATION (docs/04-AKUNTANSI.md §6).
  var BANK_CHARGE_TYPES = {
    admin: { label: 'Biaya admin', kind: 'expense', category: 'Biaya Bank' },
    transfer: { label: 'Biaya transfer', kind: 'expense', category: 'Biaya Bank' },
    interestTax: {
      label: 'Pajak bunga',
      kind: 'expense',
      category: 'Biaya Bank',
      accountNo: '610101',
    },
    interest: { label: 'Bunga', kind: 'income', category: 'Bunga Bank' },
  };
  var BANK_CHARGE_ORDER = ['admin', 'transfer', 'interestTax', 'interest'];
  function bankChargeAccount(type) {
    var t = BANK_CHARGE_TYPES[type];
    return t ? t.accountNo || defaultAccountFor(t.kind, t.category) : '';
  }
  // Statement convention: debit = money out of the account, credit = money in.
  function lineSide(line) {
    if (!line) return null;
    if ((Number(line.debit) || 0) > 0) return 'expense';
    if ((Number(line.credit) || 0) > 0) return 'income';
    return null;
  }
  function lineAmount(line) {
    var side = lineSide(line);
    if (side === 'income') return Number(line.credit) || 0;
    return side === 'expense' ? Number(line.debit) || 0 : 0;
  }
  function linkedDoc(match) {
    if (!match || !match.docId) return null;
    var coll = match.docType === 'OD' ? 'otherDeposits' : 'otherPayments';
    return (
      (db()[coll] || []).find(function (d) {
        return d.id === match.docId;
      }) || null
    );
  }
  // A record created from a statement line is being deleted: free the line again.
  function unlinkStatementLine(rec) {
    if (!rec || !rec.bankStatementId) return;
    var bs = findStatement(rec.bankStatementId);
    var idx = rec.bankStatementLine;
    if (!bs || !bs.matches || !bs.matches[idx] || bs.matches[idx].docId !== rec.id) return;
    delete bs.matches[idx];
    if (bs.reconciled) bs.reconciled[idx] = false;
  }
  function nextDocId(prefix, arr) {
    var n = Date.now();
    var taken = function (x) {
      return x.id === prefix + '-' + n;
    };
    while (arr.some(taken)) n++;
    return prefix + '-' + n;
  }
  function bankPartyName(acc) {
    var bank = String((acc && acc.bank) || '').trim();
    if (!bank) return (acc && acc.name) || 'Bank';
    return /^bank\b/i.test(bank) ? bank : 'Bank ' + bank;
  }
  // Creates the record for a bank charge or interest.
  //   opts: { type, bankAccountId, date, amount, description }
  //         + { statementId, lineIndex } to record a statement line: the line then
  //           supplies the defaults and is marked matched.
  // Returns the new otherPayments / otherDeposits record. Throws on invalid input;
  // the caller saves.
  function recordBankCharge(opts) {
    opts = opts || {};
    var type = BANK_CHARGE_TYPES[opts.type];
    if (!type) throw new Error('Jenis biaya bank tidak dikenal');
    var bs = null;
    var line = null;
    var idx = null;
    if (opts.statementId != null && opts.statementId !== '') {
      bs = findStatement(opts.statementId);
      idx = parseInt(opts.lineIndex, 10);
      line = bs && bs.entries && !isNaN(idx) ? bs.entries[idx] : null;
      if (!line) throw new Error('Baris rekening koran tidak ditemukan');
      if (lineSide(line) !== type.kind) {
        throw new Error(
          type.kind === 'income'
            ? 'Bunga dicatat dari baris kredit (uang masuk)'
            : 'Biaya dicatat dari baris debit (uang keluar)'
        );
      }
      if (linkedDoc(bs.matches && bs.matches[idx])) {
        throw new Error('Baris ini sudah dicatat');
      }
    }
    var bankAccountId = (bs && bs.accountId) || opts.bankAccountId || '';
    var acc = bankAccountById(bankAccountId);
    if (!acc) throw new Error('Pilih rekening bank');
    var date = opts.date || (line && line.date) || today();
    var amount = round2(opts.amount != null && opts.amount !== '' ? opts.amount : lineAmount(line));
    if (!(amount > 0)) throw new Error('Jumlah wajib diisi');
    var desc = String(
      opts.description != null ? opts.description : (line && line.description) || ''
    ).trim();
    var income = type.kind === 'income';
    var prefix = income ? 'OD' : 'OP';
    var arr = ensureArr(income ? 'otherDeposits' : 'otherPayments');
    var doc = {
      id: nextDocId(prefix, arr),
      number: docNumber(prefix, date),
      accountNo: bankChargeAccount(opts.type),
      date: date,
      bankAccountId: bankAccountId,
      category: type.category,
      amount: amount,
      method: 'Transfer Bank',
      reference: bs ? bs.id + ' baris ' + (idx + 1) : '',
      notes: type.label + (desc ? ' — ' + desc : ''),
      createdAt: today(),
    };
    doc[income ? 'payer' : 'payee'] = bankPartyName(acc);
    if (bs) {
      doc.bankStatementId = bs.id;
      doc.bankStatementLine = idx;
      if (!bs.reconciled) bs.reconciled = {};
      if (!bs.matches) bs.matches = {};
      bs.reconciled[idx] = true;
      bs.matches[idx] = { docType: prefix, docId: doc.id };
    }
    arr.push(doc);
    return doc;
  }
  function bankChargeHint(type, bankAccountId) {
    var t = BANK_CHARGE_TYPES[type];
    if (!t) return '';
    if (window.GL && typeof window.GL.ensureChart === 'function') window.GL.ensureChart();
    var bank = accountText(bankGL(bankAccountId)) || 'kas/bank';
    var other = accountText(bankChargeAccount(type));
    return (
      (t.kind === 'income' ? 'Dicatat di Penerimaan Lain' : 'Dicatat di Pengeluaran Lain') +
      ' (kategori ' +
      t.category +
      '). Jurnal: ' +
      (t.kind === 'income'
        ? bank + ' di debit, ' + other + ' di kredit.'
        : other + ' di debit, ' + bank + ' di kredit.')
    );
  }
  // Dialog for a bank charge or interest, from a statement line (bank account,
  // date, amount and description prefilled) or on its own.
  function bankChargeModal(statementId, lineIndex, accountId) {
    var bs = findStatement(statementId);
    var idx = bs && lineIndex != null && lineIndex !== '' ? parseInt(lineIndex, 10) : null;
    var line = bs && idx != null && bs.entries ? bs.entries[idx] || null : null;
    var side = lineSide(line);
    var typeOpts = BANK_CHARGE_ORDER.filter(function (t) {
      return !side || BANK_CHARGE_TYPES[t].kind === side;
    })
      .map(function (t) {
        return '<option value="' + t + '">' + esc(BANK_CHARGE_TYPES[t].label) + '</option>';
      })
      .join('');
    var amount = line ? lineAmount(line) : '';
    modal(
      'Catat Biaya / Bunga Bank',
      (line
        ? '<div class="notice notice-info">Baris rekening koran ' +
          esc(bs.id) +
          ': ' +
          esc(line.date) +
          ' · ' +
          esc(line.description) +
          ' · ' +
          (side === 'income' ? 'Kredit ' : 'Debit ') +
          money(amount) +
          '</div>'
        : '') +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="bc-bank">Rekening Bank</label><select class="form-select" id="bc-bank"' +
        (line ? ' disabled' : '') +
        '>' +
        bankAccountOpts(line ? bs.accountId : accountId) +
        '</select></div>' +
        '<div class="form-group"><label class="form-label" for="bc-type">Jenis</label><select class="form-select" id="bc-type">' +
        typeOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="bc-date">Tanggal</label><input class="form-input" id="bc-date" type="date" value="' +
        esc((line && line.date) || today()) +
        '"></div>' +
        '<div class="form-group"><label class="form-label" for="bc-amount">Jumlah (Rp)</label><input class="form-input" id="bc-amount" type="number" min="0" step="any" placeholder="0" value="' +
        esc(amount) +
        '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label" for="bc-desc">Keterangan</label><input class="form-input" id="bc-desc" placeholder="Mis. biaya administrasi bulanan" value="' +
        esc(line ? line.description : '') +
        '"></div>' +
        '<div class="form-hint" id="bc-hint"></div>',
      '<button class="btn" id="saveBC">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveBC');
      var typeSel = document.getElementById('bc-type');
      var bankSel = document.getElementById('bc-bank');
      var hint = document.getElementById('bc-hint');
      if (!btn || !typeSel || !bankSel) return;
      var refreshHint = function () {
        if (hint) hint.textContent = bankChargeHint(typeSel.value, bankSel.value);
      };
      typeSel.addEventListener('change', refreshHint);
      bankSel.addEventListener('change', refreshHint);
      refreshHint();
      btn.addEventListener('click', function () {
        var doc;
        try {
          doc = recordBankCharge({
            type: typeSel.value,
            bankAccountId: bankSel.value,
            date: document.getElementById('bc-date').value,
            amount: numOrNull(document.getElementById('bc-amount').value),
            description: document.getElementById('bc-desc').value,
            statementId: line ? bs.id : null,
            lineIndex: line ? idx : null,
          });
        } catch (err) {
          toast(err && err.message ? err.message : 'Gagal mencatat', 'warning');
          return;
        }
        if (line) _reconcileId = bs.id;
        save();
        closeM();
        toast(
          BANK_CHARGE_TYPES[typeSel.value].label + ' dicatat: ' + (doc.number || doc.id),
          'success'
        );
        openBankReconcile();
      });
    }, 60);
  }

  function openBankReconcile() {
    var statements = ensureArr('bankStatements');
    var accounts = getBankAccounts();
    if (window.GL && typeof window.GL.ensureChart === 'function') window.GL.ensureChart();

    if (!statements.length) {
      injectView(
        '<div class="sec-hdr"><div><h1>Rekonsiliasi Bank</h1></div>' +
          '<div><button class="btn-ghost" data-action="bxChargeNew">Catat biaya bank</button>' +
          '<button class="btn" data-action="addBS">+ Input Rekening Koran</button></div></div>' +
          '<div class="card" style="text-align:center;padding:40px">' +
          '<div style="font-size:.9375rem;font-weight:600;margin-bottom:6px">Belum ada rekening koran</div>' +
          '<div style="font-size:.8125rem;color:var(--muted);margin-bottom:16px">Input rekening koran bank untuk mencocokkannya dengan buku besar.</div>' +
          '<button class="btn" data-action="addBS">+ Input Rekening Koran</button></div>'
      );
      return;
    }

    var latestBS = findStatement(_reconcileId) || statements[statements.length - 1];
    var acc = accounts.find(function (a) {
      return a.id === latestBS.accountId;
    });
    var bsEntries = latestBS.entries || [];
    var reconciled = latestBS.reconciled || {};
    var matches = latestBS.matches || {};
    var sum = reconcileSummary(latestBS);

    var bsRows =
      bsEntries
        .map(function (e, i) {
          var isRec = reconciled[i];
          var doc = linkedDoc(matches[i]);
          var side = lineSide(e);
          var recorded = doc
            ? '<span class="badge badge-success">' + esc(doc.number || doc.id) + '</span>'
            : !isRec && side
              ? '<button class="btn-ghost btn-sm" data-action="bxChargeFromLine" data-bsid="' +
                esc(latestBS.id) +
                '" data-idx="' +
                i +
                '">' +
                (side === 'income' ? 'Catat bunga' : 'Catat biaya') +
                '</button>'
              : '<span class="t-muted">—</span>';
          return (
            '<tr style="' +
            (isRec ? 'opacity:.55' : '') +
            '">' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(e.date) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(e.description) +
            '</td>' +
            '<td class="td-p t-num">' +
            (e.debit ? money(e.debit) : '—') +
            '</td>' +
            '<td class="td-p t-num">' +
            (e.credit ? money(e.credit) : '—') +
            '</td>' +
            '<td class="td-p">' +
            recorded +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<input type="checkbox" data-action="reconcileToggle" data-bsid="' +
            esc(latestBS.id) +
            '" data-idx="' +
            i +
            '"' +
            (isRec ? ' checked' : '') +
            '>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--muted)">Tidak ada baris.</td></tr>';

    var reconciledCount = Object.keys(reconciled).filter(function (k) {
      return reconciled[k];
    }).length;
    var pct = bsEntries.length ? Math.round((reconciledCount / bsEntries.length) * 100) : 0;

    var stmtOpts = statements
      .slice()
      .reverse()
      .map(function (s) {
        var a = accounts.find(function (x) {
          return x.id === s.accountId;
        });
        return (
          '<option value="' +
          esc(s.id) +
          '"' +
          (s.id === latestBS.id ? ' selected' : '') +
          '>' +
          esc(s.id + ' — ' + (a ? a.name : s.accountId) + ' — ' + periodLabel(s.period)) +
          '</option>'
        );
      })
      .join('');

    var notice;
    if (sum.difference == null) {
      notice =
        '<div class="notice notice-info">Isi saldo akhir rekening koran untuk membandingkannya dengan saldo buku besar.</div>';
    } else if (sum.balanced) {
      notice =
        '<div class="notice notice-success">Saldo buku besar sama dengan rekening koran per ' +
        esc(dateLabel(sum.periodEnd)) +
        '.</div>';
    } else {
      notice =
        '<div class="notice notice-warning">Selisih ' +
        money(Math.abs(sum.difference)) +
        ': ' +
        (sum.difference < 0
          ? 'saldo rekening koran lebih kecil dari buku besar — biasanya biaya admin, biaya transfer atau pajak bunga yang belum dicatat.'
          : 'saldo rekening koran lebih besar dari buku besar — biasanya bunga atau penerimaan yang belum dicatat.') +
        ' Catat dari baris rekening koran di bawah atau lewat tombol Catat biaya bank.</div>';
    }
    if (sum.sharedWith.length) {
      notice +=
        '<div class="notice notice-info">Akun ' +
        esc(accountText(sum.accountNo)) +
        ' juga dipakai rekening ' +
        esc(sum.sharedWith.join(', ')) +
        ', jadi saldo buku besar mencakup rekening tersebut.</div>';
    }

    injectView(
      '<div class="sec-hdr"><div><h1>Rekonsiliasi Bank</h1></div>' +
        '<div>' +
        (statements.length > 1
          ? '<select class="form-select" data-action="bxReconcileSel" aria-label="Rekening koran" style="width:auto;min-width:14rem">' +
            stmtOpts +
            '</select>'
          : '') +
        '<button class="btn-ghost" data-action="bxChargeNew" data-account="' +
        esc(latestBS.accountId) +
        '">Catat biaya bank</button>' +
        '<button class="btn" data-action="addBS">+ Input Rekening Koran</button></div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
        '<div><div class="bank-sub">Rekening</div><div>' +
        esc(acc ? acc.name : latestBS.accountId) +
        '</div></div>' +
        '<div><div class="bank-sub">Periode</div><div>' +
        esc(latestBS.period) +
        '</div></div>' +
        '<div><div class="bank-sub">Progress</div><div>' +
        reconciledCount +
        '/' +
        bsEntries.length +
        ' (' +
        pct +
        '%)</div></div>' +
        '<div style="flex:1;min-width:160px"><div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;background:var(--success);width:' +
        pct +
        '%"></div></div></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:14px">' +
        '<div style="min-width:14rem"><label class="form-label" for="rc-closing">Saldo akhir rekening koran (Rp)</label>' +
        '<input class="form-input" id="rc-closing" type="number" step="any" value="' +
        (isNum(latestBS.closingBalance) ? esc(latestBS.closingBalance) : '') +
        '" placeholder="' +
        esc(sum.statementBalance != null ? sum.statementBalance : 'Sesuai rekening koran') +
        '"></div>' +
        '<button class="btn-ghost" data-action="bxSaveClosing" data-bsid="' +
        esc(latestBS.id) +
        '">Simpan saldo</button></div>' +
        '</div>' +
        statRowHTML([
          {
            label: 'Saldo rekening koran',
            value: sum.statementBalance == null ? '—' : money(sum.statementBalance),
            sub: 'Per ' + dateLabel(sum.periodEnd),
          },
          {
            label: 'Saldo buku besar',
            value: sum.ledgerBalance == null ? '—' : money(sum.ledgerBalance),
            sub: sum.accountNo ? accountText(sum.accountNo) : 'Akun buku besar tidak ditemukan',
          },
          {
            label: 'Selisih',
            value: sum.difference == null ? '—' : money(sum.difference),
            sub:
              sum.difference == null
                ? 'Saldo akhir belum diisi'
                : sum.balanced
                  ? 'Seimbang'
                  : 'Belum seimbang',
            color: sum.difference == null ? '' : sum.balanced ? 'var(--success)' : 'var(--warning)',
          },
        ]) +
        notice +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th>Tanggal</th><th>Keterangan Bank</th>' +
        '<th class="t-num">Debit</th><th class="t-num">Kredit</th>' +
        '<th>Dicatat</th>' +
        '<th style="text-align:center">Cocok ✓</th></tr></thead>' +
        '<tbody>' +
        bsRows +
        '</tbody></table></div>' +
        statementsCardHTML(statements, accounts)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      case 'addOP':
        addOPModal();
        break;
      case 'delOP': {
        window.ask('Hapus pengeluaran ini?', 'Jurnal kas/bank dan beban untuk transaksi ini ikut dihapus.', { ok: 'Hapus', danger: true }).then(function (ok) {
          if (!ok) return;
          var removedOP = removeById(ensureArr('otherPayments'), id);
          if (!removedOP) return;
          unlinkStatementLine(removedOP);
          save();
          toast('Dihapus', 'success');
          openOtherPayment();
        });
        break;
      }
      case 'addOD':
        addODModal();
        break;
      case 'delOD': {
        window.ask('Hapus penerimaan ini?', 'Jurnal kas/bank dan pendapatan untuk transaksi ini ikut dihapus.', { ok: 'Hapus', danger: true }).then(function (ok) {
          if (!ok) return;
          var removedOD = removeById(ensureArr('otherDeposits'), id);
          if (!removedOD) return;
          unlinkStatementLine(removedOD);
          save();
          toast('Dihapus', 'success');
          openOtherDeposit();
        });
        break;
      }
      case 'addBT':
        addBTModal();
        break;
      case 'delBT': {
        window.ask('Hapus transfer ini?', 'Jurnal transfer antar rekening ikut dihapus.', { ok: 'Hapus', danger: true }).then(function (ok) {
          if (!ok) return;
          if (!removeById(ensureArr('bankTransfers'), id)) return;
          save();
          toast('Dihapus', 'success');
          openBankTransfer();
        });
        break;
      }
      case 'addBS':
        addBSModal();
        break;
      case 'addBSLine': {
        var wrap = document.getElementById('bs-lines-wrap');
        if (wrap) {
          var d = document.createElement('div');
          d.innerHTML = _bsLineHTML();
          wrap.appendChild(d.firstChild);
        }
        break;
      }
      case 'delBSLine': {
        var row = btn.closest('.bs-row');
        if (row) row.remove();
        break;
      }
      case 'viewBS': {
        var s = ensureArr('bankStatements').find(function (x) {
          return x.id === id;
        });
        if (!s) break;
        var eRows = (s.entries || [])
          .map(function (e) {
            return (
              '<tr><td class="td-p" style="font-size:.75rem">' +
              esc(e.date) +
              '</td><td class="td-p">' +
              esc(e.description) +
              '</td><td class="td-p t-num">' +
              (e.debit ? money(e.debit) : '—') +
              '</td><td class="td-p t-num">' +
              (e.credit ? money(e.credit) : '—') +
              '</td></tr>'
            );
          })
          .join('');
        modal(
          'Rekening Koran — ' + s.id,
          '<table style="width:100%;border-collapse:collapse"><thead><tr><th>Tanggal</th><th>Keterangan</th><th class="t-num">Debit</th><th class="t-num">Kredit</th></tr></thead><tbody>' +
            eRows +
            '</tbody></table>',
          '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
          true
        );
        break;
      }
      case 'delBS': {
        window.ask('Hapus rekening koran ini?', '', { ok: 'Hapus', danger: true }).then(function (ok) {
          if (!ok) return;
          if (!removeById(ensureArr('bankStatements'), id)) return;
          if (_reconcileId === id) _reconcileId = null;
          save();
          toast('Dihapus', 'success');
          openBankReconcile();
        });
        break;
      }
      case 'goToBankStatement':
        openBankReconcile();
        break;
      case 'bxHistoryPage':
        showBankHistoryPage(Number(btn.dataset.val) || 1);
        break;
      case 'bxExport':
        exportRecap(btn.dataset.kind);
        break;
      case 'bxReconcileOpen':
        _reconcileId = id;
        openBankReconcile();
        break;
      case 'bxChargeFromLine':
        bankChargeModal(btn.dataset.bsid, btn.dataset.idx);
        break;
      case 'bxChargeNew':
        bankChargeModal(null, null, btn.dataset.account);
        break;
      case 'bxSaveClosing': {
        var stmt = findStatement(btn.dataset.bsid);
        var closingInput = document.getElementById('rc-closing');
        if (!stmt || !closingInput) break;
        stmt.closingBalance = numOrNull(closingInput.value);
        save();
        toast('Saldo akhir disimpan', 'success');
        _reconcileId = stmt.id;
        openBankReconcile();
        break;
      }
      case 'reconcileToggle': {
        var bsId = btn.dataset.bsid;
        var idx = parseInt(btn.dataset.idx);
        var bs = ensureArr('bankStatements').find(function (x) {
          return x.id === bsId;
        });
        if (bs) {
          if (!bs.reconciled) bs.reconciled = {};
          bs.reconciled[idx] = btn.checked;
          save();
        }
        break;
      }
    }
  });

  // Selects on these pages (period, statement) re-render on change.
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.action === 'bxPeriod' && KINDS[el.dataset.kind]) {
      _period[el.dataset.kind] = el.value || 'all';
      if (el.dataset.kind === 'expense') openOtherPayment();
      else openOtherDeposit();
    } else if (el.dataset.action === 'bxReconcileSel') {
      _reconcileId = el.value;
      openBankReconcile();
    }
  });

  function removeById(arr, id) {
    var i = arr.findIndex(function (x) {
      return x.id === id;
    });
    return i === -1 ? null : arr.splice(i, 1)[0];
  }

  window._bankExtras = {
    openOtherPayment: openOtherPayment,
    openOtherDeposit: openOtherDeposit,
    openBankTransfer: openBankTransfer,
    openSmartLink: openSmartLink,
    openBankStatement: openBankStatement,
    openBankHistory: openBankHistory,
    openBankReconcile: openBankReconcile,
    // Pure helpers (tests, other modules): categories, period recap, Excel sheets,
    // bank charges and the statement-vs-ledger comparison.
    categories: { expense: PAY_CATS.slice(), income: DEP_CATS.slice() },
    normCategory: normCategory,
    defaultAccountFor: defaultAccountFor,
    recapByCategory: recapByCategory,
    buildRecapSheets: buildRecapSheets,
    recapFileName: recapFileName,
    BANK_CHARGE_TYPES: BANK_CHARGE_TYPES,
    recordBankCharge: recordBankCharge,
    statementBalance: statementBalance,
    ledgerBalance: ledgerBalance,
    reconcileSummary: reconcileSummary,
  };
  console.log('[BankExtras] Bank extras ready');
})();
