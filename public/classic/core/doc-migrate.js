// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Runtime Data Backfills  (doc-migrate.js)
//
// Runs ONCE per load, after loadDB() (the classic bundle loads only after the DB is
// ready). Idempotent: it only fills or normalizes fields that need it, and persists
// only if something actually changed.
//
//   Phase 1  stamp customerId / supplierId onto SO / PO / DO by matching the
//            denormalized party name (the name stays authoritative for display).
//   Phase 2  normalize imported field names (customerName → customer, …) and fill
//            missing document numbers.
//   Phase 3  replace random uid ids of SO/PO with their structured number, then
//            remap EVERY cross-reference to the renamed ids (delivery orders,
//            payment logs, invoices, down payments, goods receipts, returns,
//            reservations) so no linked document is orphaned.
//   Phase 4  normalize imported delivery-order statuses and destinations.
//   Phase 5  normalize legacy invoices and payment logs: status 'Unpaid' →
//            'Outstanding', soId/poId → sourceId + sourceType, payment type
//            'Sales'/'Purchase' → 'SO'/'PO'.
//
// Global-scope rule: classic <script>, IIFE-wrapped, declares no top-level names.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (!window.DB) {
    return;
  }

  function isUnset(v) {
    return v === null || v === undefined;
  }

  function idByName(collection, name) {
    if (!name) {
      return null;
    }
    const rec = (window.DB[collection] || []).find(p => p && p.name === name);
    return rec ? rec.id : null;
  }

  // ── Phase 2: lookup maps from window.defaultData (bridged by _accurateId) ────
  const soByAccurateId = {};
  const poByAccurateId = {};
  if (window.defaultData) {
    (window.defaultData.salesOrders || []).forEach(o => {
      if (o._accurateId != null) soByAccurateId[o._accurateId] = o;
    });
    (window.defaultData.purchaseOrders || []).forEach(o => {
      if (o._accurateId != null) poByAccurateId[o._accurateId] = o;
    });
  }

  let changed = 0;

  // Phase 3 remap tables: old id → new structured id
  const soIdRemap = {};
  const poIdRemap = {};

  // ── SO backfills ──────────────────────────────────────────────────────────────
  const soIds = new Set((window.DB.salesOrders || []).map(o => o.id));
  (window.DB.salesOrders || []).forEach(o => {
    if (!o.customer && o.customerName) {
      o.customer = o.customerName;
      changed++;
    }
    if (!o.number && o._accurateId != null && soByAccurateId[o._accurateId]) {
      o.number = soByAccurateId[o._accurateId].number || '';
      if (o.number) changed++;
    }
    if (o.number && o.id !== o.number && !/^SO[.\-]/.test(o.id) && !/^SI[.\-]/.test(o.id)) {
      const newId = o.number;
      if (!soIds.has(newId)) {
        const oldId = o.id;
        soIds.delete(oldId);
        o.id = newId;
        soIds.add(newId);
        soIdRemap[oldId] = newId;
        changed++;
      }
    }
    if (isUnset(o.customerId) && o.customer) {
      const id = idByName('customers', o.customer);
      if (!isUnset(id)) {
        o.customerId = id;
        changed++;
      }
    }
  });

  // ── DO backfills (Phase 4) ────────────────────────────────────────────────────
  // Imported raw statuses (SENT / INVOICED / PARTIAL_INVOICED / DRAFT) map to their
  // labels (Sent / Invoiced / Partially invoiced / Pending); the raw value is kept
  // in _accurateStatus. Destination falls back to notes line 2, then the
  // customer's address.
  const DO_RAW_STATUS = {
    SENT: 'Sent',
    INVOICED: 'Invoiced',
    PARTIAL_INVOICED: 'Partially invoiced',
    'PARTIALLY INVOICED': 'Partially invoiced',
    DRAFT: 'Pending',
  };
  function destFromNotes(notes) {
    const ls = String(notes || '')
      .split('\n')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
    return ls.length >= 2 ? ls[1] : '';
  }
  function addrByName(name) {
    const c = (window.DB.customers || []).find(p => p && p.name === name);
    return (c && c.address) || '';
  }
  (window.DB.deliveryOrders || []).forEach(o => {
    if (!o.customer && o.customerName) {
      o.customer = o.customerName;
      changed++;
    }
    if (isUnset(o.customerId) && o.customer) {
      const id = idByName('customers', o.customer);
      if (!isUnset(id)) {
        o.customerId = id;
        changed++;
      }
    }
    const raw = String(o._accurateStatus || o.status || '').toUpperCase();
    const mapped = DO_RAW_STATUS[raw];
    if (mapped) {
      o._accurateStatus = o._accurateStatus || o.status;
      if (o.status !== mapped) {
        o.status = mapped;
        changed++;
      }
    }
    if (!o.destination) {
      const dest = destFromNotes(o.notes) || addrByName(o.customer || o.customerName);
      if (dest) {
        o.destination = dest;
        changed++;
      }
    }
  });

  // ── PO backfills ──────────────────────────────────────────────────────────────
  const poIds = new Set((window.DB.purchaseOrders || []).map(o => o.id));
  (window.DB.purchaseOrders || []).forEach(o => {
    if (!o.supplier && o.supplierName) {
      o.supplier = o.supplierName;
      changed++;
    }
    if (!o.number && o._accurateId != null && poByAccurateId[o._accurateId]) {
      o.number = poByAccurateId[o._accurateId].number || '';
      if (o.number) changed++;
    }
    if (o.number && o.id !== o.number && !/^PO[.\-]/.test(o.id) && !/^PI[.\-]/.test(o.id)) {
      const newId = o.number;
      if (!poIds.has(newId)) {
        const oldId = o.id;
        poIds.delete(oldId);
        o.id = newId;
        poIds.add(newId);
        poIdRemap[oldId] = newId;
        changed++;
      }
    }
    if (isUnset(o.supplierId) && o.supplier) {
      const id = idByName('suppliers', o.supplier);
      if (!isUnset(id)) {
        o.supplierId = id;
        changed++;
      }
    }
  });

  // Phase 1b: backfill missing `number` on SO, PO, DO.
  const DE = window.DocEngine;
  if (DE) {
    [
      ['salesOrders', 'SO'],
      ['purchaseOrders', 'PO'],
      ['deliveryOrders', 'DO'],
    ].forEach(function (pair) {
      const coll = pair[0];
      const docType = pair[1];
      (window.DB[coll] || []).forEach(function (o) {
        if (!o.number) {
          o.number = DE.nextNumber(docType, o.date, { commit: true });
          changed++;
        }
      });
    });
  }

  // ── Phase 5: legacy invoices & payment logs ─────────────────────────────────
  // Runs before the Phase 3 remap so references written under the old field
  // names are remapped too.
  [
    ['salesInvoices', 'soId', 'SO'],
    ['purchaseInvoices', 'poId', 'PO'],
  ].forEach(function (spec) {
    (window.DB[spec[0]] || []).forEach(function (inv) {
      if (!inv) {
        return;
      }
      if (isUnset(inv.sourceId) && !isUnset(inv[spec[1]])) {
        inv.sourceId = String(inv[spec[1]]);
        inv.sourceType = inv.sourceType || spec[2];
        changed++;
      }
      if (inv.status === 'Unpaid') {
        inv.status = 'Outstanding';
        changed++;
      }
    });
  });
  (window.DB.paymentLogs || []).forEach(function (p) {
    if (p && p.type === 'Sales') {
      p.type = 'SO';
      changed++;
    } else if (p && p.type === 'Purchase') {
      p.type = 'PO';
      changed++;
    }
  });

  // ── Phase 3: remap every cross-reference to renamed SO/PO ids ────────────────
  function remap(collection, field, table, when) {
    (window.DB[collection] || []).forEach(function (d) {
      if (d && !isUnset(d[field]) && table[d[field]] && (!when || when(d))) {
        d[field] = table[d[field]];
        changed++;
      }
    });
  }
  if (Object.keys(soIdRemap).length || Object.keys(poIdRemap).length) {
    remap('deliveryOrders', 'soId', soIdRemap);
    remap('deliveryOrders', 'poId', poIdRemap);
    remap('paymentLogs', 'orderId', soIdRemap, p => p.type === 'SO');
    remap('paymentLogs', 'orderId', poIdRemap, p => p.type === 'PO');
    remap('salesInvoices', 'sourceId', soIdRemap, d => !d.sourceType || d.sourceType === 'SO');
    remap('purchaseInvoices', 'sourceId', poIdRemap, d => !d.sourceType || d.sourceType === 'PO');
    remap('salesDownPayments', 'orderId', soIdRemap);
    remap('purchaseDownPayments', 'orderId', poIdRemap);
    remap('goodsReceipts', 'poId', poIdRemap);
    remap('salesReturns', 'sourceId', soIdRemap, d => d.sourceType === 'SO');
    remap('purchaseReturns', 'sourceId', poIdRemap, d => d.sourceType === 'PO');
    const res = window.DB.reservations;
    if (res && typeof res === 'object' && !Array.isArray(res)) {
      Object.keys(res).forEach(function (oldId) {
        const newId = soIdRemap[oldId];
        if (newId && !res[newId]) {
          res[newId] = res[oldId];
          delete res[oldId];
          changed++;
        }
      });
    }
  }

  if (changed > 0 && typeof window.saveDB === 'function') {
    try {
      window.saveDB();
    } catch {
      /* persistence is best-effort; fields are already set in memory */
    }
    console.warn(`[ERP] Data backfill: normalized ${changed} field(s)`);
  }
})();
