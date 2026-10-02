// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Receivable & Payable Balances  (balances.js)
//
// One place that answers "how much is still owed on this document?", so invoice
// lists, aging, party statements, the dashboard and notifications all show the
// same number. It mirrors the posting rules in gl.js:
//   • An order with an active invoice is billed through that invoice. Payments
//     logged on the order (including applied down payments), receipts on the
//     invoice and posted returns all reduce the invoice balance.
//   • A delivered/received order without an invoice is an open item on its own.
//   • A trading trip (trading.js) not yet on an invoice of that side is an open
//     item too ("belum ditagih"): the ledger already carries it as receivable or
//     payable (gl.js buildPickupJournals).
// Document `amount` already includes PPN, so balances include PPN too.
//
// Read-only (never mutates DB) except recalcInvoiceStatus().
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.Balances.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const EPS = 0.5;

  const SIDES = {
    sales: {
      orders: 'salesOrders',
      invoices: 'salesInvoices',
      settlements: 'salesReceipts',
      returns: 'salesReturns',
      orderType: 'SO',
      invoiceType: 'SI',
      postedStatus: 'Delivered',
      party: 'customer',
      partyId: 'customerId',
      parties: 'customers',
    },
    purchases: {
      orders: 'purchaseOrders',
      invoices: 'purchaseInvoices',
      settlements: 'purchasePayments',
      returns: 'purchaseReturns',
      orderType: 'PO',
      invoiceType: 'PI',
      postedStatus: 'Received',
      party: 'supplier',
      partyId: 'supplierId',
      parties: 'suppliers',
    },
  };

  function db() {
    return window.DB || {};
  }
  function num(v) {
    return Number(v) || 0;
  }
  function same(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function iso(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function todayISO() {
    return iso(new Date());
  }
  function addDays(dateStr, days) {
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) {
      return '';
    }
    d.setDate(d.getDate() + days);
    return iso(d);
  }
  function daysBetween(fromStr, toStr) {
    const a = new Date(String(fromStr).slice(0, 10) + 'T00:00:00');
    const b = new Date(String(toStr).slice(0, 10) + 'T00:00:00');
    if (isNaN(a) || isNaN(b)) {
      return 0;
    }
    return Math.round((b - a) / 86400000);
  }

  function isActiveInvoice(inv) {
    return !!inv && (inv.status === 'Outstanding' || inv.status === 'Paid');
  }

  function orderPaid(side, orderId) {
    return (db().paymentLogs || [])
      .filter(p => p.type === side.orderType && same(p.orderId, orderId))
      .reduce((s, p) => s + num(p.amount), 0);
  }

  function settled(side, invoiceId) {
    return (db()[side.settlements] || [])
      .filter(r => r.status === 'Posted' && same(r.invoiceId, invoiceId))
      .reduce((s, r) => s + num(r.amount), 0);
  }

  function returned(side, sourceType, sourceId) {
    return (db()[side.returns] || [])
      .filter(r => r.status === 'Posted' && r.sourceType === sourceType && same(r.sourceId, sourceId))
      .reduce((s, r) => s + num(r.amount), 0);
  }

  function activeInvoiceFor(sideKey, orderId) {
    const side = SIDES[sideKey];
    return (
      (db()[side.invoices] || []).find(
        inv =>
          isActiveInvoice(inv) &&
          same(inv.sourceId, orderId) &&
          (!inv.sourceType || inv.sourceType === side.orderType)
      ) || null
    );
  }

  function sourceOrder(sideKey, inv) {
    const side = SIDES[sideKey];
    if (!inv || !inv.sourceId || (inv.sourceType && inv.sourceType !== side.orderType)) {
      return null;
    }
    return (db()[side.orders] || []).find(o => same(o.id, inv.sourceId)) || null;
  }

  function result(total, payments, settlements, returns) {
    const credited = payments + settlements + returns;
    return {
      total,
      paid: payments + settlements,
      payments,
      settlements,
      returns,
      outstanding: Math.max(0, total - credited),
      overpaid: Math.max(0, credited - total),
    };
  }

  function invoiceBalance(sideKey, inv) {
    const side = SIDES[sideKey];
    const src = sourceOrder(sideKey, inv);
    return result(
      num(inv.amount),
      src ? orderPaid(side, src.id) : 0,
      settled(side, inv.id),
      returned(side, side.invoiceType, inv.id) + (src ? returned(side, side.orderType, src.id) : 0)
    );
  }

  function orderBalance(sideKey, order) {
    const side = SIDES[sideKey];
    const inv = activeInvoiceFor(sideKey, order.id);
    if (inv) {
      return Object.assign({ invoice: inv }, invoiceBalance(sideKey, inv));
    }
    return Object.assign(
      { invoice: null },
      result(num(order.amount), orderPaid(side, order.id), 0, returned(side, side.orderType, order.id))
    );
  }

  function partyOf(sideKey, doc) {
    const side = SIDES[sideKey];
    const list = db()[side.parties] || [];
    return (
      list.find(p => same(doc[side.partyId], p.id)) ||
      list.find(p => p.name && p.name === doc[side.party]) ||
      null
    );
  }

  // Payment term in days: the party's own term, else the company default, else 30.
  function termDays(party) {
    if (party) {
      const explicit = party.termDays != null ? party.termDays : party.paymentTermDays;
      if (explicit != null && Number.isFinite(Number(explicit))) {
        return Math.max(0, Number(explicit));
      }
      const m = String(party.paymentTerm || party.term || '').match(/(\d+)/);
      if (m) {
        return Number(m[1]);
      }
    }
    const def = Number((db().settings || {}).defaultTermDays);
    return Number.isFinite(def) && def > 0 ? def : 30;
  }

  function dueDateFor(sideKey, doc) {
    if (doc.dueDate) {
      return String(doc.dueDate).slice(0, 10);
    }
    const src = doc.sourceId ? sourceOrder(sideKey, doc) : null;
    if (src && src.dueDate) {
      return String(src.dueDate).slice(0, 10);
    }
    return doc.date ? addDays(doc.date, termDays(partyOf(sideKey, doc))) : '';
  }

  function makeItem(sideKey, docType, doc, bal, asOf) {
    const side = SIDES[sideKey];
    const dueDate = dueDateFor(sideKey, doc);
    const overdue = !!dueDate && dueDate < asOf && bal.outstanding > EPS;
    return {
      docType,
      id: doc.id,
      number: doc.number || doc.id,
      date: doc.date || '',
      dueDate,
      party: doc[side.party] || '',
      partyId: doc[side.partyId] != null ? String(doc[side.partyId]) : null,
      total: bal.total,
      paid: bal.paid,
      returns: bal.returns,
      outstanding: bal.outstanding,
      overdue,
      daysOverdue: overdue ? daysBetween(dueDate, asOf) : 0,
      ageDays: doc.date ? Math.max(0, daysBetween(doc.date, asOf)) : 0,
      doc,
    };
  }

  // Trips (trading pickups) of one side that no active invoice covers yet.
  function unbilledTrips(sideKey) {
    const T = window.Trading;
    return T && typeof T.unbilled === 'function' ? T.unbilled(sideKey) : [];
  }

  function tripTotal(sideKey, trip) {
    const a = window.Trading.amounts(trip);
    return sideKey === 'sales' ? a.sale.total : a.purchase.total;
  }

  // Open items for one side: active invoices, posted orders not yet invoiced, and
  // trips not yet invoiced.
  function openItems(sideKey, opts) {
    opts = opts || {};
    const side = SIDES[sideKey];
    const asOf = opts.asOf || todayISO();
    const keep = bal => opts.includeSettled || bal.outstanding > EPS;
    const items = [];
    (db()[side.invoices] || []).forEach(inv => {
      if (!isActiveInvoice(inv)) {
        return;
      }
      const bal = invoiceBalance(sideKey, inv);
      if (keep(bal)) {
        items.push(makeItem(sideKey, side.invoiceType, inv, bal, asOf));
      }
    });
    (db()[side.orders] || []).forEach(o => {
      if (o.status !== side.postedStatus || activeInvoiceFor(sideKey, o.id)) {
        return;
      }
      const bal = orderBalance(sideKey, o);
      if (keep(bal)) {
        items.push(makeItem(sideKey, side.orderType, o, bal, asOf));
      }
    });
    unbilledTrips(sideKey).forEach(t => {
      const bal = result(tripTotal(sideKey, t), 0, 0, 0);
      if (keep(bal)) {
        const item = makeItem(sideKey, 'DO', t, bal, asOf);
        item.number = t.sjNo || item.number;
        item.unbilled = true;
        items.push(item);
      }
    });
    return items;
  }

  function summary(sideKey, opts) {
    const asOf = (opts && opts.asOf) || todayISO();
    const items = openItems(sideKey, Object.assign({}, opts, { asOf }));
    const soonLimit = addDays(asOf, 7);
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    let total = 0;
    let overdue = 0;
    let dueSoon = 0;
    let overdueCount = 0;
    items.forEach(it => {
      total += it.outstanding;
      if (it.overdue) {
        overdue += it.outstanding;
        overdueCount++;
        const d = it.daysOverdue;
        if (d <= 30) {
          buckets.d1_30 += it.outstanding;
        } else if (d <= 60) {
          buckets.d31_60 += it.outstanding;
        } else if (d <= 90) {
          buckets.d61_90 += it.outstanding;
        } else {
          buckets.d90plus += it.outstanding;
        }
      } else {
        buckets.current += it.outstanding;
        if (it.dueDate && it.dueDate <= soonLimit) {
          dueSoon += it.outstanding;
        }
      }
    });
    return { total, overdue, dueSoon, count: items.length, overdueCount, buckets, items };
  }

  // Keep an active invoice's status in step with its balance (Outstanding ⇄ Paid).
  function recalcInvoiceStatus(sideKey, inv) {
    if (!isActiveInvoice(inv)) {
      return inv ? inv.status : null;
    }
    const bal = invoiceBalance(sideKey, inv);
    inv.status = bal.total > 0 && bal.outstanding <= EPS ? 'Paid' : 'Outstanding';
    return inv.status;
  }

  // Chronological statement for one customer (sales) or supplier (purchases):
  // charges (invoices, uninvoiced posted orders) and credits (payments, receipts,
  // returns). The running balance ends at what the party still owes (or is owed).
  function partyStatement(sideKey, partyId, partyName) {
    const side = SIDES[sideKey];
    const data = db();
    const mine = d =>
      d && (same(d[side.partyId], partyId) || (!!partyName && d[side.party] === partyName));
    const entries = [];

    const orders = (data[side.orders] || []).filter(o => mine(o) && o.status !== 'Cancelled');
    const orderIds = new Set(orders.map(o => String(o.id)));

    (data[side.invoices] || []).forEach(inv => {
      if (isActiveInvoice(inv) && mine(inv)) {
        entries.push({ date: inv.date || '', docType: side.invoiceType, id: inv.id, number: inv.number || inv.id, debit: num(inv.amount), credit: 0 });
      }
    });
    orders.forEach(o => {
      if (o.status === side.postedStatus && !activeInvoiceFor(sideKey, o.id)) {
        entries.push({ date: o.date || '', docType: side.orderType, id: o.id, number: o.number || o.id, debit: num(o.amount), credit: 0 });
      }
    });
    unbilledTrips(sideKey).forEach(t => {
      if (mine(t)) {
        entries.push({ date: t.date || '', docType: 'DO', id: t.id, number: t.sjNo || t.number || t.id, unbilled: true, debit: tripTotal(sideKey, t), credit: 0 });
      }
    });
    (data.paymentLogs || []).forEach(p => {
      if (p.type === side.orderType && orderIds.has(String(p.orderId))) {
        entries.push({
          date: p.date || '',
          docType: 'PAY',
          id: p.orderId,
          number: p.orderId,
          method: p.method || '',
          downPayment: p.method === 'Down Payment' || p.source === 'DP',
          debit: 0,
          credit: num(p.amount),
        });
      }
    });
    const invoiceIds = new Set(
      (data[side.invoices] || []).filter(inv => mine(inv)).map(inv => String(inv.id))
    );
    (data[side.settlements] || []).forEach(r => {
      if (r.status === 'Posted' && (mine(r) || invoiceIds.has(String(r.invoiceId)))) {
        entries.push({ date: r.date || '', docType: sideKey === 'sales' ? 'SR' : 'PP', id: r.id, number: r.number || r.id, method: r.paymentMethod || '', debit: 0, credit: num(r.amount) });
      }
    });
    (data[side.returns] || []).forEach(r => {
      if (r.status === 'Posted' && mine(r)) {
        entries.push({ date: r.date || '', docType: sideKey === 'sales' ? 'SRN' : 'PRN', id: r.id, number: r.number || r.id, debit: 0, credit: num(r.amount) });
      }
    });

    // Oldest first; on the same date charges come before their settlements.
    entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : b.debit - a.debit));
    let running = 0;
    entries.forEach(e => {
      running += e.debit - e.credit;
      e.balance = running;
    });
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    return { entries, totalDebit, totalCredit, balance: totalDebit - totalCredit };
  }

  window.Balances = {
    EPS,
    isActiveInvoice,
    activeInvoiceFor,
    sourceOrder,
    invoiceBalance,
    orderBalance,
    dueDateFor,
    termDays,
    openItems,
    summary,
    recalcInvoiceStatus,
    partyStatement,
    todayISO,
    addDays,
    daysBetween,
  };
})();
