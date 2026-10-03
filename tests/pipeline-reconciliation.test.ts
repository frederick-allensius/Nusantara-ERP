import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';

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
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/pipeline-extras.js');
  await import('../public/classic/core/sales-purchase-extras.js');
});

declare global {
  interface Window {
    _pipelineExtras: any;
    GL: any;
    Balances: any;
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

  it('is stable on its own output (a stored single netto keeps its netto)', () => {
    const single = P().computeWeighing({ suratJalanQty: 25, netQty: 24.5 });
    expect(P().computeWeighing(single)).toEqual(single);
    const bruto = P().computeWeighing({ suratJalanQty: 30, grossQty: 42, tareQty: 12 });
    expect(P().computeWeighing(bruto)).toEqual(bruto);
    // …so the variance of a single-netto line uses that netto, not 0.
    expect(P().computeVariance({ qty: 25, weighing: single }).netQty).toBe(24.5);
  });

  // The receive-modal save path (sales-purchase-extras.openReceiveItem) builds
  // its weighing input exactly like the two cases below and routes it through
  // computeWeighing so the UI capture cannot drift from the pure engine. These
  // pin that a single-netto receipt persists a non-zero netQty (regression: the
  // old `net = gross > 0 ? gross - tare : 0` zeroed it) while a bruto receipt
  // still derives netto and ignores any typed netto.
  it('single-netto receipt (no bruto) keeps the operator netto, not 0', () => {
    // Mirrors the save path when the operator leaves Bruto empty and types Netto.
    const w = P().computeWeighing({ suratJalanQty: 25, tareQty: 0, netQty: 24.6 });
    expect(w.grossQty).toBe(0);
    expect(w.netQty).toBe(24.6); // not silently zeroed
  });

  it('bruto receipt derives netto and ignores a typed netto figure', () => {
    // Mirrors the save path when Bruto is present (netto field is derived/locked).
    const w = P().computeWeighing({ suratJalanQty: 30, grossQty: 42, tareQty: 12, netQty: 999 });
    expect(w.netQty).toBe(30);
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

// ═══════════════════════════════════════════════════════════════════════════════
// invoiceFromReceipt — follows the app's purchase-invoice model (invoice-view.js)
// ═══════════════════════════════════════════════════════════════════════════════
describe('invoiceFromReceipt (invoice model)', () => {
  beforeEach(() => {
    seedDB({
      suppliers: [{ id: 5, name: 'UD Batu Alam', termDays: 14 }],
    });
    const po = (window as any).DB.purchaseOrders[0];
    po.number = 'PO.2026.06.00001';
    po.taxRate = 0.11;
    const r = (window as any).DB.goodsReceipts[0];
    r.reconciled = true;
    r.items[0].reconciledQty = 30;
  });
  afterEach(() => {
    delete (window as any).erpAuth;
  });

  it('numbers the PI through DocEngine and links it to the PO and the receipt', () => {
    (window as any).erpAuth = { getCurrentUser: () => ({ username: 'gudang1' }) };
    const inv = P().invoiceFromReceipt('GR-1');
    const DB = (window as any).DB;
    expect(DB.purchaseInvoices).toEqual([inv]);
    expect(inv.id).toMatch(/^PI\.\d{4}\.\d{2}\.\d{5}$/);
    expect(inv.number).toBe(inv.id);
    expect(DB.numberSequences.PI).toBeTruthy();
    expect(inv.sourceType).toBe('PO');
    expect(inv.sourceId).toBe('PO-1');
    expect(inv.sourceNumber).toBe('PO.2026.06.00001');
    expect(inv.receiptId).toBe('GR-1');
    expect(inv.supplier).toBe('UD Batu Alam');
    expect(inv.supplierId).toBe('5');
    expect(inv.createdBy).toBe('gudang1');
    expect(inv.status).toBe('Outstanding');
    expect('paid' in inv).toBe(false);
    // PPN from the PO; amount = DPP + PPN.
    expect(inv.taxRate).toBe(0.11);
    expect(inv.taxInclusive).toBe(false);
    expect(inv.tax).toBe(165000);
    expect(inv.amount).toBe(1500000 + 165000);
    // Due date from the supplier's payment term.
    expect(inv.dueDate).toBe(window.Balances.addDays(inv.date, 14));
    // Balances finds it as the PO's invoice and computes its balance (no stored paid).
    expect(window.Balances.activeInvoiceFor('purchases', 'PO-1')).toBe(inv);
    expect(window.Balances.invoiceBalance('purchases', inv).outstanding).toBe(inv.amount);
  });

  it('keeps a tax-inclusive PO inclusive', () => {
    const po = (window as any).DB.purchaseOrders[0];
    po.taxInclusive = true;
    const inv = P().invoiceFromReceipt('GR-1');
    expect(inv.taxInclusive).toBe(true);
    expect(inv.amount).toBe(1500000);
    expect(inv.tax).toBe(Math.round((1500000 * 0.11) / 1.11));
  });

  it('refuses a second invoice for the same receipt', () => {
    P().invoiceFromReceipt('GR-1');
    expect(P().invoiceFromReceipt('GR-1')).toBeNull();
    expect((window as any).DB.purchaseInvoices).toHaveLength(1);
  });

  it('allows a new invoice once the earlier one is cancelled', () => {
    const first = P().invoiceFromReceipt('GR-1');
    first.status = 'Cancelled';
    const second = P().invoiceFromReceipt('GR-1');
    expect(second).toBeTruthy();
    expect(second.id).not.toBe(first.id);
  });

  it('refuses when the whole PO is already invoiced (PI made from the PO)', () => {
    (window as any).DB.purchaseInvoices.push({
      id: 'PI-X',
      number: 'PI.2026.06.00009',
      status: 'Outstanding',
      sourceType: 'PO',
      sourceId: 'PO-1',
      amount: 1665000,
      lines: [],
    });
    expect(P().invoiceFromReceipt('GR-1')).toBeNull();
    expect((window as any).DB.purchaseInvoices).toHaveLength(1);
  });

  it('does not touch trading pickup slots or cancelled delivery orders', () => {
    const DB = (window as any).DB;
    DB.deliveryOrders.push(
      { id: 'DO-2', poId: 'PO-1', pickup: true, status: 'Delivered' },
      { id: 'DO-3', poId: 'PO-1', status: 'Cancelled' }
    );
    P().invoiceFromReceipt('GR-1');
    expect(DB.deliveryOrders.find((d: any) => d.id === 'DO-1').status).toBe('Invoiced');
    expect(DB.deliveryOrders.find((d: any) => d.id === 'DO-2').status).toBe('Delivered');
    expect(DB.deliveryOrders.find((d: any) => d.id === 'DO-3').status).toBe('Cancelled');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Trial balance for a PO received in several receipts and invoiced per receipt.
// Inventory must equal what was received; payable = invoiced + received but not
// invoiced yet. The PO-level receipt journal stops at the first invoice (T-02),
// so receipts not invoiced yet post on their own (gl.js receivedNotInvoiced).
// ═══════════════════════════════════════════════════════════════════════════════
describe('PO received in parts and invoiced per receipt — ledger', () => {
  const PRICE = 50000;
  const RATE = 0.11;

  function receipt(id: string, qty: number, date: string, posted: boolean) {
    return {
      id,
      poId: 'PO-T',
      supplierName: 'UD Batu Alam',
      date,
      posted,
      reconciled: true,
      items: [
        {
          itemId: 100,
          itemName: 'Agregat',
          unit: 'Ton',
          qty,
          unitPrice: PRICE,
          reconciledQty: qty,
          weighing: { suratJalanQty: qty, grossQty: qty + 20, tareQty: 20, netQty: qty },
        },
      ],
    };
  }

  function seedPO() {
    seedDB({
      suppliers: [{ id: 5, name: 'UD Batu Alam', termDays: 30 }],
      purchaseOrders: [
        {
          id: 'PO-T',
          number: 'PO.2026.06.00002',
          supplier: 'UD Batu Alam',
          supplierId: 5,
          date: '2026-06-01',
          status: 'Confirmed',
          taxRate: RATE,
          tax: Math.round(100 * PRICE * RATE),
          amount: Math.round(100 * PRICE * (1 + RATE)),
          lines: [
            {
              itemId: 100,
              itemName: 'Agregat',
              unit: 'Ton',
              qty: 100,
              price: PRICE,
              subtotal: 100 * PRICE,
            },
          ],
        },
      ],
      goodsReceipts: [
        receipt('GR-A', 60, '2026-06-10', true),
        receipt('GR-B', 40, '2026-06-20', false),
      ],
      deliveryOrders: [],
    });
  }

  function ledger() {
    window.GL.reconcileAll();
    const tb = window.GL.trialBalance();
    const net = (no: string) => {
      const r = tb.rows.find((x: any) => x.no === no);
      return r ? r.debit - r.credit : 0;
    };
    return {
      balanced: tb.balanced,
      inventory: net('110401'),
      ppnIn: net('130101'),
      payable: -net('210101'),
    };
  }

  // What the ledger should show, from the documents themselves.
  function expected() {
    const DB = (window as any).DB;
    const active = DB.purchaseInvoices.filter(
      (i: any) => i.status === 'Outstanding' || i.status === 'Paid'
    );
    const invoicedIds = new Set(active.map((i: any) => i.receiptId));
    const posted = DB.goodsReceipts.filter((r: any) => r.posted);
    const receivedQty = posted.reduce((s: number, r: any) => s + r.items[0].qty, 0);
    const uninvoiced = posted
      .filter((r: any) => !invoicedIds.has(r.id))
      .reduce((s: number, r: any) => s + Math.round(r.items[0].qty * PRICE * (1 + RATE)), 0);
    const invoiced = active.reduce((s: number, i: any) => s + i.amount, 0);
    const paidOnPO = DB.paymentLogs.reduce((s: number, p: any) => s + p.amount, 0);
    return { inventory: receivedQty * PRICE, payable: invoiced + uninvoiced - paidOnPO };
  }

  function receiveB() {
    const DB = (window as any).DB;
    DB.goodsReceipts[1].posted = true;
    DB.purchaseOrders[0].status = 'Received'; // all 100 received (completePOIfReceived)
  }

  beforeEach(() => seedPO());

  it('invoice GR-A, then receive GR-B, then invoice GR-B', () => {
    P().invoiceFromReceipt('GR-A');
    let l = ledger();
    expect(l.balanced).toBe(true);
    expect(l.inventory).toBe(60 * PRICE);
    expect(l.payable).toBe(expected().payable);
    expect(l.payable).toBe(Math.round(60 * PRICE * (1 + RATE)));

    receiveB();
    l = ledger();
    expect(l.balanced).toBe(true);
    expect(l.inventory).toBe(100 * PRICE); // GR-B posts on its own until invoiced
    expect(l.inventory).toBe(expected().inventory);
    expect(l.payable).toBe(expected().payable);
    expect(l.payable).toBe(Math.round(100 * PRICE * (1 + RATE)));
    expect(window.GL.journalsForDoc('GR', 'GR-B')).toHaveLength(1);

    P().invoiceFromReceipt('GR-B');
    l = ledger();
    expect(l.balanced).toBe(true);
    expect(l.inventory).toBe(100 * PRICE);
    expect(l.ppnIn).toBe(Math.round(100 * PRICE * RATE));
    expect(l.payable).toBe(expected().payable);
    expect(window.GL.journalsForDoc('GR', 'GR-B')).toHaveLength(0); // the invoice carries it now
    expect(window.GL.journalsForDoc('PO', 'PO-T')).toHaveLength(0);
  });

  it('receive everything, then invoice only GR-A', () => {
    receiveB();
    let l = ledger();
    expect(l.inventory).toBe(100 * PRICE); // PO-level receipt journal
    expect(window.GL.journalsForDoc('PO', 'PO-T')).toHaveLength(1);

    P().invoiceFromReceipt('GR-A');
    l = ledger();
    expect(l.balanced).toBe(true);
    expect(l.inventory).toBe(100 * PRICE);
    expect(l.payable).toBe(expected().payable);
    expect(window.GL.journalsForDoc('PO', 'PO-T')).toHaveLength(0);
    expect(window.GL.journalsForDoc('GR', 'GR-B')).toHaveLength(1);
  });

  it('a PO set to Received beyond its receipts posts the remainder on the PO', () => {
    // 60 came in through GR-A; the PO was then marked Received directly (the
    // remaining 40 entered stock without a receipt document).
    (window as any).DB.goodsReceipts.splice(1, 1);
    (window as any).DB.purchaseOrders[0].status = 'Received';
    P().invoiceFromReceipt('GR-A');
    const l = ledger();
    expect(l.balanced).toBe(true);
    expect(l.inventory).toBe(100 * PRICE);
    expect(l.payable).toBe(Math.round(100 * PRICE * (1 + RATE)));
    const po = window.GL.journalsForDoc('PO', 'PO-T');
    expect(po).toHaveLength(1);
    expect(po[0].totals.credit).toBe(Math.round(40 * PRICE * (1 + RATE)));
  });

  it('a draft receipt (stock not moved) posts nothing', () => {
    P().invoiceFromReceipt('GR-A');
    expect(window.GL.journalsForDoc('GR', 'GR-B')).toHaveLength(0);
    expect(ledger().inventory).toBe(60 * PRICE);
  });

  it('cancelling a receipt invoice puts the receipt back on its own journal', () => {
    receiveB();
    const inv = P().invoiceFromReceipt('GR-A');
    P().invoiceFromReceipt('GR-B');
    inv.status = 'Cancelled';
    const l = ledger();
    expect(l.inventory).toBe(100 * PRICE);
    expect(l.payable).toBe(expected().payable);
    expect(window.GL.journalsForDoc('GR', 'GR-A')).toHaveLength(1);
  });

  it('payables (Balances) match the ledger, counting PO payments once', () => {
    const DB = (window as any).DB;
    // Paid on the PO before it was invoiced (e.g. an applied down payment).
    DB.paymentLogs.push({
      id: 'PL-1',
      type: 'PO',
      orderId: 'PO-T',
      amount: 1000000,
      method: 'Transfer BCA',
      date: '2026-06-05',
    });
    receiveB();
    P().invoiceFromReceipt('GR-A');

    let l = ledger();
    expect(l.payable).toBe(expected().payable);
    expect(window.Balances.summary('purchases').total).toBe(l.payable);
    // The uninvoiced part is listed as an open item of the PO.
    const items = window.Balances.openItems('purchases');
    expect(items.map((i: any) => i.docType).sort()).toEqual(['PI', 'PO']);
    // The PO as a whole still owes everything received minus what was paid.
    const po = window.Balances.orderBalance('purchases', DB.purchaseOrders[0]);
    expect(po.outstanding).toBe(l.payable);

    P().invoiceFromReceipt('GR-B');
    l = ledger();
    expect(l.payable).toBe(expected().payable);
    expect(window.Balances.summary('purchases').total).toBe(l.payable);
    const [a, b] = DB.purchaseInvoices.map((i: any) =>
      window.Balances.invoiceBalance('purchases', i)
    );
    expect(a.payments + b.payments).toBe(1000000); // not 2 × 1,000,000
    // Supplier statement ends at the same figure.
    expect(window.Balances.partyStatement('purchases', 5, 'UD Batu Alam').balance).toBe(l.payable);
  });

  it('a PO invoiced as a whole is unchanged (no receipt journals)', () => {
    receiveB();
    (window as any).DB.purchaseInvoices.push({
      id: 'PI-W',
      number: 'PI.2026.06.00010',
      status: 'Outstanding',
      date: '2026-06-21',
      supplierId: '5',
      sourceType: 'PO',
      sourceId: 'PO-T',
      taxRate: RATE,
      tax: Math.round(100 * PRICE * RATE),
      amount: Math.round(100 * PRICE * (1 + RATE)),
      lines: [{ itemId: 100, qty: 100, price: PRICE, subtotal: 100 * PRICE }],
    });
    expect(window.GL.receivedNotInvoiced((window as any).DB.purchaseOrders[0])).toEqual([]);
    const l = ledger();
    expect(l.inventory).toBe(100 * PRICE);
    expect(l.payable).toBe(Math.round(100 * PRICE * (1 + RATE)));
    expect(window.GL.journalsForDoc('GR', 'GR-A')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Penerimaan Barang grid — weighing columns (sales-purchase-extras.loadPOLines)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Penerimaan Barang — weighing columns', () => {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function openGrid() {
    (window as any).openModal = vi.fn((_t: string, body: string, footer: string) => {
      document.body.innerHTML = `<div id="m">${body}<div>${footer}</div></div>`;
    });
    const btn = document.createElement('button');
    btn.dataset.action = 'addReceipt';
    document.body.appendChild(btn);
    btn.click();
    await wait(80);
  }

  function row() {
    return document.querySelector('#ri-lines tbody tr') as HTMLTableRowElement;
  }
  function input(cls: string) {
    return row().querySelector(cls) as HTMLInputElement;
  }
  function type(cls: string, value: string) {
    const el = input(cls);
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    seedDB({
      purchaseOrders: [
        {
          id: 'PO-1',
          number: 'PO.2026.06.00001',
          supplier: 'UD Batu Alam',
          supplierId: 5,
          status: 'Confirmed',
          taxRate: 0,
          lines: [
            {
              itemId: 100,
              itemName: 'Agregat',
              unit: 'Ton',
              qty: 30,
              price: 50000,
              lineDiscount: 30000,
              subtotal: 1470000,
            },
          ],
        },
      ],
      goodsReceipts: [
        {
          id: 'GR-0',
          poId: 'PO-1',
          posted: true,
          date: '2026-06-05',
          items: [{ itemId: 100, itemName: 'Agregat', qty: 10 }],
        },
      ],
    });
  });
  afterEach(() => {
    (window as any).openModal = vi.fn();
    document.body.innerHTML = '';
  });

  it('shows received so far, caps the receive qty and adds Surat Jalan, Bruto, Tara, Netto and Harga', async () => {
    await openGrid();
    const heads = Array.from(document.querySelectorAll('#ri-lines thead th')).map(
      th => th.textContent
    );
    expect(heads).toEqual([
      'Barang',
      'Qty PO',
      'Sudah diterima',
      'Qty Terima',
      'Surat Jalan',
      'Bruto',
      'Tara',
      'Netto',
      'Harga',
    ]);
    expect(input('.ri-line-qty').value).toBe('20');
    expect(input('.ri-line-qty').max).toBe('20');
    expect(input('.ri-line-sj').value).toBe('20');
    // Default price: the PO line price after its line discount.
    expect(input('.ri-line-price').value).toBe('49000');
  });

  it('derives Netto from Bruto − Tara (read-only) and saves computeWeighing', async () => {
    await openGrid();
    type('.ri-line-gross', '32.5');
    type('.ri-line-tare', '12.25');
    expect(input('.ri-line-net').readOnly).toBe(true);
    expect(input('.ri-line-net').value).toBe('20.25');
    (document.getElementById('ri-save') as HTMLButtonElement).click();
    const saved = (window as any).DB.goodsReceipts[1];
    expect(saved.items[0].weighing).toEqual(
      P().computeWeighing({ suratJalanQty: 20, grossQty: 32.5, tareQty: 12.25 })
    );
    expect(saved.items[0].weighing.netQty).toBe(20.25);
    expect(saved.items[0].unitPrice).toBe(49000);
    expect(saved.items[0].qty).toBe(20);
  });

  it('keeps a typed Netto when there is no Bruto', async () => {
    await openGrid();
    expect(input('.ri-line-net').readOnly).toBe(false);
    type('.ri-line-net', '19.6');
    (document.getElementById('ri-save') as HTMLButtonElement).click();
    const w = (window as any).DB.goodsReceipts[1].items[0].weighing;
    expect(w).toEqual(P().computeWeighing({ suratJalanQty: 20, tareQty: 0, netQty: 19.6 }));
    expect(w.netQty).toBe(19.6);
  });

  it('refuses a Tara larger than the Bruto', async () => {
    await openGrid();
    type('.ri-line-gross', '10');
    type('.ri-line-tare', '12');
    (document.getElementById('ri-save') as HTMLButtonElement).click();
    expect((window as any).DB.goodsReceipts).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reconcileModal — same weighing rule as the receive grid (computeWeighing)
// ═══════════════════════════════════════════════════════════════════════════════
describe('reconcileModal', () => {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function open(id: string) {
    (window as any).openModal = vi.fn((_t: string, body: string, footer: string) => {
      document.body.innerHTML = `<div id="m">${body}<div>${footer}</div></div>`;
    });
    P().reconcileModal(id);
    await wait(80);
  }

  beforeEach(() => {
    seedDB();
    // A single netto capture (no Bruto) from the receive grid.
    (window as any).DB.goodsReceipts[0].items[0].weighing = P().computeWeighing({
      suratJalanQty: 30,
      netQty: 29.4,
    });
  });
  afterEach(() => {
    (window as any).openModal = vi.fn();
    document.body.innerHTML = '';
  });

  it('keeps a single netto reading when saved without Bruto', async () => {
    await open('GR-1');
    const net = document.querySelector('#rec-table .rec-net') as HTMLInputElement;
    expect(net.readOnly).toBe(false);
    expect(net.value).toBe('29.4');
    (document.getElementById('rec-save') as HTMLButtonElement).click();
    const it = (window as any).DB.goodsReceipts[0].items[0];
    expect(it.weighing).toEqual(
      P().computeWeighing({ suratJalanQty: 30, tareQty: 0, netQty: 29.4 })
    );
    expect(it.reconciledQty).toBe(29.4);
    expect((window as any).DB.goodsReceipts[0].reconciled).toBe(true);
  });

  it('is read-only once the receipt is invoiced', async () => {
    const r = (window as any).DB.goodsReceipts[0];
    r.reconciled = true;
    P().invoiceFromReceipt('GR-1');
    await open('GR-1');
    expect(document.getElementById('rec-save')).toBeNull();
    expect((document.querySelector('#rec-table .rec-final') as HTMLInputElement).disabled).toBe(
      true
    );
  });
});
