// ═══════════════════════════════════════════════════════════════════════════════
// List tables as cards on phones (mobile.css "List cards on phones")
//   • every covered list renders table.list-cards and marks each row cell with
//     its place on the card (data-cell): title, status, name, amount, meta,
//     menu, check, action
//   • "Urutkan" in the toolbar "⋯" menu (the phone sort control) orders the rows
//     exactly like a click on the column header
//   • "Pilih beberapa" keeps its checkboxes (one per row, plus "Pilih semua")
// Boots the real classic bundle against the app shell, like the smoke test.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { classicOrder } from '../vite.config.js';

const ROOT = resolve(__dirname, '..');
const w = () => window as any;
const T = () => w().Trading;

const appHtml = readFileSync(resolve(ROOT, 'app.html'), 'utf-8');
const bodyHtml = (appHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '').replace(
  /<script[\s\S]*?<\/script>/gi,
  ''
);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = iso(new Date());

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };
const line = (amount: number, qty = 1) => [{ ...ITEM, qty, price: amount / qty, subtotal: amount }];
const so = (
  id: string,
  customer: string,
  date: string,
  status: string,
  amount: number,
  x = {}
) => ({
  id,
  number: id,
  customer,
  customerId: customer === 'PT Arta' ? 'C1' : 'C2',
  date,
  status,
  amount,
  taxRate: 0,
  lines: line(amount, 10),
  ...x,
});
const po = (
  id: string,
  supplier: string,
  date: string,
  status: string,
  amount: number,
  x = {}
) => ({
  id,
  number: id,
  supplier,
  supplierId: supplier === 'PT Batu Alam' ? 'S1' : 'S2',
  date,
  status,
  amount,
  taxRate: 0,
  lines: line(amount, 10),
  ...x,
});
const dO = (id: string, customer: string, date: string, destination: string, driver: string) => ({
  id,
  number: id,
  soId: 'SO-B',
  customer,
  destination,
  date,
  driver,
  vehicle: 'B 1 AB',
  status: 'Sent',
});

function seedDB() {
  w().DB = {
    customers: [
      { id: 'C1', name: 'PT Arta', phone: '0812', address: 'Jakarta', termDays: 30 },
      { id: 'C2', name: 'CV Beton', phone: '0813', address: 'Bekasi', termDays: 30 },
    ],
    suppliers: [
      { id: 'S1', name: 'PT Batu Alam', contact: 'Agus', phone: '0251', termDays: 30 },
      { id: 'S2', name: 'CV Pasir', contact: 'Ujang', phone: '0263', termDays: 30 },
    ],
    inventoryItems: [
      {
        id: '1',
        name: 'Batu Split 1-2',
        category: 'Batu',
        unit: 'Ton',
        stock: 1000,
        min: 0,
        cost: 100000,
        sell: 150000,
      },
      {
        id: '2',
        name: 'Abu Batu',
        category: 'Batu',
        unit: 'Ton',
        stock: 5,
        min: 10,
        cost: 70000,
        sell: 90000,
      },
      {
        id: '3',
        name: 'Pasir Beton',
        category: 'Pasir',
        unit: 'M3',
        stock: 40,
        min: 0,
        cost: 185000,
        sell: 245000,
      },
    ],
    salesOrders: [
      so('SO-A', 'PT Arta', '2026-09-03', 'Draft', 12_000_000),
      so('SO-B', 'CV Beton', '2026-09-01', 'Confirmed', 86_000_000),
      so('SO-C', 'PT Arta', '2026-09-02', 'Cancelled', 5_000_000),
      so('SO-T', 'PT Arta', TODAY, 'Confirmed', 15_000_000),
      so('SO-X', 'CV Beton', TODAY, 'Confirmed', 10_000_000),
    ],
    purchaseOrders: [
      po('PO-A', 'PT Batu Alam', '2026-09-02', 'Draft', 7_000_000),
      po('PO-B', 'CV Pasir', '2026-09-01', 'Confirmed', 20_000_000),
      po('PO-T', 'PT Batu Alam', TODAY, 'Confirmed', 10_000_000),
      po('PO-X', 'PT Batu Alam', TODAY, 'Confirmed', 9_000_000),
      po('PO-K', 'CV Pasir', TODAY, 'Confirmed', 3_000_000),
    ],
    deliveryOrders: [
      dO('DO-A', 'CV Beton', '2026-09-04', 'Proyek A', 'Budi'),
      dO('DO-B', 'PT Arta', '2026-09-02', 'Gudang B', 'Ali'),
      dO('DO-C', 'CV Beton', '2026-09-03', 'Proyek C', 'Citra'),
    ],
    salesInvoices: [
      {
        id: 'SI-1',
        number: 'SI-1',
        date: '2026-09-05',
        customer: 'CV Beton',
        customerId: 'C2',
        sourceType: 'SO',
        sourceId: 'SO-B',
        status: 'Outstanding',
        amount: 86_000_000,
        lines: line(86_000_000, 10),
      },
    ],
    purchaseInvoices: [
      {
        id: 'PI-1',
        number: 'PI-1',
        date: '2026-09-05',
        supplier: 'CV Pasir',
        supplierId: 'S2',
        sourceType: 'PO',
        sourceId: 'PO-B',
        status: 'Outstanding',
        amount: 20_000_000,
        lines: line(20_000_000, 10),
      },
    ],
    salesReceipts: [
      {
        id: 'SR-1',
        number: 'SR-1',
        date: '2026-09-06',
        customer: 'CV Beton',
        customerId: 'C2',
        status: 'Posted',
        invoiceId: 'SI-1',
        paymentMethod: 'Tunai',
        amount: 6_000_000,
      },
    ],
    purchasePayments: [
      {
        id: 'PP-1',
        number: 'PP-1',
        date: '2026-09-06',
        supplier: 'CV Pasir',
        supplierId: 'S2',
        status: 'Posted',
        invoiceId: 'PI-1',
        paymentMethod: 'Transfer BCA',
        amount: 5_000_000,
      },
    ],
    employees: [
      { id: 'E1', name: 'Sari', position: 'Admin', department: 'Keuangan', status: 'Active' },
      { id: 'E2', name: 'Budi', position: 'Driver', department: 'Pengiriman', status: 'Probation' },
    ],
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
  // Pengambilan: PO-T runs with one truck recorded (not billed yet), PO-X is
  // closed, PO-K (confirmed, one item) is ready to open.
  expect(T().openPickupPO('PO-T', { soId: 'SO-T', capacity: 5 }).error).toBeUndefined();
  const trip = T().recordTrip(T().slotsFor('PO-T')[0].id, {
    date: TODAY,
    gross: 17,
    tare: 12,
    vehicle: 'B 9 XY',
    driver: 'Ali',
  });
  expect(trip.error).toBeUndefined();
  expect(T().openPickupPO('PO-X', { soId: 'SO-X', capacity: 5 }).error).toBeUndefined();
  expect(T().closePickupPO('PO-X', 'manual')).toBeTruthy();
}

beforeAll(async () => {
  document.body.innerHTML = bodyHtml;
  w().__ERP_USER = { role: 'admin', active: true };
  await import('../src/core/helpers.js');
  await import('../src/core/stock.js');
  await import('../src/classic/core/doc-registry.js');
  w().DB = {};
  w().defaultData = {};
  w().saveDB = vi.fn();
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
  w().setSOSelectMode(false);
  w().openOrderStage('purchases', '', { from: '', to: '' });
  w().openOrderStage('sales', '', { from: '', to: '' });
});

function show(view: string) {
  w().invalidateView(view);
  w().navigate(view);
}
const tick = () => new Promise(r => setTimeout(r, 0));
const viewEl = (view: string) => document.getElementById(`view-${view}`)!;
const click = (el: Element | null) => {
  expect(el, 'element to click').toBeTruthy();
  (el as HTMLElement).click();
};
const popMenu = () => document.getElementById('nsa-pop-menu');

const ROLES = ['check', 'title', 'status', 'menu', 'name', 'amount', 'meta', 'action'];

// The card table of a page: data rows (not an empty-state row), each cell marked.
function cardRows(table: Element | null) {
  expect(table, 'table.list-cards').toBeTruthy();
  expect(table!.classList.contains('list-cards')).toBe(true);
  const rows = Array.from(table!.querySelectorAll(':scope > tbody > tr')).filter(
    tr => !tr.querySelector('td[colspan]')
  );
  expect(rows.length).toBeGreaterThan(0);
  rows.forEach(tr => {
    Array.from(tr.children).forEach(td => {
      expect(ROLES, td.outerHTML.slice(0, 120)).toContain((td as HTMLElement).dataset.cell);
    });
  });
  return rows;
}
const cellsOf = (tr: Element, role: string) =>
  tr.querySelectorAll(`:scope > td[data-cell="${role}"]`);
const textOf = (tr: Element, role: string) =>
  (cellsOf(tr, role)[0]?.textContent || '').replace(/\s+/g, ' ').trim();

// One cell for each role the list has; the title is never empty.
function expectRoles(rows: Element[], roles: string[]) {
  rows.forEach(tr => {
    roles.forEach(role =>
      expect(cellsOf(tr, role), `${role} in ${textOf(tr, 'title')}`).toHaveLength(1)
    );
    expect(textOf(tr, 'title')).not.toBe('');
  });
}

// ── Every covered list ────────────────────────────────────────────────────────
describe('lists render as cards on phones', () => {
  const LINE_1_2 = ['title', 'status', 'name', 'amount'];

  it('Pesanan Penjualan and Pesanan Pembelian', () => {
    show('sales');
    let rows = cardRows(viewEl('sales').querySelector('table'));
    expectRoles(rows, [...LINE_1_2, 'menu', 'meta']);
    const b = rows.find(tr => (tr as HTMLElement).dataset.id === 'SO-B')!;
    expect(textOf(b, 'title')).toBe('SO-B');
    expect(textOf(b, 'name')).toBe('CV Beton');
    expect(textOf(b, 'amount')).toBe(w().idr(86_000_000).replace(/\s+/g, ' '));
    expect(textOf(b, 'status')).toBe('Dikonfirmasi');
    expect(cellsOf(b, 'menu')[0].querySelector('[data-action="rowMenu"]')).toBeTruthy();

    show('purchase');
    rows = cardRows(viewEl('purchase').querySelector('table'));
    expectRoles(rows, [...LINE_1_2, 'menu', 'meta']);
    const t = rows.find(tr => (tr as HTMLElement).dataset.id === 'PO-T')!;
    expect(textOf(t, 'name')).toBe('PT Batu Alam');
    // The "Pengambilan" tag stays with the number.
    expect(cellsOf(t, 'title')[0].querySelector('.ostrip-tag')!.textContent).toBe('Pengambilan');
  });

  it('Surat Jalan and Barang & Stok', () => {
    show('logistics');
    let rows = cardRows(viewEl('logistics').querySelector('table'));
    // A surat jalan carries no amount: number, status and Edit, then the customer.
    expectRoles(rows, ['title', 'status', 'name', 'menu']);
    rows.forEach(tr => expect(cellsOf(tr, 'meta')).toHaveLength(5));
    expect(textOf(rows[0], 'menu')).toBe('Edit');

    show('inventory');
    rows = cardRows(viewEl('inventory').querySelector('table'));
    expectRoles(rows, [...LINE_1_2, 'menu']);
    const low = rows.find(tr => textOf(tr, 'title') === 'Abu Batu')!;
    expect(textOf(low, 'status')).toBe('Stok Rendah');
    expect(cellsOf(low, 'amount')[0].getAttribute('data-cap')).toBe('Stok');
    expect(cellsOf(low, 'amount')[0].classList.contains('t-danger')).toBe(true);
  });

  it('Faktur, Penerimaan Pembayaran and Pembayaran ke Supplier', () => {
    const open: Record<string, () => void> = {
      SI: () => w()._invoiceExtras.openSalesInvoice(),
      PI: () => w()._invoiceExtras.openPurchaseInvoice(),
      SR: () => w()._invoiceExtras.openSalesReceipt(),
      PP: () => w()._invoiceExtras.openPurchasePayment(),
    };
    for (const [type, party] of [
      ['SI', 'CV Beton'],
      ['PI', 'CV Pasir'],
      ['SR', 'CV Beton'],
      ['PP', 'CV Pasir'],
    ]) {
      open[type]();
      const rows = cardRows(viewEl('invoices').querySelector('table'));
      expectRoles(rows, [...LINE_1_2, 'menu']);
      expect(textOf(rows[0], 'title')).toBe(`${type}-1`);
      expect(textOf(rows[0], 'name')).toBe(party);
      // The whole row opens the document; the last cell is only a chevron.
      expect(rows[0].getAttribute('data-action')).toBe('invView');
      expect(cellsOf(rows[0], 'menu')[0].querySelector('.row-chev')).toBeTruthy();
    }
  });

  it('Pelanggan, Supplier and Karyawan', async () => {
    w()._masterSection = 'customers';
    show('master');
    let rows = cardRows(viewEl('master').querySelector('table'));
    // A master list has no status column: name, Edit, then phone and order count.
    expectRoles(rows, ['title', 'name', 'amount', 'menu']);
    expect(textOf(rows[0], 'title')).toBe('PT Arta');
    expect(cellsOf(rows[0], 'amount')[0].getAttribute('data-unit')).toBe('SO');

    w()._masterSection = 'suppliers';
    show('master');
    rows = cardRows(viewEl('master').querySelector('table'));
    expectRoles(rows, ['title', 'name', 'amount', 'menu']);
    expect(textOf(rows[0], 'name')).toBe('Agus');
    expect(cellsOf(rows[0], 'amount')[0].getAttribute('data-unit')).toBe('PO');

    w()._masterSection = undefined;
    w()._masterExtras.openEmployee();
    await tick();
    rows = cardRows(viewEl('master').querySelector('table'));
    expectRoles(rows, ['title', 'status', 'name', 'menu']);
    const sari = rows.find(tr => textOf(tr, 'name') === 'Sari')!;
    expect(textOf(sari, 'title')).toBe('E1');
    expect(textOf(sari, 'status')).toBe('Aktif');
    expect(textOf(sari, 'menu')).toBe('Edit Hapus');
  });

  it('PO Pengambilan: running, finished and ready to open', () => {
    w()._pickupView.openOrders();
    let tables = viewEl('pickups').querySelectorAll('table');
    let rows = cardRows(tables[0]);
    expectRoles(rows, LINE_1_2);
    const t = rows.find(tr => (tr as HTMLElement).dataset.id === 'PO-T')!;
    expect(textOf(t, 'title')).toContain('PO-T');
    expect(textOf(t, 'name')).toBe('PT Batu Alam');
    expect(textOf(t, 'status')).toBe('Berjalan');
    expect(cellsOf(t, 'amount')[0].querySelector('[role="progressbar"]')).toBeTruthy();

    // Ready to open: its button gets a line of its own on the card.
    rows = cardRows(tables[1]);
    expectRoles(rows, ['title', 'name', 'amount', 'action']);
    expect(textOf(rows[0], 'title')).toContain('PO-K');
    expect(
      cellsOf(rows[0], 'action')[0].querySelector('[data-action="createPickupPO"]')
    ).toBeTruthy();

    click(viewEl('pickups').querySelector('[data-action="pvOrdersTab"][data-id="done"]'));
    tables = viewEl('pickups').querySelectorAll('table');
    rows = cardRows(tables[0]);
    expectRoles(rows, LINE_1_2);
    expect(textOf(rows[0], 'title')).toContain('PO-X');
    expect(textOf(rows[0], 'status')).toContain('Selesai');
  });

  it('Rekap Pengambilan, with its total row', () => {
    w()._pickupView.openTripRecap();
    const table = viewEl('pickups').querySelector('table');
    const rows = cardRows(table);
    expectRoles(rows, ['title', 'name', 'amount']);
    expect(textOf(rows[0], 'title')).toBe('PO-T/01');
    expect(textOf(rows[0], 'name')).toBe('PT Arta');
    expect(textOf(rows[0], 'amount')).toBe('5 Ton');
    expect(table!.querySelector('tfoot')!.textContent).toContain('Total 1 truk');
  });

  it('Tagih Pelanggan and Tagihan Supplier', () => {
    w()._pickupBilling.openCustomerBilling();
    let rows = cardRows(viewEl('pickups').querySelector('table'));
    expectRoles(rows, ['title', 'name', 'amount', 'action']);
    expect(textOf(rows[0], 'title')).toBe('PT Arta');
    expect(cellsOf(rows[0], 'name')[0].getAttribute('data-unit')).toBe('truk');
    expect(textOf(rows[0], 'action')).toBe('Tagih');

    w()._pickupBilling.openSupplierBilling();
    rows = cardRows(viewEl('pickups').querySelector('table'));
    expectRoles(rows, ['title', 'name', 'amount', 'action']);
    expect(textOf(rows[0], 'title')).toBe('PT Batu Alam');
    expect(textOf(rows[0], 'action')).toBe('Catat tagihan');
  });

  it('an empty list still shows its message in the card table', () => {
    w().DB.salesOrders = [];
    show('sales');
    const empty = viewEl('sales').querySelector('table.list-cards td.td-empty[colspan]');
    expect(empty!.textContent).toContain('Belum ada data');
  });
});

// ── "Urutkan" on phones = the column header sort ─────────────────────────────
describe('phone sort control', () => {
  const ids = (view: string) =>
    Array.from(viewEl(view).querySelectorAll('tbody tr[data-id]')).map(
      tr => (tr as HTMLElement).dataset.id
    );
  const header = (view: string, col: string) => {
    click(viewEl(view).querySelector(`thead th[data-action="sortCol"][data-col="${col}"]`));
    return ids(view);
  };
  const openMenu = (view: string) => {
    click(viewEl(view).querySelector('.list-tools .list-more-btn'));
    return popMenu()!;
  };
  const menuSort = (view: string, col: string) => {
    click(openMenu(view).querySelector(`.list-sort [data-action="sortCol"][data-col="${col}"]`));
    return ids(view);
  };

  for (const [view, cols] of [
    ['sales', ['id', 'customer', 'date', 'amount']],
    ['purchase', ['id', 'supplier', 'date', 'amount', 'status']],
    ['inventory', ['name', 'category', 'stock', 'cost', 'sell']],
    ['logistics', ['id', 'customer', 'destination', 'date', 'status']],
  ] as const) {
    it(`orders ${view} like the header, both directions`, () => {
      show(view);
      // The menu offers the header's sortable columns, as a radio group.
      const menu = openMenu(view);
      const items = Array.from(menu.querySelectorAll('.list-sort [role="menuitemradio"]'));
      expect(items.map(b => (b as HTMLElement).dataset.col)).toEqual(cols);
      expect(menu.querySelector('.list-sort')!.getAttribute('aria-label')).toBe('Urutkan');
      const headers = Array.from(viewEl(view).querySelectorAll('thead th[data-action="sortCol"]'));
      // (label without the "naik ↑ / turun ↓" hint of the active column)
      expect(items.map(b => b.firstChild!.textContent!.trim())).toEqual(
        headers.map(th => th.textContent!.replace(/[↑↓↕]/g, '').trim())
      );
      click(viewEl(view).querySelector('.sec-hdr h1'));

      let differs = false;
      for (const col of cols) {
        const other = cols.find(c => c !== col)!;
        header(view, other);
        const up = header(view, col);
        const down = header(view, col);
        differs = differs || up.join() !== down.join();
        header(view, other);
        expect(menuSort(view, col), `${view} by ${col}, first tap`).toEqual(up);
        expect(menuSort(view, col), `${view} by ${col}, second tap`).toEqual(down);
      }
      expect(differs).toBe(true);
      // Re-renders the list ~20 times: slow when the whole suite runs at once.
    }, 20000);
  }

  it('marks the active column and its direction, and keeps focus on "⋯"', () => {
    show('sales');
    const ids1 = menuSort('sales', 'amount');
    expect(ids1[0]).toBe('SO-C'); // smallest total first
    expect(document.activeElement).toBe(viewEl('sales').querySelector('.list-more-btn'));
    const item = openMenu('sales').querySelector('.list-sort [data-col="amount"]')!;
    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(item.querySelector('.tool-menu-hint')!.textContent).toContain('naik');
    expect(
      popMenu()!.querySelectorAll('.list-sort [aria-checked="true"]'),
      'one active column'
    ).toHaveLength(1);
    // The header shows the same sort.
    click(viewEl('sales').querySelector('.sec-hdr h1'));
    expect(
      viewEl('sales')
        .querySelector('thead th[data-col="amount"]')!
        .classList.contains('th-sort-active')
    ).toBe(true);
  });
});

// ── "Pilih beberapa" ──────────────────────────────────────────────────────────
describe('selection on phones', () => {
  it('each card keeps its checkbox; "Pilih semua" stays above the cards', () => {
    show('sales');
    click(viewEl('sales').querySelector('.list-tools .list-more-btn'));
    click(popMenu()!.querySelector('[data-action="soSelectMode"]'));
    const table = viewEl('sales').querySelector('table.list-cards')!;
    expect(table.classList.contains('is-selecting')).toBe(true);
    const rows = cardRows(table);
    rows.forEach(tr => {
      expect(tr.firstElementChild!.getAttribute('data-cell')).toBe('check');
      expect(cellsOf(tr, 'check')[0].querySelector('input.so-check')).toBeTruthy();
    });
    const all = table.querySelector('thead label.sel-all')!;
    expect(all.querySelector('#checkAllSO')).toBeTruthy();
    expect(all.querySelector('.sel-all-text')!.textContent).toBe('Pilih semua');

    const cb = cellsOf(rows[0], 'check')[0].querySelector('input') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(w().soSelection.size).toBe(1);

    click(viewEl('sales').querySelector('[data-action="soSelectDone"]'));
    const after = viewEl('sales').querySelector('table.list-cards')!;
    expect(after.classList.contains('is-selecting')).toBe(false);
    expect(after.querySelector('td[data-cell="check"]')).toBeNull();
  });
});

// ── The stylesheet ────────────────────────────────────────────────────────────
describe('phone stylesheet', () => {
  const css = readFileSync(resolve(ROOT, 'mobile.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Top-level blocks: { prelude, body } (an @media block's body holds its rules).
  const blocks: { prelude: string; body: string }[] = [];
  for (let i = 0, depth = 0, start = 0, open = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) {
        open = i;
      }
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        blocks.push({ prelude: css.slice(start, open).trim(), body: css.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }

  it('turns the tables into cards only up to 560px', () => {
    const phone = blocks.find(
      b => b.prelude === '@media (max-width: 560px)' && b.body.includes('.list-cards > thead')
    )!;
    expect(phone).toBeTruthy();
    expect(phone.body).toMatch(/\.list-cards > thead \{\s*display: none;/);
    expect(phone.body).toMatch(/\.list-cards > tbody > tr \{\s*display: flex;/);
    // Every rule that reshapes a list table sits in a phone-width block.
    blocks
      .filter(b => /\.list-cards[^{]*(thead|tbody|tr\b|td\b)/.test(b.prelude + b.body))
      .forEach(b => {
        const max = Number((b.prelude.match(/^@media \(max-width: (\d+)px\)$/) || [])[1]);
        expect(max, b.prelude).toBeLessThanOrEqual(560);
      });
  });

  it('shows "Urutkan" in the menu only on phones', () => {
    const wide = blocks.find(b => b.prelude === '@media (min-width: 561px)')!;
    expect(wide.body).toMatch(/\.list-sort \{\s*display: none;/);
  });
});
