import { describe, it, expect, beforeEach } from 'vitest';

// funnel-report.js is a classic <script> (IIFE) that attaches window._funnelReport.
beforeEach(async () => {
  (window as any).DB = {
    purchaseOrders: [],
    salesOrders: [],
    deliveryOrders: [],
    goodsReceipts: [],
    purchaseInvoices: [],
    salesInvoices: [],
    salesReceipts: [],
    customers: [],
    suppliers: [],
  };
  await import('../public/classic/core/funnel-report.js');
});

declare global {
  interface Window {
    _funnelReport: any;
    DB: any;
  }
}

function countsByLabel(stages: Array<{ label: string; count: number }>) {
  const m: Record<string, number> = {};
  stages.forEach(s => {
    m[s.label] = s.count;
  });
  return m;
}

describe('funnel-report — purchase funnel', () => {
  it('returns the five named purchase stages in order', () => {
    const labels = window._funnelReport.purchaseFunnel(window.DB).map((s: any) => s.label);
    expect(labels).toEqual([
      'Open PO Supplier',
      'Surat Jalan / Truk Jalan',
      'Tiba/Timbang',
      'Reconciled',
      'Invoiced Supplier',
    ]);
  });

  it('counts each purchase stage from the pipeline data shapes', () => {
    window.DB.purchaseOrders = [
      { id: 'PO-1', number: 'PO.2026.06.001', status: 'Confirmed', supplierName: 'Sup A' },
      { id: 'PO-2', number: 'PO.2026.06.002', status: 'Draft', supplierName: 'Sup B' },
      { id: 'PO-3', number: 'PO.2026.06.003', status: 'Received', supplierName: 'Sup C' }, // closed → not open
      { id: 'PO-4', number: 'PO.2026.06.004', status: 'Cancelled', supplierName: 'Sup D' }, // excluded
    ];
    window.DB.deliveryOrders = [{ id: 'DO-1', poId: 'PO-1' }]; // purchase-side truck
    window.DB.goodsReceipts = [
      // has surat jalan + weighed + reconciled
      {
        id: 'GR-1',
        poId: 'PO-1',
        reconciled: true,
        items: [{ itemId: 1, qty: 10, weighing: { suratJalanQty: 10, netQty: 9.8 } }],
      },
      // has surat jalan, no weighing, not reconciled
      {
        id: 'GR-2',
        poId: 'PO-2',
        reconciled: false,
        items: [{ itemId: 2, qty: 5, weighing: { suratJalanQty: 5, netQty: 0 } }],
      },
    ];
    window.DB.purchaseInvoices = [{ id: 'PI-1', status: 'Outstanding', supplierName: 'Sup A' }];

    const c = countsByLabel(window._funnelReport.purchaseFunnel(window.DB));
    expect(c['Open PO Supplier']).toBe(2); // Confirmed + Draft (not Received, not Cancelled)
    expect(c['Surat Jalan / Truk Jalan']).toBe(3); // 2 receipts w/ SJ + 1 purchase DO
    expect(c['Tiba/Timbang']).toBe(1); // only GR-1 has netQty > 0
    expect(c['Reconciled']).toBe(1); // only GR-1 reconciled
    expect(c['Invoiced Supplier']).toBe(1); // one PI
  });
});

describe('funnel-report — sales funnel', () => {
  it('returns the five named sales stages in order', () => {
    const labels = window._funnelReport.salesFunnel(window.DB).map((s: any) => s.label);
    expect(labels).toEqual([
      'Open PO Customer',
      'Pengambilan Bertahap',
      'Draft Invoice',
      'Invoiced',
      'Paid',
    ]);
  });

  it('counts each sales stage from the pipeline data shapes', () => {
    window.DB.salesOrders = [
      { id: 'SO-1', number: 'SO.2026.06.001', status: 'Confirmed', customerName: 'Cust A' },
      { id: 'SO-2', number: 'SO.2026.06.002', status: 'Delivered', customerName: 'Cust B' }, // closed → not open
      { id: 'SO-3', number: 'SO.2026.06.003', status: 'Cancelled', customerName: 'Cust C' }, // excluded
    ];
    window.DB.deliveryOrders = [
      { id: 'DO-1', soId: 'SO-1' },
      { id: 'DO-2', soId: 'SO-1' },
    ];
    window.DB.salesInvoices = [
      { id: 'SI-1', status: 'Draft' },
      { id: 'SI-2', status: 'Outstanding' },
      { id: 'SI-3', status: 'Paid' },
      { id: 'SI-4', status: 'Paid' },
    ];

    const c = countsByLabel(window._funnelReport.salesFunnel(window.DB));
    expect(c['Open PO Customer']).toBe(1); // only Confirmed
    expect(c['Pengambilan Bertahap']).toBe(2); // two staged DOs
    expect(c['Draft Invoice']).toBe(1);
    expect(c['Invoiced']).toBe(1); // Outstanding
    expect(c['Paid']).toBe(2);
  });
});

describe('funnel-report — funnels degrade on empty DB', () => {
  it('returns zero counts without throwing', () => {
    expect(() => window._funnelReport.purchaseFunnel({})).not.toThrow();
    const p = window._funnelReport.purchaseFunnel({});
    expect(p.every((s: any) => s.count === 0)).toBe(true);
    const s = window._funnelReport.salesFunnel(undefined);
    expect(s.every((x: any) => x.count === 0)).toBe(true);
  });
});

describe('funnel-report — custom-range filter', () => {
  beforeEach(() => {
    window.DB.purchaseOrders = [
      {
        id: 'PO-1',
        number: 'PO.2026.06.001',
        date: '2026-06-05',
        supplierName: 'Sup A',
        amount: 1000,
      },
      {
        id: 'PO-2',
        number: 'PO.2026.07.002',
        date: '2026-07-10',
        supplierName: 'Sup B',
        amount: 2000,
      },
    ];
    window.DB.salesOrders = [
      {
        id: 'SO-1',
        number: 'SO.2026.06.001',
        date: '2026-06-08',
        customerName: 'Cust A',
        amount: 3000,
      },
      {
        id: 'SO-2',
        number: 'SO.2026.06.020',
        date: '2026-06-20',
        customerName: 'Cust B',
        amount: 4000,
      },
      {
        id: 'SO-3',
        number: 'SO.2026.08.003',
        date: '2026-08-01',
        customerName: 'Cust A',
        amount: 500,
      },
    ];
  });

  it('filters by date range (inclusive)', () => {
    const r = window._funnelReport.filterTransactions(window.DB, {
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(r.totals.count).toBe(3); // PO-1, SO-1, SO-2
    expect(r.rows.some((x: any) => x.number === 'PO.2026.07.002')).toBe(false);
    expect(r.totals.purchase).toBe(1000);
    expect(r.totals.sales).toBe(7000);
  });

  it('filters by month shortcut (overrides from/to)', () => {
    const r = window._funnelReport.filterTransactions(window.DB, { month: '2026-07' });
    expect(r.totals.count).toBe(1);
    expect(r.rows[0].number).toBe('PO.2026.07.002');
  });

  it('filters by customer (case-insensitive, excludes purchases)', () => {
    const r = window._funnelReport.filterTransactions(window.DB, { customer: 'cust a' });
    expect(r.totals.count).toBe(2); // SO-1 + SO-3
    expect(r.rows.every((x: any) => x.kind === 'sales')).toBe(true);
    expect(r.totals.purchase).toBe(0);
  });

  it('filters by supplier (excludes sales)', () => {
    const r = window._funnelReport.filterTransactions(window.DB, { supplier: 'Sup B' });
    expect(r.totals.count).toBe(1);
    expect(r.rows[0].number).toBe('PO.2026.07.002');
    expect(r.rows[0].kind).toBe('purchase');
  });

  it('filters per PO number (substring)', () => {
    const r = window._funnelReport.filterTransactions(window.DB, { po: 'PO.2026.06' });
    expect(r.totals.count).toBe(1);
    expect(r.rows[0].number).toBe('PO.2026.06.001');
  });

  it('combines date range with month=all returning everything', () => {
    const r = window._funnelReport.filterTransactions(window.DB, {});
    expect(r.totals.count).toBe(5);
  });
});
