// ═══════════════════════════════════════════════════════════════════════════════
// user-module-access.test.ts — per-user module allowlist ("Akses menu")
//
// An admin can limit a user to some modules (users/{uid}.modules in the cloud,
// the local user record offline, published as window.__ERP_USER.modules). The
// list only NARROWS the role: effective = role permission AND (no list OR module
// in list). Covers, on the real classic scripts (indirect eval, like rbac.test.ts
// and dual-view.test.ts):
//   • narrowing for view / create / delete, and no list = unchanged
//   • a list never grants a module the role lacks; admins are never restricted
//   • nav gating hides blocked groups; pages outside the list open Ringkasan
//   • the saveDB net reverts writes to blocked modules
//   • the Manajemen Pengguna editor, the local store and key validation, and
//     that the module keys match across rbac.js, user-role.js, functions/ and
//     firestore.rules.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// user-role.js → auth.js import the Firebase config; force the local path.
vi.mock('../src/config/firebase.js', () => ({
  auth: null,
  db: null,
  functions: null,
  isFirebaseConfigured: false,
}));

import {
  MODULE_KEYS,
  normalizeModules,
  setUserModules,
  setUserRole,
  listUsers,
} from '../src/core/user-role.js';
import { getUserModulesLocal } from '../src/core/local-users.js';
import {
  MODULE_KEYS as SERVER_MODULE_KEYS,
  normalizeModules as serverNormalizeModules,
} from '../functions/user-modules.js';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
const RBAC_SRC = read('public/classic/core/rbac.js');
const NAV_SRC = read('public/classic/ui/nav.js');
const CRUD_SRC = read('public/classic/core/erp-crud.js');
const RULES = read('firestore.rules');

const w = window as any;

function freshDB() {
  return {
    salesOrders: [] as any[],
    purchaseOrders: [] as any[],
    deliveryOrders: [] as any[],
    inventoryItems: [] as any[],
    customers: [] as any[],
    journals: [] as any[],
    settings: {} as any,
  };
}

let persistedCount = 0;
let navSpy: ReturnType<typeof vi.fn>;

// Boot rbac.js for a role, optionally with an Akses menu list.
function boot(role: string, modules?: string[], db = freshDB()) {
  w.DB = db;
  persistedCount = 0;
  w.saveDB = () => {
    persistedCount++;
  };
  navSpy = vi.fn();
  w.navigate = navSpy;
  w.showToast = vi.fn();
  w.__ERP_USER = { role, active: true, uid: 'u1', email: `${role}@nsa.local` };
  if (modules) {
    w.__ERP_USER.modules = modules;
  }
  // eslint-disable-next-line no-eval -- intentionally executing the real classic script in global scope
  (0, eval)(RBAC_SRC);
  return db;
}

// Render the real sidebar (ui/nav.js) — it calls RBAC.applyNavGating.
function loadNav() {
  document.body.innerHTML = '<aside id="sidebar"><nav id="nav"></nav></aside>';
  // eslint-disable-next-line no-eval -- intentionally executing the real classic script in global scope
  (0, eval)(NAV_SRC);
  if (!document.querySelector('#nav .nav-section')) {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }
}

function groupHidden(key: string) {
  const sec = document.querySelector(`#nav .nav-section[data-group="${key}"]`) as HTMLElement;
  expect(sec, `group ${key}`).toBeTruthy();
  return sec.style.display === 'none';
}

function entryHidden(label: string) {
  const item = document.querySelector(`#nav .nav-item[data-label="${label}"]`) as HTMLElement;
  expect(item, `entry ${label}`).toBeTruthy();
  return item.style.display === 'none';
}

beforeAll(() => {
  // Publishes window.__NSA_MENU_CONFIG, which rbac.js reads to map views and
  // menu entries to modules.
  boot('admin');
  loadNav();
});

describe('permission = role AND allowlist', () => {
  it('narrows view, create and delete to the listed modules', () => {
    boot('manajer', ['sales', 'inventory']);
    const RBAC = w.RBAC;
    expect(RBAC.isRestricted()).toBe(true);
    // Listed: the role's own actions stay.
    expect(RBAC.can('view', 'sales')).toBe(true);
    expect(RBAC.can('create', 'sales')).toBe(true);
    expect(RBAC.can('delete', 'inventory')).toBe(true);
    // Not listed: every action goes.
    expect(RBAC.canView('purchases')).toBe(false);
    expect(RBAC.can('create', 'purchases')).toBe(false);
    expect(RBAC.can('edit', 'gl')).toBe(false);
    expect(RBAC.can('delete', 'assets')).toBe(false);
    expect(RBAC.canView('reports')).toBe(false);
    // Always open: Ringkasan and the shared settings doc (role decides).
    expect(RBAC.canView('dashboard')).toBe(true);
    expect(RBAC.canViewGroup('dashboard')).toBe(true);
    expect(RBAC.can('edit', 'config')).toBe(true);
  });

  it('leaves every role unchanged without a list (missing or empty)', () => {
    const roles = Object.keys(w.RBAC.PERMISSIONS);
    const modules = Object.keys(w.RBAC.PERMISSIONS.admin);
    const actions = ['view', 'create', 'edit', 'delete'];
    for (const list of [undefined, [] as string[]]) {
      for (const role of roles) {
        boot(role, list);
        const RBAC = w.RBAC;
        expect(RBAC.isRestricted()).toBe(false);
        for (const m of modules) {
          for (const a of actions) {
            const expected = role === 'admin' || RBAC.PERMISSIONS[role][m].includes(a);
            expect(RBAC.can(a, m), `${role} ${a} ${m}`).toBe(expected);
          }
        }
        for (const g of Object.keys(RBAC.GROUP_MODULE)) {
          expect(RBAC.canViewGroup(g)).toBe(RBAC.canView(RBAC.GROUP_MODULE[g]));
        }
        expect(RBAC.viewAllowed('ledger')).toBe(true);
      }
    }
  });

  it('never grants a module or action the role lacks', () => {
    boot('penjualan', ['sales', 'gl', 'admin', 'purchases']);
    const RBAC = w.RBAC;
    expect(RBAC.canView('gl')).toBe(false); // penjualan: gl NONE
    expect(RBAC.canView('admin')).toBe(false);
    expect(RBAC.can('create', 'purchases')).toBe(false); // penjualan: purchases VIEW
    expect(RBAC.can('delete', 'sales')).toBe(false); // penjualan: sales RW
    expect(RBAC.can('create', 'sales')).toBe(true);
    expect(RBAC.canManageUsers()).toBe(false);

    boot('viewer', ['sales']);
    expect(w.RBAC.can('create', 'sales')).toBe(false);
    expect(w.RBAC.canView('sales')).toBe(true);
  });

  it('never restricts an admin', () => {
    boot('admin', ['sales']);
    const RBAC = w.RBAC;
    expect(RBAC.isRestricted()).toBe(false);
    expect(RBAC.can('delete', 'gl')).toBe(true);
    expect(RBAC.can('edit', 'admin')).toBe(true);
    expect(RBAC.viewAllowed('ledger')).toBe(true);
  });
});

describe('nav gating', () => {
  it('hides the groups and entries outside the list', () => {
    boot('manajer', ['sales', 'reports']);
    loadNav();
    expect(groupHidden('dashboard')).toBe(false);
    expect(groupHidden('sales')).toBe(false);
    expect(groupHidden('reports')).toBe(false);
    for (const g of [
      'entri',
      'purchases',
      'inventory',
      'cashbank',
      'accounting',
      'assets',
      'settings',
    ]) {
      expect(groupHidden(g), g).toBe(true);
    }
    // Data Master keeps only the entries of listed modules.
    expect(groupHidden('master')).toBe(false);
    expect(entryHidden('Kategori Pelanggan')).toBe(false);
    expect(entryHidden('Kategori Supplier')).toBe(true);
    expect(entryHidden('Satuan Barang')).toBe(true);
  });

  it('shows the same role everything it allows without a list', () => {
    boot('manajer');
    loadNav();
    for (const g of ['entri', 'purchases', 'inventory', 'cashbank', 'accounting', 'assets']) {
      expect(groupHidden(g), g).toBe(false);
    }
    expect(entryHidden('Kategori Supplier')).toBe(false);
  });

  it('keeps Pajak entries apart from the rest of Akuntansi', () => {
    boot('akunting', ['tax']);
    loadNav();
    expect(groupHidden('accounting')).toBe(false);
    expect(entryHidden('Pajak & PPN')).toBe(false);
    expect(entryHidden('Jurnal')).toBe(true);
    expect(groupHidden('cashbank')).toBe(true);
  });
});

describe('page guard', () => {
  it('opens Ringkasan instead of a page outside the list', () => {
    boot('manajer', ['sales']);
    w.navigate('ledger');
    expect(navSpy).toHaveBeenLastCalledWith('dashboard');
    expect(w.showToast).toHaveBeenCalled();
    w.navigate('sales');
    expect(navSpy).toHaveBeenLastCalledWith('sales');
    w.navigate('dashboard');
    expect(navSpy).toHaveBeenLastCalledWith('dashboard');
  });

  it('opens a shared page when one of its modules is listed', () => {
    boot('manajer', ['purchases']);
    // invoices also hosts Faktur Pembelian / Pembayaran ke Supplier.
    expect(w.RBAC.viewModules('invoices')).toEqual(expect.arrayContaining(['sales', 'purchases']));
    w.navigate('invoices');
    expect(navSpy).toHaveBeenLastCalledWith('invoices');
    w.navigate('logistics'); // Surat Jalan: sales only
    expect(navSpy).toHaveBeenLastCalledWith('dashboard');
  });

  it('keeps purchase buttons on a shared page and hides the rest', () => {
    const page = (viewId: string) => {
      w.activeView = viewId;
      document.body.innerHTML =
        '<div class="main-content"><button data-action="createInvoice">Buat</button>' +
        '<button data-action="deleteInvoice">Hapus</button></div>';
      w.RBAC.guardView();
      return [...document.querySelectorAll('.main-content button')].map(
        b => (b as HTMLElement).style.display !== 'none'
      );
    };
    boot('manajer', ['purchases']);
    expect(page('invoices')).toEqual([true, true]);
    expect(page('ledger')).toEqual([false, false]);
    // The list can't add rights: Penjualan only views purchases.
    boot('penjualan', ['purchases']);
    expect(page('invoices')).toEqual([false, false]);
    w.activeView = 'dashboard';
  });
});

describe('saveDB safety net', () => {
  it('reverts writes to modules outside the list', () => {
    const db = boot('manajer', ['sales']);
    db.salesOrders.push({ id: 'SO-1', date: '2026-09-14' });
    w.saveDB();
    expect(persistedCount).toBe(1);

    db.purchaseOrders.push({ id: 'PO-1', date: '2026-09-14' });
    w.saveDB();
    expect(persistedCount).toBe(1); // save skipped
    expect(db.purchaseOrders).toHaveLength(0); // reverted
    expect(w.showToast).toHaveBeenLastCalledWith(expect.stringContaining('akses menu'), 'danger');

    db.journals.push({ id: 'JV-1', source: 'manual', lines: [] });
    w.saveDB();
    expect(persistedCount).toBe(1);
    expect(db.journals).toHaveLength(0);
  });

  it('reverts a delete in a module outside the list', () => {
    const db = freshDB();
    db.inventoryItems.push({ id: 'IT-1', name: 'Batu' });
    boot('manajer', ['sales'], db);
    db.inventoryItems.length = 0;
    w.saveDB();
    expect(persistedCount).toBe(0);
    expect(db.inventoryItems).toHaveLength(1);
  });

  it('still saves the shared settings doc and listed modules', () => {
    const db = boot('manajer', ['sales']);
    db.settings.units = ['Ton'];
    db.salesOrders.push({ id: 'SO-2', date: '2026-09-14' });
    w.saveDB();
    expect(persistedCount).toBe(1);
    expect(db.settings.units).toEqual(['Ton']);
  });

  it('lets Pengambilan (purchases) record pickup trips but not ordinary surat jalan', () => {
    const db = freshDB();
    db.deliveryOrders.push({ id: 'DO-1', pickup: true, status: 'Pending' });
    boot('manajer', ['purchases'], db);
    db.deliveryOrders[0] = { id: 'DO-1', pickup: true, status: 'Delivered', weighing: { net: 30 } };
    w.saveDB();
    expect(persistedCount).toBe(1);

    db.deliveryOrders.push({ id: 'DO-2', status: 'Pending' });
    w.saveDB();
    expect(persistedCount).toBe(1);
    expect(db.deliveryOrders).toHaveLength(1);

    db.deliveryOrders[0] = { id: 'DO-1', pickup: false, status: 'Delivered' };
    w.saveDB();
    expect(persistedCount).toBe(1); // a trip can't be turned into an ordinary surat jalan
    expect(db.deliveryOrders[0].pickup).toBe(true);
  });

  it('lets the same role write every module without a list', () => {
    const db = boot('manajer');
    db.purchaseOrders.push({ id: 'PO-1', date: '2026-09-14' });
    db.journals.push({ id: 'JV-1', source: 'manual', lines: [] });
    w.saveDB();
    expect(persistedCount).toBe(1);
    expect(db.purchaseOrders).toHaveLength(1);
  });
});

describe('access groups', () => {
  it('cover every restrictable module once, named after the sidebar', () => {
    boot('admin');
    const RBAC = w.RBAC;
    const listed = RBAC.ACCESS_GROUPS.map((g: any) => g.module);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, ...RBAC.ALWAYS_ALLOWED].sort()).toEqual([...MODULE_KEYS].sort());
    // Every module a menu entry uses is offered (or always open).
    const cfg = w.__NSA_MENU_CONFIG;
    const used = new Set<string>();
    Object.values(cfg).forEach((g: any) => {
      [g, ...g.items].forEach((it: any) =>
        [].concat(it.module || g.module).forEach(m => used.add(m))
      );
    });
    used.forEach(m => expect([...listed, ...RBAC.ALWAYS_ALLOWED]).toContain(m));
    expect(RBAC.accessMenus('tax')).toEqual(['Akuntansi: Pajak & PPN, Ekspor Coretax']);
    expect(RBAC.accessMenus('gl')).toEqual([
      'Kas & Bank',
      'Akuntansi (kecuali Pajak & PPN, Ekspor Coretax)',
    ]);
    expect(RBAC.accessMenus('purchases')).toEqual(
      expect.arrayContaining(['Entri Harian', 'Pembelian'])
    );
  });
});

describe('module keys and validation', () => {
  it('match across rbac.js, user-role.js, functions/ and firestore.rules', () => {
    boot('admin');
    expect([...MODULE_KEYS].sort()).toEqual(Object.keys(w.RBAC.PERMISSIONS.admin).sort());
    expect(SERVER_MODULE_KEYS).toEqual(MODULE_KEYS);
    const m = RULES.match(/data\.modules\.hasOnly\(\[([^\]]*)\]\)/);
    expect(m).toBeTruthy();
    const ruleKeys = (m as RegExpMatchArray)[1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(ruleKeys).toEqual(MODULE_KEYS);
  });

  it('accept only arrays of known module keys', () => {
    for (const normalize of [normalizeModules, serverNormalizeModules]) {
      expect(normalize(null)).toEqual([]);
      expect(normalize([])).toEqual([]);
      expect(normalize(['gl', 'sales', 'gl'])).toEqual(['sales', 'gl']);
      expect(() => normalize(['sales', 'superuser'])).toThrow(/tidak dikenal/);
      expect(() => normalize('sales')).toThrow(/tidak valid/);
      expect(() => normalize([1])).toThrow(/tidak dikenal/);
    }
  });

  it('firestore.rules narrows writes by the user doc list and keeps it admin-only', () => {
    expect(RULES).toMatch(
      /function canWriteModule\(m\) \{\s*return roleCanWrite\(m\) && moduleAllowed\(m\);/
    );
    expect(RULES).toMatch(
      /function canDeleteModule\(m\) \{\s*return roleCanDelete\(m\) && moduleAllowed\(m\);/
    );
    expect(RULES).toMatch(/userDoc\(\)\.get\('modules', \[\]\)/);
    expect(RULES).toMatch(
      /allow update: if isAdmin\(\) && validModules\(request\.resource\.data\);/
    );
  });
});

describe('local user store', () => {
  const seed = () =>
    localStorage.setItem(
      'erp_users_v1',
      JSON.stringify({
        users: [
          { username: 'admin', displayName: 'Administrator', role: 'admin', active: true },
          { username: 'budi', displayName: 'Budi', role: 'manajer', active: true },
        ],
      })
    );

  beforeEach(() => {
    localStorage.clear();
    seed();
  });

  it('stores, lists and clears a list', async () => {
    expect(await setUserModules('budi', ['gl', 'sales'])).toEqual(['sales', 'gl']);
    expect(getUserModulesLocal('budi')).toEqual(['sales', 'gl']);
    const budi = (await listUsers()).find((u: any) => u.uid === 'budi');
    expect(budi.modules).toEqual(['sales', 'gl']);

    await setUserModules('budi', []);
    expect(getUserModulesLocal('budi')).toEqual([]);
  });

  it('rejects unknown keys and restricting an admin', async () => {
    await expect(setUserModules('budi', ['sales', 'root'])).rejects.toThrow(/tidak dikenal/);
    await expect(setUserModules('admin', ['sales'])).rejects.toThrow(/Admin/);
    expect(getUserModulesLocal('admin')).toEqual([]);
  });

  it('drops the list when the user becomes an admin', async () => {
    await setUserModules('budi', ['sales']);
    await setUserRole('budi', 'admin', true);
    expect(getUserModulesLocal('budi')).toEqual([]);
  });
});

describe('Manajemen Pengguna → Akses menu', () => {
  const users = () => [
    {
      uid: 'admin',
      username: 'admin',
      displayName: 'Administrator',
      role: 'admin',
      active: true,
      local: true,
      modules: [],
    },
    {
      uid: 'budi',
      username: 'budi',
      displayName: 'Budi',
      role: 'manajer',
      active: true,
      local: true,
      modules: [],
    },
    {
      uid: 'sari',
      username: 'sari',
      displayName: 'Sari',
      role: 'penjualan',
      active: true,
      local: true,
      modules: ['sales', 'master'],
    },
  ];
  let setModules: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    // eslint-disable-next-line no-eval -- intentionally executing the real classic script in global scope
    (0, eval)(CRUD_SRC);
  });

  const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));

  async function open() {
    boot('admin');
    w.__ERP_USER = { role: 'admin', active: true, uid: 'admin', mode: 'local' };
    w.DB = { employees: [], settings: {} };
    w.escapeHtml = (s: any) =>
      String(s == null ? '' : s).replace(/[&<>"']/g, (c: string) => `&#${c.charCodeAt(0)};`);
    w.openModal = (_title: string, body: string, footer: string) => {
      document.body.innerHTML = `<div id="modal-test">${body}${footer}</div>`;
    };
    setModules = vi.fn(async (_uid: string, mods: string[]) => mods);
    list = vi.fn(async () => users());
    w.erpUsers = {
      list,
      setModules,
      setRole: vi.fn(async () => true),
      roles: ['admin', 'manajer', 'akunting', 'penjualan', 'viewer'],
      roleLabels: { admin: 'Admin / Owner', manajer: 'Manajer', penjualan: 'Penjualan' },
    };
    w.showUserManagement();
    await tick();
  }

  const row = (uid: string) =>
    (document.querySelector(`.um-mods-panel[data-uid="${uid}"]`) as HTMLElement | null)
      ?.parentElement;
  const panel = (uid: string) =>
    document.querySelector(`.um-mods-panel[data-uid="${uid}"]`) as HTMLElement;
  const box = (uid: string, module: string) =>
    panel(uid).querySelector(`.um-mod[value="${module}"]`) as HTMLInputElement;
  const allBox = (uid: string) => panel(uid).querySelector('.um-mods-all') as HTMLInputElement;
  const click = (el: Element) => (el as HTMLElement).click();
  const toggleAll = (uid: string, checked: boolean) => {
    allBox(uid).checked = checked;
    allBox(uid).dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('summarises each user and never offers to restrict an admin', async () => {
    await open();
    const text = document.getElementById('um-list')!.textContent || '';
    expect(text).toContain('Semua (Admin)');
    expect(row('budi')!.textContent).toContain('Semua');
    expect(row('sari')!.textContent).toContain('2 dari 9 grup');
    expect(panel('admin')).toBeNull();
    const adminBtn = [...document.querySelectorAll('[data-action="umModulesToggle"]')].find(
      b => !document.getElementById(b.getAttribute('aria-controls') || '')
    ) as HTMLButtonElement;
    expect(adminBtn.disabled).toBe(true);
  });

  it('starts at "Semua sesuai peran" and saves a narrowed list', async () => {
    await open();
    const toggle = row('budi')!.querySelector('[data-action="umModulesToggle"]')!;
    click(toggle);
    expect(panel('budi').hidden).toBe(false);
    expect(allBox('budi').checked).toBe(true);
    expect(box('budi', 'sales').disabled).toBe(true);
    // Manajer has no Pengaturan (admin) → never selectable.
    expect(box('budi', 'admin').disabled).toBe(true);
    expect(box('budi', 'admin').checked).toBe(false);

    toggleAll('budi', false);
    expect(box('budi', 'sales').disabled).toBe(false);
    expect(box('budi', 'admin').disabled).toBe(true);
    box('budi', 'gl').checked = false;
    box('budi', 'tax').checked = false;
    click(panel('budi').querySelector('[data-action="umModulesSave"]')!);
    await tick(20);
    expect(setModules).toHaveBeenCalledWith('budi', [
      'sales',
      'purchases',
      'inventory',
      'assets',
      'reports',
      'master',
    ]);
    expect(list).toHaveBeenCalledTimes(2); // reloaded after saving
  });

  it('shows a stored list and clears it with "Semua sesuai peran"', async () => {
    await open();
    expect(allBox('sari').checked).toBe(false);
    expect(box('sari', 'sales').checked).toBe(true);
    expect(box('sari', 'master').checked).toBe(true);
    expect(box('sari', 'purchases').checked).toBe(false);
    expect(box('sari', 'gl').disabled).toBe(true); // outside Penjualan's role
    toggleAll('sari', true);
    click(panel('sari').querySelector('[data-action="umModulesSave"]')!);
    await tick(20);
    expect(setModules).toHaveBeenCalledWith('sari', []);
  });

  it('refuses to save an empty selection', async () => {
    await open();
    panel('sari')
      .querySelectorAll('.um-mod')
      .forEach(b => ((b as HTMLInputElement).checked = false));
    click(panel('sari').querySelector('[data-action="umModulesSave"]')!);
    await tick(20);
    expect(setModules).not.toHaveBeenCalled();
    expect(w.showToast).toHaveBeenCalledWith(expect.stringContaining('minimal satu'), 'warning');
  });
});
