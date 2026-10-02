// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Pipeline Extras  (pipeline-extras.js)
// Implements the operational trading pipeline glue:
//   PO Pembelian → Surat Jalan & Timbangan (weighbridge) → Rekonsiliasi →
//   Multi-Invoice → Pembayaran.
//
// The weighbridge (Timbangan) capture lives on goods receipts (collection
// goodsReceipts), extending the shape written by sales-purchase-extras.js so a
// receipt line can carry:
//   { itemId, itemName, qty (ordered basis), unitPrice,
//     weighing: { suratJalanQty, grossQty, tareQty, netQty },
//     reconciledQty }
// and the receipt itself carries { reconciled, reconciledAt }.
//
// The Rekonsiliasi screen compares ordered vs. surat-jalan vs. weighed (netto)
// per line, computes variances, and lets the operator confirm a reconciledQty
// that becomes the invoice basis (NOT the raw ordered qty).
//
// Purchase invoices are generated from reconciled receipts (partial /
// multi-invoice across staged receipts). GL journals are DERIVED by
// gl-sync.js → GL.reconcileAll() from the PI documents — this module never
// hand-writes a journal.
//
// The pure calculation helpers (weighing / variance / invoice-basis) are
// exposed on window._pipelineExtras so they are unit-testable without a DOM.
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
  function ensureArr(key) {
    if (!Array.isArray(db()[key])) db()[key] = [];
    return db()[key];
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
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function round2(v) {
    return Math.round((num(v) + Number.EPSILON) * 100) / 100;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PURE CALCULATION HELPERS (unit-testable, no DOM)
  // ════════════════════════════════════════════════════════════════════════════

  // Normalize a weighing capture into { suratJalanQty, grossQty, tareQty, netQty }.
  // netQty is always derived as gross − tare (never trusted from input), unless
  // no gross is supplied, in which case an explicit netQty is honored (single
  // netto tonnage capture).
  function computeWeighing(w) {
    w = w || {};
    var suratJalanQty = num(w.suratJalanQty);
    var grossQty = num(w.grossQty);
    var tareQty = num(w.tareQty);
    var netQty;
    if (w.grossQty === undefined || w.grossQty === null || w.grossQty === '') {
      // No gross reading — accept an explicit single netto figure if present.
      netQty = w.netQty === undefined || w.netQty === null || w.netQty === '' ? 0 : num(w.netQty);
    } else {
      netQty = round2(grossQty - tareQty);
    }
    return {
      suratJalanQty: round2(suratJalanQty),
      grossQty: round2(grossQty),
      tareQty: round2(tareQty),
      netQty: round2(netQty),
    };
  }

  // The quantity that should drive invoicing for a receipt line:
  //  - reconciledQty when the line has been reconciled,
  //  - else the weighed netQty when a weighbridge reading exists,
  //  - else the surat-jalan qty,
  //  - else the ordered qty.
  function invoiceBasisQty(line) {
    line = line || {};
    if (line.reconciledQty !== undefined && line.reconciledQty !== null && line.reconciledQty !== '') {
      return round2(line.reconciledQty);
    }
    var w = line.weighing;
    if (w && (w.netQty || w.netQty === 0) && (w.grossQty || w.netQty)) {
      return round2(w.netQty);
    }
    if (w && w.suratJalanQty) {
      return round2(w.suratJalanQty);
    }
    return round2(line.qty);
  }

  // Per-line variance breakdown for the reconciliation grid.
  //   orderVariance    = suratJalanQty − orderedQty  (delivered vs. ordered)
  //   weighVariance    = netQty        − suratJalanQty (weighed vs. declared)
  //   reconcileVariance= reconciledQty − netQty        (confirmed vs. weighed)
  function computeVariance(line) {
    line = line || {};
    var orderedQty = round2(line.qty);
    var w = computeWeighing(line.weighing);
    var suratJalanQty = w.suratJalanQty;
    var netQty = w.netQty;
    var reconciledQty =
      line.reconciledQty === undefined || line.reconciledQty === null || line.reconciledQty === ''
        ? netQty || suratJalanQty || orderedQty
        : round2(line.reconciledQty);
    return {
      orderedQty: orderedQty,
      suratJalanQty: suratJalanQty,
      netQty: netQty,
      reconciledQty: reconciledQty,
      orderVariance: round2(suratJalanQty - orderedQty),
      weighVariance: round2(netQty - suratJalanQty),
      reconcileVariance: round2(reconciledQty - netQty),
    };
  }

  // Build purchase-invoice lines from a receipt, using each line's invoice
  // basis (reconciledQty when reconciled). Lines with a zero basis are skipped.
  function buildInvoiceLinesFromReceipt(receipt) {
    var lines = [];
    (receipt && receipt.items ? receipt.items : []).forEach(function (it) {
      var qty = invoiceBasisQty(it);
      if (qty <= 0) return;
      var price = num(it.unitPrice != null ? it.unitPrice : it.price);
      lines.push({
        itemId: it.itemId,
        itemName: it.itemName,
        unit: it.unit || '',
        qty: qty,
        price: price,
        lineDiscount: 0,
        subtotal: round2(qty * price),
      });
    });
    return lines;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RECONCILIATION VIEW  (Rekonsiliasi Penerimaan)
  // ════════════════════════════════════════════════════════════════════════════
  function openReconciliation() {
    var receipts = ensureArr('goodsReceipts');
    var pis = db().purchaseInvoices || [];

    var rows = receipts
      .slice()
      .reverse()
      .map(function (r) {
        var invoicedCount = pis.filter(function (p) {
          return p.receiptId === r.id;
        }).length;
        var statusBadge = r.reconciled
          ? '<span class="badge" style="background:#DCFCE7;color:#166534">Terekonsiliasi</span>'
          : '<span class="badge" style="background:#FEF3C7;color:#92400E">Belum</span>';
        var invBadge =
          invoicedCount > 0
            ? '<span class="badge" style="background:#DBEAFE;color:#1E40AF">' +
              invoicedCount +
              ' faktur</span>'
            : '<span style="font-size:.8125rem;color:var(--muted)">—</span>';
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:.8125rem;font-weight:700">' +
          esc(r.id) +
          '</td>' +
          '<td class="td-p" style="font-size:.8125rem">' +
          esc(r.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc(r.poId) +
          '</td>' +
          '<td class="td-p">' +
          esc(r.supplierName || '—') +
          '</td>' +
          '<td class="td-p">' +
          (r.items || []).length +
          ' item</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          invBadge +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-primary" data-action="reconcileReceipt" data-id="' +
          esc(r.id) +
          '" style="font-size:.8125rem;padding:8px 12px;border-radius:6px;border:none;background:var(--primary);color:#fff;cursor:pointer">Rekonsiliasi</button> ' +
          (r.reconciled
            ? '<button class="action-primary" data-action="invoiceReceipt" data-id="' +
              esc(r.id) +
              '" style="font-size:.8125rem;padding:8px 12px;border-radius:6px;border:none;background:#10B981;color:#fff;cursor:pointer">Buat Faktur</button>'
            : '') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var reconciledCount = receipts.filter(function (r) {
      return r.reconciled;
    }).length;
    var pendingCount = receipts.length - reconciledCount;

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Rekonsiliasi Penerimaan',
            'Bandingkan qty pesanan, surat jalan, dan timbangan sebelum faktur',
            '',
            ''
          )
        : '<h1>Rekonsiliasi</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Penerimaan', value: String(receipts.length), sub: 'Dokumen' },
            {
              label: 'Terekonsiliasi',
              value: String(reconciledCount),
              sub: 'Siap difakturkan',
              color: '#10B981',
            },
            {
              label: 'Belum Rekonsiliasi',
              value: String(pendingCount),
              sub: 'Menunggu',
              color: '#F59E0B',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. PO</th><th>Supplier</th><th>Item</th><th>Rekonsiliasi</th><th>Faktur</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows ||
        '<tr><td colspan="8" class="td-empty">Belum ada penerimaan barang untuk direkonsiliasi.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function reconcileModal(receiptId) {
    var receipt = ensureArr('goodsReceipts').find(function (r) {
      return r.id === receiptId;
    });
    if (!receipt) {
      toast('Penerimaan tidak ditemukan', 'warning');
      return;
    }
    var po = (db().purchaseOrders || []).find(function (o) {
      return o.id === receipt.poId;
    });
    var poLines = po ? (po.lines && po.lines.length ? po.lines : po.items || []) : [];

    function orderedFor(it) {
      var pl = poLines.find(function (l) {
        return (
          (l.itemId != null && l.itemId === it.itemId) ||
          (l.itemName && l.itemName === it.itemName)
        );
      });
      return pl ? num(pl.qty) : num(it.qty);
    }

    var rowsHtml = (receipt.items || [])
      .map(function (it, idx) {
        var ordered = orderedFor(it);
        var w = computeWeighing(it.weighing);
        var basis = invoiceBasisQty(it);
        return (
          '<tr data-idx="' +
          idx +
          '">' +
          '<td style="padding:4px 6px;font-size:.8125rem">' +
          esc(it.itemName || it.itemId) +
          '</td>' +
          '<td style="padding:4px 6px;text-align:right;font-size:.8125rem">' +
          ordered +
          '</td>' +
          '<td style="padding:4px 6px"><input class="form-input rec-sj" type="number" min="0" step="0.01" value="' +
          (w.suratJalanQty || 0) +
          '" style="width:88px;font-size:.875rem;padding:4px 6px;text-align:right"></td>' +
          '<td style="padding:4px 6px"><input class="form-input rec-gross" type="number" min="0" step="0.01" value="' +
          (w.grossQty || 0) +
          '" style="width:88px;font-size:.875rem;padding:4px 6px;text-align:right"></td>' +
          '<td style="padding:4px 6px"><input class="form-input rec-tare" type="number" min="0" step="0.01" value="' +
          (w.tareQty || 0) +
          '" style="width:78px;font-size:.875rem;padding:4px 6px;text-align:right"></td>' +
          '<td style="padding:4px 6px;text-align:right;font-size:.8125rem;font-weight:700" class="rec-net">' +
          (w.netQty || 0) +
          '</td>' +
          '<td style="padding:4px 6px;text-align:right;font-size:.8125rem;font-weight:700" class="rec-var"></td>' +
          '<td style="padding:4px 6px"><input class="form-input rec-final" type="number" min="0" step="0.01" value="' +
          basis +
          '" data-itemid="' +
          esc(it.itemId != null ? it.itemId : '') +
          '" data-itemname="' +
          esc(it.itemName || '') +
          '" data-unit="' +
          esc(it.unit || '') +
          '" data-ordered="' +
          ordered +
          '" style="width:88px;font-size:.875rem;padding:4px 6px;text-align:right;background:#FEF9C3"></td>' +
          '<td style="padding:4px 6px"><input class="form-input rec-price" type="number" min="0" step="1" value="' +
          num(it.unitPrice != null ? it.unitPrice : it.price) +
          '" style="width:98px;font-size:.875rem;padding:4px 6px;text-align:right"></td>' +
          '</tr>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<div style="font-size:.875rem">PO <strong>' +
      esc(receipt.poId) +
      '</strong> — Supplier <strong>' +
      esc(receipt.supplierName || '—') +
      '</strong></div>' +
      '<div class="table-wrap"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="text-align:left;font-size:.8125rem;padding:6px">Item</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Qty PO</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Surat Jalan</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Bruto</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Tara</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Netto</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Selisih</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Qty Rekonsiliasi</th>' +
      '<th style="text-align:right;font-size:.8125rem;padding:6px">Harga</th>' +
      '</tr></thead><tbody>' +
      rowsHtml +
      '</tbody></table></div>' +
      '<div style="font-size:.8125rem;color:var(--muted)">Netto = Bruto − Tara. Qty Rekonsiliasi (kuning) menjadi dasar faktur.</div>' +
      '</div>';

    modal(
      'Rekonsiliasi ' + receipt.id,
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="rec-save" data-recid="' +
        esc(receipt.id) +
        '">Simpan Rekonsiliasi</button>',
      true
    );

    setTimeout(function () {
      function recompute(tr) {
        var gross = num(tr.querySelector('.rec-gross').value);
        var tare = num(tr.querySelector('.rec-tare').value);
        var sj = num(tr.querySelector('.rec-sj').value);
        var net = round2(gross - tare);
        tr.querySelector('.rec-net').textContent = net;
        var ordered = num(tr.querySelector('.rec-final').dataset.ordered);
        var v = tr.querySelector('.rec-var');
        var diff = round2(net - sj);
        v.textContent = diff;
        v.style.color = diff === 0 ? 'var(--muted)' : diff < 0 ? '#EF4444' : '#10B981';
      }
      var trs = document.querySelectorAll('tr[data-idx]');
      trs.forEach(function (tr) {
        recompute(tr);
        ['.rec-gross', '.rec-tare', '.rec-sj'].forEach(function (sel) {
          var el = tr.querySelector(sel);
          if (el) el.addEventListener('input', function () {
            recompute(tr);
          });
        });
      });

      var saveBtn = document.getElementById('rec-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var recId = saveBtn.dataset.recid;
          var rec = ensureArr('goodsReceipts').find(function (r) {
            return r.id === recId;
          });
          if (!rec) return;
          document.querySelectorAll('tr[data-idx]').forEach(function (tr, i) {
            var it = rec.items[i];
            if (!it) return;
            var gross = num(tr.querySelector('.rec-gross').value);
            var tare = num(tr.querySelector('.rec-tare').value);
            var sj = num(tr.querySelector('.rec-sj').value);
            it.weighing = computeWeighing({
              suratJalanQty: sj,
              grossQty: gross,
              tareQty: tare,
            });
            it.reconciledQty = round2(num(tr.querySelector('.rec-final').value));
            it.unitPrice = num(tr.querySelector('.rec-price').value);
          });
          rec.reconciled = true;
          rec.reconciledAt = today();
          save();
          closeM();
          toast('Rekonsiliasi disimpan', 'success');
          openReconciliation();
        });
      }
    }, 60);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MULTI-INVOICE  (create a Purchase Invoice from a reconciled receipt)
  // ════════════════════════════════════════════════════════════════════════════
  function invoiceFromReceipt(receiptId) {
    var receipt = ensureArr('goodsReceipts').find(function (r) {
      return r.id === receiptId;
    });
    if (!receipt) {
      toast('Penerimaan tidak ditemukan', 'warning');
      return;
    }
    if (!receipt.reconciled) {
      toast('Rekonsiliasi dulu sebelum membuat faktur', 'warning');
      return;
    }
    var lines = buildInvoiceLinesFromReceipt(receipt);
    if (lines.length === 0) {
      toast('Tidak ada qty untuk difakturkan', 'warning');
      return;
    }
    var po = (db().purchaseOrders || []).find(function (o) {
      return o.id === receipt.poId;
    });
    var subtotal = lines.reduce(function (s, l) {
      return s + num(l.subtotal);
    }, 0);
    var taxRate = po && po.taxRate ? po.taxRate : 0;
    var tax = round2(subtotal * taxRate);

    var invoices = ensureArr('purchaseInvoices');
    var maxId = invoices.reduce(function (m, i) {
      return Math.max(m, Number(i.id) || 0);
    }, 0);

    var inv = {
      id: maxId + 1,
      poId: receipt.poId,
      sourceId: receipt.poId,
      receiptId: receipt.id,
      supplier: receipt.supplierName || (po ? po.supplier : ''),
      supplierId: po ? po.supplierId : undefined,
      date: today(),
      dueDate: today(),
      status: 'Outstanding',
      taxRate: taxRate,
      tax: tax,
      amount: round2(subtotal + tax),
      paid: 0,
      lines: lines,
      createdAt: today(),
    };
    invoices.push(inv);

    // Mark the receipt invoiced; update DO / receipt status to reflect
    // partial vs. full invoicing across staged receipts for this PO.
    receipt.invoiced = true;
    updatePODeliveryInvoiceStatus(receipt.poId);

    save();
    toast('Faktur pembelian dibuat: PI-' + inv.id, 'success');
    openReconciliation();
  }

  // Reflect multi-invoice progress onto any Delivery Order linked to the PO:
  // 'Partially invoiced' when some (but not all) reconciled receipts are
  // invoiced, 'Invoiced' when every reconciled receipt for the PO is invoiced.
  function updatePODeliveryInvoiceStatus(poId) {
    var receipts = (db().goodsReceipts || []).filter(function (r) {
      return r.poId === poId && r.reconciled;
    });
    if (receipts.length === 0) return;
    var invoicedCount = receipts.filter(function (r) {
      return r.invoiced;
    }).length;
    var newStatus =
      invoicedCount === 0 ? null : invoicedCount >= receipts.length ? 'Invoiced' : 'Partially invoiced';
    if (!newStatus) return;
    (db().deliveryOrders || [])
      .filter(function (d) {
        return d.poId === poId || d.sourceId === poId;
      })
      .forEach(function (d) {
        d.status = newStatus;
      });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ════════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;
    switch (action) {
      case 'reconcileReceipt':
        reconcileModal(id);
        break;
      case 'invoiceReceipt':
        invoiceFromReceipt(id);
        break;
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // EXPOSE
  // ════════════════════════════════════════════════════════════════════════════
  window._pipelineExtras = {
    openReconciliation: openReconciliation,
    reconcileModal: reconcileModal,
    invoiceFromReceipt: invoiceFromReceipt,
    updatePODeliveryInvoiceStatus: updatePODeliveryInvoiceStatus,
    // pure calc helpers (unit-testable)
    computeWeighing: computeWeighing,
    computeVariance: computeVariance,
    invoiceBasisQty: invoiceBasisQty,
    buildInvoiceLinesFromReceipt: buildInvoiceLinesFromReceipt,
  };

  console.log('[PipelineExtras] Trading pipeline (weighbridge + reconciliation) ready');
})();
