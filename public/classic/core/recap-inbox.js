// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Kotak Masuk Rekap (simulation)  (recap-inbox.js)
//
// How the pickup flow works once the weighbridge recap arrives by e-mail, shaped
// on the supplier's real mail: subject "Rekap & SJ <code>-<site> <dates>",
// photos of its printed DOs mixed with photos of our surat jalan, and its recap
// Excel (one sheet per material, two-row header, Isi/Kosong/Qty in tons). The
// system reads the Excel, reads each DO photo (computer vision: Nomor DO, BAP,
// date, truck, Berat Isi / Kosong / Qty, Sales Order No = our PO) and checks
// three sources against each other per DO number — the photo, the Excel and
// what is recorded in the app — before anything is recorded. Matching trips are
// recorded in one step; differences are held for a decision and can be sent
// back to the supplier. SJ photos are kept as attachments, not read: the DO is
// the evidence (meeting 14 Sep 2026).
//
// SIMULATION: there is no mailbox and no vision service. "Periksa email" builds
// an e-mail from the pickup POs in the app: a real .xlsx (SheetJS) that goes
// through the same reader as Impor Rekap Timbangan (Trading.recapRowsFromWorkbook),
// and DO / SJ photos drawn on a canvas to look like phone photos of the real
// forms, whose "reading" is generated with them. Each truck finds its surat
// jalan through Trading.matchRecap (No PO, then No DO) and is recorded through
// Trading.applyRecap like a manual import, so trips, weight history, alerts
// (Perubahan Timbangan) and journals are real.
// The inbox itself is kept in this browser only (localStorage), never in DB.
// Real mailbox + vision service: docs/13-SIMULASI-EMAIL-DAN-CV.md.
//
// Renders into #view-pickups (shared with pickup-view.js / pickup-billing.js);
// buttons use data-action names starting with "ri", handled by a delegated
// listener scoped to #ri-root and the dialogs it opens. The one write action is
// saveRecapEmail (rbac.js click guard: "save…" = create).
//
// Global-scope rule: classic <script>, IIFE-wrapped; exposes only
// window._recapInbox.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // v2: e-mails keyed by DO number (v1 keyed photos by a handwritten SJ number).
  var STORE_KEY = 'nsa.recapInbox.v2';
  var TOL = 0.005; // ton: weights are read to 10 kg
  var LOW_CONF = 0.8;
  var STEP_MS = 420;
  var DRIVERS = [
    'Asep',
    'Dedi',
    'Joko',
    'Rahmat',
    'Slamet',
    'Ujang',
    'Wawan',
    'Yanto',
    'Agus',
    'Hendra',
    'Iwan',
    'Sutrisno',
  ];
  var PLATE_AREAS = ['B', 'D', 'F', 'T', 'E', 'Z', 'A'];
  var PLATE_TAIL = ['KYU', 'AB', 'TRK', 'UD', 'XN', 'BQ', 'CD', 'LP', 'NS', 'RV'];

  var S = { active: false, emails: [], openId: null, checkedAt: '', seq: 0, sjBook: 0, doBase: 0 };
  var photos = {}; // photo id → { url, boxes } (drawn on demand, not stored)
  var excelCache = {}; // email id → recap rows read from its .xlsx
  var proc = {}; // email id → processing step shown (0…4) while "reading"

  // ── Small helpers ───────────────────────────────────────────────────────────
  function T() {
    return window.Trading;
  }
  function db() {
    return window.DB || {};
  }
  function esc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function same(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function r2(v) {
    return Math.round(num(v) * 100) / 100;
  }
  function eq(a, b) {
    return a != null && b != null && Math.abs(num(a) - num(b)) < TOL;
  }
  function find(coll, id) {
    return (
      (db()[coll] || []).find(function (d) {
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
  function addDays(iso, n) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  }
  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d)) return '';
    var t = pad2(d.getHours()) + '.' + pad2(d.getMinutes());
    return isoOf(d) === todayISO() ? t : fmtDate(isoOf(d)) + ' ' + t;
  }
  function fmtT(n) {
    if (n == null || n === '') return '—';
    return num(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }
  function fmtKg(t) {
    return Math.round(num(t) * 1000).toLocaleString('id-ID') + ' kg';
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  }
  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }
  function companyName() {
    var c = (db().settings && db().settings.company) || {};
    return String(c.name || '').trim() || 'Perusahaan';
  }
  function inboxAddress() {
    var c = (db().settings && db().settings.company) || {};
    var mail = String(c.email || '').trim();
    var at = mail.indexOf('@');
    return 'rekap.timbangan@' + (at > 0 ? mail.slice(at + 1) : 'perusahaan.co.id');
  }
  function poNo(po) {
    return (po && (po.number || po.id)) || '';
  }
  function lineOf(o) {
    return (o && (o.lines || o.items || [])[0]) || {};
  }
  function supplierOf(po) {
    var s = po ? find('suppliers', po.supplierId) : null;
    var name = (s && s.name) || po.supplier || po.supplierName || 'Supplier';
    return {
      name: name,
      // The weighbridge admin writes from a personal mailbox.
      email: (s && s.email) || 'admin.timbangan.' + initials(name).toLowerCase() + '@gmail.com',
    };
  }
  // "PT Batu Alam Sejahtera" → "BAS" (legal forms left out).
  function initials(name) {
    return (
      String(name || '')
        .replace(/^(pt|cv|ud|tb|pd)\.?\s+/i, '')
        .split(/[^A-Za-z]+/)
        .filter(Boolean)
        .map(function (w) {
          return w[0].toUpperCase();
        })
        .join('')
        .slice(0, 4) || 'X'
    );
  }
  // How the supplier names us in its subject and files ("Rekap & SJ NSA-…").
  function companyCode() {
    var c = (db().settings && db().settings.company) || {};
    return String(c.code || '').trim() || initials(companyName()).slice(0, 3);
  }
  // The customer's site: "PT Beton Cipta Mandiri - Cikande" → "Cikande", else the
  // first word of its address.
  function siteOf(slot) {
    var name = String((slot && slot.customer) || '');
    var dash = name.split(/\s+-\s+/);
    if (dash.length > 1) return dash[dash.length - 1].trim();
    var cust = slot && slot.customerId ? find('customers', slot.customerId) : null;
    var addr = String((cust && cust.address) || (slot && slot.destination) || '').trim();
    return addr ? addr.split(/[\s,]+/)[0] : '';
  }
  // "Keterangan" in the recap: the customer's own word plus the site,
  // e.g. "BETON CIKANDE".
  function keteranganOf(slot) {
    var name = String((slot && slot.customer) || '').split(/\s+-\s+/)[0];
    var word =
      name
        .replace(/^(pt|cv|ud|tb|pd)\.?\s+/i, '')
        .split(/\s+/)
        .filter(Boolean)[0] || '';
    return [word, siteOf(slot)].filter(Boolean).join(' ').toUpperCase();
  }
  // Plates as the weighbridge writes them: "B 9198 PYX" → "B9198PYX".
  function plain(plate) {
    return String(plate || '')
      .replace(/\s+/g, '')
      .toUpperCase();
  }
  // What the recap puts in "No PO": with the company's PO format (Pengaturan
  // Umum → Nomor Dokumen) only its running number, 69 for PO-069/…/2026, as the
  // real recap does; otherwise the whole number, which repeats its running
  // number every month.
  function poSeqOf(number) {
    var fmt = db().settings && db().settings.numberFormats && db().settings.numberFormats.PO;
    var DE = window.DocEngine;
    var seq = fmt && fmt.pattern && DE && DE.sequenceOf ? DE.sequenceOf('PO', number) : null;
    return seq != null ? seq : number;
  }

  // Seeded random numbers, so an e-mail (and its photos) look the same after a
  // reload — only its seed and figures are stored.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, list) {
    return list[Math.floor(rand() * list.length) % list.length];
  }

  // ── Stored inbox (this browser only) ───────────────────────────────────────
  function load() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.emails)) {
        S.emails = data.emails;
        S.checkedAt = data.checkedAt || '';
        S.seq = data.seq || data.emails.length;
        S.sjBook = data.sjBook || 0;
        S.doBase = data.doBase || 0;
      }
    } catch (_) {
      /* a broken or blocked store starts empty */
    }
  }
  function persist() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(
          STORE_KEY,
          JSON.stringify({
            emails: S.emails,
            checkedAt: S.checkedAt,
            seq: S.seq,
            sjBook: S.sjBook,
            doBase: S.doBase,
          })
        );
      }
    } catch (_) {
      /* storage full or blocked: the inbox lives on in memory */
    }
  }
  function emailById(id) {
    return (
      S.emails.find(function (e) {
        return same(e.id, id);
      }) || null
    );
  }

  // ── Pickup data the simulation draws from ───────────────────────────────────
  function slotsOf(po) {
    return T().slotsFor(po.id) || [];
  }
  function pendingOf(po) {
    return slotsOf(po).filter(function (d) {
      return d.status === 'Pending';
    });
  }
  function tripsOf(po) {
    return slotsOf(po).filter(T().isTrip);
  }
  function invoicedTrip(d) {
    return !!(T().coveringInvoice('sales', d.id) || T().coveringInvoice('purchases', d.id));
  }
  function openPOs() {
    return (db().purchaseOrders || []).filter(function (po) {
      return (
        T().isPickupOrder(po) &&
        po.status !== 'Closed' &&
        po.status !== 'Cancelled' &&
        pendingOf(po).length > 0
      );
    });
  }
  // ── Building a simulated e-mail ─────────────────────────────────────────────
  function plateFor(rand) {
    return (
      pick(rand, PLATE_AREAS) +
      ' ' +
      (1000 + Math.floor(rand() * 8999)) +
      ' ' +
      pick(rand, PLATE_TAIL)
    );
  }
  function clock(rand) {
    var mins = 6 * 60 + 20 + Math.floor(rand() * 8 * 60);
    var out = mins + 25 + Math.floor(rand() * 30);
    return {
      in: pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60),
      out: pad2(Math.floor(out / 60)) + ':' + pad2(out % 60),
    };
  }
  function weights(rand, net) {
    var tare = r2(11.2 + rand() * 2.4);
    return { gross: r2(tare + net), tare: tare, net: r2(net) };
  }
  function confidence(rand) {
    var c = {};
    ['doNo', 'ticketNo', 'poNumber', 'date', 'vehicle', 'gross', 'tare', 'net'].forEach(function (f) {
      c[f] = Math.round((0.93 + rand() * 0.065) * 100) / 100;
    });
    return c;
  }

  // A trip as the supplier's DO prints it. sjNo is the app's surat jalan the
  // trip belongs to (the truth the simulation knows); the DO does not carry it.
  // doNo / ticketNo (BAP) / sjBook (our SJ book number) are numbered in date
  // order once the e-mail's trips are known (numberTrips).
  function newTrip(rand, po, slot, date, net) {
    var w = weights(rand, net);
    var t = clock(rand);
    return {
      sjNo: slot.sjNo,
      poNumber: slot.poNumber || poNo(po),
      date: date,
      vehicle: plain(plateFor(rand)),
      driver: pick(rand, DRIVERS).toUpperCase(),
      itemName: slot.lines && slot.lines[0] ? slot.lines[0].itemName : lineOf(po).itemName,
      customer: slot.customer || '',
      keterangan: keteranganOf(slot),
      gross: w.gross,
      tare: w.tare,
      net: w.net,
      doNo: '',
      ticketNo: '',
      sjBook: '',
      timeIn: t.in,
      timeOut: t.out,
    };
  }
  function recordedTrip(rand, po, d) {
    var w = d.weighing || {};
    var net = T().netOf(d);
    var tare = w.tare != null ? r2(w.tare) : r2(11.4 + rand() * 2);
    var t = clock(rand);
    return {
      sjNo: d.sjNo,
      poNumber: d.poNumber || poNo(po),
      date: d.date,
      vehicle: plain(d.vehicle) || plain(plateFor(rand)),
      driver: String(d.driver || pick(rand, DRIVERS)).toUpperCase(),
      itemName: d.lines && d.lines[0] ? d.lines[0].itemName : lineOf(po).itemName,
      customer: d.customer || '',
      keterangan: keteranganOf(d),
      gross: w.gross != null ? r2(w.gross) : r2(tare + net),
      tare: tare,
      net: net,
      doNo: d.doNo || '',
      ticketNo: d.ticketNo || '',
      sjBook: d.sjRef || '',
      timeIn: t.in,
      timeOut: t.out,
    };
  }
  // DO numbers count up with the date; the BAP (weighbridge ticket, "No GJIB" in
  // the recap) runs a fixed step ahead; our SJ book has its own running number.
  function numberTrips(trips, rand) {
    if (!S.doBase) S.doBase = 41000 + Math.floor(rand() * 600);
    if (!S.sjBook) S.sjBook = 460;
    trips.forEach(function (t) {
      if (!t.doNo) t.doNo = String(S.doBase++);
      if (!t.ticketNo) t.ticketNo = '0' + (Number(t.doNo) + 161);
      if (!t.sjBook) t.sjBook = String(S.sjBook++);
    });
  }

  // New trips spread over the last days, inside the PO's quota and dates.
  function planNew(rand, po, count) {
    var u = T().usage(po);
    var room = num(u.ordered) - num(u.taken);
    var slots = pendingOf(po).slice(0, count);
    while (slots.length && room / slots.length < 8) slots.pop();
    if (!slots.length) return [];
    var cap = num(slots[0].capacity) || 35;
    var per = Math.min(cap * 0.97, (room - 0.5) / slots.length);
    var today = todayISO();
    var first = po.date && po.date > addDays(today, -3) ? po.date : addDays(today, -3);
    var last = u.cutoff && u.cutoff < today ? u.cutoff : today;
    var span = Math.max(0, Math.round((new Date(last) - new Date(first)) / 86400000));
    return slots.map(function (slot, i) {
      var date = addDays(first, Math.min(span, Math.round((span * (i + 1)) / slots.length)));
      var net = r2(per * (0.9 + rand() * 0.09));
      return { slot: slot, date: date, net: net };
    });
  }

  // kind 'clean': every photo agrees with the Excel. kind 'issues': one of each
  // problem the meeting raised — an old, already invoiced weight changed in the
  // cumulative recap, a typo in the Excel, an unreadable photo, a missing photo.
  function buildEmail(kind) {
    var pos = openPOs();
    if (!pos.length) return null;
    var used = {};
    S.emails.forEach(function (e) {
      used[e.poId] = (used[e.poId] || 0) + 1;
    });
    var po;
    if (kind === 'issues') {
      po =
        pos.find(function (p) {
          return tripsOf(p).some(invoicedTrip);
        }) ||
        pos.find(function (p) {
          return tripsOf(p).length > 0;
        }) ||
        pos[0];
    } else {
      po = pos.slice().sort(function (a, b) {
        return (used[a.id] || 0) - (used[b.id] || 0) || pendingOf(b).length - pendingOf(a).length;
      })[0];
    }
    var seed = (Date.now() ^ (S.seq * 7919)) >>> 0;
    var rand = rng(seed);
    var roles = kind === 'issues' ? ['ok', 'conflict', 'unclear', 'nophoto'] : ['ok', 'ok', 'ok'];
    var plan = planNew(rand, po, roles.length);
    if (!plan.length) return null;
    var trips = [];
    // Already recorded trips repeated in a cumulative recap.
    if (kind === 'issues') {
      var done = tripsOf(po).sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date));
      });
      var changed = done.find(invoicedTrip) || done[0];
      var kept = done.find(function (d) {
        return d !== changed;
      });
      if (kept) trips.push({ role: 'same', trip: recordedTrip(rand, po, kept) });
      if (changed) {
        var real = recordedTrip(rand, po, changed);
        trips.push({
          role: 'changed',
          trip: real,
          excel: Object.assign({}, real, { gross: r2(real.gross + 5), net: r2(real.net + 5) }),
        });
      }
    }
    plan.forEach(function (p, i) {
      trips.push({ role: roles[i], trip: newTrip(rand, po, p.slot, p.date, p.net) });
    });
    trips.sort(function (a, b) {
      return String(a.trip.date).localeCompare(String(b.trip.date));
    });
    numberTrips(
      trips.map(function (x) {
        return x.trip;
      }),
      rand
    );
    trips.forEach(function (x) {
      if (x.excel) {
        x.excel.doNo = x.trip.doNo;
        x.excel.ticketNo = x.trip.ticketNo;
        x.excel.sjBook = x.trip.sjBook;
      }
    });

    var sup = supplierOf(po);
    var item = lineOf(po).itemName || 'barang';
    var dates = trips.map(function (x) {
      return x.trip.date;
    });
    var from = dates.reduce(function (a, b) {
      return a < b ? a : b;
    });
    var to = dates.reduce(function (a, b) {
      return a > b ? a : b;
    });
    var excelRows = [];
    var photoList = [];
    var sjPhotos = [];
    trips.forEach(function (x, i) {
      // Our surat jalan, photographed too: kept with the e-mail, not read.
      if (x.role !== 'same' && x.role !== 'changed') {
        sjPhotos.push({ id: 's' + seed + '-' + i, seed: (seed + i * 7907) >>> 0, trip: x.trip });
      }
      var t = x.trip;
      var xl = x.excel || t;
      if (x.role === 'conflict') {
        // The recap says 3 ton more than the ticket printed.
        var typed = r2(t.net + 3);
        xl = Object.assign({}, t, { net: typed, gross: r2(t.tare + typed) });
      }
      excelRows.push(xl);
      if (x.role === 'nophoto') return;
      var conf = confidence(rand);
      var read = {
        doNo: t.doNo,
        ticketNo: t.ticketNo,
        poNumber: t.poNumber,
        date: t.date,
        vehicle: t.vehicle,
        gross: t.gross,
        tare: t.tare,
        net: t.net,
      };
      if (x.role === 'unclear') {
        // A shadow over the figures: netto misread (1 → 7) and unsure.
        var n = t.net.toFixed(2);
        var mis = n.indexOf('1') !== -1 ? Number(n.replace('1', '7')) : r2(t.net + 6);
        read.net = r2(mis);
        read.gross = r2(t.tare + mis);
        conf.net = 0.58;
        conf.gross = 0.63;
      }
      photoList.push({
        id: 'p' + seed + '-' + i,
        seed: (seed + i * 104729) >>> 0,
        sjNo: t.sjNo,
        doNo: t.doNo,
        trip: t,
        read: read,
        conf: conf,
        blurry: x.role === 'unclear',
      });
    });

    S.seq++;
    var stamp = String(S.seq).padStart(3, '0');
    // As the supplier names them: "Rekap & SJ NSA-CIKANDE 05-060926" and
    // "REKAP NSA-CIKANDE.xlsx".
    var site = (siteOf(trips[0] && trips[0].trip) || '').toUpperCase();
    var tag = companyCode() + (site ? '-' + site : '');
    var span =
      from.slice(8, 10) +
      (to !== from ? '-' + to.slice(8, 10) : '') +
      to.slice(5, 7) +
      to.slice(2, 4);
    var fileName = 'REKAP ' + tag + '.xlsx';
    return {
      id: 'em-' + seed + '-' + stamp,
      kind: kind,
      seed: seed,
      receivedAt: new Date().toISOString(),
      opened: false,
      poId: po.id,
      poNumber: poNo(po),
      supplier: sup.name,
      fromName: 'Admin Timbangan ' + sup.name,
      fromEmail: sup.email,
      to: inboxAddress(),
      subject: 'Rekap & SJ ' + tag + ' ' + span,
      body: [
        'Selamat siang,',
        'Berikut rekap dan foto DO + SJ pengambilan ' +
          item +
          ' tanggal ' +
          fmtDate(from) +
          (to !== from ? ' s/d ' + fmtDate(to) : '') +
          '.',
        'Terima kasih.',
      ],
      period: { from: from, to: to },
      fileName: fileName,
      title: sup.name,
      rows: excelRows,
      photos: photoList,
      sjPhotos: sjPhotos,
      decisions: {},
      manual: {},
      applied: [],
      appliedKeys: {},
      replies: [],
    };
  }

  // ── The Excel attachment (a real .xlsx) ─────────────────────────────────────
  // The supplier's layout: one sheet per material; rows 1–3 empty; a two-row
  // header ("No" over GJIB / DO / Surat Jalan / Polisi / PO); "Isi / Kosong /
  // Qty (kg)" holding tons; numbering and a subtotal row per day; a SUBTOTAL
  // footer. aoaOf(email, item) → one sheet.
  var RECAP_HEAD = [
    ['No', 'No', 'No', 'No', 'No', 'SUPIR', 'Tanggal', 'Isi(kg)', 'Kosong(Kg)', 'Qty(kg)', 'Material', 'Keterangan', 'No'],
    ['', 'GJIB', 'DO', 'Surat Jalan', 'Polisi', '', '', '', '', '', '', '', 'PO'],
  ];
  function materialsOf(email) {
    var out = [];
    email.rows.forEach(function (r) {
      if (out.indexOf(r.itemName) === -1) out.push(r.itemName);
    });
    return out;
  }
  function aoaOf(email, item) {
    var rows = email.rows.filter(function (r) {
      return item == null || r.itemName === item;
    });
    var aoa = [[], [], []].concat(RECAP_HEAD);
    var day = '';
    var n = 0;
    var daySum = 0;
    var total = 0;
    var closeDay = function () {
      if (day) aoa.push(['', '', '', '', '', '', '', '', '', r2(daySum)]);
    };
    rows.forEach(function (r) {
      if (r.date !== day) {
        closeDay();
        day = r.date;
        n = 0;
        daySum = 0;
      }
      n++;
      daySum += num(r.net);
      total += num(r.net);
      var d = new Date(String(r.date).slice(0, 10) + 'T00:00:00');
      aoa.push([
        n,
        Number(r.ticketNo) || r.ticketNo,
        Number(r.doNo) || r.doNo,
        Number(r.sjBook) || r.sjBook,
        plain(r.vehicle),
        String(r.driver || '').toUpperCase(),
        isNaN(d) ? r.date : d,
        r.gross,
        r.tare,
        r.net,
        r.itemName,
        r.keterangan || '',
        poSeqOf(r.poNumber),
      ]);
    });
    closeDay();
    aoa.push([], ['', '', '', '', '', '', 'SUBTOTAL'], ['', '', '', '', '', '', item || '', '', '=', r2(total), 'Ton']);
    return aoa;
  }
  function workbook(email) {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    materialsOf(email).forEach(function (item) {
      var ws = X.utils.aoa_to_sheet(aoaOf(email, item), { cellDates: true });
      ws['!cols'] = [4, 8, 8, 10, 11, 10, 11, 8, 10, 8, 16, 18, 5].map(function (w) {
        return { wch: w };
      });
      ws['!merges'] = [0, 5, 6, 7, 8, 9, 10, 11].map(function (c) {
        return { s: { r: 3, c: c }, e: { r: 4, c: c } };
      });
      // Sheet names as the supplier writes them: "SPLITE 1-2", at most 31 chars.
      var name = String(item || 'REKAP')
        .toUpperCase()
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31);
      X.utils.book_append_sheet(wb, ws, name);
    });
    if (!wb.SheetNames.length) {
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[], [], []].concat(RECAP_HEAD)), 'REKAP');
    }
    return wb;
  }
  // The rows as the app reads them: the .xlsx is written and read back through
  // the Impor Rekap Timbangan reader, as an attachment would be.
  function excelRows(email) {
    if (excelCache[email.id]) return excelCache[email.id];
    var X = window.XLSX;
    var rows = null;
    if (X && T()) {
      try {
        var buf = X.write(workbook(email), { bookType: 'xlsx', type: 'array' });
        var wb = X.read(new Uint8Array(buf), { type: 'array' });
        rows = T().recapRowsFromWorkbook(wb, X).rows;
      } catch (_) {
        /* read the sheet's rows as written */
      }
    }
    if (!rows) rows = T() ? T().recapRowsFromAoa(aoaOf(email)) : [];
    excelCache[email.id] = rows;
    return rows;
  }
  function downloadExcel(email) {
    var X = window.XLSX;
    if (!X) {
      toast('Pembuat Excel belum siap. Muat ulang halaman.', 'danger');
      return;
    }
    X.writeFile(workbook(email), email.fileName);
  }

  // ── The photos (drawn) ──────────────────────────────────────────────────────
  // Phone photos like the supplier's: the DO is a continuous form (tractor-feed
  // holes on both long edges) printed by a dot-matrix printer in pale grey,
  // lying on a dark glass desk on a stack of other forms, photographed turned on
  // its side, with glare, uneven light and sensor noise. Field boxes are kept
  // for the overlay that shows what the reader found (as % of the image).
  var MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agust', 'Sep', 'Okt', 'Nov', 'Des'];
  function longDate(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + MONTHS_ID[Number(p[1]) - 1] + ' ' + p[0] : '';
  }
  function kgDots(t) {
    return Math.round(num(t) * 1000).toLocaleString('id-ID');
  }
  // "Cikande" → "CKD", "Serang" → "SRG": first, second and last consonant, as
  // the supplier abbreviates sites.
  function siteCode(site) {
    var c = String(site || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .replace(/[AEIOU]/g, '');
    return c.length > 3 ? c[0] + c[1] + c[c.length - 1] : c;
  }
  // A placement for a sheet in the photo: centre, turn, scale and a slight skew
  // for the phone's angle. at(x, y) maps sheet coordinates to the image.
  function placement(cx, cy, angle, s, kx, ky, PW, PH) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    return {
      apply: function (g) {
        g.translate(cx, cy);
        g.rotate(angle);
        g.scale(s, s);
        g.transform(1, ky, kx, 1, 0, 0);
        g.translate(-PW / 2, -PH / 2);
      },
      at: function (x, y) {
        var px = x - PW / 2;
        var py = y - PH / 2;
        var qx = (px + kx * py) * s;
        var qy = (ky * px + py) * s;
        return [cx + qx * cos - qy * sin, cy + qx * sin + qy * cos];
      },
    };
  }
  function deskBackdrop(g, W, H, rand) {
    g.fillStyle = '#1b1d20';
    g.fillRect(0, 0, W, H);
    var glass = g.createLinearGradient(0, 0, W, H);
    glass.addColorStop(0, 'rgba(70,78,86,0.55)');
    glass.addColorStop(0.5, 'rgba(25,27,30,0.2)');
    glass.addColorStop(1, 'rgba(60,66,72,0.45)');
    g.fillStyle = glass;
    g.fillRect(0, 0, W, H);
    // Ceiling lights reflected in the glass.
    for (var i = 0; i < 3; i++) {
      var x = W * (0.02 + rand() * 0.12);
      var y = H * (0.15 + i * 0.3 + rand() * 0.05);
      var rg = g.createRadialGradient(x, y, 4, x, y, 60 + rand() * 40);
      rg.addColorStop(0, 'rgba(255,255,255,0.85)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(x - 110, y - 110, 220, 220);
    }
  }
  function photoFinish(cv, g, W, H, rand) {
    // Uneven light: one side brighter, the corners darker.
    var side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.10)');
    side.addColorStop(0.6, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = side;
    g.fillRect(0, 0, W, H);
    var vig = g.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    // Sensor noise.
    for (var k = 0; k < 5200; k++) {
      var v = rand() < 0.5 ? 0 : 255;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.04 + rand() * 0.06) + ')';
      g.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 1 + Math.floor(rand() * 2), 1);
    }
    // A touch of softness, as a phone photo of paper has.
    if (typeof g.filter === 'string') {
      var c2 = document.createElement('canvas');
      c2.width = W;
      c2.height = H;
      var g2 = c2.getContext('2d');
      g2.filter = 'blur(0.8px)';
      g2.drawImage(cv, 0, 0);
      g.drawImage(c2, 0, 0);
    }
  }
  // Dot-matrix print: pale grey type, broken by a fine lattice of paper colour.
  function dotMatrix(g, x, y, w, h, paper) {
    g.save();
    g.fillStyle = paper;
    g.globalAlpha = 0.42;
    for (var yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
    g.globalAlpha = 0.3;
    for (var xx = x; xx < x + w; xx += 3) g.fillRect(xx, y, 1, h);
    g.restore();
  }
  function scribble(g, rand, x, y, w, h, color) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y + h * (0.4 + rand() * 0.3));
    for (var s = 0; s < 7; s++) {
      g.bezierCurveTo(
        x + w * (s / 7) + rand() * 20,
        y + rand() * h,
        x + w * ((s + 0.6) / 7),
        y + h * (0.2 + rand() * 0.8),
        x + w * ((s + 1) / 7),
        y + h * (0.3 + rand() * 0.5)
      );
    }
    g.stroke();
    g.restore();
  }

  // The supplier's DO, as on the real form: kop, BAP, two columns of fields,
  // the weights in kg, the PO as "Sales Order No", four signature boxes.
  function drawPhoto(p, supplier) {
    if (photos[p.id]) return photos[p.id];
    var W = 900;
    var H = 1200;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var g = cv.getContext && cv.getContext('2d');
    if (!g) return { url: '', boxes: {} };
    var rand = rng(p.seed);
    var t = p.trip;
    deskBackdrop(g, W, H, rand);
    var PW = 1150;
    var PH = 720;
    var paper = '#e2e2dd';
    var angle = (-90 + (rand() * 4 - 2)) * (Math.PI / 180);
    var s = (H * (0.97 + rand() * 0.04)) / PW;
    var pl = placement(
      W * (0.55 + rand() * 0.04),
      H * (0.5 + rand() * 0.02),
      angle,
      s,
      rand() * 0.04 - 0.02,
      rand() * 0.03 - 0.015,
      PW,
      PH
    );
    // Other forms underneath.
    for (var u = 2; u >= 1; u--) {
      g.save();
      pl.apply(g);
      g.translate(u * 14 - rand() * 6, u * 10);
      g.fillStyle = u === 2 ? '#d9d9d4' : '#e4e4df';
      g.fillRect(0, 0, PW, PH);
      g.restore();
    }
    g.save();
    pl.apply(g);
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 18;
    var pg = g.createLinearGradient(0, 0, PW, PH);
    pg.addColorStop(0, '#e9e9e5');
    pg.addColorStop(1, '#d8d8d2');
    g.fillStyle = pg;
    g.fillRect(0, 0, PW, PH);
    g.shadowColor = 'transparent';
    // Tractor-feed strips: holes and the perforation along both long edges.
    g.fillStyle = '#26282b';
    for (var hx = 30; hx < PW; hx += 48) {
      [24, PH - 24].forEach(function (hy) {
        g.beginPath();
        g.arc(hx, hy, 9, 0, Math.PI * 2);
        g.fill();
      });
    }
    g.strokeStyle = 'rgba(80,80,80,0.35)';
    g.setLineDash([3, 4]);
    [50, PH - 50].forEach(function (py) {
      g.beginPath();
      g.moveTo(0, py);
      g.lineTo(PW, py);
      g.stroke();
    });
    g.setLineDash([]);
    var boxes = {};
    function mark(key, x, y, w, h) {
      var pts = [pl.at(x, y), pl.at(x + w, y), pl.at(x, y + h), pl.at(x + w, y + h)];
      var xs = pts.map(function (q) {
        return q[0];
      });
      var ys = pts.map(function (q) {
        return q[1];
      });
      var x0 = Math.min.apply(null, xs) - 4;
      var y0 = Math.min.apply(null, ys) - 4;
      boxes[key] = {
        x: (x0 / W) * 100,
        y: (y0 / H) * 100,
        w: ((Math.max.apply(null, xs) + 4 - x0) / W) * 100,
        h: ((Math.max.apply(null, ys) + 4 - y0) / H) * 100,
      };
    }
    var mono = '"Courier New", Courier, monospace';
    var ink = 'rgba(88,90,98,0.82)';
    var text = function (str, x, y, size, bold, align) {
      g.font = (bold ? 'bold ' : '') + size + 'px ' + mono;
      g.fillStyle = ink;
      g.textAlign = align || 'left';
      g.fillText(str, x, y);
      return g.measureText(str).width;
    };
    var sup = 'PT. ' + String(supplier || '').replace(/^PT\.?\s+/i, '').toUpperCase();
    var wSup = text(sup, 120, 118, 30, true);
    g.fillStyle = ink;
    g.fillRect(120, 126, wSup, 2);
    var bap = 'BAP: ' + t.ticketNo;
    var wBap = text(bap, PW - 120, 118, 26, false, 'right');
    mark('ticketNo', PW - 120 - wBap + 70, 96, wBap - 70, 28);
    var site = siteOf(t);
    var L = 150;
    var LV = 380;
    var R = 650;
    var RV = 840;
    var row = function (y, label, value, key) {
      text(label, L, y, 23);
      var w = text(value, LV, y, 23);
      if (key) mark(key, LV, y - 21, w, 27);
    };
    var rrow = function (y, label, value, key) {
      text(label, R, y, 23);
      var w = text(value, RV, y, 23);
      if (key) mark(key, RV, y - 21, w, 27);
    };
    row(185, 'Tanggal', longDate(t.date), 'date');
    rrow(185, 'Waktu Masuk', longDate(t.date) + ' ' + String(t.timeIn || '').replace(':', '.'));
    row(222, 'Nomor DO', String(t.doNo), 'doNo');
    rrow(222, 'Waktu Keluar', longDate(t.date) + ' ' + String(t.timeOut || '').replace(':', '.'));
    row(290, 'Customer', 'PT. ' + companyName().replace(/^PT\.?\s+/i, ''));
    row(325, 'Project', String(t.customer || '').replace(/\s+-\s+/, '- '));
    row(360, 'No Truck', plain(t.vehicle), 'vehicle');
    rrow(360, 'Driver', String(t.driver || '').toUpperCase());
    row(395, 'Product', String(t.itemName || ''));
    rrow(395, 'Qty (Kg)', kgDots(t.net), 'net');
    row(430, 'Berat Kosong', kgDots(t.tare), 'tare');
    rrow(430, 'Berat Isi (Kg)', kgDots(t.gross), 'gross');
    row(465, 'Sales Order No', String(t.poNumber || ''), 'poNumber');
    row(500, 'Keterangan', companyCode() + ' ' + siteCode(site));
    // Signature boxes.
    var top = 545;
    var bottom = 668;
    var cols = [120, 360, 600, 840, 1060];
    g.strokeStyle = 'rgba(70,72,78,0.75)';
    g.lineWidth = 1.5;
    g.strokeRect(cols[0], top, cols[4] - cols[0], bottom - top);
    for (var ci = 1; ci < 4; ci++) {
      g.beginPath();
      g.moveTo(cols[ci], top);
      g.lineTo(cols[ci], bottom);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cols[0], top + 30);
    g.lineTo(cols[4], top + 30);
    g.stroke();
    ['Admin', 'Driver', 'Security', 'Penerima Barang'].forEach(function (lbl, i) {
      text(lbl, cols[i] + 8, top + 22, 19);
    });
    dotMatrix(g, 100, 80, PW - 200, 600, paper);
    // Ink by hand: the admin's and the driver's signature, the driver's name.
    scribble(g, rand, cols[0] + 30, top + 40, 170, 70, 'rgba(25,25,35,0.85)');
    scribble(g, rand, cols[1] + 40, top + 36, 120, 50, 'rgba(25,25,35,0.85)');
    g.save();
    g.font = 'italic 30px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
    g.fillStyle = 'rgba(25,25,35,0.85)';
    g.fillText(String(t.driver || '').toLowerCase(), cols[1] + 50, bottom - 12);
    g.restore();
    text('admin.' + initials(supplier).toLowerCase(), cols[0] + 4, bottom + 26, 19);
    // A shadow over the weights, as when the photo was taken in a hurry.
    if (p.blurry) {
      var sh = g.createLinearGradient(R - 20, 360, PW, 450);
      sh.addColorStop(0, 'rgba(20,16,12,0.05)');
      sh.addColorStop(0.5, 'rgba(20,16,12,0.55)');
      sh.addColorStop(1, 'rgba(20,16,12,0.2)');
      g.fillStyle = sh;
      g.fillRect(L - 20, 365, PW - L, 80);
    }
    g.restore();
    // Glare from the lamp, over the desk and the edge of the form.
    var gx = W * (0.08 + rand() * 0.1);
    var gy = H * (0.3 + rand() * 0.4);
    var glare = g.createRadialGradient(gx, gy, 10, gx, gy, 260);
    glare.addColorStop(0, 'rgba(255,255,255,0.55)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glare;
    g.fillRect(0, 0, W, H);
    photoFinish(cv, g, W, H, rand);
    if (p.blurry && typeof g.filter === 'string' && boxes.gross && boxes.net && boxes.tare) {
      // Shaken over the weights only: the rest of the form stays readable.
      var c3 = document.createElement('canvas');
      c3.width = W;
      c3.height = H;
      var g3 = c3.getContext('2d');
      g3.filter = 'blur(3px)';
      g3.drawImage(cv, 0, 0);
      var bx = Math.min(boxes.gross.x, boxes.net.x, boxes.tare.x);
      var by = Math.min(boxes.gross.y, boxes.net.y, boxes.tare.y);
      var bw = Math.max(boxes.gross.x + boxes.gross.w, boxes.net.x + boxes.net.w, boxes.tare.x + boxes.tare.w) - bx;
      var bh = Math.max(boxes.gross.y + boxes.gross.h, boxes.net.y + boxes.net.h, boxes.tare.y + boxes.tare.h) - by;
      var X0 = (bx / 100) * W - 10;
      var Y0 = (by / 100) * H - 10;
      g.drawImage(c3, X0, Y0, (bw / 100) * W + 20, (bh / 100) * H + 20, X0, Y0, (bw / 100) * W + 20, (bh / 100) * H + 20);
    }
    var url = '';
    try {
      url = cv.toDataURL('image/jpeg', 0.72);
    } catch (_) {
      url = '';
    }
    photos[p.id] = { url: url, boxes: boxes };
    return photos[p.id];
  }

  // Our surat jalan (the pink carbon copy), filled in by hand at the weighbridge
  // and photographed with the DO. Shown with the e-mail; not read.
  function drawSjPhoto(p) {
    if (photos[p.id]) return photos[p.id];
    var W = 900;
    var H = 1200;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var g = cv.getContext && cv.getContext('2d');
    if (!g) return { url: '', boxes: {} };
    var rand = rng(p.seed);
    var t = p.trip;
    deskBackdrop(g, W, H, rand);
    var PW = 760;
    var PH = 1000;
    var pl = placement(
      W * (0.5 + rand() * 0.04),
      H * (0.52 + rand() * 0.02),
      (rand() * 6 - 3) * (Math.PI / 180),
      1.04,
      rand() * 0.04 - 0.02,
      rand() * 0.03 - 0.015,
      PW,
      PH
    );
    g.save();
    pl.apply(g);
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 18;
    g.fillStyle = '#f1d3dc';
    g.fillRect(0, 0, PW, PH);
    g.shadowColor = 'transparent';
    var ink = 'rgba(120,40,70,0.75)';
    var mono = 'Arial, Helvetica, sans-serif';
    g.fillStyle = ink;
    g.font = 'bold 26px ' + mono;
    g.textAlign = 'left';
    g.fillText(companyName().toUpperCase(), 50, 70);
    g.font = 'bold 34px ' + mono;
    g.textAlign = 'center';
    g.fillText('SURAT JALAN', PW / 2, 140);
    g.textAlign = 'left';
    g.font = '22px ' + mono;
    var fields = ['No.', 'Tanggal', 'Kepada', 'No. Polisi', 'Sopir'];
    fields.forEach(function (f, i) {
      g.fillText(f, 50, 210 + i * 48);
      g.fillRect(200, 216 + i * 48, PW - 260, 1.5);
    });
    // The goods table.
    g.strokeStyle = ink;
    g.lineWidth = 1.5;
    g.strokeRect(50, 470, PW - 100, 260);
    [520].forEach(function (y) {
      g.beginPath();
      g.moveTo(50, y);
      g.lineTo(PW - 50, y);
      g.stroke();
    });
    [110, 470].forEach(function (x) {
      g.beginPath();
      g.moveTo(x, 470);
      g.lineTo(x, 730);
      g.stroke();
    });
    g.fillText('No', 62, 503);
    g.fillText('Nama Barang', 130, 503);
    g.fillText('Jumlah', 490, 503);
    ['Yang Menyerahkan', 'Sopir', 'Penerima'].forEach(function (lbl, i) {
      var x = 50 + i * ((PW - 100) / 3);
      g.strokeRect(x, 780, (PW - 100) / 3, 150);
      g.fillText(lbl, x + 12, 808);
    });
    // Blue ballpoint.
    var hand = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
    var pen = 'rgba(25,45,140,0.88)';
    g.fillStyle = pen;
    g.font = '28px ' + hand;
    [
      String(t.sjBook || ''),
      fmtDate(t.date),
      siteOf(t) || String(t.customer || ''),
      plain(t.vehicle),
      String(t.driver || '').toLowerCase(),
    ].forEach(function (v, i) {
      g.fillText(v, 215, 206 + i * 48);
    });
    g.fillText('1', 70, 570);
    g.fillText(String(t.itemName || ''), 125, 570);
    g.fillText('± ' + Math.round(num(t.net)) + ' T', 485, 570);
    scribble(g, rand, 70, 840, 150, 60, pen);
    scribble(g, rand, 300, 845, 140, 55, pen);
    g.restore();
    photoFinish(cv, g, W, H, rand);
    var url = '';
    try {
      url = cv.toDataURL('image/jpeg', 0.72);
    } catch (_) {
      url = '';
    }
    photos[p.id] = { url: url, boxes: {} };
    return photos[p.id];
  }

  // ── Comparing photo, Excel and the app ──────────────────────────────────────
  var STATUS = {
    match: { label: 'Cocok', kind: 'success', note: 'Rekap dan foto sama — siap dicatat' },
    update: {
      label: 'Perlu diperbarui',
      kind: 'warning',
      note: 'Rekap dan foto sama, berbeda dari yang tercatat',
    },
    same: { label: 'Sudah tercatat', kind: 'neutral', note: 'Sama dengan yang tercatat' },
    applied: { label: 'Dicatat', kind: 'success', note: 'Dicatat dari email ini' },
    conflict: {
      label: 'Rekap ≠ foto',
      kind: 'danger',
      note: 'Angka di rekap berbeda dari foto DO',
    },
    excelChanged: {
      label: 'Berat lama diubah',
      kind: 'danger',
      note: 'Rekap mengubah berat yang sudah tercatat; foto DO sama dengan catatan',
      short: 'Foto DO sama dengan catatan',
    },
    unclear: {
      label: 'Foto kurang jelas',
      kind: 'warning',
      note: 'Angka di foto tidak terbaca dengan yakin',
    },
    noPhoto: { label: 'Tanpa foto', kind: 'warning', note: 'Ada di rekap, tidak ada foto DO-nya' },
    noExcel: {
      label: 'Tidak ada di rekap',
      kind: 'warning',
      note: 'Ada foto DO, tidak ada di rekap',
    },
    unknown: {
      label: 'PO tidak dikenal',
      kind: 'danger',
      note: 'No PO dan No DO ini tidak ada di aplikasi',
    },
    void: { label: 'SJ sudah batal', kind: 'danger', note: 'Surat jalan ini sudah dibatalkan' },
  };
  // Choices per status; the first is not a default — rows wait for a choice.
  var CHOICES = {
    conflict: [
      ['photo', 'Pakai angka foto'],
      ['excel', 'Pakai angka rekap'],
      ['hold', 'Tunda, tanya supplier'],
    ],
    excelChanged: [
      ['keep', 'Tetap (sesuai foto)'],
      ['excel', 'Pakai angka rekap'],
    ],
    unclear: [
      ['excel', 'Pakai angka rekap'],
      ['manual', 'Isi dari foto'],
      ['hold', 'Tunda, minta foto ulang'],
    ],
    noPhoto: [
      ['excel', 'Pakai angka rekap'],
      ['hold', 'Tunda, minta foto'],
    ],
    noExcel: [
      ['photo', 'Pakai angka foto'],
      ['hold', 'Tunda'],
    ],
  };
  var DEFAULT_CHOICE = { excelChanged: 'keep' };

  function keyOf(sjNo) {
    return String(sjNo || '')
      .trim()
      .toUpperCase();
  }

  // One row per truck, keyed by its DO number: the Excel row and the DO photo of
  // that DO, and the surat jalan it belongs to in the app — found the way Impor
  // Rekap Timbangan finds it (Trading.matchRecap: No PO, then No DO).
  function compare(email) {
    var byKey = {};
    var order = [];
    function slot(k) {
      if (!byKey[k]) {
        byKey[k] = { key: k, excel: null, photo: null };
        order.push(k);
      }
      return byKey[k];
    }
    excelRows(email).forEach(function (r) {
      var k = keyOf(r.doNo || r.sjNo);
      if (k) slot(k).excel = r;
    });
    email.photos.forEach(function (p) {
      var k = keyOf(p.read.doNo || p.doNo || p.sjNo);
      if (k) slot(k).photo = p;
    });
    var probe = order.map(function (k) {
      return byKey[k].excel || photoRow(byKey[k].photo);
    });
    var m = T().matchRecap(probe);
    var doIdOf = {};
    ['fill', 'same', 'changed', 'problems'].forEach(function (group) {
      m[group].forEach(function (it) {
        if (it.doId) doIdOf[keyOf(it.row.doNo || it.row.sjNo)] = it.doId;
      });
    });
    return order.map(function (k) {
      return classify(byKey[k], email, doIdOf[k] ? find('deliveryOrders', doIdOf[k]) : null);
    });
  }
  // A DO photo as a recap row, for a truck the Excel leaves out.
  function photoRow(p) {
    var r = p.read;
    return {
      row: 0,
      sheet: '',
      sjNo: '',
      doNo: r.doNo,
      ticketNo: r.ticketNo,
      poNumber: r.poNumber,
      date: r.date,
      vehicle: r.vehicle,
      driver: p.trip.driver,
      itemName: p.trip.itemName,
      customer: p.trip.keterangan || '',
      gross: r.gross,
      tare: r.tare,
      net: r.net,
    };
  }

  function classify(x, email, d) {
    var recorded = d && T().isTrip(d) ? T().netOf(d) : null;
    var xl = x.excel ? x.excel.net : null;
    var ph = x.photo ? x.photo.read.net : null;
    var conf = x.photo ? x.photo.conf.net : null;
    var status;
    if (!d) status = 'unknown';
    else if (d.status === 'Cancelled') status = 'void';
    else if (email.appliedKeys[x.key] != null && eq(recorded, email.appliedKeys[x.key]))
      status = 'applied';
    else if (x.photo && conf < LOW_CONF) status = 'unclear';
    else if (x.excel && x.photo) {
      if (eq(xl, ph)) status = recorded == null ? 'match' : eq(recorded, xl) ? 'same' : 'update';
      else status = recorded != null && eq(recorded, ph) ? 'excelChanged' : 'conflict';
    } else if (x.excel) status = recorded != null && eq(recorded, xl) ? 'same' : 'noPhoto';
    else status = recorded != null && eq(recorded, ph) ? 'same' : 'noExcel';
    var choice = email.decisions[x.key] || DEFAULT_CHOICE[status] || '';
    var t = (x.photo && x.photo.trip) || {};
    return {
      key: x.key,
      // The DO number; the app's surat jalan it belongs to; our SJ book number
      // written in the recap.
      doNo: (x.excel && x.excel.doNo) || (x.photo && x.photo.read.doNo) || x.key,
      sjNo: d ? d.sjNo : '',
      sjBook: (x.excel && x.excel.sjNo) || t.sjBook || '',
      doId: d ? d.id : null,
      trip: d,
      excel: x.excel,
      photo: x.photo,
      recorded: recorded,
      invoiced: d ? invoicedTrip(d) : false,
      status: status,
      choices: CHOICES[status] || null,
      choice: choice,
      manual: email.manual[x.key] != null ? email.manual[x.key] : '',
      appliedSrc: (email.appliedSrc || {})[x.key] || '',
    };
  }

  function needsChoice(r) {
    return !!r.choices && !r.choice;
  }
  // What applying writes for a row: the figures chosen, or null.
  function planOf(r) {
    var src = null;
    if (r.status === 'match' || r.status === 'update') src = 'excel';
    else if (r.choices && (r.choice === 'excel' || r.choice === 'photo')) src = r.choice;
    else if (r.status === 'unclear' && r.choice === 'manual') src = 'manual';
    if (!src || !r.trip) return null;
    var base =
      (src === 'photo' ? r.photo && r.photo.trip : r.excel) || r.excel || (r.photo && r.photo.trip);
    if (!base) return null;
    if (src === 'photo') {
      base = Object.assign({}, r.photo.trip, {
        gross: r.photo.read.gross,
        tare: r.photo.read.tare,
        net: r.photo.read.net,
      });
    }
    var net = src === 'manual' ? num(String(r.manual).replace(',', '.')) : num(base.net);
    if (!(net > 0)) return null;
    if (r.recorded != null && eq(r.recorded, net)) return null;
    var keepWeights = src !== 'manual' && base.gross != null && base.gross > 0;
    return {
      key: r.key,
      doId: r.doId,
      source: src,
      net: net,
      row: {
        row: 0,
        sjNo: r.sjBook || '',
        doNo: r.doNo || '',
        poNumber: base.poNumber || '',
        date: base.date || (r.trip && r.trip.date) || '',
        vehicle: base.vehicle || (r.trip && r.trip.vehicle) || '',
        driver: base.driver || '',
        ticketNo: base.ticketNo || '',
        gross: keepWeights ? base.gross : null,
        tare: keepWeights ? base.tare : null,
        net: net,
      },
      photo: r.photo,
    };
  }

  function summary(email, rows) {
    rows = rows || compare(email);
    var s = { ready: 0, waiting: 0, done: 0, held: 0, problems: 0, total: rows.length };
    rows.forEach(function (r) {
      if (planOf(r)) s.ready++;
      else if (needsChoice(r)) s.waiting++;
      else if (r.status === 'same' || r.status === 'applied') s.done++;
      else if (r.choice === 'hold' || r.choice === 'keep') s.held++;
      else s.problems++;
    });
    return s;
  }
  function stateOf(email) {
    if (!email.opened) return { label: 'Baru', kind: 'info' };
    var s = summary(email);
    if (s.waiting) return { label: s.waiting + ' perlu keputusan', kind: 'warning' };
    if (s.ready) return { label: 'Siap dicatat', kind: 'info' };
    return { label: 'Selesai', kind: 'success' };
  }
  function waiting() {
    return S.emails.filter(function (e) {
      if (!e.opened) return true;
      var s = summary(e);
      return s.waiting > 0 || s.ready > 0;
    }).length;
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  var ICON = {
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    sheet:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="12" y1="11" x2="12" y2="19"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    dot: '<circle cx="12" cy="12" r="3"/>',
    clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  };
  function icon(name, size) {
    var s = size || 16;
    return (
      '<svg class="ri-icon" width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICON[name] +
      '</svg>'
    );
  }
  function badge(kind, text) {
    return '<span class="badge badge-' + kind + '">' + esc(text) + '</span>';
  }
  function btn(label, action, opts) {
    opts = opts || {};
    return (
      '<button type="button" class="' +
      (opts.cls || 'btn-ghost') +
      '" data-action="' +
      action +
      '"' +
      (opts.id != null ? ' data-id="' + esc(opts.id) + '"' : '') +
      (opts.extra || '') +
      (opts.disabled ? ' disabled' : '') +
      '>' +
      (opts.icon ? icon(opts.icon, 15) : '') +
      esc(label) +
      '</button>'
    );
  }

  function pageHTML() {
    var open = S.openId ? emailById(S.openId) : null;
    var actions =
      btn('Impor manual', 'riManual') +
      btn('Periksa email', 'riCheck', { cls: 'btn', icon: 'mail' });
    return (
      '<div id="ri-root">' +
      '<div class="sec-hdr"><div><h1>Kotak Masuk Rekap</h1></div>' +
      '<div class="pv-hdr-actions">' +
      actions +
      '</div></div>' +
      '<div class="notice notice-info ri-sim"><div><strong>Simulasi</strong> — belum tersambung ke email; ' +
      'yang dicatat masuk ke data aplikasi. ' +
      btn('Cara kerja', 'riHow', { cls: 'link-btn' }) +
      (S.emails.length ? ' · ' + btn('Ulang simulasi', 'riReset', { cls: 'link-btn' }) : '') +
      '</div></div>' +
      '<div class="ri-layout">' +
      listHTML() +
      '<div class="ri-detail">' +
      (open ? detailHTML(open) : emptyDetailHTML()) +
      '</div></div></div>'
    );
  }

  function listHTML() {
    var head =
      '<div class="card-head"><div><div class="card-title">Kotak masuk</div>' +
      '<div class="card-sub">' +
      esc(inboxAddress()) +
      (S.checkedAt ? ' · diperiksa ' + esc(fmtTime(S.checkedAt)) : '') +
      '</div></div></div>';
    if (!S.emails.length) {
      return (
        '<div class="card ri-list">' +
        head +
        '<div class="empty-inline">Belum ada email. Tekan <strong>Periksa email</strong> untuk menerima rekap dari supplier.</div></div>'
      );
    }
    var items = S.emails
      .slice()
      .sort(function (a, b) {
        return String(b.receivedAt).localeCompare(String(a.receivedAt));
      })
      .map(function (e) {
        var st = stateOf(e);
        var on = same(e.id, S.openId);
        return (
          '<button type="button" class="ri-item' +
          (on ? ' is-open' : '') +
          (e.opened ? '' : ' is-new') +
          '" data-action="riOpen" data-id="' +
          esc(e.id) +
          '"' +
          (on ? ' aria-current="true"' : '') +
          '>' +
          '<span class="ri-item-top"><span class="ri-item-from">' +
          esc(e.supplier) +
          '</span><span class="ri-item-time">' +
          esc(fmtTime(e.receivedAt)) +
          '</span></span>' +
          '<span class="ri-item-subject">' +
          esc(e.subject) +
          '</span>' +
          '<span class="ri-item-meta">' +
          icon('clip', 13) +
          '<span>1 Excel · ' +
          (e.photos.length + (e.sjPhotos || []).length) +
          ' foto</span>' +
          badge(st.kind, st.label) +
          '</span></button>'
        );
      })
      .join('');
    return '<div class="card ri-list">' + head + '<div class="ri-items">' + items + '</div></div>';
  }

  function emptyDetailHTML() {
    return (
      '<div class="card ri-empty"><div class="ri-empty-icon">' +
      icon('mail', 28) +
      '</div><div class="ri-empty-title">' +
      (S.emails.length ? 'Pilih email untuk melihat hasil pemeriksaan' : 'Menunggu email rekap') +
      '</div><div class="ri-empty-text">Rekap Excel dan foto DO dicocokkan dengan surat jalan; yang berbeda ditahan.</div></div>'
    );
  }

  var STEPS = [
    'Lampiran diterima',
    'Rekap Excel dibaca',
    'Foto DO dibaca',
    'Dicocokkan dengan surat jalan',
  ];

  function stepsHTML(email, rows, step) {
    var xl = excelRows(email);
    var unclear = email.photos.filter(function (p) {
      return p.conf.net < LOW_CONF;
    }).length;
    var detail = [
      '1 file Excel, ' +
        email.photos.length +
        ' foto DO' +
        ((email.sjPhotos || []).length ? ', ' + email.sjPhotos.length + ' foto SJ' : ''),
      xl.length + ' baris pengambilan',
      email.photos.length - unclear + ' jelas' + (unclear ? ', ' + unclear + ' kurang jelas' : ''),
      rows.length + ' surat jalan · PO ' + email.poNumber,
    ];
    return (
      '<ol class="ri-steps">' +
      STEPS.map(function (label, i) {
        var state = i < step ? 'done' : i === step ? 'run' : 'wait';
        return (
          '<li class="ri-step is-' +
          state +
          '"><span class="ri-step-mark">' +
          (state === 'done'
            ? icon('check', 13)
            : state === 'run'
              ? '<span class="ri-spin"></span>'
              : '') +
          '</span><span class="ri-step-label">' +
          esc(label) +
          '</span><span class="ri-step-detail">' +
          (state === 'done' ? esc(detail[i]) : state === 'run' ? 'memproses…' : '') +
          '</span></li>'
        );
      }).join('') +
      '</ol>'
    );
  }

  function figureCell(value, sub, cls) {
    return (
      '<span class="ri-fig' +
      (cls ? ' ' + cls : '') +
      '">' +
      esc(value) +
      (sub ? '<span class="ri-fig-sub">' + esc(sub) + '</span>' : '') +
      '</span>'
    );
  }

  function rowHTML(r, email) {
    var st = STATUS[r.status];
    var t = (r.photo && r.photo.trip) || r.excel || {};
    var photoCell = '—';
    if (r.photo) {
      var c = r.photo.conf.net;
      var low = c < LOW_CONF;
      photoCell =
        '<button type="button" class="ri-photo-link' +
        (low ? ' is-low' : '') +
        '" data-action="riPhoto" data-id="' +
        esc(email.id) +
        '" data-photo="' +
        esc(r.photo.id) +
        '">' +
        esc(fmtT(r.photo.read.net) + (low ? ' ?' : '')) +
        '<span class="ri-fig-sub">' +
        Math.round(c * 100) +
        '% yakin</span></button>';
    }
    var excelCell = r.excel ? fmtT(r.excel.net) : '—';
    var diff =
      r.excel && r.photo && !eq(r.excel.net, r.photo.read.net) && r.photo.conf.net >= LOW_CONF;
    var decision = '';
    if (r.choices) {
      decision =
        '<select class="form-select ri-choice" data-key="' +
        esc(r.key) +
        '" aria-label="Keputusan untuk DO ' +
        esc(r.doNo) +
        '">' +
        (r.choice ? '' : '<option value="" selected>Pilih…</option>') +
        r.choices
          .map(function (o) {
            return (
              '<option value="' +
              o[0] +
              '"' +
              (r.choice === o[0] ? ' selected' : '') +
              '>' +
              esc(o[1]) +
              '</option>'
            );
          })
          .join('') +
        '</select>' +
        (r.status === 'unclear' && r.choice === 'manual'
          ? '<input class="form-input ri-manual" inputmode="decimal" data-key="' +
            esc(r.key) +
            '" value="' +
            esc(r.manual) +
            '" placeholder="Netto (ton)" aria-label="Netto dari foto untuk DO ' +
            esc(r.doNo) +
            '">'
          : '');
    } else if (r.status === 'match' || r.status === 'update') {
      decision = '<span class="t-muted">Otomatis</span>';
    } else {
      decision = '<span class="t-muted">—</span>';
    }
    return (
      '<tr class="ri-row is-' +
      r.status +
      '">' +
      '<td data-cell="title"><span class="doc-no">' +
      esc('DO ' + r.doNo) +
      '</span><span class="ri-fig-sub">' +
      esc([typeof window.tgl === 'function' ? window.tgl(t.date) : fmtDate(t.date), plain(t.vehicle)].filter(Boolean).join(' · ')) +
      '</span>' +
      // The surat jalan it fills: "→ SJ 03" of the e-mail's PO.
      (r.sjNo ? '<span class="ri-fig-sub">' + esc('→ SJ ' + String(r.sjNo).split('/').pop()) + '</span>' : '') +
      '</td>' +
      '<td class="t-num" data-cell="meta" data-cap="Tercatat">' +
      (r.recorded != null
        ? figureCell(fmtT(r.recorded), r.invoiced ? 'sudah ditagih' : '')
        : '<span class="t-muted">belum</span>') +
      '</td>' +
      '<td class="t-num" data-cell="meta" data-cap="Rekap Excel">' +
      figureCell(excelCell, '', diff ? 'is-diff' : '') +
      '</td>' +
      '<td class="t-num" data-cell="meta" data-cap="Foto DO">' +
      photoCell +
      '</td>' +
      '<td data-cell="status"><span class="badge badge-' +
      st.kind +
      '" title="' +
      esc(st.note) +
      '">' +
      esc(st.label) +
      '</span>' +
      (st.short ? '<span class="ri-fig-sub">' + esc(st.short) + '</span>' : '') +
      '</td>' +
      '<td data-cell="action" class="ri-decide">' +
      decision +
      '</td></tr>'
    );
  }

  function detailHTML(email) {
    var step = proc[email.id];
    var running = step != null && step < STEPS.length;
    var rows = compare(email);
    var s = summary(email, rows);
    var head =
      '<div class="card ri-mail">' +
      '<div class="ri-mail-head"><div class="ri-mail-subject">' +
      esc(email.subject) +
      '</div>' +
      '<div class="ri-mail-line"><span class="t-muted">Dari</span> ' +
      esc(email.fromName) +
      (email.fromEmail ? ' &lt;' + esc(email.fromEmail) + '&gt;' : '') +
      '</div>' +
      '<div class="ri-mail-line"><span class="t-muted">Kepada</span> ' +
      esc(email.to) +
      ' · ' +
      esc(fmtTime(email.receivedAt)) +
      '</div></div>' +
      '<div class="ri-mail-body">' +
      email.body
        .map(function (p) {
          return '<p>' + esc(p) + '</p>';
        })
        .join('') +
      '</div>' +
      '<div class="ri-attach">' +
      '<button type="button" class="ri-file" data-action="riExcel" data-id="' +
      esc(email.id) +
      '">' +
      '<span class="ri-file-icon">' +
      icon('sheet', 18) +
      '</span><span class="ri-file-name">' +
      esc(email.fileName) +
      '</span><span class="ri-file-hint">Unduh</span></button>' +
      '<div class="ri-thumbs">' +
      attachmentsOf(email)
        .map(function (a) {
          var p = a.photo;
          var isDo = a.kind === 'do';
          var ph = isDo ? drawPhoto(p, email.supplier) : drawSjPhoto(p);
          var label = isDo ? 'DO ' + p.doNo : 'SJ ' + p.trip.sjBook;
          return (
            '<button type="button" class="ri-thumb' +
            (isDo ? '' : ' is-sj') +
            '" data-action="' +
            (isDo ? 'riPhoto' : 'riSjPhoto') +
            '" data-id="' +
            esc(email.id) +
            '" data-photo="' +
            esc(p.id) +
            '" title="Foto ' +
            esc(label) +
            '"><img src="' +
            esc(ph.url) +
            '" alt="Foto ' +
            esc(label) +
            '"><span>' +
            esc(label) +
            '</span></button>'
          );
        })
        .join('') +
      '</div></div></div>';

    var check =
      '<div class="card ri-check"><div class="card-head"><div><div class="card-title">Pemeriksaan otomatis</div>' +
      '</div></div>' +
      stepsHTML(email, rows, running ? step : STEPS.length) +
      '</div>';
    if (running) return head + check;

    var tiles =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Siap dicatat', value: String(s.ready), sub: 'rekap dan foto sama' },
            {
              label: 'Perlu keputusan',
              value: String(s.waiting),
              sub: s.waiting ? 'pilih angka yang dipakai' : 'tidak ada',
              color: s.waiting ? 'var(--warning)' : '',
            },
            { label: 'Ditahan', value: String(s.held), sub: 'tunggu jawaban supplier' },
            {
              label: 'Sudah tercatat',
              value: String(s.done),
              sub: 'dari ' + s.total + ' surat jalan',
            },
          ])
        : '';
    var hasIssues = replyLines(rows).length > 0;
    var table =
      '<div class="card ri-result"><div class="card-head"><div><div class="card-title">Hasil per truk</div>' +
      '<div class="card-sub">Ton</div></div></div>' +
      '<div class="table-wrap"><table class="data-table list-cards ri-table"><thead><tr>' +
      '<th>DO</th><th class="t-num">Tercatat</th><th class="t-num">Rekap Excel</th>' +
      '<th class="t-num">Foto DO</th><th>Hasil</th><th>Keputusan</th></tr></thead><tbody>' +
      rows
        .map(function (r) {
          return rowHTML(r, email);
        })
        .join('') +
      '</tbody></table></div>' +
      '<div class="ri-foot">' +
      (s.ready || s.waiting
        ? ''
        : '<span class="ri-foot-note">' +
          (s.held ? 'Yang lain sudah dicatat; sisanya ditahan.' : 'Semua sudah dicatat.') +
          '</span>') +
      (hasIssues ? btn('Balas ke supplier', 'riReply', { id: email.id }) : '') +
      (s.ready
        ? btn('Catat ' + s.ready + ' pengambilan', 'saveRecapEmail', { cls: 'btn', id: email.id })
        : '') +
      '</div></div>';

    var log = '';
    var events = []
      .concat(
        email.applied.map(function (a) {
          return {
            at: a.at,
            text:
              'Dicatat: ' +
              a.filled +
              ' pengambilan baru' +
              (a.changed ? ', ' + a.changed + ' berat diperbarui' : '') +
              (a.alerts ? ' (' + a.alerts + ' masuk Perubahan Timbangan)' : '') +
              (a.errors ? ', ' + a.errors + ' gagal' : ''),
          };
        })
      )
      .concat(
        email.replies.map(function (r) {
          return { at: r.at, text: 'Balasan ke supplier (simulasi): ' + r.subject };
        })
      )
      .sort(function (a, b) {
        return String(a.at).localeCompare(String(b.at));
      });
    if (events.length) {
      log =
        '<div class="card ri-log"><div class="card-head"><div><div class="card-title">Riwayat</div></div>' +
        btn('Lihat PO ' + email.poNumber, 'riGoPO', { id: email.poId, cls: 'btn-ghost btn-sm' }) +
        '</div><ul class="ri-events">' +
        events
          .map(function (e) {
            return (
              '<li><span class="t-muted">' + esc(fmtTime(e.at)) + '</span> ' + esc(e.text) + '</li>'
            );
          })
          .join('') +
        '</ul></div>';
    }
    return head + check + tiles + table + log;
  }

  // ── Page plumbing ───────────────────────────────────────────────────────────
  function render() {
    if (!S.active) return;
    var root = document.getElementById('ri-root');
    if (root) {
      var tmp = document.createElement('div');
      tmp.innerHTML = pageHTML();
      root.replaceWith(tmp.firstChild);
      if (window.NSANav && typeof window.NSANav.refreshCounts === 'function') {
        window.NSANav.refreshCounts();
      }
      return;
    }
    if (typeof window.invalidateView === 'function') window.invalidateView('pickups');
    if (typeof window.navigate === 'function') window.navigate('pickups');
  }

  function open() {
    load();
    var b = window._pickupBilling;
    if (b && typeof b.leave === 'function') b.leave();
    S.active = true;
    if (typeof window.invalidateView === 'function') window.invalidateView('pickups');
    if (typeof window.navigate === 'function') window.navigate('pickups');
    if (window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive('Kotak Masuk Rekap');
    }
  }

  function runSteps(email) {
    if (reducedMotion()) {
      proc[email.id] = STEPS.length;
      return;
    }
    proc[email.id] = 0;
    var tick = function () {
      if (proc[email.id] == null) return;
      proc[email.id]++;
      if (S.active && same(S.openId, email.id)) render();
      if (proc[email.id] < STEPS.length) setTimeout(tick, STEP_MS);
    };
    setTimeout(tick, STEP_MS);
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  function check() {
    S.checkedAt = new Date().toISOString();
    if (!T()) {
      toast('Modul pengambilan belum termuat.', 'danger');
      return;
    }
    var kinds = ['clean', 'issues'];
    var kind = kinds[S.emails.length] || 'clean';
    var email = buildEmail(kind);
    if (!email && kind === 'issues') email = buildEmail('clean');
    if (!email) {
      persist();
      render();
      toast(
        'Tidak ada email baru. Simulasi butuh PO pengambilan yang masih punya surat jalan siap.',
        'info'
      );
      return;
    }
    S.emails.push(email);
    persist();
    render();
    toast('1 email baru dari ' + email.fromName, 'success');
  }

  function openEmail(id) {
    var email = emailById(id);
    if (!email) return;
    S.openId = email.id;
    if (!email.opened) {
      email.opened = true;
      persist();
      runSteps(email);
    }
    render();
    var el = document.querySelector('#ri-root .ri-detail');
    if (el && typeof el.scrollIntoView === 'function' && window.innerWidth < 900) {
      try {
        el.scrollIntoView({ block: 'start' });
      } catch (_) {
        /* ignore */
      }
    }
  }

  function fieldRows(p, r) {
    // In the DO's own words.
    var F = [
      ['doNo', 'Nomor DO', p.read.doNo],
      ['ticketNo', 'BAP', p.read.ticketNo],
      ['poNumber', 'Sales Order No (PO kita)', p.read.poNumber],
      ['date', 'Tanggal', fmtDate(p.read.date)],
      ['vehicle', 'No Truck', p.read.vehicle],
      ['gross', 'Berat Isi', fmtKg(p.read.gross)],
      ['tare', 'Berat Kosong', fmtKg(p.read.tare)],
      ['net', 'Qty (netto)', fmtKg(p.read.net)],
    ];
    return (
      F.map(function (f) {
        var c = p.conf[f[0]];
        var low = c < LOW_CONF;
        return (
          '<tr' +
          (low ? ' class="is-low"' : '') +
          '><td>' +
          esc(f[1]) +
          '</td><td class="t-num">' +
          esc(f[2]) +
          '</td><td class="t-num">' +
          Math.round(c * 100) +
          '%</td></tr>'
        );
      }).join('') +
      (r && r.excel
        ? '<tr class="ri-compare"><td>Netto di rekap Excel</td><td class="t-num">' +
          esc(fmtKg(r.excel.net)) +
          '</td><td></td></tr>'
        : '') +
      (r && r.recorded != null
        ? '<tr class="ri-compare"><td>Netto tercatat</td><td class="t-num">' +
          esc(fmtKg(r.recorded)) +
          '</td><td></td></tr>'
        : '')
    );
  }

  // The e-mail's photos as they arrive: DO and SJ photos mixed, truck by truck.
  function attachmentsOf(email) {
    var out = [];
    var sj = (email.sjPhotos || []).slice();
    email.photos.forEach(function (p) {
      out.push({ kind: 'do', photo: p });
      var i = sj.findIndex(function (s) {
        return s.trip && p.trip && s.trip.doNo === p.trip.doNo;
      });
      if (i !== -1) out.push({ kind: 'sj', photo: sj.splice(i, 1)[0] });
    });
    sj.forEach(function (s) {
      out.push({ kind: 'sj', photo: s });
    });
    return out;
  }
  function showSjPhoto(emailId, photoId) {
    var email = emailById(emailId);
    if (!email) return;
    var p = (email.sjPhotos || []).find(function (x) {
      return same(x.id, photoId);
    });
    if (!p || typeof window.openModal !== 'function') return;
    var ph = drawSjPhoto(p);
    window.openModal(
      'Foto SJ · ' + p.trip.sjBook,
      '<div class="ri-viewer"><div class="ri-viewer-img"><img src="' +
        esc(ph.url) +
        '" alt="Foto SJ ' +
        esc(p.trip.sjBook) +
        '"></div><div class="ri-viewer-side"><p class="form-hint">Surat jalan kita, difoto bersama DO. Tidak dibaca: angka yang dipakai berasal dari DO supplier.</p></div></div>',
      '<button type="button" class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  function showPhoto(emailId, photoId) {
    var email = emailById(emailId);
    if (!email) return;
    var p = email.photos.find(function (x) {
      return same(x.id, photoId);
    });
    if (!p) return;
    var ph = drawPhoto(p, email.supplier);
    var r = compare(email).find(function (x) {
      return x.key === keyOf(p.read.doNo || p.doNo);
    });
    var boxes = Object.keys(ph.boxes)
      .map(function (k) {
        var b = ph.boxes[k];
        var low = p.conf[k] < LOW_CONF;
        return (
          '<span class="ri-box' +
          (low ? ' is-low' : '') +
          '" style="left:' +
          b.x.toFixed(2) +
          '%;top:' +
          b.y.toFixed(2) +
          '%;width:' +
          b.w.toFixed(2) +
          '%;height:' +
          b.h.toFixed(2) +
          '%"></span>'
        );
      })
      .join('');
    var body =
      '<div class="ri-viewer">' +
      '<div class="ri-viewer-img"><img src="' +
      esc(ph.url) +
      '" alt="Foto DO ' +
      esc(p.doNo) +
      '"><div class="ri-boxes" id="ri-boxes">' +
      boxes +
      '</div></div>' +
      '<div class="ri-viewer-side">' +
      '<label class="ri-toggle"><input type="checkbox" id="ri-show-boxes" checked> Tandai bagian yang dibaca</label>' +
      '<table class="data-table ri-fields" data-keep-table><thead><tr><th>Bagian</th><th class="t-num">Terbaca</th><th class="t-num">Yakin</th></tr></thead><tbody>' +
      fieldRows(p, r) +
      '</tbody></table>' +
      (p.conf.net < LOW_CONF
        ? '<div class="notice notice-warning">Netto tidak terbaca dengan yakin (bayangan di atas angka). Periksa foto, atau minta foto ulang ke supplier.</div>'
        : '') +
      '<div class="form-hint">Simulasi: hasil baca dibuat bersama foto contoh ini. Pada sistem nyata, foto dikirim ke layanan pembaca dokumen (AI) dan hasilnya kembali dalam bentuk seperti tabel ini.</div>' +
      '</div></div>';
    if (typeof window.openModal === 'function') {
      window.openModal(
        'Foto DO · ' + p.doNo,
        body,
        '<button type="button" class="btn-ghost" data-action="closeModal">Tutup</button>',
        true
      );
    }
  }

  function decide(key, value) {
    var email = emailById(S.openId);
    if (!email) return;
    if (value) email.decisions[key] = value;
    else delete email.decisions[key];
    persist();
    render();
  }

  function apply(id) {
    var email = emailById(id);
    if (!email || !T()) return;
    var rows = compare(email);
    var plans = rows.map(planOf).filter(Boolean);
    if (!plans.length) return;
    var go = function () {
      // The surat jalan of each truck was found when the e-mail was checked
      // (compare → Trading.matchRecap); applying records exactly those.
      var result = { fill: [], same: [], changed: [], unmatched: [], problems: [] };
      plans.forEach(function (p) {
        var d = find('deliveryOrders', p.doId);
        if (!d) return;
        if (d.status === 'Pending') result.fill.push({ row: p.row, doId: d.id });
        else
          result.changed.push({
            row: p.row,
            doId: d.id,
            from: T().netOf(d),
            to: p.net,
            invoiced: invoicedTrip(d),
          });
      });
      var out = T().applyRecap(result, {
        source: 'Email ' + email.fileName,
        note: 'Kotak Masuk Rekap (simulasi)',
      });
      var failed = {};
      out.errors.forEach(function (e) {
        failed[keyOf(e.row.doNo || e.row.sjNo)] = e.error;
      });
      plans.forEach(function (p) {
        if (failed[p.key]) return;
        email.appliedKeys[p.key] = p.net;
        email.appliedSrc = email.appliedSrc || {};
        email.appliedSrc[p.key] = p.source;
        var d = find('deliveryOrders', p.doId);
        if (d && p.row.doNo && !d.doNo) d.doNo = p.row.doNo;
        if (d && p.photo) {
          var ph = drawPhoto(p.photo, email.supplier);
          if (ph.url) d.ticketPhoto = ph.url;
          if (p.photo.read.ticketNo) d.ticketNo = p.photo.read.ticketNo;
        }
      });
      var errors = Object.keys(failed).length;
      email.applied.push({
        at: new Date().toISOString(),
        filled: out.filled,
        changed: out.changed,
        alerts: out.alerts,
        errors: errors,
      });
      if (typeof window.saveDB === 'function') window.saveDB();
      persist();
      render();
      var msg =
        out.filled +
        ' pengambilan dicatat' +
        (out.changed ? ', ' + out.changed + ' berat diperbarui' : '') +
        (out.alerts ? ' — ' + out.alerts + ' masuk Perubahan Timbangan' : '') +
        '.';
      if (errors) {
        toast(
          msg +
            ' ' +
            errors +
            ' tidak bisa dicatat: ' +
            Object.keys(failed)
              .map(function (k) {
                return 'DO ' + k + ' (' + failed[k] + ')';
              })
              .join('; '),
          'warning'
        );
      } else toast(msg, 'success');
    };
    var invoicedChange = plans.some(function (p) {
      var r = rows.find(function (x) {
        return x.key === p.key;
      });
      return r && r.recorded != null && r.invoiced;
    });
    var text =
      'Catat ' +
      plans.length +
      ' pengambilan dari email ini?\n\n' +
      (invoicedChange
        ? 'Ada berat yang sudah ditagih ikut berubah: fakturnya tidak diubah, perubahannya masuk Perubahan Timbangan.\n\n'
        : '') +
      'Ini simulasi: angka contoh akan masuk ke data aplikasi seperti impor rekap timbangan.';
    if (typeof window.confirmAsk === 'function') {
      window.confirmAsk(text).then(function (ok) {
        if (ok) go();
      });
    } else go();
  }

  // One line per surat jalan the supplier should hear about: differences still
  // open, and figures recorded from the photo or by hand instead of the recap.
  function replyLines(rows) {
    var lines = [];
    rows.forEach(function (r) {
      var sj = 'DO ' + r.doNo;
      var date = r.excel ? fmtDate(r.excel.date) : r.photo ? fmtDate(r.photo.read.date) : '';
      var at = sj + (date ? ' (' + date + ')' : '');
      if (r.status === 'conflict') {
        lines.push(
          at +
            ': rekap ' +
            fmtT(r.excel.net) +
            ' ton, foto DO ' +
            fmtT(r.photo.read.net) +
            ' ton. Mohon dicek angka yang benar.'
        );
      } else if (r.status === 'excelChanged') {
        lines.push(
          at +
            ': di rekap ini ' +
            fmtT(r.excel.net) +
            ' ton, sebelumnya ' +
            fmtT(r.recorded) +
            ' ton' +
            (r.invoiced ? ' dan sudah kami tagihkan' : '') +
            '; foto DO menunjukkan ' +
            fmtT(r.photo.read.net) +
            ' ton. Mohon penjelasan perubahan ini.'
        );
      } else if (r.status === 'unclear') {
        lines.push(at + ': foto DO kurang jelas di bagian berat. Mohon kirim ulang fotonya.');
      } else if (r.status === 'noPhoto') {
        lines.push(at + ': belum ada foto DO. Mohon dikirimkan.');
      } else if (r.status === 'noExcel') {
        lines.push(at + ': ada foto DO, tetapi tidak ada di rekap. Mohon dilengkapi.');
      } else if (r.status === 'unknown') {
        lines.push(sj + ': nomor PO dan DO ini tidak kami kenali. Mohon dicek.');
      } else if (r.status === 'void') {
        lines.push(sj + ': surat jalan ini sudah dibatalkan di tempat kami.');
      } else if (r.status === 'applied' && r.excel && !eq(r.excel.net, r.recorded)) {
        lines.push(
          at +
            ': rekap ' +
            fmtT(r.excel.net) +
            ' ton, ' +
            (r.appliedSrc === 'manual' ? 'dari foto DO kami baca ' : 'foto DO ') +
            fmtT(r.recorded) +
            ' ton; kami catat ' +
            fmtT(r.recorded) +
            ' ton sesuai foto DO. Mohon rekap diperbaiki.'
        );
      } else if (
        r.status === 'applied' &&
        r.appliedSrc === 'excel' &&
        r.photo &&
        r.photo.conf.net < LOW_CONF
      ) {
        lines.push(
          at +
            ': foto DO kurang jelas di bagian berat; kami catat ' +
            fmtT(r.recorded) +
            ' ton sesuai rekap. Mohon kirim ulang foto untuk arsip.'
        );
      }
    });
    return lines;
  }

  function replyText(email, rows) {
    var lines = replyLines(rows);
    return [
      'Yth. ' + email.fromName + ',',
      '',
      'Terima kasih atas rekap ' +
        fmtDate(email.period.from) +
        ' s/d ' +
        fmtDate(email.period.to) +
        '. Ada yang perlu kami konfirmasi:',
      '',
    ]
      .concat(
        lines.map(function (l, i) {
          return i + 1 + '. ' + l;
        })
      )
      .concat(['', 'Pengambilan lain sudah kami catat.', '', 'Salam,', companyName()])
      .join('\n');
  }

  function askReply(id) {
    var email = emailById(id);
    if (!email) return;
    var text = replyText(email, compare(email));
    var body =
      '<div class="form-group"><label class="form-label">Kepada</label><input class="form-input" id="ri-reply-to" value="' +
      esc(email.fromName + (email.fromEmail ? ' <' + email.fromEmail + '>' : '')) +
      '" readonly></div>' +
      '<div class="form-group"><label class="form-label">Subjek</label><input class="form-input" id="ri-reply-subject" value="' +
      esc('Re: ' + email.subject) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Pesan</label><textarea class="form-input ri-reply-body" id="ri-reply-body" rows="12">' +
      esc(text) +
      '</textarea></div>' +
      '<div class="form-hint">Simulasi: pesan disimpan di riwayat email ini, tidak benar-benar dikirim.</div>';
    if (typeof window.openModal === 'function') {
      window.openModal(
        'Balas ke supplier',
        body,
        '<button type="button" class="btn-ghost" data-action="closeModal">Batal</button>' +
          '<button type="button" class="btn" data-action="riSendReply" data-id="' +
          esc(email.id) +
          '">Kirim balasan</button>'
      );
    }
  }

  function sendReply(id) {
    var email = emailById(id);
    if (!email) return;
    var subject =
      (document.getElementById('ri-reply-subject') || {}).value || 'Re: ' + email.subject;
    var body = (document.getElementById('ri-reply-body') || {}).value || '';
    email.replies.push({ at: new Date().toISOString(), subject: subject, body: body });
    persist();
    if (typeof window.closeModal === 'function') window.closeModal();
    render();
    toast('Balasan tersimpan (simulasi — tidak ada email yang dikirim).', 'success');
  }

  function howItWorks() {
    var steps = [
      [
        'Supplier mengirim email',
        'Seperti sekarang: bagian timbangan mengirim rekap Excel dan foto DO lewat email, dengan format subjek yang tetap. Bedanya, email dikirim (atau diteruskan) ke alamat rekap yang tersambung ke aplikasi.',
      ],
      [
        'Server menerima',
        'Email dari pengirim yang terdaftar diterima server aplikasi; lampirannya disimpan bersama data perusahaan.',
      ],
      [
        'Excel dibaca',
        'Memakai pembaca yang sama dengan Impor Rekap Timbangan: No SJ, tanggal, no polisi, bruto, tara, netto.',
      ],
      [
        'Foto dibaca',
        'Layanan pembaca dokumen (AI) membaca nomor SJ, tanggal, no polisi, dan berat di foto, beserta tingkat keyakinannya.',
      ],
      [
        'Dicocokkan',
        'Per surat jalan: foto vs rekap vs yang sudah tercatat. Yang sama siap dicatat; yang berbeda ditahan.',
      ],
      [
        'Admin memutuskan',
        'Satu klik untuk yang cocok; yang berbeda dipilih angkanya atau ditanyakan ke supplier lewat balasan email.',
      ],
    ];
    var body =
      '<ol class="ri-how">' +
      steps
        .map(function (s) {
          return '<li><strong>' + esc(s[0]) + '</strong><span>' + esc(s[1]) + '</span></li>';
        })
        .join('') +
      '</ol>' +
      '<div class="notice notice-info">Di simulasi ini langkah 1, 2, dan 4 diperagakan: email dan hasil baca foto dibuat dari data PO pengambilan. ' +
      'Langkah 3, 5, dan 6 berjalan seperti aslinya. Untuk sistem nyata dibutuhkan: alamat email khusus rekap, contoh rekap dan foto asli dari supplier, ' +
      'dan persetujuan biaya layanan pembaca foto.</div>';
    if (typeof window.openModal === 'function') {
      window.openModal(
        'Cara kerja Kotak Masuk Rekap',
        body,
        '<button type="button" class="btn-ghost" data-action="closeModal">Tutup</button>',
        true
      );
    }
  }

  function reset() {
    var go = function () {
      S.emails = [];
      S.openId = null;
      S.checkedAt = '';
      S.seq = 0;
      excelCache = {};
      proc = {};
      photos = {};
      persist();
      render();
      toast('Kotak masuk simulasi dikosongkan. Pengambilan yang sudah dicatat tetap ada.', 'info');
    };
    if (typeof window.confirmAsk === 'function') {
      window
        .confirmAsk(
          'Kosongkan kotak masuk simulasi?\n\nEmail contoh dihapus dari browser ini. Pengambilan yang sudah dicatat dari email tetap ada di data.'
        )
        .then(function (ok) {
          if (ok) go();
        });
    } else go();
  }

  var ACTIONS = {
    riCheck: check,
    riOpen: function (b) {
      openEmail(b.getAttribute('data-id'));
    },
    riPhoto: function (b) {
      showPhoto(b.getAttribute('data-id'), b.getAttribute('data-photo'));
    },
    riSjPhoto: function (b) {
      showSjPhoto(b.getAttribute('data-id'), b.getAttribute('data-photo'));
    },
    riExcel: function (b) {
      var e = emailById(b.getAttribute('data-id'));
      if (e) downloadExcel(e);
    },
    saveRecapEmail: function (b) {
      apply(b.getAttribute('data-id'));
    },
    riReply: function (b) {
      askReply(b.getAttribute('data-id'));
    },
    riSendReply: function (b) {
      sendReply(b.getAttribute('data-id'));
    },
    riHow: howItWorks,
    riReset: reset,
    riManual: function () {
      var pv = window._pickupView;
      if (pv && typeof pv.openRecapImport === 'function') pv.openRecapImport();
    },
    riGoPO: function (b) {
      var pv = window._pickupView;
      if (pv && typeof pv.openPO === 'function') pv.openPO(b.getAttribute('data-id'));
    },
  };

  // "ri…" actions are this page's own (also in the dialogs it opens); the
  // write action answers only inside the page.
  function inScope(el, action) {
    if (!el || !el.closest) return false;
    return /^ri[A-Z]/.test(action) || !!el.closest('#ri-root');
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!b || !inScope(b, b.getAttribute('data-action') || '')) return;
    var fn = ACTIONS[b.getAttribute('data-action')];
    if (!fn || b.disabled) return;
    e.preventDefault();
    fn(b);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.id === 'ri-show-boxes') {
      var boxes = document.getElementById('ri-boxes');
      if (boxes) boxes.hidden = !t.checked;
      return;
    }
    if (!t.closest('#ri-root')) return;
    if (t.classList.contains('ri-choice')) decide(t.getAttribute('data-key'), t.value);
    else if (t.classList.contains('ri-manual')) {
      var email = emailById(S.openId);
      if (!email) return;
      email.manual[t.getAttribute('data-key')] = t.value;
      persist();
      render();
    }
  });

  load();

  window._recapInbox = {
    open: open,
    isActive: function () {
      return S.active;
    },
    html: pageHTML,
    afterRender: function () {},
    leave: function () {
      S.active = false;
    },
    // E-mails that still need someone: unopened, waiting for a choice, or
    // with trips ready to record (Ringkasan → Perlu tindakan, menu count).
    waiting: function () {
      return T() ? waiting() : 0;
    },
    // For tests.
    _compare: compare,
    _build: buildEmail,
    _aoa: aoaOf,
    _state: S,
  };
})();
