// ═══════════════════════════════════════════════════════════════════════════════
// One payment, two places (T-06): a payment can be logged on the SO/PO and as a
// receipt/payment on its invoice. Until one path is chosen, both dialogs show
// what the other path already holds and the combined remaining balance, and ask
// before saving more than that balance.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');
const CRUD = read('public/classic/core/erp-crud.js');
const INV = read('public/classic/core/invoice-view.js');

const body = (src: string, start: string) => {
  const at = src.indexOf(start);
  expect(at, start).toBeGreaterThan(-1);
  return src.slice(at, at + 6000);
};

describe('order payment log dialog', () => {
  const fn = body(CRUD, 'function showAddPayment(');

  it('shows payments already recorded on the order and on its invoice, with the combined balance', () => {
    expect(fn).toContain('Balances.orderBalance(');
    expect(fn).toContain('Dibayar lewat pesanan');
    expect(fn).toMatch(/di faktur/);
    expect(fn).toContain('Sisa tagihan');
  });

  it('asks before saving more than the remaining balance', () => {
    expect(fn).toMatch(/amount > ordBalance\.outstanding[\s\S]{0,80}confirmAsk\(/);
    expect(fn).toContain('belum dicatat di faktur');
  });
});

// Owner decision (docs/14 A1): payments are recorded per invoice. An order not
// invoiced yet offers Uang Muka instead of a payment log; logs recorded earlier
// still count in the balances above.
describe('payments per invoice (A1)', () => {
  const log = body(CRUD, 'function paymentLogHTML(');
  const SPE = read('public/classic/core/sales-purchase-extras.js');

  it('sends a new payment to the invoice, or to Uang Muka before there is one', () => {
    expect(log).toContain('data-action="settleInvoice"');
    expect(log).toContain('data-action="addOrderDP"');
    expect(log).toContain('Uang Muka');
    expect(log).not.toContain('data-action="addPayment"');
  });

  it('opens the down-payment dialog for that order and returns to it', () => {
    expect(body(CRUD, "case 'addOrderDP':")).toMatch(/addSalesDP[\s\S]{0,40}addPurchaseDP/);
    expect(SPE).toMatch(/addSalesDP: addSalesDPModal,\s*addPurchaseDP: addPurchaseDPModal/);
    expect(body(SPE, 'function addSalesDPModal(fromOrderId)')).toMatch(/fromOrderId[\s\S]{0,250}window\.viewSO\(orderId\)/);
    expect(body(SPE, 'function addPurchaseDPModal(fromOrderId)')).toMatch(/fromOrderId[\s\S]{0,250}window\.viewPO\(orderId\)/);
  });
});

describe('invoice receipt/payment dialog', () => {
  it('shows payments logged on the order and asks before overpaying', () => {
    expect(INV).toContain('Dibayar lewat pesanan');
    expect(INV).toMatch(/amount > bal\.outstanding[\s\S]{0,80}confirmAsk\(/);
  });
});
