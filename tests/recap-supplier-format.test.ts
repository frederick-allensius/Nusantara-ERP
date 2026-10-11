// ═══════════════════════════════════════════════════════════════════════════════
// The supplier's own weighbridge recap, as received by email: one file per site,
// one sheet per material, a two-row header ("No" over GJIB / DO / Surat Jalan /
// Polisi / PO), "Isi / Kosong / Qty (kg)" columns that actually hold tons, a
// subtotal row after each day and a SUBTOTAL footer. It runs cumulatively from
// long before the app was used. "No PO" holds only the running number of the
// company's PO (PO-069/…/VIII/2026 → 69). Names and figures here are made up;
// the layout follows the real files.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as XLSX from '@e965/xlsx';

const w = () => window as any;
const T = () => w().Trading;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/trading.js');
});

const HEAD = [
  ['No', 'No', 'No', 'No', 'No', 'SUPIR', 'Tanggal', 'Isi(kg)', 'Kosong(Kg)', 'Qty(kg)', 'Material', 'Keterangan', 'No'],
  ['', 'GJIB', 'DO', 'Surat Jalan', 'Polisi', '', '', '', '', '', '', '', 'PO'],
];
const d = (iso: string) => new Date(iso + 'T00:00:00Z');
// [no, gjib, do, sj, plate, driver, date, isi, kosong, material, ket, po]
type R = [number, number, number, number, string, string, string, number, number, string, string, number];
function sheet(rows: (R | 'sub')[], material: string) {
  const aoa: unknown[][] = [[], [], [], ...HEAD];
  let day: number[] = [];
  rows.forEach(r => {
    if (r === 'sub') {
      aoa.push(['', '', '', '', '', '', '', '', '', day.reduce((s, x) => s + x, 0)]);
      day = [];
      return;
    }
    const [no, gjib, doNo, sj, plate, drv, date, isi, kosong, mat, ket, po] = r;
    day.push(isi - kosong);
    aoa.push([no, gjib, doNo, sj, plate, drv, d(date), isi, kosong, Math.round((isi - kosong) * 100) / 100, mat, ket, po]);
  });
  aoa.push([], ['', '', '', '', '', '', 'SUBTOTAL'], ['', '', '', '', '', '', material, '', '=', 123.45, 'Ton']);
  return XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
}
function workbook(changed: Record<number, number> = {}) {
  const wb = XLSX.utils.book_new();
  const isi = (doNo: number, v: number) => (changed[doNo] != null ? changed[doNo] : v);
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        // History from before the app was used.
        [1, 30101, 29101, 12, 'B9001XA', 'ASEP', '2026-06-20', 45.1, 12.0, 'Split 1-2', 'BETON CIKANDE', 41],
        'sub',
        [1, 30201, 29201, 40, 'B9001XA', 'ASEP', '2026-08-03', isi(29201, 46.2), 12.1, 'Split 1-2', 'BETON CIKANDE', 69],
        [2, 30202, 29202, 41, 'B9002XA', 'DEDI', '2026-08-03', 45.5, 12.3, 'Split 1-2', 'BETON CIKANDE', 69],
        'sub',
        [1, 30210, 29210, 44, 'B9001XA', 'ASEP', '2026-08-04', 47.0, 12.1, 'Split 1-2', 'BETON CIKANDE', 69],
        'sub',
      ],
      'Split 1-2'
    ),
    'SPLIT 1-2'
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        // The same truck on the same day, for another PO.
        [1, 30211, 29211, 45, 'B9001XA', 'ASEP', '2026-08-04', 46.4, 12.1, 'SCREENING 5-10', 'BETON CIKANDE', 70],
        'sub',
        // A PO the app does not know.
        [1, 30220, 29220, 47, 'B9003XA', 'UJANG', '2026-08-05', 44.0, 12.4, 'SCREENING 5-10', 'BETON CIKANDE', 75],
        'sub',
      ],
      'SCREENING 5-10'
    ),
    'SCREENING 5-10'
  );
  return wb;
}

beforeEach(() => {
  const line = (id: string, name: string) => ({ itemId: id, itemName: name, unit: 'Ton', qty: 130, price: 150000, subtotal: 0 });
  w().DB = {
    settings: { numberFormats: { PO: { pattern: 'PO-{###}/BS/NSA/S/{BULAN-ROMAWI}/{TAHUN}', reset: 'year' } } },
    numberSequences: {},
    customers: [{ id: 'C1', name: 'PT Beton Contoh - Cikande' }],
    suppliers: [{ id: 'S1', name: 'PT Batu Contoh' }],
    inventoryItems: [],
    supplierPrices: [],
    salesOrders: [
      { id: 'SO1', number: 'SO-1', customer: 'PT Beton Contoh - Cikande', customerId: 'C1', date: '2026-08-01', status: 'Confirmed', taxRate: 0.11, lines: [line('A', 'Split 1-2'), line('B', 'Screening 5-10')] },
    ],
    purchaseOrders: [
      { id: 'P69', number: 'PO-069/BS/NSA/S/VIII/2026', supplierId: 'S1', supplier: 'PT Batu Contoh', date: '2026-08-01', status: 'Confirmed', taxRate: 0.11, lines: [line('A', 'Split 1-2')] },
      { id: 'P70', number: 'PO-070/BS/NSA/S/VIII/2026', supplierId: 'S1', supplier: 'PT Batu Contoh', date: '2026-08-01', status: 'Confirmed', taxRate: 0.11, lines: [line('B', 'Screening 5-10')] },
      // An older PO 69 from last year: numbers start again every year.
      { id: 'P69OLD', number: 'PO-069/BS/NSA/S/IX/2025', supplierId: 'S1', supplier: 'PT Batu Contoh', date: '2025-09-01', status: 'Closed', taxRate: 0.11, lines: [line('A', 'Split 1-2')] },
    ],
    deliveryOrders: [],
    salesInvoices: [],
    purchaseInvoices: [],
    journals: [],
    accountsChart: [],
  };
  expect(T().openPickupPO('P69', { soId: 'SO1', capacity: 33, cutoff: '2026-08-31' }).slots).toHaveLength(4);
  expect(T().openPickupPO('P70', { soId: 'SO1', capacity: 33, cutoff: '2026-08-31' }).slots).toHaveLength(4);
});

const rowsOf = (wb: any) => {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return T().recapRowsFromWorkbook(XLSX.read(new Uint8Array(buf), { type: 'array' }), XLSX);
};

describe("supplier's recap layout", () => {
  it('reads every sheet, the two-row header, and skips day subtotals and the footer', () => {
    const got = rowsOf(workbook());
    expect(got.sheets).toEqual(['SPLIT 1-2', 'SCREENING 5-10']);
    expect(got.rows).toHaveLength(6);
    expect(got.rows[1]).toMatchObject({
      sheet: 'SPLIT 1-2',
      row: 8, // as Excel numbers it: three blank rows, two header rows, history + subtotal
      ticketNo: '30201',
      doNo: '29201',
      sjNo: '40',
      vehicle: 'B9001XA',
      driver: 'ASEP',
      date: '2026-08-03',
      gross: 46.2,
      tare: 12.1,
      net: 34.1,
      itemName: 'Split 1-2',
      customer: 'BETON CIKANDE',
      poNumber: '69',
    });
  });

  it('reads kilograms as tons', () => {
    const rows = T().recapRowsFromAoa([
      ['No DO', 'Tanggal', 'No Polisi', 'Berat Isi (Kg)', 'Berat Kosong (Kg)', 'Qty (Kg)'],
      ['41013', '31/08/2026', 'A9999ZZ', 48020, 12280, 35740],
    ]);
    expect(rows[0]).toMatchObject({ doNo: '41013', gross: 48.02, tare: 12.28, net: 35.74 });
  });
});

describe('matching the supplier recap to pickup POs', () => {
  it('finds the PO from its running number, fills its next surat jalan, and skips the history', () => {
    const m = T().matchRecap(rowsOf(workbook()).rows);
    expect(m.skipped).toHaveLength(1); // 20 Jun, before the first pickup PO
    expect(m.fill.map((f: any) => [f.row.doNo, f.doId && T().slotsFor('P69').concat(T().slotsFor('P70')).find((s: any) => s.id === f.doId).sjNo])).toEqual([
      ['29201', 'PO-069/BS/NSA/S/VIII/2026/01'],
      ['29202', 'PO-069/BS/NSA/S/VIII/2026/02'],
      ['29210', 'PO-069/BS/NSA/S/VIII/2026/03'],
      ['29211', 'PO-070/BS/NSA/S/VIII/2026/01'],
    ]);
    expect(m.unmatched.map((u: any) => u.reason)).toEqual(['PO 75 tidak dikenal']);

    const out = T().applyRecap(m, { source: 'rekap' });
    expect(out).toMatchObject({ filled: 4, errors: [] });
    const trip = T().slotsFor('P69')[0];
    expect(trip).toMatchObject({ doNo: '29201', ticketNo: '30201', sjRef: '40', vehicle: 'B9001XA', date: '2026-08-03' });
  });

  it('recognises the same trips in the next cumulative recap, even one truck twice a day', () => {
    T().applyRecap(T().matchRecap(rowsOf(workbook()).rows), { source: 'rekap' });
    const again = T().matchRecap(rowsOf(workbook()).rows);
    expect(again.fill).toHaveLength(0);
    expect(again.same).toHaveLength(4);
    expect(again.problems).toHaveLength(0);
  });

  it('flags a weight the supplier changed afterwards, found by its DO number', () => {
    T().applyRecap(T().matchRecap(rowsOf(workbook()).rows), { source: 'rekap' });
    const next = T().matchRecap(rowsOf(workbook({ 29201: 51.2 })).rows);
    expect(next.changed).toHaveLength(1);
    expect(next.changed[0]).toMatchObject({ from: 34.1, to: 39.1 });
    expect(T().slotsFor('P69').find((s: any) => s.id === next.changed[0].doId).doNo).toBe('29201');
  });

  it("marks a truck whose recap names the customer's other site", () => {
    const rows = rowsOf(workbook()).rows;
    rows[2].customer = 'BETON SERANG'; // written in the recap; the PO is for Cikande
    const m = T().matchRecap(rows);
    expect(m.fill.map((f: any) => f.destinationOff || '')).toEqual(['', 'BETON SERANG', '', '']);
    // Codes shorter than four letters are not compared.
    expect(T().destinationOff({ customer: 'NSA CKD' }, T().slotsFor('P69')[0])).toBe('');
  });

  it('says when a PO has no surat jalan left', () => {
    const rows = rowsOf(workbook()).rows.filter((r: any) => r.poNumber === '69');
    const extra = [1, 2].map(i => ({ ...rows[0], doNo: 'X' + i, ticketNo: 'Y' + i, sjNo: 'Z' + i, vehicle: 'B800' + i + 'XA' }));
    const m = T().matchRecap(rows.concat(extra));
    expect(m.fill).toHaveLength(4);
    expect(m.problems.map((p: any) => p.reason)).toEqual(['Surat jalan PO PO-069/BS/NSA/S/VIII/2026 sudah terpakai semua']);
  });
});
