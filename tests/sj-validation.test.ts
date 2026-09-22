import { describe, it, expect, beforeEach } from 'vitest';

// sj-validation.js is a classic <script> (IIFE) that attaches window.SJValidation.
beforeEach(async () => {
  (window as any).DB = { goodsReceipts: [] };
  await import('../public/classic/core/sj-validation.js');
});

declare global {
  interface Window {
    SJValidation: any;
    DB: any;
  }
}

// A field Surat Jalan / weighed line as flattened from a reconciled receipt.
function fieldLine(over: any = {}) {
  return {
    poId: 'PO-1',
    doId: 'DO-1',
    itemName: 'Batu Andesit',
    date: '2026-06-10',
    qty: 25,
    netQty: 24.6,
    unitPrice: 185000,
    ...over,
  };
}

describe('sj-validation — cross-check engine', () => {
  it('PASSES a matching row within tolerance (no mismatch flag)', () => {
    const res = window.SJValidation.crossCheck(
      [fieldLine()],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 24.6, price: 185000 }]
    );
    expect(res.summary.total).toBe(1);
    expect(res.summary.matched).toBe(1);
    expect(res.summary.clean).toBe(1);
    expect(res.summary.mismatched).toBe(0);
    expect(res.rows[0].matched).toBe(true);
    expect(res.rows[0].mismatch).toBe(false);
    expect(res.rows[0].tonnageMismatch).toBe(false);
    expect(res.rows[0].priceMismatch).toBe(false);
  });

  it('FLAGS a tonnage mismatch beyond tolerance', () => {
    const res = window.SJValidation.crossCheck(
      [fieldLine({ netQty: 30 })],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 33, price: 185000 }]
    );
    const row = res.rows[0];
    expect(row.matched).toBe(true);
    expect(row.tonnageMismatch).toBe(true);
    expect(row.priceMismatch).toBe(false);
    expect(row.mismatch).toBe(true);
    expect(row.tonnageVariance).toBe(3);
    expect(res.summary.mismatched).toBe(1);
    // A flagged row is matched but NOT clean — the "Cocok" widget must exclude it.
    expect(res.summary.matched).toBe(1);
    expect(res.summary.clean).toBe(0);
  });

  it('excludes flagged rows from the clean count while keeping unflagged matches', () => {
    // Two matched rows against their recap counterparts; only the second breaches
    // tolerance. `clean` must count exactly the one unflagged match — not the two
    // `matched`, and not the mis-derived `matched - mismatched` (= 1 here only by
    // coincidence, so add an unmatched-field row to break that arithmetic).
    const res = window.SJValidation.crossCheck(
      [
        fieldLine({ itemName: 'Batu Andesit', netQty: 24.6, unitPrice: 185000 }),
        fieldLine({ itemName: 'Pasir Cor', netQty: 30, unitPrice: 210000 }),
        fieldLine({ itemName: 'Tak Ada Di Rekap', netQty: 5, unitPrice: 1000 }),
      ],
      [
        { poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 24.6, price: 185000 },
        { poNumber: 'PO-1', itemName: 'Pasir Cor', qty: 33, price: 225000 },
      ]
    );
    expect(res.summary.matched).toBe(2);
    expect(res.summary.unmatchedField).toBe(1);
    expect(res.summary.mismatched).toBe(2); // 1 flagged match + 1 unmatched field
    expect(res.summary.clean).toBe(1); // only the unflagged Batu Andesit match
    // Guard against reverting to the old `matched - mismatched` formula (= 0 here).
    expect(res.summary.matched - res.summary.mismatched).not.toBe(res.summary.clean);
  });

  it('FLAGS a price mismatch beyond tolerance', () => {
    const res = window.SJValidation.crossCheck(
      [fieldLine({ netQty: 30, unitPrice: 210000 })],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 30, price: 225000 }]
    );
    const row = res.rows[0];
    expect(row.tonnageMismatch).toBe(false);
    expect(row.priceMismatch).toBe(true);
    expect(row.mismatch).toBe(true);
    expect(row.priceVariance).toBe(15000);
  });

  it('flags BOTH tonnage and price when both differ', () => {
    const res = window.SJValidation.crossCheck(
      [fieldLine({ netQty: 30, unitPrice: 210000 })],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 33, price: 225000 }]
    );
    const row = res.rows[0];
    expect(row.tonnageMismatch).toBe(true);
    expect(row.priceMismatch).toBe(true);
    expect(row.mismatch).toBe(true);
  });

  it('does NOT flag tiny variances inside the default tolerance band', () => {
    // +0.03 tons and +Rp1/unit are within the absolute tolerances.
    const res = window.SJValidation.crossCheck(
      [fieldLine({ netQty: 24.6, unitPrice: 185000 })],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 24.63, price: 185001 }]
    );
    expect(res.rows[0].mismatch).toBe(false);
  });

  it('handles unmatched recap rows (potential phantom charge)', () => {
    const res = window.SJValidation.crossCheck(
      [fieldLine()],
      [
        { poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 24.6, price: 185000 },
        { poNumber: 'PO-9', itemName: 'Item Hantu', qty: 10, price: 500000 },
      ]
    );
    expect(res.unmatchedRecap.length).toBe(1);
    expect(res.unmatchedRecap[0].itemName).toBe('Item Hantu');
    expect(res.summary.unmatchedRecap).toBe(1);
  });

  it('flags a field line that has no recap counterpart (cannot validate)', () => {
    const res = window.SJValidation.crossCheck([fieldLine({ itemName: 'Tak Ada Di Rekap' })], []);
    expect(res.rows[0].matched).toBe(false);
    expect(res.rows[0].mismatch).toBe(true);
    expect(res.summary.unmatchedField).toBe(1);
  });

  it('respects a custom (looser) tolerance that suppresses a flag', () => {
    const strict = window.SJValidation.crossCheck(
      [fieldLine({ netQty: 30 })],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 33, price: 185000 }]
    );
    expect(strict.rows[0].tonnageMismatch).toBe(true);
    const loose = window.SJValidation.crossCheck(
      [fieldLine({ netQty: 30 })],
      [{ poNumber: 'PO-1', itemName: 'Batu Andesit', qty: 33, price: 185000 }],
      { tonnagePct: 0.2 } // 20% band absorbs the +3/30 = 10% variance
    );
    expect(loose.rows[0].tonnageMismatch).toBe(false);
  });

  it('matches by DO number when PO is absent', () => {
    const res = window.SJValidation.crossCheck(
      [fieldLine({ poId: '', doId: 'DO-77', netQty: 30 })],
      [{ doNumber: 'DO-77', itemName: 'Batu Andesit', qty: 30, price: 185000 }]
    );
    expect(res.rows[0].matched).toBe(true);
    expect(res.rows[0].mismatch).toBe(false);
  });
});

describe('sj-validation — receipt flattening + demo seed', () => {
  it('flattens reconciled receipts into field lines', () => {
    const lines = window.SJValidation.fieldLinesFromReceipts([
      {
        id: 'GR-1',
        poId: 'PO-5',
        reconciled: true,
        items: [
          {
            itemId: 'A',
            itemName: 'A',
            reconciledQty: 12,
            unitPrice: 1000,
            weighing: { netQty: 12 },
          },
        ],
      },
    ]);
    expect(lines.length).toBe(1);
    expect(lines[0].poId).toBe('PO-5');
    expect(lines[0].unitPrice).toBe(1000);
  });

  it('seeds a demo scenario with a matching and a mismatching recap row', () => {
    const demo = window.SJValidation.seedDemo();
    const receipts = (window.DB.goodsReceipts || []).filter((r: any) => r.reconciled);
    const fieldLines = window.SJValidation.fieldLinesFromReceipts(receipts);
    const res = window.SJValidation.crossCheck(fieldLines, demo.recapRows);
    // Exactly one of the two demo rows must be flagged (the overstated one).
    expect(res.summary.mismatched).toBe(1);
    expect(res.summary.matched).toBe(2);
    // The clean count is the "safe to invoice" figure: one matched, unflagged row.
    expect(res.summary.clean).toBe(1);
  });
});

describe('sj-validation — pluggable recap source contract', () => {
  it('ships a working manual upload source', () => {
    const ids = window.SJValidation.getRecapSources().map((s: any) => s.id);
    expect(ids).toContain('upload');
  });

  it('registers and fetches from a custom (email-style) source via the same contract', async () => {
    window.SJValidation.registerRecapSource({
      id: 'test-mailbox',
      label: 'Test Mailbox',
      fetchRecaps: () => Promise.resolve([{ poNumber: 'PO-1', itemName: 'X', qty: 1, price: 1 }]),
    });
    expect(window.SJValidation.getRecapSources().map((s: any) => s.id)).toContain('test-mailbox');
    const rows = await window.SJValidation.fetchFromSource('test-mailbox');
    expect(rows.length).toBe(1);
    expect(rows[0].poNumber).toBe('PO-1');
  });

  it('rejects an invalid source registration', () => {
    expect(() => window.SJValidation.registerRecapSource({ id: 'bad' } as any)).toThrow();
  });
});
