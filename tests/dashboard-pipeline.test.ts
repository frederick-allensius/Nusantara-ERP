// ═══════════════════════════════════════════════════════════════════════════════
// Ringkasan — Alur transaksi, the period switch and the default layout
// (modules/dashboard.js):
//   • the pickup funnel is cumulative and reconciles with
//     TradingSummary.pipeline: Diambil ≥ Ditagih ≥ Dibayar on both sides, and
//     the leak between two stages is exactly what stopped there
//   • the warehouse tabs show OrderPipeline.summary of the period, pickup
//     orders left out, and each stage opens the order list at that stage
//   • tabs without data are not shown; the first tab with data is open
//   • the period switch (Bulan ini · 3 bulan · Tahun ini) sets the range of the
//     flow and of the gross profit tile, and is kept per browser
//   • by default the page shows the KPI row, Alur transaksi, Perlu tindakan and
//     Tren 6 bulan; the other blocks wait in "Atur Tampilan"
// Runs the real classic scripts against the current date.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const w = () => window as any;
const DASH_SRC = readFileSync(
  resolve(__dirname, '../public/classic/modules/dashboard.js'),
  'utf-8'
);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const TODAY = iso(now);
const MONTH_START = iso(new Date(now.getFullYear(), now.getMonth(), 1));
const MONTH_END = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
const START_3M = iso(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const YEAR_START = `${now.getFullYear()}-01-01`;
const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };
const LAYOUT_KEY = 'nsa_dash_hidden_v3';
const actions = new Map<string, (...a: any[]) => any>();

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
  w().idrShort = (v: number) => 'Rp ' + Math.round((v || 0) / 1000).toLocaleString('id-ID') + ' rb';
  w().docNum = (n: string, id: string) => n || id;
  w().ERP = { registerAction: (name: string, fn: any) => actions.set(name, fn) };
  // eslint-disable-next-line no-eval -- execute the real classic script in global scope
  (0, eval)(DASH_SRC);
});

function order(id: string, party: any, qty: number, price: number, extra: any = {}) {
  return {
    id,
    number: id,
    ...party,
    date: MONTH_START,
    status: 'Confirmed',
    taxRate: 0.11,
    amount: Math.round(qty * price * 1.11),
    lines: [{ ...ITEM, qty, price, lineDiscount: 0, subtotal: qty * price }],
    ...extra,
  };
}
const CUST = { customer: 'PT Arta', customerId: 'C1' };
const SUPP = { supplier: 'PT Batu Alam', supplierId: 'S1' };

function seed(salesOrders: any[] = [], purchaseOrders: any[] = []) {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', address: 'Jakarta', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [{ id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0 }],
    salesOrders,
    purchaseOrders,
    deliveryOrders: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesReturns: [],
    purchaseReturns: [],
    salesQuotations: [],
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

// Five trips on one pickup PO: one two months ago, four this month.
//   customer: t2+t3 on a paid invoice, t4 on an open invoice, t1 and t5 unbilled
//   supplier: t1+t2 on a paid bill, t3 on an open bill, t4 and t5 unbilled
function seedPickups() {
  seed(
    [order('SO-1', CUST, 300, 150000, { date: START_3M })],
    [order('PO-1', SUPP, 300, 100000, { date: START_3M })]
  );
  const T = w().Trading;
  expect(
    T.openPickupPO('PO-1', { soId: 'SO-1', capacity: 30, cutoff: MONTH_END }).error
  ).toBeUndefined();
  const slots = T.slotsFor('PO-1');
  const dates = [START_3M, MONTH_START, MONTH_START, MONTH_START, MONTH_START];
  const trips = dates.map((date, i) => {
    expect(T.recordTrip(slots[i].id, { date, net: 30, vehicle: 'B ' + i }).ok).toBe(true);
    return slots[i].id;
  });
  T.createInvoice('sales', [trips[1], trips[2]], { date: TODAY }).invoice.status = 'Paid';
  T.createInvoice('sales', [trips[3]], { date: TODAY });
  T.createInvoice('purchases', [trips[0], trips[1]], { date: TODAY }).invoice.status = 'Paid';
  T.createInvoice('purchases', [trips[2]], { date: TODAY });
  w().GL.reconcileAll();
  return trips;
}

function seedWarehouse() {
  seed(
    [
      order('SO-2', CUST, 10, 100000, { status: 'Draft' }),
      order('SO-3', CUST, 20, 100000),
      order('SO-OLD', CUST, 5, 100000, { date: '2000-01-01' }),
    ],
    [order('PO-2', SUPP, 15, 90000, { status: 'Draft' })]
  );
}

const render = (): string => w().renderDashboard();
const D = () => w()._dashTrading;

beforeEach(() => {
  localStorage.removeItem(LAYOUT_KEY);
  localStorage.removeItem('nsa_dash_hidden_v2');
  localStorage.removeItem('nsa_dash_period');
  localStorage.removeItem('nsa_dash_trend');
  w().RBAC = undefined;
});

describe('Alur transaksi — pickup funnel', () => {
  it('is cumulative and reconciles with TradingSummary.pipeline', () => {
    seedPickups();
    const per = D().period();
    const p = w().TradingSummary.pipeline({ from: per.from, to: per.to }, { asOf: per.to });
    const flow = D().pickupFlow(per);
    const [sales, buy] = flow.bands;
    expect(sales.key).toBe('sales');
    expect(buy.key).toBe('purchases');

    const [taken, billed, paid] = sales.stages;
    expect(taken.count).toBe(5);
    expect(taken.value).toBe(p.taken.value);
    expect(billed.count).toBe(p.billed.count + p.paid.count);
    expect(billed.value).toBe(p.billed.value + p.paid.value);
    expect(paid.value).toBe(p.paid.value);
    expect(taken.value).toBeGreaterThanOrEqual(billed.value);
    expect(billed.value).toBeGreaterThanOrEqual(paid.value);
    // Leaks: what stopped between two stages.
    const [unbilledLeak, unpaidLeak] = sales.leaks;
    expect(unbilledLeak.count).toBe(2);
    expect(taken.count - billed.count).toBe(unbilledLeak.count);
    expect(taken.value - billed.value).toBe(unbilledLeak.value);
    expect(unbilledLeak.value).toBe(p.unbilled.value);
    expect(billed.value - paid.value).toBe(unpaidLeak.value);

    const [sTaken, sBilled, sPaid] = buy.stages;
    expect(sTaken.count).toBe(5);
    expect(sTaken.value).toBe(
      p.supplierUnbilled.value + p.supplierBilled.value + p.supplierPaid.value
    );
    expect(sBilled.value).toBe(p.supplierBilled.value + p.supplierPaid.value);
    expect(sPaid.value).toBe(p.supplierPaid.value);
    expect(sTaken.value - sBilled.value).toBe(buy.leaks[0].value);
    expect(sBilled.value - sPaid.value).toBe(buy.leaks[1].value);
    // One scale for both bands: the largest stage value.
    expect(flow.max).toBe(Math.max(taken.value, sTaken.value));

    // The leak chips carry the same figures and open the page that handles them.
    const short = w().idrShort;
    const html = render();
    expect(html).toContain(`2 belum ditagih · ${short(p.unbilled.value)}`);
    expect(html).toContain(`1 belum lunas · ${short(p.billed.value)}`);
    expect(html).toContain(`2 belum ditagih supplier · ${short(p.supplierUnbilled.value)}`);
    expect(html).toContain(`1 belum dibayar · ${short(p.supplierBilled.value)}`);
    expect(html).toContain('data-dash-open="Rekap Pengambilan"');
    expect(html).toContain('data-dash-open="Tagih Pelanggan"');
    expect(html).toContain('data-dash-open="Faktur Penjualan"');
    expect(html).toContain('data-dash-open="Tagihan Supplier"');
    expect(html).toContain('data-dash-open="Faktur Pembelian"');
    expect(html).toContain('class="dash-fn"');
    expect(html).toContain('class="dash-fl"');
  });

  it('shows only the supplier side to a role that cannot view sales', () => {
    seedPickups();
    w().RBAC = { canView: (m: string) => m !== 'sales' };
    const flow = D().pickupFlow(D().period());
    expect(flow.bands.map((b: any) => b.key)).toEqual(['purchases']);
  });
});

describe('Alur transaksi — warehouse orders', () => {
  it('shows OrderPipeline.summary of the period for each side', () => {
    seedWarehouse();
    const per = D().period();
    for (const side of ['sales', 'purchases']) {
      const expected = w().OrderPipeline.summary(side, {
        from: per.from,
        to: per.to,
        pickup: false,
      });
      expect(D().orderFlow(side, per)).toEqual(expected);
    }
    const sales = D().orderFlow('sales', per);
    // The order dated in 2000 is outside the period.
    expect(sales.total).toBe(2);
    expect(sales.stages.find((s: any) => s.key === 'draft').value).toBe(
      Math.round(10 * 100000 * 1.11)
    );

    const html = render();
    expect(html).toContain('data-action="dashOrderStage" data-type="sales" data-val="draft"');
    expect(html).toContain('data-action="dashOrderStage" data-type="purchases" data-val="paid"');
    expect(html).toContain(w().idrShort(Math.round(10 * 100000 * 1.11)));
  });

  it('opens the order list at the stage, or the order list itself', () => {
    const open = vi.fn();
    w().openOrderStage = open;
    actions.get('dashOrderStage')!(undefined, 'sales', 'unpaid');
    expect(open).toHaveBeenCalledWith('sales', 'unpaid');

    w().openOrderStage = undefined;
    const opened: string[] = [];
    w().NSANav = { open: (label: string) => opened.push(label) };
    actions.get('dashOrderStage')!(undefined, 'purchases', 'draft');
    expect(opened).toEqual(['Pesanan Pembelian']);
    w().NSANav = undefined;
  });
});

describe('Alur transaksi — tabs', () => {
  const keys = () =>
    D()
      .flowTabs()
      .map((t: any) => t.key);

  it('shows one calm line when there is no data at all', () => {
    seed();
    expect(keys()).toEqual([]);
    const html = render();
    expect(html).toContain('Belum ada pesanan atau pengambilan.');
    expect(html).not.toContain('role="tablist"');
  });

  it('hides tabs without data and opens the first one with data', () => {
    seedPickups();
    expect(keys()).toEqual(['pickup']);
    let html = render();
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('Pengambilan · nilai termasuk PPN');

    seedWarehouse();
    expect(keys()).toEqual(['sales', 'purchases']);
    html = render();
    expect(html).toContain('role="tablist"');
    const page = document.createElement('div');
    page.innerHTML = html;
    const panels = [...page.querySelectorAll<HTMLElement>('[data-flow-panel]')].map(
      p => `${p.dataset.flowPanel}:${p.hidden ? 'hidden' : 'open'}`
    );
    expect(panels).toEqual(['sales:open', 'purchases:hidden']);
    const selected = page.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement;
    expect(selected.dataset.val).toBe('sales');
  });

  it('leaves out the tabs of modules the role cannot view', () => {
    seedWarehouse();
    w().RBAC = { canView: (m: string) => m !== 'purchases' };
    expect(keys()).toEqual(['sales']);
  });

  it('shows one calm line for a period without trips, with the trips carried over', () => {
    seed(
      [order('SO-1', CUST, 300, 150000, { date: START_3M })],
      [order('PO-1', SUPP, 300, 100000, { date: START_3M })]
    );
    const T = w().Trading;
    T.openPickupPO('PO-1', { soId: 'SO-1', capacity: 30, cutoff: MONTH_END });
    T.recordTrip(T.slotsFor('PO-1')[0].id, { date: START_3M, net: 30, vehicle: 'B 1' });
    localStorage.setItem('nsa_dash_period', 'month');
    const html = render();
    expect(html).toContain('Belum ada pengambilan pada periode ini.');
    expect(html).not.toContain('class="dash-fn"');
    expect(html).toContain(`+ 1 truk sebelum ${w()._dashDate(MONTH_START)} belum ditagih`);
    expect(html).toContain('1 PO berjalan');
  });
});

describe('Period switch', () => {
  it('defaults to 3 bulan: from the 1st of the month two months ago to today', () => {
    const per = D().period();
    expect(per.key).toBe('3m');
    expect(per.from).toBe(START_3M);
    expect(per.to).toBe(TODAY);
  });

  it('sets the range of the flow and of the gross profit tile', () => {
    seedPickups();
    localStorage.setItem('nsa_dash_period', 'month');
    expect(D().period()).toMatchObject({ key: 'month', from: MONTH_START, to: TODAY });
    let flow = D().pickupFlow();
    // The trip from two months ago falls outside this month: carried over.
    expect(flow.bands[0].stages[0].count).toBe(4);
    expect(flow.pipeline.carryOver.unbilled.count).toBe(1);
    let html = render();
    expect(html).toContain('Laba kotor bulan ini');
    expect(html).toContain('sebelum');
    expect(html).toMatch(/aria-pressed="true" data-action="dashPeriod" data-val="month"/);

    localStorage.setItem('nsa_dash_period', 'year');
    expect(D().period()).toMatchObject({ key: 'year', from: YEAR_START, to: TODAY });
    html = render();
    expect(html).toContain('Laba kotor tahun ini');

    localStorage.setItem('nsa_dash_period', '3m');
    flow = D().pickupFlow();
    expect(flow.bands[0].stages[0].count).toBe(5);
    expect(flow.pipeline.carryOver.unbilled.count).toBe(0);
  });

  it('keeps the chosen period and re-renders the page', () => {
    w().invalidateView = vi.fn();
    w().navigate = vi.fn();
    actions.get('dashPeriod')!(undefined, undefined, 'year');
    expect(localStorage.getItem('nsa_dash_period')).toBe('year');
    expect(w().navigate).toHaveBeenCalledWith('dashboard');
    // An unknown value changes nothing.
    actions.get('dashPeriod')!(undefined, undefined, 'decade');
    expect(D().period().key).toBe('year');
  });

  it('falls back to 3 bulan when the stored value is unknown', () => {
    localStorage.setItem('nsa_dash_period', 'decade');
    expect(D().period().key).toBe('3m');
  });
});

describe('Default layout', () => {
  it('shows the KPI row, Alur transaksi, Perlu tindakan and Tren 6 bulan only', () => {
    seedPickups();
    // Only the current layout key counts; other keys are ignored.
    localStorage.setItem('nsa_dash_hidden_v2', JSON.stringify([]));
    const html = render();
    for (const text of ['Kas &amp; bank', 'Piutang', 'Hutang', 'Laba kotor 3 bulan']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('Alur transaksi');
    expect(html).toContain('Perlu tindakan');
    expect(html).toContain('Tren 6 bulan');
    for (const text of [
      'Tagihan pelanggan',
      'PO pengambilan berjalan',
      'Tonase per bulan',
      'Jatuh tempo terdekat',
      'Stok menipis',
      'Aktivitas terbaru',
      'Dokumen terbaru',
    ]) {
      expect(html).not.toContain(text);
    }
  });

  it('lists every block in Atur Tampilan, the optional ones unticked', () => {
    let body = '';
    w().openModal = (_title: string, b: string) => (body = b);
    actions.get('dashLayout')!();
    expect(body).toMatch(/value="pipeline" checked/);
    expect(body).toMatch(/value="actions" checked/);
    expect(body).toMatch(/value="trend" checked/);
    for (const id of ['collections', 'pickupPOs', 'tonnage', 'due', 'stock', 'activity']) {
      expect(body).toContain(`value="${id}"><span>`);
    }
    w().openModal = undefined;
  });

  it('shows the five most important actions and the rest behind a toggle', () => {
    seed(
      [
        order('SO-2', CUST, 10, 100000, { status: 'Draft' }),
        order('SO-3', CUST, 20, 100000),
        order('SO-4', CUST, 20, 100000, { status: 'Delivered' }),
      ],
      [order('PO-2', SUPP, 15, 90000)]
    );
    w().DB.salesQuotations = [{ id: 'Q-1', status: 'Sent' }];
    w().DB.deliveryOrders = [{ id: 'DO-1', status: 'Pending', customer: 'PT Arta' }];
    const rows = w()._dashActions();
    expect(rows.map((r: any) => r.label)).toEqual([
      'Pesanan terkirim tanpa faktur',
      'Pengiriman belum selesai',
      'Pesanan penjualan belum dikirim',
      'Pesanan pembelian belum diterima',
      'Penawaran menunggu jawaban',
      'Dokumen masih draft',
    ]);
    const html = render();
    expect(html).toContain('+ 1 lainnya');
    expect(html).toMatch(/id="dash-actions-more" hidden>[^]*Dokumen masih draft/);
  });
});
