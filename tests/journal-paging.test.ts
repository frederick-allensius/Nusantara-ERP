// ═══════════════════════════════════════════════════════════════════════════════
// Akuntansi → Jurnal (gl-view.js) lists 20 journals per page, newest first,
// and the amounts stay on one line (they were cut off on phones). It also holds
// the former Audit Jurnal filters: date range, account and a search.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
const journalCards = () => view().querySelectorAll('.card > .gl-jv');

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

  it('folds each journal to one line with its total, and "Buka semua" opens them', () => {
    w()._ledgerExtras.openTab('journals', 'all');
    const first = journalCards()[0] as HTMLDetailsElement;
    expect(first.tagName).toBe('DETAILS');
    expect(first.open).toBe(false);
    const j = w().DB.journals[w().DB.journals.length - 1];
    expect(first.querySelector('summary')!.textContent).toContain(j.number);
    expect(first.querySelector('summary')!.textContent).toContain(w().idrFull(j.totals.debit));

    actions.glJournalExpand();
    expect(Array.from(journalCards()).every(d => (d as HTMLDetailsElement).open)).toBe(true);
    expect(view().querySelector('[data-action="glJournalExpand"]')!.textContent).toBe('Tutup semua');
    actions.glJournalExpand();
    expect((journalCards()[0] as HTMLDetailsElement).open).toBe(false);
  });

  it('keeps amounts on one line inside a scrollable table', () => {
    w()._ledgerExtras.openTab('journals');
    const card = journalCards()[0];
    expect(card.querySelector('.jv-scroll table')).toBeTruthy();
    const amount = Array.from(card.querySelectorAll('td')).find(td =>
      /Rp/.test(td.textContent || '')
    )!;
    // .t-num (style.css) keeps figures on one line.
    expect(amount.classList.contains('t-num')).toBe(true);
    const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8');
    expect(css).toMatch(/\.t-num \{[^}]*white-space: nowrap;/);
  });
});

describe('Jurnal filters (date, account, search)', () => {
  const setVal = (id: string, v: string) => {
    (document.getElementById(id) as HTMLInputElement).value = v;
  };
  beforeEach(() => {
    // Journals J001…J045 on 1–45 Sep 2026 (wrapping into October); J010 and
    // J020 also post to Kas.
    w().DB.accountsChart = [
      { no: '110101', name: 'Kas' },
      { no: '110201', name: 'Piutang' },
    ];
    w().DB.journals.forEach((j: any, i: number) => {
      const d = new Date(Date.UTC(2026, 8, i + 1));
      j.date = d.toISOString().slice(0, 10);
      if (j.number === 'J010' || j.number === 'J020') {
        j.lines[0].accountNo = '110101';
      }
    });
  });

  it('filters by date range and by account, from page 1, and Reset clears them', () => {
    w()._ledgerExtras.openTab('journals', 'all');
    actions.glJournalPage(undefined, undefined, '2');
    setVal('gl-f-from', '2026-09-05');
    setVal('gl-f-to', '2026-09-30');
    actions.glJournalQuery();
    expect(view().querySelector('.gl-count')!.textContent).toContain('26 jurnal');
    expect(view().querySelector('.list-pager')!.textContent).toContain('1–20 dari 26');

    setVal('gl-f-from', '');
    setVal('gl-f-to', '');
    setVal('gl-f-acc', '110101');
    actions.glJournalQuery();
    expect(journalCards()).toHaveLength(2);
    expect(view().textContent).toContain('J020');
    // Looking for an account's lines: the journals open.
    expect(Array.from(journalCards()).every(d => (d as HTMLDetailsElement).open)).toBe(true);

    actions.glJournalQueryReset();
    expect(view().querySelector('.gl-count')!.textContent).toContain('45 jurnal');
    expect((document.getElementById('gl-f-acc') as HTMLSelectElement).value).toBe('');
  });

  it('searches number, source document and Jurnal Umum, and says when nothing matches', () => {
    w()._ledgerExtras.openTab('journals', 'all');
    setVal('gl-f-q', 'SI-4');
    actions.glJournalQuery();
    // docId SI-4 and SI-40…SI-44 (journals with a document source only)
    expect(view().querySelectorAll('.card > .gl-jv').length).toBeGreaterThan(0);
    expect(view().textContent).not.toContain('J001 ');

    setVal('gl-f-q', 'jurnal umum');
    actions.glJournalQuery();
    expect(view().querySelector('.gl-count')!.textContent).toContain('15 jurnal');

    setVal('gl-f-q', 'tidak-ada');
    actions.glJournalQuery();
    expect(view().textContent).toContain('Tidak ada jurnal yang cocok dengan filter.');
  });
});
