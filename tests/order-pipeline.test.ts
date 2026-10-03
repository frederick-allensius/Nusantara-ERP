// ═══════════════════════════════════════════════════════════════════════════════
// Order pipeline (order-pipeline.js) — the stage of each sales / purchase order
// for the pipeline views: Draf → Dikonfirmasi → Terkirim belum faktur → Belum
// lunas → Lunas, with pickup orders staged by their trips and invoices.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;
const P = () => w().OrderPipeline;
const T = () => w().Trading;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
  await import('../public/classic/core/order-pipeline.js');
});

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };
const so = (id: string, status: string, amount: number, extra: any = {}) => ({
  id,
  number: id,
  customer: 'PT Arta',
  customerId: 'C1',
  date: '2026-09-01',
  status,
  amount,
  lines: [{ ...ITEM, qty: 1, price: amount, subtotal: amount }],
  ...extra,
});
const si = (id: string, sourceId: string, amount: number, status = 'Outstanding') => ({
  id,
  number: id,
  date: '2026-09-05',
  customer: 'PT Arta',
  customerId: 'C1',
  sourceType: 'SO',
  sourceId,
  status,
  amount,
  lines: [{ ...ITEM, qty: 1, price: amount, subtotal: amount }],
});

beforeEach(() => {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [{ id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0, cost: 100000 }],
    salesOrders: [
      so('SO-D', 'Draft', 100),
      so('SO-C', 'Confirmed', 200),
      so('SO-X', 'Cancelled', 999),
      so('SO-N', 'Delivered', 300),
      so('SO-U', 'Delivered', 400),
      so('SO-P', 'Delivered', 500),
      so('SO-OLD', 'Delivered', 600, { date: '2026-06-01' }),
    ],
    salesInvoices: [si('SI-U', 'SO-U', 400), si('SI-P', 'SO-P', 500)],
    salesReceipts: [
      { id: 'SR-1', date: '2026-09-06', status: 'Posted', invoiceId: 'SI-U', amount: 150 },
      { id: 'SR-2', date: '2026-09-06', status: 'Posted', invoiceId: 'SI-P', amount: 500 },
    ],
    purchaseOrders: [],
    purchaseInvoices: [],
    purchasePayments: [],
    deliveryOrders: [],
    salesReturns: [],
    purchaseReturns: [],
    paymentLogs: [],
    supplierPrices: [],
    numberSequences: {},
    journals: [],
    settings: {},
  };
});

describe('stageOf', () => {
  it('stages ordinary orders by status, invoice and balance', () => {
    const stage = (id: string) =>
      P().stageOf(
        'sales',
        w().DB.salesOrders.find((o: any) => o.id === id)
      );
    expect(['SO-D', 'SO-C', 'SO-N', 'SO-U', 'SO-P', 'SO-X'].map(stage)).toEqual([
      'draft',
      'confirmed',
      'delivered',
      'unpaid',
      'paid',
      null,
    ]);
  });

  it('stages a pickup order by its trips and their invoices', () => {
    const db = w().DB;
    db.salesOrders.push(
      so('SO-T', 'Confirmed', 1500000, {
        taxRate: 0,
        lines: [{ ...ITEM, qty: 10, price: 150000, subtotal: 1500000 }],
      })
    );
    db.purchaseOrders.push({
      id: 'PO-T',
      number: 'PO-T',
      supplier: 'PT Batu Alam',
      supplierId: 'S1',
      date: '2026-09-01',
      status: 'Confirmed',
      taxRate: 0,
      amount: 1000000,
      lines: [{ ...ITEM, qty: 10, price: 100000, subtotal: 1000000 }],
    });
    T().openPickupPO('PO-T', { soId: 'SO-T', capacity: 10 });
    const order = db.salesOrders.find((o: any) => o.id === 'SO-T');
    expect(P().stageOf('sales', order)).toBe('confirmed');

    T().recordTrip(T().slotsFor('PO-T')[0].id, { date: '2026-09-03', net: 10, vehicle: 'B 1 X' });
    expect(order.status).toBe('Closed');
    expect(P().stageOf('sales', order)).toBe('delivered'); // taken, not billed

    const inv = T().createInvoice('sales', [T().slotsFor('PO-T')[0].id], {
      date: '2026-09-07',
    }).invoice;
    expect(P().stageOf('sales', order)).toBe('unpaid');

    db.salesReceipts.push({
      id: 'SR-T',
      date: '2026-09-08',
      status: 'Posted',
      invoiceId: inv.id,
      amount: inv.amount,
    });
    expect(P().stageOf('sales', order)).toBe('paid');
  });
});

describe('summary', () => {
  it('counts orders per stage in the period with value and open balance', () => {
    const s = P().summary('sales', { from: '2026-09-01', to: '2026-09-30' });
    const row = (k: string) => s.stages.find((x: any) => x.key === k);
    expect(s.stages.map((x: any) => x.label)).toEqual([
      'Draf',
      'Dikonfirmasi',
      'Terkirim, belum faktur',
      'Belum lunas',
      'Lunas',
    ]);
    expect(row('delivered')).toMatchObject({ count: 1, value: 300, ids: ['SO-N'] }); // SO-OLD out of period
    expect(row('unpaid')).toMatchObject({ count: 1, value: 400, outstanding: 250 });
    expect(row('paid').count).toBe(1);
    expect(s.total).toBe(5); // cancelled left out
  });

  it('labels the purchase side as received', () => {
    expect(P().stages('purchases')[2].label).toBe('Diterima, belum faktur');
  });
});
