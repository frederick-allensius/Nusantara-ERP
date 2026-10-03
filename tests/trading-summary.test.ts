// ═══════════════════════════════════════════════════════════════════════════════
// Trading summary (trading-summary.js) — the figures behind the Ringkasan blocks
// for the pickup flow (meeting 14 Sep 2026):
//   • pipeline: open pickup POs, unused surat jalan, trips of a period split into
//     not billed / billed / paid on the customer and the supplier side
//   • per customer: not yet billed, billed and open, overdue, received this month
//     — adding up to the Piutang figure from Balances
//   • open pickup POs with quota, surat jalan used and cut-off warnings
//   • quantity per month with the trend against the same days of last month
//   • supplier invoices that differ from the trips, and weight-change alerts
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
  await import('../public/classic/core/trading-summary.js');
});

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };

function order(id: string, number: string, party: any, date: string, qty: number, price: number) {
  return {
    id,
    number,
    ...party,
    date,
    status: 'Confirmed',
    taxRate: 0.11,
    lines: [{ ...ITEM, qty, price, lineDiscount: 0, subtotal: qty * price }],
  };
}

function seed() {
  w().DB = {
    customers: [
      { id: 'C1', name: 'PT Arta', address: 'Jakarta Utara', termDays: 14 },
      { id: 'C2', name: 'PT Bumi', address: 'Bekasi', termDays: 30 },
    ],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [
      { id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0, cost: 100000, sell: 150000 },
    ],
    salesOrders: [
      order(
        'SO-1',
        'SO.2026.09.00001',
        { customer: 'PT Arta', customerId: 'C1' },
        '2026-09-01',
        100,
        150000
      ),
      order(
        'SO-2',
        'SO.2026.10.00001',
        { customer: 'PT Bumi', customerId: 'C2' },
        '2026-10-01',
        70,
        160000
      ),
    ],
    purchaseOrders: [
      order(
        'PO-1',
        'PO.2026.09.00001',
        { supplier: 'PT Batu Alam', supplierId: 'S1' },
        '2026-09-01',
        100,
        100000
      ),
      order(
        'PO-2',
        'PO.2026.10.00001',
        { supplier: 'PT Batu Alam', supplierId: 'S1' },
        '2026-10-01',
        70,
        100000
      ),
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
const S = () => w().TradingSummary;
const slot = (po: string, n: number) => T().slotsFor(po)[n - 1];
const trip = (po: string, n: number, date: string, net: number) =>
  T().recordTrip(slot(po, n).id, { date, net, vehicle: 'B 1234 XY' });

// PO-1 (September, PT Arta): trips of 35 t and 30 t, both invoiced; the first
// invoice paid on 1 Oct, the second overdue (14-day term). Supplier billed both.
// PO-2 (October, PT Bumi): one trip of 33 t, not invoiced yet.
function flow() {
  T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 });
  T().openPickupPO('PO-2', { soId: 'SO-2', capacity: 35 });
  trip('PO-1', 1, '2026-09-03', 35);
  trip('PO-1', 2, '2026-09-08', 30);
  trip('PO-2', 1, '2026-10-02', 33);
  const paid = T().createInvoice('sales', [slot('PO-1', 1).id], { date: '2026-09-07' }).invoice;
  w().DB.salesReceipts.push({
    id: 'SR-1',
    date: '2026-10-01',
    status: 'Posted',
    customer: 'PT Arta',
    customerId: 'C1',
    invoiceId: paid.id,
    amount: paid.amount,
  });
  w().Balances.recalcInvoiceStatus('sales', paid);
  T().createInvoice('sales', [slot('PO-1', 2).id], { date: '2026-09-10' });
  const pi = T().createInvoice('purchases', [slot('PO-1', 1).id, slot('PO-1', 2).id], {
    date: '2026-09-12',
  }).invoice;
  return { paid, pi };
}

const sale = (tons: number, price: number) => Math.round(tons * price * 1.11);

beforeEach(seed);

describe('without trading data', () => {
  it('reports nothing instead of zero-filled figures', () => {
    expect(S().hasData()).toBe(false);
    const p = S().pipeline('2026-10', { asOf: '2026-10-03' });
    expect(p.hasData).toBe(false);
    expect(p.taken.count).toBe(0);
    expect(S().poProgress('2026-10-03')).toEqual([]);
    expect(S().monthlyTonnage(6, { asOf: '2026-10-03' }).hasData).toBe(false);
    expect(S().supplierDiffs()).toMatchObject({ lines: [], bills: [], alerts: [], invoices: 0 });
    expect(S().byCustomer('2026-10-03').rows).toEqual([]);
  });
});

describe('pipeline', () => {
  it('splits the trips of a month into not billed / billed / paid on both sides', () => {
    flow();
    const p = S().pipeline('2026-09', { asOf: '2026-10-03' });
    expect(p.hasData).toBe(true);
    expect(p.period).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    // Both pickup POs are still open (PO-1 is past its cut-off but not closed yet).
    expect(p.openPOs.count).toBe(2);
    expect(p.openPOs.remaining).toEqual({ Ton: 35 + 37 });
    expect(p.slots.count).toBe(2); // PO-1 slot 3, PO-2 slot 2
    expect(p.taken).toMatchObject({ count: 2, qty: { Ton: 65 } });
    expect(p.taken.value).toBe(sale(35, 150000) + sale(30, 150000));
    expect(p.unbilled.count).toBe(0);
    expect(p.billed).toMatchObject({ count: 1, qty: { Ton: 30 }, value: sale(30, 150000) });
    expect(p.paid).toMatchObject({ count: 1, qty: { Ton: 35 } });
    expect(p.supplierUnbilled.count).toBe(0);
    expect(p.supplierBilled).toMatchObject({ count: 2, qty: { Ton: 65 } });
    expect(p.supplierPaid.count).toBe(0);
  });

  it('defaults to the month of asOf and carries unbilled trips from before it', () => {
    flow();
    const p = S().pipeline(undefined, { asOf: '2026-10-03' });
    expect(p.period.key).toBe('2026-10');
    expect(p.taken).toMatchObject({ count: 1, qty: { Ton: 33 } });
    expect(p.unbilled).toMatchObject({ count: 1, value: sale(33, 160000) });
    expect(p.supplierUnbilled.count).toBe(1);
    expect(p.carryOver.unbilled.count).toBe(0);

    // A September trip left unbilled shows as carried over into October.
    T().recordTrip(slot('PO-1', 3).id, { date: '2026-09-20', net: 20 }, { keepOpen: true });
    const q = S().pipeline('2026-10', { asOf: '2026-10-03' });
    expect(q.carryOver.unbilled).toMatchObject({ count: 1, qty: { Ton: 20 } });
    expect(q.carryOver.supplierUnbilled.count).toBe(1);
  });

  it('counts each trip once per side: unbilled + billed + paid = taken', () => {
    flow();
    const p = S().pipeline({ from: '2026-09-01', to: '2026-10-31' }, { asOf: '2026-10-03' });
    expect(p.unbilled.count + p.billed.count + p.paid.count).toBe(p.taken.count);
    expect(p.supplierUnbilled.count + p.supplierBilled.count + p.supplierPaid.count).toBe(
      p.taken.count
    );
    expect(p.unbilled.value + p.billed.value + p.paid.value).toBe(p.taken.value);
  });
});

describe('per customer', () => {
  it('splits open receivables and adds up to the Piutang figure', () => {
    flow();
    const r = S().byCustomer('2026-10-03');
    expect(r.rows.map((x: any) => x.customer)).toEqual(['PT Bumi', 'PT Arta']);
    const [bumi, arta] = r.rows;
    expect(bumi).toMatchObject({
      customerId: 'C2',
      unbilled: sale(33, 160000),
      unbilledCount: 1,
      unbilledQty: { Ton: 33 },
      oldestUnbilled: '2026-10-02',
      invoiced: 0,
      overdue: 0,
    });
    expect(arta).toMatchObject({
      customerId: 'C1',
      unbilled: 0,
      invoiced: sale(30, 150000),
      invoicedCount: 1,
      overdue: sale(30, 150000), // due 24 Sep (14 days)
      overdueCount: 1,
      paidThisMonth: sale(35, 150000),
    });
    const ar = w().Balances.summary('sales', { asOf: '2026-10-03' });
    expect(r.totals.open).toBe(ar.total);
  });

  it('counts only money received in the month of asOf, not applied down payments', () => {
    const { paid } = flow();
    w().DB.salesReceipts[0].date = '2026-09-30';
    w().DB.paymentLogs.push(
      { type: 'SO', orderId: 'SO-2', date: '2026-10-02', amount: 1000000, method: 'Transfer' },
      { type: 'SO', orderId: 'SO-2', date: '2026-10-02', amount: 500000, method: 'Down Payment' }
    );
    const r = S().byCustomer('2026-10-03');
    const arta = r.rows.find((x: any) => x.customerId === 'C1');
    const bumi = r.rows.find((x: any) => x.customerId === 'C2');
    expect(arta.paidThisMonth).toBe(0);
    expect(bumi.paidThisMonth).toBe(1000000);
    expect(paid.status).toBe('Paid');
  });
});

describe('pickup PO progress', () => {
  it('lists open POs with quota, surat jalan use and days to the cut-off', () => {
    flow();
    const list = S().poProgress('2026-09-28');
    expect(list.map((x: any) => x.number)).toEqual(['PO.2026.09.00001', 'PO.2026.10.00001']);
    expect(list[0]).toMatchObject({
      customer: 'PT Arta',
      supplier: 'PT Batu Alam',
      ordered: 100,
      taken: 65,
      tripsUsed: 2,
      tripsMax: 3,
      cutoff: '2026-09-30',
      daysToCutoff: 2,
      nearCutoff: true,
      pastCutoff: false,
      nearQuota: false,
      flagged: true,
    });
  });

  it('flags a PO past its cut-off and one at 90% of its quota', () => {
    flow();
    trip('PO-2', 2, '2026-10-03', 30); // 63 of 70 t
    const list = S().poProgress('2026-10-03');
    const po1 = list.find((x: any) => x.id === 'PO-1');
    const po2 = list.find((x: any) => x.id === 'PO-2');
    expect(po1).toMatchObject({ pastCutoff: true, daysToCutoff: -3, flagged: true });
    expect(po2).toMatchObject({ taken: 63, nearQuota: true, nearCutoff: false, flagged: true });
    expect(po2.pct).toBeCloseTo(0.9, 5);
  });

  it('leaves closed POs out', () => {
    flow();
    T().closePickupPO('PO-1', 'manual');
    expect(
      S()
        .poProgress('2026-10-03')
        .map((x: any) => x.id)
    ).toEqual(['PO-2']);
  });
});

describe('quantity per month', () => {
  it('totals the last N months and compares the current month with the same days before', () => {
    flow();
    const m = S().monthlyTonnage(3, { asOf: '2026-10-03' });
    expect(m.keys).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(m.unit).toBe('Ton');
    expect(m.partial).toBe(true);
    expect(m.totals.map((t: any) => t.value)).toEqual([0, 65, 33]);
    expect(m.totals.map((t: any) => t.change)).toEqual([null, 65, -32]);
    expect(m.sameDaysPrev).toBe(35); // 1–3 Sep
    expect(m.trend).toMatchObject({ current: 33, base: 35, diff: -2, dir: 'turun' });

    const arta = m.customers.find((c: any) => c.customerId === 'C1');
    const bumi = m.customers.find((c: any) => c.customerId === 'C2');
    expect(arta).toMatchObject({ values: [0, 65, 0], total: 65, sameDaysPrev: 35 });
    expect(arta.trend.dir).toBe('turun');
    expect(bumi.trend).toMatchObject({ dir: 'naik', pct: null });

    expect(m.salesOrders.map((r: any) => r.number)).toEqual([
      'SO.2026.09.00001',
      'SO.2026.10.00001',
    ]);
    expect(m.purchaseOrders.find((r: any) => r.poId === 'PO-2').values).toEqual([0, 0, 33]);
  });

  it('compares whole months once the month is over', () => {
    flow();
    const m = S().monthlyTonnage(2, { asOf: '2026-09-30' });
    expect(m.partial).toBe(false);
    expect(m.trend).toMatchObject({ current: 65, base: 0, dir: 'naik' });
  });

  it('never adds quantities of different units together', () => {
    expect(S().mainUnit({ Ton: 120, M3: 30 })).toBe('Ton');
    expect(S().mainUnit({})).toBe(null);
  });
});

describe('supplier differences and weight alerts', () => {
  it('finds supplier invoice lines that differ from their trips', () => {
    const { pi } = flow();
    expect(S().supplierDiffs().lines).toEqual([]);
    const line = pi.lines.find((l: any) => l.doId === slot('PO-1', 2).id);
    line.qty = 33; // supplier billed 33 t for a 30 t trip
    line.price = 105000;
    const d = S().supplierDiffs();
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({
      invoiceNumber: pi.number,
      sjNo: 'PO.2026.09.00001/02',
      tripQty: 30,
      billedQty: 33,
      qtyDiff: 3,
      tripPrice: 100000,
      billedPrice: 105000,
      priceDiff: 5000,
      valueDiff: 33 * 105000 - 30 * 100000,
      weightAlert: false,
    });
    expect(d.invoices).toBe(1);
  });

  it('compares a supplier bill total with the trips it covers', () => {
    const { pi } = flow();
    // The shape Tagihan Supplier (pickup-billing.js) stores on the invoice.
    pi.supplierRef = 'INV/BA/0912';
    pi.supplierBill = {
      qty: 70,
      price: 100000,
      ourQty: 65,
      qtyDiff: 5,
      reason: 'Selisih timbangan supplier',
    };
    const d = S().supplierDiffs();
    expect(d.bills).toHaveLength(1);
    expect(d.bills[0]).toMatchObject({
      supplierRef: 'INV/BA/0912',
      ourQty: 65,
      billedQty: 70,
      qtyDiff: 5,
      priceDiffers: false,
      reason: 'Selisih timbangan supplier',
    });
    // A supplier price that differs from the trips' purchase price is flagged too.
    pi.supplierBill = { qty: 65, price: 98000 };
    expect(S().supplierDiffs().bills[0]).toMatchObject({ qtyDiff: 0, priceDiffers: true });
    // A bill that matches the trips is not a difference.
    pi.supplierBill = { qty: 65, price: null };
    expect(S().supplierDiffs().bills).toEqual([]);
  });

  it('lists weight changes after invoicing until they are resolved', () => {
    flow();
    T().updateWeight(slot('PO-1', 1).id, { net: 36 }, { source: 'rekap 2' });
    const d = S().supplierDiffs();
    expect(d.alerts).toHaveLength(1);
    expect(d.alerts[0]).toMatchObject({ from: 35, to: 36, diff: 1, source: 'rekap 2' });
    // The supplier invoice still has 35 t for that trip.
    expect(d.lines[0]).toMatchObject({ qtyDiff: -1, weightAlert: true });
    T().resolveAlert(slot('PO-1', 1).id, 'Ditagihkan susulan');
    expect(S().supplierDiffs().alerts).toHaveLength(0);
  });
});

describe('unbilled trips by age', () => {
  it('lists customers whose oldest unbilled trip is older than 7 days', () => {
    flow();
    expect(S().unbilledAging('2026-10-05')).toEqual([]);
    const late = S().unbilledAging('2026-10-12');
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({
      customer: 'PT Bumi',
      count: 1,
      qty: { Ton: 33 },
      oldest: '2026-10-02',
      oldDays: 10,
      value: sale(33, 160000),
    });
  });
});
