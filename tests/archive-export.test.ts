// ═══════════════════════════════════════════════════════════════════════════════
// Excel archive (archive-export.js) — Kelola Backup → Arsip Excel: one workbook
// per year with the main records, readable without the app.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/archive-export.js');
});

beforeEach(() => {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', npwp: '0123', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 14 }],
    inventoryItems: [
      {
        id: '1',
        code: 'BS12',
        name: 'Batu Split 1-2',
        unit: 'Ton',
        stock: 5,
        cost: 100,
        sell: 150,
      },
    ],
    salesOrders: [],
    purchaseOrders: [],
    salesInvoices: [
      {
        id: 'SI-1',
        number: 'SI.2025.12.00001',
        date: '2025-12-20',
        customer: 'PT Arta',
        status: 'Paid',
        tax: 11,
        amount: 111,
      },
      {
        id: 'SI-2',
        number: 'SI.2026.01.00001',
        date: '2026-01-05',
        customer: 'PT Arta',
        status: 'Unpaid',
        tax: 22,
        amount: 222,
      },
    ],
    purchaseInvoices: [],
    salesReceipts: [
      {
        id: 'SR-1',
        number: 'SR.2025.12.00001',
        date: '2025-12-28',
        customer: 'PT Arta',
        invoiceId: 'SI-1',
        invoiceNumber: '',
        paymentMethod: 'Transfer Bank',
        status: 'Posted',
        amount: 111,
      },
    ],
    purchasePayments: [],
    otherPayments: [
      {
        id: 'OP-1',
        date: '2026-01-10',
        payee: 'PLN',
        category: 'Listrik',
        accountNo: '610101',
        method: 'Transfer Bank',
        amount: 500,
      },
    ],
    otherDeposits: [],
    deliveryOrders: [],
    journals: [
      {
        id: 'J1',
        number: 'J1',
        date: '2026-01-05',
        lines: [
          { accountNo: '110201', accountName: 'Piutang', debit: 222, credit: 0, memo: '' },
          { accountNo: '400001', accountName: 'Penjualan', debit: 0, credit: 200, memo: '' },
          { accountNo: '210201', accountName: 'PPN Keluaran', debit: 0, credit: 22, memo: '' },
        ],
      },
    ],
  };
});

function sheet(year: string, name: string) {
  return w()
    .NSAArchive.sheets(year)
    .find((s: any) => s.name === name);
}

describe('Arsip Excel', () => {
  it('lists the years that have records, newest first', () => {
    expect(w().NSAArchive.years()).toEqual(['2026', '2025']);
  });

  it('keeps only the chosen year in dated sheets, all master data always', () => {
    expect(sheet('2026', 'Faktur Penjualan').rows.map((r: any[]) => r[1])).toEqual([
      'SI.2026.01.00001',
    ]);
    expect(sheet('', 'Faktur Penjualan').rows).toHaveLength(2);
    expect(sheet('2026', 'Pelanggan').rows).toEqual([['C1', 'PT Arta', '0123', '', '', '', 30]]);
  });

  it('splits DPP and PPN from the invoice total', () => {
    const row = sheet('2026', 'Faktur Penjualan').rows[0];
    expect(row.slice(4, 7)).toEqual([200, 22, 222]);
  });

  it('shows the invoice number on a receipt even when only the id was stored', () => {
    expect(sheet('2025', 'Penerimaan Pembayaran').rows[0][3]).toBe('SI.2025.12.00001');
  });

  it('writes journal lines one per row with balanced totals', () => {
    const rows = sheet('2026', 'Jurnal').rows;
    const debit = rows.reduce((s: number, r: any[]) => s + r[5], 0);
    const credit = rows.reduce((s: number, r: any[]) => s + r[6], 0);
    expect(rows).toHaveLength(3);
    expect(debit).toBe(credit);
  });

  it('has a header for every column of every row', () => {
    w()
      .NSAArchive.sheets('')
      .forEach((s: any) => s.rows.forEach((r: any[]) => expect(r).toHaveLength(s.columns.length)));
  });
});
