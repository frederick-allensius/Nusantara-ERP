// ═══════════════════════════════════════════════════════════════════════════════
// Demo dataset — the seed must follow the same rules as data entered in the app:
//   • stock per warehouse sums to item stock and never goes negative
//   • nothing is dated in the future; every document number is issued once
//   • invoices, receipts, deliveries and returns link to the right documents
//   • invoice status follows its settlements
//   • the derived ledger balances and its inventory equals the stock value
//   • the cases the dashboard and the meeting demo rely on are present
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';
import { buildDemoData } from '../src/core/demo-data.js';

const NOW = new Date('2026-09-14T10:00:00');
const TODAY = '2026-09-14';
const w = () => window as any;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
});

function load() {
  const data: any = buildDemoData(NOW);
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
    const db = load();
    [
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
    ].forEach(coll => {
      const docs = db[coll];
      expect(docs.length, coll).toBeGreaterThan(0);
      docs.forEach((d: any) => expect(d.date <= TODAY, `${coll} ${d.number}`).toBe(true));
      const numbers = docs.map((d: any) => d.number);
      expect(new Set(numbers).size, coll).toBe(numbers.length);
      numbers.forEach((n: string) => expect(n, coll).toMatch(/^[A-Z]+\.\d{4}\.\d{2}\.\d{5}$/));
    });
  });

  it('links documents the way the application does', () => {
    const db = load();
    db.salesInvoices.forEach((inv: any) => {
      const so = byId(db.salesOrders, inv.sourceId);
      expect(so && so.status, inv.number).toBe('Delivered');
      expect(inv.sourceNumber).toBe(so.number);
    });
    db.purchaseInvoices.forEach((inv: any) => {
      const po = byId(db.purchaseOrders, inv.sourceId);
      expect(po && po.status, inv.number).toBe('Received');
    });
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
    const db = load();
    const tb = w().GL.trialBalance();
    expect(tb.balanced).toBe(true);
    const row = tb.rows.find((r: any) => r.no === '110401');
    const ledgerInventory = row.debit - row.credit;
    const stockValue = db.inventoryItems.reduce((s: number, i: any) => s + i.stock * i.cost, 0);
    expect(Math.abs(ledgerInventory - stockValue)).toBeLessThan(1000);
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
  });

  it('contains the cases the dashboard and the demo rely on', () => {
    const db = load();
    const B = w().Balances;
    expect(B.summary('sales', { asOf: TODAY }).overdueCount).toBeGreaterThan(0);
    expect(B.summary('purchases', { asOf: TODAY }).overdueCount).toBeGreaterThan(0);
    expect(db.inventoryItems.some((i: any) => i.stock <= i.min)).toBe(true);
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
  });
});
