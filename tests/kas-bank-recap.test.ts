// ═══════════════════════════════════════════════════════════════════════════════
// Kas & Bank — expense recap, Excel export and bank charges (bank-extras.js)
//
//   • records saved as 'Transport' read as Transportasi (stored value untouched)
//   • default accounts per category (Biaya Bank → 610401, Reimbursement → 610101)
//   • totals per category for a month or for every period
//   • the export: records of the period + totals per category
//   • a bank charge recorded from a statement line posts Dr 610401 / Cr bank and
//     marks the line matched; interest posts Dr bank / Cr 710101
//   • statement balance vs ledger balance at the end of the statement period
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';

const w = () => window as any;
const bx = () => w()._bankExtras;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/xlsx-export.js');
  await import('../public/classic/core/bank-extras.js');
});

const PAYMENTS = [
  {
    id: 'OP-1',
    number: 'OP.2026.09.00001',
    date: '2026-09-03',
    bankAccountId: 'BA001',
    payee: 'SPBU Cikarang',
    category: 'Transport', // older records carry the short label
    accountNo: '610101',
    amount: 150000,
    method: 'Tunai',
  },
  {
    id: 'OP-2',
    number: 'OP.2026.09.00002',
    date: '2026-09-10',
    bankAccountId: 'BA001',
    payee: 'Toko Sinar ATK',
    category: 'ATK',
    accountNo: '610101',
    amount: 80000,
    method: 'Transfer Bank',
    notes: 'Kertas dan tinta',
    reference: 'KW-12',
  },
  {
    id: 'OP-3',
    number: 'OP.2026.09.00003',
    date: '2026-09-21',
    bankAccountId: 'BA001',
    payee: 'Budi',
    category: 'Transportasi',
    accountNo: '610101',
    amount: 50000,
    method: 'Transfer Bank',
  },
  {
    id: 'OP-4',
    number: 'OP.2026.10.00001',
    date: '2026-10-02',
    bankAccountId: 'BA001',
    payee: 'Andi',
    category: 'Reimbursement',
    accountNo: '610101',
    amount: 300000,
    method: 'Transfer Bank',
  },
];

const STATEMENT = {
  id: 'BS.2026.09.001',
  accountId: 'BA001',
  period: '2026-09',
  uploadDate: '2026-10-01',
  closingBalance: 1018600,
  entries: [
    { date: '2026-09-30', description: 'BIAYA ADM BULANAN', debit: 15000, credit: 0 },
    { date: '2026-09-30', description: 'BUNGA JASA GIRO', debit: 0, credit: 42000 },
    { date: '2026-09-30', description: 'PAJAK BUNGA', debit: 8400, credit: 0 },
  ],
};

function seed(over: Record<string, unknown> = {}) {
  w().DB = {
    otherPayments: [],
    otherDeposits: [],
    bankTransfers: [],
    bankStatements: [],
    journals: [],
    accountsChart: [],
    numberSequences: {},
    settings: {
      bankAccounts: [
        { id: 'BA001', name: 'BCA - Rekening Utama', bank: 'BCA' },
        { id: 'BA002', name: 'Mandiri - Operasional', bank: 'Mandiri' },
      ],
    },
    ...clone(over),
  };
  w().GL.ensureChart();
  w().GL.reconcileAll();
}

function journalOf(docType: string, id: string) {
  return w().DB.journals.find((j: any) => j.id === `J:${docType}:${id}`);
}
function line(j: any, accountNo: string) {
  return j.lines.find((l: any) => l.accountNo === accountNo);
}

describe('expense categories', () => {
  it('shows Transportasi once and reads Transport records as Transportasi', () => {
    const cats: string[] = bx().categories.expense;
    expect(cats).not.toContain('Transport');
    expect(cats.filter(c => c === 'Transportasi')).toHaveLength(1);
    for (const c of [
      'ATK',
      'Entertain',
      'Utilities',
      'Sewa',
      'Gaji',
      'Pemeliharaan',
      'Asuransi',
      'Pajak',
      'Lainnya',
      'Biaya Bank',
      'Reimbursement',
    ]) {
      expect(cats).toContain(c);
    }
    expect(bx().categories.income).toContain('Bunga Bank');

    expect(bx().normCategory('Transport')).toBe('Transportasi');
    expect(bx().normCategory(' transport ')).toBe('Transportasi');
    expect(bx().normCategory('Transportasi')).toBe('Transportasi');
    expect(bx().normCategory('ATK')).toBe('ATK');
  });

  it('defaults the account by category', () => {
    const acc = bx().defaultAccountFor;
    expect(acc('expense', 'Biaya Bank')).toBe('610401'); // Beban Administrasi Bank
    expect(acc('expense', 'Reimbursement')).toBe('610101');
    expect(acc('expense', 'Gaji')).toBe('610301');
    expect(acc('expense', 'Transport')).toBe('610101');
    expect(acc('expense', 'ATK')).toBe('610101');
    expect(acc('income', 'Bunga Bank')).toBe('710101'); // Pendapatan Lain-lain
    expect(acc('income', 'Penjualan')).toBe('400001');
    expect(acc('income', 'Refund')).toBe('710101');
  });

  it('posts a Biaya Bank record saved without an account to 610401', () => {
    seed({
      otherPayments: [
        {
          id: 'OP-9',
          date: '2026-09-30',
          bankAccountId: 'BA001',
          category: 'Biaya Bank',
          amount: 15000,
          method: 'Transfer Bank',
        },
      ],
    });
    const j = journalOf('OP', 'OP-9');
    expect(line(j, '610401').debit).toBe(15000);
    expect(line(j, '110102').credit).toBe(15000);
  });
});

describe('period recap per category', () => {
  it('totals a month per category, largest first', () => {
    const r = bx().recapByCategory(PAYMENTS, '2026-09', 'expense');
    expect(r.label).toBe('September 2026');
    expect(r.total).toBe(280000);
    expect(r.count).toBe(3);
    expect(r.rows.map((c: any) => [c.category, c.count, c.amount])).toEqual([
      ['Transportasi', 2, 200000],
      ['ATK', 1, 80000],
    ]);
    expect(r.rows[0].accounts).toEqual(['610101']);
  });

  it('covers every period with "all" and leaves stored categories alone', () => {
    const rows = clone(PAYMENTS);
    const all = bx().recapByCategory(rows, 'all', 'expense');
    expect(all.label).toBe('Semua periode');
    expect(all.total).toBe(580000);
    expect(all.count).toBe(4);
    expect(all.rows[0]).toMatchObject({ category: 'Reimbursement', amount: 300000 });
    expect(bx().recapByCategory(rows, '2026-10', 'expense').total).toBe(300000);
    expect(bx().recapByCategory(rows, '2026-08', 'expense').rows).toEqual([]);
    expect(rows[0].category).toBe('Transport');
  });

  it('skips cancelled records, like the ledger does', () => {
    const rows = [...clone(PAYMENTS), { ...PAYMENTS[1], id: 'OP-X', status: 'Cancelled' }];
    expect(bx().recapByCategory(rows, '2026-09', 'expense').total).toBe(280000);
  });
});

describe('Excel export', () => {
  it('builds the records sheet and the per-category sheet', () => {
    seed({ otherPayments: PAYMENTS });
    const sheets = bx().buildRecapSheets('expense', w().DB.otherPayments, '2026-09');
    expect(sheets).toHaveLength(2);

    const [detail, totals] = sheets;
    expect(detail.name).toBe('Pengeluaran 2026-09');
    expect(detail.columns.map((c: any) => c.header)).toEqual([
      'Tanggal',
      'No.',
      'Penerima',
      'Kategori',
      'Akun',
      'Metode',
      'Rekening',
      'Keterangan',
      'Jumlah',
    ]);
    expect(detail.columns[8].type).toBe('currency');
    expect(detail.rows).toHaveLength(3);
    expect(detail.rows.map((r: any[]) => r[0])).toEqual(['2026-09-03', '2026-09-10', '2026-09-21']);
    expect(detail.rows[0]).toEqual([
      '2026-09-03',
      'OP.2026.09.00001',
      'SPBU Cikarang',
      'Transportasi',
      '610101 — Beban Operasional Lain',
      'Tunai',
      'Kas', // cash method books to Kas, not the bank account
      '',
      150000,
    ]);
    expect(detail.rows[1][6]).toBe('BCA - Rekening Utama');
    expect(detail.rows[1][7]).toBe('Kertas dan tinta · Ref. KW-12');

    expect(totals.columns.map((c: any) => c.header)).toEqual([
      'Kategori',
      'Akun',
      'Transaksi',
      'Jumlah',
    ]);
    expect(totals.rows).toEqual([
      ['Transportasi', '610101 — Beban Operasional Lain', 2, 200000],
      ['ATK', '610101 — Beban Operasional Lain', 1, 80000],
      ['Total', '', 3, 280000],
    ]);

    // Valid workbook bytes (a ZIP), without triggering a download.
    const bytes: Uint8Array = w().NSAXlsx.buildBytes(sheets);
    expect(bytes.length).toBeGreaterThan(0);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    expect(bx().recapFileName('expense', '2026-09')).toBe('Pengeluaran-Lain-2026-09.xlsx');
    expect(bx().recapFileName('income', 'all')).toBe('Penerimaan-Lain-Semua.xlsx');
  });

  it('labels the party column Pembayar for Penerimaan Lain', () => {
    const deposits = [
      {
        id: 'OD-1',
        number: 'OD.2026.09.00001',
        date: '2026-09-30',
        bankAccountId: 'BA001',
        payer: 'Bank BCA',
        category: 'Bunga Bank',
        amount: 42000,
        method: 'Transfer Bank',
      },
    ];
    seed({ otherDeposits: deposits });
    const [detail, totals] = bx().buildRecapSheets('income', w().DB.otherDeposits, 'all');
    expect(detail.name).toBe('Penerimaan Semua');
    expect(detail.columns[2].header).toBe('Pembayar');
    expect(detail.rows[0][2]).toBe('Bank BCA');
    expect(detail.rows[0][4]).toBe('710101 — Pendapatan Lain-lain');
    expect(totals.rows).toEqual([
      ['Bunga Bank', '710101 — Pendapatan Lain-lain', 1, 42000],
      ['Total', '', 1, 42000],
    ]);
  });
});

describe('bank charges from the statement', () => {
  it('records a fee from a debit line: Biaya Bank, Dr 610401 / Cr bank, line matched', () => {
    seed({ bankStatements: [STATEMENT] });
    const doc = bx().recordBankCharge({
      type: 'admin',
      statementId: STATEMENT.id,
      lineIndex: 0,
    });
    expect(w().DB.otherPayments).toContain(doc);
    expect(doc).toMatchObject({
      category: 'Biaya Bank',
      accountNo: '610401',
      amount: 15000,
      date: '2026-09-30',
      bankAccountId: 'BA001',
      payee: 'Bank BCA',
      method: 'Transfer Bank',
      bankStatementId: STATEMENT.id,
      bankStatementLine: 0,
    });
    expect(doc.number).toMatch(/^OP\.2026\.09\.\d+$/);
    expect(doc.notes).toBe('Biaya admin — BIAYA ADM BULANAN');

    const bs = w().DB.bankStatements[0];
    expect(bs.reconciled[0]).toBe(true);
    expect(bs.matches[0]).toEqual({ docType: 'OP', docId: doc.id });

    w().GL.reconcileAll();
    const j = journalOf('OP', doc.id);
    expect(j.lines).toHaveLength(2);
    expect(line(j, '610401')).toMatchObject({ debit: 15000, credit: 0 });
    expect(line(j, '110102')).toMatchObject({ debit: 0, credit: 15000 }); // Bank BCA
    expect(w().GL.trialBalance().balanced).toBe(true);
  });

  it('records interest from a credit line as Bunga Bank: Dr bank / Cr 710101', () => {
    seed({ bankStatements: [STATEMENT] });
    const doc = bx().recordBankCharge({
      type: 'interest',
      statementId: STATEMENT.id,
      lineIndex: 1,
    });
    expect(w().DB.otherDeposits).toContain(doc);
    expect(doc).toMatchObject({ category: 'Bunga Bank', accountNo: '710101', amount: 42000 });
    expect(w().DB.bankStatements[0].matches[1]).toEqual({ docType: 'OD', docId: doc.id });

    w().GL.reconcileAll();
    const j = journalOf('OD', doc.id);
    expect(line(j, '110102')).toMatchObject({ debit: 42000 });
    expect(line(j, '710101')).toMatchObject({ credit: 42000 });
  });

  it('records tax on interest under Biaya Bank on 610101', () => {
    seed({ bankStatements: [STATEMENT] });
    const doc = bx().recordBankCharge({
      type: 'interestTax',
      statementId: STATEMENT.id,
      lineIndex: 2,
    });
    expect(doc).toMatchObject({ category: 'Biaya Bank', accountNo: '610101', amount: 8400 });
    w().GL.reconcileAll();
    expect(line(journalOf('OP', doc.id), '610101').debit).toBe(8400);
  });

  it('refuses the wrong side, a second recording and a missing bank account', () => {
    seed({ bankStatements: [STATEMENT] });
    expect(() =>
      bx().recordBankCharge({ type: 'interest', statementId: STATEMENT.id, lineIndex: 0 })
    ).toThrow(/kredit/);
    expect(() =>
      bx().recordBankCharge({ type: 'admin', statementId: STATEMENT.id, lineIndex: 1 })
    ).toThrow(/debit/);
    bx().recordBankCharge({ type: 'admin', statementId: STATEMENT.id, lineIndex: 0 });
    expect(() =>
      bx().recordBankCharge({ type: 'transfer', statementId: STATEMENT.id, lineIndex: 0 })
    ).toThrow(/sudah dicatat/);
    expect(() => bx().recordBankCharge({ type: 'admin', amount: 5000 })).toThrow(/rekening/);
    expect(() =>
      bx().recordBankCharge({ type: 'admin', bankAccountId: 'BA001', amount: 0 })
    ).toThrow(/Jumlah/);
    expect(w().DB.otherPayments).toHaveLength(1);
  });

  it('records a fee without a statement line on the chosen account', () => {
    seed();
    const doc = bx().recordBankCharge({
      type: 'transfer',
      bankAccountId: 'BA002',
      date: '2026-09-15',
      amount: 6500,
      description: 'Transfer ke supplier',
    });
    expect(doc).toMatchObject({
      category: 'Biaya Bank',
      accountNo: '610401',
      payee: 'Bank Mandiri',
    });
    expect(doc.bankStatementId).toBeUndefined();
    w().GL.reconcileAll();
    const j = journalOf('OP', doc.id);
    expect(line(j, '610401').debit).toBe(6500);
    expect(line(j, '110103').credit).toBe(6500); // Bank Mandiri
  });
});

describe('statement balance vs ledger balance', () => {
  it('shows the difference until the bank items are recorded', () => {
    seed({
      bankStatements: [STATEMENT],
      otherDeposits: [
        {
          id: 'OD-0',
          date: '2026-09-01',
          bankAccountId: 'BA001',
          payer: 'Setoran modal',
          category: 'Lainnya',
          amount: 1000000,
          method: 'Transfer Bank',
        },
      ],
      otherPayments: [
        // after the statement period: not part of the September balance
        { ...PAYMENTS[3], id: 'OP-L', date: '2026-10-05' },
      ],
    });
    const bs = () => w().DB.bankStatements[0];

    let s = bx().reconcileSummary(bs());
    expect(s.accountNo).toBe('110102');
    expect(s.periodEnd).toBe('2026-09-30');
    expect(s.statementBalance).toBe(1018600);
    expect(s.ledgerBalance).toBe(1000000);
    expect(s.difference).toBe(18600);
    expect(s.balanced).toBe(false);
    expect(s.matched).toBe(0);

    bx().recordBankCharge({ type: 'admin', statementId: STATEMENT.id, lineIndex: 0 });
    bx().recordBankCharge({ type: 'interest', statementId: STATEMENT.id, lineIndex: 1 });
    bx().recordBankCharge({ type: 'interestTax', statementId: STATEMENT.id, lineIndex: 2 });
    w().GL.reconcileAll();

    s = bx().reconcileSummary(bs());
    expect(s.ledgerBalance).toBe(1018600);
    expect(s.difference).toBe(0);
    expect(s.balanced).toBe(true);
    expect(s.matched).toBe(3);
    expect(bx().ledgerBalance('110102', '')).toBe(1018600 - 300000);
  });

  it('derives the closing balance from the opening balance and the lines', () => {
    const bs = { ...clone(STATEMENT), closingBalance: null, openingBalance: 1000000 };
    expect(bx().statementBalance(bs)).toBe(1000000 + 42000 - 15000 - 8400);
    expect(bx().statementBalance({ ...bs, openingBalance: null })).toBeNull();
  });
});

describe('pages', () => {
  const tick = () => new Promise(r => setTimeout(r, 0));

  it('Pengeluaran Lain shows the recap of the chosen period', async () => {
    seed({ otherPayments: PAYMENTS });
    document.body.innerHTML = '<div id="view-finance"></div>';
    bx().openOtherPayment();
    await tick();
    const sel = document.querySelector('[data-action="bxPeriod"]') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(document.querySelector('[data-action="bxExport"]')).toBeTruthy();

    sel.value = '2026-09';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    const cats = Array.from(
      document.querySelectorAll('#view-finance table.data-table tbody tr td:first-child')
    ).map(td => td.textContent);
    expect(cats).toEqual(['Transportasi', 'ATK']);
    const list = document.querySelectorAll('#view-finance [data-action="delOP"]');
    expect(list).toHaveLength(3);
    expect(document.getElementById('view-finance')!.textContent).not.toMatch(/Transport(?!asi)/);
  });

  it('Rekonsiliasi Bank offers to record unmatched lines and shows the difference', async () => {
    seed({ bankStatements: [STATEMENT] });
    bx().recordBankCharge({ type: 'admin', statementId: STATEMENT.id, lineIndex: 0 });
    w().GL.reconcileAll();
    document.body.innerHTML = '<div id="view-finance"></div>';
    bx().openBankReconcile();
    await tick();
    const view = document.getElementById('view-finance')!;
    const buttons = Array.from(view.querySelectorAll('[data-action="bxChargeFromLine"]'));
    expect(buttons.map(b => (b as HTMLElement).dataset.idx)).toEqual(['1', '2']);
    expect(buttons.map(b => b.textContent)).toEqual(['Catat bunga', 'Catat biaya']);
    expect(view.textContent).toContain(w().DB.otherPayments[0].number);
    expect(view.textContent).toContain('Selisih');
    expect(view.querySelector('#rc-closing')).toBeTruthy();
  });
});
