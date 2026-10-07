// ═══════════════════════════════════════════════════════════════════════════════
// Long lists shown 25 rows per page (list-pager.js NSAPager):
//
//   • Riwayat Kas & Bank    (bank-extras.js openBankHistory)
//   • Laporan per Periode   (funnel-report.js openCustomRange)
//
// For each: only one page of rows renders, the pager moves to page 2, the totals
// cover every row (not just the page), and a new filter / a fresh open starts
// again at page 1.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const w = () => window as any;
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, '0');
// Day n (1..60) counted back from 2026-10-04, so every row has its own date.
const dateOf = (n: number) => {
  const d = new Date(Date.UTC(2026, 9, 4 - n));
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
};

function pagerText(root: ParentNode) {
  const el = root.querySelector('.list-pager');
  return el ? el.textContent || '' : '';
}
function clickPage(root: ParentNode, page: number) {
  const btn = root.querySelector(`.list-pager [data-val="${page}"]`) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  btn.click();
}

beforeAll(async () => {
  w().idrFull = (v: number) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
  await import('../public/classic/core/list-pager.js');
  await import('../public/classic/core/bank-extras.js');
  await import('../public/classic/core/funnel-report.js');
});

// ── Riwayat Kas & Bank ───────────────────────────────────────────────────────
describe('Riwayat Kas & Bank', () => {
  // 40 receipts of 5.000 and 20 payments of 1.000, interleaved by date.
  function seedMovements() {
    const otherDeposits = [];
    const otherPayments = [];
    for (let i = 1; i <= 60; i++) {
      if (i % 3 === 0) {
        otherPayments.push({
          id: `OP-${i}`,
          number: `OP.${pad(i)}`,
          date: dateOf(i),
          payee: 'Toko',
          amount: 1000,
          method: 'Tunai',
        });
      } else {
        otherDeposits.push({
          id: `OD-${i}`,
          number: `OD.${pad(i)}`,
          date: dateOf(i),
          payer: 'Pelanggan',
          amount: 5000,
          method: 'Transfer Bank',
        });
      }
    }
    w().DB = {
      otherPayments,
      otherDeposits,
      settings: { bankAccounts: [{ id: 'BA001', name: 'BCA - Rekening Utama', bank: 'BCA' }] },
    };
  }

  async function open() {
    document.body.innerHTML = '<div id="view-finance"></div>';
    w()._bankExtras.openBankHistory();
    await tick();
    return document.getElementById('view-finance')!;
  }
  const rows = (v: HTMLElement) => v.querySelectorAll('#bx-history-list tbody tr');
  const stats = (v: HTMLElement) =>
    Array.from(v.querySelectorAll('.stat-val')).map(el => el.textContent);

  it('renders 25 movements and the pager moves to page 2', async () => {
    seedMovements();
    const v = await open();
    expect(rows(v)).toHaveLength(25);
    expect(pagerText(v)).toContain('1–25 dari 60');
    expect(rows(v)[0].textContent).toContain('OD.01');

    clickPage(v, 2);
    expect(rows(v)).toHaveLength(25);
    expect(rows(v)[0].textContent).toContain('OD.26');
    expect(pagerText(v)).toContain('26–50 dari 60');

    clickPage(v, 3);
    expect(rows(v)).toHaveLength(10);
    expect(pagerText(v)).toContain('51–60 dari 60');
  });

  it('totals every movement, not just the page shown', async () => {
    seedMovements();
    const v = await open();
    const all = [w().idrFull(200000), w().idrFull(20000), w().idrFull(180000)];
    expect(stats(v)).toEqual(all);
    expect(v.textContent).toContain('60 transaksi');
    clickPage(v, 2);
    clickPage(v, 3);
    expect(rows(v)).toHaveLength(10);
    expect(stats(v)).toEqual(all);
  });

  it('opens again at page 1', async () => {
    seedMovements();
    let v = await open();
    clickPage(v, 2);
    expect(pagerText(v)).toContain('26–50 dari 60');
    v = await open();
    expect(pagerText(v)).toContain('1–25 dari 60');
    expect(rows(v)[0].textContent).toContain('OD.01');
  });
});

// ── Laporan per Periode ──────────────────────────────────────────────────────
describe('Laporan per Periode', () => {
  // 30 sales orders of 2.000 (newest) and 20 purchase orders of 1.500.
  function seedOrders() {
    const salesOrders = [];
    const purchaseOrders = [];
    for (let i = 1; i <= 50; i++) {
      if (i <= 30) {
        salesOrders.push({
          id: `SO-${i}`,
          number: `SO.${pad(i)}`,
          date: dateOf(i),
          customerName: 'PT Pelanggan',
          status: 'Confirmed',
          amount: 2000,
        });
      } else {
        purchaseOrders.push({
          id: `PO-${i}`,
          number: `PO.${pad(i)}`,
          date: dateOf(i),
          supplierName: 'CV Supplier',
          status: 'Confirmed',
          amount: 1500,
        });
      }
    }
    w().DB = { salesOrders, purchaseOrders, deliveryOrders: [], customers: [], suppliers: [] };
  }

  async function open() {
    document.body.innerHTML = '<div id="view-reports"></div>';
    w()._funnelReport.openCustomRange();
    await tick();
    return document.getElementById('view-reports')!;
  }
  const rows = (v: HTMLElement) => v.querySelectorAll('#cr-tbody tr');
  const stats = (v: HTMLElement) =>
    Array.from(v.querySelectorAll('.stat-val')).map(el => el.textContent);

  it('renders 25 rows and the pager moves to page 2; totals cover every row', async () => {
    seedOrders();
    const v = await open();
    const all = [w().idrFull(30000), w().idrFull(60000), '50'];
    expect(rows(v)).toHaveLength(25);
    expect(pagerText(v)).toContain('1–25 dari 50');
    expect(stats(v)).toEqual(all);

    clickPage(v, 2);
    expect(rows(v)).toHaveLength(25);
    expect(rows(v)[0].textContent).toContain('SO.26');
    expect(rows(v)[24].textContent).toContain('PO.50');
    expect(pagerText(v)).toContain('26–50 dari 50');
    expect(stats(v)).toEqual(all);
  });

  it('a new filter starts at page 1 and pages the filtered rows; Reset clears it', async () => {
    seedOrders();
    const v = await open();
    clickPage(v, 2);
    (document.getElementById('cr-kind') as HTMLSelectElement).value = 'sales';
    (v.querySelector('[data-action="crApply"]') as HTMLButtonElement).click();
    expect(pagerText(v)).toContain('1–25 dari 30');
    expect(stats(v)).toEqual([w().idrFull(0), w().idrFull(60000), '30']);
    clickPage(v, 2);
    expect(rows(v)).toHaveLength(5);

    (v.querySelector('[data-action="crReset"]') as HTMLButtonElement).click();
    await tick();
    const fresh = document.getElementById('view-reports')!;
    expect(pagerText(fresh)).toContain('1–25 dari 50');
    expect((document.getElementById('cr-kind') as HTMLSelectElement).value).toBe('');
  });

  it('keeps dates on one line and lets Terapkan / Reset take a full row on phones', async () => {
    seedOrders();
    const v = await open();
    const dateCell = v.querySelector('#cr-tbody tr td') as HTMLElement;
    expect(dateCell.textContent).toBe('2026-10-03');
    expect(dateCell.getAttribute('style')).toContain('white-space:nowrap');
    expect(v.querySelector('.cr-filters > .cr-actions [data-action="crReset"]')).toBeTruthy();

    const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8');
    expect(css).toMatch(
      /@media \(max-width: 768px\) \{\s*\.cr-filters \.cr-actions \{\s*grid-column: 1 \/ -1;/
    );
  });

  it('keeps the filter result for a page change made before Terapkan', async () => {
    seedOrders();
    const v = await open();
    // A changed but not applied filter does not change the rows being paged.
    (document.getElementById('cr-kind') as HTMLSelectElement).value = 'purchase';
    clickPage(v, 2);
    expect(pagerText(v)).toContain('26–50 dari 50');
  });
});
