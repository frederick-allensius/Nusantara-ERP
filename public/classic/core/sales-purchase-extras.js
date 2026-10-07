// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Sales & Purchase Extras  (sales-purchase-extras.js)
// Implements: Sales Down Payment, Sales Target, Receive Item,
//             Purchase Down Payment, Supplier Price
//
// Receive Item (Penerimaan Barang) captures per-line weighbridge (Timbangan)
// readings alongside the received qty: surat-jalan qty, bruto, tara and a
// derived netto (netQty = grossQty − tareQty) plus unit price, persisted on
// each goodsReceipt line as a `weighing` object. The reconciliation +
// multi-invoice steps live in pipeline-extras.js.
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

  // Cash/bank account a down payment moves through (gl.js maps it to Kas/Bank).
  var DP_METHODS = ['Transfer BCA', 'Transfer Mandiri', 'Tunai'];
  function methodSelectHTML(id, label) {
    return (
      '<label style="font-size:.75rem;font-weight:700">' +
      esc(label) +
      '<select id="' +
      id +
      '" class="form-select" style="width:100%;margin-top:4px">' +
      DP_METHODS.map(function (m) {
        return '<option>' + esc(m) + '</option>';
      }).join('') +
      '</select></label>'
    );
  }

  // Delete a down payment together with the payment-log row created when it was
  // applied; the order/invoice status then follows the remaining balance.
  function removeDownPayment(coll, orderType, side, id) {
    var arr = ensureArr(coll);
    var idx = arr.findIndex(function (x) {
      return x.id === id;
    });
    if (idx < 0) return;
    var dp = arr.splice(idx, 1)[0];
    var logs = db().paymentLogs || [];
    for (var i = logs.length - 1; i >= 0; i--) {
      var p = logs[i];
      if (p && p.type === orderType && (p.dpId === dp.id || p.note === 'DP: ' + dp.id)) {
        logs.splice(i, 1);
      }
    }
    var orders = db()[orderType === 'SO' ? 'salesOrders' : 'purchaseOrders'] || [];
    var order = orders.find(function (o) {
      return String(o.id) === String(dp.orderId);
    });
    var B = window.Balances;
    if (order && B) {
      if (order.status === 'Paid' && B.orderBalance(side, order).outstanding > B.EPS) {
        order.status = 'Confirmed';
        if (orderType === 'SO' && typeof window.reserveStock === 'function') {
          window.reserveStock(order.id, order.lines || []);
        }
      }
      var inv = B.activeInvoiceFor(side, order.id);
      if (inv) B.recalcInvoiceStatus(side, inv);
    }
    save();
  }

  // Applying a down payment records it as a payment on the order. An order that
  // becomes fully paid before delivery is marked Lunas; a delivered/received
  // order keeps its status (payment progress is shown from the balance).
  function applyDownPayment(coll, orderType, side, id) {
    var dp = ensureArr(coll).find(function (x) {
      return x.id === id;
    });
    if (!dp || dp.status === 'Applied') return false;
    if (!window.DB.paymentLogs) window.DB.paymentLogs = [];
    var maxPL = window.DB.paymentLogs.reduce(function (m, p) {
      return Math.max(m, Number(p.id) || 0);
    }, 0);
    window.DB.paymentLogs.push({
      id: maxPL + 1,
      type: orderType,
      orderId: dp.orderId,
      date: dp.date,
      amount: dp.amount,
      method: 'Down Payment',
      source: 'DP',
      dpId: dp.id,
      note: 'DP: ' + dp.id,
    });
    var orders = db()[orderType === 'SO' ? 'salesOrders' : 'purchaseOrders'] || [];
    var order = orders.find(function (o) {
      return String(o.id) === String(dp.orderId);
    });
    var B = window.Balances;
    if (order && B) {
      if (order.status === 'Draft' || order.status === 'Confirmed') {
        var bal = B.orderBalance(side, order);
        if (bal.total > 0 && bal.outstanding <= B.EPS) {
          if (order.status === 'Confirmed' && orderType === 'SO' && typeof window.releaseReservation === 'function') {
            window.releaseReservation(order.id);
          }
          order.status = 'Paid';
        }
      }
      var inv = B.activeInvoiceFor(side, order.id);
      if (inv) B.recalcInvoiceStatus(side, inv);
    }
    dp.status = 'Applied';
    dp.appliedDate = today();
    save();
    return true;
  }

  // Goods-receipt lines as stock lines (older receipts may lack an item id).
  function receiptLines(receipt) {
    var items = db().inventoryItems || [];
    return (receipt.items || []).map(function (ri) {
      var itemId = ri.itemId;
      if (!itemId || itemId === 'undefined') {
        var byName = items.find(function (i) {
          return i.name === ri.itemName;
        });
        itemId = byName ? byName.id : 'custom';
      }
      return { itemId: String(itemId), itemName: ri.itemName, qty: Number(ri.qty) || 0 };
    });
  }

  function receivedQtyMap(poId) {
    var got = {};
    ensureArr('goodsReceipts').forEach(function (g) {
      if (!g.posted || String(g.poId) !== String(poId)) return;
      receiptLines(g).forEach(function (l) {
        got[l.itemId] = (got[l.itemId] || 0) + l.qty;
      });
    });
    return got;
  }

  // Once everything ordered has been received, the PO becomes Received. Its stock
  // is already counted through the receipts, so it is marked as mutated.
  function completePOIfReceived(po, date) {
    if (!po || po.status === 'Received' || po.status === 'Cancelled') return false;
    var got = receivedQtyMap(po.id);
    var stockLines = (po.lines || []).filter(function (l) {
      return l.itemId !== 'custom';
    });
    if (stockLines.length === 0) return false;
    var complete = stockLines.every(function (l) {
      return (got[String(l.itemId)] || 0) + 1e-9 >= (Number(l.qty) || 0);
    });
    if (!complete) return false;
    if (typeof window.releaseReservation === 'function') window.releaseReservation(po.id);
    po.status = 'Received';
    po.stockMutated = true;
    po.receivedAt = date || today();
    return true;
  }

  function receiveIntoStock(po, receipt) {
    var warehouseId = receipt.warehouseId || (po && po.warehouseId) || null;
    if (typeof window.moveStockLines === 'function') {
      window.moveStockLines(receiptLines(receipt), 'in', warehouseId);
    }
    receipt.posted = true;
    return completePOIfReceived(po, receipt.date);
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
  // § 1  SALES DOWN PAYMENT
  // ══════════════════════════════════════════════════════════════════════════════
  function openSalesDP() {
    var dps = ensureArr('salesDownPayments');
    var sos = db().salesOrders || [];

    var rows = dps
      .slice()
      .reverse()
      .map(function (d) {
        var so = sos.find(function (o) {
          return o.id === d.orderId;
        });
        var statusBadge =
          d.status === 'Applied'
            ? '<span class="badge" style="background:var(--success-bg);color:var(--success)">Diterapkan</span>'
            : '<span class="badge" style="background:var(--warning-bg);color:var(--warning)">Diterima</span>';
        var orderTotal = so ? (so.amount || 0) : 0;
        var allDPForOrder = dps.filter(function (x) { return x.orderId === d.orderId; })
          .reduce(function (s, x) { return s + (x.amount || 0); }, 0);
        var remaining = orderTotal - allDPForOrder;
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:.75rem;font-weight:700">' +
          esc(d.id) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(d.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc((so && so.number) || d.orderId) +
          '</td>' +
          '<td class="td-p">' +
          esc(so ? so.customer : d.customerName || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(d.amount) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.75rem">' +
          money(orderTotal) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.75rem;font-weight:700;color:' +
          (remaining > 0 ? 'var(--danger)' : 'var(--success)') + '">' +
          money(remaining) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          (d.status !== 'Applied'
            ? '<button class="action-primary" data-action="applySalesDP" data-id="' +
              esc(d.id) +
              '">Terapkan</button> '
            : '') +
          '<button class="action-ghost" data-action="delSalesDP" data-id="' +
          esc(d.id) +
          '" style="color:var(--danger)">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var totalDP = dps.reduce(function (s, d) {
      return s + (d.amount || 0);
    }, 0);
    var pendingDP = dps
      .filter(function (d) {
        return d.status !== 'Applied';
      })
      .reduce(function (s, d) {
        return s + (d.amount || 0);
      }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Uang Muka Penjualan',
            'Uang muka yang diterima dari pelanggan, lalu dipotong dari piutangnya',
            'Terima DP',
            'addSalesDP',
            { showSub: true }
          )
        : '<h1>Uang Muka Penjualan</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total DP', value: String(dps.length), sub: 'Transaksi DP' },
            { label: 'Total Diterima', value: money(totalDP), sub: 'Seluruh DP', color: 'var(--success)' },
            {
              label: 'Belum Diterapkan',
              value: money(pendingDP),
              sub: 'Belum dipotong dari piutang',
              color: 'var(--warning)',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. SO</th><th>Pelanggan</th><th style="text-align:right">Jumlah DP</th><th style="text-align:right">Total SO</th><th style="text-align:right">Sisa</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="9" class="td-empty">Belum ada uang muka penjualan.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('sales', html);
  }

  function addSalesDPModal() {
    var sos = (db().salesOrders || []).filter(function (o) {
      return o.status !== 'Paid' && o.status !== 'Cancelled';
    });
    var opts = sos
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '" data-customer="' +
          esc(o.customer || '') +
          '" data-amount="' +
          (o.amount || 0) +
          '">' +
          esc(o.id) +
          ' — ' +
          esc(o.customer || '?') +
          ' (' +
          money(o.amount || 0) +
          ')</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Sales Order<select id="sdp-so" class="form-select" style="width:100%;margin-top:4px">' +
      (opts || '<option value="">Tidak ada SO aktif</option>') +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Tanggal<input id="sdp-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Jumlah DP<input id="sdp-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      methodSelectHTML('sdp-method', 'Diterima di') +
      '<label style="font-size:.75rem;font-weight:700">Catatan<input id="sdp-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Terima Uang Muka Penjualan',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="sdp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('sdp-save').addEventListener('click', function () {
        var sel = document.getElementById('sdp-so');
        var orderId = sel.value;
        if (!orderId) {
          toast('Pilih Sales Order', 'warning');
          return;
        }
        var opt = sel.options[sel.selectedIndex];
        var customer = opt ? opt.dataset.customer : '';
        var date = document.getElementById('sdp-date').value;
        var amount = parseFloat(document.getElementById('sdp-amount').value) || 0;
        var notes = document.getElementById('sdp-notes').value.trim();
        if (amount <= 0) {
          toast('Jumlah DP harus lebih dari 0', 'warning');
          return;
        }

        ensureArr('salesDownPayments').push({
          id: uid('SDP'),
          orderId: orderId,
          customerName: customer,
          date: date,
          amount: amount,
          method: document.getElementById('sdp-method').value,
          notes: notes,
          status: 'Received',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Uang muka penjualan dicatat', 'success');
        openSalesDP();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 2  PURCHASE DOWN PAYMENT
  // ══════════════════════════════════════════════════════════════════════════════
  function openPurchaseDP() {
    var dps = ensureArr('purchaseDownPayments');
    var pos = db().purchaseOrders || [];

    var rows = dps
      .slice()
      .reverse()
      .map(function (d) {
        var po = pos.find(function (o) {
          return o.id === d.orderId;
        });
        var statusBadge =
          d.status === 'Applied'
            ? '<span class="badge" style="background:var(--success-bg);color:var(--success)">Diterapkan</span>'
            : '<span class="badge" style="background:var(--warning-bg);color:var(--warning)">Dibayar</span>';
        var orderTotal = po ? (po.amount || 0) : 0;
        var allDPForOrder = dps.filter(function (x) { return x.orderId === d.orderId; })
          .reduce(function (s, x) { return s + (x.amount || 0); }, 0);
        var remaining = orderTotal - allDPForOrder;
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:.75rem;font-weight:700">' +
          esc(d.id) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(d.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc((po && po.number) || d.orderId) +
          '</td>' +
          '<td class="td-p">' +
          esc(po ? po.supplier : d.supplierName || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(d.amount) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.75rem">' +
          money(orderTotal) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.75rem;font-weight:700;color:' +
          (remaining > 0 ? 'var(--danger)' : 'var(--success)') + '">' +
          money(remaining) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          (d.status !== 'Applied'
            ? '<button class="action-primary" data-action="applyPurchaseDP" data-id="' +
              esc(d.id) +
              '">Terapkan</button> '
            : '') +
          '<button class="action-ghost" data-action="delPurchaseDP" data-id="' +
          esc(d.id) +
          '" style="color:var(--danger)">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var totalDP = dps.reduce(function (s, d) {
      return s + (d.amount || 0);
    }, 0);
    var pendingDP = dps
      .filter(function (d) { return d.status !== 'Applied'; })
      .reduce(function (s, d) { return s + (d.amount || 0); }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Uang Muka Pembelian',
            'Uang muka yang dibayar ke supplier, lalu dipotong dari hutangnya',
            'Bayar DP',
            'addPurchaseDP',
            { showSub: true }
          )
        : '<h1>Uang Muka Pembelian</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total DP', value: String(dps.length), sub: 'Transaksi DP' },
            { label: 'Total Dibayar', value: money(totalDP), sub: 'Seluruh DP', color: 'var(--warning)' },
            { label: 'Belum Diterapkan', value: money(pendingDP), sub: 'Belum dipotong dari hutang', color: 'var(--danger)' },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. PO</th><th>Supplier</th><th style="text-align:right">Jumlah DP</th><th style="text-align:right">Total PO</th><th style="text-align:right">Sisa</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="9" class="td-empty">Belum ada uang muka pembelian.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function addPurchaseDPModal() {
    var pos = (db().purchaseOrders || []).filter(function (o) {
      return o.status !== 'Paid' && o.status !== 'Received' && o.status !== 'Cancelled';
    });
    var opts = pos
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '" data-supplier="' +
          esc(o.supplier || '') +
          '">' +
          esc(o.id) +
          ' — ' +
          esc(o.supplier || '?') +
          ' (' +
          money(o.amount || 0) +
          ')</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Purchase Order<select id="pdp-po" class="form-select" style="width:100%;margin-top:4px">' +
      (opts || '<option value="">Tidak ada PO aktif</option>') +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Tanggal<input id="pdp-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Jumlah DP<input id="pdp-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      methodSelectHTML('pdp-method', 'Dibayar dari') +
      '<label style="font-size:.75rem;font-weight:700">Catatan<input id="pdp-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Bayar Uang Muka Pembelian',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="pdp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('pdp-save').addEventListener('click', function () {
        var sel = document.getElementById('pdp-po');
        var orderId = sel.value;
        if (!orderId) {
          toast('Pilih Purchase Order', 'warning');
          return;
        }
        var opt = sel.options[sel.selectedIndex];
        var supplier = opt ? opt.dataset.supplier : '';
        var date = document.getElementById('pdp-date').value;
        var amount = parseFloat(document.getElementById('pdp-amount').value) || 0;
        var notes = document.getElementById('pdp-notes').value.trim();
        if (amount <= 0) {
          toast('Jumlah DP harus lebih dari 0', 'warning');
          return;
        }

        ensureArr('purchaseDownPayments').push({
          id: uid('PDP'),
          orderId: orderId,
          supplierName: supplier,
          date: date,
          amount: amount,
          method: document.getElementById('pdp-method').value,
          notes: notes,
          status: 'Paid',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Uang muka pembelian dicatat', 'success');
        openPurchaseDP();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 3  SALES TARGET
  // ══════════════════════════════════════════════════════════════════════════════
  function openSalesTarget() {
    var targets = ensureArr('salesTargets');
    var sos = db().salesOrders || [];

    var rows = targets
      .slice()
      .reverse()
      .map(function (t) {
        var actual = sos
          .filter(function (o) {
            return (
              o.date && o.date.startsWith(t.period) && o.status !== 'Draft' && o.status !== 'Cancelled'
            );
          })
          .reduce(function (s, o) {
            return s + (o.amount || 0);
          }, 0);
        var pct = t.target > 0 ? Math.round((actual / t.target) * 100) : 0;
        var color = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)';

        return (
          '<tr>' +
          '<td class="td-p">' +
          esc(t.period) +
          '</td>' +
          '<td class="td-p">' +
          esc(t.category || 'Semua') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(t.target) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(actual) +
          '</td>' +
          '<td class="td-p"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:var(--surface-sunken);border-radius:4px;overflow:hidden"><div style="height:100%;width:' +
          Math.min(pct, 100) +
          '%;background:' +
          color +
          ';border-radius:4px"></div></div><span style="font-size:.75rem;font-weight:700;color:' +
          color +
          '">' +
          pct +
          '%</span></div></td>' +
          '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
          esc(t.notes || '—') +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editTarget" data-id="' +
          esc(t.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delTarget" data-id="' +
          esc(t.id) +
          '" style="color:var(--danger)">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Target Penjualan',
            'Penetapan & pelacakan target penjualan',
            'Tambah Target',
            'addTarget'
          )
        : '<h1>Sales Target</h1>';

    var html =
      header +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Periode</th><th>Kategori</th><th style="text-align:right">Target</th><th style="text-align:right">Realisasi</th><th>Pencapaian</th><th>Catatan</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada target penjualan.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('sales', html);
  }

  function addTargetModal(existing) {
    var t = existing || {};
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Periode<input id="st-period" class="form-input" type="month" value="' +
      esc(t.period || thisMonth()) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Kategori (opsional)<input id="st-cat" class="form-input" value="' +
      esc(t.category || '') +
      '" placeholder="Semua" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Target Penjualan (Rp)<input id="st-target" class="form-input" type="number" min="0" value="' +
      (t.target || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Catatan<input id="st-notes" class="form-input" value="' +
      esc(t.notes || '') +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Target' : 'Tambah Target',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="st-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('st-save').addEventListener('click', function () {
        var period = document.getElementById('st-period').value;
        var category = document.getElementById('st-cat').value.trim();
        var target = parseFloat(document.getElementById('st-target').value) || 0;
        var notes = document.getElementById('st-notes').value.trim();
        if (!period || target <= 0) {
          toast('Periode dan target wajib diisi', 'warning');
          return;
        }

        var arr = ensureArr('salesTargets');
        if (existing) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0)
            Object.assign(arr[idx], {
              period: period,
              category: category,
              target: target,
              notes: notes,
            });
        } else {
          arr.push({
            id: uid('TGT'),
            period: period,
            category: category,
            target: target,
            notes: notes,
            createdAt: today(),
          });
        }
        save();
        closeM();
        toast(existing ? 'Target diperbarui' : 'Target ditambahkan', 'success');
        openSalesTarget();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 4  RECEIVE ITEM (Goods Receipt from PO)
  // ══════════════════════════════════════════════════════════════════════════════
  // Penerimaan Barang also carries Rekonsiliasi Timbangan (pipeline-extras):
  // each receipt shows its reconciliation, its invoice and the next step.
  function openReceiveItem() {
    var receipts = ensureArr('goodsReceipts');
    var pos = db().purchaseOrders || [];
    var px = window._pipelineExtras && window._pipelineExtras.reconCells ? window._pipelineExtras : null;

    var rows = receipts
      .slice()
      .reverse()
      .map(function (r) {
        var rc = px ? px.reconCells(r) : null;
        return (
          '<tr data-action="viewReceipt" data-id="' +
          esc(r.id) +
          '">' +
          '<td class="td-p" style="font-size:.75rem;font-weight:700">' +
          esc(r.id) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(r.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc(px ? px.poNumberOf(r) : r.poId) +
          '</td>' +
          '<td class="td-p">' +
          esc(r.supplierName || '—') +
          '</td>' +
          '<td class="td-p">' +
          (r.items || []).length +
          ' item</td>' +
          '<td class="td-p">' +
          (r.posted
            ? '<span class="badge" style="background:var(--success-bg);color:var(--success)">Diterima</span>'
            : '<span class="badge" style="background:var(--warning-bg);color:var(--warning)">Draft</span>') +
          '</td>' +
          (rc ? '<td class="td-p">' + rc.status + '</td><td class="td-p">' + rc.invoice + '</td>' : '') +
          '<td class="td-p" style="white-space:nowrap">' +
          (!r.posted
            ? '<button class="btn btn-sm" data-action="postReceipt" data-id="' +
              esc(r.id) +
              '">Terima & Stok</button> '
            : rc
              ? rc.actions
              : '') +
          '<button class="action-edit" data-action="delReceipt" data-id="' +
          esc(r.id) +
          '" title="Hapus" style="color:var(--danger);border-color:var(--danger)">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>' +
          '</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var pendingPO = pos.filter(function (o) {
      return o.status === 'Confirmed';
    }).length;
    var unreconciled = receipts.filter(function (r) {
      return !r.reconciled;
    }).length;

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Penerimaan Barang',
            'Dokumen penerimaan barang dari Purchase Order',
            'Terima Barang',
            'addReceipt'
          )
        : '<h1>Receive Item</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Penerimaan', value: String(receipts.length), sub: 'Dokumen' },
            {
              label: 'Belum direkonsiliasi',
              value: String(unreconciled),
              sub: 'Timbangan belum dicocokkan',
              color: unreconciled ? 'var(--warning)' : '',
            },
            {
              label: 'PO Pending',
              value: String(pendingPO),
              sub: 'Menunggu penerimaan',
              color: 'var(--warning)',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. PO</th><th>Supplier</th><th>Item</th><th>Status</th>' +
      (px ? '<th>Rekonsiliasi</th><th>Faktur</th>' : '') +
      '<th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows ||
        '<tr><td colspan="' +
        (px ? 9 : 7) +
        '" class="td-empty">Belum ada penerimaan barang.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function addReceiptModal() {
    // Pickup POs (pickupFlow, trading.js) are taken by trucks straight from the
    // supplier and never enter the warehouse — they are recorded in Pengambilan.
    var pos = (db().purchaseOrders || []).filter(function (o) {
      return (
        !o.pickupFlow && (o.status === 'Confirmed' || o.status === 'Draft' || o.status === 'Paid')
      );
    });
    var opts = pos
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '" data-supplier="' +
          esc(o.supplier || '') +
          '">' +
          esc(o.id) +
          ' — ' +
          esc(o.supplier || '?') +
          ' (' +
          (o.lines || []).length +
          ' item)</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Purchase Order<select id="ri-po" class="form-select" style="width:100%;margin-top:4px" data-action="riSelectPO">' +
      (opts || '<option value="">Tidak ada PO aktif</option>') +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Tanggal Terima<input id="ri-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Catatan<input id="ri-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '<div id="ri-lines" style="background:var(--surface-sunken);border-radius:8px;padding:12px">' +
      '<div style="font-size:.75rem;font-weight:700;margin-bottom:8px">Item dari PO</div>' +
      '<div style="font-size:.75rem;color:var(--muted)">Pilih PO untuk melihat daftar item</div>' +
      '</div>' +
      '<label style="font-size:.75rem"><input type="checkbox" id="ri-post" checked> Langsung update stok</label>' +
      '</div>';

    modal(
      'Penerimaan Barang',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="ri-save">Simpan</button>',
      true
    );

    // Load PO lines on select
    setTimeout(function () {
      var poSel = document.getElementById('ri-po');
      if (poSel) {
        poSel.addEventListener('change', function () {
          loadPOLines(poSel.value);
        });
        if (poSel.value) loadPOLines(poSel.value);
      }

      document.getElementById('ri-save').addEventListener('click', function () {
        var poId = document.getElementById('ri-po').value;
        if (!poId) {
          toast('Pilih PO', 'warning');
          return;
        }
        var po = (db().purchaseOrders || []).find(function (o) {
          return o.id === poId;
        });
        if (!po) return;

        var lineEls = document.querySelectorAll('.ri-line-qty');
        var items = [];
        var tareOverGross = false;
        lineEls.forEach(function (el) {
          var qty = parseFloat(el.value) || 0;
          var max = parseFloat(el.max);
          if (!isNaN(max) && qty > max) qty = max; // never receive more than is still open
          if (qty > 0) {
            var row = el.closest('tr');
            var sjEl = row ? row.querySelector('.ri-line-sj') : null;
            var grossEl = row ? row.querySelector('.ri-line-gross') : null;
            var tareEl = row ? row.querySelector('.ri-line-tare') : null;
            var priceEl = row ? row.querySelector('.ri-line-price') : null;
            var netEl = row ? row.querySelector('.ri-line-net') : null;
            var gross = grossEl ? parseFloat(grossEl.value) || 0 : 0;
            var tare = tareEl ? parseFloat(tareEl.value) || 0 : 0;
            if (gross > 0 && tare > gross) tareOverGross = true;
            // Netto is derived from Bruto − Tara, but when the operator records
            // only a netto (no Bruto — e.g. a trusted supplier weighbridge
            // ticket) that direct figure is kept. gridWeighing goes through
            // _pipelineExtras.computeWeighing, so the receive path and the
            // reconciliation cannot drift.
            var weighing = gridWeighing({
              suratJalanQty: sjEl ? parseFloat(sjEl.value) || 0 : 0,
              grossQty: gross,
              tareQty: tare,
              netQty: netEl ? parseFloat(netEl.value) || 0 : 0,
            });
            var unitPrice = priceEl ? parseFloat(priceEl.value) || 0 : 0;
            items.push({
              itemId: el.dataset.itemid,
              itemName: el.dataset.itemname,
              qty: qty,
              unitPrice: unitPrice,
              weighing: weighing,
            });
          }
        });

        if (tareOverGross) {
          toast('Tara tidak boleh lebih besar dari Bruto', 'warning');
          return;
        }
        if (items.length === 0) {
          toast('Minimal 1 item harus diterima', 'warning');
          return;
        }

        var doPost = document.getElementById('ri-post').checked;
        var receipt = {
          id: uid('GR'),
          poId: poId,
          supplierName: po.supplier || '',
          date: document.getElementById('ri-date').value,
          notes: document.getElementById('ri-notes').value.trim(),
          warehouseId: po.warehouseId || null,
          items: items,
          posted: false,
          createdAt: today(),
        };
        ensureArr('goodsReceipts').push(receipt);

        var completed = doPost ? receiveIntoStock(po, receipt) : false;

        save();
        closeM();
        toast(
          'Penerimaan barang dicatat' +
            (doPost ? ' & stok bertambah' : '') +
            (completed ? ' · PO ' + (po.number || po.id) + ' diterima penuh' : ''),
          'success'
        );
        openReceiveItem();
      });
    }, 60);
  }

  // Weighing as the save handler stores it (computeWeighing when loaded).
  function gridWeighing(f) {
    var P = window._pipelineExtras;
    if (P && typeof P.weighingFromFields === 'function') return P.weighingFromFields(f);
    var gross = Number(f.grossQty) || 0;
    var tare = Number(f.tareQty) || 0;
    return {
      suratJalanQty: Number(f.suratJalanQty) || 0,
      grossQty: gross,
      tareQty: tare,
      netQty: gross > 0 ? Math.round((gross - tare) * 100) / 100 : Number(f.netQty) || 0,
    };
  }

  // PO line price after its line discount: the default receive price, so an
  // invoice made from the receipt keeps the PO's discount.
  function poNetUnitPrice(l) {
    var qty = Number(l.qty) || 0;
    if (qty > 0 && l.subtotal != null) return Math.round(((Number(l.subtotal) || 0) / qty) * 100) / 100;
    return l.price != null ? Number(l.price) || 0 : Number(l.cost) || 0;
  }

  function loadPOLines(poId) {
    var po = (db().purchaseOrders || []).find(function (o) {
      return o.id === poId;
    });
    var container = document.getElementById('ri-lines');
    if (!container || !po) return;

    var lines = po.lines && po.lines.length ? po.lines : po.items || [];
    if (lines.length === 0) {
      container.innerHTML =
        '<div style="font-size:.75rem;color:var(--muted)">PO tidak memiliki item.</div>';
      return;
    }

    // Per line: what was ordered and received so far, the qty received now
    // (capped at what is still open) and the weighbridge reading — Surat Jalan
    // qty, Bruto, Tara, Netto (Bruto − Tara; typed directly when there is no
    // Bruto) — plus the unit price.
    var got = receivedQtyMap(poId);
    var html =
      '<div style="font-size:.75rem;font-weight:700;margin-bottom:8px">Barang dari PO ' +
      esc(po.number || poId) +
      ' <span style="font-weight:400;color:var(--muted)">· Timbangan: Netto = Bruto − Tara</span></div>' +
      '<div class="table-wrap"><table class="line-items-table">' +
      '<thead><tr>' +
      '<th>Barang</th>' +
      '<th class="t-num">Qty PO</th>' +
      '<th class="t-num">Sudah diterima</th>' +
      '<th class="t-num">Qty Terima</th>' +
      '<th class="t-num">Surat Jalan</th>' +
      '<th class="t-num">Bruto</th>' +
      '<th class="t-num">Tara</th>' +
      '<th class="t-num">Netto</th>' +
      '<th class="t-num">Harga</th>' +
      '</tr></thead>' +
      '<tbody>';
    lines.forEach(function (l) {
      var ordered = Number(l.qty) || 0;
      var done = got[String(l.itemId)] || 0;
      var open = Math.max(0, ordered - done);
      var off = open <= 0 ? ' disabled' : '';
      html +=
        '<tr><td>' +
        esc(l.itemName || l.itemId) +
        '</td>' +
        '<td class="t-num">' +
        ordered +
        '</td>' +
        '<td class="t-num t-muted">' +
        (done || '—') +
        '</td>' +
        '<td><input class="form-input t-num ri-line-qty" type="number" min="0" step="any" max="' +
        open +
        '" value="' +
        open +
        '" data-itemid="' +
        esc(l.itemId || '') +
        '" data-itemname="' +
        esc(l.itemName || '') +
        '"' +
        off +
        ' style="min-width:4.5rem"></td>' +
        '<td><input class="form-input t-num ri-line-sj" type="number" min="0" step="any" value="' +
        open +
        '"' +
        off +
        ' style="min-width:4.5rem"></td>' +
        '<td><input class="form-input t-num ri-line-gross" type="number" min="0" step="any" placeholder="0"' +
        off +
        ' style="min-width:4.5rem"></td>' +
        '<td><input class="form-input t-num ri-line-tare" type="number" min="0" step="any" placeholder="0"' +
        off +
        ' style="min-width:4.5rem"></td>' +
        '<td><input class="form-input t-num ri-line-net" type="number" min="0" step="any" placeholder="0" title="Isi langsung bila tanpa Bruto"' +
        off +
        ' style="min-width:4.5rem;font-weight:600"></td>' +
        '<td><input class="form-input t-num ri-line-price" type="number" min="0" step="any" value="' +
        poNetUnitPrice(l) +
        '"' +
        off +
        ' style="min-width:6.5rem"></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Netto = Bruto − Tara when a Bruto is entered (derived, field locked). When
    // no Bruto is recorded, the Netto field is editable so an operator can enter
    // a single trusted netto figure directly. The value shown is the one the
    // save handler stores (computeWeighing).
    container.querySelectorAll('tr').forEach(function (tr) {
      var grossEl = tr.querySelector('.ri-line-gross');
      var tareEl = tr.querySelector('.ri-line-tare');
      var netEl = tr.querySelector('.ri-line-net');
      if (!grossEl || !tareEl || !netEl || netEl.disabled) return;
      function recalc() {
        var g = parseFloat(grossEl.value) || 0;
        if (g > 0) {
          // Bruto present → Netto is derived and read-only.
          netEl.value = gridWeighing({ grossQty: g, tareQty: parseFloat(tareEl.value) || 0 }).netQty;
          netEl.readOnly = true;
        } else {
          // No Bruto → let the operator type the netto directly.
          netEl.readOnly = false;
        }
      }
      grossEl.addEventListener('input', recalc);
      tareEl.addEventListener('input', recalc);
      recalc();
    });
  }

  function postReceipt(id) {
    var arr = ensureArr('goodsReceipts');
    var r = arr.find(function (x) {
      return x.id === id;
    });
    if (!r || r.posted) return;

    var po = (db().purchaseOrders || []).find(function (o) {
      return String(o.id) === String(r.poId);
    });
    if (po && po.status === 'Received') {
      toast('PO ' + (po.number || po.id) + ' sudah berstatus Diterima — stoknya sudah tercatat', 'warning');
      return;
    }
    var completed = receiveIntoStock(po || null, r);
    save();
    toast(
      'Stok bertambah dari penerimaan barang' +
        (completed ? ' · PO ' + (po.number || po.id) + ' diterima penuh' : ''),
      'success'
    );
    openReceiveItem();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 5  SUPPLIER PRICE
  // ══════════════════════════════════════════════════════════════════════════════
  function openSupplierPrice() {
    var prices = ensureArr('supplierPrices');
    var suppliers = db().suppliers || [];

    var rows = prices
      .slice()
      .reverse()
      .map(function (p) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:600">' +
          esc(p.supplierName) +
          '</td>' +
          '<td class="td-p">' +
          esc(p.itemName) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(p.itemCode || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(p.price) +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(p.unit || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:.75rem">' +
          esc(p.effectiveDate || '—') +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editSupPrice" data-id="' +
          esc(p.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delSupPrice" data-id="' +
          esc(p.id) +
          '" style="color:var(--danger)">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Harga Supplier',
            'Daftar harga per supplier per item',
            'Tambah Harga',
            'addSupPrice'
          )
        : '<h1>Supplier Price</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Harga', value: String(prices.length), sub: 'Daftar harga tercatat' },
            {
              label: 'Supplier',
              value: String(
                new Set(
                  prices.map(function (p) {
                    return p.supplierName;
                  })
                ).size
              ),
              sub: 'Supplier unik',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Supplier</th><th>Item</th><th>Kode</th><th style="text-align:right">Harga</th><th>Satuan</th><th>Berlaku</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada daftar harga supplier.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function addSupPriceModal(existing) {
    var p = existing || {};
    var suppliers = db().suppliers || [];
    var items = db().inventoryItems || [];

    var supOpts = suppliers
      .map(function (s) {
        return (
          '<option value="' +
          esc(s.id) +
          '" data-name="' +
          esc(s.name) +
          '"' +
          (p.supplierId === s.id ? ' selected' : '') +
          '>' +
          esc(s.name) +
          '</option>'
        );
      })
      .join('');

    var itemOpts = items
      .map(function (i) {
        return (
          '<option value="' +
          esc(i.id) +
          '" data-name="' +
          esc(i.name) +
          '" data-code="' +
          esc(i.sku || '') +
          '" data-unit="' +
          esc(i.unit || '') +
          '"' +
          (p.itemId === i.id ? ' selected' : '') +
          '>' +
          esc(i.name) +
          ' (' +
          esc(i.sku || i.id) +
          ')</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:.75rem;font-weight:700">Supplier<select id="sp-sup" class="form-select" style="width:100%;margin-top:4px">' +
      supOpts +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Item<select id="sp-item" class="form-select" style="width:100%;margin-top:4px">' +
      itemOpts +
      '</select></label>' +
      '<label style="font-size:.75rem;font-weight:700">Harga<input id="sp-price" class="form-input" type="number" min="0" value="' +
      (p.price || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:.75rem;font-weight:700">Berlaku Sejak<input id="sp-date" class="form-input" type="date" value="' +
      esc(p.effectiveDate || today()) +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Harga Supplier' : 'Tambah Harga Supplier',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="sp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('sp-save').addEventListener('click', function () {
        var supSel = document.getElementById('sp-sup');
        var supplierId = supSel.value;
        var supplierName = supSel.options[supSel.selectedIndex]
          ? supSel.options[supSel.selectedIndex].dataset.name
          : '';
        var itemSel = document.getElementById('sp-item');
        var itemId = itemSel.value;
        var itemOpt = itemSel.options[itemSel.selectedIndex];
        var itemName = itemOpt ? itemOpt.dataset.name : '';
        var itemCode = itemOpt ? itemOpt.dataset.code : '';
        var unit = itemOpt ? itemOpt.dataset.unit : '';
        var price = parseFloat(document.getElementById('sp-price').value) || 0;
        var effectiveDate = document.getElementById('sp-date').value;

        if (!supplierId || !itemId || price <= 0) {
          toast('Supplier, item, dan harga wajib diisi', 'warning');
          return;
        }

        var arr = ensureArr('supplierPrices');
        if (existing) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0)
            Object.assign(arr[idx], {
              supplierId: supplierId,
              supplierName: supplierName,
              itemId: itemId,
              itemName: itemName,
              itemCode: itemCode,
              unit: unit,
              price: price,
              effectiveDate: effectiveDate,
            });
        } else {
          arr.push({
            id: uid('SPR'),
            supplierId: supplierId,
            supplierName: supplierName,
            itemId: itemId,
            itemName: itemName,
            itemCode: itemCode,
            unit: unit,
            price: price,
            effectiveDate: effectiveDate,
            createdAt: today(),
          });
        }
        save();
        closeM();
        toast(existing ? 'Harga diperbarui' : 'Harga ditambahkan', 'success');
        openSupplierPrice();
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
      // Sales DP
      case 'addSalesDP':
        addSalesDPModal();
        break;
      case 'applySalesDP': {
        if (applyDownPayment('salesDownPayments', 'SO', 'sales', id)) {
          toast('Uang muka diterapkan ke Sales Order', 'success');
          openSalesDP();
        }
        break;
      }
      case 'delSalesDP': {
        if (
          !confirm(
            'Hapus uang muka ini?\n\nJurnal uang muka dan pembayaran yang berasal dari uang muka ini ikut dihapus.'
          )
        )
          return;
        removeDownPayment('salesDownPayments', 'SO', 'sales', id);
        toast('Uang muka dihapus', 'success');
        openSalesDP();
        break;
      }
      // Purchase DP
      case 'addPurchaseDP':
        addPurchaseDPModal();
        break;
      case 'applyPurchaseDP': {
        if (applyDownPayment('purchaseDownPayments', 'PO', 'purchases', id)) {
          toast('Uang muka diterapkan ke Purchase Order', 'success');
          openPurchaseDP();
        }
        break;
      }
      case 'delPurchaseDP': {
        if (
          !confirm(
            'Hapus uang muka ini?\n\nJurnal uang muka dan pembayaran yang berasal dari uang muka ini ikut dihapus.'
          )
        )
          return;
        removeDownPayment('purchaseDownPayments', 'PO', 'purchases', id);
        toast('Uang muka dihapus', 'success');
        openPurchaseDP();
        break;
      }
      // Sales Target
      case 'addTarget':
        addTargetModal();
        break;
      case 'editTarget': {
        var t = ensureArr('salesTargets').find(function (x) {
          return x.id === id;
        });
        if (t) addTargetModal(t);
        break;
      }
      case 'delTarget': {
        if (!confirm('Hapus target ini?')) return;
        var arr3 = ensureArr('salesTargets');
        var idx3 = arr3.findIndex(function (x) {
          return x.id === id;
        });
        if (idx3 >= 0) arr3.splice(idx3, 1);
        save();
        toast('Target dihapus', 'success');
        openSalesTarget();
        break;
      }
      // Receive Item
      case 'addReceipt':
        addReceiptModal();
        break;
      case 'postReceipt':
        postReceipt(id);
        break;
      case 'viewReceipt': {
        var r = ensureArr('goodsReceipts').find(function (x) {
          return x.id === id;
        });
        if (r) {
          var itemList = (r.items || [])
            .map(function (i) {
              var w = i.weighing || {};
              var wInfo =
                w.suratJalanQty || w.grossQty || w.netQty
                  ? ' <span style="color:var(--muted);font-size:.75rem">(SJ: ' +
                    (w.suratJalanQty || 0) +
                    ', Netto: ' +
                    (w.netQty || 0) +
                    ')</span>'
                  : '';
              return (
                '<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:.75rem">' +
                esc(i.itemName) +
                ' — Qty: <strong>' +
                i.qty +
                '</strong>' +
                wInfo +
                '</div>'
              );
            })
            .join('');
          modal(
            'Detail Penerimaan ' + r.id,
            '<div style="display:flex;flex-direction:column;gap:8px">' +
              '<div>PO: <strong>' +
              esc(r.poId) +
              '</strong></div>' +
              '<div>Supplier: <strong>' +
              esc(r.supplierName) +
              '</strong></div>' +
              '<div>Tanggal: <strong>' +
              esc(r.date) +
              '</strong></div>' +
              '<div style="margin-top:8px;font-weight:700">Item Diterima:</div>' +
              itemList +
              '</div>',
            '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
            false
          );
        }
        break;
      }
      case 'delReceipt': {
        var arr4 = ensureArr('goodsReceipts');
        var idx4 = arr4.findIndex(function (x) {
          return x.id === id;
        });
        if (idx4 < 0) break;
        var gr = arr4[idx4];
        var grPO = (db().purchaseOrders || []).find(function (o) {
          return String(o.id) === String(gr.poId);
        });
        // A receipt invoiced on its own (Rekonsiliasi Timbangan) is undone after its invoice.
        var grInv = (db().purchaseInvoices || []).find(function (p) {
          return (p.status === 'Outstanding' || p.status === 'Paid') && String(p.receiptId) === String(gr.id);
        });
        if (grInv) {
          toast(
            'Penerimaan ini sudah difakturkan (' + (grInv.number || grInv.id) + '). Batalkan fakturnya terlebih dahulu.',
            'warning'
          );
          break;
        }
        if (gr.posted) {
          if (grPO && grPO.status === 'Received') {
            toast(
              'PO ' + (grPO.number || grPO.id) + ' sudah diterima penuh. Koreksi lewat Batalkan PO atau Retur Pembelian.',
              'warning'
            );
            break;
          }
          var grLines = receiptLines(gr);
          var grWh = gr.warehouseId || (grPO && grPO.warehouseId) || null;
          if (typeof window.stockShortages === 'function' && window.stockShortages(grLines, grWh).length) {
            toast('Barang dari penerimaan ini sudah terpakai, sehingga tidak bisa dihapus.', 'warning');
            break;
          }
          if (!confirm('Hapus penerimaan barang ini?\n\nStok yang sudah ditambahkan akan dikurangi kembali.')) return;
          if (typeof window.moveStockLines === 'function') window.moveStockLines(grLines, 'out', grWh);
        } else if (!confirm('Hapus draft penerimaan barang ini?')) {
          return;
        }
        arr4.splice(idx4, 1);
        save();
        toast('Penerimaan barang dihapus', 'success');
        openReceiveItem();
        break;
      }
      // Supplier Price
      case 'addSupPrice':
        addSupPriceModal();
        break;
      case 'editSupPrice': {
        var sp = ensureArr('supplierPrices').find(function (x) {
          return x.id === id;
        });
        if (sp) addSupPriceModal(sp);
        break;
      }
      case 'delSupPrice': {
        if (!confirm('Hapus harga supplier ini?')) return;
        var arr5 = ensureArr('supplierPrices');
        var idx5 = arr5.findIndex(function (x) {
          return x.id === id;
        });
        if (idx5 >= 0) arr5.splice(idx5, 1);
        save();
        toast('Harga dihapus', 'success');
        openSupplierPrice();
        break;
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPOSE TO MENU-COVERAGE
  // ══════════════════════════════════════════════════════════════════════════════
  window._salesPurchaseExtras = {
    openSalesDP: openSalesDP,
    openPurchaseDP: openPurchaseDP,
    openSalesTarget: openSalesTarget,
    openReceiveItem: openReceiveItem,
    openSupplierPrice: openSupplierPrice,
  };

  console.log('[SalesPurchaseExtras] Sales & Purchase extras ready');
})();
