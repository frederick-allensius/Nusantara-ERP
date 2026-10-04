// ═══════════════════════════════════════════════════════════════════════════════
// Buku Besar → Jurnal (gl-view.js) lists 20 journals per page, newest first,
// and the amounts stay on one line (they were cut off on phones).
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
  await import('../public/classic/core/list-pager.js');
  await import('../public/classic/core/gl-view.js');
});

beforeEach(() => {
  const pad = (n: number) => String(n).padStart(3, '0');
  w().DB = {
    accountsChart: [],
    journals: Array.from({ length: 45 }, (_, i) => ({
      id: `J${pad(i + 1)}`,
      number: `J${pad(i + 1)}`,
      date: '2026-09-01',
      source: i % 3 === 0 ? 'manual' : { docType: 'SI', docId: `SI-${i}` },
      lines: [
        { accountNo: '110201', accountName: 'Piutang', debit: 1000000, credit: 0 },
        { accountNo: '400001', accountName: 'Penjualan', debit: 0, credit: 1000000 },
      ],
      totals: { debit: 1000000, credit: 1000000 },
    })),
  };
  document.body.innerHTML = '<div id="view-ledger"></div>';
  w().activeView = 'ledger';
  w().navigate = () => {
    document.getElementById('view-ledger')!.innerHTML = w().renderLedger();
  };
  w().invalidateView = () => {};
});

const view = () => document.getElementById('view-ledger')!;
const journalCards = () => view().querySelectorAll('.card > div[style*="border-radius:10px"]');

describe('Jurnal paging', () => {
  it('shows 20 newest journals, then the next page, and resets on a filter change', () => {
    w()._ledgerExtras.openTab('journals');
    expect(journalCards()).toHaveLength(20);
    expect(view().textContent).toContain('J045');
    expect(view().querySelector('.list-pager')!.textContent).toContain('1–20 dari 45');

    actions.glJournalPage(undefined, undefined, '3');
    expect(journalCards()).toHaveLength(5);
    expect(view().textContent).toContain('J001');

    actions.glJournalFilter(undefined, undefined, 'manual');
    expect(view().querySelector('.list-pager')).toBeNull(); // 15 manual journals, one page
    expect(journalCards()).toHaveLength(15);
  });

  it('keeps amounts on one line inside a scrollable table', () => {
    w()._ledgerExtras.openTab('journals');
    const card = journalCards()[0];
    expect(card.querySelector('.jv-scroll table')).toBeTruthy();
    const amount = Array.from(card.querySelectorAll('td')).find(td =>
      /Rp/.test(td.textContent || '')
    )!;
    expect(amount.getAttribute('style')).toContain('white-space:nowrap');
  });
});
