// ═══════════════════════════════════════════════════════════════════════════════
// rbac.js — client-side RBAC safety net
//
// Loads the real classic script (indirect eval, like the bundle) against a
// stubbed saveDB and asserts the permission matrix + saveDB revert net:
//   • admin may mutate anything
//   • a read-only role's business mutation is reverted and the save skipped
//   • per-module gating (Penjualan can create sales, not delete them, not touch
//     purchases) and the headline case: a cashier cannot delete a journal
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const RBAC_SRC = readFileSync(resolve(__dirname, '../public/classic/core/rbac.js'), 'utf-8');

function freshDB() {
  return {
    salesOrders: [] as any[],
    purchaseOrders: [] as any[],
    inventoryItems: [] as any[],
    customers: [] as any[],
    journals: [] as any[],
    settings: {} as any,
  };
}

let persistedCount = 0;

function boot(role: string, db = freshDB()) {
  (window as any).DB = db;
  persistedCount = 0;
  (window as any).saveDB = () => {
    persistedCount++;
  };
  (window as any).showToast = vi.fn();
  (window as any).__ERP_USER = { role, active: true, uid: 'u1', email: `${role}@nsa.local` };
  // eslint-disable-next-line no-eval -- intentionally executing the real classic script in global scope
  (0, eval)(RBAC_SRC);
  return db;
}

describe('permission matrix', () => {
  it('exposes can()/canView() consistent with the role', () => {
    boot('penjualan');
    expect((window as any).RBAC.can('create', 'sales')).toBe(true);
    expect((window as any).RBAC.can('delete', 'sales')).toBe(false);
    expect((window as any).RBAC.can('create', 'purchases')).toBe(false);
    expect((window as any).RBAC.canView('purchases')).toBe(true);
    expect((window as any).RBAC.can('edit', 'gl')).toBe(false);

    boot('admin');
    expect((window as any).RBAC.isAdmin()).toBe(true);
    expect((window as any).RBAC.can('delete', 'gl')).toBe(true);
    expect((window as any).RBAC.canManageUsers()).toBe(true);
  });

  it('treats an inactive account as pending (no writes)', () => {
    boot('manajer');
    (window as any).__ERP_USER.active = false;
    expect((window as any).RBAC.currentRole()).toBe('pending');
    expect((window as any).RBAC.can('create', 'sales')).toBe(false);
  });
});

describe('saveDB safety net', () => {
  it('lets an admin mutate anything', () => {
    const db = boot('admin');
    db.salesOrders.push({ id: 'SO-1', date: '2026-06-01' });
    window.saveDB();
    expect(persistedCount).toBe(1);
    expect(db.salesOrders).toHaveLength(1);
  });

  it('reverts a viewer business create and skips the save', () => {
    const db = boot('viewer');
    db.customers.push({ id: 'C-1', name: 'X' });
    window.saveDB();
    expect(persistedCount).toBe(0);
    expect(db.customers).toHaveLength(0);
    expect((window as any).showToast).toHaveBeenCalled();
  });

  it('lets Penjualan create a sales order but reverts a delete', () => {
    const db = boot('penjualan');
    db.salesOrders.push({ id: 'SO-1', date: '2026-06-01' });
    window.saveDB();
    expect(persistedCount).toBe(1);

    db.salesOrders.length = 0; // attempt delete
    window.saveDB();
    expect(persistedCount).toBe(1); // save skipped
    expect(db.salesOrders).toHaveLength(1); // restored
  });

  it('reverts a Penjualan write to the purchases module', () => {
    const db = boot('penjualan');
    db.purchaseOrders.push({ id: 'PO-1', date: '2026-06-01' });
    window.saveDB();
    expect(persistedCount).toBe(0);
    expect(db.purchaseOrders).toHaveLength(0);
  });

  it('blocks a cashier (Penjualan) from deleting a journal', () => {
    const db = boot('penjualan');
    db.journals.push({ id: 'JV-1', source: 'manual', lines: [] });
    (window as any).RBAC.refreshSnapshot();

    db.journals.length = 0; // delete the manual journal
    window.saveDB();
    expect(persistedCount).toBe(0);
    expect(db.journals).toHaveLength(1); // restored
    expect((window as any).showToast).toHaveBeenCalled();
  });

  it('exempts auto journals (GL side-effects) from the net for allowed sales', () => {
    const db = boot('penjualan');
    // A legitimate sales order whose save also auto-posts a derived journal.
    db.salesOrders.push({ id: 'SO-9', date: '2026-06-01' });
    db.journals.push({ id: 'J-auto', source: 'SO', lines: [] });
    window.saveDB();
    expect(persistedCount).toBe(1); // not blocked by the auto journal
    expect(db.salesOrders).toHaveLength(1);
  });

  it('lets a Manajer create a journal but reverts a journal delete (GL no-delete)', () => {
    const db = boot('manajer');
    db.journals.push({ id: 'JV-2', source: 'manual', lines: [] });
    window.saveDB();
    expect(persistedCount).toBe(1);

    db.journals.length = 0;
    window.saveDB();
    expect(persistedCount).toBe(1); // delete skipped
    expect(db.journals).toHaveLength(1); // restored
  });
});
