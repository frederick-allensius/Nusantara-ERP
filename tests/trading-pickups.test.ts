// ═══════════════════════════════════════════════════════════════════════════════
// Trading pickups (trading.js) — the flow from the 14 Sep 2026 meeting:
//   • a supplier PO opened for pickup gets ceil(qty / truck capacity) surat jalan
//     up front and never more; it closes at its quota or its month-end cut-off
//   • each truck is a trip with a weighbridge netto (bruto − tara)
//   • customers and suppliers are invoiced from trips per period (several
//     invoices per PO); a trip is never billed twice
//   • a weight that changes in a later recap raises an alert when the trip was
//     already invoiced
//   • the ledger: purchase, cost and sale per trip, moved to the invoices once
//     they exist; inventory nets to zero; the trial balance stays balanced
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
});

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };

function seed() {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', address: 'Jakarta Utara', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [
      { id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0, cost: 100000, sell: 150000 },
    ],
    salesOrders: [
      {
        id: 'SO-1',
        number: 'SO.2026.09.00001',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-09-01',
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 100, price: 150000, lineDiscount: 0, subtotal: 15000000 }],
      },
    ],
    purchaseOrders: [
      {
        id: 'PO-1',
        number: 'PO.2026.09.00001',
        supplier: 'PT Batu Alam',
        supplierId: 'S1',
        date: '2026-09-01',
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 100, price: 100000, lineDiscount: 0, subtotal: 10000000 }],
      },
    ],
    deliveryOrders: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesReturns: [],
    purchaseReturns: [],
    paymentLogs: [],
    supplierPrices: [],
    numberSequences: {},
    accountsChart: [],
    journals: [],
    settings: {},
  };
}

const T = () => w().Trading;
const slot = (n: number) => T().slotsFor('PO-1')[n - 1];
const trip = (n: number, date: string, net: number, extra: any = {}) =>
  T().recordTrip(slot(n).id, { date, net, vehicle: 'B 1234 XY', ...extra });

function balanceOf(no: string) {
  w().GL.reconcileAll();
  const tb = w().GL.trialBalance();
  const row = tb.rows.find((r: any) => r.no === no);
  return { tb, bal: row ? row.debit - row.credit : 0 };
}

beforeEach(seed);

describe('opening a pickup PO', () => {
  it('creates ceil(qty / capacity) surat jalan numbered after the PO', () => {
    const r = T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 });
    expect(r.error).toBeUndefined();
    expect(r.slots).toHaveLength(3); // 100 / 35 = 2.9 → 3
    expect(r.slots.map((s: any) => s.sjNo)).toEqual([
      'PO.2026.09.00001/01',
      'PO.2026.09.00001/02',
      'PO.2026.09.00001/03',
    ]);
    expect(r.slots.every((s: any) => s.status === 'Pending' && s.customer === 'PT Arta')).toBe(
      true
    );
    const po = w().DB.purchaseOrders[0];
    expect(po.pickupFlow).toMatchObject({ soId: 'SO-1', maxTrips: 3, cutoff: '2026-09-30' });
    expect(w().DB.salesOrders[0].pickupFlow.poIds).toEqual(['PO-1']);
  });

  it('500 t at 35 t per truck gives 15 surat jalan', () => {
    expect(T().planTrips(500, 35)).toBe(15);
  });

  it('refuses a PO that is not confirmed or already opened', () => {
    w().DB.purchaseOrders[0].status = 'Draft';
    expect(T().openPickupPO('PO-1', {}).error).toMatch(/Dikonfirmasi/);
    w().DB.purchaseOrders[0].status = 'Confirmed';
    T().openPickupPO('PO-1', {});
    expect(T().openPickupPO('PO-1', {}).error).toMatch(/sudah dibuat/);
  });
});

describe('recording trips', () => {
  beforeEach(() => T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 }));

  it('derives netto from bruto − tara and fills the line at the SO price', () => {
    const r = trip(1, '2026-09-03', 0, { gross: 47.5, tare: 12 });
    expect(r.ok).toBe(true);
    const d = slot(1);
    expect(d.status).toBe('Delivered');
    expect(d.weighing).toMatchObject({ gross: 47.5, tare: 12, net: 35.5 });
    expect(d.lines[0]).toMatchObject({ qty: 35.5, price: 150000, subtotal: 5325000 });
    expect(d.purchasePrice).toBe(100000);
  });

  it('blocks a trip after the cut-off and before the PO date', () => {
    expect(trip(1, '2026-10-01', 30).error).toMatch(/Lewat batas PO/);
    expect(trip(1, '2026-08-31', 30).error).toMatch(/sebelum tanggal PO/);
  });

  it('blocks going over the quota unless confirmed, and closes the PO when full', () => {
    trip(1, '2026-09-03', 35);
    trip(2, '2026-09-04', 35);
    const r = trip(3, '2026-09-05', 35);
    expect(r.overQuota).toBe(true);
    const ok = T().recordTrip(slot(3).id, { date: '2026-09-05', net: 30 });
    expect(ok.ok).toBe(true);
    const po = w().DB.purchaseOrders[0];
    expect(po.status).toBe('Closed');
    expect(po.closedReason).toBe('quota');
    expect(w().DB.salesOrders[0].status).toBe('Closed');
  });

  it('uses the supplier price in effect on the trip date and warns when it differs from the PO', () => {
    w().DB.supplierPrices.push({
      supplierId: 'S1',
      itemId: '1',
      price: 105000,
      effectiveDate: '2026-09-04',
    });
    trip(1, '2026-09-03', 30);
    const r = trip(2, '2026-09-05', 30);
    expect(slot(1).purchasePrice).toBe(100000);
    expect(slot(2).purchasePrice).toBe(105000);
    expect(r.warnings.join(' ')).toMatch(/berbeda dari harga PO/);
  });

  it('closes POs past their cut-off and voids the unused surat jalan', () => {
    trip(1, '2026-09-03', 30);
    const closed = T().sweepCutoffs('2026-10-01');
    expect(closed.map((p: any) => p.id)).toEqual(['PO-1']);
    expect(w().DB.purchaseOrders[0].closedReason).toBe('cutoff');
    expect(slot(2).status).toBe('Cancelled');
    expect(slot(3).status).toBe('Cancelled');
    expect(w().DB.salesOrders[0].status).toBe('Confirmed'); // 70 t still owed
  });
});

describe('invoicing from trips', () => {
  beforeEach(() => {
    T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 });
    trip(1, '2026-09-03', 35);
    trip(2, '2026-09-08', 30);
  });

  it('bills a customer per period, one line per truck, never twice', () => {
    const week1 = T().unbilled('sales', { customerId: 'C1', from: '2026-09-01', to: '2026-09-07' });
    expect(week1.map((d: any) => d.id)).toEqual([slot(1).id]);
    const r = T().createInvoice(
      'sales',
      week1.map((d: any) => d.id),
      { date: '2026-09-07' }
    );
    expect(r.invoice).toMatchObject({
      sourceType: 'DO',
      sourceId: 'SO-1',
      amount: 5827500,
      tax: 577500,
    });
    expect(r.invoice.lines[0]).toMatchObject({ qty: 35, price: 150000, doId: slot(1).id });
    expect(slot(1).status).toBe('Invoiced');
    expect(T().createInvoice('sales', [slot(1).id]).error).toMatch(/sudah ada/);
    const week2 = T().unbilled('sales', { customerId: 'C1' });
    expect(week2.map((d: any) => d.id)).toEqual([slot(2).id]);
  });

  it('bills a supplier from trips at the trip purchase price', () => {
    const r = T().createInvoice('purchases', [slot(1).id, slot(2).id], { date: '2026-09-10' });
    expect(r.invoice.amount).toBe(Math.round(6500000 * 1.11));
    expect(r.invoice.supplierId).toBe('S1');
  });

  it('compares a supplier bill with our trips', () => {
    const c = T().compareSupplierBill({ supplierId: 'S1', qty: 70, price: 100000 });
    expect(c.ourQty).toBe(65);
    expect(c.qtyDiff).toBe(5);
    expect(c.priceDiffers).toBe(false);
  });
});

describe('weighbridge recap', () => {
  beforeEach(() => T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 }));

  it('reads a recap sheet with Indonesian headers and decimal commas', () => {
    const rows = T().recapRowsFromAoa([
      ['REKAP TIMBANGAN SEPTEMBER'],
      ['Tanggal', 'No SJ', 'No Polisi', 'Sopir', 'Bruto', 'Tara', 'Netto'],
      ['03/09/2026', 'PO.2026.09.00001/01', 'B 1234 XY', 'Budi', '47,5', '12', ''],
      ['', '', '', '', '', 'TOTAL', '35,5'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-09-03',
      sjNo: 'PO.2026.09.00001/01',
      net: 35.5,
      gross: 47.5,
    });
  });

  it('fills pending surat jalan and flags a changed weight on an invoiced trip', () => {
    const first = T().matchRecap([
      { sjNo: 'PO.2026.09.00001/01', date: '2026-09-03', vehicle: 'B 1234 XY', net: 30 },
    ]);
    expect(first.fill).toHaveLength(1);
    T().applyRecap(first, { source: 'rekap 1' });
    T().createInvoice('sales', [slot(1).id], { date: '2026-09-04' });

    // The next (cumulative) recap silently changed 30 → 35 on the same truck.
    const second = T().matchRecap([
      { sjNo: 'PO.2026.09.00001/01', date: '2026-09-03', vehicle: 'B 1234 XY', net: 35 },
      { sjNo: 'PO.2026.09.00001/02', date: '2026-09-05', vehicle: 'B 9 Z', net: 33 },
      { sjNo: 'XX/99', date: '2026-09-05', net: 20 },
    ]);
    expect(second.changed).toMatchObject([{ from: 30, to: 35, invoiced: true }]);
    expect(second.fill).toHaveLength(1);
    expect(second.unmatched).toHaveLength(1);
    const res = T().applyRecap(second, { source: 'rekap 2' });
    expect(res).toMatchObject({ filled: 1, changed: 1, alerts: 1 });
    expect(slot(1).weightAlert).toMatchObject({ from: 30, to: 35, resolved: false });
    expect(slot(1).weighHistory.map((h: any) => h.net)).toEqual([30, 35]);
    expect(T().openAlerts()).toHaveLength(1);
    T().resolveAlert(slot(1).id, 'Ditagihkan susulan');
    expect(T().openAlerts()).toHaveLength(0);
  });

  it('matches by date and truck when the recap has no SJ number', () => {
    trip(1, '2026-09-03', 30, { vehicle: 'B 1234 XY' });
    const m = T().matchRecap([{ date: '2026-09-03', vehicle: 'b-1234-xy', net: 31 }]);
    expect(m.changed).toHaveLength(1);
  });
});

describe('ledger', () => {
  beforeEach(() => {
    T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 });
    trip(1, '2026-09-03', 35);
    trip(2, '2026-09-08', 30);
  });

  it('posts purchase, cost and sale per trip; inventory nets to zero', () => {
    const { tb } = balanceOf('110401');
    expect(tb.balanced).toBe(true);
    const bal = (no: string) => {
      const r = tb.rows.find((x: any) => x.no === no);
      return r ? r.debit - r.credit : 0;
    };
    expect(bal('110401')).toBe(0); // inventory
    expect(bal('510101')).toBe(6500000); // HPP 65 t × 100.000
    expect(-bal('400001')).toBe(9750000); // sales 65 t × 150.000
    expect(bal('110201')).toBe(Math.round(9750000 * 1.11)); // receivable incl. PPN
    expect(-bal('210101')).toBe(Math.round(3500000 * 1.11) + Math.round(3000000 * 1.11));
  });

  it('moves the sale to the customer invoice without counting it twice', () => {
    T().createInvoice('sales', [slot(1).id, slot(2).id], { date: '2026-09-09' });
    const { tb } = balanceOf('400001');
    const sales = tb.rows.find((x: any) => x.no === '400001');
    expect(sales.credit - sales.debit).toBe(9750000);
    const hpp = tb.rows.find((x: any) => x.no === '510101');
    expect(hpp.debit - hpp.credit).toBe(6500000); // no extra cost from the invoice
    expect(tb.balanced).toBe(true);
  });

  it('moves the purchase to the supplier invoice; inventory still nets to zero', () => {
    T().createInvoice('purchases', [slot(1).id, slot(2).id], { date: '2026-09-10' });
    const { tb, bal } = balanceOf('110401');
    expect(bal).toBe(0);
    expect(tb.balanced).toBe(true);
  });

  it('lists uninvoiced trips as open receivables and payables', () => {
    const ar = w().Balances.summary('sales', { asOf: '2026-09-10' });
    expect(ar.items.filter((i: any) => i.unbilled)).toHaveLength(2);
    expect(ar.total).toBe(Math.round(5250000 * 1.11) + Math.round(4500000 * 1.11));
    T().createInvoice('sales', [slot(1).id], { date: '2026-09-09' });
    const after = w().Balances.summary('sales', { asOf: '2026-09-10' });
    expect(after.items.map((i: any) => i.docType).sort()).toEqual(['DO', 'SI']);
  });

  it('keeps an order-level status change from posting the pickup order again', () => {
    w().DB.purchaseOrders[0].status = 'Received';
    w().DB.salesOrders[0].status = 'Delivered';
    const { tb } = balanceOf('400001');
    const sales = tb.rows.find((x: any) => x.no === '400001');
    expect(sales.credit - sales.debit).toBe(9750000);
  });
});
