// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Trading summary  (trading-summary.js)
//
// Read-only figures over the trading pickup flow (trading.js) for the Ringkasan,
// Entri Harian and notifications. Every number is counted from documents:
//   • pickup POs (purchaseOrders with pickupFlow) and their surat jalan slots
//   • trips (pickup delivery orders that were weighed: Trading.isTrip)
//   • the sales / purchase invoices that list a trip in `doIds`
//   • open receivable items (Balances.openItems) and posted receipts
//
//   pipeline(period)        counts, quantity and value per stage of the flow
//   byCustomer(asOf)        per customer: not yet billed, billed and still open,
//                           overdue, received this month
//   poProgress(asOf)        open pickup POs: quota, surat jalan used, cut-off
//   monthlyTonnage(months)  quantity per month (total, per customer, per customer
//                           PO, per supplier PO) with the change vs the month before
//   supplierDiffs()         supplier invoice lines that differ from their trips,
//                           supplier bills that differ from the trips they cover,
//                           and the open weight-change alerts
//   unbilledAging(asOf)     customers whose oldest unbilled trip is older than N days
//
// Quantities are kept per unit ({ Ton: 120.5 }) — trips of different units are
// never added together. Money is the trip amount incl. PPN (Trading.amounts), the
// same figure Balances uses for a trip that is not yet invoiced.
//
// Never mutates DB. Global-scope rule: classic <script>, IIFE-wrapped, exposes
// ONLY window.TradingSummary.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var EPS_QTY = 0.0005;
  var EPS_MONEY = 0.5;
  var NEAR_CUTOFF_DAYS = 3;
  var NEAR_QUOTA = 0.9;

  function db() {
    return window.DB || {};
  }
  function T() {
    return window.Trading || null;
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
  function iso(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayISO() {
    return iso(new Date());
  }
  function monthEnd(dateStr) {
    var y = Number(String(dateStr).slice(0, 4));
    var m = Number(String(dateStr).slice(5, 7));
    return y + '-' + pad2(m) + '-' + pad2(new Date(y, m, 0).getDate());
  }
  function monthKeyOffset(key, delta) {
    var d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function daysBetween(fromStr, toStr) {
    var a = new Date(String(fromStr).slice(0, 10) + 'T00:00:00');
    var b = new Date(String(toStr).slice(0, 10) + 'T00:00:00');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }
  function find(coll, id) {
    return (
      (db()[coll] || []).find(function (d) {
        return same(d.id, id);
      }) || null
    );
  }

  // ── Quantities per unit ────────────────────────────────────────────────────
  function unitOf(d) {
    var l = (d && d.lines && d.lines[0]) || {};
    return String(l.unit || '').trim();
  }
  function addQty(map, unit, q) {
    map[unit] = r3(num(map[unit]) + num(q));
    return map;
  }
  // The unit with the largest quantity (the one charts are drawn in).
  function mainUnit(map) {
    var best = null;
    Object.keys(map || {}).forEach(function (u) {
      if (best === null || num(map[u]) > num(map[best])) best = u;
    });
    return best;
  }

  // ── Trips ──────────────────────────────────────────────────────────────────
  function hasTrading() {
    var t = T();
    if (!t) return false;
    return (
      (db().purchaseOrders || []).some(t.isPickupOrder) ||
      (db().deliveryOrders || []).some(t.isPickup)
    );
  }
  function allTrips() {
    var t = T();
    if (!t) return [];
    return (db().deliveryOrders || []).filter(t.isTrip);
  }
  function inRange(date, from, to) {
    var d = String(date || '').slice(0, 10);
    return !!d && (!from || d >= from) && (!to || d <= to);
  }
  function saleTotal(d) {
    return num(T().amounts(d).sale.total);
  }
  function purchaseTotal(d) {
    return num(T().amounts(d).purchase.total);
  }
  function isOpenPickupPO(po) {
    var t = T();
    return !!t && t.isPickupOrder(po) && po.status !== 'Closed' && po.status !== 'Cancelled';
  }

  // period: undefined (month of asOf) | 'YYYY-MM' | { from, to }
  function normPeriod(period, asOf) {
    asOf = asOf || todayISO();
    if (period && typeof period === 'object') {
      return { from: period.from || '', to: period.to || '', key: '' };
    }
    var key =
      typeof period === 'string' && /^\d{4}-\d{2}$/.test(period) ? period : asOf.slice(0, 7);
    return { from: key + '-01', to: monthEnd(key + '-01'), key: key };
  }

  function stage() {
    return { count: 0, qty: {}, value: 0 };
  }
  function addTrip(st, d, value) {
    st.count++;
    addQty(st.qty, unitOf(d), T().netOf(d));
    st.value += value;
    return st;
  }

  // ── pipeline(period) ───────────────────────────────────────────────────────
  // Current state of the open pickup POs plus the trips of the period, each in
  // exactly one billing state per side:
  //   customer: unbilled (no active SI) · billed (on an SI not yet paid) · paid
  //   supplier: supplierUnbilled · supplierBilled · supplierPaid
  // so unbilled + billed + paid = taken (and the same on the supplier side).
  // carryOver = trips from before the period that are still not billed.
  function pipeline(period, opts) {
    opts = opts || {};
    var p = normPeriod(period, opts.asOf);
    var out = {
      period: p,
      hasData: hasTrading(),
      openPOs: { count: 0, ordered: {}, taken: {}, remaining: {} },
      slots: { count: 0 },
      taken: stage(),
      unbilled: stage(),
      billed: stage(),
      paid: stage(),
      supplierUnbilled: stage(),
      supplierBilled: stage(),
      supplierPaid: stage(),
      carryOver: { unbilled: stage(), supplierUnbilled: stage() },
    };
    var t = T();
    if (!t) return out;

    (db().purchaseOrders || []).forEach(function (po) {
      if (!isOpenPickupPO(po)) return;
      var u = t.usage(po, opts.asOf);
      out.openPOs.count++;
      addQty(out.openPOs.ordered, u.unit || '', u.ordered);
      addQty(out.openPOs.taken, u.unit || '', u.taken);
      addQty(out.openPOs.remaining, u.unit || '', u.remaining);
      out.slots.count += u.tripsOpen;
    });

    allTrips().forEach(function (d) {
      var sale = saleTotal(d);
      var buy = purchaseTotal(d);
      var si = t.coveringInvoice('sales', d.id);
      var pi = t.coveringInvoice('purchases', d.id);
      if (!inRange(d.date, p.from, p.to)) {
        if (p.from && String(d.date || '') < p.from) {
          if (!si) addTrip(out.carryOver.unbilled, d, sale);
          if (!pi) addTrip(out.carryOver.supplierUnbilled, d, buy);
        }
        return;
      }
      addTrip(out.taken, d, sale);
      addTrip(!si ? out.unbilled : si.status === 'Paid' ? out.paid : out.billed, d, sale);
      addTrip(
        !pi ? out.supplierUnbilled : pi.status === 'Paid' ? out.supplierPaid : out.supplierBilled,
        d,
        buy
      );
    });
    return out;
  }

  // ── byCustomer(asOf) ───────────────────────────────────────────────────────
  // Open receivables per customer, split the way the owner reads them:
  //   unbilled         trips not yet on an invoice (Balances items flagged unbilled)
  //   uninvoicedOrders delivered orders without an invoice (regular sales flow)
  //   invoiced         active sales invoices still open (overdue is part of it)
  //   paidThisMonth    posted receipts + order payments dated this month
  // open = unbilled + uninvoicedOrders + invoiced = the customer's share of the
  // Piutang figure (Balances.summary('sales')).
  function byCustomer(asOf) {
    asOf = asOf || todayISO();
    var monthFrom = asOf.slice(0, 7) + '-01';
    var rows = {};
    var customers = db().customers || [];

    function rowFor(id, name) {
      var key = id != null && id !== '' ? 'id:' + id : 'name:' + (name || '');
      if (!rows[key]) {
        var c =
          id != null && id !== ''
            ? customers.find(function (x) {
                return same(x.id, id);
              })
            : null;
        rows[key] = {
          customerId: id != null && id !== '' ? String(id) : null,
          customer: (c && c.name) || name || '—',
          unbilled: 0,
          unbilledCount: 0,
          unbilledQty: {},
          oldestUnbilled: '',
          uninvoicedOrders: 0,
          uninvoicedOrdersCount: 0,
          invoiced: 0,
          invoicedCount: 0,
          overdue: 0,
          overdueCount: 0,
          paidThisMonth: 0,
          open: 0,
        };
      }
      return rows[key];
    }

    var B = window.Balances;
    var items = B && typeof B.openItems === 'function' ? B.openItems('sales', { asOf: asOf }) : [];
    items.forEach(function (it) {
      var r = rowFor(it.partyId, it.party);
      if (it.unbilled) {
        r.unbilled += it.outstanding;
        r.unbilledCount++;
        if (T()) addQty(r.unbilledQty, unitOf(it.doc), T().netOf(it.doc));
        if (it.date && (!r.oldestUnbilled || it.date < r.oldestUnbilled)) {
          r.oldestUnbilled = it.date;
        }
      } else if (it.docType === 'SI') {
        r.invoiced += it.outstanding;
        r.invoicedCount++;
        if (it.overdue) {
          r.overdue += it.outstanding;
          r.overdueCount++;
        }
      } else {
        r.uninvoicedOrders += it.outstanding;
        r.uninvoicedOrdersCount++;
      }
    });

    // Money received this month: posted receipts against invoices, and payments
    // logged on orders (an applied down payment is not new money and is skipped).
    (db().salesReceipts || []).forEach(function (rc) {
      if (rc.status !== 'Posted' || !inRange(rc.date, monthFrom, asOf)) return;
      var inv = rc.invoiceId ? find('salesInvoices', rc.invoiceId) : null;
      var id = rc.customerId != null ? rc.customerId : inv ? inv.customerId : null;
      var name = rc.customer || (inv && inv.customer) || '';
      rowFor(id, name).paidThisMonth += num(rc.amount);
    });
    (db().paymentLogs || []).forEach(function (pl) {
      if (pl.type !== 'SO' || !inRange(pl.date, monthFrom, asOf)) return;
      if (pl.method === 'Down Payment' || pl.source === 'DP') return;
      var so = find('salesOrders', pl.orderId);
      if (!so) return;
      rowFor(so.customerId, so.customer).paidThisMonth += num(pl.amount);
    });

    var list = Object.keys(rows)
      .map(function (k) {
        var r = rows[k];
        r.open = r.unbilled + r.uninvoicedOrders + r.invoiced;
        return r;
      })
      .filter(function (r) {
        return r.open > EPS_MONEY || r.paidThisMonth > EPS_MONEY;
      })
      .sort(function (a, b) {
        return (
          b.open - a.open ||
          b.paidThisMonth - a.paidThisMonth ||
          a.customer.localeCompare(b.customer)
        );
      });
    var totals = list.reduce(
      function (s, r) {
        s.unbilled += r.unbilled;
        s.unbilledCount += r.unbilledCount;
        s.uninvoicedOrders += r.uninvoicedOrders;
        s.invoiced += r.invoiced;
        s.overdue += r.overdue;
        s.paidThisMonth += r.paidThisMonth;
        s.open += r.open;
        return s;
      },
      {
        unbilled: 0,
        unbilledCount: 0,
        uninvoicedOrders: 0,
        invoiced: 0,
        overdue: 0,
        paidThisMonth: 0,
        open: 0,
      }
    );
    return { asOf: asOf, month: asOf.slice(0, 7), rows: list, totals: totals };
  }

  // ── poProgress(asOf) ───────────────────────────────────────────────────────
  // Open pickup POs with quota and surat jalan use, and the days left to the
  // cut-off. Flagged: past the cut-off (still open), cut-off within 3 days, or
  // at least 90% of the quota taken. Flagged POs first, then nearest cut-off.
  function poProgress(asOf) {
    asOf = asOf || todayISO();
    var t = T();
    if (!t) return [];
    return (db().purchaseOrders || [])
      .filter(isOpenPickupPO)
      .map(function (po) {
        var u = t.usage(po, asOf);
        var so = find('salesOrders', po.pickupFlow.soId);
        var line = (po.lines || [])[0] || {};
        var days = u.cutoff ? daysBetween(asOf, u.cutoff) : null;
        var pct = u.ordered > 0 ? u.taken / u.ordered : 0;
        var nearCutoff = days !== null && days >= 0 && days <= NEAR_CUTOFF_DAYS;
        var nearQuota = u.ordered > 0 && pct >= NEAR_QUOTA;
        return {
          id: po.id,
          number: po.number || po.id,
          date: po.date || '',
          supplier: po.supplier || '',
          supplierId: po.supplierId != null ? String(po.supplierId) : null,
          soId: so ? so.id : null,
          soNumber: so ? so.number || so.id : '',
          customer: so ? so.customer || '' : '',
          itemName: line.itemName || '',
          unit: u.unit,
          ordered: u.ordered,
          taken: u.taken,
          remaining: u.remaining,
          over: u.over,
          pct: pct,
          tripsUsed: u.tripsUsed,
          tripsMax: u.tripsMax,
          tripsOpen: u.tripsOpen,
          cutoff: u.cutoff,
          daysToCutoff: days,
          pastCutoff: u.pastCutoff,
          nearCutoff: nearCutoff,
          nearQuota: nearQuota,
          flagged: u.pastCutoff || nearCutoff || nearQuota,
        };
      })
      .sort(function (a, b) {
        if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
        return (
          String(a.cutoff || '9999').localeCompare(String(b.cutoff || '9999')) ||
          String(a.number).localeCompare(String(b.number))
        );
      });
  }

  // ── monthlyTonnage(months, { asOf }) ───────────────────────────────────────
  // Quantity of trips per month for the last `months` months up to asOf: the
  // total, per customer, per customer PO (SO) and per supplier PO. When the
  // current month is not over yet, the trend compares it with the same days of
  // the month before (1..day of asOf), not with that whole month.
  function trendOf(current, base) {
    if (!(current > EPS_QTY) && !(base > EPS_QTY)) return null;
    var diff = r3(current - base);
    return {
      current: r3(current),
      base: r3(base),
      diff: diff,
      pct: base > EPS_QTY ? diff / base : null,
      dir: diff > EPS_QTY ? 'naik' : diff < -EPS_QTY ? 'turun' : 'tetap',
    };
  }

  function monthlyTonnage(months, opts) {
    opts = opts || {};
    months = Math.max(1, Math.round(num(months) || 6));
    var asOf = opts.asOf || todayISO();
    var lastKey = asOf.slice(0, 7);
    var keys = [];
    for (var i = months - 1; i >= 0; i--) keys.push(monthKeyOffset(lastKey, -i));
    var throughDay = Number(asOf.slice(8, 10));
    var partial = asOf < monthEnd(asOf);
    var prevKey = monthKeyOffset(lastKey, -1);
    var from = keys[0] + '-01';

    var totalsByKey = {};
    keys.forEach(function (k) {
      totalsByKey[k] = { key: k, qty: {}, trips: 0 };
    });
    var groups = { customers: {}, salesOrders: {}, purchaseOrders: {} };
    var allQty = {};
    var prevSameDaysQty = {};

    function groupRow(kind, key, init) {
      var g = groups[kind];
      if (!g[key]) {
        g[key] = Object.assign(
          {
            values: keys.map(function () {
              return 0;
            }),
            sameDaysPrev: 0,
          },
          init
        );
      }
      return g[key];
    }

    allTrips().forEach(function (d) {
      var date = String(d.date || '').slice(0, 10);
      if (!inRange(date, from, asOf)) return;
      var k = date.slice(0, 7);
      var idx = keys.indexOf(k);
      if (idx === -1) return;
      var q = T().netOf(d);
      var unit = unitOf(d);
      var sameDays = k === prevKey && Number(date.slice(8, 10)) <= throughDay;
      addQty(totalsByKey[k].qty, unit, q);
      totalsByKey[k].trips++;
      addQty(allQty, unit, q);
      if (sameDays) addQty(prevSameDaysQty, unit, q);
      var rows = [
        groupRow(
          'customers',
          (d.customerId != null ? 'id:' + d.customerId : 'name:' + (d.customer || '')) + '|' + unit,
          {
            customerId: d.customerId != null ? String(d.customerId) : null,
            name: d.customer || '—',
            unit: unit,
          }
        ),
        groupRow('salesOrders', String(d.soId || d.soNumber || '—') + '|' + unit, {
          soId: d.soId || null,
          number: d.soNumber || '',
          customer: d.customer || '',
          unit: unit,
        }),
        groupRow('purchaseOrders', String(d.poId) + '|' + unit, {
          poId: d.poId,
          number: d.poNumber || d.poId,
          supplier: d.supplier || '',
          customer: d.customer || '',
          unit: unit,
        }),
      ];
      rows.forEach(function (r) {
        r.values[idx] = r3(r.values[idx] + q);
        if (sameDays) r.sameDaysPrev = r3(r.sameDaysPrev + q);
      });
    });

    var last = keys.length - 1;
    function finish(r) {
      r.total = r3(
        r.values.reduce(function (s, v) {
          return s + v;
        }, 0)
      );
      r.current = r.values[last];
      r.previous = last > 0 ? r.values[last - 1] : 0;
      r.trend = trendOf(r.current, partial ? r.sameDaysPrev : r.previous);
      return r;
    }
    function list(kind) {
      return Object.keys(groups[kind])
        .map(function (k) {
          return finish(groups[kind][k]);
        })
        .sort(function (a, b) {
          return b.total - a.total || b.current - a.current;
        });
    }

    var unit = mainUnit(allQty);
    var totals = keys.map(function (k, j) {
      var t = totalsByKey[k];
      var v = unit !== null ? num(t.qty[unit]) : 0;
      var prev = j > 0 ? num(totalsByKey[keys[j - 1]].qty[unit]) : null;
      return {
        key: k,
        qty: t.qty,
        trips: t.trips,
        value: r3(v),
        change: prev === null ? null : r3(v - prev),
      };
    });
    var current = totals[last].value;
    var sameDaysPrev = unit !== null ? num(prevSameDaysQty[unit]) : 0;
    return {
      asOf: asOf,
      keys: keys,
      partial: partial,
      throughDay: throughDay,
      unit: unit,
      units: Object.keys(allQty),
      hasData: totals.some(function (t) {
        return t.trips > 0;
      }),
      totals: totals,
      sameDaysPrev: r3(sameDaysPrev),
      trend: trendOf(current, partial ? sameDaysPrev : last > 0 ? totals[last - 1].value : 0),
      customers: list('customers'),
      salesOrders: list('salesOrders'),
      purchaseOrders: list('purchaseOrders'),
    };
  }

  // ── supplierDiffs() ────────────────────────────────────────────────────────
  //   lines  — supplier invoice lines whose qty or price differs from their trip
  //            (weighbridge figure / purchase price used for the trip)
  //   bills  — supplier invoices carrying the supplier's own billed totals
  //            (supplierBill { qty, price, reason } written by Tagihan Supplier,
  //            or billedQty / billedPrice) that differ from the trips the invoice
  //            covers ("diambil 100 t, ditagih 110 t"). Our side is recounted
  //            from the trips now, so a later weight change shows up here too.
  //   alerts — trips whose weight changed after they were invoiced, unresolved
  function supplierDiffs() {
    var t = T();
    var out = { lines: [], bills: [], alerts: [], invoices: 0 };
    if (!t) return out;
    var openAlert = {};
    t.openAlerts().forEach(function (d) {
      openAlert[String(d.id)] = true;
      var a = d.weightAlert || {};
      out.alerts.push({
        doId: d.id,
        sjNo: d.sjNo || d.number || d.id,
        date: d.date || '',
        customer: d.customer || '',
        supplier: d.supplier || '',
        unit: unitOf(d),
        from: r3(a.from),
        to: r3(a.to),
        diff: r3(num(a.to) - num(a.from)),
        salesInvoice: a.salesInvoice || '',
        purchaseInvoice: a.purchaseInvoice || '',
        at: a.at || '',
        source: a.source || '',
      });
    });

    var flagged = {};
    (db().purchaseInvoices || []).forEach(function (inv) {
      if (!(inv.status === 'Outstanding' || inv.status === 'Paid')) return;
      if (!Array.isArray(inv.doIds) || !inv.doIds.length) return;
      (inv.lines || []).forEach(function (l) {
        if (l.doId == null) return;
        var d = find('deliveryOrders', l.doId);
        if (!d || !t.isTrip(d)) return;
        var tripQty = t.netOf(d);
        var tripPrice = num(t.amounts(d).purchasePrice);
        var billedQty = r3(l.qty);
        var billedPrice = num(l.price);
        var qtyDiff = r3(billedQty - tripQty);
        var priceDiff = billedPrice - tripPrice;
        if (Math.abs(qtyDiff) <= EPS_QTY && Math.abs(priceDiff) <= EPS_MONEY) return;
        flagged[String(inv.id)] = true;
        out.lines.push({
          invoiceId: inv.id,
          invoiceNumber: inv.number || inv.id,
          supplier: inv.supplier || d.supplier || '',
          supplierId: inv.supplierId != null ? String(inv.supplierId) : null,
          doId: d.id,
          sjNo: d.sjNo || d.number || d.id,
          date: d.date || '',
          unit: unitOf(d),
          tripQty: tripQty,
          billedQty: billedQty,
          qtyDiff: qtyDiff,
          tripPrice: tripPrice,
          billedPrice: billedPrice,
          priceDiff: priceDiff,
          valueDiff: Math.round(billedQty * billedPrice - tripQty * tripPrice),
          weightAlert: !!openAlert[String(d.id)],
        });
      });

      var b =
        inv.supplierBill && typeof inv.supplierBill === 'object'
          ? inv.supplierBill
          : inv.billedQty != null
            ? { qty: inv.billedQty, price: inv.billedPrice }
            : null;
      if (!b || b.qty == null || b.qty === '') return;
      var trips = inv.doIds
        .map(function (id) {
          return find('deliveryOrders', id);
        })
        .filter(function (d) {
          return d && t.isTrip(d);
        });
      var ourQty = r3(
        trips.reduce(function (s, d) {
          return s + t.netOf(d);
        }, 0)
      );
      var prices = {};
      trips.forEach(function (d) {
        prices[String(num(t.amounts(d).purchasePrice))] = true;
      });
      var priceDiffers =
        b.price != null &&
        b.price !== '' &&
        Object.keys(prices).some(function (p) {
          return Math.abs(Number(p) - num(b.price)) > EPS_MONEY;
        });
      var qtyDiff = r3(num(b.qty) - ourQty);
      if (Math.abs(qtyDiff) <= EPS_QTY && !priceDiffers) return;
      flagged[String(inv.id)] = true;
      out.bills.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number || inv.id,
        supplierRef: inv.supplierRef || '',
        supplier: inv.supplier || '',
        supplierId: inv.supplierId != null ? String(inv.supplierId) : null,
        trips: trips.length,
        unit: trips.length ? unitOf(trips[0]) : '',
        ourQty: ourQty,
        billedQty: r3(b.qty),
        qtyDiff: qtyDiff,
        billedPrice: b.price != null && b.price !== '' ? num(b.price) : null,
        ourPrices: Object.keys(prices).map(Number),
        priceDiffers: priceDiffers,
        reason: b.reason || '',
      });
    });
    out.invoices = Object.keys(flagged).length;
    return out;
  }

  // ── unbilledAging(asOf, minDays) ───────────────────────────────────────────
  // Customers with trips not yet invoiced whose oldest trip is more than
  // `minDays` days old (default 7) — the weekly billing has slipped.
  function unbilledAging(asOf, minDays) {
    asOf = asOf || todayISO();
    minDays = minDays == null ? 7 : num(minDays);
    var t = T();
    if (!t) return [];
    var rows = {};
    t.unbilled('sales').forEach(function (d) {
      var key = d.customerId != null ? 'id:' + d.customerId : 'name:' + (d.customer || '');
      var r =
        rows[key] ||
        (rows[key] = {
          customerId: d.customerId != null ? String(d.customerId) : null,
          customer: d.customer || '—',
          count: 0,
          qty: {},
          value: 0,
          oldest: '',
          oldDays: 0,
        });
      r.count++;
      addQty(r.qty, unitOf(d), t.netOf(d));
      r.value += saleTotal(d);
      if (d.date && (!r.oldest || d.date < r.oldest)) r.oldest = d.date;
    });
    return Object.keys(rows)
      .map(function (k) {
        var r = rows[k];
        r.oldDays = r.oldest ? daysBetween(r.oldest, asOf) : 0;
        return r;
      })
      .filter(function (r) {
        return r.oldDays > minDays;
      })
      .sort(function (a, b) {
        return b.oldDays - a.oldDays || b.value - a.value;
      });
  }

  window.TradingSummary = {
    NEAR_CUTOFF_DAYS: NEAR_CUTOFF_DAYS,
    NEAR_QUOTA: NEAR_QUOTA,
    hasData: hasTrading,
    mainUnit: mainUnit,
    pipeline: pipeline,
    byCustomer: byCustomer,
    poProgress: poProgress,
    monthlyTonnage: monthlyTonnage,
    supplierDiffs: supplierDiffs,
    unbilledAging: unbilledAging,
  };
})();
