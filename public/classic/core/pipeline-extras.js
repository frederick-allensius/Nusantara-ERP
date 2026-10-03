// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Pipeline Extras  (pipeline-extras.js)
// Implements the operational trading pipeline glue:
//   PO Pembelian → Surat Jalan & Timbangan (weighbridge) → Rekonsiliasi →
//   Multi-Invoice → Pembayaran.
//
// The weighbridge (Timbangan) capture lives on goods receipts (collection
// goodsReceipts), extending the shape written by sales-purchase-extras.js so a
// receipt line can carry:
//   { itemId, itemName, qty (received into stock), unitPrice,
//     weighing: { suratJalanQty, grossQty, tareQty, netQty },
//     reconciledQty }
// and the receipt itself carries { reconciled, reconciledAt }.
//
// The Rekonsiliasi Timbangan screen compares ordered vs. surat-jalan vs.
// weighed (netto) per line, computes variances, and lets the operator confirm a
// reconciledQty that becomes the invoice basis (NOT the raw ordered qty).
//
// Purchase invoices are generated from reconciled receipts (partial /
// multi-invoice across staged receipts), one per receipt (receiptId). GL
// journals are DERIVED by gl-sync.js → GL.reconcileAll() from the PI documents
// and, for receipts not invoiced yet, from the receipts themselves
// (GL.receivedNotInvoiced) — this module never hand-writes a journal.
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
  // netto tonnage capture). A gross of 0 counts as no gross reading: a stored
  // single-netto weighing carries grossQty 0, and normalizing it again must keep
  // its netto (computeWeighing(computeWeighing(x)) equals computeWeighing(x)).
  function computeWeighing(w) {
    w = w || {};
    var suratJalanQty = num(w.suratJalanQty);
    var grossQty = num(w.grossQty);
    var tareQty = num(w.tareQty);
    var netQty;
    if (!(grossQty > 0)) {
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

  // Weighing from form fields (receive grid, reconciliation): with a Bruto
  // reading the netto is derived (Bruto − Tara); without one the netto typed by
  // the operator is kept. Always goes through computeWeighing.
  function weighingFromFields(f) {
    f = f || {};
    var input = { suratJalanQty: f.suratJalanQty, tareQty: f.tareQty };
    if (num(f.grossQty) > 0) {
      input.grossQty = num(f.grossQty);
    } else {
      input.netQty = f.netQty;
    }
    return computeWeighing(input);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DOCUMENT LOOKUPS
  // ════════════════════════════════════════════════════════════════════════════
  function sameId(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }
  function isActiveInvoice(inv) {
    return !!inv && (inv.status === 'Outstanding' || inv.status === 'Paid');
  }
  function poOf(receipt) {
    return (
      (db().purchaseOrders || []).find(function (o) {
        return sameId(o.id, receipt && receipt.poId);
      }) || null
    );
  }
  function poLinesOf(po) {
    return po ? (po.lines && po.lines.length ? po.lines : po.items || []) : [];
  }
  function poLineFor(po, it) {
    return (
      poLinesOf(po).find(function (l) {
        return (l.itemId != null && sameId(l.itemId, it.itemId)) || (l.itemName && l.itemName === it.itemName);
      }) || null
    );
  }
  // PO line price after its line discount (what one unit costs on the PO).
  function netUnitPrice(l) {
    if (!l) return 0;
    var qty = num(l.qty);
    return qty > 0 && l.subtotal != null ? round2(num(l.subtotal) / qty) : num(l.price);
  }
  // The active purchase invoice made from a goods receipt, if any.
  function receiptInvoice(receiptId) {
    return (
      (db().purchaseInvoices || []).find(function (inv) {
        return isActiveInvoice(inv) && sameId(inv.receiptId, receiptId);
      }) || null
    );
  }
  // An active invoice that bills the whole PO (made from the PO, not a receipt).
  function wholeOrderInvoice(poId) {
    return (
      (db().purchaseInvoices || []).find(function (inv) {
        return (
          isActiveInvoice(inv) &&
          !inv.receiptId &&
          sameId(inv.sourceId, poId) &&
          (!inv.sourceType || inv.sourceType === 'PO')
        );
      }) || null
    );
  }
  function currentUser() {
    try {
      var u = window.erpAuth && window.erpAuth.getCurrentUser && window.erpAuth.getCurrentUser();
      return (u && (u.username || u.displayName || u.email)) || '';
    } catch (_) {
      return '';
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RECONCILIATION VIEW  (Rekonsiliasi Timbangan)
  // ════════════════════════════════════════════════════════════════════════════
  function openReconciliation() {
    var receipts = ensureArr('goodsReceipts');

    var rows = receipts
      .slice()
      .reverse()
      .map(function (r) {
        var po = poOf(r);
        var inv = receiptInvoice(r.id);
        var statusBadge = r.reconciled
          ? '<span class="badge badge-success">Direkonsiliasi</span>'
          : '<span class="badge badge-warning">Belum</span>';
        var invCell = inv
          ? '<span class="badge badge-info">' + esc(inv.number || inv.id) + '</span>'
          : '<span class="t-muted">—</span>';
        return (
          '<tr>' +
          '<td class="td-p t-strong">' +
          esc(r.id) +
          '</td>' +
          '<td class="td-p">' +
          esc(r.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc(po ? po.number || po.id : r.poId) +
          '</td>' +
          '<td class="td-p">' +
          esc(r.supplierName || (po && po.supplier) || '—') +
          '</td>' +
          '<td class="td-p">' +
          (r.items || []).length +
          ' item</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          invCell +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-primary" data-action="reconcileReceipt" data-id="' +
          esc(r.id) +
          '">' +
          (inv ? 'Lihat' : 'Rekonsiliasi') +
          '</button> ' +
          (r.reconciled && !inv
            ? '<button class="action-primary" data-action="invoiceReceipt" data-id="' +
              esc(r.id) +
              '">Buat Faktur</button>'
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
            'Rekonsiliasi Timbangan',
            'Bandingkan qty pesanan, surat jalan, dan timbangan sebelum faktur',
            '',
            ''
          )
        : '<h1>Rekonsiliasi Timbangan</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Penerimaan', value: String(receipts.length), sub: 'Dokumen' },
            {
              label: 'Direkonsiliasi',
              value: String(reconciledCount),
              sub: 'Siap difakturkan',
              color: 'var(--success)',
            },
            {
              label: 'Belum Direkonsiliasi',
              value: String(pendingCount),
              sub: 'Menunggu',
              color: 'var(--warning)',
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
      return sameId(r.id, receiptId);
    });
    if (!receipt) {
      toast('Penerimaan tidak ditemukan', 'warning');
      return;
    }
    var po = poOf(receipt);
    // A receipt on an active invoice is read-only: the invoice was built from
    // these figures. Cancel the invoice first to change them.
    var inv = receiptInvoice(receipt.id);
    var lock = inv ? ' disabled' : '';

    var rowsHtml = (receipt.items || [])
      .map(function (it, idx) {
        var pl = poLineFor(po, it);
        var ordered = pl ? num(pl.qty) : num(it.qty);
        var w = computeWeighing(it.weighing);
        var basis = invoiceBasisQty(it);
        var price = num(it.unitPrice != null ? it.unitPrice : it.price);
        if (!(price > 0)) price = netUnitPrice(pl);
        return (
          '<tr data-idx="' +
          idx +
          '">' +
          '<td>' +
          esc(it.itemName || it.itemId) +
          '</td>' +
          '<td class="t-num">' +
          ordered +
          '</td>' +
          '<td><input class="form-input t-num rec-sj" type="number" min="0" step="any" value="' +
          (w.suratJalanQty || 0) +
          '" style="min-width:4.5rem"' +
          lock +
          '></td>' +
          '<td><input class="form-input t-num rec-gross" type="number" min="0" step="any" value="' +
          (w.grossQty || '') +
          '" placeholder="0" style="min-width:4.5rem"' +
          lock +
          '></td>' +
          '<td><input class="form-input t-num rec-tare" type="number" min="0" step="any" value="' +
          (w.tareQty || '') +
          '" placeholder="0" style="min-width:4.5rem"' +
          lock +
          '></td>' +
          '<td><input class="form-input t-num rec-net" type="number" min="0" step="any" value="' +
          (w.netQty || '') +
          '" placeholder="0" title="Isi langsung bila tanpa Bruto" style="min-width:4.5rem;font-weight:600"' +
          lock +
          '></td>' +
          '<td class="t-num rec-var" style="font-weight:600"></td>' +
          '<td><input class="form-input t-num rec-final" type="number" min="0" step="any" value="' +
          basis +
          '" data-ordered="' +
          ordered +
          '" style="min-width:4.5rem;background:var(--warning-bg)"' +
          lock +
          '></td>' +
          '<td><input class="form-input t-num rec-price" type="number" min="0" step="any" value="' +
          price +
          '" style="min-width:6.5rem"' +
          lock +
          '></td>' +
          '</tr>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      (inv
        ? '<div class="notice notice-info">Penerimaan ini sudah difakturkan (' +
          esc(inv.number || inv.id) +
          '). Batalkan fakturnya terlebih dahulu untuk mengubah rekonsiliasi.</div>'
        : '') +
      '<div style="font-size:.875rem">PO <strong>' +
      esc(po ? po.number || po.id : receipt.poId) +
      '</strong> — Supplier <strong>' +
      esc(receipt.supplierName || (po && po.supplier) || '—') +
      '</strong></div>' +
      '<div class="table-wrap"><table class="line-items-table" id="rec-table">' +
      '<thead><tr>' +
      '<th>Barang</th>' +
      '<th class="t-num">Qty PO</th>' +
      '<th class="t-num">Surat Jalan</th>' +
      '<th class="t-num">Bruto</th>' +
      '<th class="t-num">Tara</th>' +
      '<th class="t-num">Netto</th>' +
      '<th class="t-num">Selisih</th>' +
      '<th class="t-num">Qty Rekonsiliasi</th>' +
      '<th class="t-num">Harga</th>' +
      '</tr></thead><tbody>' +
      rowsHtml +
      '</tbody></table></div>' +
      '<div style="font-size:.8125rem;color:var(--muted)">Netto = Bruto − Tara; tanpa Bruto, Netto diisi langsung. Selisih = Netto − Surat Jalan. Qty Rekonsiliasi (kolom berwarna) menjadi dasar faktur.</div>' +
      '</div>';

    modal(
      'Rekonsiliasi ' + receipt.id,
      body,
      inv
        ? '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
        : '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
            '<button class="btn" id="rec-save" data-recid="' +
            esc(receipt.id) +
            '">Simpan Rekonsiliasi</button>',
      true
    );

    setTimeout(function () {
      var table = document.getElementById('rec-table');
      if (!table) return;
      function fields(tr) {
        return {
          suratJalanQty: num(tr.querySelector('.rec-sj').value),
          grossQty: num(tr.querySelector('.rec-gross').value),
          tareQty: num(tr.querySelector('.rec-tare').value),
          netQty: num(tr.querySelector('.rec-net').value),
        };
      }
      function recompute(tr) {
        var f = fields(tr);
        var netEl = tr.querySelector('.rec-net');
        if (f.grossQty > 0) {
          // Bruto present → Netto is derived and read-only.
          netEl.value = weighingFromFields(f).netQty;
          netEl.readOnly = true;
        } else if (!inv) {
          netEl.readOnly = false;
        }
        var w = weighingFromFields(f);
        var v = tr.querySelector('.rec-var');
        var diff = round2(w.netQty - w.suratJalanQty);
        v.textContent = diff;
        v.style.color = diff === 0 ? 'var(--muted)' : diff < 0 ? 'var(--danger)' : 'var(--success)';
      }
      var trs = table.querySelectorAll('tr[data-idx]');
      trs.forEach(function (tr) {
        recompute(tr);
        ['.rec-gross', '.rec-tare', '.rec-sj', '.rec-net'].forEach(function (sel) {
          var el = tr.querySelector(sel);
          if (el)
            el.addEventListener('input', function () {
              recompute(tr);
            });
        });
      });

      var saveBtn = document.getElementById('rec-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var recId = saveBtn.dataset.recid;
          var rec = ensureArr('goodsReceipts').find(function (r) {
            return sameId(r.id, recId);
          });
          if (!rec) return;
          if (receiptInvoice(rec.id)) {
            toast('Penerimaan ini sudah difakturkan', 'warning');
            return;
          }
          var rowsEl = table.querySelectorAll('tr[data-idx]');
          var bad = false;
          rowsEl.forEach(function (tr) {
            var f = fields(tr);
            if (f.grossQty > 0 && f.tareQty > f.grossQty) bad = true;
          });
          if (bad) {
            toast('Tara tidak boleh lebih besar dari Bruto', 'warning');
            return;
          }
          rowsEl.forEach(function (tr) {
            var it = rec.items[Number(tr.dataset.idx)];
            if (!it) return;
            it.weighing = weighingFromFields(fields(tr));
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
  // The invoice follows the app's purchase-invoice model (invoice-view.js): a
  // DocEngine number as id and number, the PO as source (sourceType 'PO'), PPN
  // from the PO, a due date from the supplier's payment term and no stored
  // `paid` — balances come from payments (balances.js). receiptId ties it to the
  // goods receipt; gl.js then posts the PO's other receipts on their own until
  // they are invoiced too (GL.receivedNotInvoiced).
  function invoiceFromReceipt(receiptId) {
    var receipt = ensureArr('goodsReceipts').find(function (r) {
      return sameId(r.id, receiptId);
    });
    if (!receipt) {
      toast('Penerimaan tidak ditemukan', 'warning');
      return null;
    }
    if (!receipt.reconciled) {
      toast('Rekonsiliasi dulu sebelum membuat faktur', 'warning');
      return null;
    }
    var po = poOf(receipt);
    if (!po || po.status === 'Cancelled') {
      toast('PO dari penerimaan ini tidak ditemukan atau sudah dibatalkan', 'warning');
      return null;
    }
    var existing = receiptInvoice(receipt.id);
    if (existing) {
      toast('Penerimaan ' + receipt.id + ' sudah difakturkan (' + (existing.number || existing.id) + ')', 'info');
      return null;
    }
    var whole = wholeOrderInvoice(po.id);
    if (whole) {
      toast(
        'PO ' + (po.number || po.id) + ' sudah difakturkan utuh (' + (whole.number || whole.id) + ')',
        'warning'
      );
      return null;
    }
    var lines = buildInvoiceLinesFromReceipt(receipt);
    if (lines.length === 0) {
      toast('Tidak ada qty untuk difakturkan', 'warning');
      return null;
    }

    var data = db();
    if (!data.numberSequences || typeof data.numberSequences !== 'object') data.numberSequences = {};
    var date = today();
    var number =
      window.DocEngine && typeof window.DocEngine.nextNumber === 'function'
        ? window.DocEngine.nextNumber('PI', date, { sequences: data.numberSequences, commit: true })
        : 'PI-' + Date.now();
    var net = lines.reduce(function (s, l) {
      return s + num(l.subtotal);
    }, 0);
    var rate = num(po.taxRate) > 0 ? num(po.taxRate) : 0;
    var incl = rate > 0 && !!po.taxInclusive;
    var tax = rate > 0 ? Math.round(incl ? (net * rate) / (1 + rate) : net * rate) : 0;
    var supplier =
      (data.suppliers || []).find(function (s) {
        return sameId(s.id, po.supplierId);
      }) ||
      (data.suppliers || []).find(function (s) {
        return s.name && s.name === po.supplier;
      }) ||
      null;
    var B = window.Balances;
    var dueDate =
      B && typeof B.addDays === 'function' && typeof B.termDays === 'function'
        ? B.addDays(date, B.termDays(supplier))
        : null;

    var inv = {
      id: number,
      number: number,
      date: date,
      dueDate: dueDate || null,
      status: 'Outstanding',
      supplier: po.supplier || receipt.supplierName || '',
      supplierId: po.supplierId != null ? String(po.supplierId) : null,
      sourceId: po.id,
      sourceType: 'PO',
      sourceNumber: po.number || po.id,
      receiptId: receipt.id,
      lines: lines,
      taxRate: rate,
      taxInclusive: incl,
      tax: tax,
      amount: Math.round(incl ? net : net + tax),
      note: 'Penerimaan ' + receipt.id + (receipt.date ? ' (' + receipt.date + ')' : ''),
      createdBy: currentUser(),
    };
    ensureArr('purchaseInvoices').push(inv);

    // Kept for older readers; the active invoice (receiptId) is the record.
    receipt.invoiced = true;
    updatePODeliveryInvoiceStatus(po.id);

    save();
    toast('Faktur pembelian ' + number + ' dibuat dari ' + receipt.id, 'success');
    openReconciliation();
    return inv;
  }

  // Reflect multi-invoice progress onto delivery orders linked to the PO:
  // 'Partially invoiced' when some (but not all) reconciled receipts have an
  // active invoice, 'Invoiced' when all of them do. Trading pickup slots
  // (pickup: true, trading.js) keep their own trip status, and cancelled
  // delivery orders stay cancelled.
  function updatePODeliveryInvoiceStatus(poId) {
    var receipts = (db().goodsReceipts || []).filter(function (r) {
      return sameId(r.poId, poId) && r.reconciled;
    });
    if (receipts.length === 0) return;
    var invoicedCount = receipts.filter(function (r) {
      return !!receiptInvoice(r.id);
    }).length;
    var newStatus =
      invoicedCount === 0 ? null : invoicedCount >= receipts.length ? 'Invoiced' : 'Partially invoiced';
    if (!newStatus) return;
    (db().deliveryOrders || [])
      .filter(function (d) {
        return (
          d &&
          d.pickup !== true &&
          d.status !== 'Cancelled' &&
          (sameId(d.poId, poId) || sameId(d.sourceId, poId))
        );
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
    weighingFromFields: weighingFromFields,
    computeVariance: computeVariance,
    invoiceBasisQty: invoiceBasisQty,
    buildInvoiceLinesFromReceipt: buildInvoiceLinesFromReceipt,
  };

  console.log('[PipelineExtras] Trading pipeline (weighbridge + reconciliation) ready');
})();
