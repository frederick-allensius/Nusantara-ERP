// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Order pipeline  (order-pipeline.js)
//
// Where each sales / purchase order stands in its flow, for the pipeline views
// (Ringkasan funnel tabs, status strip on Pesanan Penjualan / Pembelian):
//
//   draft      Draf                      status Draft
//   confirmed  Dikonfirmasi              Confirmed; a pickup order still being taken
//   delivered  Terkirim / Diterima,      posted (or pickup trips taken) with value
//              belum faktur              not on an active invoice yet
//   unpaid     Belum lunas               invoiced, balance still open
//   paid       Lunas                     invoiced and settled (or status Paid)
//
// Cancelled orders are left out. Balances come from window.Balances (the same
// rules as the ledger); pickup orders read their trips from window.Trading.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.OrderPipeline.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var EPS = 0.5;
  var SIDES = {
    sales: {
      orders: 'salesOrders',
      delivered: 'Delivered',
      deliveredLabel: 'Terkirim, belum faktur',
    },
    purchases: {
      orders: 'purchaseOrders',
      delivered: 'Received',
      deliveredLabel: 'Diterima, belum faktur',
    },
  };
  var KEYS = ['draft', 'confirmed', 'delivered', 'unpaid', 'paid'];

  function db() {
    return window.DB || {};
  }
  function num(v) {
    return Number(v) || 0;
  }

  function stages(side) {
    var s = SIDES[side] || SIDES.sales;
    return [
      { key: 'draft', label: 'Draf' },
      { key: 'confirmed', label: 'Dikonfirmasi' },
      { key: 'delivered', label: s.deliveredLabel },
      { key: 'unpaid', label: 'Belum lunas' },
      { key: 'paid', label: 'Lunas' },
    ];
  }

  // Trips of a pickup order and the open balance of the invoices that cover them.
  function pickupStage(side, order) {
    var T = window.Trading;
    var B = window.Balances;
    if (order.status !== 'Closed') return 'confirmed';
    if (!T || !B) return 'paid';
    var trips =
      side === 'sales'
        ? T.tripsForSO(order.id)
        : T.slotsFor(order.id).filter(function (d) {
            return T.isTrip(d);
          });
    var seen = {};
    var unbilled = false;
    var open = 0;
    trips.forEach(function (d) {
      var inv = T.coveringInvoice(side, d.id);
      if (!inv) {
        unbilled = true;
        return;
      }
      if (seen[inv.id]) return;
      seen[inv.id] = true;
      open += num(B.invoiceBalance(side, inv).outstanding);
    });
    if (unbilled) return 'delivered';
    return open > EPS ? 'unpaid' : 'paid';
  }

  /** Stage key of one order, or null for a cancelled one. */
  function stageOf(side, order) {
    if (!order || order.status === 'Cancelled') return null;
    if (order.pickupFlow) return pickupStage(side, order);
    if (order.status === 'Draft') return 'draft';
    if (order.status === 'Confirmed') return 'confirmed';
    if (order.status === 'Paid') return 'paid';
    var B = window.Balances;
    if (!B) return 'delivered';
    var bal = B.orderBalance(side, order);
    if (!bal.invoice || num(bal.uninvoiced) > EPS) return 'delivered';
    return num(bal.outstanding) > EPS ? 'unpaid' : 'paid';
  }

  // Open balance of an order, for the "Belum lunas" figure.
  function outstandingOf(side, order) {
    var B = window.Balances;
    if (!B) return 0;
    if (order.pickupFlow && window.Trading) {
      var T = window.Trading;
      var seen = {};
      return (side === 'sales' ? T.tripsForSO(order.id) : T.slotsFor(order.id)).reduce(function (
        s,
        d
      ) {
        var inv = T.isTrip(d) ? T.coveringInvoice(side, d.id) : null;
        if (!inv || seen[inv.id]) return s;
        seen[inv.id] = true;
        return s + num(B.invoiceBalance(side, inv).outstanding);
      }, 0);
    }
    return num(B.orderBalance(side, order).outstanding);
  }

  function inPeriod(o, opts) {
    var d = String(o.date || '');
    if (opts.from && d < opts.from) return false;
    if (opts.to && d > opts.to) return false;
    return true;
  }

  /**
   * Count and value per stage. opts: { from, to } (order date, inclusive),
   * pickup: false to leave pickup orders out.
   * Returns { side, stages: [{ key, label, count, value, outstanding, ids }], total }.
   */
  function summary(side, opts) {
    opts = opts || {};
    var s = SIDES[side] || SIDES.sales;
    var byKey = {};
    var list = stages(side).map(function (st) {
      var row = { key: st.key, label: st.label, count: 0, value: 0, outstanding: 0, ids: [] };
      byKey[st.key] = row;
      return row;
    });
    var total = 0;
    (db()[s.orders] || []).forEach(function (o) {
      if (!o || !inPeriod(o, opts)) return;
      if (opts.pickup === false && o.pickupFlow) return;
      var key = stageOf(side, o);
      if (!key) return;
      var row = byKey[key];
      row.count++;
      row.value += num(o.amount);
      row.ids.push(o.id);
      if (key === 'unpaid') row.outstanding += outstandingOf(side, o);
      total++;
    });
    list.forEach(function (r) {
      r.value = Math.round(r.value);
      r.outstanding = Math.round(r.outstanding);
    });
    return { side: side, stages: list, total: total };
  }

  window.OrderPipeline = { KEYS: KEYS, stages: stages, stageOf: stageOf, summary: summary };
})();
