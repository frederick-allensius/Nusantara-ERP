// ═══════════════════════════════════════════════════════════════════════════════
// Faktur pajak keluaran & Coretax XML (tax-extras.js)
//
//   • only documents that post PPN Keluaran count: active sales invoices and
//     delivered orders without an active invoice (drafts/cancelled never)
//   • DPP and PPN match the documents (no PPN added twice)
//   • the XML follows DJP's sample layout and its totals equal the documents
//   • missing NPWP / unit codes are reported, not silently exported
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/tax-extras.js');
});

const line = (qty: number, price: number, unit = 'Ton') => ({
  itemId: '1',
  itemName: 'Batu Split 1-2 cm',
  unit,
  qty,
  price,
  lineDiscount: 0,
  subtotal: qty * price,
});

beforeEach(() => {
  w().DB = {
    customers: [
      {
        id: 'C1',
        name: 'PT Arta',
        npwp: '01.234.567.8-901.000',
        address: 'Jakarta',
        email: 'a@x.id',
      },
      { id: 'C2', name: 'Toko Rezeki', npwp: '', address: 'Depok' },
    ],
    salesOrders: [
      // invoiced below → reported through the invoice
      {
        id: 'SO-1',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-09-05',
        status: 'Delivered',
        taxRate: 0.11,
        tax: 1100000,
        lines: [line(100, 100000)],
      },
      // delivered, not invoiced → reported itself
      {
        id: 'SO-2',
        number: 'SO.2026.09.00002',
        customer: 'Toko Rezeki',
        customerId: 'C2',
        date: '2026-09-07',
        status: 'Delivered',
        taxRate: 0.11,
        tax: 220000,
        lines: [line(20, 100000, 'M3')],
      },
      // not delivered → not a tax document
      {
        id: 'SO-3',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-09-08',
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [line(5, 100000)],
      },
    ],
    salesInvoices: [
      {
        id: 'SI-1',
        number: 'SI.2026.09.00001',
        sourceId: 'SO-1',
        sourceType: 'SO',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-09-06',
        status: 'Outstanding',
        taxRate: 0.11,
        tax: 1100000,
        amount: 11100000,
        lines: [line(100, 100000)],
      },
      {
        id: 'SI-2',
        number: 'SI.2026.09.00002',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-09-09',
        status: 'Draft',
        taxRate: 0.11,
        tax: 55000,
        lines: [line(5, 100000)],
      },
      {
        id: 'SI-3',
        number: 'SI.2026.08.00009',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-08-30',
        status: 'Paid',
        taxRate: 0.11,
        tax: 110000,
        lines: [line(10, 100000)],
      },
    ],
    salesReceipts: [],
    salesReturns: [],
    paymentLogs: [],
    settings: { efakturCfg: { npwp: '0123456789012345' }, units: ['Ton', 'M3'] },
  };
});

describe('output tax documents', () => {
  it('lists active invoices and uninvoiced deliveries of the period, once each', () => {
    const rows = w()._taxExtras.getVatInvoices('2026-09');
    expect(rows.map((r: any) => r.key).sort()).toEqual(['SI:SI-1', 'SO:SO-2']);
  });

  it('takes DPP and PPN from the document, without adding PPN again', () => {
    const si = w()
      ._taxExtras.getVatInvoices('2026-09')
      .find((r: any) => r.key === 'SI:SI-1');
    expect(si.dpp).toBe(10000000);
    expect(si.ppn).toBe(1100000);
    expect(si.npwp).toBe('01.234.567.8-901.000');
  });

  it('handles tax-inclusive prices', () => {
    w().DB.salesInvoices = [
      {
        id: 'SI-9',
        number: 'SI-9',
        customerId: 'C1',
        customer: 'PT Arta',
        date: '2026-09-10',
        status: 'Outstanding',
        taxRate: 0.11,
        taxInclusive: true,
        lines: [line(1, 1110000)],
      },
    ];
    w().DB.salesOrders = [];
    const [r] = w()._taxExtras.getVatInvoices('2026-09');
    expect(r.ppn).toBe(110000);
    expect(r.dpp).toBe(1000000);
    expect(r.lines[0].dpp).toBeCloseTo(1000000, 6);
  });
});

describe('Coretax XML', () => {
  const tag = (xml: string, name: string) =>
    [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map(m => m[1]);

  it('follows the DJP sample layout with the seller and buyer identities', () => {
    const t = w()._taxExtras;
    const xml = t.coretaxXml(t.getVatInvoices('2026-09'), {
      npwp: '0123456789012345',
      trxCode: '04',
      unitCodes: {},
      goodsCodes: {},
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(tag(xml, 'TIN')).toEqual(['0123456789012345']);
    expect(tag(xml, 'SellerIDTKU')).toEqual(['0123456789012345000000', '0123456789012345000000']);
    // 15-digit NPWP gets a leading zero; a customer without NPWP uses Other ID
    expect(tag(xml, 'BuyerTin')).toContain('0012345678901000');
    expect(tag(xml, 'BuyerDocument').sort()).toEqual(['Other ID', 'TIN']);
    expect(tag(xml, 'RefDesc').sort()).toEqual(['SI.2026.09.00001', 'SO.2026.09.00002']);
    expect(tag(xml, 'Unit').sort()).toEqual(['UM.0001', 'UM.0033']);
  });

  it('reports 11% PPN as 12% of 11/12 DPP and keeps the totals of the documents', () => {
    const t = w()._taxExtras;
    const rows = t.getVatInvoices('2026-09');
    const xml = t.coretaxXml(rows, {
      npwp: '0123456789012345',
      trxCode: '04',
      unitCodes: {},
      goodsCodes: {},
    });
    const vat = tag(xml, 'VAT').map(Number);
    const base = tag(xml, 'TaxBase').map(Number);
    const other = tag(xml, 'OtherTaxBase').map(Number);
    expect(vat.reduce((s, v) => s + v, 0)).toBe(1100000 + 220000);
    expect(base.reduce((s, v) => s + v, 0)).toBe(10000000 + 2000000);
    expect(other[0]).toBeCloseTo((base[0] * 11) / 12, 2);
    expect(tag(xml, 'VATRate')).toEqual(['12', '12']);
  });

  it('escapes names for XML', () => {
    w().DB.customers[0].name = 'PT A & B <Jaya>';
    w().DB.salesInvoices[0].customer = 'PT A & B <Jaya>';
    const t = w()._taxExtras;
    const xml = t.coretaxXml(t.getVatInvoices('2026-09'), {
      npwp: '0123456789012345',
      unitCodes: {},
      goodsCodes: {},
    });
    expect(xml).toContain('<BuyerName>PT A &amp; B &lt;Jaya&gt;</BuyerName>');
  });

  it('warns about a missing company NPWP, customers without NPWP and unmapped units', () => {
    const t = w()._taxExtras;
    const warnings = t.coretaxWarnings(t.getVatInvoices('2026-09'), { npwp: '', unitCodes: {} });
    expect(warnings.join(' ')).toMatch(/NPWP perusahaan/);
    expect(warnings.join(' ')).toMatch(/Toko Rezeki/);
    expect(warnings.join(' ')).toMatch(/M3/);
  });
});
