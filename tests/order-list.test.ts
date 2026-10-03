// ═══════════════════════════════════════════════════════════════════════════════
// Order lists (erp-view.js): Pesanan Penjualan / Pesanan Pembelian
//   • status strip = OrderPipeline.summary (count, value; Belum lunas = sisa)
//   • a strip segment filters the table to its stage; clicking it again clears
//   • row "⋯" menu holds the row actions; "Ubah status" runs the row status path
//   • one "Ekspor / impor" menu per list toolbar
//   • window.openOrderStage opens a list filtered to a stage
//   • "Pengambilan" tag on trading pickup orders
// Boots the real classic bundle against the app shell, like the smoke test.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { classicOrder } from '../vite.config.js';

const ROOT = resolve(__dirname, '..');
const w = () => window as any;
const P = () => w().OrderPipeline;
// Status values of a sales order, in the order erp-crud.js's SO_STATUSES lists them.
const SO_STATUS_VALUES = [
  'Draft',
  'Waiting on Process',
  'Partially Processed',
  'Processed',
  'Confirmed',
  'Paid',
  'Delivered',
  'Cancelled',
];

const appHtml = readFileSync(resolve(ROOT, 'app.html'), 'utf-8');
const bodyHtml = (appHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '').replace(
  /<script[\s\S]*?<\/script>/gi,
  ''
);

const saveSpy = vi.fn();

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };
const line = (amount: number, qty = 1) => [{ ...ITEM, qty, price: amount / qty, subtotal: amount }];
const so = (id: string, status: string, amount: number, extra: any = {}) => ({
  id,
  number: id,
  customer: 'PT Arta',
  customerId: 'C1',
  date: '2026-09-01',
  status,
  amount,
  taxRate: 0,
  lines: line(amount),
  ...extra,
});
const po = (id: string, status: string, amount: number, extra: any = {}) => ({
  id,
  number: id,
  supplier: 'PT Batu Alam',
  supplierId: 'S1',
  date: '2026-09-01',
  status,
  amount,
  taxRate: 0,
  lines: line(amount),
  ...extra,
});
const inv = (id: string, side: 'SO' | 'PO', sourceId: string, amount: number) => ({
  id,
  number: id,
  date: '2026-09-05',
  ...(side === 'SO'
    ? { customer: 'PT Arta', customerId: 'C1' }
    : { supplier: 'PT Batu Alam', supplierId: 'S1' }),
  sourceType: side,
  sourceId,
  status: 'Outstanding',
  amount,
  lines: line(amount),
});

function seedDB() {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [
      { id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 1000, min: 0, cost: 100000 },
    ],
    salesOrders: [
      so('SO-D', 'Draft', 12_000_000),
      so('SO-C', 'Confirmed', 86_000_000),
      so('SO-X', 'Cancelled', 5_000_000),
      so('SO-N', 'Delivered', 30_000_000, { stockMutated: true }),
      so('SO-U', 'Delivered', 40_000_000, { stockMutated: true }),
      so('SO-P', 'Delivered', 50_000_000, { stockMutated: true }),
      so('SO-OLD', 'Delivered', 60_000_000, { date: '2026-06-01', stockMutated: true }),
      so('SO-T', 'Confirmed', 15_000_000, { lines: line(15_000_000, 10) }),
    ],
    salesInvoices: [inv('SI-U', 'SO', 'SO-U', 40_000_000), inv('SI-P', 'SO', 'SO-P', 50_000_000)],
    salesReceipts: [
      { id: 'SR-1', date: '2026-09-06', status: 'Posted', invoiceId: 'SI-U', amount: 15_000_000 },
      { id: 'SR-2', date: '2026-09-06', status: 'Posted', invoiceId: 'SI-P', amount: 50_000_000 },
    ],
    purchaseOrders: [
      po('PO-D', 'Draft', 7_000_000),
      po('PO-R', 'Received', 20_000_000, { stockMutated: true }),
      po('PO-U', 'Received', 25_000_000, { stockMutated: true }),
      po('PO-T', 'Confirmed', 10_000_000, { lines: line(10_000_000, 10) }),
    ],
    purchaseInvoices: [inv('PI-U', 'PO', 'PO-U', 25_000_000)],
    purchasePayments: [],
    deliveryOrders: [],
    paymentLogs: [],
    notifications: [],
    fleet: [],
    expedition: [],
    accounts: { cash: 0, bca: 0, mandiri: 0 },
    reservations: {},
    numberSequences: {},
    accountsChart: [],
    journals: [],
    itemAdjustments: [],
    salesQuotations: [],
    purchaseQuotations: [],
    salesReturns: [],
    purchaseReturns: [],
    salesDownPayments: [],
    purchaseDownPayments: [],
    itemTransfers: [],
    warehouses: [],
    auditLog: [],
    goodsReceipts: [],
    supplierPrices: [],
    settings: {
      user: { name: 'Test', initials: 'T', role: 'Admin', access: 'Full' },
      company: { name: 'Test Co', address: '-', phone: '-' },
      tax: { pkp: true, npwp: '01.234', ppnRate: 0.11, pphRate: 0, rounding: 'round' },
      users: [],
      itemCategories: [],
      units: [],
    },
  };
  // SO-T / PO-T: a trading pickup pair (trucks take the goods at the supplier).
  const opened = w().Trading.openPickupPO('PO-T', { soId: 'SO-T', capacity: 10 });
  expect(opened.error).toBeUndefined();
}

beforeAll(async () => {
  document.body.innerHTML = bodyHtml;
  w().__ERP_USER = { role: 'admin', active: true };
  await import('../src/core/helpers.js');
  await import('../src/core/stock.js');
  await import('../src/classic/core/doc-registry.js');
  w().DB = {};
  w().defaultData = {};
  w().saveDB = saveSpy;
  w().loadDB = vi.fn();
  w().showToast = vi.fn();
  w().showUndoToast = vi.fn();
  w().openModal = vi.fn();
  w().closeModal = vi.fn();
  w().confirmDialog = vi.fn();
  w().Chart = class {
    static register() {}
    destroy() {}
    update() {}
  };
  w().erpAuth = { getCurrentUser: () => ({ email: 'test@nsa.local' }), logout: vi.fn() };
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
  const bundle = classicOrder.map(f => readFileSync(resolve(ROOT, f), 'utf-8')).join('\n;\n');
  // eslint-disable-next-line no-eval -- execute the real classic bundle in global scope
  (0, eval)(bundle);
});

beforeEach(() => {
  document.body.innerHTML = bodyHtml;
  seedDB();
  w().soSelection.clear();
  // Resets stage, status and date filters and the page of both lists.
  w().openOrderStage('purchases', '', { from: '', to: '' });
  w().openOrderStage('sales', '', { from: '', to: '' });
  show('sales');
});

function show(view: string) {
  w().invalidateView(view);
  w().navigate(view);
}

const viewEl = (view: string) => document.getElementById(`view-${view}`)!;
const rowIds = (view: string, action: string) =>
  Array.from(viewEl(view).querySelectorAll(`tbody tr[data-action="${action}"]`)).map(
    tr => (tr as HTMLElement).dataset.id
  );
const seg = (view: string, key: string) =>
  viewEl(view).querySelector(`.ostrip-seg[data-stage="${key}"]`) as HTMLButtonElement;
const click = (el: Element | null) => {
  expect(el, 'element to click').toBeTruthy();
  (el as HTMLElement).click();
};
const popMenu = () => document.getElementById('nsa-pop-menu');
const rowTrigger = (view: string, id: string) =>
  viewEl(view).querySelector(`tr[data-id="${id}"] [data-action="rowMenu"]`) as HTMLButtonElement;
const tick = () => new Promise(r => setTimeout(r, 0));

function expectStripMatches(view: string, side: string, opts: any = {}) {
  const sum = P().summary(side, opts);
  const short = w().idrShort;
  const segs = Array.from(viewEl(view).querySelectorAll('.ostrip-seg'));
  expect(segs.map(s => (s as HTMLElement).dataset.stage)).toEqual(P().KEYS);
  sum.stages.forEach((st: any) => {
    const el = seg(view, st.key);
    expect(el.querySelector('.ostrip-label')!.textContent!.trim()).toBe(st.label);
    expect(el.querySelector('.ostrip-count')!.textContent!.trim()).toBe(String(st.count));
    const money = st.key === 'unpaid' ? 'sisa ' + short(st.outstanding) : short(st.value);
    expect(el.querySelector('.ostrip-value')!.textContent!.trim()).toBe(money);
  });
  return sum;
}

describe('status strip', () => {
  it('shows OrderPipeline.summary per stage on Pesanan Penjualan', () => {
    const sum = expectStripMatches('sales', 'sales');
    const byKey = Object.fromEntries(sum.stages.map((s: any) => [s.key, s]));
    expect(byKey.draft.count).toBe(1);
    expect(byKey.confirmed.count).toBe(2); // SO-C + the pickup SO-T
    expect(byKey.delivered.count).toBe(2); // SO-N, SO-OLD
    expect(byKey.unpaid.count).toBe(1);
    expect(byKey.unpaid.outstanding).toBe(25_000_000);
    expect(seg('sales', 'unpaid').textContent).toContain('sisa Rp 25 jt');
    expect(seg('sales', 'confirmed').textContent).toContain('Rp 101 jt');
    // No stat tiles on the order lists; the strip carries the figures.
    expect(viewEl('sales').querySelector('.stat-row')).toBeNull();
  });

  it('shows OrderPipeline.summary per stage on Pesanan Pembelian', () => {
    show('purchase');
    expectStripMatches('purchase', 'purchases');
    expect(seg('purchase', 'delivered').textContent).toContain('Diterima, belum faktur');
    expect(viewEl('purchase').querySelector('.stat-row')).toBeNull();
  });

  it('follows the page date filter', () => {
    const from = viewEl('sales').querySelector('[data-action="setDateFrom"]') as HTMLInputElement;
    from.value = '2026-08-01';
    from.dispatchEvent(new Event('change', { bubbles: true }));
    const sum = expectStripMatches('sales', 'sales', { from: '2026-08-01', to: '' });
    expect(sum.stages.find((s: any) => s.key === 'delivered').count).toBe(1); // SO-OLD left out
  });
});

describe('stage filter', () => {
  it('filters the rows to a stage and clears on a second click', () => {
    const all = rowIds('sales', 'viewSO');
    expect(all.length).toBe(8);

    click(seg('sales', 'delivered'));
    const ids = P()
      .summary('sales')
      .stages.find((s: any) => s.key === 'delivered').ids;
    expect(rowIds('sales', 'viewSO').sort()).toEqual([...ids].sort());
    expect(seg('sales', 'delivered').getAttribute('aria-pressed')).toBe('true');
    expect(seg('sales', 'delivered').classList.contains('is-active')).toBe(true);
    const note = viewEl('sales').querySelector('.ostrip-note')!;
    expect(note.textContent).toContain('Menampilkan:');
    expect(note.textContent).toContain('Terkirim, belum faktur');
    expect(note.textContent).toContain('Hapus filter');

    click(seg('sales', 'delivered'));
    expect(rowIds('sales', 'viewSO').sort()).toEqual([...all].sort());
    expect(viewEl('sales').querySelector('.ostrip-note')).toBeNull();
    expect(seg('sales', 'delivered').getAttribute('aria-pressed')).toBe('false');
  });

  it('"Hapus filter" clears the stage', () => {
    click(seg('sales', 'paid'));
    expect(rowIds('sales', 'viewSO')).toEqual(['SO-P']);
    click(viewEl('sales').querySelector('.ostrip-note [data-action="clearOrderStage"]'));
    expect(rowIds('sales', 'viewSO').length).toBe(8);
  });

  it('combines with the status filter and the date filter', () => {
    click(seg('sales', 'delivered'));
    w().filters.sales = 'Delivered';
    const from = viewEl('sales').querySelector('[data-action="setDateFrom"]') as HTMLInputElement;
    from.value = '2026-08-01';
    from.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rowIds('sales', 'viewSO')).toEqual(['SO-N']);
    // The status filter button still works alongside the stage.
    expect(viewEl('sales').querySelector('[data-action="toggleFilter"]')!.textContent).toContain(
      'Terkirim'
    );
  });

  it('names the stage when nothing matches', () => {
    w().filters.sales = 'Draft';
    show('sales');
    click(seg('sales', 'paid'));
    const empty = viewEl('sales').querySelector('.td-empty')!;
    expect(empty.textContent).toContain('Lunas');
    expect(empty.querySelector('[data-action="clearOrderStage"]')).toBeTruthy();
  });

  it('exports the rows on screen', () => {
    click(seg('sales', 'paid'));
    expect(
      w()
        .orderRows('sales')
        .map((o: any) => o.id)
    ).toEqual(['SO-P']);
    const rows = vi.spyOn(w(), 'orderRows');
    const xlsx = vi.spyOn(w().NSAXlsx, 'download').mockImplementation(() => {});
    w().exportXLSX('sales');
    expect(rows).toHaveBeenCalledWith('sales');
    const sheet = xlsx.mock.calls[0][1] as any[];
    expect(sheet[0].rows.map((r: any[]) => r[0])).toEqual(['SO-P']);
    rows.mockRestore();
    xlsx.mockRestore();
  });
});

describe('row menu', () => {
  it('shows a status badge, a "⋯" menu and the bulk checkbox on each row', () => {
    const row = viewEl('sales').querySelector('tr[data-id="SO-D"]')!;
    expect(row.querySelector('select')).toBeNull();
    expect(row.querySelector('.badge')!.textContent).toBe('Draft');
    const trigger = rowTrigger('sales', 'SO-D');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Bulk selection stays.
    expect(row.querySelector('input.so-check[data-action="toggleSOCheck"]')).toBeTruthy();
    expect(viewEl('sales').querySelector('#checkAllSO')).toBeTruthy();
    expect(viewEl('sales').querySelector('#bulkBar [data-action="bulkSOStatus"]')).toBeTruthy();
  });

  it('holds every row action of a sales order', () => {
    const trigger = rowTrigger('sales', 'SO-D');
    click(trigger);
    const menu = popMenu()!;
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.getAttribute('role')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('nsa-pop-menu');
    const actions = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
      b => (b as HTMLElement).dataset.action
    );
    expect(actions).toEqual([
      'viewSO',
      'rowMenuPanel',
      'editSO',
      'duplicateSO',
      'printSO',
      'cancelSO',
      'confirmDeleteSO',
      'rowMenuPanel', // "Kembali" in the status picker
    ]);
    expect(menu.textContent).toContain('Ubah status');
    // Focus moves into the menu.
    expect(document.activeElement).toBe(menu.querySelector('[data-action="viewSO"]'));
  });

  it('holds every row action of a purchase order', () => {
    show('purchase');
    click(rowTrigger('purchase', 'PO-D'));
    const actions = Array.from(popMenu()!.querySelectorAll('[role="menuitem"]')).map(
      b => (b as HTMLElement).dataset.action
    );
    expect(actions).toEqual([
      'viewPO',
      'editPO',
      'duplicatePO',
      'printPO',
      'cancelPO',
      'confirmDeletePO',
    ]);
    expect(viewEl('purchase').querySelector('tr[data-id="PO-D"] .badge')).toBeTruthy();
  });

  it('"Ubah status" changes the status through the row status path', async () => {
    const spy = vi.spyOn(w(), 'inlineSOStatus');
    click(rowTrigger('sales', 'SO-D'));
    click(popMenu()!.querySelector('[data-action="rowMenuPanel"][data-panel="status"]'));
    // Still open, on the picker: the current status and the allowed transitions.
    const menu = popMenu()!;
    expect(menu).toBeTruthy();
    const panel = menu.querySelector('.row-menu-panel[data-panel="status"]') as HTMLElement;
    expect(panel.hidden).toBe(false);
    const current = panel.querySelector('[aria-checked="true"]') as HTMLButtonElement;
    expect(current.textContent).toBe('Draft');
    expect(current.disabled).toBe(true);
    const offered = Array.from(panel.querySelectorAll('[data-action="setOrderStatus"]')).map(
      b => (b as HTMLElement).dataset.status
    );
    const expected = SO_STATUS_VALUES.filter(
      v => v !== 'Draft' && w().DocEngine.canTransition('SO', 'Draft', v)
    );
    expect(offered).toEqual(expected);
    expect(offered).toContain('Confirmed');

    click(panel.querySelector('[data-status="Confirmed"]'));
    expect(spy).toHaveBeenCalledWith('SO-D', 'Confirmed');
    const order = w().DB.salesOrders.find((o: any) => o.id === 'SO-D');
    expect(order.status).toBe('Confirmed');
    expect(w().DB.reservations['SO-D']).toBeTruthy(); // the reservation side effect ran
    expect(saveSpy).toHaveBeenCalled();
    await tick();
    expect(popMenu()).toBeNull();
    expect(viewEl('sales').querySelector('tr[data-id="SO-D"] .badge')!.textContent).toBe(
      'Dikonfirmasi'
    );
    spy.mockRestore();
  });

  it('a refused transition is not offered', () => {
    click(rowTrigger('sales', 'SO-P'));
    const offered = Array.from(popMenu()!.querySelectorAll('[data-action="setOrderStatus"]')).map(
      b => (b as HTMLElement).dataset.status
    );
    offered.forEach(v => expect(w().DocEngine.canTransition('SO', 'Delivered', v)).toBe(true));
  });

  it('runs Edit from the menu and closes it', async () => {
    const edit = vi.spyOn(w(), 'editSO').mockImplementation(() => {});
    click(rowTrigger('sales', 'SO-D'));
    click(popMenu()!.querySelector('[data-action="editSO"]'));
    expect(edit).toHaveBeenCalledWith('SO-D');
    await tick();
    expect(popMenu()).toBeNull();
    edit.mockRestore();
  });

  it('asks before Hapus and deletes only once confirmed', async () => {
    const del = vi.spyOn(w(), 'deleteSO').mockImplementation(() => {});
    const confirm = w().confirmDialog as ReturnType<typeof vi.fn>;
    confirm.mockClear();
    click(rowTrigger('sales', 'SO-D'));
    click(popMenu()!.querySelector('[data-action="confirmDeleteSO"]'));
    await tick();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('Hapus');
    expect(del).not.toHaveBeenCalled(); // nothing deleted before the answer
    confirm.mock.calls[0][2](); // "Hapus" in the dialog
    expect(del).toHaveBeenCalledWith('SO-D');
    del.mockRestore();

    show('purchase');
    const delPO = vi.spyOn(w(), 'deletePO').mockImplementation(() => {});
    click(rowTrigger('purchase', 'PO-D'));
    click(popMenu()!.querySelector('[data-action="confirmDeletePO"]'));
    await tick();
    expect(delPO).not.toHaveBeenCalled();
    confirm.mock.calls[confirm.mock.calls.length - 1][2]();
    expect(delPO).toHaveBeenCalledWith('PO-D');
    delPO.mockRestore();
  });

  it('edit dialog Hapus asks inside the footer and keeps the form buttons', async () => {
    const del = vi.spyOn(w(), 'deleteSO').mockImplementation(() => {});
    const modal = document.createElement('div');
    modal.innerHTML = `<div class="modal-footer">
      <button class="btn-ghost" data-action="closeModal">Batal</button>
      <button class="btn-danger" data-action="armDelete" data-do="deleteSO" data-id="SO-D" data-label="SO.X">Hapus</button>
      <button class="btn" id="updateSO-test">Simpan</button></div>`;
    document.body.appendChild(modal);
    const footer = modal.querySelector('.modal-footer') as HTMLElement;
    const save = footer.querySelector('#updateSO-test') as HTMLElement;

    click(footer.querySelector('[data-action="armDelete"]'));
    const row = footer.querySelector('.confirm-inline')!;
    expect(row.textContent).toContain('Hapus SO.X?');
    expect(save.hidden).toBe(true);
    expect(del).not.toHaveBeenCalled();

    click(row.querySelector('[data-action="disarmDelete"]'));
    expect(footer.querySelector('.confirm-inline')).toBeNull();
    expect(save.hidden).toBe(false);
    expect(footer.querySelector('#updateSO-test')).toBe(save); // same element, listeners kept

    click(footer.querySelector('[data-action="armDelete"]'));
    click(footer.querySelector('.confirm-inline [data-action="deleteSO"]'));
    await tick();
    expect(del).toHaveBeenCalledWith('SO-D');
    del.mockRestore();
    modal.remove();
  });

  it('closes on Escape (focus back on the button) and on an outside click', () => {
    const trigger = rowTrigger('sales', 'SO-C');
    click(trigger);
    const items = Array.from(popMenu()!.querySelectorAll('[role="menuitem"]')).filter(
      b => !(b as HTMLElement).closest('[hidden]')
    );
    popMenu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(popMenu()).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    click(trigger);
    expect(popMenu()).toBeTruthy();
    click(viewEl('sales').querySelector('.sec-hdr h1'));
    expect(popMenu()).toBeNull();
  });

  it('a click on the row still opens the detail', () => {
    const viewSO = vi.spyOn(w(), 'viewSO').mockImplementation(() => {});
    click(viewEl('sales').querySelector('tr[data-id="SO-C"] td:nth-child(3)'));
    expect(viewSO).toHaveBeenCalledWith('SO-C');
    viewSO.mockRestore();
  });

  it('shows the money stage on delivered rows, matching the strip', () => {
    const text = (id: string) =>
      viewEl('sales').querySelector(`tr[data-id="${id}"] .badge`)!.textContent;
    expect(text('SO-C')).toBe('Dikonfirmasi'); // before delivery: the status
    expect(text('SO-N')).toBe('Belum faktur'); // delivered, not invoiced
    const unpaid = w()
      .OrderPipeline.summary('sales')
      .stages.find((s: any) => s.key === 'unpaid');
    expect(text(unpaid.ids[0])).toBe('Belum lunas');
  });

  it('shows a "Pengambilan" tag on pickup orders only', () => {
    const tagged = Array.from(viewEl('sales').querySelectorAll('tbody tr')).filter(tr =>
      tr.querySelector('.ostrip-tag')
    );
    expect(tagged.map(tr => (tr as HTMLElement).dataset.id)).toEqual(['SO-T']);
    expect(tagged[0].querySelector('.ostrip-tag')!.textContent).toBe('Pengambilan');
    show('purchase');
    const tag = viewEl('purchase').querySelector('tr[data-id="PO-T"] .ostrip-tag');
    expect(tag!.textContent).toBe('Pengambilan');
    expect(viewEl('purchase').querySelector('tr[data-id="PO-D"] .ostrip-tag')).toBeNull();
  });
});

describe('Ekspor / impor menu', () => {
  const menuActions = (view: string) => {
    show(view);
    const trigger = viewEl(view).querySelector('[data-action="toolMenu"]') as HTMLElement;
    expect(trigger.textContent).toContain('Ekspor / impor');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    click(trigger);
    const items = Array.from(popMenu()!.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    items.forEach(b => expect(b.dataset.type).toBe(view));
    const out = items.map(b => b.dataset.action);
    click(viewEl(view).querySelector('.sec-hdr h1'));
    return out;
  };

  it('holds every import / export option of each list', () => {
    expect(menuActions('sales')).toEqual(['exportCSV', 'printSummary', 'importXLSX']);
    expect(menuActions('purchase')).toEqual([
      'exportCSV',
      'exportXLSX',
      'printSummary',
      'importXLSX',
    ]);
    expect(menuActions('logistics')).toEqual(['exportCSV', 'exportXLSX', 'importXLSX']);
    expect(menuActions('inventory')).toEqual(['exportCSV', 'exportXLSX']);
  });

  it('keeps the create button and the filter visible, the options only in the menu', () => {
    for (const [view, create] of [
      ['sales', 'addSO'],
      ['purchase', 'addPO'],
      ['logistics', 'addDO'],
      ['inventory', 'addItem'],
    ]) {
      show(view);
      const el = viewEl(view);
      expect(el.querySelector(`.sec-hdr [data-action="${create}"]`)).toBeTruthy();
      expect(el.querySelector('[data-action="toggleFilter"]')).toBeTruthy();
      el.querySelectorAll('[data-action="exportCSV"], [data-action="importXLSX"]').forEach(b =>
        expect(b.closest('.tool-menu[hidden]')).toBeTruthy()
      );
    }
  });

  it('runs an option from the menu', () => {
    const print = vi.fn();
    const orig = w().printOrderSummary;
    w().printOrderSummary = print;
    click(viewEl('sales').querySelector('[data-action="toolMenu"]'));
    click(popMenu()!.querySelector('[data-action="printSummary"]'));
    expect(print).toHaveBeenCalledWith('sales');
    w().printOrderSummary = orig;
  });
});

describe('openOrderStage', () => {
  it('opens Pesanan Pembelian filtered to a stage', () => {
    w().filters.purchase = 'Draft';
    expect(w().openOrderStage('purchases', 'unpaid')).toBe(true);
    expect(w().activeView).toBe('purchase');
    expect(viewEl('purchase').classList.contains('active')).toBe(true);
    expect(rowIds('purchase', 'viewPO')).toEqual(['PO-U']);
    expect(seg('purchase', 'unpaid').getAttribute('aria-pressed')).toBe('true');
    expect(w().filters.purchase).toBe('all');
  });

  it('opens Pesanan Penjualan filtered to a stage, with an optional period', () => {
    show('dashboard');
    w().openOrderStage('sales', 'delivered', { from: '2026-08-01', to: '2026-12-31' });
    expect(w().activeView).toBe('sales');
    expect(rowIds('sales', 'viewSO')).toEqual(['SO-N']);
    expect(
      (viewEl('sales').querySelector('[data-action="setDateFrom"]') as HTMLInputElement).value
    ).toBe('2026-08-01');
  });

  it('an unknown stage opens the whole list', () => {
    w().openOrderStage('sales', 'nope');
    expect(rowIds('sales', 'viewSO').length).toBe(8);
    expect(viewEl('sales').querySelector('.ostrip-seg.is-active')).toBeNull();
  });
});
