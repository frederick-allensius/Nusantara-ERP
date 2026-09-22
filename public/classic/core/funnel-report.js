// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Funnel & Custom-Range Report  (funnel-report.js)
// ------------------------------------------------------------------------------
// Section 3 of the trading refactor: pipeline funnel analytics + a flexible
// custom-range report.
//
// PURCHASE FUNNEL stages (operational pipeline from FEAT-002):
//   Open PO Supplier → Surat Jalan / Truk Jalan → Tiba/Timbang → Reconciled →
//   Invoiced Supplier
// SALES FUNNEL stages:
//   Open PO Customer → Pengambilan Bertahap → Draft Invoice → Invoiced → Paid
//
// Counts are derived from window.DB collections:
//   purchaseOrders / salesOrders (by status), deliveryOrders,
//   goodsReceipts (weighing.netQty = weighed; reconciled flag from FEAT-002),
//   purchaseInvoices, salesInvoices (Draft / Outstanding / Paid), salesReceipts.
//
// The pure counting + filter helpers (purchaseFunnel / salesFunnel /
// filterTransactions) are exposed on window._funnelReport so they are
// unit-testable without a DOM. dashboard.js embeds the funnel HTML via
// renderPurchaseFunnelHtml / renderSalesFunnelHtml; the custom-range report view
// is reachable from the Reports menu (menu-router → openCustomRange).
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
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PURE HELPERS  (no DOM — unit-testable)
  // ════════════════════════════════════════════════════════════════════════════

  function isCancelled(o) {
    return o && o.status === 'Cancelled';
  }

  // A PO/SO is "open" (still working through the pipeline) when it is neither
  // fully closed (Received / Delivered) nor cancelled.
  function isOpenPO(o) {
    if (!o || isCancelled(o)) return false;
    return o.status !== 'Received';
  }
  function isOpenSO(o) {
    if (!o || isCancelled(o)) return false;
    return o.status !== 'Delivered';
  }

  // A goods receipt carries a Surat Jalan when any line records a surat-jalan qty.
  function hasSuratJalan(r) {
    if (!r) return false;
    return (r.items || []).some(function (it) {
      return it && it.weighing && num(it.weighing.suratJalanQty) > 0;
    });
  }

  // A goods receipt is "weighed" (Tiba/Timbang) when any line has a netto reading.
  function isWeighed(r) {
    if (!r) return false;
    return (r.items || []).some(function (it) {
      return it && it.weighing && num(it.weighing.netQty) > 0;
    });
  }

  // ── PURCHASE FUNNEL ──────────────────────────────────────────────────────────
  // Returns the five ordered stages with derived counts.
  function purchaseFunnel(dbArg) {
    var db = dbArg || window.DB || {};
    var pos = db.purchaseOrders || [];
    var receipts = db.goodsReceipts || [];
    var dos = db.deliveryOrders || [];
    var pis = db.purchaseInvoices || [];

    var openPO = pos.filter(isOpenPO).length;

    // Surat Jalan / Truk Jalan: receipts that recorded a surat jalan, plus any
    // purchase-side delivery orders (field trucks in transit).
    var sjReceipts = receipts.filter(hasSuratJalan).length;
    var purchaseDOs = dos.filter(function (d) {
      return d && (d.poId || d.poNumber || d.source === 'PO');
    }).length;
    var suratJalan = sjReceipts + purchaseDOs;

    var weighed = receipts.filter(isWeighed).length;
    var reconciled = receipts.filter(function (r) {
      return r && r.reconciled === true;
    }).length;

    // Invoiced Supplier: purchase invoices raised (Draft/Outstanding/Paid alike),
    // falling back to receipts stamped invoiced when no PI collection exists.
    var invoiced = pis.filter(function (i) {
      return i && !isCancelled(i);
    }).length;
    if (!invoiced) {
      invoiced = receipts.filter(function (r) {
        return r && r.invoiced === true;
      }).length;
    }

    return [
      { key: 'openPO', label: 'Open PO Supplier', count: openPO },
      { key: 'suratJalan', label: 'Surat Jalan / Truk Jalan', count: suratJalan },
      { key: 'weighed', label: 'Tiba/Timbang', count: weighed },
      { key: 'reconciled', label: 'Reconciled', count: reconciled },
      { key: 'invoiced', label: 'Invoiced Supplier', count: invoiced },
    ];
  }

  // ── SALES FUNNEL ─────────────────────────────────────────────────────────────
  function salesFunnel(dbArg) {
    var db = dbArg || window.DB || {};
    var sos = db.salesOrders || [];
    var dos = db.deliveryOrders || [];
    var sis = db.salesInvoices || [];
    var receipts = db.salesReceipts || [];

    var openSO = sos.filter(isOpenSO).length;

    // Pengambilan Bertahap: staged pickups — sales-side delivery orders.
    var pickups = dos.filter(function (d) {
      return d && (d.soId || d.soNumber || d.source === 'SO' || (!d.poId && !d.poNumber));
    }).length;

    var draftInv = sis.filter(function (i) {
      return i && i.status === 'Draft';
    }).length;
    var invoiced = sis.filter(function (i) {
      return i && (i.status === 'Outstanding' || i.status === 'Invoiced');
    }).length;
    var paid = sis.filter(function (i) {
      return i && i.status === 'Paid';
    }).length;
    // If invoices are not tracked as a separate collection, fall back to receipts.
    if (!paid) {
      paid = receipts.filter(function (r) {
        return r && !isCancelled(r);
      }).length;
    }

    return [
      { key: 'openSO', label: 'Open PO Customer', count: openSO },
      { key: 'pickups', label: 'Pengambilan Bertahap', count: pickups },
      { key: 'draftInv', label: 'Draft Invoice', count: draftInv },
      { key: 'invoiced', label: 'Invoiced', count: invoiced },
      { key: 'paid', label: 'Paid', count: paid },
    ];
  }

  // ── CUSTOM-RANGE FILTER ────────────────────────────────────────────────────────
  // Collects PO + SO transactions and filters by:
  //   from / to  (inclusive ISO date range, YYYY-MM-DD)
  //   month      (YYYY-MM shortcut; overrides from/to when set)
  //   customer   (substring, case-insensitive, matched on customerName)
  //   supplier   (substring, case-insensitive, matched on supplierName)
  //   po         (substring, matched on number/id — "per PO number")
  //   kind       ('purchase' | 'sales' | '' for both)
  // Returns { rows, totals: { purchase, sales, count } }.
  function filterTransactions(dbArg, filters) {
    var db = dbArg || window.DB || {};
    var f = filters || {};
    var from = f.from || '';
    var to = f.to || '';
    var month = f.month || '';
    var cust = (f.customer || '').trim().toLowerCase();
    var supp = (f.supplier || '').trim().toLowerCase();
    var poq = (f.po || '').trim().toLowerCase();
    var kind = f.kind || '';

    function dateOf(o) {
      return o.date || '';
    }
    function numberOf(o) {
      return String(o.number || o.id || '');
    }
    function inRange(dt) {
      if (!dt) return false;
      if (month) return dt.slice(0, 7) === month;
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    }

    var rows = [];

    if (kind !== 'sales') {
      (db.purchaseOrders || []).forEach(function (o) {
        if (isCancelled(o)) return;
        if (!inRange(dateOf(o))) return;
        var name = o.supplierName || o.supplier || '';
        if (supp && name.toLowerCase().indexOf(supp) === -1) return;
        // A customer filter excludes purchases (they have no customer).
        if (cust) return;
        if (poq && numberOf(o).toLowerCase().indexOf(poq) === -1) return;
        rows.push({
          kind: 'purchase',
          date: dateOf(o),
          number: numberOf(o),
          party: name,
          status: o.status || '',
          amount: num(o.amount != null ? o.amount : o.total),
        });
      });
    }

    if (kind !== 'purchase') {
      (db.salesOrders || []).forEach(function (o) {
        if (isCancelled(o)) return;
        if (!inRange(dateOf(o))) return;
        var name = o.customerName || o.customer || '';
        if (cust && name.toLowerCase().indexOf(cust) === -1) return;
        // A supplier filter excludes sales (they have no supplier).
        if (supp) return;
        if (poq && numberOf(o).toLowerCase().indexOf(poq) === -1) return;
        rows.push({
          kind: 'sales',
          date: dateOf(o),
          number: numberOf(o),
          party: name,
          status: o.status || '',
          amount: num(o.amount != null ? o.amount : o.total),
        });
      });
    }

    rows.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });

    var totals = { purchase: 0, sales: 0, count: rows.length };
    rows.forEach(function (r) {
      if (r.kind === 'purchase') totals.purchase += r.amount;
      else totals.sales += r.amount;
    });

    return { rows: rows, totals: totals };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FUNNEL HTML  (embedded by dashboard.js)
  // ════════════════════════════════════════════════════════════════════════════

  var PURCHASE_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#EC4899'];
  var SALES_COLORS = ['#10B981', '#14B8A6', '#0EA5E9', '#6366F1', '#22C55E'];

  function _funnelBars(stages, colors) {
    var max = stages.reduce(function (m, s) {
      return Math.max(m, s.count);
    }, 0);
    if (max <= 0) {
      return (
        '<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px">Belum ada data</div>'
      );
    }
    return stages
      .map(function (s, i) {
        var pct = Math.max(6, Math.round((s.count / max) * 100));
        var color = colors[i % colors.length];
        return (
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<div style="flex:0 0 140px;font-size:14px;color:var(--text-secondary);text-align:right">' +
          esc(s.label) +
          '</div>' +
          '<div style="flex:1;background:var(--border);border-radius:6px;overflow:hidden;height:22px">' +
          '<div style="height:100%;width:' +
          pct +
          '%;background:' +
          color +
          ';border-radius:6px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:13px;font-weight:700">' +
          s.count +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderPurchaseFunnelHtml(dbArg) {
    return (
      '<div class="widget-header"><div class="widget-title">Purchase Funnel</div></div>' +
      '<div style="margin-top:10px">' +
      _funnelBars(purchaseFunnel(dbArg), PURCHASE_COLORS) +
      '</div>'
    );
  }

  function renderSalesFunnelHtml(dbArg) {
    return (
      '<div class="widget-header"><div class="widget-title">Sales Funnel</div></div>' +
      '<div style="margin-top:10px">' +
      _funnelBars(salesFunnel(dbArg), SALES_COLORS) +
      '</div>'
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOM-RANGE REPORT VIEW  (Reports menu)
  // ════════════════════════════════════════════════════════════════════════════

  function injectView(html) {
    window.invalidateView && window.invalidateView('reports');
    window.navigate && window.navigate('reports');
    setTimeout(function () {
      var el = document.getElementById('view-reports');
      if (el) el.innerHTML = html;
      _wireCustomRange();
    }, 0);
  }

  // In-memory filter state so re-renders keep the operator's selections.
  var _state = { from: '', to: '', month: '', customer: '', supplier: '', po: '', kind: '' };

  function _readState() {
    function val(id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    }
    _state.from = val('cr-from');
    _state.to = val('cr-to');
    _state.month = val('cr-month');
    _state.customer = val('cr-customer');
    _state.supplier = val('cr-supplier');
    _state.po = val('cr-po');
    _state.kind = val('cr-kind');
  }

  var TH =
    'text-align:left;padding:12px 14px;font-size:13px;color:var(--text-secondary);font-weight:700;border-bottom:1px solid var(--border)';
  var TD = 'padding:11px 14px;font-size:14px;border-bottom:1px solid var(--border)';

  function _rowsHtml(result) {
    if (!result.rows.length) {
      return (
        '<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--muted);font-size:13px">Belum ada data yang cocok dengan filter.</td></tr>'
      );
    }
    return result.rows
      .map(function (r) {
        var tag =
          r.kind === 'purchase'
            ? '<span style="color:#8B5CF6;font-weight:700">Pembelian</span>'
            : '<span style="color:#10B981;font-weight:700">Penjualan</span>';
        return (
          '<tr>' +
          '<td style="' + TD + '">' + esc(r.date) + '</td>' +
          '<td style="' + TD + '">' + tag + '</td>' +
          '<td style="' + TD + '">' + esc(r.number) + '</td>' +
          '<td style="' + TD + '">' + esc(r.party || '—') + '</td>' +
          '<td style="' + TD + '">' + esc(r.status || '—') + '</td>' +
          '<td style="' + TD + ';text-align:right">' + money(r.amount) + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function _resultHtml(result) {
    return (
      '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">' +
      '<div class="card stat-card"><div class="stat-label">Total Pembelian</div><div class="stat-val" style="font-size:18px;color:#8B5CF6">' +
      money(result.totals.purchase) +
      '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Total Penjualan</div><div class="stat-val" style="font-size:18px;color:#10B981">' +
      money(result.totals.sales) +
      '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Jumlah Transaksi</div><div class="stat-val" style="font-size:18px">' +
      result.totals.count +
      '</div></div>' +
      '</div>' +
      '<div class="card"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="' + TH + '">Tanggal</th>' +
      '<th style="' + TH + '">Jenis</th>' +
      '<th style="' + TH + '">Nomor</th>' +
      '<th style="' + TH + '">Pelanggan / Supplier</th>' +
      '<th style="' + TH + '">Status</th>' +
      '<th style="' + TH + ';text-align:right">Nilai</th>' +
      '</tr></thead><tbody id="cr-tbody">' +
      _rowsHtml(result) +
      '</tbody></table></div></div>'
    );
  }

  function _customerOptions(db) {
    var seen = {};
    (db.salesOrders || []).forEach(function (o) {
      var n = o.customerName || o.customer;
      if (n) seen[n] = true;
    });
    (db.customers || []).forEach(function (c) {
      if (c && c.name) seen[c.name] = true;
    });
    return Object.keys(seen).sort();
  }

  function _supplierOptions(db) {
    var seen = {};
    (db.purchaseOrders || []).forEach(function (o) {
      var n = o.supplierName || o.supplier;
      if (n) seen[n] = true;
    });
    (db.suppliers || []).forEach(function (s) {
      if (s && s.name) seen[s.name] = true;
    });
    return Object.keys(seen).sort();
  }

  function _optionList(values, selected, placeholder) {
    var opts = '<option value="">' + esc(placeholder) + '</option>';
    values.forEach(function (v) {
      opts +=
        '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return opts;
  }

  function openCustomRange() {
    var db = window.DB || {};
    var result = filterTransactions(db, _state);
    var inputCss =
      'padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text)';

    injectView(
      '<div class="sec-hdr"><div><h1>Laporan Custom Range</h1><p>Filter transaksi PO / SO per tanggal, bulan, pelanggan, supplier, atau nomor dokumen</p></div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end">' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Dari Tanggal' +
        '<input type="date" id="cr-from" value="' + esc(_state.from) + '" style="' + inputCss + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Sampai Tanggal' +
        '<input type="date" id="cr-to" value="' + esc(_state.to) + '" style="' + inputCss + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Bulan (shortcut)' +
        '<input type="month" id="cr-month" value="' + esc(_state.month) + '" style="' + inputCss + '"></label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Jenis' +
        '<select id="cr-kind" style="' + inputCss + '">' +
        '<option value=""' + (_state.kind === '' ? ' selected' : '') + '>Semua</option>' +
        '<option value="purchase"' + (_state.kind === 'purchase' ? ' selected' : '') + '>Pembelian</option>' +
        '<option value="sales"' + (_state.kind === 'sales' ? ' selected' : '') + '>Penjualan</option>' +
        '</select></label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Pelanggan' +
        '<select id="cr-customer" style="' + inputCss + '">' +
        _optionList(_customerOptions(db), _state.customer, 'Semua Pelanggan') +
        '</select></label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Supplier' +
        '<select id="cr-supplier" style="' + inputCss + '">' +
        _optionList(_supplierOptions(db), _state.supplier, 'Semua Supplier') +
        '</select></label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--text-secondary);font-weight:700">Nomor PO / Dokumen' +
        '<input type="text" id="cr-po" value="' + esc(_state.po) + '" placeholder="mis. PO.2026.06" style="' + inputCss + '"></label>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn-primary" data-action="crApply" style="flex:1">Terapkan</button>' +
        '<button class="btn-ghost" data-action="crReset">Reset</button>' +
        '</div>' +
        '</div></div>' +
        '<div id="cr-result">' +
        _resultHtml(result) +
        '</div>'
    );
  }

  // Re-run the filter and repaint only the result region (keeps filter inputs).
  function _apply() {
    _readState();
    var result = filterTransactions(window.DB || {}, _state);
    var host = document.getElementById('cr-result');
    if (host) host.innerHTML = _resultHtml(result);
  }

  function _reset() {
    _state = { from: '', to: '', month: '', customer: '', supplier: '', po: '', kind: '' };
    openCustomRange();
  }

  var _wired = false;
  function _wireCustomRange() {
    if (_wired) return;
    _wired = true;
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'crApply') _apply();
      else if (btn.dataset.action === 'crReset') _reset();
    });
  }

  window._funnelReport = {
    // pure helpers (tested)
    purchaseFunnel: purchaseFunnel,
    salesFunnel: salesFunnel,
    filterTransactions: filterTransactions,
    // html for dashboard embedding
    renderPurchaseFunnelHtml: renderPurchaseFunnelHtml,
    renderSalesFunnelHtml: renderSalesFunnelHtml,
    // report view
    openCustomRange: openCustomRange,
  };
  console.log('[FunnelReport] Funnel & custom-range report ready');
})();
