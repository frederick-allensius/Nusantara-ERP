// ═══════════════════════════════════════════════════════════════════════════════
// Ringkasan (modules/dashboard.js) with the trading pickup blocks:
//   • without pickup data the pickup section is one calm empty state, not zeros
//   • with pickup data: Alur pengambilan, Tagihan pelanggan, PO pengambilan
//     berjalan and Tonase per bulan, each linking to the page that handles it
//   • unused surat jalan slots of a pickup PO are not "pengiriman belum selesai"
//   • blocks can be switched off in "Atur Tampilan"; roles without access to the
//     module do not see them
// Runs the real classic scripts against the current date (the dashboard always
// shows "this month").
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

beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
  await import('../public/classic/core/trading-summary.js');
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

beforeEach(() => {
  seed();
  localStorage.removeItem('nsa_dash_hidden_v2');
  w().RBAC = undefined;
});

describe('Ringkasan — pickup blocks', () => {
  it('shows one calm empty state while there is no pickup data', () => {
    const html = render();
    expect(html).toContain('Belum ada PO pengambilan');
    expect(html).toContain('data-dash-open="PO Pengambilan"');
    expect(html).not.toContain('PO pengambilan berjalan');
    expect(html).not.toContain('Tonase per bulan');
    expect(html).not.toContain('pipe-stage');
  });

  it('shows the pipeline, customer billing, open POs and tonnage once trips exist', () => {
    withTrips();
    const html = render();
    expect(html).toContain('Alur pengambilan');
    for (const label of [
      'PO Pengambilan',
      'Catat Pengambilan',
      'Tagih Pelanggan',
      'Tagihan Supplier',
    ]) {
      expect(html).toContain(`data-dash-open="${label}"`);
    }
    expect(html).toContain('Tagihan pelanggan');
    expect(html).toContain('PT Arta');
    expect(html).toContain('PO pengambilan berjalan');
    expect(html).toContain('SJ 1/3');
    expect(html).toContain('Tonase per bulan');
    // Perlu tindakan: the unbilled trip, not the two unused surat jalan slots.
    expect(html).toContain('Pengambilan belum ditagih');
    expect(html).not.toContain('Pengiriman belum selesai');
    expect(html).not.toContain('Pesanan penjualan belum dikirim');
  });

  it('links an open weight change to Perubahan Timbangan', () => {
    withTrips();
    const slot = w().Trading.slotsFor('PO-1')[0];
    w().Trading.createInvoice('sales', [slot.id], { date: MONTH_START });
    w().Trading.updateWeight(slot.id, { net: 36 }, { source: 'rekap' });
    const html = render();
    expect(html).toContain('data-dash-open="Perubahan Timbangan"');
    expect(html).toContain('Perubahan timbangan belum ditindaklanjuti');
  });

  it('hides blocks switched off in Atur Tampilan', () => {
    withTrips();
    localStorage.setItem('nsa_dash_hidden_v2', JSON.stringify(['pipeline', 'tonnage']));
    const html = render();
    expect(html).not.toContain('Alur pengambilan');
    expect(html).not.toContain('Tonase per bulan');
    expect(html).toContain('PO pengambilan berjalan');
  });

  it('hides pickup blocks from a role that cannot view purchases', () => {
    withTrips();
    w().RBAC = { canView: (m: string) => m !== 'purchases' };
    const html = render();
    expect(html).not.toContain('Alur pengambilan');
    expect(html).not.toContain('PO pengambilan berjalan');
    expect(html).toContain('Tagihan pelanggan');
  });
});
