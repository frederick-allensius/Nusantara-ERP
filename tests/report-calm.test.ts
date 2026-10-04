// ═══════════════════════════════════════════════════════════════════════════════
// Calm report pages: bold only for totals, colour only for meaning.
//
// Neraca Saldo (gl-view.js), Laba Rugi (financial-reports.js) and Pajak & PPN
// (tax-extras.js) are rendered from the real classic bundle over the demo
// dataset. For each page:
//   • no inline bold on ordinary rows (no font-weight 600/700/800 in the markup),
//   • totals and subtotals still bold (their classes, and the style.css rules),
//   • negative amounts / a broken balance still flagged in the danger colour,
//   • every figure the page showed before is still on it.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { classicOrder } from '../vite.config.js';
import { buildDemoData } from '../src/core/demo-data.js';

const ROOT = resolve(__dirname, '..');
const NOW = new Date('2026-09-14T10:00:00');
const w = () => window as any;
const css = readFileSync(resolve(ROOT, 'style.css'), 'utf8');
const appBody = (
  readFileSync(resolve(ROOT, 'app.html'), 'utf-8').match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? ''
).replace(/<script[\s\S]*?<\/script>/gi, '');

const INLINE_BOLD = /font-weight:\s*(600|700|800|bold)/;

// CSS declarations of one selector in style.css (first rule that lists it).
function ruleFor(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n|,\\s*)${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`));
  return m ? m[1] : '';
}

function loadDemo() {
  const data: any = buildDemoData(NOW);
  const { bankAccounts, itemCategories, units, ...collections } = data;
  w().DB = {
    ...collections,
    accountsChart: [],
    numberSequences: {},
    settings: {
      bankAccounts,
      itemCategories,
      units,
      tax: { pkp: true, npwp: '01.234.567.8-901.000', ppnRate: 0.11, rounding: 'round' },
    },
  };
  w().GL.reconcileAll();
}

// A manual journal (balanced unless `credit` differs from `debit`).
function addJournal(debitAcc: string, creditAcc: string, debit: number, credit = debit) {
  w().DB.journals.push({
    id: 'JT-' + w().DB.journals.length,
    number: 'JT.' + w().DB.journals.length,
    date: '2026-09-10',
    source: 'manual',
    memo: 'Uji',
    lines: [
      { accountNo: debitAcc, accountName: '', debit, credit: 0 },
      { accountNo: creditAcc, accountName: '', debit: 0, credit },
    ],
    totals: { debit, credit },
  });
}

function render(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}
const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ');
// idrFull() separates "Rp" with a no-break space; text() folds it like any space.
const rp = (n: number) => String(w().idrFull(n)).replace(/\s+/g, ' ');

beforeAll(async () => {
  document.body.innerHTML = appBody;
  w().saveDB = vi.fn();
  w().loadDB = vi.fn();
  w().showToast = vi.fn();
  w().showUndoToast = vi.fn();
  w().openModal = vi.fn();
  w().closeModal = vi.fn();
  w().confirmDialog = vi.fn();
  w().defaultData = {};
  w().Chart = class {
    static register() {}
    destroy() {}
    update() {}
  };
  w().erpAuth = { getCurrentUser: () => ({ email: 't@nsa.local' }), logout: vi.fn() };
  w().erpBackup = {
    getBackupStatus: () => ({ lastBackup: false, lastBackupDate: null, hoursUntilNext: 24 }),
    getBackupList: async () => [],
  };
  w().NSANotif = {
    getAlerts: () => [],
    checkAlerts: () => [],
    getUnreadCount: () => 0,
    markAllRead: () => {},
    requestPermission: async () => 'denied',
  };
  w().DB = { salesOrders: [], purchaseOrders: [], journals: [], accountsChart: [], settings: {} };
  await import('../src/core/helpers.js');
  await import('../src/classic/core/doc-registry.js');
  // The real bundle, in global scope, as the app runs it (see the smoke test).
  const bundle = classicOrder.map(f => readFileSync(resolve(ROOT, f), 'utf-8')).join('\n;\n');
  // eslint-disable-next-line no-eval -- intentionally executing the real bundle in global scope
  (0, eval)(bundle);
});

beforeEach(() => {
  document.body.innerHTML = appBody;
  loadDemo();
});

// ── Neraca Saldo ─────────────────────────────────────────────────────────────
describe('Neraca Saldo', () => {
  const page = () => render(w().renderLedger());

  it('has no inline bold; account rows plain, the TOTAL row bold', () => {
    const v = page();
    expect(v.innerHTML).not.toMatch(INLINE_BOLD);
    const body = v.querySelectorAll('.gl-tb tbody tr');
    expect(body.length).toBeGreaterThan(5);
    body.forEach(tr => {
      expect(tr.classList.contains('gl-total')).toBe(false);
      expect(tr.querySelector('.t-strong, strong, b')).toBeNull();
    });
    const total = v.querySelector('.gl-tb tfoot tr.gl-total');
    expect(total).toBeTruthy();
    expect(text(total!)).toContain('TOTAL');
    expect(ruleFor('.gl-total td')).toMatch(/font-weight:\s*700/);
  });

  it('shows every balance and both totals', () => {
    const v = page();
    const tb = w().GL.trialBalance();
    const shown = text(v);
    tb.rows.forEach((r: any) => {
      expect(shown).toContain(r.name);
      if (r.debit) {
        expect(shown).toContain(rp(r.debit));
      }
      if (r.credit) {
        expect(shown).toContain(rp(r.credit));
      }
    });
    const totals = v.querySelectorAll('.gl-total .t-num');
    expect(Array.from(totals).map(el => el.textContent)).toEqual([
      w().idrFull(tb.totalDebit),
      w().idrFull(tb.totalCredit),
    ]);
    expect(shown).toContain('Seimbang');
  });

  it('shows the balance check as one line, flagged when unbalanced', () => {
    expect(page().querySelector('.gl-balance.is-ok')!.textContent).toContain('Seimbang');
    expect(page().querySelector('.stat-card')).toBeNull(); // totals live in the TOTAL row
    addJournal('610101', '110101', 1000, 400);
    const off = page().querySelector('.gl-balance')!;
    expect(off.classList.contains('is-off')).toBe(true);
    expect(text(off)).toContain('Tidak seimbang');
  });
});

// ── Laba Rugi ────────────────────────────────────────────────────────────────
describe('Laba Rugi', () => {
  const page = () => render(w().renderFinancials());

  it('has no inline bold; lines plain, section headings medium, totals bold', () => {
    const v = page();
    expect(v.innerHTML).not.toMatch(INLINE_BOLD);
    v.querySelectorAll('.fin-lines tbody tr').forEach(tr => {
      expect(tr.classList.contains('fin-total')).toBe(false);
    });
    const heads = Array.from(v.querySelectorAll('.fin-sec-head')).map(el => el.textContent);
    expect(heads).toEqual(
      expect.arrayContaining(['Pendapatan', 'Harga Pokok Penjualan (HPP)', 'Beban Operasional'])
    );
    expect(v.querySelectorAll('.fin-lines tfoot tr.fin-total').length).toBe(heads.length);
    expect(ruleFor('.fin-sec-head')).toMatch(/font-weight:\s*(500|600)/);
    expect(ruleFor('.fin-total td')).toMatch(/font-weight:\s*700/);
    expect(ruleFor('.fin-subtotal')).toMatch(/font-weight:\s*700/);
    const subtotals = Array.from(v.querySelectorAll('.fin-subtotal')).map(el => text(el));
    expect(subtotals.some(s => s.startsWith('Laba Kotor'))).toBe(true);
    expect(v.querySelectorAll('.fin-subtotal.fin-major')).toHaveLength(1);
  });

  it('shows every account balance and the subtotals, without repeating tiles', () => {
    const v = page();
    const shown = text(v);
    const tb = w().GL.trialBalance();
    const credit = new Set(['REVENUE', 'OTHER_INCOME']);
    const pl = new Set(['REVENUE', 'OTHER_INCOME', 'COGS', 'EXPENSE', 'OTHER_EXPENSE']);
    let net = 0;
    tb.rows
      .filter((r: any) => pl.has(r.type))
      .forEach((r: any) => {
        const val = credit.has(r.type) ? r.credit - r.debit : r.debit - r.credit;
        net += credit.has(r.type) ? val : -val;
        expect(shown).toContain(r.name);
        expect(shown).toContain(rp(val));
      });
    // Laba Bersih is the bottom line of the statement; no tiles repeat it above.
    const bottom = v.querySelector('.fin-major .t-num')!;
    expect(bottom.textContent).toBe(w().idrFull(net));
    expect(v.querySelector('.fin-recap, .stat-card')).toBeNull();
  });

  it('flags negative amounts in the danger colour and nothing else', () => {
    addJournal('610101', '110101', 5_000_000_000_000);
    const v = page();
    const cells = Array.from(v.querySelectorAll('.fin-statement .t-num'));
    const negatives = cells.filter(el => (el.textContent || '').startsWith('-'));
    expect(negatives.length).toBeGreaterThan(0);
    negatives.forEach(el => expect(el.classList.contains('fin-neg')).toBe(true));
    cells
      .filter(el => !(el.textContent || '').startsWith('-'))
      .forEach(el => {
        expect(el.classList.contains('fin-neg')).toBe(false);
      });
    // Positive amounts are not coloured, except a positive bottom line (none here).
    expect(v.querySelector('.fin-major .t-num')!.classList.contains('fin-neg')).toBe(true);
    expect(ruleFor('.fin-neg')).toMatch(/color:\s*var\(--danger\)/);
    // Tiles: red only when negative.
    v.querySelectorAll('.fin-recap .stat-val').forEach(el => {
      const neg = (el.textContent || '').startsWith('-');
      expect((el.getAttribute('style') || '').includes('var(--danger)')).toBe(neg);
    });
  });

  it('prints the statement card, not a stat tile', () => {
    const doc = { write: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue({ document: doc, print: vi.fn() } as any);
    const el = document.getElementById('view-financials')!;
    el.innerHTML = w().renderFinancials();
    (el.querySelector('[data-action="finPrint"]') as HTMLElement).click();
    expect(open).toHaveBeenCalled();
    const html = doc.write.mock.calls[0][0] as string;
    expect(html).toContain('fin-statement');
    expect(html).toContain('Total Pendapatan');
    expect(html).toMatch(/\.fin-total td,[^{]*\{font-weight:700\}/);
    open.mockRestore();
  });
});

// ── Pajak & PPN ──────────────────────────────────────────────────────────────
describe('Pajak & PPN', () => {
  const page = () => {
    w().navigate('tax');
    return document.getElementById('view-tax')!;
  };

  it('folds the latest documents behind a closed toggle', () => {
    const docs = page().querySelector('details.tax-docs') as HTMLDetailsElement;
    expect(docs).toBeTruthy();
    expect(docs.open).toBe(false);
    expect(docs.querySelector('summary')!.textContent).toContain('Dokumen terakhir');
    expect(docs.textContent).toContain('Dasar Penjualan (PPN Keluaran)');
    expect(docs.textContent).toContain('Dasar Pembelian (PPN Masukan)');
  });

  it('is rendered by the calm page renderer, with no inline bold', () => {
    const v = page();
    expect(v.querySelector('.tax-facts')).toBeTruthy();
    expect(v.innerHTML).not.toMatch(INLINE_BOLD);
    expect(v.querySelector('.sec-hdr p')).toBeNull(); // no subtitle repeating the title
    v.querySelectorAll('.tax-doc').forEach(row => {
      expect(row.querySelector('strong, b, .t-strong')).toBeNull();
    });
  });

  it('keeps the explanations behind closed "Penjelasan" toggles', () => {
    const v = page();
    const toggles = Array.from(v.querySelectorAll('details.tax-explain'));
    expect(toggles).toHaveLength(2);
    toggles.forEach(d => {
      expect(d.hasAttribute('open')).toBe(false);
      expect(d.querySelector('summary')!.textContent).toBe('Penjelasan');
    });
    expect(text(toggles[0])).toContain('amount × tarif PPN');
    expect(text(toggles[1])).toContain('Paid/Delivered');
  });

  it('shows every figure of the tax summary', () => {
    const v = page();
    const s = w().calcTaxSummary();
    const shown = text(v);
    [s.outputTax, s.inputTax, s.netTax, s.salesBase, s.purchaseBase].forEach(n =>
      expect(shown).toContain(rp(n))
    );
    expect(shown).toContain(`${s.salesOrders.length} transaksi`);
    expect(shown).toContain(`${s.purchaseOrders.length} transaksi`);
    expect(shown).toContain(String(s.salesWithTax + s.purchaseWithTax));
    expect(shown).toContain('01.234.567.8-901.000');
    expect(shown).toContain('Terdaftar');
    expect(shown).toContain('11%');
    const newest = (list: any[]) =>
      list
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 5);
    newest(s.salesOrders)
      .concat(newest(s.purchaseOrders))
      .forEach((o: any) => {
        expect(shown).toContain(o.number || o.id);
        expect(shown).toContain(rp(o.amount || 0));
      });
    expect(v.querySelectorAll('.tax-doc')).toHaveLength(
      newest(s.salesOrders).length + newest(s.purchaseOrders).length
    );
  });

  it('shows PPN Terutang plain when owed and red when negative', () => {
    const tile = () =>
      Array.from(page().querySelectorAll('.stat-card')).find(c =>
        text(c).includes('PPN Terutang')
      )!;
    expect(w().calcTaxSummary().netTax).toBeGreaterThan(0);
    expect(tile().querySelector('.stat-val')!.getAttribute('style')).not.toContain('--danger');
    w().DB.purchaseOrders.push({
      id: 'PO-T',
      number: 'PO.T',
      date: '2026-09-10',
      status: 'Received',
      supplier: 'Uji',
      amount: 1,
      tax: 9_000_000_000_000,
    });
    const val = tile().querySelector('.stat-val')!;
    expect(val.textContent!.startsWith('-')).toBe(true);
    expect(val.getAttribute('style')).toContain('var(--danger)');
  });
});
