// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Pengambilan pages  (pickup-view.js)
//
// Screens for the trading pickup flow over window.Trading (trading.js):
//   openOrders        PO Pengambilan — pickup POs with quota/cut-off progress and
//                     their surat jalan; open a confirmed PO for pickup
//   openPO(poId)      one pickup PO: its surat jalan, export, close/reopen
//   openSetup(poId)   dialog that opens a confirmed PO for pickup
//   openRecord        Catat Pengambilan — record a truck (phone-friendly)
//   openRecapImport   Impor Rekap Timbangan — Excel from the weighbridge
//   openWeightChanges Perubahan Timbangan — weight changes and open alerts
//   openTripRecap     Rekap Pengambilan — trips per period, export to Excel
//
// The model, quota/cut-off rules, recap matching and accounting live in
// trading.js; this file only renders and calls it, then window.saveDB().
//
// Renders into #view-pickups (shared with pickup-billing.js). Events are
// delegated on document via data-action (CSP: no inline handlers). Write actions
// are named so rbac.js's prefix guard recognises them (create/save/void/edit/
// update…); read-only actions start with "pv".
//
// Global-scope rule: classic <script>, IIFE-wrapped; exposes window.renderPickups
// and window._pickupView.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var PHOTO_MAX_SIDE = 1280;
  var PHOTO_LIMIT = 300 * 1024;
  var CLOSE_LABEL = {
    quota: 'kuota terpenuhi',
    cutoff: 'lewat batas pengambilan',
    manual: 'ditutup manual',
  };
  // voidReason written by Trading.closePickupPO for slots it voids ("PO " + label).
  var CLOSE_VOID_REASONS = ['PO kuota terpenuhi', 'PO lewat cut-off', 'PO ditutup manual'];
  var SLOT_STATUS = {
    Pending: ['info', 'Siap'],
    Delivered: ['success', 'Diambil'],
    Invoiced: ['neutral', 'Ditagih'],
    Cancelled: ['danger', 'Batal'],
  };

  // ── Small helpers ───────────────────────────────────────────────────────────
  function T() {
    return window.Trading || null;
  }
  function db() {
    return window.DB || {};
  }
  function list(key) {
    var v = db()[key];
    return Array.isArray(v) ? v : [];
  }
  function esc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function same(a, b) {
    return (
      a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)
    );
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function r3(v) {
    return Math.round(num(v) * 1000) / 1000;
  }
  function find(coll, id) {
    if (id === null || id === undefined || id === '') return null;
    return (
      list(coll).find(function (d) {
        return same(d.id, id);
      }) || null
    );
  }
  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  function isoOf(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayISO() {
    return isoOf(new Date());
  }
  function monthStartISO(iso) {
    return String(iso).slice(0, 7) + '-01';
  }
  function monthEndISO(iso) {
    var y = Number(String(iso).slice(0, 4));
    var m = Number(String(iso).slice(5, 7));
    return y + '-' + pad2(m) + '-' + pad2(new Date(y, m, 0).getDate());
  }
  function daysFrom(a, b) {
    var da = new Date(String(a).slice(0, 10) + 'T00:00:00');
    var dz = new Date(String(b).slice(0, 10) + 'T00:00:00');
    return Math.round((dz - da) / 86400000);
  }
  function fmtT(n) {
    return Number(r3(n)).toLocaleString('id-ID', { maximumFractionDigits: 3 });
  }
  function qty(n, unit) {
    return fmtT(n) + (unit ? ' ' + unit : '');
  }
  function fmtInput(n) {
    return String(r3(n)).replace('.', ',');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return fmtDate(isoOf(d)) + ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes());
  }
  // "47,5" / "47.5" / "1.250,5" / "1,250.5" → number; '' → null.
  function parseNumInput(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      s =
        s.lastIndexOf(',') > s.lastIndexOf('.')
          ? s.replace(/\./g, '').replace(',', '.')
          : s.replace(/,/g, '');
    } else if (s.indexOf(',') !== -1) {
      s = s.replace(',', '.');
    }
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  }
  function save() {
    if (typeof window.saveDB === 'function') window.saveDB();
  }
  function openDialog(title, body, footer, wide) {
    if (typeof window.openModal === 'function') window.openModal(title, body, footer, wide);
  }
  function closeDialog() {
    if (typeof window.closeModal === 'function') window.closeModal();
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }
  // Where a weight change came from: 'manual' = Koreksi berat; recaps carry
  // their file name ("Rekap <file> <date>").
  function sourceLabel(src) {
    if (!src) return '—';
    if (src === 'manual') return 'Koreksi manual';
    if (src === 'rekap') return 'Rekap timbangan';
    return String(src);
  }
  function badge(kind, text) {
    return '<span class="badge badge-' + kind + '">' + esc(text) + '</span>';
  }
  function button(label, action, id, cls, extra) {
    return (
      '<button type="button" class="' +
      (cls || 'btn-ghost') +
      '" data-action="' +
      action +
      '"' +
      (id !== null && id !== undefined ? ' data-id="' + esc(id) + '"' : '') +
      (extra || '') +
      '>' +
      esc(label) +
      '</button>'
    );
  }
  function header(title, sub, actions) {
    return (
      '<div class="sec-hdr"><div><h1>' +
      esc(title) +
      '</h1>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') +
      '</div>' +
      (actions ? '<div class="pv-hdr-actions">' + actions + '</div>' : '') +
      '</div>'
    );
  }
  function stats(items) {
    if (typeof window.statRow === 'function') return window.statRow(items);
    return (
      '<div class="stat-row">' +
      items
        .map(function (s) {
          return (
            '<div class="card stat-card"><div class="stat-label">' +
            esc(s.label) +
            '</div><div class="stat-val">' +
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
  function detail(label, valueHtml) {
    return (
      '<div class="detail-item"><div class="detail-label">' +
      esc(label) +
      '</div><div class="detail-value">' +
      valueHtml +
      '</div></div>'
    );
  }
  // A titled card with an edge-to-edge table (.card > .table-wrap in style.css).
  // opts.cards: on phones each row shows as a card (rows mark their cells with
  // data-cell; mobile.css "List cards on phones").
  function tableCard(title, sub, head, rows, opts) {
    opts = opts || {};
    return (
      '<div class="card">' +
      '<div class="card-head"><div><div class="card-title">' +
      esc(title) +
      '</div>' +
      (sub ? '<div class="card-sub">' + esc(sub) + '</div>' : '') +
      '</div>' +
      (opts.actions || '') +
      '</div>' +
      (rows.length
        ? '<div class="table-wrap"><table class="data-table' +
          (opts.wrap ? '' : ' pv-table') +
          (opts.cards ? ' list-cards' : '') +
          '"><thead><tr>' +
          head
            .map(function (h) {
              var isNum = h.charAt(0) === '#';
              return (
                '<th' +
                (isNum ? ' class="t-num"' : '') +
                '>' +
                esc(isNum ? h.slice(1) : h) +
                '</th>'
              );
            })
            .join('') +
          '</tr></thead><tbody>' +
          rows.join('') +
          '</tbody>' +
          (opts.foot || '') +
          '</table></div>'
        : '<div class="empty-inline">' + esc(opts.empty || 'Tidak ada data.') + '</div>') +
      '</div>'
    );
  }
  function download(name, sheets) {
    if (!window.NSAXlsx || typeof window.NSAXlsx.download !== 'function') {
      toast('Ekspor Excel belum siap. Muat ulang halaman.', 'danger');
      return false;
    }
    window.NSAXlsx.download(String(name).replace(/[\\/:*?"<>|]+/g, '-'), sheets);
    return true;
  }

  // ── Domain helpers (read-only over Trading) ──────────────────────────────────
  function poNo(po) {
    return po ? po.number || po.id : '';
  }
  function lineOf(o) {
    var l = (o && (o.lines || o.items)) || [];
    return l[0] || {};
  }
  function isOpenPO(po) {
    return !!po && po.status !== 'Closed' && po.status !== 'Cancelled';
  }
  function pickupPOs() {
    var t = T();
    return t ? list('purchaseOrders').filter(t.isPickupOrder) : [];
  }
  function soOf(po) {
    return po && po.pickupFlow ? find('salesOrders', po.pickupFlow.soId) : null;
  }
  function customerOf(po) {
    var so = soOf(po);
    return so ? so.customer || '' : '';
  }
  function defaultCapacity() {
    var s = (db().settings || {}).trading || {};
    return num(s.truckCapacity) || (T() ? T().DEFAULT_CAPACITY : 35);
  }
  function readyPOs() {
    return list('purchaseOrders').filter(function (po) {
      return po.status === 'Confirmed' && !po.pickupFlow && (po.lines || []).length === 1;
    });
  }
  function multiItemPOs() {
    return list('purchaseOrders').filter(function (po) {
      return po.status === 'Confirmed' && !po.pickupFlow && (po.lines || []).length > 1;
    });
  }
  function openSlots(po) {
    return T()
      .slotsFor(po.id)
      .filter(function (d) {
        return d.status === 'Pending';
      });
  }
  function recordablePOs() {
    return pickupPOs()
      .filter(function (po) {
        return isOpenPO(po) && openSlots(po).length > 0;
      })
      .sort(byCutoff);
  }
  function byCutoff(a, b) {
    var t = T();
    return (
      String(t.usage(a).cutoff).localeCompare(String(t.usage(b).cutoff)) ||
      String(a.date || '').localeCompare(String(b.date || ''))
    );
  }
  function invoiceRefs(d) {
    var t = T();
    var si = t.coveringInvoice('sales', d.id);
    var pi = t.coveringInvoice('purchases', d.id);
    return { si: si ? si.number || si.id : '', pi: pi ? pi.number || pi.id : '' };
  }
  function unitOfSlot(d) {
    return ((d && d.lines && d.lines[0]) || {}).unit || '';
  }
  function itemOfSlot(d) {
    return ((d && d.lines && d.lines[0]) || {}).itemName || '';
  }
  function slotBadge(d) {
    var s = SLOT_STATUS[d.status] || ['neutral', d.status || '—'];
    return badge(s[0], s[1]);
  }
  function slotFlags(d) {
    var out = [];
    if (d.weightAlert && !d.weightAlert.resolved) out.push(badge('danger', 'Berat berubah'));
    else if (d.weightAlert) out.push(badge('neutral', 'Berat berubah · selesai'));
    if (d.destChanged) out.push(badge('warning', 'Tujuan diubah'));
    return out.join(' ');
  }
  function poStatusBadge(po, u) {
    if (po.status === 'Cancelled') return badge('neutral', 'Batal');
    if (po.status === 'Closed') {
      return badge('neutral', 'Selesai · ' + (CLOSE_LABEL[po.closedReason] || 'ditutup'));
    }
    if (u.pastCutoff) return badge('warning', 'Berjalan · lewat batas');
    return badge('success', 'Berjalan');
  }
  function cutoffCell(po, u) {
    var html = esc(fmtDate(u.cutoff));
    if (!isOpenPO(po) || !u.cutoff) return html;
    var left = daysFrom(todayISO(), u.cutoff);
    if (left < 0) return html + ' ' + badge('danger', 'lewat');
    if (left === 0) return html + ' ' + badge('warning', 'hari terakhir');
    if (left <= 3) return html + ' ' + badge('warning', left + ' hari lagi');
    return html;
  }
  function progress(u) {
    var pct = u.ordered > 0 ? Math.min(100, (u.taken / u.ordered) * 100) : 0;
    return (
      '<div class="pv-bar' +
      (u.over > 0 ? ' pv-over' : '') +
      '"><div class="pv-bar-text">' +
      esc(fmtT(u.taken)) +
      ' / ' +
      esc(qty(u.ordered, u.unit)) +
      ' <span class="t-muted">(' +
      Math.round(u.ordered > 0 ? (u.taken / u.ordered) * 100 : 0) +
      '%)</span></div><div class="cust-bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      Math.round(pct) +
      '"><div class="cust-bar-fill" style="width:' +
      pct.toFixed(1) +
      '%"></div></div></div>'
    );
  }

  // ── State ───────────────────────────────────────────────────────────────────
  var S = {
    page: 'orders',
    ordersTab: 'open',
    poId: null,
    setupPoId: null,
    rec: emptyRecord(),
    recap: null,
    trip: null,
  };
  function emptyRecord() {
    return {
      poId: '',
      slotId: '',
      date: '',
      vehicle: '',
      driver: '',
      gross: '',
      tare: '',
      net: '',
      dest: '',
      destFor: '',
      ticketNo: '',
      note: '',
      photo: '',
      photoKB: 0,
      last: null,
    };
  }

  var PAGES = {
    orders: { label: 'PO Pengambilan', render: renderOrders },
    po: { label: 'PO Pengambilan', render: renderPODetail },
    record: { label: 'Catat Pengambilan', render: renderRecord },
    recap: { label: 'Impor Rekap Timbangan', render: renderRecap },
    changes: { label: 'Perubahan Timbangan', render: renderChanges },
    tripRecap: { label: 'Rekap Pengambilan', render: renderTripRecap },
  };

  function renderPickups() {
    ensureStyles();
    if (!T()) {
      return (
        header('Pengambilan', '') +
        '<div class="card"><div class="empty-inline">Modul pengambilan belum termuat. Muat ulang halaman.</div></div>'
      );
    }
    var b = window._pickupBilling;
    if (b && typeof b.isActive === 'function' && b.isActive()) {
      setTimeout(b.afterRender, 0);
      return b.html();
    }
    var ib = window._recapInbox;
    if (ib && typeof ib.isActive === 'function' && ib.isActive()) {
      return ib.html();
    }
    var p = PAGES[S.page] || PAGES.orders;
    return p.render();
  }

  function show(page) {
    var b = window._pickupBilling;
    if (b && typeof b.leave === 'function') b.leave();
    var ib = window._recapInbox;
    if (ib && typeof ib.leave === 'function') ib.leave();
    S.page = PAGES[page] ? page : 'orders';
    if (typeof window.invalidateView === 'function') window.invalidateView('pickups');
    if (typeof window.navigate === 'function') window.navigate('pickups');
    if (window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive(PAGES[S.page].label);
    }
  }
  // Re-render the current page, keeping focus on the control that triggered it.
  function rerender() {
    var a = document.activeElement;
    var focusId = a && a.id && a.id.indexOf('pv-') === 0 ? a.id : '';
    show(S.page);
    var el = focusId ? document.getElementById(focusId) : null;
    if (el && typeof el.focus === 'function') {
      try {
        el.focus();
      } catch (_) {
        /* ignore */
      }
    }
  }
  function scrollTop() {
    var el = document.getElementById('view-pickups');
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start' });
      } catch (_) {
        /* ignore */
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PO Pengambilan (list)
  // ═══════════════════════════════════════════════════════════════════════════
  function openOrders() {
    var t = T();
    if (t) {
      var closed = t.sweepCutoffs();
      if (closed.length) {
        save();
        toast(
          closed.length +
            ' PO ditutup karena lewat batas pengambilan: ' +
            closed.map(poNo).join(', ') +
            '. Surat jalan yang belum dipakai dibatalkan.',
          'warning'
        );
      }
    }
    show('orders');
  }

  function renderOrders() {
    var t = T();
    var all = pickupPOs();
    var open = all.filter(isOpenPO).sort(byCutoff);
    var done = all
      .filter(function (po) {
        return !isOpenPO(po);
      })
      .sort(function (a, b) {
        return String(b.closedAt || b.date || '').localeCompare(String(a.closedAt || a.date || ''));
      });
    var alerts = t.openAlerts();
    var slotsReady = open.reduce(function (s, po) {
      return s + t.usage(po).tripsOpen;
    }, 0);

    var html = header(
      'PO Pengambilan',
      '',
      button('Catat Pengambilan', 'addPickupTrip', null, 'btn') +
        button('Impor Rekap Timbangan', 'pvGoRecap')
    );
    html += stats([
      {
        label: 'PO berjalan',
        value: String(open.length),
        sub: 'dari ' + all.length + ' PO pengambilan',
      },
      { label: 'Surat jalan siap', value: String(slotsReady), sub: 'belum dipakai truk' },
    ]);
    if (alerts.length) {
      html +=
        '<div class="notice notice-warning"><div>' +
        esc(alerts.length + ' surat jalan berubah berat setelah ditagih.') +
        ' ' +
        button('Buka Perubahan Timbangan', 'pvGoChanges', null, 'btn-ghost btn-sm') +
        '</div></div>';
    }

    html +=
      '<div class="seg-tabs" role="tablist">' +
      ['open', 'done']
        .map(function (k) {
          // The number of POs as a small badge beside the label.
          var label = k === 'open' ? 'Berjalan' : 'Selesai';
          var n = k === 'open' ? open.length : done.length;
          return (
            '<button type="button" role="tab" class="seg-tab' +
            (S.ordersTab === k ? ' active' : '') +
            '" aria-selected="' +
            (S.ordersTab === k) +
            '" data-action="pvOrdersTab" data-id="' +
            k +
            '">' +
            esc(label) +
            '<span class="seg-count">' +
            n +
            '</span></button>'
          );
        })
        .join('') +
      '</div>';

    if (S.ordersTab === 'done') {
      html += tableCard(
        'PO selesai',
        '',
        ['PO', 'Supplier', 'Pelanggan', 'Barang', 'Diambil', '#Surat jalan', 'Batas', 'Status'],
        done.map(poRow),
        { empty: 'Belum ada PO pengambilan yang selesai.', wrap: true, cards: true }
      );
    } else {
      html += tableCard(
        'PO berjalan',
        '',
        ['PO', 'Supplier', 'Pelanggan', 'Barang', 'Diambil', '#Surat jalan', 'Batas', 'Status'],
        open.map(poRow),
        {
          empty:
            'Belum ada PO pengambilan yang berjalan. Buka PO dari daftar "PO siap dibuka" di bawah.',
          actions: open.length ? supplierExport(open) : '',
          wrap: true,
          cards: true,
        }
      );
    }

    html += readySection();
    return html;
  }

  function poRow(po) {
    var t = T();
    var u = t.usage(po);
    var so = soOf(po);
    return (
      '<tr data-action="pvOpenPO" data-id="' +
      esc(po.id) +
      '">' +
      '<td class="pv-nowrap" data-cell="title"><div class="doc-no">' +
      esc(poNo(po)) +
      '</div><div class="t-muted">' +
      esc(fmtDate(po.date)) +
      '</div></td>' +
      '<td data-cell="name">' +
      esc(po.supplier || '—') +
      '</td>' +
      '<td data-cell="meta" data-cap="Pelanggan"><span>' +
      esc(customerOf(po) || '—') +
      '</span>' +
      (so ? '<div class="t-muted doc-no">' + esc(so.number || so.id) + '</div>' : '') +
      '</td>' +
      '<td data-cell="meta">' +
      esc(lineOf(po).itemName || '—') +
      '</td>' +
      '<td data-cell="amount">' +
      progress(u) +
      '</td>' +
      '<td class="t-num" data-cell="meta" data-cap="Surat jalan"><span>' +
      u.tripsUsed +
      ' / ' +
      u.tripsMax +
      '</span><div class="t-muted">' +
      u.tripsOpen +
      ' siap</div></td>' +
      '<td class="pv-nowrap" data-cell="meta" data-cap="Batas">' +
      cutoffCell(po, u) +
      '</td>' +
      '<td data-cell="status">' +
      poStatusBadge(po, u) +
      '</td>' +
      '</tr>'
    );
  }

  function supplierKey(po) {
    return po.supplierId !== null && po.supplierId !== undefined && po.supplierId !== ''
      ? 'id:' + po.supplierId
      : 'nm:' + (po.supplier || '');
  }
  function supplierExport(open) {
    var seen = {};
    var opts = [];
    open.forEach(function (po) {
      var k = supplierKey(po);
      if (seen[k]) {
        seen[k].n++;
        return;
      }
      seen[k] = { name: po.supplier || 'Tanpa nama', n: 1 };
      opts.push(k);
    });
    return (
      '<div class="pv-toolbar">' +
      '<label class="sr-only" for="pv-exp-sup">Supplier</label>' +
      '<select class="form-select" id="pv-exp-sup">' +
      opts
        .map(function (k) {
          return (
            '<option value="' +
            esc(k) +
            '">' +
            esc(seen[k].name + ' (' + seen[k].n + ' PO)') +
            '</option>'
          );
        })
        .join('') +
      '</select>' +
      button('Ekspor Excel untuk timbangan', 'pvExportSupplier', null, 'btn-ghost') +
      '</div>'
    );
  }

  function readySection() {
    var ready = readyPOs().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    var multi = multiItemPOs();
    var rows = ready.map(function (po) {
      var l = lineOf(po);
      return (
        '<tr>' +
        '<td data-cell="title"><div class="doc-no">' +
        esc(poNo(po)) +
        '</div><div class="t-muted">' +
        esc(fmtDate(po.date)) +
        '</div></td>' +
        '<td data-cell="name">' +
        esc(po.supplier || '—') +
        '</td>' +
        '<td data-cell="meta">' +
        esc(l.itemName || '—') +
        '</td>' +
        '<td class="t-num" data-cell="amount">' +
        esc(qty(l.qty, l.unit)) +
        '</td>' +
        '<td class="t-actions" data-cell="action">' +
        button('Buka untuk pengambilan', 'createPickupPO', po.id, 'btn btn-sm') +
        '</td>' +
        '</tr>'
      );
    });
    var html = rows.length
      ? tableCard('PO siap dibuka', '', ['PO', 'Supplier', 'Barang', '#Jumlah', ''], rows, {
          cards: true,
        })
      : '<p class="pv-quiet">Belum ada PO supplier yang siap dibuka.</p>';
    if (multi.length) {
      html +=
        '<div class="notice notice-info"><div>' +
        esc(
          multi.length +
            ' PO dikonfirmasi berisi lebih dari satu barang, jadi tidak bisa dibuka untuk pengambilan.'
        ) +
        '</div></div>';
    }
    return html;
  }

  function exportSupplier() {
    var key = val('pv-exp-sup');
    var pos = pickupPOs().filter(function (po) {
      return isOpenPO(po) && supplierKey(po) === key;
    });
    if (!pos.length) {
      toast('Pilih supplier yang memiliki PO berjalan.', 'warning');
      return;
    }
    var sheet = T().weighbridgeSheet(
      pos.map(function (po) {
        return po.id;
      })
    );
    if (download('Surat Jalan ' + (pos[0].supplier || 'Supplier') + ' ' + todayISO(), [sheet])) {
      toast(sheet.rows.length + ' surat jalan dari ' + pos.length + ' PO diekspor.', 'success');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Open a confirmed PO for pickup (dialog)
  // ═══════════════════════════════════════════════════════════════════════════
  function candidateSOs(po) {
    var itemId = lineOf(po).itemId;
    return list('salesOrders')
      .filter(function (so) {
        return (
          (so.status === 'Confirmed' || so.status === 'Paid') &&
          (so.lines || []).some(function (l) {
            return same(l.itemId, itemId);
          })
        );
      })
      .sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
  }
  function soPosition(so, itemId) {
    var t = T();
    var l =
      (so.lines || []).find(function (x) {
        return same(x.itemId, itemId);
      }) || {};
    var taken = t
      .tripsForSO(so.id)
      .filter(function (d) {
        return same(((d.lines || [])[0] || {}).itemId, itemId);
      })
      .reduce(function (s, d) {
        return s + t.netOf(d);
      }, 0);
    var running = ((so.pickupFlow && so.pickupFlow.poIds) || [])
      .map(function (id) {
        return find('purchaseOrders', id);
      })
      .filter(isOpenPO);
    return {
      ordered: r3(l.qty),
      taken: r3(taken),
      remaining: r3(Math.max(0, num(l.qty) - taken)),
      unit: l.unit || '',
      running: running,
    };
  }

  function openSetup(poId) {
    var t = T();
    var po = find('purchaseOrders', poId);
    if (!t || !po) {
      toast('PO tidak ditemukan.', 'danger');
      return;
    }
    if (po.pickupFlow) {
      openPO(po.id);
      return;
    }
    S.setupPoId = po.id;
    var l = lineOf(po);
    var sos = candidateSOs(po);
    var preset = '';
    if (
      po.soId &&
      sos.some(function (s) {
        return same(s.id, po.soId);
      })
    )
      preset = po.soId;
    else if (sos.length === 1) preset = sos[0].id;

    var soField = sos.length
      ? '<div class="form-group"><label class="form-label" for="pv-setup-so">PO pelanggan<span class="req">*</span></label>' +
        '<select class="form-select" id="pv-setup-so">' +
        (preset ? '' : '<option value="">Pilih PO pelanggan…</option>') +
        sos
          .map(function (so) {
            var p = soPosition(so, l.itemId);
            return (
              '<option value="' +
              esc(so.id) +
              '"' +
              (same(so.id, preset) ? ' selected' : '') +
              '>' +
              esc(
                (so.number || so.id) +
                  ' · ' +
                  (so.customer || '—') +
                  ' · ' +
                  qty(p.ordered, p.unit) +
                  (p.taken > 0 ? ' (sisa ' + fmtT(p.remaining) + ')' : '')
              ) +
              '</option>'
            );
          })
          .join('') +
        '</select><div id="pv-setup-so-info"></div></div>'
      : '<div class="notice notice-warning"><div>' +
        esc(
          'Belum ada PO pelanggan (Pesanan Penjualan) berstatus Dikonfirmasi untuk ' +
            (l.itemName || 'barang ini') +
            '. Buat dan konfirmasi pesanan pelanggan lebih dulu, agar setiap surat jalan mencantumkan pelanggannya.'
        ) +
        '</div></div>';

    var body =
      '<div class="detail-grid">' +
      detail('PO supplier', '<span class="doc-no">' + esc(poNo(po)) + '</span>') +
      detail('Tanggal PO', esc(fmtDate(po.date))) +
      detail('Supplier', esc(po.supplier || '—')) +
      detail('Barang', esc((l.itemName || '—') + ' · ' + qty(l.qty, l.unit))) +
      '</div>' +
      soField +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="pv-setup-cap">Kapasitas per truk (' +
      esc(l.unit || 'Ton') +
      ')<span class="req">*</span></label>' +
      '<input class="form-input" id="pv-setup-cap" type="text" inputmode="decimal" autocomplete="off" value="' +
      esc(fmtInput(defaultCapacity())) +
      '"></div>' +
      '<div class="form-group"><label class="form-label" for="pv-setup-cutoff">Batas pengambilan<span class="req">*</span></label>' +
      '<input class="form-input" id="pv-setup-cutoff" type="date" value="' +
      esc(monthEndISO(po.date || todayISO())) +
      '"' +
      (po.date ? ' min="' + esc(po.date) + '"' : '') +
      '><div class="form-hint">Bawaan: akhir bulan PO. Setelah tanggal ini PO ditutup dan surat jalan sisa dibatalkan.</div></div>' +
      '</div>' +
      '<div id="pv-setup-preview"></div>';

    openDialog(
      'Buka PO untuk Pengambilan',
      body,
      '<button type="button" class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button type="button" class="btn" id="pv-setup-save" data-action="savePickupPO" data-id="' +
        esc(po.id) +
        '"' +
        (sos.length ? '' : ' disabled') +
        '>Buat surat jalan</button>'
    );
    // The modal renders synchronously; fill the live preview once it is in the DOM.
    updateSetupPreview();
  }

  function updateSetupPreview() {
    var po = find('purchaseOrders', S.setupPoId);
    var box = document.getElementById('pv-setup-preview');
    if (!po || !box) return;
    var l = lineOf(po);
    var cap = parseNumInput(val('pv-setup-cap'));
    var n = cap > 0 ? T().planTrips(l.qty, cap) : 0;
    var saveBtn = document.getElementById('pv-setup-save');
    box.innerHTML =
      cap > 0
        ? '<div class="notice notice-info"><div><strong>' +
          esc(n + ' surat jalan') +
          '</strong> akan dibuat (' +
          esc(qty(l.qty, l.unit)) +
          ' ÷ ' +
          esc(qty(cap, l.unit)) +
          ' per truk, dibulatkan ke atas). Jumlah ini tetap: PO ini tidak bisa mendapat surat jalan tambahan.</div></div>'
        : '<div class="notice notice-warning"><div>Isi kapasitas per truk lebih dari 0.</div></div>';
    if (saveBtn && document.getElementById('pv-setup-so')) {
      saveBtn.textContent = n > 0 ? 'Buat ' + n + ' surat jalan' : 'Buat surat jalan';
    }
    var info = document.getElementById('pv-setup-so-info');
    if (!info) return;
    var so = find('salesOrders', val('pv-setup-so'));
    if (!so) {
      info.innerHTML = '';
      return;
    }
    var p = soPosition(so, l.itemId);
    var parts = [];
    parts.push(
      '<div class="form-hint">' +
        esc(
          'Pelanggan: ' +
            (so.customer || '—') +
            ' · pesanan ' +
            qty(p.ordered, p.unit) +
            ', sudah diambil ' +
            qty(p.taken, p.unit) +
            ', sisa ' +
            qty(p.remaining, p.unit) +
            '.'
        ) +
        '</div>'
    );
    if (p.running.length) {
      parts.push(
        '<div class="notice notice-warning"><div>' +
          esc(
            'PO pelanggan ini sudah punya PO pengambilan yang berjalan: ' +
              p.running.map(poNo).join(', ') +
              '. Pastikan PO ini memang untuk tambahan atau sisa pengambilan.'
          ) +
          '</div></div>'
      );
    }
    if (num(l.qty) > p.remaining + 0.0005) {
      parts.push(
        '<div class="notice notice-warning"><div>' +
          esc(
            'Jumlah PO supplier (' +
              qty(l.qty, l.unit) +
              ') lebih besar dari sisa PO pelanggan (' +
              qty(p.remaining, p.unit) +
              ').'
          ) +
          '</div></div>'
      );
    }
    info.innerHTML = parts.join('');
  }

  function submitSetup(poId) {
    var po = find('purchaseOrders', poId);
    if (!po) return;
    var soId = val('pv-setup-so');
    if (!soId) {
      toast('Pilih PO pelanggan.', 'warning');
      return;
    }
    var cap = parseNumInput(val('pv-setup-cap'));
    if (!(cap > 0)) {
      toast('Kapasitas per truk harus lebih dari 0.', 'warning');
      return;
    }
    var cutoff = val('pv-setup-cutoff');
    if (!cutoff) {
      toast('Isi batas pengambilan.', 'warning');
      return;
    }
    if (po.date && cutoff < po.date) {
      toast('Batas pengambilan tidak boleh sebelum tanggal PO.', 'warning');
      return;
    }
    var r = T().openPickupPO(po.id, { soId: soId, capacity: cap, cutoff: cutoff });
    if (r.error) {
      toast(r.error, 'danger');
      return;
    }
    save();
    closeDialog();
    var after = find('purchaseOrders', poId);
    if (!after || !after.pickupFlow) return; // the save was refused (role / locked period)
    toast(r.slots.length + ' surat jalan dibuat untuk ' + poNo(po) + '.', 'success');
    openPO(po.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PO detail
  // ═══════════════════════════════════════════════════════════════════════════
  function openPO(poId) {
    S.poId = poId;
    show('po');
  }

  function renderPODetail() {
    var t = T();
    var po = find('purchaseOrders', S.poId);
    var back = button('← Semua PO Pengambilan', 'pvGoOrders', null, 'link-btn');
    if (!po || !po.pickupFlow) {
      return (
        '<div class="pv-back">' +
        back +
        '</div>' +
        header('PO Pengambilan', '') +
        '<div class="card"><div class="empty-inline">PO ini tidak ditemukan atau belum dibuka untuk pengambilan.</div></div>'
      );
    }
    var u = t.usage(po);
    var so = soOf(po);
    var l = lineOf(po);
    var slots = t.slotsFor(po.id);
    var open = isOpenPO(po);
    var voided = slots.filter(function (d) {
      return d.status === 'Cancelled';
    }).length;
    var alerts = slots.filter(function (d) {
      return d.weightAlert && !d.weightAlert.resolved;
    }).length;

    var actions = '';
    if (open && u.tripsOpen > 0) {
      actions += button('Catat Pengambilan', 'addPickupTrip', po.id, 'btn');
    }
    actions += button('Ekspor Excel untuk timbangan', 'pvExportPO', po.id);
    if (open) actions += button('Tutup PO', 'editPickupClose', po.id, 'btn-danger-text');
    else if (po.status === 'Closed') actions += button('Buka kembali', 'editPickupReopen', po.id);

    var html =
      '<div class="pv-back">' +
      back +
      '</div>' +
      header(
        poNo(po),
        (po.supplier || '—') + ' → ' + (customerOf(po) || '—') + ' · ' + (l.itemName || ''),
        actions
      );

    if (po.status === 'Closed') {
      html +=
        '<div class="notice"><div>' +
        esc(
          'PO selesai (' +
            (CLOSE_LABEL[po.closedReason] || 'ditutup') +
            ')' +
            (po.closedAt ? ' pada ' + fmtDateTime(po.closedAt) : '') +
            '. Surat jalan yang belum dipakai sudah dibatalkan.'
        ) +
        '</div></div>';
    } else if (u.pastCutoff) {
      html +=
        '<div class="notice notice-warning"><div>' +
        esc(
          'Batas pengambilan (' +
            fmtDate(u.cutoff) +
            ') sudah lewat. Pengambilan hanya bisa dicatat dengan tanggal sampai ' +
            fmtDate(u.cutoff) +
            '; PO ditutup otomatis saat daftar PO Pengambilan dibuka.'
        ) +
        '</div></div>';
    } else if (open && u.tripsOpen === 0 && u.remaining > 0) {
      html +=
        '<div class="notice notice-warning"><div>' +
        esc(
          'Semua surat jalan sudah terpakai, sisa kuota ' +
            qty(u.remaining, u.unit) +
            '. Tutup PO ini lalu buka PO baru untuk sisanya.'
        ) +
        '</div></div>';
    }
    if (alerts) {
      html +=
        '<div class="notice notice-warning"><div>' +
        esc(alerts + ' surat jalan PO ini berubah beratnya setelah ditagih.') +
        ' ' +
        button('Buka Perubahan Timbangan', 'pvGoChanges', null, 'btn-ghost btn-sm') +
        '</div></div>';
    }

    html +=
      '<div class="card">' +
      '<div class="detail-grid">' +
      detail('PO pelanggan', so ? '<span class="doc-no">' + esc(so.number || so.id) + '</span>' : '—') +
      detail('Kapasitas per truk', esc(qty(po.pickupFlow.capacity, u.unit))) +
      detail('Batas pengambilan', cutoffCell(po, u)) +
      detail('Status', poStatusBadge(po, u)) +
      '</div>' +
      '<div class="pv-kpi">' +
      '<div><div class="detail-label">Diambil</div>' +
      progress(u) +
      '<div class="form-hint">' +
      esc(
        'Sisa kuota ' +
          qty(u.remaining, u.unit) +
          (u.over > 0 ? ' · melebihi kuota ' + qty(u.over, u.unit) : '')
      ) +
      '</div></div>' +
      '<div><div class="detail-label">Surat jalan</div><div class="pv-kpi-val">' +
      esc(
        u.tripsUsed +
          ' dipakai · ' +
          u.tripsOpen +
          ' siap' +
          (voided ? ' · ' + voided + ' batal' : '')
      ) +
      '</div></div>' +
      '</div>' +
      '</div>';

    var rows = slots.map(function (d) {
      var inv = invoiceRefs(d);
      var trip = t.isTrip(d);
      // The next step of a ready slot stays visible; the rest is behind "⋯".
      var acts = [];
      if (d.status === 'Pending' && open) {
        acts.push(
          button('Catat', 'addPickupTrip', d.id, 'btn btn-sm', ' data-po="' + esc(po.id) + '"')
        );
      }
      var more = [
        d.ticketPhoto ? { label: 'Foto DO', action: 'pvPhoto', id: d.id } : null,
        d.status !== 'Cancelled' ? { label: 'Cetak SJ', action: 'pvPrintSlot', id: d.id } : null,
        trip && d.status !== 'Cancelled'
          ? { label: 'Koreksi berat', action: 'editPickupWeight', id: d.id }
          : null,
        d.status === 'Pending' && open
          ? { label: 'Batalkan surat jalan', action: 'voidPickupSlot', id: d.id, danger: true }
          : null,
      ].filter(Boolean);
      if (more.length) {
        acts.push(
          typeof window.rowActionsMenu === 'function'
            ? window.rowActionsMenu(d.sjNo || d.number, more)
            : more
                .map(function (m) {
                  return button(m.label, m.action, m.id, m.danger ? 'btn-danger-text btn-sm' : 'btn-ghost btn-sm');
                })
                .join('')
        );
      }
      var flags = slotFlags(d);
      // data-cell roles: on phones each slot is a short card (mobile.css).
      return (
        '<tr>' +
        '<td data-cell="title"><div class="doc-no">' +
        esc(d.sjNo || d.number) +
        '</div>' +
        (flags ? '<div class="pv-flags">' + flags + '</div>' : '') +
        (d.status === 'Cancelled' && d.voidReason
          ? '<div class="t-muted">' + esc(d.voidReason) + '</div>'
          : '') +
        '</td>' +
        '<td data-cell="status">' +
        slotBadge(d) +
        '</td>' +
        '<td data-cell="meta"' +
        (d.date ? '' : ' class="is-nil"') +
        '>' +
        esc(d.date ? fmtDate(d.date) : '—') +
        '</td>' +
        '<td data-cell="meta"' +
        (d.vehicle ? '' : ' class="is-nil"') +
        '>' +
        esc(d.vehicle || '—') +
        '</td>' +
        '<td data-cell="name"' +
        (d.driver ? '' : ' class="is-nil"') +
        '>' +
        esc(d.driver || '—') +
        '</td>' +
        '<td class="t-num' +
        (trip ? '' : ' is-nil') +
        '" data-cell="amount" data-unit="' +
        esc(u.unit || 't') +
        '">' +
        (trip ? esc(fmtT(t.netOf(d))) : '—') +
        '</td>' +
        '<td data-cell="meta" data-cap="Faktur"' +
        (inv.si || inv.pi ? '' : ' class="is-nil"') +
        '>' +
        (inv.si ? '<div class="doc-no">' + esc(inv.si) + '</div>' : '') +
        (inv.pi ? '<div class="doc-no t-muted">' + esc(inv.pi) + '</div>' : '') +
        (!inv.si && !inv.pi ? '<span class="t-muted">—</span>' : '') +
        '</td>' +
        '<td data-cell="menu"><div class="pv-actions">' +
        acts.join('') +
        '</div></td>' +
        '</tr>'
      );
    });
    html += tableCard(
      'Surat jalan',
      '',
      [
        'No SJ',
        'Status',
        'Tanggal',
        'No. Polisi',
        'Sopir',
        '#Netto (' + (u.unit || 't') + ')',
        'Faktur',
        '',
      ],
      rows,
      { empty: 'PO ini belum punya surat jalan.', cards: true }
    );
    return html;
  }

  function exportPO(poId) {
    var po = find('purchaseOrders', poId);
    if (!po) return;
    var sheet = T().weighbridgeSheet([po.id]);
    if (download('Surat Jalan ' + poNo(po), [sheet])) {
      toast(sheet.rows.length + ' surat jalan diekspor.', 'success');
    }
  }

  function printSlot(doId) {
    var d = find('deliveryOrders', doId);
    if (!d) return;
    if (typeof window.printDocument !== 'function') {
      toast('Format cetak surat jalan belum tersedia.', 'warning');
      return;
    }
    var po = find('purchaseOrders', d.poId);
    var u = po ? T().usage(po) : null;
    var line = (d.lines && d.lines[0]) || {};
    // The standard Surat Jalan form, numbered with the SJ number the weighbridge
    // knows; QTY PO is the PO quota, weights are filled in by hand on the form.
    window.printDocument(
      'DO',
      Object.assign({}, d, {
        number: d.sjNo || d.number,
        poId: d.poNumber || d.poId,
        customerPO: d.customerPO || d.soNumber || '',
        lines: [Object.assign({}, line, { qty: u ? u.ordered : 0 })],
      })
    );
  }

  function showPhoto(doId) {
    var d = find('deliveryOrders', doId);
    if (!d || !d.ticketPhoto) return;
    openDialog(
      'Foto DO · ' + (d.sjNo || d.number),
      '<img class="pv-photo-full" src="' +
        esc(d.ticketPhoto) +
        '" alt="Foto DO ' +
        esc(d.sjNo || '') +
        '">' +
        '<div class="form-hint">' +
        esc(
          [d.date ? fmtDate(d.date) : '', d.vehicle, d.ticketNo ? 'DO ' + d.ticketNo : '']
            .filter(Boolean)
            .join(' · ')
        ) +
        '</div>',
      '<button type="button" class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  function askVoid(doId) {
    var d = find('deliveryOrders', doId);
    if (!d || d.status !== 'Pending') return;
    openDialog(
      'Batalkan surat jalan',
      '<p>' +
        esc(
          'Surat jalan ' +
            (d.sjNo || d.number) +
            ' tidak bisa dipakai lagi dan tidak diganti nomor baru. Kuota PO tetap.'
        ) +
        '</p>' +
        '<div class="form-group"><label class="form-label" for="pv-void-reason">Alasan</label>' +
        '<input class="form-input" id="pv-void-reason" type="text" placeholder="Contoh: formulir SJ rusak/hilang"></div>',
      '<button type="button" class="btn-ghost" data-action="closeModal">Kembali</button>' +
        button('Batalkan surat jalan', 'voidPickupSlotConfirm', d.id, 'btn-danger')
    );
  }
  function confirmVoid(doId) {
    var reason = val('pv-void-reason').trim() || 'Dibatalkan manual';
    if (!T().voidSlot(doId, reason)) {
      toast('Surat jalan ini tidak bisa dibatalkan.', 'danger');
      closeDialog();
      return;
    }
    save();
    closeDialog();
    var d = find('deliveryOrders', doId);
    if (d && d.status === 'Cancelled') toast('Surat jalan ' + d.sjNo + ' dibatalkan.', 'success');
    rerender();
  }

  function askClose(poId) {
    var po = find('purchaseOrders', poId);
    if (!po) return;
    var u = T().usage(po);
    openDialog(
      'Tutup PO',
      '<p>' +
        esc(
          poNo(po) +
            ': diambil ' +
            qty(u.taken, u.unit) +
            ' dari ' +
            qty(u.ordered, u.unit) +
            '. ' +
            (u.tripsOpen
              ? u.tripsOpen + ' surat jalan yang belum dipakai akan dibatalkan.'
              : 'Tidak ada surat jalan yang belum dipakai.')
        ) +
        '</p>',
      '<button type="button" class="btn-ghost" data-action="closeModal">Kembali</button>' +
        button('Tutup PO', 'updatePickupClose', po.id, 'btn-danger')
    );
  }
  function confirmClose(poId) {
    if (!T().closePickupPO(poId, 'manual')) {
      toast('PO ini tidak bisa ditutup.', 'danger');
      closeDialog();
      return;
    }
    save();
    closeDialog();
    var po = find('purchaseOrders', poId);
    if (po && po.status === 'Closed') toast(poNo(po) + ' ditutup.', 'success');
    rerender();
  }

  function slotsVoidedByClose(po) {
    return T()
      .slotsFor(po.id)
      .filter(function (d) {
        return d.status === 'Cancelled' && CLOSE_VOID_REASONS.indexOf(d.voidReason) !== -1;
      });
  }
  function askReopen(poId) {
    var po = find('purchaseOrders', poId);
    if (!po) return;
    var u = T().usage(po);
    var back = slotsVoidedByClose(po).length;
    openDialog(
      'Buka kembali PO',
      '<p>' +
        esc(
          poNo(po) +
            ' bisa dipakai lagi untuk mencatat pengambilan. ' +
            (back
              ? back +
                ' surat jalan yang dibatalkan saat PO ditutup aktif kembali (nomor yang sama).'
              : 'Tidak ada surat jalan yang bisa diaktifkan kembali.')
        ) +
        '</p>' +
        (u.pastCutoff
          ? '<div class="notice notice-warning"><div>' +
            esc(
              'Batas pengambilan (' +
                fmtDate(u.cutoff) +
                ') sudah lewat: hanya pengambilan bertanggal sampai ' +
                fmtDate(u.cutoff) +
                ' yang bisa dicatat, dan PO ditutup lagi otomatis saat daftar PO Pengambilan dibuka.'
            ) +
            '</div></div>'
          : ''),
      '<button type="button" class="btn-ghost" data-action="closeModal">Kembali</button>' +
        button('Buka kembali', 'updatePickupReopen', po.id, 'btn')
    );
  }
  function confirmReopen(poId) {
    var po = find('purchaseOrders', poId);
    if (!po) return;
    var restore = slotsVoidedByClose(po);
    if (!T().reopenPickupPO(poId)) {
      toast('PO ini tidak bisa dibuka kembali.', 'danger');
      closeDialog();
      return;
    }
    // Trading.closePickupPO voided the unused slots; bring the same SJ numbers back.
    restore.forEach(function (d) {
      d.status = 'Pending';
      delete d.voidReason;
      delete d.cancelledAt;
      delete d.cancelledBy;
    });
    save();
    closeDialog();
    var after = find('purchaseOrders', poId);
    if (after && isOpenPO(after)) {
      toast(
        'PO ' +
          poNo(after) +
          ' dibuka kembali' +
          (restore.length ? ', ' + restore.length + ' surat jalan aktif.' : '.'),
        'success'
      );
    }
    rerender();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Catat Pengambilan (record a truck)
  // ═══════════════════════════════════════════════════════════════════════════
  function openRecord(poId, slotId) {
    S.rec.last = null;
    if (poId) {
      S.rec.poId = poId;
      S.rec.slotId = slotId || '';
    }
    show('record');
  }

  // Resolve the PO and slot the form works on (explicit choice when several POs
  // are open, so a truck is never booked on another customer's PO by default).
  function recordContext() {
    var pos = recordablePOs();
    var po = find('purchaseOrders', S.rec.poId);
    if (
      !po ||
      !pos.some(function (p) {
        return same(p.id, po.id);
      })
    ) {
      po = pos.length === 1 ? pos[0] : null;
      S.rec.poId = po ? po.id : '';
    }
    var slots = po ? openSlots(po) : [];
    var slot = find('deliveryOrders', S.rec.slotId);
    if (
      !slot ||
      !slots.some(function (d) {
        return same(d.id, slot.id);
      })
    ) {
      slot = slots[0] || null;
      S.rec.slotId = slot ? slot.id : '';
    }
    if (slot && S.rec.destFor !== slot.id) {
      S.rec.dest = slot.destination || '';
      S.rec.destFor = slot.id;
    }
    return { pos: pos, po: po, slots: slots, slot: slot };
  }

  function computedNet() {
    var g = parseNumInput(S.rec.gross);
    var tr = parseNumInput(S.rec.tare);
    if (g > 0) return { net: r3(g - (tr || 0)), fromGross: true, gross: g, tare: tr || 0 };
    return { net: r3(parseNumInput(S.rec.net) || 0), fromGross: false };
  }

  function renderRecord() {
    var t = T();
    var ctx = recordContext();
    var html = header('Catat Pengambilan', '', button('PO Pengambilan', 'pvGoOrders'));
    var last = S.rec.last;
    if (last) {
      html +=
        '<div class="notice notice-success" role="status"><div><strong>' +
        esc('Tersimpan: ' + last.sjNo) +
        '</strong> · ' +
        esc([last.vehicle, qty(last.net, last.unit), last.customer].filter(Boolean).join(' · ')) +
        '</div></div>';
      (last.warnings || []).forEach(function (w) {
        html += '<div class="notice notice-warning"><div>' + esc(w) + '</div></div>';
      });
    }
    if (!ctx.pos.length) {
      return (
        html +
        '<div class="card"><div class="empty-inline">Belum ada PO pengambilan yang berjalan dengan surat jalan siap.<br>' +
        button('Buka PO Pengambilan', 'pvGoOrders', null, 'btn') +
        '</div></div>'
      );
    }

    var po = ctx.po;
    var poOptions =
      (po ? '' : '<option value="">Pilih PO…</option>') +
      ctx.pos
        .map(function (p) {
          return (
            '<option value="' +
            esc(p.id) +
            '"' +
            (po && same(p.id, po.id) ? ' selected' : '') +
            '>' +
            esc(poNo(p) + ' · ' + (customerOf(p) || '—') + ' · ' + (lineOf(p).itemName || '')) +
            '</option>'
          );
        })
        .join('');
    var form =
      '<div class="card pv-rec" id="pv-rec">' +
      '<div class="form-group"><label class="form-label" for="pv-rec-po">PO pengambilan<span class="req">*</span></label>' +
      '<select class="form-select" id="pv-rec-po">' +
      poOptions +
      '</select></div>';

    if (!po) {
      form +=
        '<div class="form-hint">Ada beberapa PO berjalan. Pilih PO sesuai pelanggan dan barang pada surat jalan truk.</div></div>';
      return html + form;
    }

    var u = t.usage(po, S.rec.date || todayISO());
    var l = lineOf(po);
    var slot = ctx.slot;
    var left = u.cutoff ? daysFrom(todayISO(), u.cutoff) : null;
    form +=
      '<div class="pv-info">' +
      infoItem('Pelanggan', customerOf(po) || '—') +
      infoItem('Barang', l.itemName || '—') +
      infoItem(
        'Sisa kuota',
        qty(u.remaining, u.unit) + ' dari ' + fmtT(u.ordered),
        u.remaining <= 0
      ) +
      infoItem('Surat jalan siap', u.tripsOpen + ' dari ' + u.tripsMax) +
      infoItem(
        'Batas pengambilan',
        fmtDate(u.cutoff) +
          (left === null
            ? ''
            : left < 0
              ? ' (lewat)'
              : left === 0
                ? ' (hari ini)'
                : ' (' + left + ' hari lagi)'),
        left !== null && left <= 3
      ) +
      infoItem('Supplier', po.supplier || '—') +
      '</div>';

    form +=
      '<div class="form-group"><label class="form-label" for="pv-rec-slot">Surat jalan<span class="req">*</span></label>' +
      '<select class="form-select" id="pv-rec-slot">' +
      ctx.slots
        .map(function (d) {
          return (
            '<option value="' +
            esc(d.id) +
            '"' +
            (slot && same(d.id, slot.id) ? ' selected' : '') +
            '>' +
            esc(d.sjNo || d.number) +
            '</option>'
          );
        })
        .join('') +
      '</select></div>';

    form +=
      '<div class="form-group"><label class="form-label" for="pv-rec-date">Tanggal ambil<span class="req">*</span></label>' +
      '<input class="form-input" id="pv-rec-date" type="date" value="' +
      esc(S.rec.date || todayISO()) +
      '"' +
      (po.date ? ' min="' + esc(po.date) + '"' : '') +
      (u.cutoff ? ' max="' + esc(u.cutoff) + '"' : '') +
      '></div>' +
      '<div class="form-row">' +
      field('pv-rec-vehicle', 'No. Polisi', S.rec.vehicle, {
        req: true,
        attrs:
          ' autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="B 1234 XY"',
        cls: 'pv-upper',
      }) +
      field('pv-rec-driver', 'Sopir', S.rec.driver, { attrs: ' autocomplete="off"' }) +
      '</div>';

    var c = computedNet();
    var unit = u.unit || l.unit || '';
    form +=
      '<div class="pv-w3">' +
      field('pv-rec-gross', 'Bruto (' + (unit || 't') + ')', S.rec.gross, {
        attrs: ' inputmode="decimal" autocomplete="off"',
      }) +
      field('pv-rec-tare', 'Tara (' + (unit || 't') + ')', S.rec.tare, {
        attrs: ' inputmode="decimal" autocomplete="off"',
      }) +
      field(
        'pv-rec-net',
        'Netto (' + (unit || 't') + ')',
        c.fromGross ? fmtInput(c.net) : S.rec.net,
        {
          attrs: ' inputmode="decimal" autocomplete="off"' + (c.fromGross ? ' readonly' : ''),
        }
      ) +
      '</div>' +
      '<div class="pv-net" aria-live="polite"><span class="detail-label">Netto</span>' +
      '<span class="pv-net-val" id="pv-rec-netshow">' +
      esc(fmtT(c.net)) +
      '</span><span class="t-muted">' +
      esc(unit) +
      '</span></div>' +
      '<div class="form-hint pv-hint" id="pv-rec-nethint">' +
      esc(netHint(c)) +
      '</div>';

    form +=
      field('pv-rec-dest', 'Tujuan', S.rec.dest, {
        attrs: ' autocomplete="off"',
        hint: 'Ubah hanya bila truk dikirim ke alamat lain.',
      }) +
      field('pv-rec-ticket', 'No. DO / tiket timbang', S.rec.ticketNo, {
        attrs: ' autocomplete="off"',
      });

    form +=
      '<div class="form-group"><span class="form-label">Foto DO / tiket timbang</span>' +
      '<div class="pv-file"><label class="btn-ghost" for="pv-rec-photo">' +
      (S.rec.photo ? 'Ganti foto' : 'Ambil / pilih foto') +
      '</label><input type="file" id="pv-rec-photo" accept="image/*" capture="environment" hidden>' +
      (S.rec.photo ? button('Hapus foto', 'pvRecPhotoClear', null, 'btn-danger-text') : '') +
      '</div>' +
      (S.rec.photo
        ? '<div class="pv-photo-prev"><img src="' +
          esc(S.rec.photo) +
          '" alt="Foto DO"></div><div class="form-hint">' +
          esc('Ukuran ' + S.rec.photoKB + ' KB') +
          '</div>' +
          (S.rec.photoKB * 1024 > PHOTO_LIMIT
            ? '<div class="notice notice-warning"><div>Foto masih lebih dari 300 KB. Bila bisa, ambil ulang lebih dekat ke DO.</div></div>'
            : '')
        : '<div class="form-hint">Opsional</div>') +
      '</div>';

    form +=
      '<div class="form-group"><label class="form-label" for="pv-rec-note">Catatan</label>' +
      '<textarea class="form-input" id="pv-rec-note" rows="2">' +
      esc(S.rec.note) +
      '</textarea></div>' +
      button('Simpan Pengambilan', 'savePickupTrip', null, 'btn pv-submit') +
      '</div>';
    return html + form;
  }

  function infoItem(label, value, warn) {
    return (
      '<div><div class="pv-info-label">' +
      esc(label) +
      '</div><div class="pv-info-val"' +
      (warn ? ' style="color:var(--warning)"' : '') +
      '>' +
      esc(value) +
      '</div></div>'
    );
  }
  function field(id, label, value, opts) {
    opts = opts || {};
    return (
      '<div class="form-group"><label class="form-label" for="' +
      id +
      '">' +
      esc(label) +
      (opts.req ? '<span class="req">*</span>' : '') +
      '</label><input class="form-input' +
      (opts.cls ? ' ' + opts.cls : '') +
      '" id="' +
      id +
      '" type="text" value="' +
      esc(value) +
      '"' +
      (opts.attrs || '') +
      '>' +
      (opts.hint ? '<div class="form-hint">' + esc(opts.hint) + '</div>' : '') +
      '</div>'
    );
  }
  function netHint(c) {
    if (c.fromGross) {
      if (c.tare >= c.gross) return 'Tara harus lebih kecil dari bruto.';
      return 'Netto = bruto − tara';
    }
    return 'Isi bruto dan tara, atau netto saja';
  }
  function updateNet() {
    var netEl = document.getElementById('pv-rec-net');
    // Bruto cleared: the netto field becomes editable again, keeping its value.
    if (netEl && netEl.readOnly && !(parseNumInput(S.rec.gross) > 0)) {
      netEl.readOnly = false;
      S.rec.net = netEl.value;
    }
    var c = computedNet();
    if (netEl && c.fromGross) {
      netEl.value = fmtInput(c.net);
      netEl.readOnly = true;
    }
    var showEl = document.getElementById('pv-rec-netshow');
    if (showEl) showEl.textContent = fmtT(c.net > 0 ? c.net : 0);
    var hint = document.getElementById('pv-rec-nethint');
    if (hint) hint.textContent = netHint(c);
  }

  function submitTrip(allowOver) {
    var t = T();
    var ctx = recordContext();
    if (!ctx.po || !ctx.slot) {
      toast('Pilih PO dan surat jalan.', 'warning');
      return;
    }
    var vehicle = String(S.rec.vehicle || '')
      .trim()
      .toUpperCase();
    if (!vehicle) {
      toast('Isi No. Polisi truk.', 'warning');
      return;
    }
    var c = computedNet();
    var date = S.rec.date || todayISO();
    var data = {
      date: date,
      gross: c.fromGross ? c.gross : null,
      tare: c.fromGross ? c.tare : null,
      net: c.fromGross ? null : c.net,
      vehicle: vehicle,
      driver: S.rec.driver,
      destination: S.rec.dest,
      ticketNo: S.rec.ticketNo,
      ticketPhoto: S.rec.photo || '',
      note: S.rec.note,
    };
    var slotId = ctx.slot.id;
    var res = t.recordTrip(slotId, data, { allowOverQuota: !!allowOver });
    if (res.error) {
      if (res.overQuota && !allowOver) {
        var u = t.usage(ctx.po, date);
        openDialog(
          'Melebihi kuota PO',
          '<div class="notice notice-warning"><div>' +
            esc(res.error) +
            '</div></div><p>' +
            esc(
              'Dengan truk ini total diambil menjadi ' +
                qty(r3(u.taken + c.net), u.unit) +
                ' dari kuota ' +
                qty(u.ordered, u.unit) +
                '. Simpan bila truk memang sudah mengambil barang ini.'
            ) +
            '</p>',
          '<button type="button" class="btn-ghost" data-action="closeModal">Batal</button>' +
            button('Tetap simpan', 'savePickupTripOver', null, 'btn-danger')
        );
        return;
      }
      toast(res.error, 'danger');
      return;
    }
    save();
    var d = find('deliveryOrders', slotId);
    if (!d || d.status === 'Pending') return; // the save was refused (role / locked period)
    S.rec.last = {
      sjNo: d.sjNo || d.number,
      vehicle: d.vehicle,
      net: t.netOf(d),
      unit: unitOfSlot(d),
      customer: d.customer || '',
      warnings: res.warnings || [],
    };
    var keep = { poId: S.rec.poId, date: S.rec.date, last: S.rec.last };
    S.rec = emptyRecord();
    S.rec.poId = keep.poId;
    S.rec.date = keep.date;
    S.rec.last = keep.last;
    toast(
      'Surat jalan ' + S.rec.last.sjNo + ' tercatat: ' + qty(S.rec.last.net, S.rec.last.unit) + '.',
      'success'
    );
    (res.warnings || []).forEach(function (w) {
      toast(w, 'warning');
    });
    rerender();
    scrollTop();
  }

  // ── Ticket photo: downscale in a canvas, JPEG data URL ──────────────────────
  function dataUrlBytes(url) {
    var i = String(url).indexOf(',');
    return Math.round(((String(url).length - i - 1) * 3) / 4);
  }
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('Gambar kosong'));
          return;
        }
        var scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var out = '';
        [0.7, 0.6, 0.5].some(function (q) {
          out = canvas.toDataURL('image/jpeg', q);
          return dataUrlBytes(out) <= PHOTO_LIMIT;
        });
        resolve({ dataUrl: out, bytes: dataUrlBytes(out) });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Gambar tidak bisa dibaca'));
      };
      img.src = url;
    });
  }
  function handlePhoto(file) {
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) {
      toast('Pilih file gambar (foto).', 'warning');
      return;
    }
    shrinkImage(file)
      .then(function (res) {
        S.rec.photo = res.dataUrl;
        S.rec.photoKB = Math.round(res.bytes / 1024);
        if (res.bytes > PHOTO_LIMIT) {
          toast(
            'Foto tetap lebih dari 300 KB setelah diperkecil (' + S.rec.photoKB + ' KB).',
            'warning'
          );
        }
        if (S.page === 'record') rerender();
      })
      .catch(function (err) {
        toast('Foto tidak bisa diproses: ' + ((err && err.message) || err), 'danger');
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Impor Rekap Timbangan
  // ═══════════════════════════════════════════════════════════════════════════
  function openRecapImport() {
    show('recap');
  }

  function readArrayBuffer(file) {
    if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(new Error('Gagal membaca file'));
      };
      r.readAsArrayBuffer(file);
    });
  }

  // CSV is read as plain text (raw) so "03/09/2026" stays day-first for
  // Trading's parser; xlsx dates arrive as serial numbers.
  function recapRowsFromBuffer(buf, isCsv) {
    var X = window.XLSX;
    var wb = X.read(new Uint8Array(buf), { type: 'array', raw: !!isCsv });
    var names = wb.SheetNames.slice().sort(function (a, b) {
      var pa = /surat jalan|rekap|timbang/i.test(a) ? 0 : 1;
      var pb = /surat jalan|rekap|timbang/i.test(b) ? 0 : 1;
      return pa - pb;
    });
    for (var i = 0; i < names.length; i++) {
      var aoa = X.utils.sheet_to_json(wb.Sheets[names[i]], { header: 1, raw: true, defval: '' });
      var rows = T().recapRowsFromAoa(aoa);
      if (rows.length) return { rows: rows, sheet: names[i] };
    }
    return { rows: [], sheet: names[0] || '' };
  }

  function loadRecapFile(file) {
    if (!file) return Promise.resolve(false);
    if (!window.XLSX || !T()) {
      toast('Pembaca Excel belum siap. Muat ulang halaman.', 'danger');
      return Promise.resolve(false);
    }
    var name = file.name || 'rekap';
    var isCsv = /\.csv$/i.test(name) || /csv/i.test(file.type || '');
    return readArrayBuffer(file)
      .then(function (buf) {
        var parsed = recapRowsFromBuffer(buf, isCsv);
        S.recap = {
          fileName: name,
          sheet: parsed.sheet,
          rows: parsed.rows,
          result: T().matchRecap(parsed.rows),
          applied: null,
        };
        if (!parsed.rows.length) {
          toast('Tidak ada baris rekap yang dikenali. Periksa judul kolom.', 'warning');
        }
        if (S.page === 'recap') rerender();
        return true;
      })
      .catch(function (err) {
        toast('File tidak bisa dibaca: ' + ((err && err.message) || err), 'danger');
        return false;
      });
  }

  // Rows whose netto is empty on a surat jalan that is still unused: the
  // weighbridge has not filled it in yet (normal when the export file comes back
  // partly filled) — shown apart from real problems.
  function splitProblems(result) {
    var skipped = [];
    var problems = [];
    result.problems.forEach(function (p) {
      var d = find('deliveryOrders', p.doId);
      if (
        p.reason === 'Netto kosong' &&
        d &&
        (d.status === 'Pending' || d.status === 'Cancelled')
      ) {
        skipped.push(p);
      } else problems.push(p);
    });
    return { skipped: skipped, problems: problems };
  }
  function fillIssue(m) {
    var d = find('deliveryOrders', m.doId);
    var po = d ? find('purchaseOrders', d.poId) : null;
    if (!po || !isOpenPO(po)) return 'PO sudah ditutup';
    if (!m.row.date) return 'Tanggal kosong';
    var u = T().usage(po, m.row.date);
    if (u.cutoff && m.row.date > u.cutoff) return 'Lewat batas PO (' + fmtDate(u.cutoff) + ')';
    if (po.date && m.row.date < po.date) return 'Sebelum tanggal PO';
    return '';
  }
  function rowCells(row) {
    return (
      '<td class="t-num">' +
      esc(row.row) +
      '</td><td class="doc-no">' +
      esc(row.sjNo || '—') +
      '</td><td>' +
      esc(row.date ? fmtDate(row.date) : '—') +
      '</td><td>' +
      esc(row.vehicle || '—') +
      '</td>'
    );
  }

  function renderRecap() {
    var rc = S.recap;
    var html = header('Impor Rekap Timbangan', '', button('PO Pengambilan', 'pvGoOrders'));

    // The file picker first; what the reader expects folds open on demand.
    html +=
      '<div class="card">' +
      '<div class="pv-file"><label class="btn" for="pv-recap-file">Pilih file rekap</label>' +
      '<input type="file" id="pv-recap-file" accept=".xlsx,.xls,.csv" hidden>' +
      '<span class="t-muted">' +
      esc(rc ? rc.fileName : '.xlsx, .xls, atau .csv') +
      '</span></div>' +
      '<details class="pv-help"><summary>Kolom yang dibaca</summary>' +
      '<div class="pv-cols">' +
      ['No SJ', 'Tanggal', 'No Polisi', 'Sopir', 'Bruto', 'Tara', 'Netto']
        .map(function (c) {
          return '<span class="chip">' + esc(c) + '</span>';
        })
        .join('') +
      '</div>' +
      '<ul class="pv-list">' +
      '<li>Paling tepat: file dari <strong>Ekspor Excel untuk timbangan</strong> di PO Pengambilan, diisi bagian timbangan.</li>' +
      '<li>Tanpa No SJ: dicocokkan lewat Tanggal + No Polisi.</li>' +
      '<li>Rekap kumulatif boleh: baris yang sama dilewati, berat yang berubah ditandai.</li>' +
      '</ul></details></div>';

    if (!rc) return html;
    if (rc.applied) return html + renderRecapApplied(rc);
    if (!rc.result) return html;

    var r = rc.result;
    var split = splitProblems(r);
    var invoicedChanged = r.changed.filter(function (m) {
      return m.invoiced;
    }).length;

    html += stats([
      { label: 'Baru dicatat', value: String(r.fill.length), sub: 'surat jalan terisi' },
      { label: 'Sama', value: String(r.same.length), sub: 'sudah tercatat' },
      {
        label: 'Berubah',
        value: String(r.changed.length),
        sub: invoicedChanged ? invoicedChanged + ' sudah ditagih' : 'berat berbeda',
        color: invoicedChanged ? 'var(--danger)' : r.changed.length ? 'var(--warning)' : '',
      },
      {
        label: 'Tidak cocok / bermasalah',
        value: String(r.unmatched.length + split.problems.length),
        sub: r.unmatched.length + ' tidak cocok · ' + split.problems.length + ' bermasalah',
      },
    ]);

    if (invoicedChanged) {
      html +=
        '<div class="notice notice-warning"><div>' +
        esc(
          invoicedChanged +
            ' surat jalan yang sudah ditagih berubah beratnya. Fakturnya tidak diubah; setelah diterapkan, muncul di Perubahan Timbangan.'
        ) +
        '</div></div>';
    }

    if (r.fill.length) {
      html += tableCard(
        'Baru dicatat',
        'Surat jalan yang belum tercatat dan ada beratnya di rekap',
        [
          '#Baris',
          'No SJ',
          'Tanggal',
          'No. Polisi',
          'Sopir',
          'Pelanggan',
          '#Bruto',
          '#Tara',
          '#Netto',
          'Catatan',
        ],
        r.fill.map(function (m) {
          var d = find('deliveryOrders', m.doId) || {};
          var issue = fillIssue(m);
          return (
            '<tr>' +
            rowCells(m.row) +
            '<td>' +
            esc(m.row.driver || '—') +
            '</td><td>' +
            esc(d.customer || '—') +
            '</td><td class="t-num">' +
            esc(m.row.gross != null ? fmtT(m.row.gross) : '—') +
            '</td><td class="t-num">' +
            esc(m.row.tare != null ? fmtT(m.row.tare) : '—') +
            '</td><td class="t-num t-strong">' +
            esc(fmtT(m.row.net)) +
            '</td><td>' +
            (issue ? badge('warning', issue) : '') +
            '</td></tr>'
          );
        })
      );
    }
    if (r.changed.length) {
      html += tableCard(
        'Berubah',
        'Berat di rekap berbeda dari yang sudah tercatat',
        ['#Baris', 'No SJ', 'Tanggal', 'No. Polisi', 'Pelanggan', 'Berat', '#Selisih', 'Faktur'],
        r.changed.map(function (m) {
          var d = find('deliveryOrders', m.doId) || {};
          var unit = unitOfSlot(d);
          var inv = invoiceRefs(d);
          var delta = r3(m.to - m.from);
          return (
            '<tr' +
            (m.invoiced ? ' class="pv-row-danger"' : '') +
            '>' +
            rowCells(m.row) +
            '<td>' +
            esc(d.customer || '—') +
            '</td><td class="pv-change">' +
            esc(fmtT(m.from) + ' → ' + qty(m.to, unit)) +
            '</td><td class="t-num ' +
            (m.invoiced ? 'pv-danger' : 'pv-warn') +
            '">' +
            esc((delta > 0 ? '+' : '') + fmtT(delta)) +
            '</td><td>' +
            (m.invoiced
              ? badge('danger', 'Sudah ditagih') +
                '<div class="doc-no t-muted">' +
                esc([inv.si, inv.pi].filter(Boolean).join(' · ')) +
                '</div>'
              : '<span class="t-muted">Belum ditagih</span>') +
            '</td></tr>'
          );
        })
      );
    }
    if (r.unmatched.length) {
      html += tableCard(
        'Tidak cocok',
        'Tidak ada surat jalan yang cocok — periksa nomor SJ, tanggal, atau No. Polisi',
        ['#Baris', 'No SJ', 'Tanggal', 'No. Polisi', '#Netto', 'Alasan'],
        r.unmatched.map(function (m) {
          return (
            '<tr>' +
            rowCells(m.row) +
            '<td class="t-num">' +
            esc(m.row.net != null ? fmtT(m.row.net) : '—') +
            '</td><td>' +
            esc(m.reason) +
            '</td></tr>'
          );
        })
      );
    }
    if (split.problems.length) {
      html += tableCard(
        'Bermasalah',
        'Surat jalan ditemukan tetapi baris ini tidak bisa dipakai',
        ['#Baris', 'No SJ', 'Tanggal', 'No. Polisi', '#Netto', 'Alasan'],
        split.problems.map(function (m) {
          return (
            '<tr>' +
            rowCells(m.row) +
            '<td class="t-num">' +
            esc(m.row.net != null ? fmtT(m.row.net) : '—') +
            '</td><td>' +
            esc(m.reason) +
            '</td></tr>'
          );
        })
      );
    }
    if (split.skipped.length || r.same.length) {
      html += '<div class="card">';
      if (split.skipped.length) {
        html +=
          '<details class="pv-details"><summary>' +
          esc(split.skipped.length + ' surat jalan belum diisi beratnya — dilewati') +
          '</summary><div class="pv-details-body doc-no">' +
          esc(
            split.skipped
              .map(function (m) {
                return m.row.sjNo;
              })
              .join(', ')
          ) +
          '</div></details>';
      }
      if (r.same.length) {
        html +=
          '<details class="pv-details"><summary>' +
          esc(r.same.length + ' baris sama dengan yang sudah tercatat — dilewati') +
          '</summary><div class="pv-details-body doc-no">' +
          esc(
            r.same
              .map(function (m) {
                return m.row.sjNo || (find('deliveryOrders', m.doId) || {}).sjNo || '';
              })
              .join(', ')
          ) +
          '</div></details>';
      }
      html += '</div>';
    }

    var canApply = r.fill.length + r.changed.length > 0;
    html +=
      '<div class="card pv-apply">' +
      (r.fill.length
        ? '<label class="pv-check"><input type="checkbox" id="pv-recap-over"> Tetap catat walau melebihi kuota PO</label>'
        : '') +
      '<div class="pv-actions pv-actions-start">' +
      button(
        canApply
          ? 'Terapkan (' + r.fill.length + ' baru, ' + r.changed.length + ' berubah)'
          : 'Tidak ada yang diterapkan',
        'savePickupRecap',
        null,
        'btn',
        canApply ? '' : ' disabled'
      ) +
      button('Batal', 'pvRecapReset') +
      '</div></div>';
    return html;
  }

  function renderRecapApplied(rc) {
    var out = rc.applied;
    var html =
      '<div class="notice notice-success" role="status"><div><strong>Rekap diterapkan.</strong> ' +
      esc(
        out.filled +
          ' pengambilan baru dicatat, ' +
          out.changed +
          ' berat diperbarui' +
          (out.alerts ? ', ' + out.alerts + ' perlu ditindaklanjuti karena sudah ditagih' : '') +
          '.'
      ) +
      '</div></div>';
    if (out.alerts) {
      html +=
        '<div class="notice notice-warning"><div>' +
        esc(out.alerts + ' surat jalan berubah beratnya setelah ditagih.') +
        ' ' +
        button('Buka Perubahan Timbangan', 'pvGoChanges', null, 'btn-ghost btn-sm') +
        '</div></div>';
    }
    if (out.errors.length) {
      html += tableCard(
        'Tidak diterapkan',
        'Baris berikut tidak dicatat',
        ['#Baris', 'No SJ', 'Tanggal', 'No. Polisi', '#Netto', 'Alasan'],
        out.errors.map(function (e) {
          return (
            '<tr>' +
            rowCells(e.row) +
            '<td class="t-num">' +
            esc(e.row.net != null ? fmtT(e.row.net) : '—') +
            '</td><td>' +
            esc(e.error) +
            '</td></tr>'
          );
        })
      );
    }
    html +=
      '<div class="pv-actions pv-actions-start">' +
      button('Impor file lain', 'pvRecapReset') +
      button('Lihat Rekap Pengambilan', 'pvGoTrips') +
      '</div>';
    return html;
  }

  function applyRecap() {
    var rc = S.recap;
    if (!rc || !rc.result) return;
    var over = document.getElementById('pv-recap-over');
    var out = T().applyRecap(rc.result, {
      // "Rekap <file> <date>", without doubling a file name that says Rekap already.
      source: (/^rekap\b/i.test(rc.fileName) ? '' : 'Rekap ') + rc.fileName + ' ' + todayISO(),
      allowOverQuota: !!(over && over.checked),
    });
    save();
    rc.applied = out;
    rc.result = null;
    toast(
      out.filled + ' baru dicatat, ' + out.changed + ' berat diperbarui.',
      out.errors.length ? 'warning' : 'success'
    );
    if (out.alerts)
      toast(out.alerts + ' perubahan berat pada surat jalan yang sudah ditagih.', 'warning');
    rerender();
    scrollTop();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Perubahan Timbangan
  // ═══════════════════════════════════════════════════════════════════════════
  function openWeightChanges() {
    show('changes');
  }

  function weightEvents() {
    var t = T();
    var ev = [];
    list('deliveryOrders').forEach(function (d) {
      if (!t.isPickup(d)) return;
      var h = d.weighHistory || [];
      if (h.length < 2) return;
      for (var i = 1; i < h.length; i++) {
        ev.push({ d: d, h: h[i], prev: h[i].prevNet != null ? h[i].prevNet : h[i - 1].net });
      }
    });
    ev.sort(function (a, b) {
      return String(b.h.at || '').localeCompare(String(a.h.at || ''));
    });
    return ev;
  }
  function alertForEvent(e) {
    var a = e.d.weightAlert;
    if (!a) return null;
    var close = Math.abs(new Date(a.at) - new Date(e.h.at)) < 5000;
    return close && Math.abs(num(a.to) - num(e.h.net)) < 0.0005 ? a : null;
  }

  function renderChanges() {
    var t = T();
    var alerts = t.openAlerts().sort(function (a, b) {
      return String(b.weightAlert.at || '').localeCompare(String(a.weightAlert.at || ''));
    });
    var html = header('Perubahan Timbangan', '', button('Impor Rekap Timbangan', 'pvGoRecap'));

    // Open alerts as cards: few at a time, and each needs its action in reach on
    // any screen width.
    html +=
      '<div class="card"><div class="card-head"><div><div class="card-title">Perlu ditindaklanjuti</div>' +
      '<div class="card-sub">Berat berubah setelah ditagih. Faktur lama tidak diubah; selisihnya ditagih dengan faktur susulan, atau tandai selesai dengan catatan.</div></div></div>' +
      (alerts.length
        ? alerts
            .map(function (d) {
              var a = d.weightAlert;
              var delta = r3(num(a.to) - num(a.from));
              return (
                '<div class="pv-alert">' +
                '<div class="pv-alert-head"><div><div class="doc-no">' +
                esc(d.sjNo || d.number) +
                '</div><div class="t-muted">' +
                esc((d.customer || '—') + ' · diambil ' + fmtDate(d.date)) +
                '</div></div>' +
                '<div class="pv-alert-change">' +
                esc(fmtT(a.from) + ' → ' + qty(a.to, unitOfSlot(d))) +
                ' <span class="pv-danger">' +
                esc('(' + (delta > 0 ? '+' : '') + fmtT(delta) + ')') +
                '</span></div></div>' +
                '<div class="detail-grid">' +
                detail(
                  'Faktur pelanggan (berat lama)',
                  a.salesInvoice ? '<span class="doc-no">' + esc(a.salesInvoice) + '</span>' : '—'
                ) +
                detail(
                  'Faktur supplier (berat lama)',
                  a.purchaseInvoice
                    ? '<span class="doc-no">' + esc(a.purchaseInvoice) + '</span>'
                    : '—'
                ) +
                detail('Sumber', esc(sourceLabel(a.source))) +
                detail('Dicatat', esc(fmtDateTime(a.at))) +
                gapDetail(d, 'sales') +
                gapDetail(d, 'purchases') +
                '</div>' +
                '<div class="pv-actions pv-actions-start">' +
                gapAction(d, 'sales') +
                gapAction(d, 'purchases') +
                button('Tandai selesai', 'editPickupAlert', d.id, 'btn-ghost') +
                (d.ticketPhoto ? button('Foto DO', 'pvPhoto', d.id, 'btn-ghost') : '') +
                '</div></div>'
              );
            })
            .join('')
        : '<div class="empty-inline">Tidak ada perubahan berat yang perlu ditindaklanjuti.</div>') +
      '</div>';

    var events = weightEvents();
    html += tableCard(
      'Riwayat perubahan berat',
      '',
      ['Waktu', 'Surat jalan', 'Berat', 'Sumber', 'Status', ''],
      events.map(function (e) {
        var a = alertForEvent(e);
        var status = a
          ? a.resolved
            ? badge('success', 'Selesai') +
              (a.note ? '<div class="t-muted">' + esc(a.note) + '</div>' : '')
            : badge('danger', 'Perlu tindak lanjut')
          : '<span class="t-muted">Belum ditagih saat berubah</span>';
        return (
          '<tr><td class="pv-nowrap">' +
          esc(fmtDateTime(e.h.at)) +
          (e.h.by ? '<div class="t-muted">' + esc(e.h.by) + '</div>' : '') +
          '</td><td><div class="doc-no">' +
          esc(e.d.sjNo || e.d.number) +
          '</div><div class="t-muted">' +
          esc((e.d.customer || '—') + ' · diambil ' + fmtDate(e.d.date)) +
          '</div></td><td class="pv-change">' +
          esc(fmtT(e.prev) + ' → ' + qty(e.h.net, unitOfSlot(e.d))) +
          '</td><td class="pv-src">' +
          esc(sourceLabel(e.h.source)) +
          (e.h.note ? '<div class="t-muted">' + esc(e.h.note) + '</div>' : '') +
          '</td><td>' +
          status +
          '</td><td>' +
          (e.d.ticketPhoto ? button('Foto DO', 'pvPhoto', e.d.id, 'btn-ghost btn-sm') : '') +
          '</td></tr>'
        );
      }),
      { empty: 'Belum ada berat yang berubah.', wrap: true }
    );
    return html;
  }

  // The weight difference per side of an alert: not invoiced yet (the next
  // invoice takes the new weight), still to bill, billed too much, or billed.
  function gapDetail(d, sideKey) {
    var g = T().billingGap(sideKey, d.id);
    var label = sideKey === 'sales' ? 'Selisih ke pelanggan' : 'Selisih dari supplier';
    var unit = unitOfSlot(d);
    var a = d.weightAlert || {};
    var done = a.adjustments && a.adjustments[sideKey];
    var text;
    if (!g.invoiced) text = '<span class="t-muted">Belum difakturkan; fakturnya nanti memakai berat baru</span>';
    else if (g.diff > 0.0005)
      text = '<span class="pv-danger">' + esc('+' + qty(g.diff, unit) + ' belum ditagih') + '</span>';
    else if (g.diff < -0.0005)
      text = esc('Ditagih lebih ' + qty(-g.diff, unit));
    else text = done ? 'Ditagih susulan <span class="doc-no">' + esc(done) + '</span>' : 'Sudah sesuai';
    return detail(label, text);
  }
  function gapAction(d, sideKey) {
    var g = T().billingGap(sideKey, d.id);
    if (!g.invoiced || g.diff <= 0.0005) return '';
    return sideKey === 'sales'
      ? button('Tagih selisih ke pelanggan', 'createPickupAdjust', d.id, 'btn', ' data-side="sales"')
      : button('Catat tagihan selisih supplier', 'createPickupAdjust', d.id, 'btn', ' data-side="purchases"');
  }

  // Faktur susulan for a weight difference (Trading.createAdjustment): the
  // customer side straight after a check, the supplier side with the number of
  // the supplier's invoice.
  function askAdjust(doId, sideKey) {
    var d = find('deliveryOrders', doId);
    if (!d) return;
    var g = T().billingGap(sideKey, doId);
    if (!g.invoiced || g.diff <= 0.0005) return;
    var am = T().amounts(d);
    var price = sideKey === 'sales' ? am.salePrice : am.purchasePrice;
    var unit = unitOfSlot(d);
    var first = g.invoices[0];
    var money = typeof window.idrFull === 'function' ? window.idrFull : String;
    // The same rule as the invoice: PPN at the order's rate, on top unless the
    // order's prices include it.
    var order = find(sideKey === 'sales' ? 'salesOrders' : 'purchaseOrders', sideKey === 'sales' ? d.soId : d.poId);
    var rate = num(order && order.taxRate);
    var dppGross = Math.round(g.diff * price);
    var incl = !!(order && order.taxInclusive) && rate > 0;
    var tax = incl ? Math.round((dppGross * rate) / (1 + rate)) : Math.round(dppGross * rate);
    var total = incl ? dppGross : dppGross + tax;
    var body =
      '<div class="detail-grid">' +
      detail('Surat jalan', '<span class="doc-no">' + esc(d.sjNo || d.number) + '</span>') +
      detail(sideKey === 'sales' ? 'Pelanggan' : 'Supplier', esc((sideKey === 'sales' ? d.customer : d.supplier) || '—')) +
      detail('Sudah ditagih', esc(qty(g.billed, unit) + ' · ' + (first.number || first.id))) +
      detail('Berat sekarang', esc(qty(g.net, unit))) +
      detail('Selisih', '<strong>' + esc(qty(g.diff, unit)) + '</strong>') +
      detail('Harga', esc(money(price) + ' / ' + unit)) +
      detail('Nilai faktur', '<strong>' + esc(money(total)) + '</strong>' + (rate > 0 ? ' <span class="t-muted">' + esc('termasuk PPN ' + money(tax)) + '</span>' : '')) +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="pv-adj-date">Tanggal faktur</label>' +
      '<input class="form-input" type="date" id="pv-adj-date" value="' +
      esc(todayISO()) +
      '"></div>' +
      (sideKey === 'purchases'
        ? '<div class="form-group"><label class="form-label" for="pv-adj-ref">No. faktur supplier<span class="req">*</span></label>' +
          '<input class="form-input" id="pv-adj-ref" autocomplete="off" placeholder="Nomor di tagihan selisih dari supplier"></div>'
        : '') +
      '<div class="form-hint">Faktur lama tetap. Faktur susulan berisi satu baris untuk selisih ini' +
      (sideKey === 'sales' ? ' dan bisa langsung dicetak dari Faktur Penjualan.' : '.') +
      '</div>';
    openDialog(
      (sideKey === 'sales' ? 'Tagih selisih · ' : 'Tagihan selisih supplier · ') + (d.sjNo || d.number),
      body,
      '<button type="button" class="btn-ghost" data-action="closeModal">Batal</button>' +
        button(
          sideKey === 'sales' ? 'Buat faktur selisih' : 'Simpan faktur selisih',
          'savePickupAdjust',
          d.id,
          'btn',
          ' data-side="' + sideKey + '"'
        )
    );
  }
  function submitAdjust(doId, sideKey) {
    var r = T().createAdjustment(sideKey, doId, {
      date: val('pv-adj-date') || todayISO(),
      supplierRef: sideKey === 'purchases' ? val('pv-adj-ref').trim() : '',
    });
    if (r.error) {
      toast(r.error, 'warning');
      return;
    }
    save();
    closeDialog();
    toast(
      (r.invoice.number || r.invoice.id) +
        ' dibuat untuk selisih ' +
        fmtT(r.invoice.lines[0].qty) +
        (sideKey === 'sales' ? ' — cetak dari Faktur Penjualan.' : '.'),
      'success'
    );
    rerender();
  }

  function askResolve(doId) {
    var d = find('deliveryOrders', doId);
    if (!d || !d.weightAlert) return;
    var a = d.weightAlert;
    openDialog(
      'Tandai selesai · ' + (d.sjNo || d.number),
      '<div class="detail-grid">' +
        detail('Pelanggan', esc(d.customer || '—')) +
        detail('Berat', esc(fmtT(a.from) + ' → ' + qty(a.to, unitOfSlot(d)))) +
        detail('Faktur pelanggan', esc(a.salesInvoice || '—')) +
        detail('Faktur supplier', esc(a.purchaseInvoice || '—')) +
        '</div>' +
        '<div class="form-group"><label class="form-label" for="pv-resolve-note">Tindak lanjut<span class="req">*</span></label>' +
        '<textarea class="form-input" id="pv-resolve-note" rows="3" placeholder="Contoh: dikonfirmasi ke supplier, berat lama yang benar"></textarea>' +
        '<div class="form-hint">Faktur tidak diubah otomatis. Catat apa yang sudah dilakukan.</div></div>',
      '<button type="button" class="btn-ghost" data-action="closeModal">Batal</button>' +
        button('Tandai selesai', 'updatePickupAlert', d.id, 'btn')
    );
  }
  function submitResolve(doId) {
    var note = val('pv-resolve-note').trim();
    if (!note) {
      toast('Isi catatan tindak lanjut.', 'warning');
      return;
    }
    if (!T().resolveAlert(doId, note)) {
      toast('Perubahan ini tidak ditemukan.', 'danger');
      closeDialog();
      return;
    }
    save();
    closeDialog();
    var d = find('deliveryOrders', doId);
    if (d && d.weightAlert && d.weightAlert.resolved) toast('Ditandai selesai.', 'success');
    rerender();
  }

  // ── Koreksi berat ─────────────────────────────────────────────────────────
  // A typing error in a recorded trip, corrected by hand (no weighbridge recap
  // needed). Goes through Trading.updateWeight like a recap change: the old and
  // new weight stay in the trip's history, and a trip already on an invoice
  // shows up in Perubahan Timbangan instead of changing that invoice.
  function askWeight(doId) {
    var d = find('deliveryOrders', doId);
    if (!d || !T().isTrip(d)) return;
    var w = d.weighing || {};
    var unit = unitOfSlot(d) || 't';
    var inv = invoiceRefs(d);
    var billed = [inv.si, inv.pi].filter(Boolean);
    var field = function (id, label, v) {
      return (
        '<div class="form-group"><label class="form-label" for="' +
        id +
        '">' +
        esc(label) +
        ' (' +
        esc(unit) +
        ')</label><input class="form-input" id="' +
        id +
        '" inputmode="decimal" autocomplete="off" value="' +
        (v != null && v !== '' ? esc(fmtInput(v)) : '') +
        '"></div>'
      );
    };
    openDialog(
      'Koreksi berat · ' + (d.sjNo || d.number),
      '<div class="detail-grid">' +
        detail('Pelanggan', esc(d.customer || '—')) +
        detail('Tanggal ambil', esc(fmtDate(d.date))) +
        detail('No. Polisi', esc(d.vehicle || '—')) +
        detail('Netto sekarang', esc(qty(T().netOf(d), unit))) +
        '</div>' +
        '<div class="pv-w3">' +
        field('pv-fix-gross', 'Bruto', w.gross) +
        field('pv-fix-tare', 'Tara', w.tare) +
        field('pv-fix-net', 'Netto', T().netOf(d)) +
        '</div>' +
        '<div class="form-hint">Isi bruto dan tara (netto dihitung), atau netto saja.</div>' +
        '<div class="form-group"><label class="form-label" for="pv-fix-note">Alasan<span class="req">*</span></label>' +
        '<input class="form-input" id="pv-fix-note" autocomplete="off" placeholder="Contoh: salah ketik bruto, DO menunjukkan 47,25"></div>' +
        (billed.length
          ? '<div class="notice notice-warning">Sudah ditagih (' +
            esc(billed.join(', ')) +
            '). Faktur tetap memakai berat lama; perubahan ini muncul di Perubahan Timbangan untuk ditindaklanjuti.</div>'
          : ''),
      '<button type="button" class="btn-ghost" data-action="closeModal">Batal</button>' +
        button('Simpan koreksi', 'updatePickupWeight', d.id, 'btn')
    );    // Netto follows bruto − tara as they are typed.
    ['pv-fix-gross', 'pv-fix-tare'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        var g = parseNumInput(val('pv-fix-gross'));
        var net = document.getElementById('pv-fix-net');
        if (net && g > 0) net.value = fmtInput(r3(g - (parseNumInput(val('pv-fix-tare')) || 0)));
      });
    });
  }
  function submitWeight(doId) {
    var note = val('pv-fix-note').trim();
    if (!note) {
      toast('Isi alasan koreksi.', 'warning');
      return;
    }
    var g = parseNumInput(val('pv-fix-gross'));
    var tr = parseNumInput(val('pv-fix-tare'));
    var data = g > 0 ? { gross: g, tare: tr || 0 } : { net: parseNumInput(val('pv-fix-net')) };
    var r = T().updateWeight(doId, data, { source: 'manual', note: note });
    if (r.error) {
      toast(r.error, 'warning');
      return;
    }
    if (!r.changed) {
      toast('Berat tidak berubah.', 'info');
      return;
    }
    save();
    closeDialog();
    toast(
      r.alert ? 'Berat dikoreksi. Tercatat di Perubahan Timbangan.' : 'Berat dikoreksi.',
      'success'
    );
    rerender();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Rekap Pengambilan
  // ═══════════════════════════════════════════════════════════════════════════
  function openTripRecap() {
    show('tripRecap');
  }

  function tripFilter() {
    if (!S.trip) {
      var today = todayISO();
      S.trip = {
        from: monthStartISO(today),
        to: monthEndISO(today),
        customerId: '',
        supplierId: '',
        poId: '',
      };
    }
    return S.trip;
  }
  function allTrips() {
    var t = T();
    return list('deliveryOrders')
      .filter(t.isTrip)
      .sort(function (a, b) {
        return (
          String(a.date || '').localeCompare(String(b.date || '')) ||
          String(a.sjNo || '').localeCompare(String(b.sjNo || ''))
        );
      });
  }
  function filteredTrips() {
    var f = tripFilter();
    return allTrips().filter(function (d) {
      if (f.from && String(d.date || '') < f.from) return false;
      if (f.to && String(d.date || '') > f.to) return false;
      if (f.customerId && String(d.customerId) !== f.customerId) return false;
      if (f.supplierId && String(d.supplierId) !== f.supplierId) return false;
      if (f.poId && String(d.poId) !== f.poId) return false;
      return true;
    });
  }
  function optionList(trips, idKey, nameKey, selected, allLabel) {
    var seen = {};
    var opts = [];
    trips.forEach(function (d) {
      var id = d[idKey];
      if (id === null || id === undefined || id === '' || seen[id]) return;
      seen[id] = true;
      opts.push({ id: String(id), name: d[nameKey] || String(id) });
    });
    opts.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return (
      '<option value="">' +
      esc(allLabel) +
      '</option>' +
      opts
        .map(function (o) {
          return (
            '<option value="' +
            esc(o.id) +
            '"' +
            (o.id === selected ? ' selected' : '') +
            '>' +
            esc(o.name) +
            '</option>'
          );
        })
        .join('')
    );
  }
  function totalsByUnit(trips) {
    var t = T();
    var by = {};
    var order = [];
    trips.forEach(function (d) {
      var u = unitOfSlot(d) || '';
      if (!(u in by)) {
        by[u] = 0;
        order.push(u);
      }
      by[u] += t.netOf(d);
    });
    return order
      .map(function (u) {
        return qty(by[u], u);
      })
      .join(' · ');
  }

  function renderTripRecap() {
    var f = tripFilter();
    var all = allTrips();
    var trips = filteredTrips();
    var invs = trips.map(invoiceRefs);
    var noSI = invs.filter(function (i) {
      return !i.si;
    }).length;
    var noPI = invs.filter(function (i) {
      return !i.pi;
    }).length;

    var html = header(
      'Rekap Pengambilan',
      '',
      button('Ekspor Excel', 'pvTripExport', null, 'btn', trips.length ? '' : ' disabled')
    );
    html +=
      '<div class="card pv-filters">' +
      '<div class="form-group"><label class="form-label" for="pv-trip-from">Dari</label>' +
      '<input class="form-input" id="pv-trip-from" type="date" value="' +
      esc(f.from) +
      '"></div>' +
      '<div class="form-group"><label class="form-label" for="pv-trip-to">Sampai</label>' +
      '<input class="form-input" id="pv-trip-to" type="date" value="' +
      esc(f.to) +
      '"></div>' +
      '<div class="form-group"><label class="form-label" for="pv-trip-cust">Pelanggan</label>' +
      '<select class="form-select" id="pv-trip-cust">' +
      optionList(all, 'customerId', 'customer', f.customerId, 'Semua pelanggan') +
      '</select></div>' +
      '<div class="form-group"><label class="form-label" for="pv-trip-sup">Supplier</label>' +
      '<select class="form-select" id="pv-trip-sup">' +
      optionList(all, 'supplierId', 'supplier', f.supplierId, 'Semua supplier') +
      '</select></div>' +
      '<div class="form-group"><label class="form-label" for="pv-trip-po">PO</label>' +
      '<select class="form-select" id="pv-trip-po">' +
      optionList(all, 'poId', 'poNumber', f.poId, 'Semua PO') +
      '</select></div>' +
      '</div>';

    html += stats([
      { label: 'Truk', value: String(trips.length), sub: fmtDate(f.from) + ' – ' + fmtDate(f.to) },
      {
        label: 'Total netto',
        value: trips.length ? totalsByUnit(trips) : '0',
        sub: 'hasil timbangan',
      },
      {
        label: 'Belum ditagih ke pelanggan',
        value: String(noSI),
        sub: 'truk tanpa faktur penjualan',
        color: noSI ? 'var(--warning)' : '',
      },
      {
        label: 'Belum ada faktur supplier',
        value: String(noPI),
        sub: 'truk tanpa faktur pembelian',
        color: noPI ? 'var(--warning)' : '',
      },
    ]);

    var rows = trips.map(function (d, i) {
      var w = d.weighing || {};
      var inv = invs[i];
      var flags = slotFlags(d);
      return (
        '<tr><td data-cell="meta">' +
        esc(fmtDate(d.date)) +
        '</td><td data-cell="title"><div class="doc-no">' +
        esc(d.sjNo || d.number) +
        '</div>' +
        (flags ? '<div class="pv-flags">' + flags + '</div>' : '') +
        '</td><td class="doc-no" data-cell="meta">' +
        esc(d.poNumber || '—') +
        '</td><td data-cell="name">' +
        esc(d.customer || '—') +
        '</td><td data-cell="meta">' +
        esc(itemOfSlot(d) || '—') +
        '</td><td data-cell="meta">' +
        esc(d.vehicle || '—') +
        '</td><td data-cell="meta" data-cap="Sopir">' +
        esc(d.driver || '—') +
        '</td><td class="t-num" data-cell="meta" data-cap="Bruto">' +
        esc(w.gross != null ? fmtT(w.gross) : '—') +
        '</td><td class="t-num" data-cell="meta" data-cap="Tara">' +
        esc(w.tare != null ? fmtT(w.tare) : '—') +
        '</td><td class="t-num t-strong" data-cell="amount">' +
        esc(qty(T().netOf(d), unitOfSlot(d))) +
        '</td><td data-cell="meta" data-cap="Faktur pelanggan">' +
        (inv.si ? '<span class="doc-no">' + esc(inv.si) + '</span>' : badge('warning', 'Belum')) +
        '</td><td data-cell="meta" data-cap="Faktur supplier">' +
        (inv.pi ? '<span class="doc-no">' + esc(inv.pi) + '</span>' : badge('warning', 'Belum')) +
        '</td><td data-cell="menu">' +
        (d.ticketPhoto ? button('Foto', 'pvPhoto', d.id, 'btn-ghost btn-sm') : '') +
        '</td></tr>'
      );
    });
    html += tableCard(
      'Pengambilan',
      trips.length + ' truk',
      [
        'Tanggal',
        'No SJ',
        'PO supplier',
        'Pelanggan',
        'Barang',
        'No. Polisi',
        'Sopir',
        '#Bruto',
        '#Tara',
        '#Netto',
        'Faktur pelanggan',
        'Faktur supplier',
        '',
      ],
      rows,
      {
        empty: 'Tidak ada pengambilan pada filter ini.',
        cards: true,
        foot: trips.length
          ? '<tfoot><tr><td colspan="9">' +
            esc('Total ' + trips.length + ' truk') +
            '</td><td class="t-num">' +
            esc(totalsByUnit(trips)) +
            '</td><td colspan="3"></td></tr></tfoot>'
          : '',
      }
    );
    return html;
  }

  function exportTrips() {
    var f = tripFilter();
    var trips = filteredTrips();
    if (!trips.length) {
      toast('Tidak ada pengambilan untuk diekspor.', 'warning');
      return;
    }
    if (download('Rekap Pengambilan ' + f.from + ' sd ' + f.to, [T().tripRecapSheet(trips)])) {
      toast(trips.length + ' pengambilan diekspor.', 'success');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Events (delegated; CSP forbids inline handlers)
  // ═══════════════════════════════════════════════════════════════════════════
  var ACTIONS = {
    pvOrdersTab: function (id) {
      S.ordersTab = id === 'done' ? 'done' : 'open';
      rerender();
    },
    pvOpenPO: function (id) {
      // Also from an order's dialog (erp-crud viewSO): the dialog closes first.
      if (document.querySelector('#modalOverlay.active')) closeDialog();
      openPO(id);
    },
    pvGoOrders: function () {
      openOrders();
    },
    pvGoRecap: function () {
      openRecapImport();
    },
    pvGoChanges: function () {
      openWeightChanges();
    },
    pvGoTrips: function () {
      openTripRecap();
    },
    pvExportSupplier: exportSupplier,
    pvExportPO: exportPO,
    pvPrintSlot: printSlot,
    pvPhoto: showPhoto,
    pvTripExport: exportTrips,
    pvRecapReset: function () {
      S.recap = null;
      rerender();
    },
    pvRecPhotoClear: function () {
      S.rec.photo = '';
      S.rec.photoKB = 0;
      rerender();
    },
    createPickupPO: openSetup,
    savePickupPO: submitSetup,
    addPickupTrip: function (id, el) {
      var poId = el.getAttribute('data-po');
      if (poId) openRecord(poId, id);
      else openRecord(id || '');
    },
    savePickupTrip: function () {
      submitTrip(false);
    },
    savePickupTripOver: function () {
      closeDialog();
      submitTrip(true);
    },
    voidPickupSlot: askVoid,
    voidPickupSlotConfirm: confirmVoid,
    editPickupClose: askClose,
    updatePickupClose: confirmClose,
    editPickupReopen: askReopen,
    updatePickupReopen: confirmReopen,
    savePickupRecap: applyRecap,
    editPickupAlert: askResolve,
    updatePickupAlert: submitResolve,
    createPickupAdjust: function (id, el) {
      askAdjust(id, el.getAttribute('data-side') === 'purchases' ? 'purchases' : 'sales');
    },
    savePickupAdjust: function (id, el) {
      submitAdjust(id, el.getAttribute('data-side') === 'purchases' ? 'purchases' : 'sales');
    },
    editPickupWeight: askWeight,
    updatePickupWeight: submitWeight,
  };

  var REC_FIELDS = {
    'pv-rec-date': 'date',
    'pv-rec-vehicle': 'vehicle',
    'pv-rec-driver': 'driver',
    'pv-rec-gross': 'gross',
    'pv-rec-tare': 'tare',
    'pv-rec-net': 'net',
    'pv-rec-dest': 'dest',
    'pv-rec-ticket': 'ticketNo',
    'pv-rec-note': 'note',
  };
  var TRIP_FIELDS = {
    'pv-trip-from': 'from',
    'pv-trip-to': 'to',
    'pv-trip-cust': 'customerId',
    'pv-trip-sup': 'supplierId',
    'pv-trip-po': 'poId',
  };

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var fn = ACTIONS[el.getAttribute('data-action')];
    if (!fn || el.disabled) return;
    fn(el.getAttribute('data-id'), el);
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    var id = el && el.id;
    if (!id || id.indexOf('pv-') !== 0) return;
    if (REC_FIELDS[id]) {
      if (id === 'pv-rec-net' && el.readOnly) return;
      S.rec[REC_FIELDS[id]] = el.value;
      if (id === 'pv-rec-gross' || id === 'pv-rec-tare' || id === 'pv-rec-net') updateNet();
    } else if (id === 'pv-setup-cap') {
      updateSetupPreview();
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    var id = el && el.id;
    if (!id || id.indexOf('pv-') !== 0) return;
    if (id === 'pv-rec-po') {
      S.rec.poId = el.value;
      S.rec.slotId = '';
      S.rec.destFor = '';
      rerender();
    } else if (id === 'pv-rec-slot') {
      S.rec.slotId = el.value;
      rerender();
    } else if (id === 'pv-rec-photo') {
      var photo = el.files && el.files[0];
      el.value = '';
      handlePhoto(photo);
    } else if (id === 'pv-recap-file') {
      var file = el.files && el.files[0];
      el.value = '';
      loadRecapFile(file);
    } else if (id === 'pv-setup-so') {
      updateSetupPreview();
    } else if (TRIP_FIELDS[id]) {
      tripFilter()[TRIP_FIELDS[id]] = el.value;
      rerender();
    } else if (REC_FIELDS[id]) {
      if (id === 'pv-rec-net' && el.readOnly) return;
      S.rec[REC_FIELDS[id]] = el.value;
    }
  });

  // ── Page styles (tokens only; sizes in rem so they follow "Ukuran teks") ────
  function ensureStyles() {
    if (document.getElementById('pv-styles')) return;
    var st = document.createElement('style');
    st.id = 'pv-styles';
    st.textContent = [
      '.pv-hdr-actions{display:flex;flex-wrap:wrap;gap:8px}',
      '.pv-back{margin-bottom:8px}',
      '.pv-bar{min-width:9rem}',
      '.pv-bar-text{margin-bottom:4px;font-size:.8125rem;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.pv-over .cust-bar-fill{background:var(--danger)}',
      '.pv-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.pv-toolbar .form-select{width:auto;min-width:12rem;max-width:100%}',
      '.pv-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}',
      '.pv-actions-start{justify-content:flex-start;margin-top:4px}',
      '.pv-flags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}',
      '.pv-kpi{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px;padding-top:12px;border-top:1px solid var(--border-light)}',
      '.pv-kpi-val{font-size:.9375rem;font-weight:600;color:var(--text)}',
      '.pv-rec{max-width:42rem}',
      '.pv-rec .form-label{font-size:1rem;color:var(--text)}',
      '.pv-rec .form-input,.pv-rec .form-select{height:3rem;font-size:1.125rem}',
      '.pv-rec textarea.form-input{height:auto;min-height:4.5rem}',
      '.pv-rec .form-hint{font-size:.8125rem}',
      '.pv-upper{text-transform:uppercase}',
      '.pv-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;margin-bottom:16px;padding:12px 14px;background:var(--surface-sunken);border-radius:var(--r-sm)}',
      '.pv-info-label{font-size:.75rem;color:var(--muted)}',
      '.pv-info-val{font-size:1rem;font-weight:600;color:var(--text);overflow-wrap:anywhere}',
      '.pv-w3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}',
      '.pv-net{display:flex;align-items:baseline;gap:10px;margin:0 0 6px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-sm)}',
      '.pv-net-val{font-size:1.75rem;font-weight:650;font-variant-numeric:tabular-nums;color:var(--text)}',
      '.pv-hint{margin-bottom:14px}',
      '.pv-file{display:flex;flex-wrap:wrap;gap:10px;align-items:center}',
      '.pv-file label{margin-bottom:0}',
      '.pv-photo-prev{margin-top:10px}',
      '.pv-photo-prev img{display:block;max-width:100%;max-height:16rem;border:1px solid var(--border);border-radius:var(--r-sm)}',
      '.pv-photo-full{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:var(--r-sm)}',
      '.pv-quiet{margin:0 0 var(--card-gap);color:var(--muted);font-size:.8125rem}',
      '.pv-help{margin-top:14px;font-size:.8125rem}',
      '.pv-help summary{cursor:pointer;color:var(--accent-text);width:max-content}',
      '.pv-help .pv-cols{margin:10px 0 6px}',
      '.pv-submit{width:100%;height:3.25rem;font-size:1.125rem;font-weight:600}',
      '.pv-row-danger td{background:var(--danger-bg)}',
      '.pv-alert{margin-top:12px;padding:14px 16px;background:var(--danger-bg);border:1px solid var(--border);border-left:3px solid var(--danger);border-radius:var(--r-sm)}',
      '.pv-alert .detail-grid{margin:12px 0}',
      '.pv-alert-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px}',
      '.pv-alert-change{font-size:1.125rem;font-weight:650;font-variant-numeric:tabular-nums;color:var(--text)}',
      '.pv-src{min-width:11rem}',
      '.pv-table td{white-space:nowrap}',
      '.pv-nowrap{white-space:nowrap}',
      '.pv-change{white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.pv-danger{color:var(--danger);font-weight:600}',
      '.pv-warn{color:var(--warning);font-weight:600}',
      '.pv-p{margin:6px 0 0;font-size:.8125rem;color:var(--text-secondary)}',
      '.pv-cols{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}',
      '.pv-list{margin:0 0 14px;padding-left:1.1rem;font-size:.8125rem;line-height:1.6;color:var(--text-secondary)}',
      '.pv-details summary{cursor:pointer;font-size:.8125rem;color:var(--text-secondary);padding:4px 0}',
      '.pv-details-body{padding:6px 0 10px;font-size:.78125rem;color:var(--muted);overflow-wrap:anywhere;white-space:normal}',
      '.pv-apply{display:flex;flex-direction:column;gap:10px}',
      '.pv-check{display:flex;align-items:center;gap:8px;margin:0;font-size:.875rem;color:var(--text)}',
      '.pv-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0 12px;padding-bottom:4px}',
      '@media (max-width:900px){.pv-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media (max-width:560px){.pv-w3,.pv-kpi,.pv-filters{grid-template-columns:1fr}.pv-toolbar,.pv-toolbar .form-select{width:100%}.pv-hdr-actions>*{flex:1 1 auto}}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  window.renderPickups = renderPickups;
  window._pickupView = {
    openOrders: openOrders,
    openPO: openPO,
    openSetup: openSetup,
    openRecord: function (poId, slotId) {
      openRecord(typeof poId === 'string' ? poId : '', typeof slotId === 'string' ? slotId : '');
    },
    openRecapImport: openRecapImport,
    openWeightChanges: openWeightChanges,
    openTripRecap: openTripRecap,
    // Reads a weighbridge recap file (File/Blob) into the review on Impor Rekap
    // Timbangan. Resolves true when the file was read.
    loadRecapFile: loadRecapFile,
  };
})();
