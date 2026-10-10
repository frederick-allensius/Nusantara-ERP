// ═══════════════════════════════════════════════════════════════════════════════
// Kotak Masuk Rekap (recap-inbox.js) — the simulated e-mail recap check:
//   • "Periksa email" builds an e-mail from the open pickup PO: a recap .xlsx read
//     back through the Impor Rekap Timbangan reader, and ticket photos with their
//     reading
//   • photo vs Excel vs recorded, per surat jalan; differences wait for a choice
//   • recording goes through Trading (trips, weight history, alerts)
//   • the reply to the supplier lists what is still open
//   • the inbox lives in this browser only, never in DB
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from '@e965/xlsx';

const w = () => window as any;
const T = () => w().Trading;
const RI = () => w()._recapInbox;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const back = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const PO_DATE = back(9);
const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };

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
  await import('../public/classic/core/recap-inbox.js');

  w().XLSX = XLSX;
  w().saveDB = vi.fn();
  w().showToast = vi.fn();
  w().invalidateView = () => {};
  // Reduced motion: the "reading" steps finish at once.
  w().matchMedia = () => ({ matches: true });
  w().navigate = (id: string) => {
    const el = document.getElementById('view-' + id);
    if (el) {
      el.innerHTML = w().renderPickups();
    }
  };
  w().openModal = (title: string, body: string, footer: string) => {
    const m = document.getElementById('modal')!;
    m.innerHTML = `<h2></h2><div class="modal-body">${body}</div><div class="modal-footer">${footer || ''}</div>`;
    m.querySelector('h2')!.textContent = title;
  };
  w().closeModal = () => {
    document.getElementById('modal')!.innerHTML = '';
  };
});

function seed() {
  w().DB = {
    customers: [{ id: 'C1', name: 'PT Arta', termDays: 30 }],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30, email: 'timbangan@batualam.test' }],
    inventoryItems: [{ id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0, cost: 100000 }],
    salesOrders: [
      {
        id: 'SO-1',
        number: 'SOA.0001',
        customer: 'PT Arta',
        customerId: 'C1',
        date: PO_DATE,
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 300, price: 150000, lineDiscount: 0, subtotal: 45000000 }],
      },
    ],
    purchaseOrders: [
      {
        id: 'PO-1',
        number: 'POA.0001',
        supplier: 'PT Batu Alam',
        supplierId: 'S1',
        date: PO_DATE,
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 300, price: 100000, lineDiscount: 0, subtotal: 30000000 }],
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
    settings: { company: { name: 'PT Contoh Dagang', email: 'admin@contoh.test' } },
  };
  expect(T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 }).error).toBeUndefined();
}

const slot = (n: number) => T().slotsFor('PO-1')[n - 1];
const view = () => document.getElementById('view-pickups')!.textContent || '';
function act(action: string, id?: string) {
  const sel = id ? `[data-action="${action}"][data-id="${id}"]` : `[data-action="${action}"]`;
  const el = document.querySelector(sel) as HTMLElement | null;
  expect(el, sel).toBeTruthy();
  el!.click();
}
function choose(sjNo: string, value: string) {
  const el = document.querySelector(`.ri-choice[data-key="${sjNo}"]`) as HTMLSelectElement;
  expect(el, sjNo).toBeTruthy();
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = '<div id="view-pickups" class="view"></div><div id="modal"></div>';
  localStorage.clear();
  RI()._state.emails.length = 0;
  RI()._state.openId = null;
  RI()._state.seq = 0;
  w().confirmAsk = vi.fn(async () => true);
  seed();
});

describe('Kotak Masuk Rekap', () => {
  it('receives a recap e-mail whose Excel and photos agree, and records the trips', async () => {
    RI().open();
    expect(view()).toContain('Kotak Masuk Rekap');
    expect(view()).toContain('Simulasi');
    expect(view()).toContain('rekap.timbangan@contoh.test');
    act('riCheck');
    const email = RI()._state.emails[0];
    expect(email.kind).toBe('clean');
    expect(email.fromEmail).toBe('timbangan@batualam.test');
    expect(email.fileName).toMatch(/\.xlsx$/);
    expect(view()).toContain('Baru');

    act('riOpen', email.id);
    const rows = RI()._compare(email);
    expect(rows).toHaveLength(3);
    expect(rows.map((r: any) => r.status)).toEqual(['match', 'match', 'match']);
    // The Excel went through the recap reader: same SJ numbers as the slots.
    expect(rows.map((r: any) => r.sjNo)).toEqual([slot(1).sjNo, slot(2).sjNo, slot(3).sjNo]);
    expect(view()).toContain('Pemeriksaan otomatis');
    expect(view()).toContain('Catat 3 pengambilan');

    act('saveRecapEmail', email.id);
    await flush();
    expect(w().confirmAsk).toHaveBeenCalled();
    [1, 2, 3].forEach(n => {
      const d = slot(n);
      expect(d.status).toBe('Delivered');
      expect(T().netOf(d)).toBeCloseTo(email.rows[n - 1].net, 3);
      expect(d.weighHistory.at(-1).source).toBe('Email ' + email.fileName);
    });
    expect(w().saveDB).toHaveBeenCalled();
    expect(
      RI()
        ._compare(email)
        .map((r: any) => r.status)
    ).toEqual(['applied', 'applied', 'applied']);
    expect(view()).toContain('Selesai');
    expect(view()).toContain('3 pengambilan baru');
  });

  it('holds what differs: a changed old weight, a typo in the recap, an unclear photo, a missing photo', async () => {
    // Two trips already recorded, the first one invoiced.
    T().recordTrip(slot(1).id, {
      date: back(3),
      gross: 47,
      tare: 12,
      vehicle: 'B 1 AB',
      driver: 'Asep',
    });
    T().recordTrip(slot(2).id, {
      date: back(2),
      gross: 46,
      tare: 12,
      vehicle: 'B 2 AB',
      driver: 'Dedi',
    });
    T().createInvoice('sales', [slot(1).id], { date: back(1) });

    RI().open();
    act('riCheck'); // first e-mail is the clean one
    act('riCheck');
    const email = RI()._state.emails[1];
    expect(email.kind).toBe('issues');
    act('riOpen', email.id);
    const by = (rows: any[]) => Object.fromEntries(rows.map(r => [r.sjNo, r]));
    let rows = by(RI()._compare(email));
    expect(rows[slot(1).sjNo].status).toBe('excelChanged');
    expect(rows[slot(1).sjNo].invoiced).toBe(true);
    expect(rows[slot(1).sjNo].choice).toBe('keep'); // the photo agrees with what was billed
    expect(rows[slot(2).sjNo].status).toBe('same');
    const statuses = Object.values(rows).map((r: any) => r.status);
    expect(statuses).toEqual(expect.arrayContaining(['match', 'conflict', 'unclear', 'noPhoto']));
    expect(view()).toContain('Perlu keputusan');
    expect(view()).toContain('Berat lama diubah');

    // Only the matching trip is ready until choices are made.
    expect(view()).toContain('Catat 1 pengambilan');
    const conflict = Object.values(rows).find((r: any) => r.status === 'conflict') as any;
    const unclear = Object.values(rows).find((r: any) => r.status === 'unclear') as any;
    const missing = Object.values(rows).find((r: any) => r.status === 'noPhoto') as any;
    expect(conflict.excel.net).toBeCloseTo(conflict.photo.read.net + 3, 3);
    expect(unclear.photo.conf.net).toBeLessThan(0.8);
    choose(conflict.sjNo, 'photo');
    choose(unclear.sjNo, 'excel');
    choose(missing.sjNo, 'hold');
    choose(slot(1).sjNo, 'excel'); // accept the supplier's new figure on the billed trip
    expect(view()).toContain('Catat 4 pengambilan');

    act('saveRecapEmail', email.id);
    await flush();
    const tripOf = (sj: string) =>
      T()
        .slotsFor('PO-1')
        .find((d: any) => d.sjNo === sj);
    expect(T().netOf(tripOf(conflict.sjNo))).toBeCloseTo(conflict.photo.read.net, 3);
    expect(T().netOf(tripOf(unclear.sjNo))).toBeCloseTo(unclear.excel.net, 3);
    expect(tripOf(missing.sjNo).status).toBe('Pending');
    // The billed trip changed: the invoice stays, an alert waits in Perubahan Timbangan.
    expect(T().netOf(slot(1))).toBeCloseTo(40, 3);
    expect(slot(1).weightAlert).toMatchObject({ from: 35, to: 40, resolved: false });
    expect(T().openAlerts()).toHaveLength(1);

    rows = by(RI()._compare(email));
    expect(rows[missing.sjNo].status).toBe('noPhoto');
    act('riReply', email.id);
    const body = (document.getElementById('ri-reply-body') as HTMLTextAreaElement).value;
    expect(body).toContain(`${conflict.sjNo}`);
    expect(body).toContain('sesuai foto DO');
    expect(body).toContain(`${missing.sjNo}`);
    expect(body).toContain('belum ada foto DO');
    expect(body).toContain('PT Contoh Dagang');
    act('riSendReply', email.id);
    expect(email.replies).toHaveLength(1);
    expect(view()).toContain('Balasan ke supplier (simulasi)');
  });

  it('keeps the inbox in this browser only and counts what still needs someone', () => {
    RI().open();
    act('riCheck');
    expect(RI().waiting()).toBe(1); // unopened
    const stored = JSON.parse(localStorage.getItem('nsa.recapInbox.v1')!);
    expect(stored.emails).toHaveLength(1);
    expect(stored.emails[0].photos[0].url).toBeUndefined(); // photos are redrawn, not stored
    expect(Object.keys(w().DB).some(k => /inbox|recap/i.test(k))).toBe(false);
  });

  it('says there is no new e-mail when no pickup PO has a surat jalan left', () => {
    T()
      .slotsFor('PO-1')
      .forEach((d: any) => T().voidSlot(d.id, 'tes'));
    RI().open();
    act('riCheck');
    expect(RI()._state.emails).toHaveLength(0);
    expect(w().showToast).toHaveBeenCalledWith(
      expect.stringContaining('Tidak ada email baru'),
      'info'
    );
  });

  it('is a step of the Pengambilan flow in the menu', () => {
    const nav = readFileSync(resolve(__dirname, '../public/classic/ui/nav.js'), 'utf8');
    const router = readFileSync(
      resolve(__dirname, '../public/classic/core/menu-router.js'),
      'utf8'
    );
    expect(nav).toMatch(/label: 'Kotak Masuk Rekap', view: 'pickups', step: true/);
    expect(router).toContain("'Kotak Masuk Rekap': ['_recapInbox', 'open']");
  });
});
