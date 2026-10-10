// ═══════════════════════════════════════════════════════════════════════════════
// Contoh alur 500 ton (docs/15-CONTOH-ALUR-500-TON.md), the story from the
// 14 Sep 2026 meeting run end to end through the real modules:
//   PO pelanggan 500 t → PO supplier 500 t → 15 surat jalan → 13 truk lewat
//   tiga rekap timbangan (yang kedua mengubah truk yang sudah ditagih 30 → 35)
//   → tagihan mingguan + faktur selisih → harga supplier naik di tengah bulan →
//   tagihan supplier 460 t vs 451,2 t → pelanggan membayar faktur pertama →
//   cut-off akhir bulan.
// Every figure the document quotes is asserted here.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';

const w = () => window as any;
const T = () => w().Trading;

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
});

const ITEM = { itemId: 'BS12', itemName: 'Batu Split 1-2 cm', unit: 'Ton' };

// [SJ, tanggal, no. polisi, sopir, bruto, tara] — netto = bruto − tara.
const TRUCKS: [string, string, string, string, number, number][] = [
  ['01', '2026-09-02', 'B 9012 KJS', 'Asep', 46.7, 12.2],
  ['02', '2026-09-02', 'B 9415 KJS', 'Dedi', 47.4, 12.3],
  ['03', '2026-09-03', 'B 9012 KJS', 'Asep', 46.0, 12.2],
  ['04', '2026-09-03', 'B 9733 KJS', 'Ujang', 42.4, 12.4],
  ['05', '2026-09-04', 'B 9415 KJS', 'Dedi', 47.2, 12.3],
  ['06', '2026-09-08', 'B 9012 KJS', 'Asep', 47.4, 12.2],
  ['07', '2026-09-08', 'B 9733 KJS', 'Ujang', 47.0, 12.4],
  ['08', '2026-09-09', 'B 9415 KJS', 'Dedi', 46.2, 12.3],
  ['09', '2026-09-10', 'B 9012 KJS', 'Asep', 47.0, 12.2],
  ['10', '2026-09-10', 'B 9733 KJS', 'Ujang', 47.4, 12.4],
  ['11', '2026-09-15', 'B 9415 KJS', 'Dedi', 46.7, 12.3],
  ['12', '2026-09-15', 'B 9012 KJS', 'Asep', 47.5, 12.2],
  ['13', '2026-09-16', 'B 9733 KJS', 'Ujang', 47.1, 12.4],
];
const PO_NO = 'PO.2026.09.00101';
const sj = (n: string) => `${PO_NO}/${n}`;
const slot = (n: string) => T().slotsFor('PO-RT').find((d: any) => d.sjNo === sj(n));
const net = (n: string) => T().netOf(slot(n));

// A weighbridge recap as the Excel would bring it: the given trucks, with an
// optional changed gross weight per SJ.
function recap(upTo: number, changed: Record<string, number> = {}) {
  return TRUCKS.slice(0, upTo).map(([n, date, vehicle, driver, gross, tare], i) => ({
    row: i + 2,
    sjNo: sj(n),
    poNumber: PO_NO,
    date,
    vehicle,
    driver,
    gross: changed[n] != null ? changed[n] : gross,
    tare,
    net: Math.round(((changed[n] != null ? changed[n] : gross) - tare) * 1000) / 1000,
  }));
}

function ledger() {
  w().GL.reconcileAll();
  const tb = w().GL.trialBalance();
  const bal = (no: string) => {
    const r = tb.rows.find((x: any) => x.no === no);
    return r ? r.debit - r.credit : 0;
  };
  return { tb, bal };
}

describe('Contoh alur 500 ton', () => {
  it('runs the meeting story from customer PO to month-end with balanced books', () => {
    w().DB = {
      customers: [{ id: 'C-RT', name: 'PT Karya Jalan Sentosa', address: 'Cikarang', termDays: 30 }],
      suppliers: [{ id: 'S-RT', name: 'PT Batu Gunung Perkasa', termDays: 30 }],
      inventoryItems: [
        { id: 'BS12', name: 'Batu Split 1-2 cm', unit: 'Ton', stock: 0, cost: 120000, sell: 155000 },
      ],
      supplierPrices: [
        { id: 'HS-1', supplierId: 'S-RT', itemId: 'BS12', price: 120000, effectiveDate: '2026-09-01' },
        // The supplier's new price from 14 Sep (the meeting: "harga di faktur beli lupa diupdate").
        { id: 'HS-2', supplierId: 'S-RT', itemId: 'BS12', price: 125000, effectiveDate: '2026-09-14' },
      ],
      salesOrders: [
        {
          id: 'SO-RT',
          number: 'SO.2026.09.00101',
          customer: 'PT Karya Jalan Sentosa',
          customerId: 'C-RT',
          date: '2026-09-01',
          status: 'Confirmed',
          taxRate: 0.11,
          lines: [{ ...ITEM, qty: 500, price: 155000, lineDiscount: 0, subtotal: 77500000 }],
          amount: 86025000,
        },
      ],
      purchaseOrders: [
        {
          id: 'PO-RT',
          number: PO_NO,
          supplier: 'PT Batu Gunung Perkasa',
          supplierId: 'S-RT',
          date: '2026-09-01',
          status: 'Confirmed',
          taxRate: 0.11,
          lines: [{ ...ITEM, qty: 500, price: 120000, lineDiscount: 0, subtotal: 60000000 }],
          amount: 66600000,
        },
      ],
      deliveryOrders: [],
      salesInvoices: [],
      purchaseInvoices: [],
      salesReceipts: [],
      purchasePayments: [],
      salesReturns: [],
      purchaseReturns: [],
      paymentLogs: [],
      numberSequences: {},
      accountsChart: [],
      journals: [],
      settings: {},
    };

    // 1. PO supplier dibuka untuk pengambilan: 500 ÷ 35 → 15 surat jalan, cut-off 30 Sep.
    const open = T().openPickupPO('PO-RT', { soId: 'SO-RT', capacity: 35 });
    expect(open.error).toBeUndefined();
    expect(open.slots).toHaveLength(15);
    expect(open.slots[0].sjNo).toBe(sj('01'));
    expect(open.slots[14].sjNo).toBe(sj('15'));
    expect(w().DB.purchaseOrders[0].pickupFlow.cutoff).toBe('2026-09-30');

    // 2. Minggu 1: rekap timbangan pertama (SJ 01–05) masuk tanpa input ulang.
    let applied = T().applyRecap(T().matchRecap(recap(5)), { source: 'rekap' });
    expect(applied).toMatchObject({ filled: 5, changed: 0, errors: [] });
    expect(net('04')).toBe(30);
    const week1 = ['01', '02', '03', '04', '05'].map(n => slot(n).id);
    expect(week1.reduce((s, id) => s + T().netOf(T().slotsFor('PO-RT').find((d: any) => d.id === id)), 0)).toBeCloseTo(168.3, 3);

    // 3. Tagih pelanggan per minggu: faktur 1 (7 Sep) untuk 5 truk.
    const si1 = T().createInvoice('sales', week1, { date: '2026-09-07' }).invoice;
    expect(si1.lines).toHaveLength(5);
    expect(si1.amount).toBe(26086500 + 2869515); // 168,3 t × 155.000 + PPN 11%

    // 4. Minggu 2: rekap kumulatif (SJ 01–10). Bagian timbangan diam-diam
    //    mengubah SJ 04 yang sudah ditagih: 30 → 35 ton.
    const m2 = T().matchRecap(recap(10, { '04': 47.4 }));
    expect(m2.fill).toHaveLength(5);
    expect(m2.same).toHaveLength(4);
    expect(m2.changed).toHaveLength(1);
    expect(m2.changed[0]).toMatchObject({ from: 30, to: 35, invoiced: true });
    applied = T().applyRecap(m2, { source: 'rekap' });
    expect(applied).toMatchObject({ filled: 5, changed: 1, alerts: 1 });
    expect(slot('04').weightAlert).toMatchObject({ from: 30, to: 35, resolved: false });
    expect(T().coveringInvoice('sales', slot('04').id).amount).toBe(28956015); // faktur lama tidak berubah

    // 5. Selisih 5 ton ditagih dengan faktur susulan (14 Sep).
    const adj = T().createAdjustment('sales', slot('04').id, { date: '2026-09-14' }).invoice;
    expect(adj.lines[0]).toMatchObject({ qty: 5, price: 155000, subtotal: 775000 });
    expect(adj.amount).toBe(860250);
    expect(T().openAlerts()).toHaveLength(0); // supplier belum menagih: tidak ada sisi lain yang tertinggal

    // 6. Faktur minggu 2 (14 Sep) untuk SJ 06–10.
    const week2 = ['06', '07', '08', '09', '10'].map(n => slot(n).id);
    const si2 = T().createInvoice('sales', week2, { date: '2026-09-14' }).invoice;
    expect(si2.amount).toBe(26892500 + 2958175); // 173,5 t

    // 7. Minggu 3: rekap (SJ 01–13). Truk 15–16 Sep memakai harga supplier baru 125.000.
    applied = T().applyRecap(T().matchRecap(recap(13, { '04': 47.4 })), { source: 'rekap' });
    expect(applied).toMatchObject({ filled: 3, changed: 0 });
    expect(slot('11').purchasePrice).toBe(125000);
    expect(slot('10').purchasePrice).toBe(120000);
    const week3 = ['11', '12', '13'].map(n => slot(n).id);
    const si3 = T().createInvoice('sales', week3, { date: '2026-09-21' }).invoice;
    expect(si3.amount).toBe(16182000 + 1780020); // 104,4 t

    // 8. Pelanggan membayar faktur 1 (28 Sep).
    w().DB.salesReceipts.push({
      id: 'SR-RT-1',
      number: 'SR.2026.09.00101',
      date: '2026-09-28',
      status: 'Posted',
      customer: 'PT Karya Jalan Sentosa',
      customerId: 'C-RT',
      invoiceId: si1.id,
      invoiceNumber: si1.number,
      amount: si1.amount,
      paymentMethod: 'Transfer BCA',
    });
    w().Balances.recalcInvoiceStatus('sales', si1);
    expect(si1.status).toBe('Paid');

    // 9. Tagihan supplier (30 Sep): mereka menagih 460 t, pengambilan kita 451,2 t.
    const cmp = T().compareSupplierBill({
      supplierId: 'S-RT',
      from: '2026-09-01',
      to: '2026-09-30',
      qty: 460,
      price: 125000,
    });
    expect(cmp.trips).toHaveLength(13);
    expect(cmp.ourQty).toBeCloseTo(451.2, 3);
    expect(cmp.qtyDiff).toBeCloseTo(8.8, 3);
    expect(cmp.priceDiffers).toBe(true); // 10 truk masih harga lama 120.000
    const pi = T().createInvoice(
      'purchases',
      cmp.trips.map((d: any) => d.id),
      { date: '2026-09-30', supplierRef: 'BGP/INV/2609-17' }
    ).invoice;
    pi.supplierBill = { qty: 460, price: 125000, ourQty: 451.2, qtyDiff: 8.8, reason: 'Ditanyakan ke supplier' };
    expect(pi.amount).toBe(54666000 + 6013260); // 346,8 t × 120.000 + 104,4 t × 125.000

    // 10. Cut-off: 1 Okt PO ditutup, 2 surat jalan sisa dibatalkan; PO pelanggan tetap berjalan.
    const closed = T().sweepCutoffs('2026-10-01');
    expect(closed.map((p: any) => p.id)).toEqual(['PO-RT']);
    expect(w().DB.purchaseOrders[0]).toMatchObject({ status: 'Closed', closedReason: 'cutoff' });
    expect(slot('14').status).toBe('Cancelled');
    expect(slot('15').status).toBe('Cancelled');
    expect(w().DB.salesOrders[0].status).not.toBe('Closed');
    const taken = T().usage(w().DB.purchaseOrders[0]).taken;
    expect(taken).toBeCloseTo(451.2, 3);
    expect(500 - taken).toBeCloseTo(48.8, 3);

    // Pembukuan September: seimbang, persediaan nol.
    const { tb, bal } = ledger();
    expect(tb.balanced).toBe(true);
    expect(bal('110401')).toBe(0); // persediaan
    expect(-bal('400001')).toBe(69936000); // penjualan 451,2 t × 155.000
    expect(bal('510101')).toBe(54666000); // HPP
    expect(-bal('210201')).toBe(7692960); // PPN keluaran
    expect(bal('130101')).toBe(6013260); // PPN masukan
    expect(bal('110201')).toBe(860250 + 29850675 + 17962020); // piutang: faktur selisih, 2, 3
    expect(-bal('210101')).toBe(60679260); // hutang supplier
    // Laba kotor 15.270.000.
    expect(-bal('400001') - bal('510101')).toBe(15270000);
  });
});
