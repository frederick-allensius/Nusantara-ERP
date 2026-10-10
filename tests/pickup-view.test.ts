// ═══════════════════════════════════════════════════════════════════════════════
// Pengambilan pages (pickup-view.js) over window.Trading:
//   • PO Pengambilan: ready POs, the open-PO dialog (surat jalan count preview),
//     cut-off sweep, detail actions (export, print, void, close, reopen)
//   • Catat Pengambilan: phone form with live netto, over-quota confirmation
//   • Impor Rekap Timbangan: a real .xlsx / .csv read with SheetJS, the review
//     groups, applying it, a changed weight on an invoiced trip
//   • Perubahan Timbangan: open alerts resolved with a note, change history
//   • Rekap Pengambilan: totals, invoice status, Excel export, filters
// The real classic files run in happy-dom; navigate() renders #view-pickups.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as XLSX from '@e965/xlsx';

const w = () => window as any;
const T = () => w().Trading;
const PV = () => w()._pickupView;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = iso(new Date());
const MONTH_START = TODAY.slice(0, 7) + '-01';
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const PO_NO = 'POA.0001';

// Every page and dialog rendered during a test is checked for balanced tags: an
// unclosed card nests the rest of the page inside it, which the text-based
// assertions below would not notice.
const markupErrors: string[] = [];
function checkMarkup(where: string, html: string) {
  ['div', 'table', 'tr', 'td', 'select', 'details', 'label', 'button'].forEach(tag => {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) {
      markupErrors.push(`${where}: <${tag}> ${open} open, ${close} closed`);
    }
  });
}

beforeAll(async () => {
  await import('../src/core/helpers.js');
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
  await import('../public/classic/core/pickup-view.js');
  await import('../public/classic/core/pickup-billing.js');

  w().XLSX = XLSX;
  w().NSAXlsx = { download: vi.fn() };
  w().saveDB = vi.fn();
  w().showToast = vi.fn();
  w().printDocument = vi.fn();
  w().invalidateView = () => {};
  w().navigate = (id: string) => {
    const el = document.getElementById('view-' + id);
    if (el) {
      const html = w().renderPickups();
      checkMarkup('page ' + ((html.match(/<h1>([^<]*)<\/h1>/) || [])[1] || id), html);
      el.innerHTML = html;
    }
  };
  w().openModal = (title: string, body: string, footer: string) => {
    checkMarkup('dialog ' + title, body + (footer || ''));
    const m = document.getElementById('modal')!;
    m.innerHTML = `<h2></h2><div class="modal-body">${body}</div><div class="modal-footer">${footer || ''}</div>`;
    m.querySelector('h2')!.textContent = title;
  };
  w().closeModal = () => {
    const m = document.getElementById('modal');
    if (m) {
      m.innerHTML = '';
    }
  };
});

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };

function seed() {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', address: 'Jakarta Utara', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [{ id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0, cost: 100000 }],
    salesOrders: [
      {
        id: 'SO-1',
        number: 'SOA.0001',
        customer: 'PT Arta',
        customerId: 'C1',
        date: MONTH_START,
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 100, price: 150000, lineDiscount: 0, subtotal: 15000000 }],
      },
    ],
    purchaseOrders: [
      {
        id: 'PO-1',
        number: PO_NO,
        supplier: 'PT Batu Alam',
        supplierId: 'S1',
        date: MONTH_START,
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 100, price: 100000, lineDiscount: 0, subtotal: 10000000 }],
      },
      {
        id: 'PO-2',
        number: 'POA.0002',
        supplier: 'PT Batu Alam',
        supplierId: 'S1',
        date: MONTH_START,
        status: 'Confirmed',
        lines: [
          { ...ITEM, qty: 10, price: 100000 },
          { itemId: '2', itemName: 'Pasir', unit: 'Ton', qty: 5, price: 90000 },
        ],
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
    supplierPrices: [],
    numberSequences: {},
    accountsChart: [],
    journals: [],
    settings: {},
  };
}

const view = () => document.getElementById('view-pickups')!.textContent || '';
const modal = () => document.getElementById('modal')!.textContent || '';
const slot = (n: number) => T().slotsFor('PO-1')[n - 1];
const po = () => w().DB.purchaseOrders[0];

function act(action: string, id?: string) {
  const sel = id ? `[data-action="${action}"][data-id="${id}"]` : `[data-action="${action}"]`;
  const el = document.querySelector(sel) as HTMLElement | null;
  expect(el, sel).toBeTruthy();
  el!.click();
}
function setVal(id: string, value: string, ev = 'input') {
  const el = document.getElementById(id) as HTMLInputElement | null;
  expect(el, id).toBeTruthy();
  el!.value = value;
  el!.dispatchEvent(new Event(ev, { bubbles: true }));
}
function openPO(capacity = 35) {
  const r = T().openPickupPO('PO-1', { soId: 'SO-1', capacity });
  expect(r.error).toBeUndefined();
}
function xlsxFile(aoa: unknown[][], name = 'rekap.xlsx') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Surat Jalan');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="view-pickups" class="view"></div><div id="modal"></div>';
  markupErrors.length = 0;
  seed();
});

afterEach(() => {
  expect(markupErrors, markupErrors.join('\n')).toEqual([]);
});

describe('PO Pengambilan', () => {
  it('opens a ready PO from the dialog: picks the customer PO, previews and creates the surat jalan', () => {
    PV().openOrders();
    expect(view()).toContain('PO siap dibuka');
    expect(view()).toContain(PO_NO);
    expect(view()).toContain('lebih dari satu barang'); // PO-2 has two lines

    act('createPickupPO', 'PO-1');
    expect(modal()).toContain('Buka PO untuk Pengambilan');
    expect((document.getElementById('pv-setup-so') as HTMLSelectElement).value).toBe('SO-1');
    expect((document.getElementById('pv-setup-cutoff') as HTMLInputElement).value).toBe(
      T().monthEnd(MONTH_START)
    );
    expect(modal()).toContain('3 surat jalan'); // 100 t ÷ 35 t
    setVal('pv-setup-cap', '25');
    expect(modal()).toContain('4 surat jalan');

    act('savePickupPO', 'PO-1');
    expect(
      T()
        .slotsFor('PO-1')
        .map((d: any) => d.sjNo)
    ).toEqual([`${PO_NO}/01`, `${PO_NO}/02`, `${PO_NO}/03`, `${PO_NO}/04`]);
    expect(po().pickupFlow).toMatchObject({ soId: 'SO-1', capacity: 25, maxTrips: 4 });
    expect(w().saveDB).toHaveBeenCalled();
    expect(modal()).toBe('');
    // The PO detail shows its slots, ready for the trucks.
    expect(document.querySelector('#view-pickups h1')!.textContent).toBe(PO_NO);
    expect(view()).toContain(`${PO_NO}/04`);
    expect(view()).toContain('Siap');
  });

  it('lists running POs with quota progress and surat jalan usage', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 35, vehicle: 'B 1' });
    PV().openOrders();
    const row = document.querySelector('tr[data-action="pvOpenPO"][data-id="PO-1"]')!;
    expect(row.textContent).toContain('PT Arta');
    expect(row.textContent).toContain('35 / 100 Ton');
    expect(row.textContent).toContain('1 / 3');
    expect(row.textContent).toContain('2 siap');
    expect(row.textContent).toContain('Berjalan');
  });

  it('closes a PO past its cut-off when the list opens, saves and says so', () => {
    po().date = '2026-01-05';
    w().DB.salesOrders[0].date = '2026-01-05';
    openPO(); // cut-off 2026-01-31, already past
    PV().openOrders();
    expect(po().status).toBe('Closed');
    expect(po().closedReason).toBe('cutoff');
    expect(w().saveDB).toHaveBeenCalled();
    expect(w().showToast).toHaveBeenCalledWith(expect.stringContaining(PO_NO), 'warning');
    act('pvOrdersTab', 'done');
    expect(view()).toContain('Selesai · lewat batas pengambilan');
  });

  it('exports, prints, voids, closes and reopens from the PO detail', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 30, vehicle: 'B 1' });
    PV().openPO('PO-1');
    expect(view()).toContain('Diambil');

    act('pvExportPO', 'PO-1');
    expect(w().NSAXlsx.download).toHaveBeenCalledWith(`Surat Jalan ${PO_NO}`, [
      expect.objectContaining({ name: 'Surat Jalan' }),
    ]);
    expect(w().NSAXlsx.download.mock.calls[0][1][0].rows).toHaveLength(3);

    act('pvPrintSlot', slot(2).id);
    expect(w().printDocument).toHaveBeenCalledWith(
      'DO',
      expect.objectContaining({ number: `${PO_NO}/02`, poId: PO_NO, customer: 'PT Arta' })
    );

    act('voidPickupSlot', slot(3).id);
    setVal('pv-void-reason', 'Formulir rusak');
    act('voidPickupSlotConfirm', slot(3).id);
    expect(slot(3)).toMatchObject({ status: 'Cancelled', voidReason: 'Formulir rusak' });

    act('editPickupClose', 'PO-1');
    act('updatePickupClose', 'PO-1');
    expect(po()).toMatchObject({ status: 'Closed', closedReason: 'manual' });
    expect(slot(2).status).toBe('Cancelled');
    expect(view()).toContain('Selesai · ditutup manual');

    act('editPickupReopen', 'PO-1');
    expect(modal()).toContain('1 surat jalan');
    act('updatePickupReopen', 'PO-1');
    expect(po().status).toBe('Confirmed');
    expect(slot(2).status).toBe('Pending'); // voided by the close → back
    expect(slot(3).status).toBe('Cancelled'); // voided by hand → stays
  });
});

describe('Catat Pengambilan', () => {
  it('records a truck with live netto from bruto − tara and moves to the next surat jalan', () => {
    openPO();
    PV().openRecord();
    expect((document.getElementById('pv-rec-po') as HTMLSelectElement).value).toBe('PO-1');
    expect((document.getElementById('pv-rec-slot') as HTMLSelectElement).value).toBe(slot(1).id);
    expect((document.getElementById('pv-rec-date') as HTMLInputElement).value).toBe(TODAY);
    expect((document.getElementById('pv-rec-dest') as HTMLInputElement).value).toBe(
      'Jakarta Utara'
    );
    expect(view()).toContain('PT Arta');
    expect(view()).toContain('100 Ton dari 100');
    const photo = document.getElementById('pv-rec-photo')!;
    expect(photo.getAttribute('accept')).toBe('image/*');
    expect(photo.getAttribute('capture')).toBe('environment');

    setVal('pv-rec-vehicle', 'b 1234 xy');
    setVal('pv-rec-driver', 'Budi');
    setVal('pv-rec-gross', '47,5');
    setVal('pv-rec-tare', '12');
    expect(document.getElementById('pv-rec-netshow')!.textContent).toBe('35,5');
    expect((document.getElementById('pv-rec-net') as HTMLInputElement).readOnly).toBe(true);
    setVal('pv-rec-ticket', 'T-778');

    act('savePickupTrip');
    expect(slot(1)).toMatchObject({
      status: 'Delivered',
      vehicle: 'B 1234 XY',
      driver: 'Budi',
      ticketNo: 'T-778',
      date: TODAY,
    });
    expect(slot(1).weighing).toMatchObject({ gross: 47.5, tare: 12, net: 35.5 });
    expect(slot(1).destChanged).toBeUndefined();
    expect(w().saveDB).toHaveBeenCalled();
    expect(view()).toContain(`Tersimpan: ${PO_NO}/01`);
    expect((document.getElementById('pv-rec-slot') as HTMLSelectElement).value).toBe(slot(2).id);
    expect((document.getElementById('pv-rec-vehicle') as HTMLInputElement).value).toBe('');
  });

  it('asks before going over the quota, then records it and closes the full PO', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 35, vehicle: 'B 1' });
    T().recordTrip(slot(2).id, { date: TODAY, net: 35, vehicle: 'B 2' });
    PV().openRecord('PO-1');
    setVal('pv-rec-vehicle', 'B 3');
    setVal('pv-rec-net', '35');
    setVal('pv-rec-dest', 'Gudang Bekasi');

    act('savePickupTrip');
    expect(slot(3).status).toBe('Pending');
    expect(modal()).toContain('Melebihi kuota PO');
    expect(modal()).toContain('105 Ton');

    act('savePickupTripOver');
    expect(slot(3).status).toBe('Delivered');
    expect(slot(3)).toMatchObject({ destination: 'Gudang Bekasi', destChanged: true });
    expect(po()).toMatchObject({ status: 'Closed', closedReason: 'quota' });
    expect(w().showToast).toHaveBeenCalledWith(
      expect.stringContaining('Melebihi kuota'),
      'warning'
    );
    expect(view()).toContain('Belum ada PO pengambilan yang berjalan');
  });

  it('refuses a truck without a plate number', () => {
    openPO();
    PV().openRecord('PO-1');
    setVal('pv-rec-net', '30');
    act('savePickupTrip');
    expect(slot(1).status).toBe('Pending');
    expect(w().showToast).toHaveBeenCalledWith('Isi No. Polisi truk.', 'warning');
  });
});

describe('Impor Rekap Timbangan', () => {
  it('reads the weighbridge file made from the export and records the filled rows', async () => {
    openPO();
    const sheet = T().weighbridgeSheet(['PO-1']);
    const rows = sheet.rows.map((r: unknown[]) => r.slice());
    // Tanggal 7 · No Polisi 8 · Sopir 9 · Bruto 10 · Tara 11 · Netto 12
    Object.assign(rows[0], { 7: dmy(TODAY), 8: 'B 1234 XY', 9: 'Budi', 10: 47.5, 11: 12 });
    Object.assign(rows[1], { 7: dmy(TODAY), 8: 'B 9 Z', 12: '30' });
    const aoa = [
      sheet.columns.map((c: any) => c.header),
      ...rows,
      ['XX/99', '', '', '', '', '', '', dmy(TODAY), 'B 7', '', '', '', 20],
    ];

    PV().openRecapImport();
    expect(view()).toContain('No Polisi');
    expect(view()).toContain('Ekspor Excel untuk timbangan');
    expect(await PV().loadRecapFile(xlsxFile(aoa))).toBe(true);
    expect(view()).toContain('Baru dicatat');
    expect(view()).toContain('Tidak cocok');
    expect(view()).toContain('No. SJ tidak dikenal');
    expect(view()).toContain('1 surat jalan belum diisi beratnya');

    act('savePickupRecap');
    expect(slot(1).weighing).toMatchObject({ gross: 47.5, tare: 12, net: 35.5 });
    expect(slot(1)).toMatchObject({ date: TODAY, vehicle: 'B 1234 XY', driver: 'Budi' });
    expect(slot(2).weighing.net).toBe(30);
    expect(slot(3).status).toBe('Pending');
    // The file is named "rekap.xlsx": no "Rekap" prefix doubled in front of it.
    expect(slot(1).weighHistory[0].source).toBe(`rekap.xlsx ${TODAY}`);
    expect(w().saveDB).toHaveBeenCalled();
    expect(view()).toContain('Rekap diterapkan');
    expect(view()).toContain('2 pengambilan baru dicatat');
  });

  it('shows a changed weight on an invoiced trip in red, then raises the alert', async () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 30, vehicle: 'B 1234 XY' });
    const inv = T().createInvoice('sales', [slot(1).id], { date: TODAY }).invoice;
    const csv = `No SJ;Tanggal;No Polisi;Netto\n${slot(1).sjNo};${dmy(TODAY)};B 1234 XY;35\n`;

    PV().openRecapImport();
    expect(await PV().loadRecapFile(new File([csv], 'rekap.csv', { type: 'text/csv' }))).toBe(true);
    const row = document.querySelector('tr.pv-row-danger')!;
    expect(row.textContent).toContain('30 → 35 Ton');
    expect(row.textContent).toContain('Sudah ditagih');
    expect(row.textContent).toContain(inv.number);

    act('savePickupRecap');
    expect(slot(1).weightAlert).toMatchObject({ from: 30, to: 35, resolved: false });
    expect(slot(1).weighHistory.slice(-1)[0].source).toBe(`rekap.csv ${TODAY}`);
    expect(view()).toContain('perlu ditindaklanjuti');
  });

  it('names the change source after the file, with "Rekap" only when the name lacks it', async () => {
    openPO();
    const aoa = [
      ['No SJ', 'Tanggal', 'No Polisi', 'Netto'],
      [slot(1).sjNo, dmy(TODAY), 'B 1', 30],
    ];
    PV().openRecapImport();
    await PV().loadRecapFile(xlsxFile(aoa, 'timbangan minggu 1.xlsx'));
    act('savePickupRecap');
    expect(slot(1).weighHistory[0].source).toBe(`Rekap timbangan minggu 1.xlsx ${TODAY}`);

    aoa[1][3] = 35;
    PV().openRecapImport();
    await PV().loadRecapFile(xlsxFile(aoa, 'Rekap timbangan minggu 2.xlsx'));
    act('savePickupRecap');
    expect(slot(1).weighHistory.slice(-1)[0].source).toBe(`Rekap timbangan minggu 2.xlsx ${TODAY}`);
  });

  it('lists per-row errors when a filled row cannot be recorded', async () => {
    openPO();
    // The day after the PO's cut-off (end of this month).
    const cutoff = new Date(T().monthEnd(MONTH_START) + 'T00:00:00');
    const after = iso(new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate() + 1));
    const aoa = [
      ['No SJ', 'Tanggal', 'No Polisi', 'Netto'],
      [slot(1).sjNo, after, 'B 1', 30],
    ];
    PV().openRecapImport();
    await PV().loadRecapFile(xlsxFile(aoa));
    expect(view()).toContain('Lewat batas PO');
    act('savePickupRecap');
    expect(slot(1).status).toBe('Pending');
    expect(view()).toContain('Tidak diterapkan');
    expect(view()).toContain('Lewat batas PO');
  });
});

describe('Perubahan Timbangan', () => {
  it('lists open alerts with the invoice that used the old weight and resolves one with a note', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 30, vehicle: 'B 1' });
    const inv = T().createInvoice('sales', [slot(1).id], { date: TODAY }).invoice;
    T().updateWeight(slot(1).id, { net: 35 }, { source: 'Rekap minggu 2' });
    slot(1).ticketPhoto = 'data:image/jpeg;base64,AAAA';

    PV().openWeightChanges();
    expect(document.querySelectorAll('#view-pickups .pv-alert')).toHaveLength(1);
    const open = document.querySelector('#view-pickups .pv-alert')!;
    expect(open.textContent).toContain(slot(1).sjNo);
    expect(open.textContent).toContain('PT Arta');
    expect(open.textContent).toContain('30 → 35 Ton');
    expect(open.textContent).toContain(inv.number);
    expect(open.textContent).toContain('Rekap minggu 2');

    act('pvPhoto', slot(1).id);
    expect(document.querySelector('#modal img')!.getAttribute('src')).toBe(
      'data:image/jpeg;base64,AAAA'
    );
    w().closeModal();

    act('editPickupAlert', slot(1).id);
    act('updatePickupAlert', slot(1).id); // no note yet
    expect(T().openAlerts()).toHaveLength(1);
    (document.getElementById('pv-resolve-note') as HTMLTextAreaElement).value = 'Ditagih susulan';
    act('updatePickupAlert', slot(1).id);
    expect(T().openAlerts()).toHaveLength(0);
    expect(slot(1).weightAlert).toMatchObject({ resolved: true, note: 'Ditagih susulan' });
    expect(w().saveDB).toHaveBeenCalled();

    expect(view()).toContain('Tidak ada perubahan berat yang perlu ditindaklanjuti');
    expect(view()).toContain('Riwayat perubahan berat');
    expect(view()).toContain('Ditagih susulan');
  });
});

describe('Perubahan Timbangan — tagih selisih', () => {
  it('bills the difference to the customer and to the supplier from the alert', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 30, vehicle: 'B 1' });
    const si = T().createInvoice('sales', [slot(1).id], { date: TODAY }).invoice;
    T().createInvoice('purchases', [slot(1).id], { date: TODAY, supplierRef: 'S-1' });
    T().updateWeight(slot(1).id, { net: 35 }, { source: 'rekap' });

    PV().openWeightChanges();
    const card = () => document.querySelector('#view-pickups .pv-alert')!;
    expect(card().textContent).toContain('Selisih ke pelanggan');
    expect(card().textContent).toContain('+5 Ton belum ditagih');
    act('createPickupAdjust', slot(1).id); // the customer button comes first
    expect(modal()).toContain('Tagih selisih');
    expect(modal()).toContain(si.number);
    expect((document.getElementById('pv-adj-date') as HTMLInputElement).value).toBe(TODAY);
    setVal('pv-adj-date', MONTH_START);
    act('savePickupAdjust', slot(1).id);
    const follow = w().DB.salesInvoices.find((x: any) => x.adjustmentOf);
    expect(follow.lines[0].qty).toBe(5);
    expect(follow.date).toBe(MONTH_START);
    expect(modal()).toBe('');
    expect(card().textContent).toContain(follow.number);

    // Supplier side: the supplier's invoice number is required.
    const sup = document.querySelector('[data-action="createPickupAdjust"][data-side="purchases"]') as HTMLElement;
    sup.click();
    expect(modal()).toContain('No. faktur supplier');
    act('savePickupAdjust', slot(1).id);
    expect(w().DB.purchaseInvoices.filter((x: any) => x.adjustmentOf)).toHaveLength(0);
    setVal('pv-adj-ref', 'S-2');
    act('savePickupAdjust', slot(1).id);
    expect(w().DB.purchaseInvoices.filter((x: any) => x.adjustmentOf)).toHaveLength(1);
    expect(T().openAlerts()).toHaveLength(0);
    expect(view()).toContain('Tidak ada perubahan berat yang perlu ditindaklanjuti');
    expect(view()).toContain('Selisih ditagih susulan');
  });
});

describe('Koreksi berat', () => {
  it('corrects a typing error on a trip from the PO detail, with a reason and history', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, gross: 47.5, tare: 12.25, vehicle: 'B 1' });
    PV().openPO('PO-1');
    act('editPickupWeight', slot(1).id);
    expect(modal()).toContain('Koreksi berat');
    expect((document.getElementById('pv-fix-gross') as HTMLInputElement).value).toBe('47,5');

    setVal('pv-fix-gross', '47,25');
    act('updatePickupWeight', slot(1).id); // no reason yet
    expect(T().netOf(slot(1))).toBe(35.25);
    expect(w().showToast).toHaveBeenLastCalledWith('Isi alasan koreksi.', 'warning');

    setVal('pv-fix-note', 'Salah ketik bruto');
    act('updatePickupWeight', slot(1).id);
    expect(T().netOf(slot(1))).toBe(35);
    expect(slot(1).weighHistory.at(-1)).toMatchObject({
      source: 'manual',
      prevNet: 35.25,
      net: 35,
      note: 'Salah ketik bruto',
    });
    expect(slot(1).weightAlert).toBeUndefined(); // not billed: nothing to follow up
    expect(w().saveDB).toHaveBeenCalled();
  });

  it('on a billed trip keeps the invoice and raises a Perubahan Timbangan alert', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, net: 30, vehicle: 'B 1' });
    const inv = T().createInvoice('sales', [slot(1).id], { date: TODAY }).invoice;
    PV().openPO('PO-1');
    act('editPickupWeight', slot(1).id);
    expect(modal()).toContain('Sudah ditagih (' + inv.number + ')');
    setVal('pv-fix-gross', '');
    setVal('pv-fix-net', '32');
    setVal('pv-fix-note', 'Tiket asli 32 ton');
    act('updatePickupWeight', slot(1).id);
    expect(T().openAlerts()).toHaveLength(1);
    PV().openWeightChanges();
    const alert = document.querySelector('#view-pickups .pv-alert')!;
    expect(alert.textContent).toContain('30 → 32 Ton');
    expect(alert.textContent).toContain('Koreksi manual');
  });
});

describe('Rekap Pengambilan', () => {
  it('shows the period trips with totals and invoice status, exports and filters', () => {
    openPO();
    T().recordTrip(slot(1).id, { date: TODAY, gross: 47, tare: 12, vehicle: 'B 1', driver: 'Ali' });
    T().recordTrip(slot(2).id, { date: TODAY, net: 30, vehicle: 'B 2' });
    T().createInvoice('sales', [slot(1).id], { date: TODAY });

    PV().openTripRecap();
    expect((document.getElementById('pv-trip-from') as HTMLInputElement).value).toBe(MONTH_START);
    const rows = document.querySelectorAll('#view-pickups tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Ali');
    const foot = document.querySelector('#view-pickups tfoot')!.textContent;
    expect(foot).toContain('Total 2 truk');
    expect(foot).toContain('65 Ton');
    expect(view()).toContain('Belum'); // no supplier invoices yet

    act('pvTripExport');
    const [name, sheets] = w().NSAXlsx.download.mock.calls[0];
    expect(name).toContain('Rekap Pengambilan');
    expect(sheets[0].name).toBe('Rekap Pengambilan');
    expect(sheets[0].rows).toHaveLength(2);

    setVal('pv-trip-cust', 'C1', 'change');
    expect(document.querySelectorAll('#view-pickups tbody tr')).toHaveLength(2);
    setVal('pv-trip-from', '2099-01-01', 'change');
    expect(view()).toContain('Tidak ada pengambilan pada filter ini.');
    setVal('pv-trip-from', MONTH_START, 'change');
    setVal('pv-trip-cust', '', 'change');
  });
});

describe('shared page with the billing screens', () => {
  it('keeps an open billing page on re-render and leaves it from a pickup screen', () => {
    w()._pickupBilling.openCustomerBilling();
    expect(document.getElementById('pb-root')).toBeTruthy();
    w().navigate('pickups'); // e.g. the re-render after a refused save
    expect(document.getElementById('pb-root')).toBeTruthy();
    PV().openOrders();
    expect(document.getElementById('pb-root')).toBeNull();
    expect(view()).toContain('PO Pengambilan');
  });
});
