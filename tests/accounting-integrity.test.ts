// ═══════════════════════════════════════════════════════════════════════════════
// Accounting integrity — posting rules that must hold across document chains
//
//   • an invoiced delivery/receipt posts revenue/payable once (via the invoice)
//   • cancelling the invoice hands the entry back to the order
//   • an applied down payment moves cash once
//   • Kas & Bank records (other payments, deposits, transfers) reach the ledger
//   • tax-inclusive documents balance
//   • Balances: one outstanding figure per document chain, status follows it
//   • stock reversals keep the per-warehouse breakdown in sync
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/core/modal.js', () => ({ showToast: vi.fn() }));

import { applyStockMutation, reverseStockMutation, stockShortages } from '../src/core/stock.js';

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
});

const w = () => window as any;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const LINE = {
  itemId: '100',
  itemName: 'Batu split',
  qty: 10,
  price: 100000,
  lineDiscount: 0,
  subtotal: 1000000,
};

const SO = {
  id: 'SO-1',
  number: 'SO.2026.07.00001',
  customer: 'PT Maju Jaya',
  customerId: '1',
  date: '2026-07-01',
  status: 'Delivered',
  taxRate: 0.11,
  tax: 110000,
  amount: 1110000,
  stockMutated: true,
  lines: [LINE],
};

const SI = {
  id: 'SI-1',
  number: 'SI.2026.07.00001',
  customer: 'PT Maju Jaya',
  customerId: '1',
  date: '2026-07-02',
  dueDate: '2026-08-01',
  status: 'Outstanding',
  sourceId: 'SO-1',
  sourceType: 'SO',
  taxRate: 0.11,
  tax: 110000,
  amount: 1110000,
  lines: [LINE],
};

function seed(over: Record<string, unknown> = {}) {
  w().DB = {
    customers: [{ id: '1', name: 'PT Maju Jaya' }],
    suppliers: [{ id: '5', name: 'CV Sumber Material' }],
    inventoryItems: [
      { id: '100', name: 'Batu split', unit: 'Ton', stock: 50, cost: 60000, sell: 100000 },
    ],
    salesOrders: [],
    purchaseOrders: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesReturns: [],
    purchaseReturns: [],
    paymentLogs: [],
    salesDownPayments: [],
    purchaseDownPayments: [],
    otherPayments: [],
    otherDeposits: [],
    bankTransfers: [],
    itemAdjustments: [],
    journals: [],
    accountsChart: [],
    numberSequences: {},
    reservations: {},
    settings: {
      bankAccounts: [
        { id: 'BA001', name: 'BCA - Rekening Utama', bank: 'BCA' },
        { id: 'BA002', name: 'Mandiri - Operasional', bank: 'Mandiri' },
      ],
    },
    ...clone(over),
  };
  w().GL.reconcileAll();
}

// Signed ledger balance of an account (debit − credit).
function bal(no: string): number {
  const row = w()
    .GL.trialBalance()
    .rows.find((r: any) => r.no === no);
  return row ? row.debit - row.credit : 0;
}

describe('sales chain posts revenue once', () => {
  it('books revenue, receivable and PPN through the invoice and COGS through the delivery', () => {
    seed({ salesOrders: [SO], salesInvoices: [SI] });
    expect(bal('400001')).toBe(-1000000); // Penjualan
    expect(bal('110201')).toBe(1110000); // Piutang Usaha
    expect(bal('210201')).toBe(-110000); // PPN Keluaran
    expect(bal('510101')).toBe(600000); // HPP: 10 × 60.000
    expect(bal('110401')).toBe(-600000); // Persediaan
    expect(w().GL.trialBalance().balanced).toBe(true);

    const soJournal = w().GL.journalsForDoc('SO', 'SO-1')[0];
    expect(soJournal.lines.some((l: any) => l.accountNo === '110201')).toBe(false);
  });

  it('hands revenue back to the delivery when the invoice is cancelled', () => {
    seed({ salesOrders: [SO], salesInvoices: [{ ...SI, status: 'Cancelled' }] });
    expect(bal('400001')).toBe(-1000000);
    expect(bal('110201')).toBe(1110000);
    expect(w().GL.journalsForDoc('SI', 'SI-1')).toHaveLength(0);
  });
});

describe('purchase chain posts payable once', () => {
  it('skips the receipt journal when the PO is invoiced', () => {
    const line = {
      itemId: '100',
      itemName: 'Batu split',
      qty: 20,
      price: 60000,
      subtotal: 1200000,
    };
    const po = {
      id: 'PO-1',
      supplier: 'CV Sumber Material',
      supplierId: '5',
      date: '2026-07-03',
      status: 'Received',
      taxRate: 0.11,
      tax: 132000,
      amount: 1332000,
      stockMutated: true,
      lines: [line],
    };
    const pi = {
      id: 'PI-1',
      supplier: 'CV Sumber Material',
      supplierId: '5',
      date: '2026-07-04',
      status: 'Outstanding',
      sourceId: 'PO-1',
      sourceType: 'PO',
      taxRate: 0.11,
      tax: 132000,
      amount: 1332000,
      lines: [line],
    };
    seed({ purchaseOrders: [po], purchaseInvoices: [pi] });
    expect(bal('110401')).toBe(1200000);
    expect(bal('130101')).toBe(132000);
    expect(bal('210101')).toBe(-1332000);
    expect(w().GL.journalsForDoc('PO', 'PO-1')).toHaveLength(0);
    expect(w().GL.trialBalance().balanced).toBe(true);
  });
});

describe('down payments', () => {
  it('moves cash once when a down payment is applied', () => {
    seed({
      salesOrders: [
        { ...SO, status: 'Confirmed', stockMutated: false, taxRate: 0, tax: 0, amount: 1000000 },
      ],
      salesDownPayments: [
        {
          id: 'SDP-1',
          orderId: 'SO-1',
          customerName: 'PT Maju Jaya',
          date: '2026-06-20',
          amount: 300000,
          method: 'Transfer BCA',
          status: 'Applied',
        },
      ],
      paymentLogs: [
        {
          id: 1,
          type: 'SO',
          orderId: 'SO-1',
          date: '2026-06-20',
          amount: 300000,
          method: 'Down Payment',
          source: 'DP',
          dpId: 'SDP-1',
        },
      ],
    });
    expect(bal('110102')).toBe(300000); // Bank BCA: only the down payment itself
    expect(bal('210301')).toBe(0); // Uang Muka Penjualan: received then applied
    expect(w().DB.journals.some((j: any) => String(j.id).includes(':pay:'))).toBe(false);
  });
});

describe('Kas & Bank records post to the ledger', () => {
  it('books other payments, other deposits and bank transfers', () => {
    seed({
      otherPayments: [
        {
          id: 'OP-1',
          date: '2026-07-05',
          bankAccountId: 'BA001',
          category: 'Utilities',
          amount: 500000,
          method: 'Transfer Bank',
        },
        {
          id: 'OP-2',
          date: '2026-07-06',
          bankAccountId: 'BA001',
          category: 'Gaji',
          amount: 200000,
          method: 'Tunai',
        },
      ],
      otherDeposits: [
        {
          id: 'OD-1',
          date: '2026-07-07',
          bankAccountId: 'BA002',
          category: 'Bunga Bank',
          amount: 50000,
          method: 'Transfer Bank',
        },
      ],
      bankTransfers: [
        {
          id: 'BT-1',
          date: '2026-07-08',
          fromAccountId: 'BA001',
          toAccountId: 'BA002',
          amount: 1000000,
          fee: 6500,
        },
      ],
    });
    expect(bal('610101')).toBe(500000); // Beban Operasional Lain
    expect(bal('610301')).toBe(200000); // Beban Gaji (category Gaji)
    expect(bal('110101')).toBe(-200000); // Kas (method Tunai)
    expect(bal('710101')).toBe(-50000); // Pendapatan Lain-lain
    expect(bal('610401')).toBe(6500); // Beban Administrasi Bank
    expect(bal('110102')).toBe(-500000 - 1006500); // BCA: payment + transfer out incl. fee
    expect(bal('110103')).toBe(50000 + 1000000); // Mandiri: deposit + transfer in
    expect(w().GL.trialBalance().balanced).toBe(true);
  });
});

describe('tax-inclusive documents', () => {
  it('books net sales and PPN and still balances', () => {
    seed({
      salesOrders: [
        {
          id: 'SO-9',
          customer: 'PT Maju Jaya',
          customerId: '1',
          date: '2026-07-10',
          status: 'Delivered',
          taxRate: 0.11,
          tax: 110000,
          taxInclusive: true,
          amount: 1110000,
          lines: [
            {
              itemId: 'custom',
              itemName: 'Jasa angkut',
              qty: 1,
              price: 1110000,
              subtotal: 1110000,
            },
          ],
        },
      ],
    });
    expect(bal('110201')).toBe(1110000);
    expect(bal('400001')).toBe(-1000000);
    expect(bal('210201')).toBe(-110000);
    expect(w().GL.trialBalance().balanced).toBe(true);
  });
});

describe('Balances', () => {
  beforeEach(() => {
    seed({
      salesOrders: [SO],
      salesInvoices: [SI],
      paymentLogs: [
        {
          id: 1,
          type: 'SO',
          orderId: 'SO-1',
          date: '2026-07-01',
          amount: 200000,
          method: 'Transfer BCA',
        },
      ],
      salesReceipts: [
        {
          id: 'SR-1',
          invoiceId: 'SI-1',
          date: '2026-07-20',
          status: 'Posted',
          amount: 500000,
          paymentMethod: 'Transfer BCA',
        },
      ],
      salesReturns: [
        {
          id: 'SRN-1',
          sourceType: 'SI',
          sourceId: 'SI-1',
          date: '2026-07-15',
          status: 'Posted',
          amount: 110000,
          lines: [],
        },
      ],
    });
  });

  it('counts order payments, invoice receipts and returns toward the invoice', () => {
    const b = w().Balances.invoiceBalance('sales', w().DB.salesInvoices[0]);
    expect(b).toMatchObject({
      total: 1110000,
      payments: 200000,
      settlements: 500000,
      returns: 110000,
      outstanding: 300000,
    });
  });

  it('lists an invoiced order once, as its invoice', () => {
    const items = w().Balances.openItems('sales');
    expect(items).toHaveLength(1);
    expect(items[0].docType).toBe('SI');
    w().DB.salesInvoices[0].status = 'Cancelled';
    const after = w().Balances.openItems('sales');
    expect(after.map((i: any) => i.docType)).toEqual(['SO']);
  });

  it('keeps the invoice status in step with its balance', () => {
    const inv = w().DB.salesInvoices[0];
    w().DB.salesReceipts.push({
      id: 'SR-2',
      invoiceId: 'SI-1',
      date: '2026-07-25',
      status: 'Posted',
      amount: 300000,
    });
    expect(w().Balances.recalcInvoiceStatus('sales', inv)).toBe('Paid');
    w().DB.salesReceipts[1].status = 'Cancelled';
    inv.status = 'Outstanding';
    expect(w().Balances.recalcInvoiceStatus('sales', inv)).toBe('Outstanding');
  });

  it('buckets overdue amounts by days past the due date', () => {
    const s = w().Balances.summary('sales', { asOf: '2026-09-15' });
    expect(s.overdueCount).toBe(1);
    expect(s.items[0].daysOverdue).toBe(45);
    expect(s.buckets.d31_60).toBe(300000);
  });
});

describe('stock through the warehouse module', () => {
  beforeEach(() => {
    seed();
    w().DB.inventoryItems[0].warehouseStock = { 'WH-DEFAULT': 50 };
  });

  it('reverses a delivery back into the same warehouse', () => {
    const order = {
      id: 'SO-7',
      warehouseId: 'WH-DEFAULT',
      stockMutated: false,
      lines: [{ itemId: '100', qty: 10 }],
    };
    expect(applyStockMutation(order, 'out')).toBe(true);
    expect(w().DB.inventoryItems[0].stock).toBe(40);
    expect(w().DB.inventoryItems[0].warehouseStock['WH-DEFAULT']).toBe(40);
    expect(reverseStockMutation(order, 'out')).toBe(true);
    expect(w().DB.inventoryItems[0].stock).toBe(50);
    expect(w().DB.inventoryItems[0].warehouseStock['WH-DEFAULT']).toBe(50);
    expect(order.stockMutated).toBe(false);
  });

  it('checks availability in the chosen warehouse, not the item total', () => {
    const item = w().DB.inventoryItems[0];
    item.warehouseStock = { 'WH-DEFAULT': 5, 'WH-2': 45 };
    item.stock = 50;
    expect(stockShortages([{ itemId: '100', qty: 10 }], 'WH-DEFAULT')).toHaveLength(1);
    expect(stockShortages([{ itemId: '100', qty: 10 }], 'WH-2')).toHaveLength(0);
  });
});
