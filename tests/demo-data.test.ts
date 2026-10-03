// ═══════════════════════════════════════════════════════════════════════════════
// Demo dataset — the seed must follow the same rules as data entered in the app:
//   • stock per warehouse sums to item stock and never goes negative
//   • nothing is dated in the future; every document number is issued once
//   • invoices, receipts, deliveries and returns link to the right documents
//   • invoice status follows its settlements
//   • the derived ledger balances and its inventory equals the stock value
//   • the cases the dashboard and the meeting demo rely on are present
//   • the trading flow (trading.js) keeps its rules: surat jalan per PO, quota and
//     cut-off, each trip billed at most once per side, invoices = their trip lines
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';
import { buildDemoData } from '../src/core/demo-data.js';

const NOW = new Date('2026-09-14T10:00:00');
const TODAY = '2026-09-14';
const w = () => window as any;
const T = () => w().Trading;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
});

function load(now: Date = NOW) {
  const data: any = buildDemoData(now);
  const { bankAccounts, itemCategories, units, ...collections } = data;
  w().DB = {
    ...collections,
    accountsChart: [],
    numberSequences: {},
    settings: { bankAccounts, itemCategories, units, tax: { pkp: true, ppnRate: 0.11 } },
  };
  w().GL.reconcileAll();
  return w().DB;
}

const byId = (list: any[], id: unknown) => list.find(d => String(d.id) === String(id));
const pad2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthEnd = (date: string) =>
  iso(new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0));
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const NUMBERED = [
  'salesQuotations',
  'salesOrders',
  'purchaseOrders',
  'deliveryOrders',
  'salesInvoices',
  'purchaseInvoices',
  'salesReceipts',
  'purchasePayments',
  'salesReturns',
  'otherPayments',
  'otherDeposits',
  'bankTransfers',
];

// ── Invariants that hold for any "today" ──────────────────────────────────────
function checkDatesAndNumbers(db: any, today: string, now: Date) {
  NUMBERED.forEach(coll => {
    const docs = db[coll];
    expect(docs.length, coll).toBeGreaterThan(0);
    docs.forEach((d: any) => {
      if (d.date) {
        expect(d.date <= today, `${coll} ${d.number}`).toBe(true);
      }
    });
    const numbers = docs.map((d: any) => d.number);
    expect(new Set(numbers).size, coll).toBe(numbers.length);
    numbers.forEach((n: string) => expect(n, coll).toMatch(/^[A-Z]+\.\d{4}\.\d{2}\.\d{5}$/));
  });
  db.supplierPrices.forEach((p: any) => expect(p.effectiveDate <= today).toBe(true));
  // Timestamps of the trading records are never later than now.
  const limit = now.toISOString();
  const stamps: string[] = [];
  db.purchaseOrders
    .filter((o: any) => o.pickupFlow)
    .forEach((o: any) => stamps.push(o.pickupFlow.openedAt, o.closedAt));
  db.deliveryOrders
    .filter((d: any) => d.pickup)
    .forEach((d: any) => {
      stamps.push(d.cancelledAt, d.weightAlert && d.weightAlert.at);
      d.weighHistory.forEach((h: any) => stamps.push(h.at));
    });
  stamps.filter(Boolean).forEach(s => expect(s <= limit, s).toBe(true));
}

function checkLedger(db: any) {
  const tb = w().GL.trialBalance();
  expect(tb.balanced).toBe(true);
  const row = tb.rows.find((r: any) => r.no === '110401');
  const ledgerInventory = row ? row.debit - row.credit : 0;
  const stockValue = db.inventoryItems.reduce((s: number, i: any) => s + i.stock * i.cost, 0);
  expect(Math.abs(ledgerInventory - stockValue)).toBeLessThan(1000);
  // Every trip posts its own journal (purchase/cost/sale as far as not invoiced).
  const trips = db.deliveryOrders.filter((d: any) => T().isTrip(d));
  const tripJournals = db.journals.filter(
    (j: any) => j.source && j.source.docType === 'DO' && String(j.id).endsWith(':trip')
  );
  expect(tripJournals.length).toBe(trips.length);
  tb.rows
    .filter((r: any) => r.type === 'CASH_BANK')
    .forEach((r: any) => expect(r.debit - r.credit, r.name).toBeGreaterThan(0));
  // No cash or bank account is overdrawn on any day.
  const cash = new Set(tb.rows.filter((r: any) => r.type === 'CASH_BANK').map((r: any) => r.no));
  const running: Record<string, number> = {};
  const days = [...new Set(db.journals.map((j: any) => j.date))].sort() as string[];
  days.forEach(day => {
    db.journals
      .filter((j: any) => j.date === day)
      .forEach((j: any) =>
        j.lines
          .filter((l: any) => cash.has(l.accountNo))
          .forEach((l: any) => {
            running[l.accountNo] = (running[l.accountNo] || 0) + (l.debit || 0) - (l.credit || 0);
          })
      );
    Object.entries(running).forEach(([no, v]) =>
      expect(v, `${no} on ${day}`).toBeGreaterThanOrEqual(0)
    );
  });
}

const pickupPOs = (db: any) => db.purchaseOrders.filter((o: any) => o.pickupFlow);
const tripsOf = (db: any) => db.deliveryOrders.filter((d: any) => T().isTrip(d));

function checkPickupLinks(db: any) {
  db.deliveryOrders
    .filter((d: any) => d.pickup)
    .forEach((d: any) => {
      const po = byId(db.purchaseOrders, d.poId);
      const so = byId(db.salesOrders, d.soId);
      expect(po && po.pickupFlow, d.number).toBeTruthy();
      expect(so && so.pickupFlow, d.number).toBeTruthy();
      expect(po.pickupFlow.soId).toBe(so.id);
      expect(so.pickupFlow.poIds).toContain(po.id);
      expect(d.poNumber).toBe(po.number);
      expect(d.soNumber).toBe(so.number);
      expect(d.sjNo).toBe(`${po.number}/${pad2(d.slotNo)}`);
      // Surat jalan are numbered when the PO is opened.
      expect(d.number.slice(3, 10)).toBe(po.date.slice(0, 7).replace('-', '.'));
      expect(d.supplierId).toBe(po.supplierId);
      expect(d.customerId).toBe(so.customerId);
      expect(d.lines[0].itemId).toBe(po.lines[0].itemId);
      expect(so.lines.some((l: any) => l.itemId === po.lines[0].itemId)).toBe(true);
    });
  const sj = db.deliveryOrders.filter((d: any) => d.pickup).map((d: any) => d.sjNo);
  expect(new Set(sj).size).toBe(sj.length);
}

function checkQuotaAndCutoff(db: any, today: string) {
  pickupPOs(db).forEach((po: any) => {
    const u = T().usage(po, today);
    const slots = T().slotsFor(po.id);
    const flow = po.pickupFlow;
    expect(flow.maxTrips, po.number).toBe(Math.ceil(po.lines[0].qty / 35 - 1e-9));
    expect(slots.length, po.number).toBe(flow.maxTrips);
    expect(slots.map((s: any) => s.slotNo)).toEqual(slots.map((_: any, k: number) => k + 1));
    expect(u.tripsUsed, po.number).toBeLessThanOrEqual(flow.maxTrips);
    expect(flow.cutoff).toBe(monthEnd(po.date));
    // No documented exception: no PO goes over its quota.
    expect(u.taken, po.number).toBeLessThanOrEqual(u.ordered + 0.0005);
    slots.filter(T().isTrip).forEach((d: any) => {
      expect(d.date >= po.date && d.date <= flow.cutoff, d.sjNo).toBe(true);
      expect([1, 2, 3, 4, 5]).toContain(new Date(`${d.date}T00:00:00`).getDay());
    });
    if (po.status === 'Closed') {
      expect(u.tripsOpen, po.number).toBe(0);
      if (po.closedReason === 'quota') {
        expect(u.taken, po.number).toBeCloseTo(u.ordered, 3);
      } else {
        expect(po.closedReason).toBe('cutoff');
        expect(flow.cutoff < today).toBe(true);
      }
      slots
        .filter((s: any) => s.status === 'Cancelled')
        .forEach((s: any) => expect(s.voidReason).toMatch(/^PO /));
    } else {
      expect(po.status, po.number).toBe('Confirmed');
      expect(flow.cutoff >= today, po.number).toBe(true);
      expect(u.full, po.number).toBe(false);
    }
  });
  // Customer POs: closed once their POs are closed and the tonnage is taken.
  db.salesOrders
    .filter((o: any) => o.pickupFlow)
    .forEach((so: any) => {
      const taken = r3(
        T()
          .tripsForSO(so.id)
          .reduce((s: number, d: any) => s + T().netOf(d), 0)
      );
      expect(taken, so.number).toBeLessThanOrEqual(so.lines[0].qty + 0.0005);
      const pos = so.pickupFlow.poIds.map((id: string) => byId(db.purchaseOrders, id));
      const done =
        pos.every((p: any) => p.status === 'Closed') && taken >= so.lines[0].qty - 0.0005;
      expect(so.status, so.number).toBe(done ? 'Closed' : 'Confirmed');
    });
}

function checkTripBilling(db: any, today: string) {
  const active = (inv: any) => inv.status === 'Outstanding' || inv.status === 'Paid';
  const covering = (coll: string, id: string) =>
    db[coll].filter((inv: any) => active(inv) && (inv.doIds || []).includes(id));
  tripsOf(db).forEach((d: any) => {
    const si = covering('salesInvoices', d.id);
    expect(si.length, d.sjNo).toBeLessThanOrEqual(1);
    expect(covering('purchaseInvoices', d.id).length, d.sjNo).toBeLessThanOrEqual(1);
    expect(d.status, d.sjNo).toBe(si.length ? 'Invoiced' : 'Delivered');
  });
  [
    ['salesInvoices', 'salePrice', 'customerId'],
    ['purchaseInvoices', 'purchasePrice', 'supplierId'],
  ].forEach(([coll, priceKey, partyKey]) => {
    db[coll]
      .filter((inv: any) => Array.isArray(inv.doIds))
      .forEach((inv: any) => {
        expect(inv.sourceType, inv.number).toBe('DO');
        expect(inv.lines.length, inv.number).toBe(inv.doIds.length);
        expect(inv.lines.map((l: any) => l.doId).sort()).toEqual([...inv.doIds].sort());
        const trips = inv.doIds.map((id: string) => byId(db.deliveryOrders, id));
        trips.forEach((d: any) => {
          expect(T().isTrip(d), inv.number).toBe(true);
          expect(d[partyKey], inv.number).toBe(inv[partyKey]);
        });
        inv.lines.forEach((l: any) => {
          const d = byId(db.deliveryOrders, l.doId);
          const billed =
            coll === 'salesInvoices' && d.weightAlert ? d.weightAlert.from : T().netOf(d);
          expect(l.qty, `${inv.number} ${d.sjNo}`).toBe(billed);
          expect(l.price, `${inv.number} ${d.sjNo}`).toBe(d[priceKey]);
          expect(l.subtotal).toBe(Math.round(l.qty * l.price));
          expect(l.note.startsWith(d.sjNo)).toBe(true);
        });
        const subtotal = inv.lines.reduce((s: number, l: any) => s + l.subtotal, 0);
        expect(inv.tax, inv.number).toBe(Math.round(subtotal * inv.taxRate));
        expect(inv.amount, inv.number).toBe(subtotal + inv.tax);
        const dates = trips.map((d: any) => d.date).sort();
        expect([inv.periodFrom, inv.periodTo]).toEqual([dates[0], dates[dates.length - 1]]);
        expect(inv.date <= today).toBe(true);
        expect(dates[dates.length - 1] <= inv.date).toBe(true);
      });
  });
}

function checkAlert() {
  const alerts = T().openAlerts();
  expect(alerts).toHaveLength(1);
  const d = alerts[0];
  expect(d.weightAlert).toMatchObject({ from: 30, to: 35, resolved: false, purchaseInvoice: '' });
  expect(d.weighHistory.map((h: any) => h.net)).toEqual([30, 35]);
  expect(d.weighHistory[1]).toMatchObject({ source: 'rekap', prevNet: 30 });
  expect(T().netOf(d)).toBe(35);
  const si = T().coveringInvoice('sales', d.id);
  expect(si && si.number).toBe(d.weightAlert.salesInvoice);
  expect(si.lines.find((l: any) => l.doId === d.id).qty).toBe(30);
  expect(d.weightAlert.at >= `${si.date}`).toBe(true);
  // A supplier bill made after the recap carries the new figure.
  const pi = T().coveringInvoice('purchases', d.id);
  if (pi) {
    expect(pi.lines.find((l: any) => l.doId === d.id).qty).toBe(35);
  }
}

describe('demo data', () => {
  it('keeps per-warehouse stock consistent and non-negative', () => {
    const db = load();
    db.inventoryItems.forEach((item: any) => {
      const quantities = Object.values(item.warehouseStock).map(Number);
      quantities.forEach(q => expect(q, item.name).toBeGreaterThanOrEqual(0));
      const sum = Math.round(quantities.reduce((s, q) => s + q, 0) * 1000) / 1000;
      expect(sum, item.name).toBe(item.stock);
    });
  });

  it('dates nothing in the future and issues each number once', () => {
    checkDatesAndNumbers(load(), TODAY, NOW);
  });

  it('links documents the way the application does', () => {
    const db = load();
    db.salesInvoices
      .filter((inv: any) => inv.sourceType === 'SO')
      .forEach((inv: any) => {
        const so = byId(db.salesOrders, inv.sourceId);
        expect(so && so.status, inv.number).toBe('Delivered');
        expect(inv.sourceNumber).toBe(so.number);
      });
    db.purchaseInvoices
      .filter((inv: any) => inv.sourceType === 'PO')
      .forEach((inv: any) => {
        const po = byId(db.purchaseOrders, inv.sourceId);
        expect(po && po.status, inv.number).toBe('Received');
      });
    // Invoices from trips name their order when all trips come from one.
    db.salesInvoices
      .filter((inv: any) => inv.sourceType === 'DO' && inv.sourceId)
      .forEach((inv: any) =>
        expect(inv.sourceNumber).toBe(byId(db.salesOrders, inv.sourceId).number)
      );
    db.purchaseInvoices
      .filter((inv: any) => inv.sourceType === 'DO' && inv.sourceId)
      .forEach((inv: any) =>
        expect(inv.sourceNumber).toBe(byId(db.purchaseOrders, inv.sourceId).number)
      );
    expect(
      [...db.salesInvoices, ...db.purchaseInvoices].every((inv: any) =>
        ['SO', 'PO', 'DO'].includes(inv.sourceType)
      )
    ).toBe(true);
    db.salesReceipts.forEach((r: any) =>
      expect(byId(db.salesInvoices, r.invoiceId), r.number).toBeTruthy()
    );
    db.purchasePayments.forEach((p: any) =>
      expect(byId(db.purchaseInvoices, p.invoiceId), p.number).toBeTruthy()
    );
    db.deliveryOrders.forEach((d: any) =>
      expect(byId(db.salesOrders, d.soId), d.number).toBeTruthy()
    );
    db.salesReturns.forEach((r: any) => {
      const inv = byId(db.salesInvoices, r.sourceId);
      expect(inv && ['Outstanding', 'Paid'].includes(inv.status), r.number).toBe(true);
    });
    db.goodsReceipts.forEach((g: any) => expect(byId(db.purchaseOrders, g.poId)).toBeTruthy());
    const accepted = db.salesQuotations.find((q: any) => q.status === 'Accepted');
    expect(byId(db.salesOrders, accepted.convertedTo).sourceQuotation).toBe(accepted.id);
    expect(db.payrollRuns.length).toBeGreaterThan(0);
    db.payrollRuns.forEach((run: any) => {
      const salaries = run.details.reduce((s: number, d: any) => s + d.salary, 0);
      expect(salaries, run.id).toBe(run.totalAmount);
      expect(db.journalVouchers.some((j: any) => String(j.memo).includes(run.id))).toBe(true);
    });
  });

  it('sets each invoice status from its settlements', () => {
    const db = load();
    const B = w().Balances;
    db.salesInvoices.forEach((inv: any) => {
      const open = B.invoiceBalance('sales', inv).outstanding > B.EPS;
      expect(inv.status, inv.number).toBe(open ? 'Outstanding' : 'Paid');
    });
    db.purchaseInvoices.forEach((inv: any) => {
      const open = B.invoiceBalance('purchases', inv).outstanding > B.EPS;
      expect(inv.status, inv.number).toBe(open ? 'Outstanding' : 'Paid');
    });
  });

  it('derives a balanced ledger whose inventory equals the stock value', () => {
    checkLedger(load());
  });

  it('contains the cases the dashboard and the demo rely on', () => {
    const db = load();
    const B = w().Balances;
    expect(B.summary('sales', { asOf: TODAY }).overdueCount).toBeGreaterThan(0);
    expect(B.summary('purchases', { asOf: TODAY }).overdueCount).toBeGreaterThan(0);
    // A stocked item at or below its alert level; traded items have none.
    expect(db.inventoryItems.some((i: any) => i.min > 0 && i.stock <= i.min)).toBe(true);
    ['Draft', 'Confirmed', 'Delivered', 'Cancelled'].forEach(status =>
      expect(
        db.salesOrders.some((o: any) => o.status === status),
        status
      ).toBe(true)
    );
    expect(db.purchaseOrders.some((o: any) => o.status === 'Confirmed')).toBe(true);
    expect(db.salesQuotations.some((q: any) => q.status === 'Sent')).toBe(true);
    expect(db.salesDownPayments.length).toBeGreaterThan(0);
    expect(db.itemAdjustments.length + db.itemTransfers.length).toBeGreaterThan(1);
    expect(new Set(db.customers.map((c: any) => c.name)).size).toBe(db.customers.length);
    // Office expenses from petty cash every full month, alongside the others.
    const months = [...new Set(db.otherPayments.map((p: any) => p.date.slice(0, 7)))]
      .sort()
      .slice(0, -1) as string[];
    months.forEach(m =>
      ['Transport', 'ATK', 'Entertain', 'Sewa', 'Utilities'].forEach(cat =>
        expect(
          db.otherPayments.some((p: any) => p.date.startsWith(m) && p.category === cat),
          `${cat} ${m}`
        ).toBe(true)
      )
    );
  });
});

describe('demo data — trading flow', () => {
  it('links every surat jalan to a pickup PO and its customer PO', () => {
    const db = load();
    expect(tripsOf(db).length).toBeGreaterThan(100);
    checkPickupLinks(db);
  });

  it('keeps each PO to its surat jalan, quota and cut-off', () => {
    const db = load();
    checkQuotaAndCutoff(db, TODAY);
    const pos = pickupPOs(db);
    // Closed at the quota with surat jalan left over, voided.
    expect(
      pos.some(
        (po: any) =>
          po.closedReason === 'quota' &&
          T()
            .slotsFor(po.id)
            .some((s: any) => s.status === 'Cancelled' && s.voidReason === 'PO kuota terpenuhi')
      )
    ).toBe(true);
    // Closed at the cut-off with tonnage left; a PO the next month covers the rest.
    const cut = pos.filter((po: any) => po.closedReason === 'cutoff');
    expect(cut.length).toBeGreaterThan(0);
    cut.forEach((po: any) => {
      const u = T().usage(po, TODAY);
      expect(u.remaining).toBeGreaterThan(0);
      const so = byId(db.salesOrders, po.pickupFlow.soId);
      const next = so.pickupFlow.poIds
        .map((id: string) => byId(db.purchaseOrders, id))
        .find((p: any) => p.date === addDays(po.pickupFlow.cutoff, 1));
      expect(next, po.number).toBeTruthy();
      expect(next.lines[0].qty).toBeCloseTo(u.remaining, 3);
    });
    expect(
      db.salesOrders.some(
        (o: any) => o.pickupFlow && o.pickupFlow.poIds.length > 1 && o.status === 'Closed'
      )
    ).toBe(true);
    // This month: open POs with trips taken and surat jalan still pending.
    const open = pos.filter((po: any) => po.status === 'Confirmed');
    expect(open.length).toBeGreaterThan(0);
    expect(
      open.some((po: any) => {
        const u = T().usage(po, TODAY);
        return u.tripsUsed > 0 && u.tripsOpen > 0;
      })
    ).toBe(true);
  });

  it('bills each trip at most once per side; invoices equal their trip lines', () => {
    const db = load();
    checkTripBilling(db, TODAY);
    // Customers weekly, several invoices per customer PO; suppliers per month.
    const perSO: Record<string, number> = {};
    db.salesInvoices
      .filter((inv: any) => inv.doIds && inv.sourceId)
      .forEach((inv: any) => (perSO[inv.sourceId] = (perSO[inv.sourceId] || 0) + 1));
    expect(Object.values(perSO).some(n => n > 1)).toBe(true);
    expect(db.purchaseInvoices.filter((inv: any) => inv.doIds).length).toBeGreaterThan(3);
    // This week's trips are not invoiced yet and show as unbilled receivables.
    const unbilled = T().unbilled('sales');
    expect(unbilled.length).toBeGreaterThan(0);
    unbilled.forEach((d: any) => expect(d.date >= '2026-09-14').toBe(true));
    const ar = w().Balances.summary('sales', { asOf: TODAY });
    const items = ar.items.filter((i: any) => i.unbilled);
    expect(items.map((i: any) => i.id).sort()).toEqual(unbilled.map((d: any) => d.id).sort());
    const tripTotal = unbilled.reduce((s: number, d: any) => s + T().amounts(d).sale.total, 0);
    expect(items.reduce((s: number, i: any) => s + i.outstanding, 0)).toBe(tripTotal);
    expect(
      w()
        .Balances.summary('purchases', { asOf: TODAY })
        .items.some((i: any) => i.unbilled)
    ).toBe(true);
  });

  it('has one open weight alert: invoiced at 30 t, changed to 35 t by a later recap', () => {
    load();
    checkAlert();
    // On a day with an invoiced week this month, the alert is on this month's trip.
    expect(T().openAlerts()[0].date.slice(0, 7)).toBe(TODAY.slice(0, 7));
  });

  it('applies the supplier price from its effective date', () => {
    const db = load();
    expect(db.supplierPrices).toHaveLength(1);
    const sp = db.supplierPrices[0];
    expect(Object.keys(sp)).toEqual(
      expect.arrayContaining([
        'id',
        'supplierId',
        'supplierName',
        'itemId',
        'itemName',
        'unit',
        'price',
        'effectiveDate',
      ])
    );
    tripsOf(db).forEach((d: any) => {
      const po = byId(db.purchaseOrders, d.poId);
      expect(d.purchasePrice, d.sjNo).toBe(T().purchasePrice(po, d.lines[0].itemId, d.date).price);
    });
    // A PO opened before the change at the old price has trips on both sides of it.
    const across = pickupPOs(db).find((po: any) => {
      const trips = T().slotsFor(po.id).filter(T().isTrip);
      return (
        po.supplierId === sp.supplierId &&
        po.lines[0].itemId === sp.itemId &&
        po.date < sp.effectiveDate &&
        trips.some((d: any) => d.date < sp.effectiveDate) &&
        trips.some((d: any) => d.date >= sp.effectiveDate)
      );
    });
    expect(across).toBeTruthy();
    const trips = T().slotsFor(across.id).filter(T().isTrip);
    trips.forEach((d: any) =>
      expect(d.purchasePrice).toBe(d.date >= sp.effectiveDate ? sp.price : across.lines[0].price)
    );
    expect(sp.price).not.toBe(across.lines[0].price);
  });

  it('shows two customers on the same item the same day, and a changed destination', () => {
    const db = load();
    const seen: Record<string, Set<string>> = {};
    tripsOf(db).forEach((d: any) => {
      const key = `${d.date}|${d.lines[0].itemId}`;
      (seen[key] = seen[key] || new Set()).add(d.customerId);
    });
    expect(Object.values(seen).some(s => s.size > 1)).toBe(true);
    const moved = tripsOf(db).filter((d: any) => d.destChanged);
    expect(moved).toHaveLength(1);
    expect(moved[0].destOriginal).toBe(byId(db.customers, moved[0].customerId).address);
    expect(moved[0].destination).not.toBe(moved[0].destOriginal);
  });

  it('records the shapes trading.js creates', () => {
    const db = load();
    const demoSlot = db.deliveryOrders.find((d: any) => d.pickup && d.status === 'Pending');
    const demoTrip = tripsOf(db).find((d: any) => !d.destChanged && !d.weightAlert);
    const demoVoid = db.deliveryOrders.find((d: any) => d.pickup && d.status === 'Cancelled');
    const demoPO = pickupPOs(db)[0];
    const demoSO = byId(db.salesOrders, demoPO.pickupFlow.soId);
    const demoSI = db.salesInvoices.find((inv: any) => inv.doIds);
    const demoPI = db.purchaseInvoices.find((inv: any) => inv.doIds);

    // The same flow through trading.js on a scratch database.
    const so = { ...demoSO, id: 'SO-X', pickupFlow: undefined, status: 'Confirmed' };
    delete so.pickupFlow;
    const po = { ...demoPO, id: 'PO-X', status: 'Confirmed' };
    delete po.pickupFlow;
    w().DB = {
      customers: db.customers,
      suppliers: db.suppliers,
      inventoryItems: db.inventoryItems,
      salesOrders: [so],
      purchaseOrders: [po],
      deliveryOrders: [],
      salesInvoices: [],
      purchaseInvoices: [],
      supplierPrices: [],
      numberSequences: {},
      settings: {},
    };
    T().openPickupPO('PO-X', { soId: 'SO-X' });
    const keys = (o: any) => Object.keys(o).sort();
    expect(keys(po.pickupFlow)).toEqual(keys(demoPO.pickupFlow));
    expect(keys(so.pickupFlow)).toEqual(keys(demoSO.pickupFlow));
    const slots = T().slotsFor('PO-X');
    expect(keys(slots[0])).toEqual(keys(demoSlot));
    expect(keys(slots[0].lines[0])).toEqual(keys(demoSlot.lines[0]));
    T().recordTrip(slots[0].id, {
      date: po.date,
      gross: 47.5,
      tare: 12.5,
      vehicle: 'B 1 X',
      driver: 'Sopir',
      ticketNo: 'T-1',
    });
    expect(keys(slots[0])).toEqual(keys(demoTrip));
    expect(keys(slots[0].weighing)).toEqual(keys(demoTrip.weighing));
    expect(keys(slots[0].weighHistory[0])).toEqual(keys(demoTrip.weighHistory[0]));
    const built = T().buildInvoice('sales', [slots[0].id], { date: po.date }).invoice;
    expect(keys({ ...built, id: 1, number: 1 })).toEqual(keys(demoSI));
    expect(keys(built.lines[0])).toEqual(keys(demoSI.lines[0]));
    const bill = T().buildInvoice('purchases', [slots[0].id], { date: po.date, supplierRef: 'X' });
    expect(keys({ ...bill.invoice, id: 1, number: 1 })).toEqual(keys(demoPI));
    T().closePickupPO('PO-X', 'quota');
    expect(keys(slots[1])).toEqual(keys(demoVoid));
  });
});

// Ten "todays" across month starts and ends: the generator keeps every rule.
const DATES = [
  '2026-02-28',
  '2026-03-02',
  '2026-05-31',
  '2026-06-15',
  '2026-08-31',
  '2026-10-01',
  '2026-10-03',
  '2026-11-01',
  '2026-11-30',
  '2027-01-04',
];

describe.each(DATES)('demo data on %s', today => {
  it('keeps the ledger, cash, numbering and trading rules', () => {
    const now = new Date(`${today}T10:00:00`);
    const db = load(now);
    checkDatesAndNumbers(db, today, now);
    checkLedger(db);
    checkPickupLinks(db);
    checkQuotaAndCutoff(db, today);
    checkTripBilling(db, today);
    checkAlert();
    expect(db.inventoryItems.some((i: any) => i.min > 0 && i.stock <= i.min)).toBe(true);
    expect(db.itemAdjustments.length).toBeGreaterThan(0);
    expect(db.itemTransfers.length).toBeGreaterThan(0);
    // Trips not yet on a customer invoice show as unbilled receivables.
    const unbilled = T().unbilled('sales');
    const ar = w().Balances.summary('sales', { asOf: today });
    expect(ar.items.filter((i: any) => i.unbilled).length).toBe(unbilled.length);
    expect(
      w()
        .Balances.summary('purchases', { asOf: today })
        .items.some((i: any) => i.unbilled)
    ).toBe(true);
  });
});
