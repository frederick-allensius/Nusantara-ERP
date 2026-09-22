import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// pipeline-extras.js is a classic <script> (IIFE) that attaches
// window._pipelineExtras. It reads/writes window.DB and calls window.saveDB.
// Load the GL stack too so we can prove journals are DERIVED from the PI the
// reconciliation flow produces (never hand-written).
beforeAll(async () => {
  (window as any).saveDB = vi.fn();
  (window as any).showToast = vi.fn();
  (window as any).openModal = vi.fn();
  (window as any).closeModal = vi.fn();
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/pipeline-extras.js');
});

declare global {
  interface Window {
    _pipelineExtras: any;
    GL: any;
    DB: any;
  }
}

function seedDB(over: any = {}) {
  (window as any).DB = {
    suppliers: [{ id: 5, name: 'UD Batu Alam' }],
    inventoryItems: [{ id: 100, name: 'Agregat', unit: 'Ton', stock: 0, cost: 50000, sell: 80000 }],
    purchaseOrders: [
      {
        id: 'PO-1',
        supplier: 'UD Batu Alam',
        supplierId: 5,
        status: 'Confirmed',
        taxRate: 0,
        lines: [{ itemId: 100, itemName: 'Agregat', unit: 'Ton', qty: 30, price: 50000 }],
      },
    ],
    goodsReceipts: [
      {
        id: 'GR-1',
        poId: 'PO-1',
        supplierName: 'UD Batu Alam',
        date: '2026-06-10',
        posted: true,
        items: [
          {
            itemId: 100,
            itemName: 'Agregat',
            unit: 'Ton',
            qty: 30,
            unitPrice: 50000,
            weighing: { suratJalanQty: 30, grossQty: 42, tareQty: 12, netQty: 30 },
          },
        ],
      },
    ],
    deliveryOrders: [{ id: 'DO-1', poId: 'PO-1', status: 'Sent' }],
    purchaseInvoices: [],
    salesInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    paymentLogs: [],
    journals: [],
    accountsChart: [],
    numberSequences: {},
    ...over,
  };
}

const P = () => (window as any)._pipelineExtras;

// ═══════════════════════════════════════════════════════════════════════════════
// computeWeighing — netQty is DERIVED as gross − tare
// ═══════════════════════════════════════════════════════════════════════════════
describe('computeWeighing', () => {
  it('derives netQty = grossQty − tareQty', () => {
    const w = P().computeWeighing({ suratJalanQty: 30, grossQty: 42, tareQty: 12 });
    expect(w.netQty).toBe(30);
    expect(w.suratJalanQty).toBe(30);
    expect(w.grossQty).toBe(42);
    expect(w.tareQty).toBe(12);
  });

  it('does NOT trust a supplied netQty when a gross reading exists', () => {
    // gross 40 − tare 10 = 30, even though a bogus netQty of 999 is passed in.
    const w = P().computeWeighing({ grossQty: 40, tareQty: 10, netQty: 999 });
    expect(w.netQty).toBe(30);
  });

  it('honors an explicit single netto figure when no gross reading is given', () => {
    const w = P().computeWeighing({ suratJalanQty: 25, netQty: 24.5 });
    expect(w.grossQty).toBe(0);
    expect(w.netQty).toBe(24.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeVariance — ordered vs surat-jalan vs weighed
// ═══════════════════════════════════════════════════════════════════════════════
describe('computeVariance', () => {
  it('computes order / weigh / reconcile variances per line', () => {
    const v = P().computeVariance({
      qty: 30, // ordered
      weighing: { suratJalanQty: 29, grossQty: 40, tareQty: 12 }, // netto 28
      reconciledQty: 28,
    });
    expect(v.orderedQty).toBe(30);
    expect(v.suratJalanQty).toBe(29);
    expect(v.netQty).toBe(28);
    expect(v.reconciledQty).toBe(28);
    // delivered (SJ 29) vs ordered (30) = −1
    expect(v.orderVariance).toBe(-1);
    // weighed (28) vs SJ (29) = −1 (shrinkage caught at the weighbridge)
    expect(v.weighVariance).toBe(-1);
    // confirmed (28) vs weighed (28) = 0
    expect(v.reconcileVariance).toBe(0);
  });

  it('defaults reconciledQty to the weighed netto when unset', () => {
    const v = P().computeVariance({
      qty: 30,
      weighing: { suratJalanQty: 30, grossQty: 40, tareQty: 12 }, // netto 28
    });
    expect(v.reconciledQty).toBe(28);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// invoiceBasisQty — reconciledQty drives invoicing, NOT the ordered qty
// ═══════════════════════════════════════════════════════════════════════════════
describe('invoiceBasisQty', () => {
  it('uses reconciledQty when the line is reconciled', () => {
    const q = P().invoiceBasisQty({
      qty: 30,
      weighing: { grossQty: 40, tareQty: 12, netQty: 28 },
      reconciledQty: 27.5,
    });
    expect(q).toBe(27.5);
  });

  it('falls back to weighed netto when not yet reconciled', () => {
    const q = P().invoiceBasisQty({
      qty: 30,
      weighing: { suratJalanQty: 29, grossQty: 40, tareQty: 12, netQty: 28 },
    });
    expect(q).toBe(28);
  });

  it('falls back to ordered qty when no weighing/reconciliation exists', () => {
    expect(P().invoiceBasisQty({ qty: 30 })).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildInvoiceLinesFromReceipt — invoice basis uses reconciledQty
// ═══════════════════════════════════════════════════════════════════════════════
describe('buildInvoiceLinesFromReceipt', () => {
  beforeEach(() => seedDB());

  it('builds lines using the reconciledQty (not the ordered qty)', () => {
    const receipt = (window as any).DB.goodsReceipts[0];
    receipt.items[0].reconciledQty = 28; // ordered was 30
    const lines = P().buildInvoiceLinesFromReceipt(receipt);
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(28);
    expect(lines[0].price).toBe(50000);
    expect(lines[0].subtotal).toBe(28 * 50000);
  });

  it('skips lines whose invoice basis is zero', () => {
    const receipt = {
      items: [{ itemId: 100, itemName: 'Agregat', qty: 0, unitPrice: 50000, reconciledQty: 0 }],
    };
    expect(P().buildInvoiceLinesFromReceipt(receipt)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// invoiceFromReceipt — end-to-end: reconcile → multi-invoice → GL derived
// ═══════════════════════════════════════════════════════════════════════════════
describe('invoiceFromReceipt (multi-invoice + derived GL)', () => {
  beforeEach(() => seedDB());

  it('refuses to invoice an un-reconciled receipt', () => {
    P().invoiceFromReceipt('GR-1');
    expect((window as any).DB.purchaseInvoices).toHaveLength(0);
  });

  it('creates a PI whose amount is based on reconciledQty, and marks DO Invoiced', () => {
    const receipt = (window as any).DB.goodsReceipts[0];
    receipt.reconciled = true;
    receipt.reconciledAt = '2026-06-11';
    receipt.items[0].reconciledQty = 28; // weighed short vs. ordered 30

    P().invoiceFromReceipt('GR-1');

    const pis = (window as any).DB.purchaseInvoices;
    expect(pis).toHaveLength(1);
    expect(pis[0].receiptId).toBe('GR-1');
    expect(pis[0].lines[0].qty).toBe(28);
    // amount = 28 × 50,000 (taxRate 0)
    expect(pis[0].amount).toBe(28 * 50000);
    expect(pis[0].status).toBe('Outstanding');

    // Only reconciled receipt → all invoiced → DO becomes 'Invoiced'.
    expect((window as any).DB.deliveryOrders[0].status).toBe('Invoiced');
  });

  it('produces MULTIPLE invoices across staged receipts for one PO (partial invoicing)', () => {
    // Add a second staged receipt against the same PO.
    (window as any).DB.goodsReceipts.push({
      id: 'GR-2',
      poId: 'PO-1',
      supplierName: 'UD Batu Alam',
      date: '2026-06-15',
      reconciled: true,
      items: [
        {
          itemId: 100,
          itemName: 'Agregat',
          unit: 'Ton',
          qty: 10,
          unitPrice: 50000,
          reconciledQty: 10,
        },
      ],
    });
    const r1 = (window as any).DB.goodsReceipts[0];
    r1.reconciled = true;
    r1.items[0].reconciledQty = 20;

    // Invoice the first receipt only → PO is only partially invoiced.
    P().invoiceFromReceipt('GR-1');
    expect((window as any).DB.purchaseInvoices).toHaveLength(1);
    expect((window as any).DB.deliveryOrders[0].status).toBe('Partially invoiced');

    // Invoice the second receipt → now every reconciled receipt is invoiced.
    P().invoiceFromReceipt('GR-2');
    expect((window as any).DB.purchaseInvoices).toHaveLength(2);
    expect((window as any).DB.deliveryOrders[0].status).toBe('Invoiced');
  });

  it('the PI feeds a BALANCED, DERIVED GL journal (no hand-written journals)', () => {
    const receipt = (window as any).DB.goodsReceipts[0];
    receipt.reconciled = true;
    receipt.items[0].reconciledQty = 28;
    P().invoiceFromReceipt('GR-1');

    const inv = (window as any).DB.purchaseInvoices[0];
    window.GL.ensureChart();
    const journals = window.GL.buildPIJournals(inv);
    expect(journals.length).toBeGreaterThan(0);
    const j = journals[0];
    expect(j.totals.debit).toBe(j.totals.credit);
  });
});
