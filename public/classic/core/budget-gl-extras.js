// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Budget & GL Extras  (budget-gl-extras.js)
// Implements: Budget, Budget Monitor, Budget Transfer, Account History,
//             Expense Accrual, Employee Payroll
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function db() {
    return window.DB || {};
  }
  function save() {
    if (typeof window.saveDB === 'function') window.saveDB();
  }
  function toast(m, t) {
    if (typeof window.showToast === 'function') window.showToast(m, t);
  }
  function modal(t, b, f, w) {
    if (typeof window.openModal === 'function') window.openModal(t, b, f, w);
  }
  function closeM() {
    if (typeof window.closeModal === 'function') window.closeModal();
  }
  function nav(v) {
    if (typeof window.navigate === 'function') window.navigate(v);
  }
  function today() {
    var d = new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }
  function uid(prefix) {
    return (
      prefix +
      '-' +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).substr(2, 4).toUpperCase()
    );
  }
  function thisMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function ensureArr(key) {
    if (!Array.isArray(db()[key])) db()[key] = [];
    return db()[key];
  }

  function accountOptions() {
    return (db().accountsChart || [])
      .map(function (a) {
        var code = a.no || a.code || '';
        return (
          '<option value="' + esc(code) + '">' + esc(code) + ' — ' + esc(a.name) + '</option>'
        );
      })
      .join('');
  }

  function injectView(hostView, html) {
    if (window.activeView !== hostView) nav(hostView);
    var el = document.getElementById('view-' + hostView);
    if (!el) {
      nav(hostView);
      el = document.getElementById('view-' + hostView);
    }
    if (el) el.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 1  BUDGET
  // ══════════════════════════════════════════════════════════════════════════════
  // One page for the budget: each line with its realisasi from the ledger,
  // a period filter, Transfer Anggaran and the transfer history. The menu labels
  // Realisasi Anggaran and Transfer Anggaran open this page.
  var budgetFilter = { from: '', to: '' };

  function budgetLineRow(b) {
    var actual = Math.abs(calcActualForAccount(b.accountCode, b.period, b.period));
    var amount = b.amount || 0;
    var variance = amount - actual;
    var pct = amount > 0 ? Math.round((actual / amount) * 100) : 0;
    // The bar shows the status (red over budget, amber above 80%); the figures
    // stay plain except an overspent variance.
    var color = pct > 100 ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--success)';
    var pctClass = pct > 100 ? ' fin-neg' : pct > 80 ? ' budget-warn' : '';
    return {
      actual: actual,
      over: amount > 0 && actual > amount,
      html:
        '<tr>' +
        '<td class="td-p">' +
        esc(b.accountCode) +
        ' — ' +
        esc(b.accountName) +
        (b.notes
          ? '<div style="font-size:.75rem;color:var(--muted)">' + esc(b.notes) + '</div>'
          : '') +
        '</td>' +
        '<td class="td-p">' +
        esc(b.period) +
        '</td>' +
        '<td class="td-p t-num">' +
        money(amount) +
        '</td>' +
        '<td class="td-p t-num">' +
        money(actual) +
        '</td>' +
        '<td class="td-p t-num' +
        (variance < 0 ? ' fin-neg' : '') +
        '">' +
        money(variance) +
        '</td>' +
        '<td class="td-p"><div style="display:flex;align-items:center;gap:8px">' +
        '<div style="flex:1;min-width:60px;height:8px;background:var(--surface-sunken);border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' +
        Math.min(pct, 100) +
        '%;background:' +
        color +
        ';border-radius:4px"></div></div>' +
        '<span class="budget-pct' +
        pctClass +
        '">' +
        pct +
        '%</span></div></td>' +
        '<td class="td-p" style="white-space:nowrap">' +
        '<button class="action-ghost" data-action="editBudget" data-id="' +
        esc(b.id) +
        '">Edit</button> ' +
        '<button class="action-ghost" data-action="delBudget" data-id="' +
        esc(b.id) +
        '" style="color:var(--danger)">Hapus</button>' +
        '</td>' +
        '</tr>',
    };
  }

  function openBudget() {
    var budgets = ensureArr('budgets');
    var transfers = ensureArr('budgetTransfers');
    var lines = budgets.filter(function (b) {
      if (budgetFilter.from && b.period < budgetFilter.from) return false;
      if (budgetFilter.to && b.period > budgetFilter.to) return false;
      return true;
    });
    var totalBudget = 0;
    var totalActual = 0;
    var overBudget = 0;
    var rows = lines
      .slice()
      .reverse()
      .map(function (b) {
        var r = budgetLineRow(b);
        totalBudget += b.amount || 0;
        totalActual += r.actual;
        if (r.over) overBudget++;
        return r.html;
      })
      .join('');
    var totalVariance = totalBudget - totalActual;
    var totalPct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
    var footer = rows
      ? '<tfoot><tr class="budget-total">' +
        '<td class="td-p" colspan="2">TOTAL</td>' +
        '<td class="td-p t-num">' +
        money(totalBudget) +
        '</td>' +
        '<td class="td-p t-num">' +
        money(totalActual) +
        '</td>' +
        '<td class="td-p t-num' +
        (totalVariance < 0 ? ' fin-neg' : '') +
        '">' +
        money(totalVariance) +
        '</td>' +
        '<td class="td-p">' +
        totalPct +
        '%</td><td></td>' +
        '</tr></tfoot>'
      : '';

    var plus =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ';
    var header =
      '<div class="sec-hdr"><div><h1>Anggaran</h1></div><div>' +
      (budgets.length > 1
        ? '<button class="btn-ghost" data-action="newBudgetTransfer">Transfer Anggaran</button>'
        : '') +
      '<button class="btn" data-action="addBudget">' +
      plus +
      'Tambah Anggaran</button></div></div>';

    var stats =
      budgets.length && typeof window.statRow === 'function'
        ? window.statRow([
            {
              label: 'Anggaran',
              value: money(totalBudget),
              sub: lines.length + ' baris anggaran',
            },
            { label: 'Realisasi', value: money(totalActual), sub: 'Dari jurnal buku besar' },
            {
              label: 'Melebihi anggaran',
              value: String(overBudget),
              sub: 'Baris di atas anggaran',
              color: overBudget > 0 ? 'var(--danger)' : '',
            },
          ])
        : '';

    var filterBar = budgets.length
      ? '<div class="fin-period" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">' +
        '<div><label class="form-label" for="bva-from">Periode dari</label>' +
        '<input class="form-input" id="bva-from" type="month" value="' +
        esc(budgetFilter.from) +
        '" style="width:160px"></div>' +
        '<div><label class="form-label" for="bva-to">Sampai</label>' +
        '<input class="form-input" id="bva-to" type="month" value="' +
        esc(budgetFilter.to) +
        '" style="width:160px"></div>' +
        '<button class="btn-ghost" data-action="bvaFilter">Terapkan</button>' +
        (budgetFilter.from || budgetFilter.to
          ? '<button class="btn-ghost" data-action="bvaReset">Reset</button>'
          : '') +
        '</div>'
      : '';

    var table =
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Akun</th><th>Periode</th><th style="text-align:right">Anggaran</th>' +
      '<th style="text-align:right">Realisasi</th><th style="text-align:right">Selisih</th>' +
      '<th>Pencapaian</th><th></th></tr></thead>' +
      '<tbody>' +
      (rows ||
        '<tr><td colspan="7" class="td-empty">' +
        (budgets.length
          ? 'Tidak ada anggaran pada periode ini.'
          : 'Belum ada anggaran. Klik Tambah Anggaran.') +
        '</td></tr>') +
      '</tbody>' +
      footer +
      '</table></div></div>';

    var transferRows = transfers
      .slice()
      .reverse()
      .slice(0, 20)
      .map(function (t) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(t.date) +
          '</td>' +
          '<td class="td-p">' +
          esc(t.fromAccount) +
          '</td>' +
          '<td class="td-p">' +
          esc(t.toAccount) +
          '</td>' +
          '<td class="td-p t-num">' +
          money(t.amount) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
          esc(t.notes || '—') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    var transferCard = transferRows
      ? '<div class="card"><div class="card-head"><div class="card-title">Riwayat transfer anggaran</div></div>' +
        '<div class="table-wrap"><table style="width:100%">' +
        '<thead><tr><th>Tanggal</th><th>Dari</th><th>Ke</th><th style="text-align:right">Jumlah</th><th>Catatan</th></tr></thead>' +
        '<tbody>' +
        transferRows +
        '</tbody></table></div></div>'
      : '';

    injectView('finance', header + stats + filterBar + table + transferCard);
  }

  function addBudgetModal(existing) {
    var b = existing || {};
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Akun<select id="bg-account" class="form-select" style="width:100%;margin-top:4px">' +
      accountOptions() +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Periode (YYYY-MM)<input id="bg-period" class="form-input" type="month" value="' +
      esc(b.period || thisMonth()) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Jumlah Anggaran<input id="bg-amount" class="form-input" type="number" min="0" value="' +
      (b.amount || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Catatan<input id="bg-notes" class="form-input" value="' +
      esc(b.notes || '') +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Budget' : 'Tambah Budget',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="bg-save">Simpan</button>',
      false
    );

    if (b.accountCode) {
      setTimeout(function () {
        var sel = document.getElementById('bg-account');
        if (sel) sel.value = b.accountCode;
      }, 50);
    }

    setTimeout(function () {
      var btn = document.getElementById('bg-save');
      if (btn)
        btn.addEventListener('click', function () {
          var acSel = document.getElementById('bg-account');
          var code = acSel.value;
          var acOpt = acSel.options[acSel.selectedIndex];
          var name = acOpt ? acOpt.textContent.split(' — ')[1] || '' : '';
          var period = document.getElementById('bg-period').value;
          var amount = parseFloat(document.getElementById('bg-amount').value) || 0;
          var notes = document.getElementById('bg-notes').value.trim();

          if (!code || !period) {
            toast('Akun dan periode wajib diisi', 'warning');
            return;
          }

          var arr = ensureArr('budgets');
          if (existing) {
            var idx = arr.findIndex(function (x) {
              return x.id === existing.id;
            });
            if (idx >= 0) {
              arr[idx] = Object.assign(arr[idx], {
                accountCode: code,
                accountName: name.trim(),
                period: period,
                amount: amount,
                notes: notes,
              });
            }
          } else {
            arr.push({
              id: uid('BDG'),
              accountCode: code,
              accountName: name.trim(),
              period: period,
              amount: amount,
              notes: notes,
              createdAt: today(),
            });
          }
          save();
          closeM();
          toast(existing ? 'Budget diperbarui' : 'Budget ditambahkan', 'success');
          openBudget();
        });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 2  BUDGET VS ACTUAL REPORT
  // ══════════════════════════════════════════════════════════════════════════════

  function calcActualForAccount(accountCode, periodFrom, periodTo) {
    var journals = db().journals || [];
    var total = 0;
    journals.forEach(function (j) {
      if (!j.date) return;
      var jPeriod = j.date.substring(0, 7);
      if (periodFrom && jPeriod < periodFrom) return;
      if (periodTo && jPeriod > periodTo) return;
      (j.lines || []).forEach(function (l) {
        if ((l.accountNo || '') === accountCode) {
          total += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        }
      });
    });
    return total;
  }

  function openBudgetMonitor() {
    openBudget();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 3  BUDGET TRANSFER
  // ══════════════════════════════════════════════════════════════════════════════
  function openBudgetTransfer() {
    openBudget();
  }

  function budgetTransferModal() {
    var budgets = ensureArr('budgets');
    var opts = budgets
      .map(function (b) {
        return (
          '<option value="' +
          esc(b.id) +
          '">' +
          esc(b.accountCode) +
          ' — ' +
          esc(b.accountName) +
          ' (' +
          esc(b.period) +
          ') — Sisa: ' +
          money(b.amount) +
          '</option>'
        );
      })
      .join('');

    if (budgets.length < 2) {
      toast('Minimal 2 budget diperlukan untuk transfer', 'warning');
      return;
    }

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Dari Budget<select id="bt-from" class="form-select" style="width:100%;margin-top:4px">' +
      opts +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Ke Budget<select id="bt-to" class="form-select" style="width:100%;margin-top:4px">' +
      opts +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Jumlah<input id="bt-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Catatan<input id="bt-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Transfer Anggaran',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="bt-save">Transfer</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('bt-save').addEventListener('click', function () {
        var fromId = document.getElementById('bt-from').value;
        var toId = document.getElementById('bt-to').value;
        var amount = parseFloat(document.getElementById('bt-amount').value) || 0;
        var notes = document.getElementById('bt-notes').value.trim();

        if (fromId === toId) {
          toast('Akun asal dan tujuan harus berbeda', 'warning');
          return;
        }
        if (amount <= 0) {
          toast('Jumlah harus lebih dari 0', 'warning');
          return;
        }

        var budgets = ensureArr('budgets');
        var from = budgets.find(function (b) {
          return b.id === fromId;
        });
        var to = budgets.find(function (b) {
          return b.id === toId;
        });
        if (!from || !to) {
          toast('Budget tidak ditemukan', 'danger');
          return;
        }
        if (from.amount < amount) {
          toast('Saldo budget asal tidak cukup', 'warning');
          return;
        }

        from.amount -= amount;
        to.amount += amount;

        ensureArr('budgetTransfers').push({
          id: uid('BTR'),
          fromBudgetId: fromId,
          fromAccount: from.accountCode + ' — ' + from.accountName,
          toBudgetId: toId,
          toAccount: to.accountCode + ' — ' + to.accountName,
          amount: amount,
          notes: notes,
          date: today(),
        });

        save();
        closeM();
        toast('Transfer anggaran berhasil', 'success');
        openBudget();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 4  ACCOUNT HISTORY
  // ══════════════════════════════════════════════════════════════════════════════
  function openAccountHistory() {
    var accounts = db().accountsChart || [];

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr('Riwayat Akun', '')
        : '<h1>Riwayat Akun</h1>';

    var acOptions = accounts
      .map(function (a) {
        return (
          '<option value="' + esc(a.no || a.code || '') + '">' + esc(a.no || a.code || '') + ' — ' + esc(a.name) + '</option>'
        );
      })
      .join('');

    var html =
      header +
      '<div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<label class="budget-label" for="ah-account">Pilih Akun</label>' +
      '<select id="ah-account" class="form-select" style="min-width:280px">' +
      acOptions +
      '</select>' +
      '<input id="ah-from" type="date" class="form-input" style="width:140px" placeholder="Dari">' +
      '<input id="ah-to" type="date" class="form-input" style="width:140px" placeholder="s/d">' +
      '<button class="btn" data-action="ahFilter" style="font-size:.75rem">Tampilkan</button>' +
      '</div></div>' +
      '<div id="ah-result"></div>';

    injectView('finance', html);
  }

  function filterAccountHistory() {
    var code = document.getElementById('ah-account').value;
    var fromDate = document.getElementById('ah-from').value;
    var toDate = document.getElementById('ah-to').value;
    var journals = db().journals || [];
    var result = document.getElementById('ah-result');
    if (!result) return;

    var filtered = journals.filter(function (j) {
      var lines = j.lines || j.entries || [];
      if (!lines.length) return false;
      var hasAccount = lines.some(function (l) {
        return (l.accountNo || l.accountCode || '') === code;
      });
      if (!hasAccount) return false;
      if (fromDate && j.date < fromDate) return false;
      if (toDate && j.date > toDate) return false;
      return true;
    });

    var runningBalance = 0;
    var rows = filtered
      .sort(function (a, b) {
        return (a.date || '').localeCompare(b.date || '');
      })
      .map(function (j) {
        var lines = (j.lines || j.entries || []).filter(function (l) {
          return (l.accountNo || l.accountCode || '') === code;
        });
        return lines
          .map(function (l) {
            var d = Number(l.debit) || 0;
            var c = Number(l.credit) || 0;
            runningBalance += d - c;
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:.75rem">' +
              esc(j.date) +
              '</td>' +
              '<td class="td-p"><span class="doc-no">' +
              esc(j.number || j.id || '—') +
              '</span></td>' +
              '<td class="td-p" style="font-size:.75rem">' +
              esc(l.memo || j.memo || j.description || '—') +
              '</td>' +
              '<td class="td-p t-num">' +
              (d ? money(d) : '—') +
              '</td>' +
              '<td class="td-p t-num">' +
              (c ? money(c) : '—') +
              '</td>' +
              '<td class="td-p t-num">' +
              money(runningBalance) +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
      })
      .join('');

    var totalDebit = 0, totalCredit = 0;
    filtered.forEach(function (j) {
      (j.lines || j.entries || []).forEach(function (l) {
        if ((l.accountNo || l.accountCode || '') === code) {
          totalDebit += Number(l.debit) || 0;
          totalCredit += Number(l.credit) || 0;
        }
      });
    });

    result.innerHTML =
      '<div class="card"><div class="card-head">' +
      '<div class="card-title">Riwayat Transaksi <span class="t-muted budget-count">(' +
      filtered.length +
      ' jurnal)</span></div>' +
      '<div class="t-muted budget-sm">Saldo: ' +
      money(runningBalance) +
      '</div></div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Tanggal</th><th>No. Jurnal</th><th>Keterangan</th><th style="text-align:right">Debit</th><th style="text-align:right">Kredit</th><th style="text-align:right">Saldo</th></tr></thead>' +
      '<tbody>' +
      (rows ||
        '<tr><td colspan="6" class="td-empty">Tidak ada transaksi untuk akun ini.</td></tr>') +
      '</tbody>' +
      '<tfoot><tr class="budget-total"><td colspan="3">Total</td><td class="t-num">' +
      money(totalDebit) +
      '</td><td class="t-num">' +
      money(totalCredit) +
      '</td><td class="t-num">' +
      money(runningBalance) +
      '</td></tr></tfoot>' +
      '</table></div></div>';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 5  EXPENSE ACCRUAL
  // ══════════════════════════════════════════════════════════════════════════════
  function openExpenseAccrual() {
    var accruals = ensureArr('expenseAccruals');

    var rows = accruals
      .slice()
      .reverse()
      .map(function (a) {
        var statusBadge =
          a.status === 'Posted'
            ? '<span class="badge badge-info">Diposting</span>'
            : '<span class="badge badge-warning">Draft</span>';
        return (
          '<tr>' +
          '<td class="td-p"><span class="doc-no">' +
          esc(a.id) +
          '</span></td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(a.date) +
          '</td>' +
          '<td class="td-p">' +
          esc(a.accountCode) +
          ' — ' +
          esc(a.accountName) +
          '</td>' +
          '<td class="td-p">' +
          esc(a.description) +
          '</td>' +
          '<td class="td-p t-num">' +
          money(a.amount) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          (a.status === 'Draft'
            ? '<button class="action-primary" data-action="postAccrual" data-id="' +
              esc(a.id) +
              '">Posting</button> '
            : '') +
          (a.status === 'Draft'
            ? '<button class="action-ghost" data-action="delAccrual" data-id="' +
              esc(a.id) +
              '" style="color:var(--danger)">Hapus</button>'
            : '<span style="font-size:.75rem;color:var(--muted)">' +
              esc(a.journalNumber || 'Sudah dijurnal') +
              '</span>') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Biaya Akrual',
            'Pencatatan biaya yang belum dibayar',
            'Tambah Akrual',
            'addAccrual'
          )
        : '<h1>Expense Accrual</h1>';

    var html =
      header +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>Akun Biaya</th><th>Keterangan</th><th style="text-align:right">Jumlah</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada biaya akrual.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('finance', html);
  }

  function addAccrualModal() {
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Tanggal<input id="ac-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Akun Biaya<select id="ac-account" class="form-select" style="width:100%;margin-top:4px">' +
      accountOptions() +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Keterangan<input id="ac-desc" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Jumlah<input id="ac-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Akun Hutang (kredit)<select id="ac-credit" class="form-select" style="width:100%;margin-top:4px">' +
      accountOptions() +
      '</select></label>' +
      '</div>';

    modal(
      'Tambah Biaya Akrual',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="ac-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('ac-save').addEventListener('click', function () {
        var date = document.getElementById('ac-date').value;
        var acSel = document.getElementById('ac-account');
        var code = acSel.value;
        var name = acSel.options[acSel.selectedIndex]
          ? acSel.options[acSel.selectedIndex].textContent.split(' — ')[1] || ''
          : '';
        var desc = document.getElementById('ac-desc').value.trim();
        var amount = parseFloat(document.getElementById('ac-amount').value) || 0;
        var crSel = document.getElementById('ac-credit');
        var crCode = crSel.value;
        var crName = crSel.options[crSel.selectedIndex]
          ? crSel.options[crSel.selectedIndex].textContent.split(' — ')[1] || ''
          : '';

        if (!desc || amount <= 0) {
          toast('Keterangan dan jumlah wajib diisi', 'warning');
          return;
        }

        ensureArr('expenseAccruals').push({
          id: uid('ACR'),
          date: date,
          accountCode: code,
          accountName: name.trim(),
          creditAccountCode: crCode,
          creditAccountName: crName.trim(),
          description: desc,
          amount: amount,
          status: 'Draft',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Biaya akrual ditambahkan', 'success');
        openExpenseAccrual();
      });
    }, 60);
  }

  function postAccrual(id) {
    var arr = ensureArr('expenseAccruals');
    var ac = arr.find(function (a) {
      return a.id === id;
    });
    if (!ac) return;

    if (window.GL && typeof window.GL.postJournalVoucher === 'function') {
      try {
        var jv = window.GL.postJournalVoucher(ac.date, [
          { accountNo: ac.accountCode, debit: ac.amount, memo: 'Akrual: ' + ac.description },
          { accountNo: ac.creditAccountCode, credit: ac.amount, memo: 'Akrual: ' + ac.description },
        ], 'Akrual: ' + ac.description);
        ac.journalNumber = jv && jv.number;
      } catch (err) {
        toast('Gagal posting: ' + err.message, 'error');
        return;
      }
    }
    ac.status = 'Posted';
    save();
    toast('Akrual diposting ke jurnal', 'success');
    openExpenseAccrual();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 6  EMPLOYEE PAYROLL
  // ══════════════════════════════════════════════════════════════════════════════
  function openPayroll() {
    var employees = ensureArr('employees');
    var payrollRuns = ensureArr('payrollRuns');

    var empRows = employees
      .map(function (e) {
        var gross = (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
        return (
          '<tr>' +
          '<td class="td-p"><span class="doc-no">' +
          esc(e.id) +
          '</span></td>' +
          '<td class="td-p">' +
          esc(e.name) +
          '</td>' +
          '<td class="td-p">' +
          esc(e.position || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(e.salary) +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(e.transportAllowance || 0) +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(e.mealAllowance || 0) +
          '</td>' +
          '<td class="td-p t-num">' +
          money(gross) +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editEmployee" data-id="' +
          esc(e.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delEmployee" data-id="' +
          esc(e.id) +
          '" style="color:var(--danger)">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var recentRuns = payrollRuns
      .slice()
      .reverse()
      .slice(0, 10)
      .map(function (r) {
        var statusBadge;
        if (r.paid) {
          statusBadge = '<span class="badge badge-success">Dibayar</span>';
        } else if (r.posted) {
          statusBadge = '<span class="badge badge-info">Diposting</span>';
        } else {
          statusBadge = '<span class="badge badge-neutral">Draft</span>';
        }
        var actions = '';
        if (!r.posted) {
          actions += '<button class="action-ghost" data-action="postPayroll" data-id="' + esc(r.id) + '">Posting ke Jurnal</button> ';
        }
        if (r.posted && !r.paid) {
          actions += '<button class="action-ghost" data-action="payPayroll" data-id="' + esc(r.id) + '">Bayar</button> ';
        }
        return (
          '<tr>' +
          '<td class="td-p"><span class="doc-no">' +
          esc(r.id) +
          '</span></td>' +
          '<td class="td-p">' +
          esc(r.period) +
          '</td>' +
          '<td class="td-p">' +
          r.employeeCount +
          ' karyawan</td>' +
          '<td class="td-p t-num">' +
          money(r.totalAmount) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(r.date) +
          '</td>' +
          '<td class="td-p">' + statusBadge + '</td>' +
          '<td class="td-p">' + actions + '</td>' +
          '</tr>'
        );
      })
      .join('');

    var totalPayroll = employees.reduce(function (s, e) {
      return s + (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
    }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr('Penggajian', '', 'Tambah Karyawan', 'addEmployee')
        : '<h1>Penggajian</h1>';

    var postedCount = payrollRuns.filter(function (r) { return r.posted; }).length;
    var paidCount = payrollRuns.filter(function (r) { return r.paid; }).length;
    var unpaidPosted = postedCount - paidCount;

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Karyawan', value: String(employees.length), sub: 'Terdaftar aktif' },
            {
              label: 'Total Gaji/bln',
              value: money(totalPayroll),
              sub: 'Gaji + tunjangan',
            },
            { label: 'Proses Gaji', value: String(payrollRuns.length), sub: postedCount + ' diposting, ' + paidCount + ' dibayar' },
            { label: 'Belum Bayar', value: String(unpaidPosted), sub: 'Diposting, belum dibayar', color: unpaidPosted > 0 ? 'var(--warning)' : '' },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card" style="margin-bottom:14px"><div class="card-head">' +
      '<div class="card-title">Data Karyawan</div></div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Nama</th><th>Jabatan</th><th style="text-align:right">Gaji Pokok</th><th style="text-align:right">T. Transport</th><th style="text-align:right">T. Makan</th><th style="text-align:right">Total</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (empRows || '<tr><td colspan="8" class="td-empty">Belum ada data karyawan.</td></tr>') +
      '</tbody>' +
      '</table></div></div>' +
      '<div class="card"><div class="card-head">' +
      '<div class="card-title">Riwayat Proses Gaji</div>' +
      '<button class="btn" data-action="runPayroll" style="font-size:.75rem">Proses Gaji</button></div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Periode</th><th>Karyawan</th><th style="text-align:right">Total</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (recentRuns || '<tr><td colspan="7" class="td-empty">Belum ada gaji yang diproses.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('finance', html);
  }

  // Penggajian adds and edits employees with the one employee form of Data
  // Master › Karyawan (master-extras.js), which also holds the allowances.
  function addEmployeeModal(existing) {
    if (window._masterExtras && window._masterExtras.employeeForm) {
      window._masterExtras.employeeForm(existing, openPayroll);
    }
  }

  function runPayrollModal() {
    var employees = ensureArr('employees');
    if (employees.length === 0) {
      toast('Belum ada data karyawan', 'warning');
      return;
    }

    var total = employees.reduce(function (s, e) {
      return s + (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
    }, 0);

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Periode<input id="pr-period" class="form-input" type="month" value="' +
      thisMonth() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<div style="background:var(--surface-sunken);border-radius:8px;padding:12px">' +
      '<div style="font-size:.75rem;font-weight:700;margin-bottom:8px">Ringkasan</div>' +
      '<div style="font-size:.75rem">Jumlah karyawan: <strong>' +
      employees.length +
      '</strong></div>' +
      '<div style="font-size:.75rem">Total pembayaran: <strong>' +
      money(total) +
      '</strong></div>' +
      '</div>' +
      '<label style="font-size:.75rem"><input type="checkbox" id="pr-post" checked> Langsung posting ke jurnal</label>' +
      '</div>';

    modal(
      'Proses Gaji',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="pr-run">Proses</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('pr-run').addEventListener('click', function () {
        var period = document.getElementById('pr-period').value;
        var doPost = document.getElementById('pr-post').checked;
        var employees = ensureArr('employees');
        var total = employees.reduce(function (s, e) {
          return s + (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
        }, 0);

        var run = {
          id: uid('PAY'),
          period: period,
          employeeCount: employees.length,
          totalAmount: total,
          date: today(),
          posted: doPost,
          details: employees.map(function (e) {
            return {
              employeeId: e.id,
              name: e.name,
              salary: e.salary,
              transport: e.transportAllowance || 0,
              meal: e.mealAllowance || 0,
            };
          }),
        };
        ensureArr('payrollRuns').push(run);

        save();
        if (doPost && window.GL && typeof window.GL.reconcileAll === 'function') {
          window.GL.reconcileAll();
          save();
        }
        closeM();
        toast('Gaji diproses: ' + money(total) + (doPost ? ' — jurnal diposting' : ' — draft'), 'success');
        openPayroll();
      });
    }, 60);
  }

  function payPayrollModal(run) {
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<div style="background:var(--surface-sunken);border-radius:8px;padding:12px">' +
      '<div style="font-size:.75rem">Proses gaji: <strong>' + esc(run.id) + '</strong></div>' +
      '<div style="font-size:.75rem">Periode: <strong>' + esc(run.period) + '</strong></div>' +
      '<div style="font-size:.75rem">Total: <strong>' + money(run.totalAmount) + '</strong></div>' +
      '</div>' +
      '<label style="font-size:.75rem;font-weight:700">Metode Pembayaran<select id="pp-method" class="form-select" style="width:100%;margin-top:4px">' +
      '<option value="Tunai">Tunai — Kas</option>' +
      '<option value="Transfer BCA">Transfer BCA</option>' +
      '<option value="Transfer Mandiri">Transfer Mandiri</option>' +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Tanggal Bayar<input id="pp-date" class="form-input" type="date" value="' + today() + '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Bayar Gaji',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="pp-save">Bayar</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('pp-save').addEventListener('click', function () {
        var method = document.getElementById('pp-method').value;
        var payDate = document.getElementById('pp-date').value || today();

        var cashAccounts = { 'Tunai': '110101', 'Transfer BCA': '110102', 'Transfer Mandiri': '110103' };
        var cashAcc = cashAccounts[method] || '110101';
        var salaryPayableAcc = '210401';

        if (window.GL && typeof window.GL.postJournalVoucher === 'function') {
          try {
            window.GL.postJournalVoucher(payDate, [
              { accountNo: salaryPayableAcc, debit: run.totalAmount, memo: 'Pembayaran gaji ' + run.period },
              { accountNo: cashAcc, credit: run.totalAmount, memo: 'Bayar via ' + method + ' ' + run.id },
            ], 'Pembayaran gaji ' + run.period + ' (' + run.id + ')');
          } catch (err) {
            toast('Gagal posting jurnal: ' + err.message, 'error');
            return;
          }
        }

        run.paid = true;
        run.paidDate = payDate;
        run.payMethod = method;
        save();
        closeM();
        toast('Gaji ' + run.period + ' dibayar via ' + method + ' — ' + money(run.totalAmount), 'success');
        openPayroll();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      // Budget
      case 'addBudget':
        addBudgetModal();
        break;
      case 'editBudget': {
        var b = ensureArr('budgets').find(function (x) {
          return x.id === id;
        });
        if (b) addBudgetModal(b);
        break;
      }
      case 'delBudget': {
        if (!confirm('Hapus budget ini?')) return;
        var arr = ensureArr('budgets');
        var idx = arr.findIndex(function (x) {
          return x.id === id;
        });
        if (idx >= 0) arr.splice(idx, 1);
        save();
        toast('Budget dihapus', 'success');
        openBudget();
        break;
      }
      // Budget Transfer
      case 'newBudgetTransfer':
        budgetTransferModal();
        break;
      // Account History
      case 'ahFilter':
        filterAccountHistory();
        break;
      // Expense Accrual
      case 'addAccrual':
        addAccrualModal();
        break;
      case 'postAccrual':
        postAccrual(id);
        break;
      case 'delAccrual': {
        var accrual = ensureArr('expenseAccruals').find(function (x) {
          return x.id === id;
        });
        if (accrual && accrual.status === 'Posted') {
          toast(
            'Akrual ini sudah diposting ke jurnal. Koreksi dengan Jurnal Umum (jurnal balik), bukan dengan menghapus.',
            'warning'
          );
          return;
        }
        if (!confirm('Hapus draft akrual ini?')) return;
        var arr2 = ensureArr('expenseAccruals');
        var idx2 = arr2.findIndex(function (x) {
          return x.id === id;
        });
        if (idx2 >= 0) arr2.splice(idx2, 1);
        save();
        toast('Akrual dihapus', 'success');
        openExpenseAccrual();
        break;
      }
      // Payroll
      case 'addEmployee':
        addEmployeeModal();
        break;
      case 'editEmployee': {
        var emp = ensureArr('employees').find(function (x) {
          return x.id === id;
        });
        if (emp) addEmployeeModal(emp);
        break;
      }
      case 'delEmployee': {
        if (!confirm('Hapus data karyawan ini?')) return;
        var arr3 = ensureArr('employees');
        var idx3 = arr3.findIndex(function (x) {
          return x.id === id;
        });
        if (idx3 >= 0) arr3.splice(idx3, 1);
        save();
        toast('Karyawan dihapus', 'success');
        openPayroll();
        break;
      }
      case 'runPayroll':
        runPayrollModal();
        break;
      case 'postPayroll': {
        var payRun = ensureArr('payrollRuns').find(function (x) { return x.id === id; });
        if (payRun && !payRun.posted) {
          payRun.posted = true;
          save();
          if (window.GL && typeof window.GL.reconcileAll === 'function') {
            window.GL.reconcileAll();
            save();
          }
          toast('Proses gaji ' + id + ' diposting ke jurnal', 'success');
          openPayroll();
        }
        break;
      }
      case 'payPayroll': {
        var pRun = ensureArr('payrollRuns').find(function (x) { return x.id === id; });
        if (pRun && pRun.posted && !pRun.paid) payPayrollModal(pRun);
        break;
      }
      // Budget vs Actual filter
      case 'bvaFilter': {
        var bf = document.getElementById('bva-from');
        var bt = document.getElementById('bva-to');
        budgetFilter.from = bf ? bf.value : '';
        budgetFilter.to = bt ? bt.value : '';
        openBudget();
        break;
      }
      case 'bvaReset':
        budgetFilter.from = '';
        budgetFilter.to = '';
        openBudget();
        break;
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // § AUDIT JOURNAL
  // ══════════════════════════════════════════════════════════════════════════════
  // Audit Jurnal is the Jurnal page (gl-view.js) with its date, account and
  // search filters.
  function openAuditJournal() {
    if (window.NSANav && window.NSANav.open('Jurnal')) return;
    if (window._ledgerExtras) window._ledgerExtras.openTab('journals', 'all');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPOSE TO MENU-COVERAGE
  // ══════════════════════════════════════════════════════════════════════════════
  window._budgetGLExtras = {
    openBudget: openBudget,
    openBudgetMonitor: openBudgetMonitor,
    openBudgetTransfer: openBudgetTransfer,
    openAccountHistory: openAccountHistory,
    openExpenseAccrual: openExpenseAccrual,
    openPayroll: openPayroll,
    openAuditJournal: openAuditJournal,
  };

  console.log('[BudgetGL] Budget & GL extras ready');
})();
