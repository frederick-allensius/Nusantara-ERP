// ═══════════════════════════════════════════════════════════════════════════════
// Billing from pickups (pickup-billing.js) — driven through the page like a user:
//   • Tagih Pelanggan lists customers with trips not yet invoiced; a customer's
//     trips in a period become one sales invoice (one line per truck)
//   • Tagihan Supplier compares the supplier's bill with our trips (tonnage,
//     price, newer Harga Supplier), corrects trip prices with history, and saves
//     the purchase invoice with the supplier's invoice number
//   • cancelling an invoice made from trips frees them (invoice-view.js)
//   • the invoice detail and print list the trucks
//   • the ledger stays balanced and inventory nets to zero
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const w = () => window as any;
const actions = new Map<string, (id?: string, type?: string, val?: string) => unknown>();

beforeAll(async () => {
  w().ERP = {
    registerAction: (name: string, fn: (id?: string, type?: string, val?: string) => unknown) =>
      actions.set(name, fn),
  };
  await import('../src/core/helpers.js');
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/warehouse.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
  await import('../public/classic/core/balances.js');
  await import('../public/classic/core/trading.js');
  await import('../public/classic/core/xlsx-export.js');
  await import('../public/classic/core/pickup-billing.js');
  await import('../public/classic/core/invoice-view.js');

  // The invoice print template lives in erp-crud.js (a classic script with
  // top-level functions); evaluate just the print helpers in global scope.
  const crud = readFileSync(resolve(__dirname, '../public/classic/core/erp-crud.js'), 'utf-8');
  const start = crud.indexOf('function _companyLetterhead');
  const end = crud.indexOf('// ── Pesanan Penjualan (Sales Order)');
  // eslint-disable-next-line no-eval -- intentionally executing the real classic code in global scope
  (0, eval)(crud.slice(start, end) + '\nwindow.buildInvoiceDoc = buildInvoiceDoc;');
});

const ITEM = { itemId: '1', itemName: 'Batu Split 1-2', unit: 'Ton' };

function seed() {
  w().DB = {
    customers: [
      { id: 'C1', name: 'PT Arta', address: 'Jakarta Utara', termDays: 30 },
      { id: 'C2', name: 'PT Beta', termDays: 30 },
    ],
    suppliers: [{ id: 'S1', name: 'PT Batu Alam', termDays: 30 }],
    inventoryItems: [
      { id: '1', name: 'Batu Split 1-2', unit: 'Ton', stock: 0, cost: 100000, sell: 150000 },
    ],
    salesOrders: [
      {
        id: 'SO-1',
        number: 'SO.2026.09.00001',
        customer: 'PT Arta',
        customerId: 'C1',
        date: '2026-09-01',
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 100, price: 150000, lineDiscount: 0, subtotal: 15000000 }],
      },
    ],
    purchaseOrders: [
      {
        id: 'PO-1',
        number: 'PO.2026.09.00001',
        supplier: 'PT Batu Alam',
        supplierId: 'S1',
        date: '2026-09-01',
        status: 'Confirmed',
        taxRate: 0.11,
        lines: [{ ...ITEM, qty: 100, price: 100000, lineDiscount: 0, subtotal: 10000000 }],
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

const T = () => w().Trading;
const slot = (n: number) => T().slotsFor('PO-1')[n - 1];
const trip = (n: number, date: string, net: number, extra: any = {}) =>
  T().recordTrip(slot(n).id, { date, net, vehicle: 'B 1234 XY', ...extra });

const page = () => document.getElementById('view-pickups')!;
const el = <E extends Element = HTMLElement>(sel: string) => page().querySelector(sel) as E | null;
function click(sel: string) {
  const b = el<HTMLElement>(sel);
  expect(b, sel).toBeTruthy();
  b!.click();
}
function setField(id: string, value: string, type: 'change' | 'input' = 'change') {
  const f = document.getElementById(id) as HTMLInputElement;
  expect(f, id).toBeTruthy();
  f.value = value;
  f.dispatchEvent(new Event(type, { bubbles: true }));
}
// Currency uses a non-breaking space after "Rp"; compare as plain spaces.
const text = () => (page().textContent || '').replace(/\u00a0/g, ' ');
const rows = () => Array.from(page().querySelectorAll('tbody tr'));

function ledger() {
  w().GL.reconcileAll();
  const tb = w().GL.trialBalance();
  const bal = (no: string) => {
    const r = tb.rows.find((x: any) => x.no === no);
    return r ? r.debit - r.credit : 0;
  };
  return { tb, bal };
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  // "Today" is fixed so the default and quick periods are predictable.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T09:00:00'));
  seed();
  document.body.innerHTML = '<div id="view-pickups" class="view"></div>';
  w().saveDB = vi.fn(() => w().GL.reconcileAll());
  w().showToast = vi.fn();
  w().navigate = vi.fn();
  w().invalidateView = vi.fn();
  w().openModal = vi.fn();
  w().closeModal = vi.fn();
  w().confirm = vi.fn(() => true);
  T().openPickupPO('PO-1', { soId: 'SO-1', capacity: 35 });
  trip(1, '2026-09-03', 35);
  trip(2, '2026-09-08', 30);
});

describe('Tagih Pelanggan', () => {
  it('lists customers with unbilled trips: trucks, tonnage, value incl. PPN, oldest trip', () => {
    w()._pickupBilling.openCustomerBilling();
    expect(w().navigate).toHaveBeenCalledWith('pickups');
    const t = text();
    expect(t).toContain('Tagih Pelanggan');
    expect(t).toContain('PT Arta');
    expect(t).toContain('65'); // tonnage
    expect(t).toContain('Rp 10.822.500'); // 5.827.500 + 4.995.000
    expect(t).toContain('03 Sep 2026');
    expect(t).toContain('Belum ada'); // no invoice yet
  });

  it('bills the trips of a period as one invoice and suggests the next period', () => {
    w()._pickupBilling.openCustomerBilling();
    click('button[data-action="pbParty"][data-id="C1"]');
    setField('pb-from', '2026-09-01');
    setField('pb-to', '2026-09-07');
    expect(rows()).toHaveLength(1);
    expect(text()).toContain(slot(1).sjNo);
    expect(text()).toContain('Rp 577.500'); // PPN of 35 t × 150.000
    setField('pb-inv-date', '2026-09-07', 'input');
    click('[data-action="pbIssue"]');

    const invs = w().DB.salesInvoices;
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({
      date: '2026-09-07',
      customerId: 'C1',
      doIds: [slot(1).id],
      amount: 5827500,
      periodTo: '2026-09-03',
    });
    expect(slot(1).status).toBe('Invoiced');
    expect(w().saveDB).toHaveBeenCalled();
    expect(text()).toContain(invs[0].number);
    expect(el('[data-action="pbOpenInv"]')).toBeTruthy();
    expect(el('[data-action="pbPrintInv"]')).toBeTruthy();

    // Back to the overview, the customer's last invoice shows; billing again
    // starts the day after the last invoiced period.
    click('[data-action="pbBack"]');
    expect(text()).toContain(invs[0].number);
    click('button[data-action="pbParty"][data-id="C1"]');
    expect((document.getElementById('pb-from') as HTMLInputElement).value).toBe('2026-09-04');
  });

  it('defaults to the last 7 days and offers quick periods', () => {
    w()._pickupBilling.openCustomerBilling();
    click('button[data-action="pbParty"][data-id="C1"]');
    const from = () => (document.getElementById('pb-from') as HTMLInputElement).value;
    const to = () => (document.getElementById('pb-to') as HTMLInputElement).value;
    expect([from(), to()]).toEqual(['2026-09-09', '2026-09-15']);
    expect(rows()).toHaveLength(0);
    expect(text()).toContain('2 pengambilan belum ditagih sebelum 09 Sep 2026');
    click('[data-action="pbQuick"][data-val="month"]');
    expect([from(), to()]).toEqual(['2026-09-01', '2026-09-15']);
    expect(rows()).toHaveLength(2);
    click('[data-action="pbQuick"][data-val="week"]'); // Tuesday 15 Sep → from Monday 14 Sep
    expect(from()).toBe('2026-09-14');
    click('[data-action="pbFromOldest"]');
    expect(from()).toBe('2026-09-03');
  });

  it('bills only the ticked trucks; all are ticked by default', () => {
    w()._pickupBilling.openCustomerBilling();
    click('button[data-action="pbParty"][data-id="C1"]');
    setField('pb-from', '2026-09-01');
    setField('pb-to', '2026-09-30');
    const checks = page().querySelectorAll<HTMLInputElement>('.pb-check');
    expect(checks).toHaveLength(2);
    expect(Array.from(checks).every(c => c.checked)).toBe(true);
    const second = page().querySelector<HTMLInputElement>(`.pb-check[data-trip="${slot(2).id}"]`)!;
    second.checked = false;
    second.dispatchEvent(new Event('change', { bubbles: true }));
    expect(text()).toContain('1 dari 2');
    click('[data-action="pbIssue"]');
    expect(w().DB.salesInvoices[0].doIds).toEqual([slot(1).id]);
    expect(
      T()
        .unbilled('sales')
        .map((d: any) => d.id)
    ).toEqual([slot(2).id]);
    // The remaining truck can be billed later on its own invoice.
    click('[data-action="pbIssue"]');
    expect(w().DB.salesInvoices).toHaveLength(2);
    expect(T().unbilled('sales')).toHaveLength(0);
    const { tb } = ledger();
    expect(tb.balanced).toBe(true);
  });

  it('flags open weight alerts and POs also picked up for another customer', () => {
    // Supplier invoice covers trip 2, then its weight changes → open alert.
    T().createInvoice('purchases', [slot(2).id], { date: '2026-09-09' });
    T().updateWeight(slot(2).id, { net: 32 }, { source: 'rekap' });
    // A third truck of the same PO went to another customer.
    trip(3, '2026-09-10', 20);
    Object.assign(slot(3), { customerId: 'C2', customer: 'PT Beta' });

    w()._pickupBilling.openCustomerBilling();
    expect(text()).toContain('1 timbangan berubah');
    click('button[data-action="pbParty"][data-id="C1"]');
    setField('pb-from', '2026-09-01');
    setField('pb-to', '2026-09-30');
    expect(text()).toContain('Timbangan berubah');
    expect(text()).toContain('perubahan timbangan yang belum diselesaikan');
    expect(text()).toContain('juga diambil untuk PT Beta');
  });

  it('exports the selected trucks as a recap for the customer', () => {
    const dl = vi.spyOn(w().NSAXlsx, 'download').mockImplementation(() => {});
    w()._pickupBilling.openCustomerBilling();
    click('button[data-action="pbParty"][data-id="C1"]');
    setField('pb-from', '2026-09-01');
    setField('pb-to', '2026-09-30');
    click('[data-action="pbExport"]');
    expect(dl).toHaveBeenCalledTimes(1);
    const [file, sheets] = dl.mock.calls[0] as [string, any[]];
    expect(file).toBe('Rekap pengambilan PT Arta 2026-09-01 sd 2026-09-30.xlsx');
    expect(sheets[0].name).toBe('Rekap Pengambilan');
    expect(sheets[0].rows.map((r: any[]) => r[1])).toEqual([slot(1).sjNo, slot(2).sjNo]);
    dl.mockRestore();
  });
});

describe('Tagihan Supplier', () => {
  function openS1() {
    w()._pickupBilling.openSupplierBilling();
    click('button[data-action="pbParty"][data-id="S1"]');
    setField('pb-from', '2026-09-01');
    setField('pb-to', '2026-09-30');
  }

  it('compares the billed tonnage and price with our trips', () => {
    openS1();
    expect(rows()).toHaveLength(2);
    setField('pb-qty', '70', 'input');
    setField('pb-price', '105000', 'input');
    const t = text();
    expect(t).toContain('+5'); // 70 billed vs 65 picked up
    expect(t).toContain('Tonase berbeda');
    expect(page().querySelectorAll('.badge-warning')).toHaveLength(2); // price differs on both
    expect(el('#pb-reason')).toBeTruthy();
  });

  it('flags trips priced from the PO while a newer Harga Supplier exists and applies it with history', () => {
    w().DB.supplierPrices.push({
      supplierId: 'S1',
      itemId: '1',
      price: 105000,
      effectiveDate: '2026-09-05',
    });
    openS1();
    expect(text()).toContain('Harga Supplier 05 Sep 2026');
    expect(text()).toContain('belum memakai Harga Supplier');
    click('[data-action="pbUseSupplierPrice"]');
    expect(slot(1).purchasePrice).toBe(100000); // trip before the new price
    expect(slot(2).purchasePrice).toBe(105000);
    expect(slot(2).purchasePriceSource).toBe('supplierPrice');
    expect(slot(2).priceHistory).toMatchObject([
      { from: 100000, to: 105000, note: 'Harga Supplier per 2026-09-05' },
    ]);
    expect(w().saveDB).toHaveBeenCalled();
    expect(text()).not.toContain('belum memakai Harga Supplier');
  });

  it('corrects the price of the selected trips, then saves the purchase invoice with the supplier number', () => {
    openS1();
    setField('pb-ref', 'INV/BA/0912', 'input');
    setField('pb-date', '2026-09-12', 'input');
    setField('pb-qty', '65', 'input');
    setField('pb-price', '104000', 'input');
    // The new price field defaults to the billed price.
    expect((document.getElementById('pb-new-price') as HTMLInputElement).value).toBe('104000');
    setField('pb-new-note', 'Kabar harga baru 1 Sep', 'input');
    click('[data-action="pbApplyPrice"]');
    for (const n of [1, 2]) {
      expect(slot(n).purchasePrice).toBe(104000);
      expect(slot(n).purchasePriceSource).toBe('manual');
      expect(slot(n).priceHistory).toMatchObject([
        { from: 100000, to: 104000, note: 'Kabar harga baru 1 Sep' },
      ]);
    }
    expect(page().querySelectorAll('.badge-warning')).toHaveLength(0);

    click('[data-action="pbIssue"]');
    const pi = w().DB.purchaseInvoices[0];
    expect(pi).toMatchObject({
      date: '2026-09-12',
      supplierId: 'S1',
      supplierRef: 'INV/BA/0912',
      doIds: [slot(1).id, slot(2).id],
      amount: Math.round(65 * 104000 * 1.11),
      supplierBill: { qty: 65, price: 104000, qtyDiff: 0 },
    });
    expect(pi.lines.map((l: any) => l.price)).toEqual([104000, 104000]);
    expect(T().unbilled('purchases')).toHaveLength(0);
    expect(text()).toContain(pi.number);

    // The same supplier invoice number cannot be recorded twice.
    trip(3, '2026-09-11', 20);
    openS1();
    setField('pb-ref', 'inv/ba/0912', 'input');
    setField('pb-qty', '20', 'input');
    click('[data-action="pbIssue"]');
    expect(w().DB.purchaseInvoices).toHaveLength(1);
    expect(w().showToast).toHaveBeenLastCalledWith(
      expect.stringContaining('sudah dicatat'),
      'danger'
    );

    const { tb, bal } = ledger();
    expect(tb.balanced).toBe(true);
    expect(bal('110401')).toBe(0); // inventory nets to zero per trip
    expect(bal('510101')).toBe(65 * 104000 + 20 * 100000); // cost at the corrected prices
  });

  it('requires a reason and a confirmation to save with a tonnage difference', () => {
    openS1();
    setField('pb-ref', 'TAG-77', 'input');
    setField('pb-qty', '70', 'input');
    click('[data-action="pbIssue"]');
    expect(w().DB.purchaseInvoices).toHaveLength(0);
    expect(w().showToast).toHaveBeenLastCalledWith(expect.stringContaining('alasan'), 'warning');

    setField('pb-reason', 'Truk 08/09 ditimbang ulang supplier', 'input');
    w().confirm.mockReturnValueOnce(false);
    click('[data-action="pbIssue"]');
    expect(w().DB.purchaseInvoices).toHaveLength(0);

    click('[data-action="pbIssue"]');
    const pi = w().DB.purchaseInvoices[0];
    expect(w().confirm).toHaveBeenLastCalledWith(expect.stringContaining('selisih +5 ton'));
    expect(pi.supplierRef).toBe('TAG-77');
    expect(pi.supplierBill).toMatchObject({ qty: 70, ourQty: 65, qtyDiff: 5 });
    expect(pi.note).toContain('Alasan: Truk 08/09 ditimbang ulang supplier');
    expect(pi.amount).toBe(Math.round(6500000 * 1.11)); // recorded at our trips
  });
});

describe('invoices made from trips (invoice-view.js, print)', () => {
  it('cancelling a sales invoice frees its trips and hands the sale back to them', () => {
    const { invoice } = T().createInvoice('sales', [slot(1).id, slot(2).id], {
      date: '2026-09-09',
    });
    expect(T().unbilled('sales')).toHaveLength(0);
    actions.get('invCancel')!(invoice.id, 'SI');
    expect(invoice.status).toBe('Cancelled');
    expect(slot(1).status).toBe('Delivered');
    expect(slot(2).status).toBe('Delivered');
    expect(T().unbilled('sales')).toHaveLength(2);
    expect(w().confirm).toHaveBeenCalledWith(
      expect.stringContaining('2 pengambilan kembali menjadi belum ditagih')
    );
    const { tb, bal } = ledger();
    expect(tb.balanced).toBe(true);
    expect(-bal('400001')).toBe(9750000); // sales posted once, from the trips
    // The freed trips can be billed again.
    expect(T().createInvoice('sales', [slot(1).id], { date: '2026-09-10' }).error).toBeUndefined();
  });

  it('cancelling a purchase invoice puts its trips back on the supplier side', () => {
    const { invoice } = T().createInvoice('purchases', [slot(1).id, slot(2).id], {
      date: '2026-09-10',
      supplierRef: 'X-1',
    });
    actions.get('invCancel')!(invoice.id, 'PI');
    expect(invoice.status).toBe('Cancelled');
    expect(T().unbilled('purchases')).toHaveLength(2);
    const { tb, bal } = ledger();
    expect(tb.balanced).toBe(true);
    expect(bal('110401')).toBe(0);
  });

  it('shows the trucks and the supplier invoice number in the invoice detail', () => {
    const { invoice } = T().createInvoice('purchases', [slot(1).id, slot(2).id], {
      date: '2026-09-10',
      supplierRef: 'INV-55',
    });
    actions.get('invView')!(invoice.id, 'PI');
    const body = String(w().openModal.mock.calls[0][1]);
    expect(body).toContain('Dari pengambilan');
    expect(body).toContain('2 truk, periode 03 Sep 2026 – 08 Sep 2026');
    expect(body).toContain(`${slot(1).sjNo}, ${slot(2).sjNo}`);
    expect(body).toContain('INV-55');
  });

  it('prints each truck (SJ · date · truck) under the item on the invoice', () => {
    const { invoice } = T().createInvoice('sales', [slot(1).id, slot(2).id], {
      date: '2026-09-09',
    });
    const html = w().buildInvoiceDoc('SI', invoice);
    expect(html).toContain(`${slot(1).sjNo} · 2026-09-03 · B 1234 XY`);
    expect(html.match(/class="inv-label inv-ln"/g)).toHaveLength(2);
  });
});

describe('empty data', () => {
  it('both pages render with nothing to bill', () => {
    seed();
    w()._pickupBilling.openCustomerBilling();
    expect(text()).toContain('Semua pengambilan sudah ditagih');
    w()._pickupBilling.openSupplierBilling();
    expect(text()).toContain('Tagihan Supplier');
    expect(text()).toContain('Semua pengambilan sudah tercatat');
  });
});
