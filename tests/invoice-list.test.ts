// ═══════════════════════════════════════════════════════════════════════════════
// Invoice lists (invoice-view.js) show one page of 15 at a time, newest first.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;
const actions: Record<string, (id?: string, type?: string, val?: string) => unknown> = {};

beforeAll(async () => {
  w().ERP = {
    registerAction: (name: string, fn: (id?: string, type?: string, val?: string) => unknown) => {
      actions[name] = fn;
    },
  };
  await import('../src/core/helpers.js');
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/invoice-view.js');
});

beforeEach(() => {
  const pad = (n: number) => String(n).padStart(2, '0');
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', termDays: 30 }],
    salesOrders: [],
    salesInvoices: Array.from({ length: 20 }, (_, i) => ({
      id: `SI-${pad(i + 1)}`,
      number: `SI.2026.09.000${pad(i + 1)}`,
      date: `2026-09-${pad(i + 1)}`,
      customer: 'PT Arta',
      customerId: 'C1',
      status: 'Outstanding',
      amount: 1000,
      lines: [],
    })),
    salesReceipts: [],
    salesReturns: [],
    paymentLogs: [],
  };
  document.body.innerHTML = '<div id="view-invoices"></div>';
  w().activeView = 'invoices';
});

describe('invoice list paging', () => {
  it('shows the newest 15 and moves to the next page', () => {
    const view = document.getElementById('view-invoices')!;
    view.innerHTML = w().renderInvoices();
    let rows = view.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(15);
    expect(rows[0].textContent).toContain('SI.2026.09.00020');
    expect(view.querySelector('.inv-pager')!.textContent).toContain('1–15 dari 20');

    actions.invPage(undefined, 'SI', '2');
    rows = view.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(5);
    expect(rows[4].textContent).toContain('SI.2026.09.00001');
    expect(view.querySelector('.inv-pager')!.textContent).toContain('16–20 dari 20');
  });
});
