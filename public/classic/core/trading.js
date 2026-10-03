// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Trading pickups  (trading.js)
//
// The company is a trader: a customer PO (Sales Order) is matched by a supplier PO
// (Purchase Order) for the same goods, and the customer's trucks pick the goods
// up at the supplier in many trips over days or weeks. Each trip is weighed at the
// supplier's weighbridge and travels with one of our Surat Jalan (SJ).
//
// Model — no new collection:
//   • A pickup PO carries `pickupFlow` { soId, capacity, maxTrips, cutoff }. Opening
//     it creates its SJ slots up front: ceil(PO qty / truck capacity) delivery
//     orders with `pickup: true`, status 'Pending', numbered "<PO number>/01…".
//     The slots are what the weighbridge receives; a PO never gets more SJs.
//   • A slot becomes a trip when it is picked up: date, truck, driver, weighbridge
//     netto (bruto − tara), status 'Delivered'. The SO price is the selling price;
//     the purchase price is the supplier's price in effect on the trip date
//     (Harga Supplier), falling back to the PO price.
//   • A pickup PO closes at its quota (PO qty) or at its cut-off date (end of the
//     PO's month by default); unused slots are voided ('Cancelled').
//   • Customers are invoiced per period from their trips (weekly, typically) and
//     suppliers invoice per period too, so one PO has several invoices on each
//     side. An invoice lists its trips in `doIds`.
//   • Weighbridge recaps (Excel) are matched to trips by SJ number, else by date +
//     truck; a changed weight on a trip that is already invoiced raises an alert
//     that stays until someone resolves it.
//
// Accounting (gl.js buildPickupJournals): each trip posts the purchase (inventory,
// PPN Masukan, payable) unless a supplier invoice covers it, the cost of sales at
// the purchase price, and the sale (receivable, sales, PPN Keluaran) unless a
// customer invoice covers it. Goods pass straight from supplier to customer, so
// stock quantities do not move and inventory nets to zero per trip.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.Trading.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var DEFAULT_CAPACITY = 35;

  function db() {
    return window.DB || {};
  }
  function arr(key) {
    var d = db();
    if (!Array.isArray(d[key])) d[key] = [];
    return d[key];
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
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function monthEnd(dateStr) {
    var y = Number(String(dateStr).slice(0, 4));
    var m = Number(String(dateStr).slice(5, 7));
    var last = new Date(y, m, 0).getDate();
    return y + '-' + pad2(m) + '-' + pad2(last);
  }
  function addDays(dateStr, n) {
    var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function currentUser() {
    var u = window.__ERP_USER || {};
    return (
      u.displayName ||
      u.username ||
      (db().settings && db().settings.user && db().settings.user.name) ||
      ''
    );
  }
  function plate(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }
  function find(coll, id) {
    return (
      (db()[coll] || []).find(function (d) {
        return same(d.id, id);
      }) || null
    );
  }

  function settings() {
    var s = db().settings || {};
    return s.trading || {};
  }
  function defaultCapacity() {
    return num(settings().truckCapacity) || DEFAULT_CAPACITY;
  }

  // ── Identification ─────────────────────────────────────────────────────────
  function isPickup(d) {
    return !!d && d.pickup === true;
  }
  function isPickupOrder(o) {
    return !!o && !!o.pickupFlow;
  }
  function isTrip(d) {
    // A slot that has been picked up (weighed). Voided and unused slots are not trips.
    return isPickup(d) && d.status !== 'Pending' && d.status !== 'Cancelled' && netOf(d) > 0;
  }
  function netOf(d) {
    var w = (d && d.weighing) || {};
    if (w.net != null && w.net !== '') return r3(w.net);
    return r3(
      ((d && d.lines) || []).reduce(function (s, l) {
        return s + num(l.qty);
      }, 0)
    );
  }

  function slotsFor(poId) {
    return (db().deliveryOrders || [])
      .filter(function (d) {
        return isPickup(d) && same(d.poId, poId);
      })
      .sort(function (a, b) {
        return num(a.slotNo) - num(b.slotNo);
      });
  }
  function tripsForSO(soId) {
    return (db().deliveryOrders || []).filter(function (d) {
      return isTrip(d) && same(d.soId, soId);
    });
  }

  function orderLine(o) {
    var lines = (o && (o.lines || o.items)) || [];
    return lines[0] || null;
  }

  // ── Quota / cut-off ────────────────────────────────────────────────────────
  function usage(po, asOf) {
    asOf = asOf || todayISO();
    var flow = (po && po.pickupFlow) || {};
    var line = orderLine(po) || {};
    var slots = slotsFor(po.id);
    var trips = slots.filter(isTrip);
    var taken = r3(
      trips.reduce(function (s, d) {
        return s + netOf(d);
      }, 0)
    );
    var ordered = r3(num(line.qty));
    var open = slots.filter(function (d) {
      return d.status === 'Pending';
    });
    var cutoff = flow.cutoff || (po.date ? monthEnd(po.date) : '');
    return {
      ordered: ordered,
      taken: taken,
      remaining: r3(Math.max(0, ordered - taken)),
      over: r3(Math.max(0, taken - ordered)),
      tripsMax: num(flow.maxTrips) || slots.length,
      tripsUsed: trips.length,
      tripsOpen: open.length,
      cutoff: cutoff,
      pastCutoff: !!cutoff && asOf > cutoff,
      full: ordered > 0 && taken >= ordered,
      closed: po.status === 'Closed',
      unit: line.unit || '',
    };
  }

  function planTrips(qty, capacity) {
    var q = num(qty);
    var c = num(capacity) || defaultCapacity();
    return Math.max(1, Math.ceil(q / c - 1e-9));
  }

  // ── Prices ─────────────────────────────────────────────────────────────────
  // The supplier's price in effect on `date` (latest Harga Supplier entry with an
  // effective date on or before it); the PO price when there is none.
  function purchasePrice(po, itemId, date) {
    var line = orderLine(po) || {};
    var poPrice = num(line.price);
    var best = null;
    (db().supplierPrices || []).forEach(function (p) {
      if (!same(p.itemId, itemId)) return;
      if (
        !(same(p.supplierId, po.supplierId) || (p.supplierName && p.supplierName === po.supplier))
      )
        return;
      var eff = p.effectiveDate || '';
      if (eff && date && eff > date) return;
      if (!best || (eff || '') > (best.effectiveDate || '')) best = p;
    });
    if (best && num(best.price) > 0) {
      return {
        price: num(best.price),
        source: 'supplierPrice',
        effectiveDate: best.effectiveDate || '',
        poPrice: poPrice,
        differs: Math.abs(num(best.price) - poPrice) > 0.5,
      };
    }
    return { price: poPrice, source: 'po', effectiveDate: '', poPrice: poPrice, differs: false };
  }

  // Money for one trip: DPP and PPN on both sides (prices exclude PPN unless the
  // order is tax-inclusive).
  function amounts(d) {
    var net = netOf(d);
    var so = find('salesOrders', d.soId);
    var po = find('purchaseOrders', d.poId);
    var sell = num(d.salePrice != null ? d.salePrice : (orderLine(so) || {}).price);
    var buy = num(d.purchasePrice != null ? d.purchasePrice : (orderLine(po) || {}).price);
    function side(price, order) {
      var gross = Math.round(net * price);
      var rate = num(order && order.taxRate);
      if (order && order.taxInclusive && rate > 0) {
        var tax = Math.round((gross * rate) / (1 + rate));
        return { dpp: gross - tax, tax: tax, total: gross, rate: rate };
      }
      var t = Math.round(gross * rate);
      return { dpp: gross, tax: t, total: gross + t, rate: rate };
    }
    return {
      net: net,
      salePrice: sell,
      purchasePrice: buy,
      sale: side(sell, so),
      purchase: side(buy, po),
    };
  }

  // ── Invoices covering trips ────────────────────────────────────────────────
  var SIDE = {
    sales: {
      coll: 'salesInvoices',
      docType: 'SI',
      party: 'customer',
      partyId: 'customerId',
      parties: 'customers',
    },
    purchases: {
      coll: 'purchaseInvoices',
      docType: 'PI',
      party: 'supplier',
      partyId: 'supplierId',
      parties: 'suppliers',
    },
  };
  function activeInvoice(inv) {
    return !!inv && (inv.status === 'Outstanding' || inv.status === 'Paid');
  }
  function coveringInvoice(sideKey, doId) {
    return (
      (db()[SIDE[sideKey].coll] || []).find(function (inv) {
        return (
          activeInvoice(inv) &&
          Array.isArray(inv.doIds) &&
          inv.doIds.some(function (x) {
            return same(x, doId);
          })
        );
      }) || null
    );
  }

  // Trips not yet on an active invoice of that side, optionally for one party and
  // a date range (inclusive).
  function unbilled(sideKey, filter) {
    filter = filter || {};
    return (db().deliveryOrders || [])
      .filter(function (d) {
        if (!isTrip(d) || coveringInvoice(sideKey, d.id)) return false;
        if (sideKey === 'sales' && filter.customerId && !same(d.customerId, filter.customerId))
          return false;
        if (sideKey === 'purchases' && filter.supplierId && !same(d.supplierId, filter.supplierId))
          return false;
        if (filter.from && (d.date || '') < filter.from) return false;
        if (filter.to && (d.date || '') > filter.to) return false;
        if (filter.poId && !same(d.poId, filter.poId)) return false;
        if (filter.soId && !same(d.soId, filter.soId)) return false;
        return true;
      })
      .sort(function (a, b) {
        return (a.date || '').localeCompare(b.date || '') || num(a.slotNo) - num(b.slotNo);
      });
  }

  function partyTerm(sideKey, partyId) {
    var p = (db()[SIDE[sideKey].parties] || []).find(function (x) {
      return same(x.id, partyId);
    });
    if (window.Balances && typeof window.Balances.termDays === 'function') {
      return window.Balances.termDays(p);
    }
    return p && p.termDays != null ? num(p.termDays) : 30;
  }

  // An invoice built from trips: one line per trip (SJ number, date and truck in
  // the line note) at the order price for sales, the trip's purchase price for
  // purchases. Not saved — see createInvoice.
  function buildInvoice(sideKey, doIds, opts) {
    opts = opts || {};
    var side = SIDE[sideKey];
    var trips = doIds
      .map(function (id) {
        return find('deliveryOrders', id);
      })
      .filter(Boolean);
    if (!trips.length) return { error: 'Pilih minimal satu pengambilan.' };
    var problems = [];
    trips.forEach(function (d) {
      if (!isTrip(d)) problems.push((d.sjNo || d.id) + ' belum diambil/ditimbang');
      var inv = coveringInvoice(sideKey, d.id);
      if (inv) problems.push((d.sjNo || d.id) + ' sudah ada di ' + (inv.number || inv.id));
    });
    var partyIds = {};
    trips.forEach(function (d) {
      partyIds[String(d[side.partyId])] = true;
    });
    if (Object.keys(partyIds).length > 1) {
      problems.push(
        sideKey === 'sales'
          ? 'Pengambilan dari pelanggan berbeda.'
          : 'Pengambilan dari supplier berbeda.'
      );
    }
    if (problems.length) return { error: problems.join('; ') };

    var first = trips[0];
    var orderColl = sideKey === 'sales' ? 'salesOrders' : 'purchaseOrders';
    var orderKey = sideKey === 'sales' ? 'soId' : 'poId';
    var orders = {};
    trips.forEach(function (d) {
      orders[String(d[orderKey])] = true;
    });
    var orderIds = Object.keys(orders);
    var order = find(orderColl, first[orderKey]);
    var lines = trips.map(function (d) {
      var a = amounts(d);
      var price = sideKey === 'sales' ? a.salePrice : a.purchasePrice;
      var l = (d.lines && d.lines[0]) || {};
      return {
        itemId: l.itemId,
        itemName: l.itemName,
        unit: l.unit,
        qty: a.net,
        price: price,
        lineDiscount: 0,
        subtotal: Math.round(a.net * price),
        doId: d.id,
        note: [d.sjNo || d.number, d.date, d.vehicle].filter(Boolean).join(' · '),
      };
    });
    var subtotal = lines.reduce(function (s, l) {
      return s + l.subtotal;
    }, 0);
    var rate = num(order && order.taxRate);
    var incl = !!(order && order.taxInclusive) && rate > 0;
    var tax = incl ? Math.round((subtotal * rate) / (1 + rate)) : Math.round(subtotal * rate);
    var date = opts.date || todayISO();
    var dates = trips
      .map(function (d) {
        return d.date || '';
      })
      .sort();
    var inv = {
      date: date,
      dueDate: addDays(date, partyTerm(sideKey, first[side.partyId])),
      status: 'Outstanding',
      sourceType: 'DO',
      sourceId: orderIds.length === 1 ? orderIds[0] : '',
      sourceNumber: orderIds.length === 1 && order ? order.number || order.id : '',
      doIds: trips.map(function (d) {
        return d.id;
      }),
      periodFrom: dates[0],
      periodTo: dates[dates.length - 1],
      lines: lines,
      taxRate: rate,
      taxInclusive: incl,
      tax: tax,
      amount: incl ? subtotal : subtotal + tax,
      note:
        opts.note ||
        'Pengambilan ' +
          dates[0] +
          (dates.length > 1 ? ' s/d ' + dates[dates.length - 1] : '') +
          ' (' +
          trips.length +
          ' truk)',
      createdBy: currentUser(),
    };
    inv[side.party] = first[side.party] || (order && order[side.party]) || '';
    inv[side.partyId] = first[side.partyId] || (order && order[side.partyId]) || '';
    if (sideKey === 'purchases' && opts.supplierRef) inv.supplierRef = opts.supplierRef;
    return { invoice: inv, trips: trips };
  }

  function createInvoice(sideKey, doIds, opts) {
    var built = buildInvoice(sideKey, doIds, opts);
    if (built.error) return built;
    var side = SIDE[sideKey];
    var inv = built.invoice;
    var number =
      window.DocEngine && typeof window.DocEngine.nextNumber === 'function'
        ? window.DocEngine.nextNumber(side.docType, inv.date, {
            sequences: db().numberSequences,
            commit: true,
          })
        : side.docType + '-' + Date.now();
    inv.id = number;
    inv.number = number;
    arr(side.coll).push(inv);
    if (sideKey === 'sales') {
      built.trips.forEach(function (d) {
        d.status = 'Invoiced';
      });
    }
    return { invoice: inv };
  }

  // When an invoice is cancelled its trips go back to "not invoiced".
  function releaseInvoice(sideKey, inv) {
    if (!inv || !Array.isArray(inv.doIds) || sideKey !== 'sales') return;
    inv.doIds.forEach(function (id) {
      var d = find('deliveryOrders', id);
      if (d && d.status === 'Invoiced' && !coveringInvoice('sales', id)) d.status = 'Delivered';
    });
  }

  // ── Opening a pickup PO ────────────────────────────────────────────────────
  // opts: { soId, capacity, cutoff, date }. Returns { slots } or { error }.
  function openPickupPO(poId, opts) {
    opts = opts || {};
    var po = find('purchaseOrders', poId);
    if (!po) return { error: 'PO tidak ditemukan.' };
    if (po.status !== 'Confirmed') return { error: 'PO harus berstatus Dikonfirmasi.' };
    if (isPickupOrder(po)) return { error: 'Surat jalan PO ini sudah dibuat.' };
    var lines = po.lines || [];
    if (lines.length !== 1)
      return { error: 'PO pengambilan berisi tepat satu barang (satu jenis/ukuran per PO).' };
    var so = opts.soId ? find('salesOrders', opts.soId) : null;
    if (opts.soId && !so) return { error: 'PO pelanggan tidak ditemukan.' };
    if (
      so &&
      !(so.lines || []).some(function (l) {
        return same(l.itemId, lines[0].itemId);
      })
    ) {
      return { error: 'Barang PO supplier tidak ada di PO pelanggan.' };
    }
    if (so && so.status !== 'Confirmed' && so.status !== 'Paid') {
      return { error: 'PO pelanggan harus berstatus Dikonfirmasi.' };
    }
    var capacity = num(opts.capacity) || defaultCapacity();
    var maxTrips = planTrips(lines[0].qty, capacity);
    var cutoff = opts.cutoff || monthEnd(po.date || todayISO());
    po.pickupFlow = {
      soId: so ? so.id : '',
      capacity: capacity,
      maxTrips: maxTrips,
      cutoff: cutoff,
      openedAt: new Date().toISOString(),
      openedBy: currentUser(),
    };
    if (so) {
      so.pickupFlow = so.pickupFlow || { poIds: [] };
      if (so.pickupFlow.poIds.indexOf(po.id) === -1) so.pickupFlow.poIds.push(po.id);
    }
    var slots = [];
    for (var i = 1; i <= maxTrips; i++) {
      slots.push(newSlot(po, so, i, opts.date || po.date || todayISO()));
    }
    var dos = arr('deliveryOrders');
    slots
      .slice()
      .reverse()
      .forEach(function (s) {
        dos.unshift(s);
      });
    return { slots: slots };
  }

  function newSlot(po, so, seq, date) {
    var line = orderLine(po) || {};
    var soLine = so
      ? (so.lines || []).find(function (l) {
          return same(l.itemId, line.itemId);
        }) || {}
      : {};
    var number =
      window.DocEngine && typeof window.DocEngine.nextNumber === 'function'
        ? window.DocEngine.nextNumber('DO', date, { sequences: db().numberSequences, commit: true })
        : 'DO-' + Date.now() + '-' + seq;
    var cust = so ? find('customers', so.customerId) : null;
    return {
      id: number,
      number: number,
      pickup: true,
      slotNo: seq,
      sjNo: (po.number || po.id) + '/' + pad2(seq),
      poId: po.id,
      poNumber: po.number || po.id,
      soId: so ? so.id : null,
      soNumber: so ? so.number || so.id : '',
      supplierId: po.supplierId || null,
      supplier: po.supplier || '',
      customerId: so ? so.customerId : null,
      customer: so ? so.customer : '',
      destination: (cust && cust.address) || '',
      date: '',
      status: 'Pending',
      driver: '',
      vehicle: '',
      capacity: num(po.pickupFlow && po.pickupFlow.capacity) || defaultCapacity(),
      salePrice: soLine.price != null ? num(soLine.price) : null,
      purchasePrice: null,
      weighing: null,
      weighHistory: [],
      lines: [
        {
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode || '',
          unit: line.unit || '',
          qty: 0,
          price: soLine.price != null ? num(soLine.price) : 0,
          lineDiscount: 0,
          subtotal: 0,
        },
      ],
      notes: '',
    };
  }

  // ── Recording a trip ───────────────────────────────────────────────────────
  // data: { date, gross, tare, net, vehicle, driver, destination, ticketPhoto,
  //         ticketNo, note }. opts: { allowOverQuota }. Returns { ok, warnings } or
  // { error }.
  function weighing(data) {
    var gross = num(data.gross);
    var tare = num(data.tare);
    var net = gross > 0 ? r3(gross - tare) : r3(data.net);
    return { gross: gross > 0 ? r3(gross) : null, tare: gross > 0 ? r3(tare) : null, net: net };
  }

  function recordTrip(doId, data, opts) {
    opts = opts || {};
    var d = find('deliveryOrders', doId);
    if (!isPickup(d)) return { error: 'Surat jalan tidak ditemukan.' };
    if (d.status !== 'Pending')
      return { error: 'Surat jalan ' + d.sjNo + ' sudah dipakai atau batal.' };
    var po = find('purchaseOrders', d.poId);
    if (!po || po.status === 'Closed' || po.status === 'Cancelled') {
      return { error: 'PO ' + (d.poNumber || '') + ' sudah ditutup.' };
    }
    var w = weighing(data);
    if (!(w.net > 0)) return { error: 'Netto harus lebih dari 0.' };
    if (w.gross != null && w.tare >= w.gross)
      return { error: 'Tara harus lebih kecil dari bruto.' };
    var date = String(data.date || '').slice(0, 10);
    if (!date) return { error: 'Tanggal pengambilan wajib diisi.' };
    var u = usage(po, date);
    if (u.cutoff && date > u.cutoff) {
      return { error: 'Lewat batas PO (' + u.cutoff + '). Buka PO baru untuk sisa pengambilan.' };
    }
    if (po.date && date < po.date) return { error: 'Tanggal sebelum tanggal PO.' };
    var warnings = [];
    var after = r3(u.taken + w.net);
    if (u.ordered > 0 && after > u.ordered) {
      if (!opts.allowOverQuota) {
        return {
          error:
            'Melebihi kuota PO: sudah diambil ' +
            u.taken +
            ', kuota ' +
            u.ordered +
            ' ' +
            u.unit +
            '.',
          overQuota: true,
        };
      }
      warnings.push('Melebihi kuota PO sebesar ' + r3(after - u.ordered) + ' ' + u.unit + '.');
    }
    if (d.capacity && w.net > d.capacity * 1.25) {
      warnings.push('Netto ' + w.net + ' jauh di atas kapasitas truk ' + d.capacity + '.');
    }
    var price = purchasePrice(po, (d.lines[0] || {}).itemId, date);
    if (price.differs) {
      warnings.push(
        'Harga supplier per ' +
          price.effectiveDate +
          ' (' +
          price.price +
          ') berbeda dari harga PO (' +
          price.poPrice +
          '); dipakai harga supplier.'
      );
    }
    d.date = date;
    d.vehicle = String(data.vehicle || '').trim();
    d.driver = String(data.driver || '').trim();
    if (data.destination != null && String(data.destination).trim()) {
      var dest = String(data.destination).trim();
      if (d.destination && dest !== d.destination) {
        d.destChanged = true;
        d.destOriginal = d.destOriginal || d.destination;
      }
      d.destination = dest;
    }
    if (data.ticketNo) d.ticketNo = String(data.ticketNo).trim();
    if (data.ticketPhoto) d.ticketPhoto = data.ticketPhoto;
    if (data.note) d.notes = String(data.note);
    d.weighing = w;
    d.purchasePrice = price.price;
    d.purchasePriceSource = price.source;
    var line = d.lines[0];
    line.qty = w.net;
    line.price = num(d.salePrice != null ? d.salePrice : line.price);
    line.subtotal = Math.round(w.net * line.price);
    d.status = 'Delivered';
    d.weighHistory = d.weighHistory || [];
    d.weighHistory.push({
      at: new Date().toISOString(),
      by: currentUser(),
      source: data.source || 'manual',
      net: w.net,
      gross: w.gross,
      tare: w.tare,
    });
    var after2 = usage(po, date);
    if (after2.full && !opts.keepOpen) {
      warnings.push(
        closePickupPO(po.id, 'quota')
          ? 'Kuota PO terpenuhi — PO ditutup, surat jalan sisa dibatalkan.'
          : 'Kuota PO terpenuhi — PO perlu ditutup oleh pengguna dengan akses Pembelian.'
      );
    }
    return { ok: true, warnings: warnings };
  }

  // Change the weight of a trip that was already recorded (correction, or a new
  // figure from the weighbridge recap). Keeps the history; when the trip is
  // already on an invoice, raises an alert instead of silently changing billing.
  function updateWeight(doId, data, meta) {
    meta = meta || {};
    var d = find('deliveryOrders', doId);
    if (!isTrip(d)) return { error: 'Pengambilan belum dicatat.' };
    var w = weighing(data);
    if (!(w.net > 0)) return { error: 'Netto harus lebih dari 0.' };
    var from = netOf(d);
    if (Math.abs(from - w.net) < 0.0005) return { ok: true, changed: false };
    var si = coveringInvoice('sales', d.id);
    var pi = coveringInvoice('purchases', d.id);
    d.weighHistory = d.weighHistory || [];
    d.weighHistory.push({
      at: new Date().toISOString(),
      by: meta.by || currentUser(),
      source: meta.source || 'manual',
      net: w.net,
      gross: w.gross,
      tare: w.tare,
      prevNet: from,
      note: meta.note || '',
    });
    if (si || pi) {
      // Billing already used the old figure: record the alert, keep the invoice
      // amounts as they are, update the trip so the next documents use the new one.
      d.weightAlert = {
        from: from,
        to: w.net,
        at: new Date().toISOString(),
        source: meta.source || 'manual',
        salesInvoice: si ? si.number || si.id : '',
        purchaseInvoice: pi ? pi.number || pi.id : '',
        resolved: false,
      };
    }
    d.weighing = w;
    d.lines[0].qty = w.net;
    d.lines[0].subtotal = Math.round(w.net * num(d.lines[0].price));
    return {
      ok: true,
      changed: true,
      alert: d.weightAlert && !d.weightAlert.resolved ? d.weightAlert : null,
    };
  }

  function resolveAlert(doId, note) {
    var d = find('deliveryOrders', doId);
    if (!d || !d.weightAlert) return false;
    d.weightAlert.resolved = true;
    d.weightAlert.resolvedAt = new Date().toISOString();
    d.weightAlert.resolvedBy = currentUser();
    d.weightAlert.note = note || '';
    return true;
  }

  function openAlerts() {
    return (db().deliveryOrders || []).filter(function (d) {
      return isPickup(d) && d.weightAlert && !d.weightAlert.resolved;
    });
  }

  function voidSlot(doId, reason) {
    var d = find('deliveryOrders', doId);
    if (!isPickup(d) || d.status !== 'Pending') return false;
    d.status = 'Cancelled';
    d.voidReason = reason || '';
    d.cancelledAt = new Date().toISOString();
    d.cancelledBy = currentUser();
    return true;
  }

  // reason: 'quota' | 'cutoff' | 'manual'
  // May the signed-in user change records of `module`? Closing a PO (and its SO)
  // is a side effect of recording a trip or of the cut-off sweep; a user without
  // that right leaves the order open for one who has it (the save would be
  // rolled back otherwise). No RBAC loaded (tests) = allowed.
  function mayEdit(module) {
    var r = window.RBAC;
    return !r || typeof r.can !== 'function' || r.can('edit', module);
  }

  function closePickupPO(poId, reason) {
    var po = find('purchaseOrders', poId);
    if (!isPickupOrder(po) || po.status === 'Closed' || !mayEdit('purchases')) return false;
    var label =
      { quota: 'kuota terpenuhi', cutoff: 'lewat cut-off', manual: 'ditutup manual' }[reason] ||
      reason ||
      '';
    slotsFor(po.id).forEach(function (d) {
      if (d.status === 'Pending') voidSlot(d.id, 'PO ' + label);
    });
    po.status = 'Closed';
    po.closedAt = new Date().toISOString();
    po.closedReason = reason || 'manual';
    po.closedBy = currentUser();
    var so = find('salesOrders', po.pickupFlow.soId);
    if (so && so.status !== 'Closed' && mayEdit('sales')) {
      var line = orderLine(so) || {};
      var taken = tripsForSO(so.id).reduce(function (s, d) {
        return s + netOf(d);
      }, 0);
      var anyOpen = (so.pickupFlow && so.pickupFlow.poIds ? so.pickupFlow.poIds : []).some(
        function (id) {
          var p = find('purchaseOrders', id);
          return p && p.status !== 'Closed' && p.status !== 'Cancelled';
        }
      );
      if (!anyOpen && taken >= num(line.qty) - 0.0005) {
        so.status = 'Closed';
        so.closedAt = po.closedAt;
        so.closedReason = 'quota';
      }
    }
    return true;
  }

  function reopenPickupPO(poId) {
    var po = find('purchaseOrders', poId);
    if (!isPickupOrder(po) || po.status !== 'Closed') return false;
    po.status = 'Confirmed';
    delete po.closedAt;
    delete po.closedReason;
    return true;
  }

  // Close every open pickup PO whose cut-off date has passed. Returns the POs closed.
  function sweepCutoffs(asOf) {
    asOf = asOf || todayISO();
    var closed = [];
    (db().purchaseOrders || []).forEach(function (po) {
      if (!isPickupOrder(po) || po.status === 'Closed' || po.status === 'Cancelled') return;
      if (usage(po, asOf).pastCutoff && closePickupPO(po.id, 'cutoff')) {
        closed.push(po);
      }
    });
    return closed;
  }

  // ── Weighbridge recap (Excel) ──────────────────────────────────────────────
  // Rows: { sjNo, poNumber, date, vehicle, driver, itemName, gross, tare, net }.
  var RECAP_COLS = [
    {
      f: 'sjNo',
      keys: [
        'no sj',
        'no. sj',
        'nomor sj',
        'surat jalan',
        'no surat jalan',
        'sj',
        'nomor',
        'no do',
        'do',
      ],
    },
    { f: 'poNumber', keys: ['no po', 'no. po', 'nomor po', 'po', 'po number'] },
    { f: 'date', keys: ['tanggal', 'tgl', 'date', 'tanggal ambil'] },
    {
      f: 'vehicle',
      keys: ['no polisi', 'no. polisi', 'nopol', 'plat', 'no plat', 'truk', 'kendaraan', 'vehicle'],
    },
    { f: 'driver', keys: ['sopir', 'supir', 'driver', 'pengemudi'] },
    { f: 'itemName', keys: ['barang', 'nama barang', 'item', 'material', 'jenis'] },
    { f: 'customer', keys: ['pelanggan', 'customer', 'tujuan'] },
    { f: 'gross', keys: ['bruto', 'gross', 'berat kotor'] },
    { f: 'tare', keys: ['tara', 'tare', 'berat kosong'] },
    { f: 'net', keys: ['netto', 'neto', 'net', 'tonase', 'berat bersih', 'berat', 'qty', 'ton'] },
    { f: 'ticketNo', keys: ['no tiket', 'no. tiket', 'tiket', 'no timbang', 'ticket'] },
  ];

  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    // 35,5 → 35.5 ; 35.500,25 → 35500.25 ; 35,500.25 → 35500.25
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      s =
        s.lastIndexOf(',') > s.lastIndexOf('.')
          ? s.replace(/\./g, '').replace(',', '.')
          : s.replace(/,/g, '');
    } else if (s.indexOf(',') !== -1) {
      s = s.replace(',', '.');
    }
    var n = Number(s.replace(/[^0-9.-]/g, ''));
    return isFinite(n) ? n : null;
  }

  function parseDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    if (typeof v === 'number') {
      var d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3];
      return y + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    }
    return '';
  }

  // Array-of-arrays (first non-empty row = headers) → recap rows.
  function recapRowsFromAoa(aoa) {
    var rows = (aoa || []).filter(function (r) {
      return (
        r &&
        r.some(function (c) {
          return String(c == null ? '' : c).trim() !== '';
        })
      );
    });
    if (!rows.length) return [];
    // The header row is the first row that names at least two known columns.
    var hIdx = 0;
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      var hits = 0;
      rows[i].forEach(function (c) {
        var h = String(c == null ? '' : c)
          .trim()
          .toLowerCase();
        if (
          RECAP_COLS.some(function (col) {
            return col.keys.indexOf(h) !== -1;
          })
        )
          hits++;
      });
      if (hits >= 2) {
        hIdx = i;
        break;
      }
    }
    var headers = rows[hIdx].map(function (c) {
      return String(c == null ? '' : c)
        .trim()
        .toLowerCase();
    });
    var idx = {};
    RECAP_COLS.forEach(function (col) {
      idx[col.f] = headers.findIndex(function (h) {
        return col.keys.indexOf(h) !== -1;
      });
    });
    var out = [];
    rows.slice(hIdx + 1).forEach(function (r, k) {
      function cell(f) {
        return idx[f] >= 0 ? r[idx[f]] : '';
      }
      var rec = {
        row: hIdx + k + 2,
        sjNo: String(cell('sjNo') == null ? '' : cell('sjNo')).trim(),
        poNumber: String(cell('poNumber') == null ? '' : cell('poNumber')).trim(),
        date: parseDate(cell('date')),
        vehicle: String(cell('vehicle') == null ? '' : cell('vehicle')).trim(),
        driver: String(cell('driver') == null ? '' : cell('driver')).trim(),
        itemName: String(cell('itemName') == null ? '' : cell('itemName')).trim(),
        customer: String(cell('customer') == null ? '' : cell('customer')).trim(),
        ticketNo: String(cell('ticketNo') == null ? '' : cell('ticketNo')).trim(),
        gross: parseNum(cell('gross')),
        tare: parseNum(cell('tare')),
        net: parseNum(cell('net')),
      };
      if (rec.gross != null && rec.gross > 0 && (rec.net == null || rec.net === 0)) {
        rec.net = r3(rec.gross - (rec.tare || 0));
      }
      // Totals and notes: no surat jalan, no date and no truck.
      if (!rec.sjNo && !rec.date && !rec.vehicle) return;
      if (!(rec.net > 0) && !rec.sjNo) return;
      out.push(rec);
    });
    return out;
  }

  // Match recap rows to pickup slots. Result groups:
  //   fill      — slot still Pending, recap has its weight → record the trip
  //   same      — trip recorded with the same weight
  //   changed   — trip recorded with a different weight (invoiced → alert)
  //   unmatched — no slot found (wrong SJ number, unknown truck/date)
  //   problems  — slot found but unusable (voided, PO closed, past cut-off)
  function matchRecap(rows) {
    var slots = (db().deliveryOrders || []).filter(isPickup);
    var bySj = {};
    slots.forEach(function (d) {
      if (d.sjNo) bySj[String(d.sjNo).trim().toUpperCase()] = d;
    });
    var used = {};
    var res = { fill: [], same: [], changed: [], unmatched: [], problems: [] };
    rows.forEach(function (row) {
      var d = row.sjNo ? bySj[row.sjNo.trim().toUpperCase()] : null;
      if (!d && row.date && row.vehicle) {
        var p = plate(row.vehicle);
        d =
          slots.find(function (s) {
            return isTrip(s) && s.date === row.date && plate(s.vehicle) === p && !used[s.id];
          }) || null;
      }
      if (!d) {
        res.unmatched.push({
          row: row,
          reason: row.sjNo
            ? 'No. SJ tidak dikenal'
            : 'Tanpa No. SJ dan tidak ada truk/tanggal yang cocok',
        });
        return;
      }
      if (used[d.id]) {
        res.problems.push({
          row: row,
          doId: d.id,
          reason: 'SJ ' + d.sjNo + ' muncul lebih dari sekali di rekap',
        });
        return;
      }
      used[d.id] = true;
      if (!(row.net > 0)) {
        res.problems.push({ row: row, doId: d.id, reason: 'Netto kosong' });
        return;
      }
      if (d.status === 'Cancelled') {
        res.problems.push({ row: row, doId: d.id, reason: 'SJ ' + d.sjNo + ' sudah dibatalkan' });
        return;
      }
      if (d.status === 'Pending') {
        res.fill.push({ row: row, doId: d.id });
        return;
      }
      var from = netOf(d);
      if (Math.abs(from - row.net) < 0.0005) {
        res.same.push({ row: row, doId: d.id });
      } else {
        res.changed.push({
          row: row,
          doId: d.id,
          from: from,
          to: r3(row.net),
          invoiced: !!(coveringInvoice('sales', d.id) || coveringInvoice('purchases', d.id)),
        });
      }
    });
    return res;
  }

  // Apply a matched recap. Returns counts plus per-row errors for slots that could
  // not be filled (quota, cut-off).
  function applyRecap(result, meta) {
    meta = meta || {};
    var source = meta.source || 'rekap';
    var out = { filled: 0, changed: 0, alerts: 0, errors: [] };
    result.fill.forEach(function (m) {
      var r = recordTrip(
        m.doId,
        {
          date: m.row.date,
          gross: m.row.gross,
          tare: m.row.tare,
          net: m.row.net,
          vehicle: m.row.vehicle,
          driver: m.row.driver,
          ticketNo: m.row.ticketNo,
          source: source,
        },
        { allowOverQuota: !!meta.allowOverQuota }
      );
      if (r.error) out.errors.push({ row: m.row, error: r.error });
      else out.filled++;
    });
    result.changed.forEach(function (m) {
      var r = updateWeight(
        m.doId,
        { gross: m.row.gross, tare: m.row.tare, net: m.row.net },
        { source: source, note: meta.note || '' }
      );
      if (r.error) out.errors.push({ row: m.row, error: r.error });
      else if (r.changed) {
        out.changed++;
        if (r.alert) out.alerts++;
      }
    });
    return out;
  }

  // ── Excel for the weighbridge ──────────────────────────────────────────────
  // One sheet listing the SJ slots of the given POs, with empty weight columns the
  // weighbridge fills in; the same layout imports back via recapRowsFromAoa.
  function weighbridgeSheet(poIds) {
    var rows = [];
    poIds.forEach(function (poId) {
      var po = find('purchaseOrders', poId);
      if (!po) return;
      var cutoff = usage(po).cutoff;
      slotsFor(poId).forEach(function (d) {
        if (d.status === 'Cancelled') return;
        var w = d.weighing || {};
        rows.push([
          d.sjNo,
          d.poNumber || '',
          d.customer || '',
          d.destination || '',
          (d.lines[0] || {}).itemName || '',
          d.capacity || '',
          cutoff,
          d.date || '',
          d.vehicle || '',
          d.driver || '',
          w.gross != null ? w.gross : '',
          w.tare != null ? w.tare : '',
          isTrip(d) ? netOf(d) : '',
        ]);
      });
    });
    return {
      name: 'Surat Jalan',
      columns: [
        { header: 'No SJ', width: 22 },
        { header: 'No PO', width: 20 },
        { header: 'Pelanggan', width: 26 },
        { header: 'Tujuan', width: 24 },
        { header: 'Barang', width: 22 },
        { header: 'Kapasitas', width: 10 },
        { header: 'Berlaku s/d', width: 12 },
        { header: 'Tanggal', width: 12 },
        { header: 'No Polisi', width: 13 },
        { header: 'Sopir', width: 16 },
        { header: 'Bruto', width: 10 },
        { header: 'Tara', width: 10 },
        { header: 'Netto', width: 10 },
      ],
      rows: rows,
    };
  }

  // Trips as a recap for a customer or the office (one row per truck).
  function tripRecapSheet(trips) {
    return {
      name: 'Rekap Pengambilan',
      columns: [
        { header: 'Tanggal', width: 12 },
        { header: 'No SJ', width: 22 },
        { header: 'No PO Supplier', width: 20 },
        { header: 'No PO Pelanggan', width: 20 },
        { header: 'Pelanggan', width: 26 },
        { header: 'Barang', width: 22 },
        { header: 'No Polisi', width: 13 },
        { header: 'Sopir', width: 16 },
        { header: 'Bruto', width: 10 },
        { header: 'Tara', width: 10 },
        { header: 'Netto', width: 10 },
        { header: 'Faktur Pelanggan', width: 20 },
        { header: 'Faktur Supplier', width: 20 },
      ],
      rows: trips.map(function (d) {
        var w = d.weighing || {};
        var si = coveringInvoice('sales', d.id);
        var pi = coveringInvoice('purchases', d.id);
        return [
          d.date || '',
          d.sjNo || '',
          d.poNumber || '',
          d.soNumber || '',
          d.customer || '',
          (d.lines[0] || {}).itemName || '',
          d.vehicle || '',
          d.driver || '',
          w.gross != null ? w.gross : '',
          w.tare != null ? w.tare : '',
          netOf(d),
          si ? si.number || si.id : '',
          pi ? pi.number || pi.id : '',
        ];
      }),
    };
  }

  // Supplier invoice check: their billed tonnage/price vs our trips for the same
  // supplier and period ("cocokkan jumlah barang yang dibeli dengan yang
  // difakturkan"). billed: { qty, price, from, to, supplierId }.
  function compareSupplierBill(billed) {
    var trips = unbilled('purchases', {
      supplierId: billed.supplierId,
      from: billed.from,
      to: billed.to,
    });
    var qty = r3(
      trips.reduce(function (s, d) {
        return s + netOf(d);
      }, 0)
    );
    var prices = {};
    trips.forEach(function (d) {
      prices[String(amounts(d).purchasePrice)] = true;
    });
    return {
      trips: trips,
      ourQty: qty,
      billedQty: r3(billed.qty),
      qtyDiff: r3(num(billed.qty) - qty),
      ourPrices: Object.keys(prices).map(Number),
      billedPrice: num(billed.price),
      priceDiffers:
        billed.price != null &&
        billed.price !== '' &&
        Object.keys(prices).some(function (p) {
          return Math.abs(Number(p) - num(billed.price)) > 0.5;
        }),
    };
  }

  window.Trading = {
    DEFAULT_CAPACITY: DEFAULT_CAPACITY,
    isPickup: isPickup,
    isPickupOrder: isPickupOrder,
    isTrip: isTrip,
    netOf: netOf,
    slotsFor: slotsFor,
    tripsForSO: tripsForSO,
    usage: usage,
    planTrips: planTrips,
    monthEnd: monthEnd,
    purchasePrice: purchasePrice,
    amounts: amounts,
    coveringInvoice: coveringInvoice,
    unbilled: unbilled,
    buildInvoice: buildInvoice,
    createInvoice: createInvoice,
    releaseInvoice: releaseInvoice,
    openPickupPO: openPickupPO,
    recordTrip: recordTrip,
    updateWeight: updateWeight,
    resolveAlert: resolveAlert,
    openAlerts: openAlerts,
    voidSlot: voidSlot,
    closePickupPO: closePickupPO,
    reopenPickupPO: reopenPickupPO,
    sweepCutoffs: sweepCutoffs,
    recapRowsFromAoa: recapRowsFromAoa,
    matchRecap: matchRecap,
    applyRecap: applyRecap,
    weighbridgeSheet: weighbridgeSheet,
    tripRecapSheet: tripRecapSheet,
    compareSupplierBill: compareSupplierBill,
  };
})();
