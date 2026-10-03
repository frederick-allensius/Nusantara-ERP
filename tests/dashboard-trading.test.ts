// ═══════════════════════════════════════════════════════════════════════════════
// Ringkasan (modules/dashboard.js) with the trading pickup data:
//   • without pickup data there is no Pengambilan tab; the warehouse orders show
//   • with pickup data: the Pengambilan funnel links to the pages that handle
//     each stage, and the optional blocks (Tagihan pelanggan, PO pengambilan
//     berjalan, Tonase per bulan) show once switched on
//   • unused surat jalan slots of a pickup PO are not "pengiriman belum selesai"
//   • blocks can be switched off in "Atur Tampilan"; roles without access to the
//     module do not see them
// Runs the real classic scripts against the current date.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const w = () => window as any;
const DASH_SRC = readFileSync(
  resolve(__dirname, '../public/classic/modules/dashboard.js'),
  'utf-8'
);

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const MONTH_START = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };
const LAYOUT_KEY = 'nsa_dash_hidden_v3';

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
  await import('../public/classic/core/trading-summary.js');
  await import('../public/classic/core/order-pipeline.js');
  w().escapeHtml = (s: unknown) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as any)[c]
    );
  w().idr = (v: number) => 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
  w().idrShort = w().idr;
  w().docNum = (n: string, id: string) => n || id;
  w().ERP = { registerAction: () => {} };
  // eslint-disable-next-line no-eval -- execute the real classic script in global scope
  (0, eval)(DASH_SRC);
});

function order(id: string, party: any, qty: number, price: number) {
  return {
    id,
    number: id,
    ...party,
    date: MONTH_START,
    status: 'Confirmed',
    taxRate: 0.11,
    amount: Math.round(qty * price * 1.11),
    lines: [{ ...ITEM, qty, price, lineDiscount: 0, subtotal: qty * price }],
  };
}

function seed() {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', address: 'Jakarta', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [{ id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0 }],
    salesOrders: [order('SO-1', { customer: 'PT Arta', customerId: 'C1' }, 100, 150000)],
    purchaseOrders: [order('PO-1', { supplier: 'PT Batu Alam', supplierId: 'S1' }, 100, 100000)],
    deliveryOrders: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesReturns: [],
    purchaseReturns: [],
    paymentLogs: [],
    supplierPrices: [],
    numberSequences: {},
    accountsChart: [],
    journals: [],
    auditLog: [],
    settings: {},
  };
  w().GL.reconcileAll();
}

function withTrips() {
  w().Trading.openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 });
  const slot = w().Trading.slotsFor('PO-1')[0];
  w().Trading.recordTrip(slot.id, { date: MONTH_START, net: 35, vehicle: 'B 1 X' });
  w().GL.reconcileAll();
}

const render = (): string => w().renderDashboard();
const showAll = () => localStorage.setItem(LAYOUT_KEY, JSON.stringify([]));

beforeEach(() => {
  seed();
  localStorage.removeItem(LAYOUT_KEY);
  localStorage.removeItem('nsa_dash_period');
  localStorage.removeItem('nsa_dash_trend');
  w().RBAC = undefined;
});

describe('Ringkasan — pickup data', () => {
  it('has no Pengambilan tab while there is no pickup data', () => {
    const html = render();
    expect(html).toContain('Alur transaksi');
    expect(html).not.toContain('data-flow-panel="pickup"');
    // The two confirmed orders are ordinary warehouse orders until opened for pickup.
    expect(html).toContain('data-flow-panel="sales"');
    expect(html).toContain('data-flow-panel="purchases"');
    expect(html).not.toContain('PO pengambilan berjalan');
    expect(html).not.toContain('Tonase per bulan');
  });

  it('shows the pickup funnel, linked to the page of each stage, once trips exist', () => {
    withTrips();
    const html = render();
    expect(html).toContain('data-flow-panel="pickup"');
    for (const label of [
      'Rekap Pengambilan',
      'Tagih Pelanggan',
      'Tagihan Supplier',
      'PO Pengambilan',
    ]) {
      expect(html).toContain(`data-dash-open="${label}"`);
    }
    expect(html).toContain('1 belum ditagih');
    expect(html).toContain('1 belum ditagih supplier');
    expect(html).toContain('1 PO berjalan');
    expect(html).toContain('2 surat jalan siap');
    // Opened for pickup, the orders leave the warehouse tabs.
    expect(html).not.toContain('data-flow-panel="sales"');
    // Perlu tindakan: the unbilled trip, not the two unused surat jalan slots.
    expect(html).toContain('Pengambilan belum ditagih');
    expect(html).not.toContain('Pengiriman belum selesai');
    expect(html).not.toContain('Pesanan penjualan belum dikirim');
  });

  it('shows the optional pickup blocks once switched on', () => {
    withTrips();
    expect(render()).not.toContain('PO pengambilan berjalan');
    showAll();
    const html = render();
    expect(html).toContain('Tagihan pelanggan');
    expect(html).toContain('PT Arta');
    expect(html).toContain('PO pengambilan berjalan');
    expect(html).toContain('SJ 1/3');
    expect(html).toContain('Tonase per bulan');
  });

  it('links an open weight change to Perubahan Timbangan', () => {
    withTrips();
    const slot = w().Trading.slotsFor('PO-1')[0];
    w().Trading.createInvoice('sales', [slot.id], { date: MONTH_START });
    w().Trading.updateWeight(slot.id, { net: 36 }, { source: 'rekap' });
    const html = render();
    expect(html).toContain('data-dash-open="Perubahan Timbangan"');
    expect(html).toContain('1 perubahan timbangan');
    expect(html).toContain('Perubahan timbangan belum ditindaklanjuti');
  });

  it('hides blocks switched off in Atur Tampilan', () => {
    withTrips();
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(['pipeline', 'tonnage']));
    const html = render();
    expect(html).not.toContain('Alur transaksi');
    expect(html).not.toContain('Tonase per bulan');
    expect(html).toContain('PO pengambilan berjalan');
  });

  it('hides pickup figures from a role that cannot view purchases', () => {
    withTrips();
    showAll();
    w().RBAC = { canView: (m: string) => m !== 'purchases' };
    const html = render();
    expect(html).not.toContain('data-flow-panel="pickup"');
    expect(html).not.toContain('PO pengambilan berjalan');
    expect(html).toContain('Tagihan pelanggan');
  });
});
