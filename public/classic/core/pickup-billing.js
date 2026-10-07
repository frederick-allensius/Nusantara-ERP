// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Billing from pickups  (pickup-billing.js)
//
// Invoices made from trading trips (window.Trading, trading.js):
//   openCustomerBilling  Tagih Pelanggan — customers with trips not yet invoiced;
//                        a customer's trips in a period (weekly, typically) become
//                        one sales invoice, with a trip recap for the customer
//   openSupplierBilling  Tagihan Supplier — record the supplier's bill against our
//                        trips: tonnage and price compared, trip purchase prices
//                        corrected (with history) before the purchase invoice is
//                        saved
//
// Invoices go through Trading.createInvoice (one line per truck, `doIds` on the
// invoice); the journals follow from gl.js on save. Nothing here posts journals.
//
// Trip data written here (additive): trip.purchasePrice / purchasePriceSource
// ('manual' | 'supplierPrice') and trip.priceHistory [{ at, by, from, to, note }];
// purchase invoice supplierRef (supplier's invoice no.) and supplierBill
// { qty, price, priceNote, ourQty, qtyDiff, reason } (the figures on their bill).
//
// Renders into #view-pickups (shared with pickup-view.js). Buttons use
// data-action names starting with "pb", handled by delegated listeners scoped to
// #pb-root. Global-scope rule: classic <script>, IIFE-wrapped; exposes only
// window._pickupBilling.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var EPS = 0.0005;
  var ID_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];

  var CFG = {
    customer: {
      side: 'sales',
      docType: 'SI',
      partyId: 'customerId',
      party: 'customer',
      parties: 'customers',
      invColl: 'salesInvoices',
      orderColl: 'salesOrders',
      orderKey: 'soId',
      money: 'sale',
      title: 'Tagih Pelanggan',
      sub: 'Faktur penjualan dari pengambilan truk pelanggan, per periode',
      partyLabel: 'Pelanggan',
      partyPlural: 'pelanggan',
    },
    supplier: {
      side: 'purchases',
      docType: 'PI',
      partyId: 'supplierId',
      party: 'supplier',
      parties: 'suppliers',
      invColl: 'purchaseInvoices',
      orderColl: 'purchaseOrders',
      orderKey: 'poId',
      money: 'purchase',
      title: 'Tagihan Supplier',
      sub: 'Catat faktur dari supplier dan cocokkan dengan pengambilan kita',
      partyLabel: 'Supplier',
      partyPlural: 'supplier',
    },
  };

  function freshState() {
    return {
      partyId: null,
      from: '',
      to: '',
      date: '',
      excluded: {}, // trip id → true when unticked (everything else is selected)
      created: null, // { type, id } of the invoice just made
      ref: '',
      qty: '',
      price: '',
      priceNote: '',
      reason: '',
      newPrice: '',
      newNote: '',
    };
  }
  var S = { page: 'customer', customer: freshState(), supplier: freshState() };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function st() {
    return S[S.page];
  }
  function cfg() {
    return CFG[S.page];
  }
  function db() {
    return window.DB || {};
  }
  function T() {
    return window.Trading;
  }
  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function r3(v) {
    return Math.round(num(v) * 1000) / 1000;
  }
  function same(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }
  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  function isoOf(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayISO() {
    return typeof window.today === 'function' ? window.today() : isoOf(new Date());
  }
  function addDays(iso, n) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function daysBetween(a, b) {
    var x = new Date(String(a).slice(0, 10) + 'T00:00:00');
    var y = new Date(String(b).slice(0, 10) + 'T00:00:00');
    return isNaN(x) || isNaN(y) ? 0 : Math.round((y - x) / 86400000);
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return esc(iso);
    return pad2(d.getDate()) + ' ' + ID_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function money(v) {
    return typeof window.idr === 'function'
      ? window.idr(v)
      : 'Rp ' + Math.round(num(v)).toLocaleString('id-ID');
  }
  function qty(v) {
    return r3(v).toLocaleString('id-ID', { maximumFractionDigits: 3 });
  }
  function signedQty(v) {
    return (v > 0 ? '+' : v < 0 ? '−' : '') + qty(Math.abs(v));
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
  }
  function find(coll, id) {
    return (
      (db()[coll] || []).find(function (d) {
        return same(d.id, id);
      }) || null
    );
  }
  function currentUser() {
    var u = window.__ERP_USER || {};
    if (u.displayName || u.username) return u.displayName || u.username;
    try {
      var a = window.erpAuth && window.erpAuth.getCurrentUser && window.erpAuth.getCurrentUser();
      if (a && (a.username || a.displayName || a.email))
        return a.username || a.displayName || a.email;
    } catch (_) {
      /* ignore */
    }
    return (db().settings && db().settings.user && db().settings.user.name) || '';
  }
  function hasAlert(d) {
    return !!(d && d.weightAlert && !d.weightAlert.resolved);
  }
  function partyName(c, id, fallback) {
    var p = (db()[c.parties] || []).find(function (x) {
      return same(x.id, id);
    });
    return (p && p.name) || fallback || String(id == null ? '' : id);
  }
  function itemOf(d) {
    return (d && d.lines && d.lines[0]) || {};
  }
  function activeInvoice(inv) {
    return !!inv && (inv.status === 'Outstanding' || inv.status === 'Paid');
  }
  function persist() {
    if (typeof window.saveDB === 'function') window.saveDB();
  }
  function sum(list, fn) {
    return list.reduce(function (s, x) {
      return s + fn(x);
    }, 0);
  }

  // Latest invoice of this party made from trips: the end of its period (next
  // period starts the day after) and its date (days since the last invoice).
  function lastTripInvoice(c, partyId) {
    var out = { periodTo: '', date: '', number: '' };
    (db()[c.invColl] || []).forEach(function (inv) {
      if (!activeInvoice(inv) || !Array.isArray(inv.doIds) || !inv.doIds.length) return;
      if (!same(inv[c.partyId], partyId)) return;
      if ((inv.periodTo || '') > out.periodTo) out.periodTo = inv.periodTo || '';
      if ((inv.date || '') > out.date) {
        out.date = inv.date || '';
        out.number = inv.number || inv.id;
      }
    });
    return out;
  }

  // Unbilled trips of one side grouped per party (customers / suppliers).
  function groups(c) {
    var map = {};
    var order = [];
    var orphan = 0;
    T()
      .unbilled(c.side)
      .forEach(function (d) {
        var pid = d[c.partyId];
        if (pid === null || pid === undefined || pid === '') {
          orphan++;
          return;
        }
        var k = String(pid);
        if (!map[k]) {
          map[k] = {
            id: k,
            name: partyName(c, pid, d[c.party]),
            trips: 0,
            qty: 0,
            total: 0,
            oldest: '',
            alerts: 0,
          };
          order.push(k);
        }
        var g = map[k];
        var a = T().amounts(d);
        g.trips++;
        g.qty = r3(g.qty + a.net);
        g.total += a[c.money].total;
        if (d.date && (!g.oldest || d.date < g.oldest)) g.oldest = d.date;
        if (hasAlert(d)) g.alerts++;
      });
    var list = order.map(function (k) {
      var g = map[k];
      g.last = lastTripInvoice(c, g.id);
      return g;
    });
    list.sort(function (a, b) {
      return (a.oldest || '').localeCompare(b.oldest || '') || a.name.localeCompare(b.name);
    });
    return { list: list, orphan: orphan };
  }

  // ── Period ─────────────────────────────────────────────────────────────────
  function quickRange(kind) {
    var to = todayISO();
    if (kind === 'week') {
      var day = new Date(to + 'T00:00:00').getDay(); // 0 = Sunday
      return { from: addDays(to, -((day + 6) % 7)), to: to };
    }
    if (kind === 'month') return { from: to.slice(0, 8) + '01', to: to };
    return { from: addDays(to, -6), to: to }; // '7d': the last 7 days incl. today
  }

  // From the day after the last trip invoice's period, else the last 7 days.
  function defaultPeriod(c, partyId) {
    var to = todayISO();
    var last = lastTripInvoice(c, partyId);
    var from = last.periodTo ? addDays(last.periodTo, 1) : quickRange('7d').from;
    if (from > to) from = to;
    return { from: from, to: to };
  }

  function filterFor(c, s, extra) {
    var f = { from: s.from || '', to: s.to || '' };
    f[c.partyId] = s.partyId;
    return Object.assign(f, extra || {});
  }
  function periodTrips(c, s) {
    if (s.from && s.to && s.from > s.to) return [];
    return T().unbilled(c.side, filterFor(c, s));
  }
  function olderTrips(c, s) {
    if (!s.from) return [];
    var f = {};
    f[c.partyId] = s.partyId;
    return T()
      .unbilled(c.side, f)
      .filter(function (d) {
        return (d.date || '') < s.from;
      });
  }
  function selectedOf(s, trips) {
    return trips.filter(function (d) {
      return !s.excluded[d.id];
    });
  }

  // ── Checks shared by both sides ────────────────────────────────────────────
  // Orders of the selected trips with a different PPN setup cannot share one
  // invoice: buildInvoice taxes the whole invoice at the first order's rate.
  function mixedTax(c, trips) {
    var keys = {};
    trips.forEach(function (d) {
      var o = find(c.orderColl, d[c.orderKey]) || {};
      keys[num(o.taxRate) + '|' + (o.taxInclusive ? 1 : 0)] = true;
    });
    return Object.keys(keys).length > 1;
  }

  // Supplier POs among the trips that were also picked up for another customer.
  function sharedPOs(trips, customerId) {
    var out = [];
    var seen = {};
    trips.forEach(function (d) {
      if (!d.poId || seen[d.poId]) return;
      seen[d.poId] = true;
      var others = {};
      T()
        .slotsFor(d.poId)
        .forEach(function (x) {
          if (T().isTrip(x) && !same(x.customerId, customerId)) {
            others[x.customer || x.customerId || 'tanpa pelanggan'] = true;
          }
        });
      var names = Object.keys(others);
      if (names.length) out.push({ po: d.poNumber || d.poId, names: names });
    });
    return out;
  }

  // Totals the invoice would get (not saved).
  function preview(c, ids, date) {
    if (!ids.length) return null;
    var b = T().buildInvoice(c.side, ids, { date: date || todayISO() });
    if (b.error) return { error: b.error };
    var inv = b.invoice;
    var sub = sum(inv.lines, function (l) {
      return num(l.subtotal);
    });
    return {
      dpp: inv.taxInclusive ? sub - num(inv.tax) : sub,
      tax: num(inv.tax),
      total: num(inv.amount),
      rate: num(inv.taxRate),
      incl: !!inv.taxInclusive,
    };
  }

  // Supplier price in effect on the trip date when it differs from the price the
  // trip carries (and that price was not set by hand).
  function newerSupplierPrice(d) {
    if (d.purchasePriceSource === 'manual') return null;
    var po = find('purchaseOrders', d.poId);
    if (!po) return null;
    var p = T().purchasePrice(po, itemOf(d).itemId, d.date);
    if (p.source !== 'supplierPrice') return null;
    return Math.abs(p.price - T().amounts(d).purchasePrice) > 0.5 ? p : null;
  }

  function billedPrice(s) {
    return String(s.price).trim() === '' ? null : num(s.price);
  }
  function priceDiffers(d, bp) {
    return bp != null && Math.abs(T().amounts(d).purchasePrice - bp) > 0.5;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function header(c) {
    return typeof window.secHdr === 'function'
      ? window.secHdr(c.title, c.sub, '', '', { showSub: true })
      : '<div class="sec-hdr"><div><h1>' +
          esc(c.title) +
          '</h1><p>' +
          esc(c.sub) +
          '</p></div></div>';
  }

  function sinceText(days) {
    if (days <= 0) return 'Hari ini';
    return days + ' hari lalu';
  }

  function overviewHTML(c) {
    var g = groups(c);
    var today = todayISO();
    var trips = sum(g.list, function (x) {
      return x.trips;
    });
    var tons = r3(
      sum(g.list, function (x) {
        return x.qty;
      })
    );
    var total = sum(g.list, function (x) {
      return x.total;
    });
    var oldest = g.list.reduce(function (o, x) {
      return x.oldest && (!o || x.oldest < o) ? x.oldest : o;
    }, '');
    var isCust = c === CFG.customer;
    // The totals as figure tiles (statRow, like the other pages); the table
    // below carries the per-party figures.
    var tiles = [
      {
        label: isCust ? 'Belum ditagih' : 'Belum difakturkan supplier',
        value: money(total),
        sub: trips + ' truk · ' + qty(tons) + ' ton',
      },
      {
        label: c.partyLabel,
        value: String(g.list.length),
        sub: isCust ? 'dengan pengambilan belum ditagih' : 'dengan pengambilan belum difakturkan',
      },
      {
        label: 'Pengambilan tertua',
        value: oldest ? fmtDate(oldest) : '—',
        sub: oldest ? sinceText(daysBetween(oldest, today)) : '',
      },
    ];
    var html =
      g.list.length && typeof window.statRow === 'function' ? window.statRow(tiles) : '';
    if (g.orphan) {
      html +=
        '<div class="notice notice-info">' +
        g.orphan +
        ' pengambilan belum terhubung ke PO pelanggan, jadi belum bisa ditagih dari halaman ini.</div>';
    }
    if (!g.list.length) {
      return (
        html +
        '<div class="card"><div class="empty-inline">' +
        (isCust
          ? 'Semua pengambilan sudah ditagih ke pelanggan.'
          : 'Semua pengambilan sudah tercatat di faktur supplier.') +
        '</div></div>'
      );
    }
    var rows = g.list
      .map(function (x) {
        var since = x.last.date ? daysBetween(x.last.date, today) : null;
        return (
          '<tr class="row-link" data-action="pbParty" data-id="' +
          esc(x.id) +
          '"><td data-cell="title"><strong>' +
          esc(x.name) +
          '</strong>' +
          (x.alerts
            ? ' <span class="badge badge-warning">' + x.alerts + ' timbangan berubah</span>'
            : '') +
          '</td><td class="t-num" data-cell="name" data-unit="truk">' +
          x.trips +
          '</td><td class="t-num" data-cell="meta" data-cap="Tonase">' +
          qty(x.qty) +
          '</td><td class="t-num" data-cell="amount">' +
          money(x.total) +
          '</td><td data-cell="meta" data-cap="Tertua">' +
          fmtDate(x.oldest) +
          '</td><td data-cell="meta" data-cap="Faktur terakhir">' +
          (since === null
            ? '<span class="t-muted">Belum ada</span>'
            : esc(sinceText(since)) +
              ' <span class="t-muted">· ' +
              esc(x.last.number) +
              '</span>') +
          '</td><td class="t-num" data-cell="action"><button type="button" class="btn btn-sm" data-action="pbParty" data-id="' +
          esc(x.id) +
          '">' +
          (isCust ? 'Tagih' : 'Catat tagihan') +
          '</button></td></tr>'
        );
      })
      .join('');
    return (
      html +
      '<div class="card"><div class="card-head"><div class="card-title">' +
      (isCust
        ? 'Pelanggan dengan pengambilan belum ditagih'
        : 'Supplier dengan pengambilan belum difakturkan') +
      '</div></div><div class="table-wrap"><table class="data-table list-cards"><thead><tr><th>' +
      esc(c.partyLabel) +
      '</th><th class="t-num">Truk</th><th class="t-num">Tonase</th><th class="t-num">Nilai (termasuk PPN)</th>' +
      '<th>Pengambilan tertua</th><th>Faktur terakhir</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function quickBtn(s, kind, label) {
    var r = quickRange(kind);
    var on = s.from === r.from && s.to === r.to;
    return (
      '<button type="button" class="seg-tab' +
      (on ? ' active' : '') +
      '" data-action="pbQuick" data-val="' +
      kind +
      '">' +
      label +
      '</button>'
    );
  }

  function periodHTML(s, labels) {
    return (
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="pb-from">' +
      labels[0] +
      '</label><input type="date" class="form-input" id="pb-from" value="' +
      esc(s.from) +
      '"></div><div class="form-group"><label class="form-label" for="pb-to">' +
      labels[1] +
      '</label><input type="date" class="form-input" id="pb-to" value="' +
      esc(s.to) +
      '"></div></div>' +
      '<div class="seg-tabs seg-tabs-sm" id="pb-quick" role="group" aria-label="Periode cepat">' +
      quickBtn(s, 'week', 'Minggu ini') +
      quickBtn(s, '7d', '7 hari terakhir') +
      quickBtn(s, 'month', 'Bulan ini') +
      '</div>'
    );
  }

  function backHTML(c, s) {
    return (
      '<div class="card-head"><div><button type="button" class="link-btn" data-action="pbBack">← Semua ' +
      c.partyPlural +
      '</button><div class="card-title">' +
      esc(partyName(c, s.partyId)) +
      '</div></div></div>'
    );
  }

  function createdHTML(c, s) {
    var inv = s.created ? find(c.invColl, s.created.id) : null;
    if (!inv) return '';
    var n = (inv.doIds || []).length;
    return (
      '<div class="notice notice-success" role="status"><div style="flex:1;min-width:0"><strong>' +
      (c === CFG.customer ? 'Faktur ' : 'Faktur pembelian ') +
      esc(inv.number || inv.id) +
      ' dibuat</strong> — ' +
      n +
      ' truk, periode ' +
      fmtDate(inv.periodFrom) +
      ' – ' +
      fmtDate(inv.periodTo) +
      ', total ' +
      money(inv.amount) +
      (inv.supplierRef ? ' · No. faktur supplier ' + esc(inv.supplierRef) : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' +
      '<button type="button" class="btn-ghost btn-sm" data-action="pbOpenInv" data-type="' +
      c.docType +
      '" data-id="' +
      esc(inv.id) +
      '">Buka faktur</button>' +
      '<button type="button" class="btn-ghost btn-sm" data-action="pbPrintInv" data-type="' +
      c.docType +
      '" data-id="' +
      esc(inv.id) +
      '">Cetak</button>' +
      '<button type="button" class="btn-ghost btn-sm" data-action="pbExportInv" data-type="' +
      c.docType +
      '" data-id="' +
      esc(inv.id) +
      '">Ekspor rekap Excel</button>' +
      '</div></div></div>'
    );
  }

  function alertBadge(d) {
    if (!hasAlert(d)) return '';
    var a = d.weightAlert;
    return (
      '<span class="badge badge-warning" title="Netto berubah dari ' +
      esc(qty(a.from)) +
      ' ke ' +
      esc(qty(a.to)) +
      '">Timbangan berubah</span>'
    );
  }

  function checkCell(s, d) {
    return (
      '<td><input type="checkbox" class="pb-check" data-trip="' +
      esc(d.id) +
      '"' +
      (s.excluded[d.id] ? '' : ' checked') +
      ' aria-label="Pilih ' +
      esc(d.sjNo || d.id) +
      '"></td>'
    );
  }

  // SJ, date and truck stay on one line; the table scrolls on narrow screens.
  function tripCells(d) {
    var nw = ' style="white-space:nowrap"';
    return (
      '<td class="doc-no"' +
      nw +
      '>' +
      esc(d.sjNo || d.number || d.id) +
      '</td><td' +
      nw +
      '>' +
      fmtDate(d.date) +
      '</td><td' +
      nw +
      '>' +
      esc(d.vehicle || '—') +
      '</td><td style="min-width:9rem">'
    );
  }

  function allCheck(s, trips) {
    var sel = selectedOf(s, trips).length;
    return (
      '<input type="checkbox" id="pb-all" aria-label="Pilih semua"' +
      (sel === trips.length ? ' checked' : '') +
      (sel > 0 && sel < trips.length ? ' data-partial="1"' : '') +
      '>'
    );
  }

  function noticesHTML(list) {
    return list
      .map(function (n) {
        return '<div class="notice notice-' + n[0] + '"><div>' + n[1] + '</div></div>';
      })
      .join('');
  }

  function olderNotice(c, s, notices) {
    var older = olderTrips(c, s);
    if (!older.length) return;
    var first = older[0].date;
    notices.push([
      'info',
      older.length +
        ' pengambilan belum ' +
        (c === CFG.customer ? 'ditagih' : 'difakturkan') +
        ' sebelum ' +
        fmtDate(s.from) +
        '. <button type="button" class="link-btn" data-action="pbFromOldest" data-val="' +
        esc(first) +
        '">Tampilkan sejak ' +
        fmtDate(first) +
        '</button>',
    ]);
  }

  function totalsHTML(trips, sel, pv) {
    var tons = r3(
      sum(sel, function (d) {
        return T().netOf(d);
      })
    );
    return (
      '<div class="inline-summary">' +
      '<div><span class="t-muted">Truk dipilih</span><strong>' +
      sel.length +
      ' dari ' +
      trips.length +
      '</strong></div>' +
      '<div><span class="t-muted">Tonase</span><strong>' +
      qty(tons) +
      '</strong></div>' +
      '<div><span class="t-muted">DPP</span><strong>' +
      (pv && !pv.error ? money(pv.dpp) : '—') +
      '</strong></div>' +
      '<div><span class="t-muted">PPN' +
      (pv && !pv.error && pv.rate
        ? ' ' + Math.round(pv.rate * 100) + '%' + (pv.incl ? ' (termasuk)' : '')
        : '') +
      '</span><strong>' +
      (pv && !pv.error ? money(pv.tax) : '—') +
      '</strong></div>' +
      '<div><span class="t-muted">Total</span><strong>' +
      (pv && !pv.error ? money(pv.total) : '—') +
      '</strong></div></div>'
    );
  }

  // ── Tagih Pelanggan ────────────────────────────────────────────────────────
  function customerHTML() {
    var c = CFG.customer;
    var s = S.customer;
    if (s.partyId == null) return header(c) + overviewHTML(c);
    return (
      header(c) +
      createdHTML(c, s) +
      '<div class="card" id="pb-form">' +
      backHTML(c, s) +
      periodHTML(s, ['Pengambilan dari', 'Sampai']) +
      '</div><div id="pb-main">' +
      customerMainHTML() +
      '</div>'
    );
  }

  function customerMainHTML() {
    var c = CFG.customer;
    var s = S.customer;
    var trips = periodTrips(c, s);
    var sel = selectedOf(s, trips);
    var notices = [];
    if (s.from && s.to && s.from > s.to) {
      notices.push(['warning', 'Tanggal awal setelah tanggal akhir.']);
    }
    olderNotice(c, s, notices);
    var alerts = sel.filter(hasAlert).length;
    if (alerts) {
      notices.push([
        'warning',
        alerts +
          ' truk punya perubahan timbangan yang belum diselesaikan. Periksa di Perubahan Timbangan sebelum menagih.',
      ]);
    }
    sharedPOs(sel, s.partyId).forEach(function (x) {
      notices.push([
        'warning',
        'PO supplier ' +
          esc(x.po) +
          ' juga diambil untuk ' +
          esc(x.names.join(', ')) +
          '. Pastikan hanya truk pelanggan ini yang ditagihkan.',
      ]);
    });
    var mixed = mixedTax(c, sel);
    if (mixed) {
      notices.push([
        'warning',
        'Pengambilan yang dipilih berasal dari PO pelanggan dengan PPN berbeda. Buat faktur terpisah per PO.',
      ]);
    }
    var ids = sel.map(function (d) {
      return d.id;
    });
    var pv = preview(c, ids, s.date);
    if (pv && pv.error) notices.push(['warning', esc(pv.error)]);

    var table;
    if (!trips.length) {
      table =
        '<div class="card"><div class="empty-inline">Tidak ada pengambilan belum ditagih pada periode ini.</div></div>';
    } else {
      var rows = trips
        .map(function (d) {
          var a = T().amounts(d);
          var it = itemOf(d);
          return (
            '<tr>' +
            checkCell(s, d) +
            tripCells(d) +
            esc(it.itemName || '') +
            '</td><td class="t-num">' +
            qty(a.net) +
            ' ' +
            esc(it.unit || '') +
            '</td><td class="t-num">' +
            money(a.salePrice) +
            '</td><td class="t-num">' +
            money(Math.round(a.net * a.salePrice)) +
            '</td><td>' +
            alertBadge(d) +
            '</td></tr>'
          );
        })
        .join('');
      table =
        '<div class="card"><div class="card-head"><div class="card-title">Pengambilan belum ditagih</div>' +
        '<div class="card-sub">' +
        fmtDate(s.from) +
        ' – ' +
        fmtDate(s.to) +
        '</div></div><div class="table-wrap"><table class="data-table compact"><thead><tr><th>' +
        allCheck(s, trips) +
        '</th><th>No. SJ</th><th>Tanggal</th><th>Truk</th><th>Barang</th><th class="t-num">Netto</th>' +
        '<th class="t-num">Harga</th><th class="t-num">Subtotal</th><th></th></tr></thead><tbody>' +
        rows +
        '</tbody></table></div></div>';
    }

    var canIssue = sel.length > 0 && !mixed && pv && !pv.error;
    var actions =
      '<div class="card">' +
      totalsHTML(trips, sel, pv) +
      '<div class="form-row"><div class="form-group"><label class="form-label" for="pb-inv-date">Tanggal faktur</label>' +
      '<input type="date" class="form-input" id="pb-inv-date" value="' +
      esc(s.date || todayISO()) +
      '"></div><div></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">' +
      '<button type="button" class="btn-ghost" data-action="pbExport"' +
      (sel.length ? '' : ' disabled') +
      '>Ekspor rekap Excel</button>' +
      '<button type="button" class="btn" data-action="pbIssue"' +
      (canIssue ? '' : ' disabled') +
      '>Buat Faktur</button></div></div>';
    return noticesHTML(notices) + table + actions;
  }

  // ── Tagihan Supplier ───────────────────────────────────────────────────────
  function supplierHTML() {
    var c = CFG.supplier;
    var s = S.supplier;
    if (s.partyId == null) return header(c) + overviewHTML(c);
    return (
      header(c) +
      createdHTML(c, s) +
      '<div class="card" id="pb-form">' +
      backHTML(c, s) +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="pb-ref">No. faktur supplier</label>' +
      '<input type="text" class="form-input" id="pb-ref" autocomplete="off" value="' +
      esc(s.ref) +
      '"></div><div class="form-group"><label class="form-label" for="pb-date">Tanggal faktur</label>' +
      '<input type="date" class="form-input" id="pb-date" value="' +
      esc(s.date || todayISO()) +
      '"></div></div>' +
      periodHTML(s, ['Periode tagihan dari', 'Sampai']) +
      '<div class="form-row" style="margin-top:14px">' +
      '<div class="form-group"><label class="form-label" for="pb-qty">Tonase ditagih</label>' +
      '<input type="number" class="form-input" id="pb-qty" min="0" step="0.001" inputmode="decimal" value="' +
      esc(s.qty) +
      '"></div><div class="form-group"><label class="form-label" for="pb-price">Harga per ton</label>' +
      '<input type="number" class="form-input" id="pb-price" min="0" step="any" inputmode="decimal" value="' +
      esc(s.price) +
      '"></div></div>' +
      '<div class="form-group"><label class="form-label" for="pb-price-note">Catatan harga</label>' +
      '<input type="text" class="form-input" id="pb-price-note" autocomplete="off" value="' +
      esc(s.priceNote) +
      '"><div class="form-hint">Bila tagihan memakai lebih dari satu harga, tulis rinciannya di sini.</div></div>' +
      '</div><div id="pb-main">' +
      supplierMainHTML() +
      '</div>'
    );
  }

  function supplierMainHTML() {
    var c = CFG.supplier;
    var s = S.supplier;
    var bq = String(s.qty).trim() === '' ? null : r3(s.qty);
    var bp = billedPrice(s);
    var cmp =
      s.from && s.to && s.from > s.to
        ? { trips: [], ourPrices: [] }
        : T().compareSupplierBill({
            supplierId: s.partyId,
            qty: bq || 0,
            price: bp,
            from: s.from,
            to: s.to,
          });
    var trips = cmp.trips;
    var sel = selectedOf(s, trips);
    var ourQty = r3(
      sum(sel, function (d) {
        return T().netOf(d);
      })
    );
    var diff = bq == null ? 0 : r3(bq - ourQty);
    var hasDiff = bq != null && Math.abs(diff) > EPS;
    var priceOff = sel.filter(function (d) {
      return priceDiffers(d, bp);
    });
    var stale = sel.filter(function (d) {
      return !!newerSupplierPrice(d);
    });
    var ourPrices = {};
    sel.forEach(function (d) {
      ourPrices[String(T().amounts(d).purchasePrice)] = true;
    });

    var notices = [];
    if (s.from && s.to && s.from > s.to)
      notices.push(['warning', 'Tanggal awal setelah tanggal akhir.']);
    olderNotice(c, s, notices);
    if (bq == null) {
      notices.push([
        'info',
        'Isi tonase dan harga dari faktur supplier untuk mencocokkan dengan pengambilan kita.',
      ]);
    } else if (hasDiff) {
      notices.push([
        'warning',
        'Tonase berbeda: supplier menagih ' +
          qty(bq) +
          ' ton, pengambilan kita ' +
          qty(ourQty) +
          ' ton (selisih ' +
          signedQty(diff) +
          ' ton). Periksa truk yang ditagih dan perubahan timbangan.',
      ]);
    }
    if (priceOff.length) {
      notices.push([
        'warning',
        priceOff.length +
          ' truk memakai harga beli yang berbeda dari harga di tagihan (' +
          money(bp) +
          '). Perbaiki harganya di bawah bila tagihan supplier yang benar.',
      ]);
    }
    if (stale.length) {
      notices.push([
        'info',
        stale.length +
          ' truk belum memakai Harga Supplier yang berlaku pada tanggal pengambilannya.',
      ]);
    }
    var alerts = sel.filter(hasAlert).length;
    if (alerts) {
      notices.push([
        'warning',
        alerts + ' truk punya perubahan timbangan yang belum diselesaikan.',
      ]);
    }
    var mixed = mixedTax(c, sel);
    if (mixed) {
      notices.push([
        'warning',
        'Pengambilan yang dipilih berasal dari PO supplier dengan PPN berbeda. Catat faktur terpisah per PO.',
      ]);
    }
    var ids = sel.map(function (d) {
      return d.id;
    });
    var pv = preview(c, ids, s.date);
    if (pv && pv.error) notices.push(['warning', esc(pv.error)]);

    var compare =
      '<div class="inline-summary">' +
      '<div><span class="t-muted">Tonase ditagih</span><strong>' +
      (bq == null ? '—' : qty(bq)) +
      '</strong></div>' +
      '<div><span class="t-muted">Tonase pengambilan (' +
      sel.length +
      ' truk)</span><strong>' +
      qty(ourQty) +
      '</strong></div>' +
      '<div><span class="t-muted">Selisih</span><strong' +
      (hasDiff ? ' style="color:var(--danger)"' : '') +
      '>' +
      (bq == null ? '—' : signedQty(diff)) +
      '</strong></div>' +
      '<div><span class="t-muted">Harga beli kita</span><strong>' +
      (Object.keys(ourPrices).length
        ? Object.keys(ourPrices)
            .map(function (p) {
              return money(Number(p));
            })
            .join(', ')
        : '—') +
      '</strong></div>' +
      '<div><span class="t-muted">Harga ditagih</span><strong' +
      (priceOff.length ? ' style="color:var(--danger)"' : '') +
      '>' +
      (bp == null ? '—' : money(bp)) +
      '</strong></div></div>';

    var table;
    if (!trips.length) {
      table =
        '<div class="card"><div class="empty-inline">Tidak ada pengambilan dari supplier ini yang belum difakturkan pada periode ini.</div></div>';
    } else {
      var rows = trips
        .map(function (d) {
          var a = T().amounts(d);
          var it = itemOf(d);
          var sp = newerSupplierPrice(d);
          var off = priceDiffers(d, bp);
          var hist =
            Array.isArray(d.priceHistory) && d.priceHistory.length
              ? d.priceHistory[d.priceHistory.length - 1]
              : null;
          var flags =
            (off ? '<span class="badge badge-warning">Harga beda</span> ' : '') +
            (sp
              ? '<span class="badge badge-info">Harga Supplier ' +
                fmtDate(sp.effectiveDate) +
                ': ' +
                money(sp.price) +
                '</span> '
              : '') +
            (hist
              ? '<span class="badge badge-gray" title="' +
                esc(
                  money(hist.from) + ' → ' + money(hist.to) + (hist.note ? ' · ' + hist.note : '')
                ) +
                '">Harga dikoreksi</span> '
              : '') +
            alertBadge(d);
          return (
            '<tr>' +
            checkCell(s, d) +
            tripCells(d) +
            esc(it.itemName || '') +
            '</td><td class="t-num">' +
            qty(a.net) +
            ' ' +
            esc(it.unit || '') +
            '</td><td class="t-num' +
            (off ? ' t-danger' : '') +
            '">' +
            money(a.purchasePrice) +
            '</td><td class="t-num">' +
            money(Math.round(a.net * a.purchasePrice)) +
            '</td><td>' +
            flags +
            '</td></tr>'
          );
        })
        .join('');
      table =
        '<div class="card"><div class="card-head"><div class="card-title">Pengambilan kita yang belum difakturkan supplier</div>' +
        '<div class="card-sub">' +
        fmtDate(s.from) +
        ' – ' +
        fmtDate(s.to) +
        '</div></div><div class="table-wrap"><table class="data-table compact"><thead><tr><th>' +
        allCheck(s, trips) +
        '</th><th>No. SJ</th><th>Tanggal</th><th>Truk</th><th>Barang</th><th class="t-num">Netto</th>' +
        '<th class="t-num">Harga beli</th><th class="t-num">Subtotal</th><th>Keterangan</th></tr></thead><tbody>' +
        rows +
        '</tbody></table></div></div>';
    }

    var newPrice = String(s.newPrice).trim() !== '' ? s.newPrice : bp != null ? String(bp) : '';
    var correct = trips.length
      ? '<div class="card"><div class="card-head"><div><div class="card-title">Perbaiki harga beli</div>' +
        '<div class="card-sub">Berlaku untuk truk yang dipilih; riwayat perubahan disimpan di tiap pengambilan.</div></div></div>' +
        '<div class="form-row"><div class="form-group"><label class="form-label" for="pb-new-price">Harga baru per ton</label>' +
        '<input type="number" class="form-input" id="pb-new-price" min="0" step="any" inputmode="decimal" value="' +
        esc(newPrice) +
        '"></div><div class="form-group"><label class="form-label" for="pb-new-note">Keterangan</label>' +
        '<input type="text" class="form-input" id="pb-new-note" autocomplete="off" placeholder="Mis. kabar harga baru dari supplier" value="' +
        esc(s.newNote) +
        '"></div></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
        '<button type="button" class="btn-ghost" data-action="pbApplyPrice"' +
        (sel.length ? '' : ' disabled') +
        '>Terapkan ke ' +
        sel.length +
        ' truk dipilih</button>' +
        (stale.length
          ? '<button type="button" class="btn-ghost" data-action="pbUseSupplierPrice">Pakai Harga Supplier untuk ' +
            stale.length +
            ' truk</button>'
          : '') +
        '<button type="button" class="link-btn" data-action="pbSupplierPrice">Simpan harga baru di Harga Supplier</button>' +
        '</div><div class="form-hint">Harga Supplier dipakai otomatis untuk pengambilan berikutnya mulai tanggal berlakunya.</div></div>'
      : '';

    var canSave = sel.length > 0 && !mixed && pv && !pv.error;
    var save =
      '<div class="card"><div class="card-head"><div class="card-title">Faktur pembelian</div>' +
      '<div class="card-sub">Dicatat dengan harga beli kita per truk</div></div>' +
      totalsHTML(trips, sel, pv) +
      (hasDiff
        ? '<div class="form-group"><label class="form-label" for="pb-reason">Alasan selisih tonase (wajib)</label>' +
          '<input type="text" class="form-input" id="pb-reason" autocomplete="off" value="' +
          esc(s.reason) +
          '"></div>'
        : '') +
      '<div style="display:flex;justify-content:flex-end"><button type="button" class="btn" data-action="pbIssue"' +
      (canSave ? '' : ' disabled') +
      '>Simpan Faktur Pembelian</button></div></div>';

    return compare + noticesHTML(notices) + table + correct + save;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  function container() {
    return document.getElementById('view-pickups');
  }

  // #view-pickups is shared with pickup-view.js: while a billing page is open,
  // renderPickups() (any re-render of the view, e.g. after a refused save) asks
  // this file for its page instead of showing a pickup screen.
  var active = false;

  function pageHTML() {
    var body;
    if (!T()) {
      body =
        header(cfg()) +
        '<div class="card"><div class="empty-inline">Modul pengambilan belum dimuat.</div></div>';
    } else {
      body = S.page === 'customer' ? customerHTML() : supplierHTML();
    }
    return '<div id="pb-root" data-page="' + S.page + '">' + body + '</div>';
  }

  function render() {
    var el = container();
    if (!el) return;
    el.innerHTML = pageHTML();
    syncPartial();
  }

  function renderMain() {
    var m = document.getElementById('pb-main');
    if (!m || !T()) {
      render();
      return;
    }
    m.innerHTML = S.page === 'customer' ? customerMainHTML() : supplierMainHTML();
    var q = document.getElementById('pb-quick');
    if (q) {
      var s = st();
      Array.prototype.forEach.call(q.querySelectorAll('[data-val]'), function (b) {
        var r = quickRange(b.getAttribute('data-val'));
        b.classList.toggle('active', s.from === r.from && s.to === r.to);
      });
    }
    syncPartial();
  }

  // "Pilih semua" shows the mixed state when only some trips are ticked.
  function syncPartial() {
    var all = document.getElementById('pb-all');
    if (all) all.indeterminate = all.getAttribute('data-partial') === '1';
  }

  function open(page) {
    active = true;
    S.page = page;
    // Opening from the menu starts at the overview.
    S[page] = freshState();
    if (typeof window.invalidateView === 'function') window.invalidateView('pickups');
    if (typeof window.navigate === 'function') window.navigate('pickups');
    render();
  }

  function selectParty(id) {
    var c = cfg();
    var s = freshState();
    s.partyId = String(id);
    var p = defaultPeriod(c, s.partyId);
    s.from = p.from;
    s.to = p.to;
    s.date = todayISO();
    S[S.page] = s;
    render();
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function currentTrips() {
    return periodTrips(cfg(), st());
  }
  function selectedIds() {
    return selectedOf(st(), currentTrips()).map(function (d) {
      return d.id;
    });
  }

  function issueSales() {
    var c = CFG.customer;
    var s = S.customer;
    var sel = selectedOf(s, periodTrips(c, s));
    if (!sel.length) {
      toast('Pilih minimal satu pengambilan.', 'warning');
      return;
    }
    if (mixedTax(c, sel)) {
      toast('Pengambilan dari PO dengan PPN berbeda tidak bisa digabung.', 'warning');
      return;
    }
    var r = T().createInvoice(
      'sales',
      sel.map(function (d) {
        return d.id;
      }),
      { date: s.date || todayISO() }
    );
    if (r.error) {
      toast(r.error, 'danger');
      return;
    }
    var inv = r.invoice;
    persist();
    if (!find(c.invColl, inv.id)) {
      // The save was refused (access rights, closed period) and rolled back.
      render();
      return;
    }
    s.created = { type: 'SI', id: inv.id };
    s.excluded = {};
    toast(
      'Faktur ' + (inv.number || inv.id) + ' dibuat untuk ' + inv.doIds.length + ' truk',
      'success'
    );
    render();
  }

  function issuePurchase() {
    var c = CFG.supplier;
    var s = S.supplier;
    var sel = selectedOf(s, periodTrips(c, s));
    if (!sel.length) {
      toast('Pilih minimal satu pengambilan.', 'warning');
      return;
    }
    var ref = String(s.ref || '').trim();
    if (!ref) {
      toast('Isi No. faktur supplier.', 'warning');
      focus('pb-ref');
      return;
    }
    var dup = (db()[c.invColl] || []).find(function (inv) {
      return (
        activeInvoice(inv) &&
        same(inv.supplierId, s.partyId) &&
        String(inv.supplierRef || '')
          .trim()
          .toLowerCase() === ref.toLowerCase()
      );
    });
    if (dup) {
      toast(
        'No. faktur supplier ' + ref + ' sudah dicatat di ' + (dup.number || dup.id) + '.',
        'danger'
      );
      return;
    }
    var bq = String(s.qty).trim() === '' ? null : r3(s.qty);
    if (!(bq > 0)) {
      toast('Isi tonase yang ditagih supplier.', 'warning');
      focus('pb-qty');
      return;
    }
    if (mixedTax(c, sel)) {
      toast('Pengambilan dari PO dengan PPN berbeda tidak bisa digabung.', 'warning');
      return;
    }
    var bp = billedPrice(s);
    var ourQty = r3(
      sum(sel, function (d) {
        return T().netOf(d);
      })
    );
    var diff = r3(bq - ourQty);
    var hasDiff = Math.abs(diff) > EPS;
    var reason = String(s.reason || '').trim();
    if (hasDiff && !reason) {
      toast('Tulis alasan selisih tonase sebelum menyimpan.', 'warning');
      focus('pb-reason');
      return;
    }
    var priceOff = sel.filter(function (d) {
      return priceDiffers(d, bp);
    }).length;
    if (hasDiff || priceOff) {
      var msg = 'Simpan faktur pembelian ' + ref + '?\n';
      if (hasDiff) {
        msg +=
          '\nTonase ditagih ' +
          qty(bq) +
          ' ton, pengambilan kita ' +
          qty(ourQty) +
          ' ton (selisih ' +
          signedQty(diff) +
          ' ton).\nAlasan: ' +
          reason;
      }
      if (priceOff) {
        msg +=
          '\n' +
          priceOff +
          ' truk memakai harga beli yang berbeda dari harga di tagihan; faktur dicatat dengan harga kita.';
      }
      if (!window.confirm(msg)) return;
    }
    var r = T().createInvoice(
      'purchases',
      sel.map(function (d) {
        return d.id;
      }),
      { date: s.date || todayISO(), supplierRef: ref }
    );
    if (r.error) {
      toast(r.error, 'danger');
      return;
    }
    var inv = r.invoice;
    if (!inv.supplierRef) inv.supplierRef = ref;
    var priceNote = String(s.priceNote || '').trim();
    inv.supplierBill = {
      qty: bq,
      price: bp,
      priceNote: priceNote,
      ourQty: ourQty,
      qtyDiff: diff,
      reason: hasDiff ? reason : '',
    };
    var notes = [inv.note || ''];
    if (hasDiff) {
      notes.push(
        'Selisih tonase: ditagih ' +
          qty(bq) +
          ' ton, pengambilan ' +
          qty(ourQty) +
          ' ton (' +
          signedQty(diff) +
          ' ton). Alasan: ' +
          reason
      );
    }
    if (priceNote) notes.push('Harga di tagihan: ' + priceNote);
    inv.note = notes.filter(Boolean).join('\n');
    persist();
    if (!find(c.invColl, inv.id)) {
      render();
      return;
    }
    var keep = { partyId: s.partyId, from: s.from, to: s.to };
    S.supplier = Object.assign(freshState(), keep, {
      date: todayISO(),
      created: { type: 'PI', id: inv.id },
    });
    toast(
      'Faktur pembelian ' + (inv.number || inv.id) + ' disimpan (' + inv.doIds.length + ' truk)',
      'success'
    );
    render();
  }

  function focus(id) {
    var el = document.getElementById(id);
    if (el && typeof el.focus === 'function') el.focus();
  }

  // Changes a trip's purchase price and keeps the old one in its history.
  function setPrice(d, to, note, source) {
    if (T().coveringInvoice('purchases', d.id)) return false;
    var from = T().amounts(d).purchasePrice;
    if (Math.abs(from - to) < 0.005) return false;
    d.priceHistory = Array.isArray(d.priceHistory) ? d.priceHistory : [];
    d.priceHistory.push({
      at: new Date().toISOString(),
      by: currentUser(),
      from: from,
      to: to,
      note: note || '',
    });
    d.purchasePrice = to;
    d.purchasePriceSource = source;
    return true;
  }

  function savePrices(changed) {
    if (!changed.length) {
      toast('Harga truk yang dipilih sudah sama.', 'info');
      return;
    }
    persist();
    var kept = changed.filter(function (c) {
      var d = find('deliveryOrders', c.id);
      return d && Math.abs(num(d.purchasePrice) - c.to) < 0.005;
    });
    if (kept.length) toast('Harga beli ' + kept.length + ' truk diperbarui', 'success');
    renderMain();
  }

  function applyPrice() {
    var s = S.supplier;
    var raw = String(s.newPrice).trim() !== '' ? s.newPrice : s.price;
    var price = num(raw);
    if (!(price > 0)) {
      toast('Isi harga baru per ton.', 'warning');
      focus('pb-new-price');
      return;
    }
    var trips = selectedOf(s, currentTrips());
    if (!trips.length) {
      toast('Pilih minimal satu pengambilan.', 'warning');
      return;
    }
    if (
      !window.confirm(
        'Ubah harga beli ' +
          trips.length +
          ' truk menjadi ' +
          money(price) +
          ' per ton?\nHarga lama disimpan di riwayat tiap pengambilan.'
      )
    ) {
      return;
    }
    var note =
      String(s.newNote || '').trim() ||
      (String(s.ref || '').trim()
        ? 'Faktur supplier ' + String(s.ref).trim()
        : 'Koreksi harga beli');
    var changed = [];
    trips.forEach(function (d) {
      if (setPrice(d, price, note, 'manual')) changed.push({ id: d.id, to: price });
    });
    s.newNote = '';
    savePrices(changed);
  }

  function useSupplierPrice() {
    var s = S.supplier;
    var changed = [];
    selectedOf(s, currentTrips()).forEach(function (d) {
      var p = newerSupplierPrice(d);
      if (p && setPrice(d, p.price, 'Harga Supplier per ' + p.effectiveDate, 'supplierPrice')) {
        changed.push({ id: d.id, to: p.price });
      }
    });
    savePrices(changed);
  }

  function invoiceTrips(type, id) {
    var inv = find(type === 'SI' ? 'salesInvoices' : 'purchaseInvoices', id);
    if (!inv) return { inv: null, trips: [] };
    return {
      inv: inv,
      trips: (inv.doIds || [])
        .map(function (x) {
          return find('deliveryOrders', x);
        })
        .filter(Boolean),
    };
  }

  function download(trips, name, from, to) {
    if (!window.NSAXlsx || typeof window.NSAXlsx.download !== 'function') {
      toast('Fitur ekspor Excel belum siap.', 'warning');
      return;
    }
    if (!trips.length) {
      toast('Tidak ada pengambilan untuk diekspor.', 'warning');
      return;
    }
    var file = ('Rekap pengambilan ' + name + ' ' + from + ' sd ' + to)
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    window.NSAXlsx.download(file + '.xlsx', [T().tripRecapSheet(trips)]);
  }

  function exportSelected() {
    var c = cfg();
    var s = st();
    var trips = selectedOf(s, currentTrips());
    download(trips, partyName(c, s.partyId), s.from, s.to);
  }

  function exportInvoice(type, id) {
    var x = invoiceTrips(type, id);
    if (!x.inv) return;
    var c = type === 'SI' ? CFG.customer : CFG.supplier;
    download(
      x.trips,
      (x.inv.number || x.inv.id) + ' ' + partyName(c, x.inv[c.partyId], x.inv[c.party]),
      x.inv.periodFrom || '',
      x.inv.periodTo || ''
    );
  }

  // The invoice in its own screen (invoice-view.js, a lazily loaded chunk).
  function openInvoice(type, id) {
    function go() {
      var ext = window._invoiceExtras;
      if (ext) {
        if (type === 'SI') ext.openSalesInvoice();
        else ext.openPurchaseInvoice();
      }
      if (typeof window.viewInvoiceDoc === 'function') window.viewInvoiceDoc(type, id);
    }
    if (window._invoiceExtras || typeof window.ensureView !== 'function') {
      go();
      return;
    }
    window
      .ensureView('invoices')
      .then(go)
      .catch(function () {
        toast('Gagal memuat modul faktur. Periksa koneksi lalu coba lagi.', 'danger');
      });
  }

  function printInvoice(type, id) {
    var inv = find(type === 'SI' ? 'salesInvoices' : 'purchaseInvoices', id);
    if (!inv) return;
    if (typeof window.printDocument === 'function') window.printDocument(type, inv);
    else toast('Fungsi cetak belum siap', 'warning');
  }

  var ACTIONS = {
    pbParty: function (btn) {
      selectParty(btn.getAttribute('data-id'));
    },
    pbBack: function () {
      S[S.page] = freshState();
      render();
    },
    pbQuick: function (btn) {
      var r = quickRange(btn.getAttribute('data-val'));
      st().from = r.from;
      st().to = r.to;
      render();
    },
    pbFromOldest: function (btn) {
      st().from = btn.getAttribute('data-val') || st().from;
      render();
    },
    pbIssue: function () {
      if (S.page === 'customer') issueSales();
      else issuePurchase();
    },
    pbExport: exportSelected,
    pbExportInv: function (btn) {
      exportInvoice(btn.getAttribute('data-type'), btn.getAttribute('data-id'));
    },
    pbOpenInv: function (btn) {
      openInvoice(btn.getAttribute('data-type'), btn.getAttribute('data-id'));
    },
    pbPrintInv: function (btn) {
      printInvoice(btn.getAttribute('data-type'), btn.getAttribute('data-id'));
    },
    pbApplyPrice: applyPrice,
    pbUseSupplierPrice: useSupplierPrice,
    pbSupplierPrice: function () {
      var x = window._salesPurchaseExtras;
      if (x && typeof x.openSupplierPrice === 'function') x.openSupplierPrice();
      else toast('Halaman Harga Supplier belum siap.', 'warning');
    },
  };

  // Text fields → state. Typing tonnage or price refreshes the comparison.
  var FIELDS = {
    'pb-ref': 'ref',
    'pb-date': 'date',
    'pb-inv-date': 'date',
    'pb-qty': 'qty',
    'pb-price': 'price',
    'pb-price-note': 'priceNote',
    'pb-reason': 'reason',
    'pb-new-price': 'newPrice',
    'pb-new-note': 'newNote',
  };
  var LIVE = { 'pb-qty': true, 'pb-price': true };

  function inRoot(el) {
    var root = document.getElementById('pb-root');
    return !!(root && el && root.contains(el));
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn || !inRoot(btn)) return;
    var fn = ACTIONS[btn.getAttribute('data-action')];
    if (!fn || btn.disabled) return;
    e.preventDefault();
    fn(btn);
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!inRoot(t) || !FIELDS[t.id]) return;
    st()[FIELDS[t.id]] = t.value;
    if (LIVE[t.id]) renderMain();
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!inRoot(t)) return;
    var s = st();
    if (t.id === 'pb-from' || t.id === 'pb-to') {
      s[t.id === 'pb-from' ? 'from' : 'to'] = t.value;
      renderMain();
    } else if (t.id === 'pb-all') {
      var trips = currentTrips();
      trips.forEach(function (d) {
        if (t.checked) delete s.excluded[d.id];
        else s.excluded[d.id] = true;
      });
      renderMain();
    } else if (t.classList && t.classList.contains('pb-check')) {
      var id = t.getAttribute('data-trip');
      if (t.checked) delete s.excluded[id];
      else s.excluded[id] = true;
      renderMain();
    } else if (FIELDS[t.id]) {
      s[FIELDS[t.id]] = t.value;
      if (LIVE[t.id]) renderMain();
    }
  });

  window._pickupBilling = {
    openCustomerBilling: function () {
      open('customer');
    },
    openSupplierBilling: function () {
      open('supplier');
    },
    isActive: function () {
      return active;
    },
    html: pageHTML,
    afterRender: syncPartial,
    leave: function () {
      active = false;
    },
  };
})();
