// ═══════════════════════════════════════════════════════════════════════════════
// Ringkasan — Alur transaksi, the period switch and the default layout
// (modules/dashboard.js):
//   • the pickup funnels are cumulative and reconcile with
//     TradingSummary.pipeline: Diambil ≥ Ditagih ≥ Dibayar on both sides, and
//     the leak under a stage is exactly what stopped before it
//   • the warehouse tabs show OrderPipeline.summary of the period, pickup
//     orders left out, as cumulative layers Dipesan → Dikirim/Diterima →
//     Difakturkan → Lunas, each opening the order list at its stage
//   • layer widths follow the value on the funnel's own scale: the first is
//     full width, none is wider than the one above, the last closes to a neck
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
const page = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};
const text = (el: Element | null | undefined) =>
  (el?.textContent || '').replace(/\s+/g, ' ').trim();
// Top and bottom edge of each drawn layer, in % of the funnel width, read
// back from the SVG path "M x0 0 H x1 L x2 h H x3 Z".
function edges(funnel: Element) {
  return [...funnel.querySelectorAll('.dash-funnel-layer')].map(p => {
    const n = (p.getAttribute('d') || '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    return { top: +(n[2] - n[0]).toFixed(1), bottom: +(n[3] - n[5]).toFixed(1) };
  });
}
// The text of each row of a funnel: [stage, value, description, leak].
function rows(funnel: Element) {
  return [...funnel.querySelectorAll('.dash-funnel-row')].map(r => [
    text(r.querySelector('.dash-funnel-name')),
    text(r.querySelector('.dash-funnel-value')),
    text(r.querySelector('.dash-funnel-desc')),
    text(r.querySelector('.dash-funnel-leak')),
  ]);
}

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
    expect(sales.stages.map((s: any) => s.label)).toEqual(['Diambil', 'Ditagih', 'Dibayar']);
    expect(taken.count).toBe(5);
    expect(taken.value).toBe(p.taken.value);
    expect(billed.count).toBe(p.billed.count + p.paid.count);
    expect(billed.value).toBe(p.billed.value + p.paid.value);
    expect(paid.count).toBe(p.paid.count);
    expect(paid.value).toBe(p.paid.value);
    expect(taken.value).toBeGreaterThanOrEqual(billed.value);
    expect(billed.value).toBeGreaterThanOrEqual(paid.value);
    // The leak under a stage: what stopped before reaching it.
    expect(taken.leak).toBeUndefined();
    expect(billed.leak.count).toBe(2);
    expect(taken.count - billed.count).toBe(billed.leak.count);
    expect(taken.value - billed.value).toBe(billed.leak.value);
    expect(billed.leak.value).toBe(p.unbilled.value);
    expect(billed.count - paid.count).toBe(paid.leak.count);
    expect(billed.value - paid.value).toBe(paid.leak.value);
    expect(paid.leak.value).toBe(p.billed.value);

    const [sTaken, sBilled, sPaid] = buy.stages;
    expect(sTaken.count).toBe(5);
    expect(sTaken.value).toBe(
      p.supplierUnbilled.value + p.supplierBilled.value + p.supplierPaid.value
    );
    expect(sBilled.value).toBe(p.supplierBilled.value + p.supplierPaid.value);
    expect(sPaid.value).toBe(p.supplierPaid.value);
    expect(sTaken.value - sBilled.value).toBe(sBilled.leak.value);
    expect(sBilled.value - sPaid.value).toBe(sPaid.leak.value);
    expect(sBilled.leak.value).toBe(p.supplierUnbilled.value);
    expect(sPaid.leak.value).toBe(p.supplierBilled.value);

    // Each funnel on its own scale: the first layer is full width, the others
    // follow the value; the last closes to a neck at 35% of its width.
    for (const band of flow.bands) {
      const [a, b, c] = band.stages;
      expect(a.w).toBe(1);
      expect(b.w).toBeCloseTo(b.value / a.value, 3);
      expect(c.w).toBeCloseTo(c.value / a.value, 3);
      expect(a.wb).toBe(b.w);
      expect(b.wb).toBe(c.w);
      expect(c.wb).toBeCloseTo(c.w * 0.35, 3);
    }

    // Drawn: two funnels side by side, the rows carrying the same figures; the
    // stage and leaks open the page that handles them.
    const short = w().idrShort;
    const view = page(render());
    const pair = view.querySelector('#dash-flow-pickup .dash-funnels')!;
    expect(pair.classList.contains('is-pair')).toBe(true);
    const [fSales, fBuy] = [...pair.querySelectorAll('.dash-funnel')];
    expect(fSales.classList.contains('is-sales')).toBe(true);
    expect(fBuy.classList.contains('is-purchases')).toBe(true);
    expect(text(fSales.querySelector('.dash-funnel-head'))).toBe('Ke pelanggan nilai jual');
    expect(text(fBuy.querySelector('.dash-funnel-head'))).toBe('Dari supplier nilai beli');
    expect(rows(fSales)).toEqual([
      ['Diambil', short(taken.value), '5 truk · 150 t', ''],
      [
        'Ditagih',
        short(billed.value),
        '3 truk · 60%',
        `2 truk belum ditagih · ${short(p.unbilled.value)}`,
      ],
      ['Dibayar', short(paid.value), '2 truk · 40%', `1 belum lunas · ${short(p.billed.value)}`],
    ]);
    expect(rows(fBuy)).toEqual([
      ['Diambil', short(sTaken.value), '5 truk · 150 t', ''],
      [
        'Ditagih',
        short(sBilled.value),
        '3 truk · 60%',
        `2 belum ditagih supplier · ${short(p.supplierUnbilled.value)}`,
      ],
      [
        'Dibayar',
        short(sPaid.value),
        '2 truk · 40%',
        `1 belum dibayar · ${short(p.supplierBilled.value)}`,
      ],
    ]);
    const opens = (f: Element) =>
      [...f.querySelectorAll('button[data-dash-open]')].map(b => b.getAttribute('data-dash-open'));
    expect(opens(fSales)).toEqual(['Rekap Pengambilan', 'Tagih Pelanggan', 'Faktur Penjualan']);
    expect(opens(fBuy)).toEqual(['Rekap Pengambilan', 'Tagihan Supplier', 'Faktur Pembelian']);
    // The top layer opens the same page as its stage.
    expect(fSales.querySelector('.dash-funnel-layer')!.getAttribute('data-dash-open')).toBe(
      'Rekap Pengambilan'
    );
    // The layers drawn: full width on top, never wider below, a neck at the end.
    for (const f of [fSales, fBuy]) {
      const e = edges(f);
      expect(e).toEqual([
        { top: 100, bottom: 60 },
        { top: 60, bottom: 40 },
        { top: 40, bottom: 14 },
      ]);
    }
    // The old band drawing is gone.
    expect(view.querySelector('.dash-fn, .dash-fl, .dash-leak, .dash-band')).toBeNull();
  });

  it('routes the clicks on stages, leaks and layers to the page that handles them', () => {
    seedPickups();
    const opened: string[] = [];
    w().NSANav = { open: (label: string) => opened.push(label) };
    document.body.innerHTML = render();
    const click = (el: Element | null) =>
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const sales = document.querySelector('#dash-flow-pickup .dash-funnel.is-sales')!;
    const buy = document.querySelector('#dash-flow-pickup .dash-funnel.is-purchases')!;
    click(sales.querySelector('.dash-funnel-stage'));
    click(sales.querySelector('.dash-funnel-layer'));
    sales.querySelectorAll('.dash-funnel-leak').forEach(click);
    buy.querySelectorAll('.dash-funnel-leak').forEach(click);
    click(document.querySelector('[data-dash-open="PO Pengambilan"]'));
    expect(opened).toEqual([
      'Rekap Pengambilan',
      'Rekap Pengambilan',
      'Tagih Pelanggan',
      'Faktur Penjualan',
      'Tagihan Supplier',
      'Faktur Pembelian',
      'PO Pengambilan',
    ]);
    document.body.innerHTML = '';
    w().NSANav = undefined;
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

    // Sales: one confirmed order in the funnel, the draft apart. Purchases:
    // only a draft, so no funnel yet.
    const short = w().idrShort;
    const view = page(render());
    const salesPanel = view.querySelector('#dash-flow-sales')!;
    expect(rows(salesPanel)[0]).toEqual([
      'Dipesan',
      short(Math.round(20 * 100000 * 1.11)),
      '1 pesanan',
      '',
    ]);
    // Nothing past Dipesan yet: one layer drawn, closing to the neck rather
    // than to a point; the empty layers keep their rows but draw nothing.
    expect(salesPanel.querySelectorAll('.dash-funnel-row')).toHaveLength(4);
    expect(edges(salesPanel)).toEqual([{ top: 100, bottom: 35 }]);
    const draft = salesPanel.querySelector('.dash-funnel-note')!;
    expect(text(draft)).toBe(
      `1 draf · ${short(Math.round(10 * 100000 * 1.11))} belum dikonfirmasi`
    );
    expect(draft.getAttribute('data-action')).toBe('dashOrderStage');
    expect(draft.getAttribute('data-type')).toBe('sales');
    expect(draft.getAttribute('data-val')).toBe('draft');
    const buyPanel = view.querySelector('#dash-flow-purchases')!;
    expect(buyPanel.querySelector('.dash-funnel')).toBeNull();
    expect(text(buyPanel)).toContain('Belum ada pesanan yang dikonfirmasi.');
    expect(text(buyPanel.querySelector('.dash-funnel-note'))).toBe(
      `1 draf · ${short(Math.round(15 * 90000 * 1.11))} belum dikonfirmasi`
    );
  });

  it('stacks the OrderPipeline stages into cumulative layers', () => {
    seedWarehouse();
    const stage = (key: string, count: number, value: number, outstanding = 0) => ({
      key,
      label: key,
      count,
      value,
      outstanding,
      ids: [],
    });
    const spy = vi.spyOn(w().OrderPipeline, 'summary').mockImplementation((side: any) => ({
      side,
      total: 30,
      stages: [
        stage('draft', 2, 25_000_000),
        stage('confirmed', 3, 18_000_000),
        stage('delivered', 1, 8_000_000),
        stage('unpaid', 10, 110_000_000, 90_000_000),
        stage('paid', 14, 150_000_000),
      ],
    }));
    try {
      for (const side of ['sales', 'purchases']) {
        const s = w().OrderPipeline.summary(side, {});
        const v = (k: string) => s.stages.find((x: any) => x.key === k);
        const sum = (keys: string[], f: 'count' | 'value') => keys.reduce((n, k) => n + v(k)[f], 0);
        const f = D().orderFunnel(side, D().period());
        expect(f.stages.map((x: any) => x.label)).toEqual([
          'Dipesan',
          side === 'sales' ? 'Dikirim' : 'Diterima',
          'Difakturkan',
          'Lunas',
        ]);
        const layers = [
          ['confirmed', 'delivered', 'unpaid', 'paid'],
          ['delivered', 'unpaid', 'paid'],
          ['unpaid', 'paid'],
          ['paid'],
        ];
        f.stages.forEach((st: any, i: number) => {
          expect(st.count).toBe(sum(layers[i], 'count'));
          expect(st.value).toBe(sum(layers[i], 'value'));
          if (i) {
            // What stopped before this layer is exactly the stage left behind.
            expect(f.stages[i - 1].value - st.value).toBe(st.leak.value);
            expect(f.stages[i - 1].count - st.count).toBe(st.leak.count);
          }
        });
        expect(f.draft).toMatchObject({ count: 2, value: 25_000_000 });
        // Widths: the first full, then never wider, ending in a neck.
        const ws = f.stages.map((x: any) => x.w);
        expect(ws[0]).toBe(1);
        ws.slice(1).forEach((x: number, i: number) => expect(x).toBeLessThanOrEqual(ws[i]));
        expect(f.stages[3].wb).toBeCloseTo(ws[3] * 0.35, 3);
      }

      const short = w().idrShort;
      const view = page(render());
      const salesF = view.querySelector('#dash-flow-sales .dash-funnel')!;
      expect(rows(salesF)).toEqual([
        ['Dipesan', short(286_000_000), '28 pesanan', ''],
        [
          'Dikirim',
          short(268_000_000),
          '25 pesanan · 94%',
          `3 belum dikirim · ${short(18_000_000)}`,
        ],
        [
          'Difakturkan',
          short(260_000_000),
          '24 pesanan · 91%',
          `1 belum difakturkan · ${short(8_000_000)}`,
        ],
        [
          'Lunas',
          short(150_000_000),
          '14 pesanan · 52%',
          `10 belum lunas · ${short(110_000_000)} · sisa ${short(90_000_000)}`,
        ],
      ]);
      expect(rows(view.querySelector('#dash-flow-purchases .dash-funnel')!)[1][3]).toBe(
        `3 belum diterima · ${short(18_000_000)}`
      );
      // Each layer, its label and its leak open the order list at a stage.
      const target = (el: Element | null) =>
        el ? `${el.getAttribute('data-type')}:${el.getAttribute('data-val')}` : null;
      const r = [...salesF.querySelectorAll('.dash-funnel-row')];
      expect(r.map(x => target(x.querySelector('.dash-funnel-stage')))).toEqual([
        'sales:confirmed',
        'sales:delivered',
        'sales:unpaid',
        'sales:paid',
      ]);
      expect(r.map(x => target(x.querySelector('.dash-funnel-layer')))).toEqual([
        'sales:confirmed',
        'sales:delivered',
        'sales:unpaid',
        'sales:paid',
      ]);
      expect(r.map(x => target(x.querySelector('.dash-funnel-leak')))).toEqual([
        null,
        'sales:confirmed',
        'sales:delivered',
        'sales:unpaid',
      ]);
      expect(salesF.querySelector('[data-action]')!.getAttribute('data-action')).toBe(
        'dashOrderStage'
      );
      // Drawn widths are non-increasing and each bottom edge meets the next top.
      const e = edges(salesF);
      expect(e[0].top).toBe(100);
      e.forEach((x, i) => {
        expect(x.bottom).toBeLessThanOrEqual(x.top);
        if (i < e.length - 1) {
          expect(x.bottom).toBe(e[i + 1].top);
        }
      });
    } finally {
      spy.mockRestore();
    }
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
    expect(html).not.toContain('class="dash-funnels');
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
