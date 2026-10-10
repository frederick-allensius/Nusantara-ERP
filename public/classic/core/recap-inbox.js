// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Kotak Masuk Rekap (simulation)  (recap-inbox.js)
//
// How the pickup flow works once the weighbridge recap arrives by e-mail: the
// supplier sends its recap (Excel) and photos of the weighbridge tickets; the
// system reads the Excel, reads each photo (computer vision: SJ number, date,
// truck, bruto/tara/netto) and checks three sources against each other — the
// photo, the Excel and what is recorded in the app — before anything is
// recorded. Matching trips are recorded in one step; differences are held for a
// decision and can be sent back to the supplier.
//
// SIMULATION: there is no mailbox and no vision service. "Periksa email" builds
// an e-mail from the pickup POs in the app: a real .xlsx (SheetJS) that goes
// through the same reader as Impor Rekap Timbangan (Trading.recapRowsFromAoa),
// and ticket photos drawn on a canvas whose "reading" is generated with them.
// Applying goes through Trading.matchRecap / applyRecap like a manual import, so
// trips, weight history, alerts (Perubahan Timbangan) and journals are real.
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

  var STORE_KEY = 'nsa.recapInbox.v1';
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

  var S = { active: false, emails: [], openId: null, checkedAt: '', seq: 0 };
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
    return {
      name: (s && s.name) || po.supplier || po.supplierName || 'Supplier',
      email: (s && s.email) || '',
    };
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
          JSON.stringify({ emails: S.emails, checkedAt: S.checkedAt, seq: S.seq })
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
  function slotBySj(sjNo) {
    var key = String(sjNo || '')
      .trim()
      .toUpperCase();
    if (!key) return null;
    return (
      (db().deliveryOrders || []).find(function (d) {
        return (
          T().isPickup(d) &&
          String(d.sjNo || '')
            .trim()
            .toUpperCase() === key
        );
      }) || null
    );
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
    ['sjNo', 'date', 'vehicle', 'gross', 'tare', 'net', 'ticketNo'].forEach(function (f) {
      c[f] = Math.round((0.93 + rand() * 0.065) * 100) / 100;
    });
    return c;
  }

  // A trip as it appears on the ticket: the values the weighbridge printed.
  function newTrip(rand, po, slot, date, net, ticketBase, i) {
    var w = weights(rand, net);
    var t = clock(rand);
    return {
      sjNo: slot.sjNo,
      poNumber: slot.poNumber || poNo(po),
      date: date,
      vehicle: plateFor(rand),
      driver: pick(rand, DRIVERS),
      itemName: slot.lines && slot.lines[0] ? slot.lines[0].itemName : lineOf(po).itemName,
      customer: slot.customer || '',
      gross: w.gross,
      tare: w.tare,
      net: w.net,
      ticketNo: 'DO-' + (ticketBase + i),
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
      vehicle: d.vehicle || plateFor(rand),
      driver: d.driver || pick(rand, DRIVERS),
      itemName: d.lines && d.lines[0] ? d.lines[0].itemName : lineOf(po).itemName,
      customer: d.customer || '',
      gross: w.gross != null ? r2(w.gross) : r2(tare + net),
      tare: tare,
      net: net,
      ticketNo: d.ticketNo || 'DO-' + (40000 + Math.floor(rand() * 9000)),
      timeIn: t.in,
      timeOut: t.out,
    };
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
    var ticketBase = 41000 + Math.floor(rand() * 8000);
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
      trips.push({ role: roles[i], trip: newTrip(rand, po, p.slot, p.date, p.net, ticketBase, i) });
    });
    trips.sort(function (a, b) {
      return String(a.trip.date).localeCompare(String(b.trip.date));
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
    trips.forEach(function (x, i) {
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
        sjNo: t.sjNo,
        date: t.date,
        vehicle: t.vehicle,
        gross: t.gross,
        tare: t.tare,
        net: t.net,
        ticketNo: t.ticketNo,
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
        trip: t,
        read: read,
        conf: conf,
        blurry: x.role === 'unclear',
      });
    });

    S.seq++;
    var stamp = String(S.seq).padStart(3, '0');
    var fileName =
      'Rekap Timbangan ' +
      sup.name +
      ' ' +
      fmtDate(from).replace(/\//g, '-') +
      ' sd ' +
      fmtDate(to).replace(/\//g, '-') +
      '.xlsx';
    return {
      id: 'em-' + seed + '-' + stamp,
      kind: kind,
      seed: seed,
      receivedAt: new Date().toISOString(),
      opened: false,
      poId: po.id,
      poNumber: poNo(po),
      supplier: sup.name,
      fromName: 'Bagian Timbangan ' + sup.name,
      fromEmail: sup.email,
      to: inboxAddress(),
      subject: 'Rekap timbangan ' + item + ' ' + fmtDate(from) + ' – ' + fmtDate(to),
      body: [
        'Selamat siang,',
        'Terlampir rekap timbangan pengambilan ' +
          item +
          ' untuk PO ' +
          poNo(po) +
          ' periode ' +
          fmtDate(from) +
          ' s/d ' +
          fmtDate(to) +
          ', beserta foto DO per truk.',
        'Terima kasih.',
      ],
      period: { from: from, to: to },
      fileName: fileName,
      title: sup.name,
      rows: excelRows,
      photos: photoList,
      decisions: {},
      manual: {},
      applied: [],
      appliedKeys: {},
      replies: [],
    };
  }

  // ── The Excel attachment (a real .xlsx) ─────────────────────────────────────
  function aoaOf(email) {
    var head = [
      'No',
      'Tanggal',
      'No SJ',
      'No PO',
      'No Polisi',
      'Sopir',
      'Barang',
      'Bruto',
      'Tara',
      'Netto',
    ];
    var sum = { g: 0, t: 0, n: 0 };
    var body = email.rows.map(function (r, i) {
      sum.g += num(r.gross);
      sum.t += num(r.tare);
      sum.n += num(r.net);
      return [
        i + 1,
        fmtDate(r.date),
        r.sjNo,
        r.poNumber,
        r.vehicle,
        r.driver,
        r.itemName,
        r.gross,
        r.tare,
        r.net,
      ];
    });
    return [
      ['REKAP TIMBANGAN'],
      [String(email.title || '').toUpperCase()],
      ['Periode ' + fmtDate(email.period.from) + ' s/d ' + fmtDate(email.period.to)],
      [],
      head,
    ]
      .concat(body)
      .concat([[], ['', '', '', '', '', '', 'TOTAL', r2(sum.g), r2(sum.t), r2(sum.n)]]);
  }
  function workbook(email) {
    var X = window.XLSX;
    var ws = X.utils.aoa_to_sheet(aoaOf(email));
    ws['!cols'] = [4, 11, 20, 18, 12, 10, 18, 8, 8, 8].map(function (w) {
      return { wch: w };
    });
    var wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Rekap Timbangan');
    return wb;
  }
  // The rows as the app reads them: the .xlsx is written and read back through
  // the Impor Rekap Timbangan reader, as an attachment would be.
  function excelRows(email) {
    if (excelCache[email.id]) return excelCache[email.id];
    var X = window.XLSX;
    var aoa = aoaOf(email);
    if (X) {
      try {
        var buf = X.write(workbook(email), { bookType: 'xlsx', type: 'array' });
        var wb = X.read(new Uint8Array(buf), { type: 'array' });
        aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
          raw: true,
          defval: '',
        });
      } catch (_) {
        /* read the sheet's rows as written */
      }
    }
    var rows = T() ? T().recapRowsFromAoa(aoa) : [];
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

  // ── The ticket photo (drawn) ────────────────────────────────────────────────
  // A printed weighbridge ticket on a desk, photographed at a slight angle, the
  // SJ number written on it by hand. Field boxes are kept for the overlay that
  // shows what the reader found (as % of the image).
  function drawPhoto(p, supplier) {
    if (photos[p.id]) return photos[p.id];
    var W = 720;
    var H = 960;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var g = cv.getContext && cv.getContext('2d');
    if (!g) return { url: '', boxes: {} };
    var rand = rng(p.seed);
    // Desk
    var desk = g.createLinearGradient(0, 0, W, H);
    desk.addColorStop(0, '#5a4636');
    desk.addColorStop(1, '#3a2d23');
    g.fillStyle = desk;
    g.fillRect(0, 0, W, H);
    for (var k = 0; k < 90; k++) {
      g.strokeStyle = 'rgba(0,0,0,' + (0.04 + rand() * 0.06) + ')';
      g.lineWidth = 1 + rand() * 2;
      var y0 = rand() * H;
      g.beginPath();
      g.moveTo(0, y0);
      g.bezierCurveTo(
        W * 0.3,
        y0 + rand() * 30 - 15,
        W * 0.7,
        y0 + rand() * 30 - 15,
        W,
        y0 + rand() * 20 - 10
      );
      g.stroke();
    }
    // Paper
    var PW = 470;
    var PH = 760;
    var angle = (rand() * 5 - 2.5) * (Math.PI / 180);
    var cx = W / 2 + (rand() * 30 - 15);
    var cy = H / 2 + (rand() * 24 - 12);
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 26;
    g.shadowOffsetX = 8;
    g.shadowOffsetY = 12;
    g.fillStyle = '#f3efe4';
    g.fillRect(-PW / 2, -PH / 2, PW, PH);
    g.shadowColor = 'transparent';
    var boxes = {};
    function mark(key, x, y, w, h) {
      // Paper coordinates → image %, as the axis-aligned box of the turned rect.
      var pts = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map(function (q) {
        var px = q[0] - PW / 2;
        var py = q[1] - PH / 2;
        return [
          cx + px * Math.cos(angle) - py * Math.sin(angle),
          cy + px * Math.sin(angle) + py * Math.cos(angle),
        ];
      });
      var xs = pts.map(function (q) {
        return q[0];
      });
      var ys = pts.map(function (q) {
        return q[1];
      });
      var x0 = Math.min.apply(null, xs) - 4;
      var y0b = Math.min.apply(null, ys) - 4;
      boxes[key] = {
        x: (x0 / W) * 100,
        y: (y0b / H) * 100,
        w: ((Math.max.apply(null, xs) + 4 - x0) / W) * 100,
        h: ((Math.max.apply(null, ys) + 4 - y0b) / H) * 100,
      };
    }
    g.translate(-PW / 2, -PH / 2);
    var t = p.trip;
    var mono = '"Courier New", Courier, monospace';
    var ink = '#2a2a2a';
    var line = function (y) {
      g.strokeStyle = 'rgba(40,40,40,0.55)';
      g.setLineDash([4, 3]);
      g.beginPath();
      g.moveTo(26, y);
      g.lineTo(PW - 26, y);
      g.stroke();
      g.setLineDash([]);
    };
    var text = function (s, x, y, font, color, align) {
      g.font = font;
      g.fillStyle = color || ink;
      g.textAlign = align || 'left';
      g.fillText(s, x, y);
      return g.measureText(s).width;
    };
    text(String(supplier || '').toUpperCase(), PW / 2, 58, 'bold 21px ' + mono, ink, 'center');
    text('BAGIAN TIMBANGAN', PW / 2, 84, '15px ' + mono, ink, 'center');
    line(102);
    text('DELIVERY ORDER', 30, 132, 'bold 17px ' + mono);
    var wT = text('No ' + t.ticketNo, PW - 30, 132, 'bold 17px ' + mono, ink, 'right');
    mark('ticketNo', PW - 30 - wT, 114, wT, 24);
    var rows = [
      ['Tanggal', fmtDate(t.date).replace(/\//g, '-'), 'date'],
      ['No PO', t.poNumber],
      ['Jam Masuk', t.timeIn + '   Keluar ' + t.timeOut],
      ['No Polisi', t.vehicle, 'vehicle'],
      ['Sopir', t.driver],
      ['Barang', t.itemName],
      ['Tujuan', t.customer || '-'],
    ];
    var y = 170;
    rows.forEach(function (r) {
      text(r[0], 30, y, '15px ' + mono);
      text(':', 150, y, '15px ' + mono);
      var w = text(String(r[1] || '').slice(0, 26), 166, y, '15px ' + mono);
      if (r[2]) mark(r[2], 166, y - 16, w, 21);
      y += 30;
    });
    line(y - 8);
    y += 30;
    var blurStart = y - 26;
    [
      ['BRUTO', t.gross, 'gross'],
      ['TARA', t.tare, 'tare'],
      ['NETTO', t.net, 'net'],
    ].forEach(function (r) {
      text(r[0], 30, y, 'bold 20px ' + mono);
      text(':', 150, y, 'bold 20px ' + mono);
      var s = Math.round(r[1] * 1000).toLocaleString('id-ID') + ' kg';
      var w = text(s, PW - 40, y, 'bold 24px ' + mono, ink, 'right');
      mark(r[2], PW - 40 - w, y - 22, w, 28);
      y += 42;
    });
    var blurEnd = y - 18;
    line(y - 14);
    y += 34;
    text('Operator', 70, y + 60, '14px ' + mono);
    text('Sopir', PW - 110, y + 60, '14px ' + mono);
    // Signatures
    g.strokeStyle = 'rgba(30,30,60,0.75)';
    g.lineWidth = 1.6;
    [60, PW - 130].forEach(function (sx) {
      g.beginPath();
      g.moveTo(sx, y + 34);
      for (var s = 0; s < 6; s++) {
        g.quadraticCurveTo(
          sx + 10 + s * 12,
          y + 10 + rand() * 30,
          sx + 18 + s * 12,
          y + 30 + rand() * 8
        );
      }
      g.stroke();
    });
    // Stamp
    g.save();
    g.translate(PW - 120, y + 10);
    g.rotate(-0.25);
    g.strokeStyle = 'rgba(160,40,60,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 46, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 36, 0, Math.PI * 2);
    g.stroke();
    text('TIMBANGAN', 0, -6, 'bold 11px Arial, sans-serif', 'rgba(160,40,60,0.6)', 'center');
    text('OK', 0, 14, 'bold 16px Arial, sans-serif', 'rgba(160,40,60,0.6)', 'center');
    g.restore();
    // Our SJ number written on the ticket by hand.
    var hand = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
    g.save();
    g.translate(30, PH - 92);
    g.rotate(-0.04);
    var wl = text('SJ:', 0, 0, '22px ' + hand, '#1d3a8a');
    var ws = text(t.sjNo, wl + 10, 0, 'bold 22px ' + hand, '#1d3a8a');
    g.restore();
    mark('sjNo', 30 + wl + 6, PH - 92 - 26, ws + 8, 36);
    // A shadow over the figures, as when the photo was taken in a hurry.
    if (p.blurry) {
      var sh = g.createLinearGradient(0, blurStart, 0, blurEnd + 20);
      sh.addColorStop(0, 'rgba(20,16,12,0.05)');
      sh.addColorStop(0.5, 'rgba(20,16,12,0.5)');
      sh.addColorStop(1, 'rgba(20,16,12,0.15)');
      g.fillStyle = sh;
      g.fillRect(0, blurStart, PW, blurEnd - blurStart + 30);
    }
    g.restore();
    // Light falloff
    var light = g.createRadialGradient(W * 0.45, H * 0.4, 80, W / 2, H / 2, W * 0.85);
    light.addColorStop(0, 'rgba(255,248,230,0.06)');
    light.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);
    var out = cv;
    if (p.blurry && typeof g.filter === 'string' && boxes.gross && boxes.net) {
      // Shaken over the figures only: the rest of the ticket stays readable.
      var c2 = document.createElement('canvas');
      c2.width = W;
      c2.height = H;
      var g2 = c2.getContext('2d');
      g2.filter = 'blur(2.6px)';
      g2.drawImage(cv, 0, 0);
      var bx = (Math.min(boxes.gross.x, boxes.net.x) / 100) * W - 260;
      var by = (boxes.gross.y / 100) * H - 24;
      var bw =
        (Math.max(boxes.gross.x + boxes.gross.w, boxes.net.x + boxes.net.w) / 100) * W - bx + 16;
      var bh = ((boxes.net.y + boxes.net.h) / 100) * H - by + 24;
      g.drawImage(c2, bx, by, bw, bh, bx, by, bw, bh);
    }
    var url = '';
    try {
      url = out.toDataURL('image/jpeg', 0.72);
    } catch (_) {
      url = '';
    }
    photos[p.id] = { url: url, boxes: boxes };
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
      label: 'SJ tidak dikenal',
      kind: 'danger',
      note: 'Nomor surat jalan tidak ada di aplikasi',
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

  function compare(email) {
    var byKey = {};
    var order = [];
    function slot(sjNo) {
      var k = keyOf(sjNo);
      if (!byKey[k]) {
        byKey[k] = { key: k, sjNo: sjNo, excel: null, photo: null };
        order.push(k);
      }
      return byKey[k];
    }
    excelRows(email).forEach(function (r) {
      if (r.sjNo) slot(r.sjNo).excel = r;
    });
    email.photos.forEach(function (p) {
      slot(p.read.sjNo || p.sjNo).photo = p;
    });
    return order.map(function (k) {
      return classify(byKey[k], email);
    });
  }

  function classify(x, email) {
    var d = slotBySj(x.sjNo);
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
    return {
      key: x.key,
      sjNo: x.sjNo,
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
      source: src,
      net: net,
      row: {
        row: 0,
        sjNo: r.sjNo,
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
      '<div class="sec-hdr"><div><h1>Kotak Masuk Rekap</h1>' +
      '<p>Rekap timbangan dan foto DO dari email supplier, diperiksa otomatis sebelum dicatat.</p></div>' +
      '<div class="pv-hdr-actions">' +
      actions +
      '</div></div>' +
      '<div class="notice notice-info ri-sim"><div><strong>Simulasi.</strong> Email dan pembacaan foto ' +
      'disimulasikan dari data PO pengambilan di aplikasi; belum terhubung ke kotak email sungguhan. ' +
      'Yang dicatat lewat halaman ini masuk ke data aplikasi seperti impor rekap biasa. ' +
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
          e.photos.length +
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
      '</div><div class="ri-empty-text">Setiap email berisi rekap Excel dan foto DO supplier. ' +
      'Sistem membaca keduanya, mencocokkan dengan surat jalan di aplikasi, lalu menahan yang berbeda.</div></div>'
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
      '1 file Excel, ' + email.photos.length + ' foto',
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
        '" aria-label="Keputusan untuk ' +
        esc(r.sjNo) +
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
            '" placeholder="Netto (ton)" aria-label="Netto dari foto untuk ' +
            esc(r.sjNo) +
            '">'
          : '');
    } else if (r.status === 'match' || r.status === 'update') {
      decision = '<span class="t-muted">Dicatat saat diterapkan</span>';
    } else {
      decision = '<span class="t-muted">—</span>';
    }
    return (
      '<tr class="ri-row is-' +
      r.status +
      '">' +
      '<td data-cell="title"><span class="doc-no">' +
      esc(r.sjNo) +
      '</span><span class="ri-fig-sub">' +
      esc([fmtDate(t.date), t.vehicle].filter(Boolean).join(' · ')) +
      '</span></td>' +
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
      '">' +
      esc(st.label) +
      '</span><span class="ri-fig-sub">' +
      esc(st.note) +
      '</span></td>' +
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
      email.photos
        .map(function (p) {
          var ph = drawPhoto(p, email.supplier);
          return (
            '<button type="button" class="ri-thumb" data-action="riPhoto" data-id="' +
            esc(email.id) +
            '" data-photo="' +
            esc(p.id) +
            '" title="Foto DO ' +
            esc(p.sjNo) +
            '"><img src="' +
            esc(ph.url) +
            '" alt="Foto DO ' +
            esc(p.sjNo) +
            '"><span>' +
            esc(p.sjNo) +
            '</span></button>'
          );
        })
        .join('') +
      '</div></div></div>';

    var check =
      '<div class="card ri-check"><div class="card-head"><div><div class="card-title">Pemeriksaan otomatis</div>' +
      '<div class="card-sub">Rekap Excel, foto DO, dan catatan di aplikasi dibandingkan per surat jalan</div></div></div>' +
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
      '<div class="card ri-result"><div class="card-head"><div><div class="card-title">Hasil per surat jalan</div>' +
      '<div class="card-sub">Angka dalam ton. Klik angka foto untuk melihat foto dan bagian yang dibaca.</div></div></div>' +
      '<div class="table-wrap"><table class="data-table list-cards ri-table"><thead><tr>' +
      '<th>Surat jalan</th><th class="t-num">Tercatat</th><th class="t-num">Rekap Excel</th>' +
      '<th class="t-num">Foto DO</th><th>Hasil</th><th>Keputusan</th></tr></thead><tbody>' +
      rows
        .map(function (r) {
          return rowHTML(r, email);
        })
        .join('') +
      '</tbody></table></div>' +
      '<div class="ri-foot">' +
      (hasIssues ? btn('Balas ke supplier', 'riReply', { id: email.id }) : '') +
      btn(
        s.ready ? 'Catat ' + s.ready + ' pengambilan' : 'Tidak ada yang perlu dicatat',
        'saveRecapEmail',
        {
          cls: 'btn',
          id: email.id,
          disabled: !s.ready,
        }
      ) +
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
    var F = [
      ['sjNo', 'No. SJ (tulisan tangan)', p.read.sjNo],
      ['date', 'Tanggal', fmtDate(p.read.date)],
      ['vehicle', 'No. polisi', p.read.vehicle],
      ['gross', 'Bruto', fmtKg(p.read.gross)],
      ['tare', 'Tara', fmtKg(p.read.tare)],
      ['net', 'Netto', fmtKg(p.read.net)],
      ['ticketNo', 'No. DO', p.read.ticketNo],
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

  function showPhoto(emailId, photoId) {
    var email = emailById(emailId);
    if (!email) return;
    var p = email.photos.find(function (x) {
      return same(x.id, photoId);
    });
    if (!p) return;
    var ph = drawPhoto(p, email.supplier);
    var r = compare(email).find(function (x) {
      return x.key === keyOf(p.read.sjNo || p.sjNo);
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
      esc(p.sjNo) +
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
        'Foto DO · ' + p.sjNo,
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
      var result = T().matchRecap(
        plans.map(function (p) {
          return p.row;
        })
      );
      var out = T().applyRecap(result, {
        source: 'Email ' + email.fileName,
        note: 'Kotak Masuk Rekap (simulasi)',
      });
      var failed = {};
      out.errors.forEach(function (e) {
        failed[keyOf(e.row.sjNo)] = e.error;
      });
      result.unmatched.concat(result.problems).forEach(function (m) {
        failed[keyOf(m.row.sjNo)] = m.reason;
      });
      plans.forEach(function (p) {
        if (failed[p.key]) return;
        email.appliedKeys[p.key] = p.net;
        email.appliedSrc = email.appliedSrc || {};
        email.appliedSrc[p.key] = p.source;
        var d = slotBySj(p.row.sjNo);
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
                return k + ' (' + failed[k] + ')';
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
      var sj = r.sjNo;
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
        lines.push(sj + ': nomor surat jalan ini tidak kami kenali. Mohon dicek.');
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
    _state: S,
  };
})();
