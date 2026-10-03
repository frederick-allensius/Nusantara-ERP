// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Role-Based Access Control  (rbac.js)  [client layer]
//
// The REAL security boundary is firestore.rules (server). This file makes the UI
// match what the server allows, with three mechanisms:
//   1. Permission matrix  — fixed preset roles × modules × actions.
//   2. Menu / button gating — hide modules a role can't see, hide create/delete
//                             buttons a role can't use (nav.js + a navigate wrap).
//   3. saveDB safety net  — mirrors integrity.js: diffs the live DB against a
//                           snapshot and reverts any mutation the role isn't
//                           allowed to make, then skips the save. Defence in
//                           depth for local mode and any button we didn't hide.
//
// The active role is resolved in src/core/user-role.js before the classic bundle
// loads and published as window.__ERP_USER = { role, active, modules, ... }.
//
// Per-user "Akses menu": `modules` (set by an admin in Manajemen Pengguna) is an
// allowlist that can only NARROW the role — see moduleAllowed() below.
//
// Load order (vite.config.js classicOrder): rbac.js is LAST so its saveDB wrap is
// OUTERMOST — an unauthorized mutation is reverted before integrity.js/trash.js
// (inner wraps) ever see it. Its API is read at render time, so loading last is
// fine for nav.js/settings.js too (the whole bundle runs before the first nav).
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.RBAC.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Permission matrix ────────────────────────────────────────────────────────
  const VIEW = ['view'];
  const RW = ['view', 'create', 'edit']; // read/write, no delete
  const FULL = ['view', 'create', 'edit', 'delete'];
  const NONE = [];

  // role → module → [actions]. Modules not listed default to NONE.
  // Modules: dashboard, reports, sales, purchases, inventory, gl, tax, assets,
  // master, admin (user mgmt / company profile), config (the shared settings doc
  // which also holds reference data: asset/category/unit lists). config is
  // admin+manajer because that doc bundles operational reference data managers
  // maintain alongside admin-only company config.
  const PERMISSIONS = {
    admin: {
      dashboard: VIEW, reports: VIEW, sales: FULL, purchases: FULL, inventory: FULL,
      gl: FULL, tax: FULL, assets: FULL, master: FULL, admin: FULL, config: FULL,
    },
    manajer: {
      dashboard: VIEW, reports: VIEW, sales: FULL, purchases: FULL, inventory: FULL,
      gl: RW, tax: VIEW, assets: FULL, master: FULL, admin: NONE, config: RW,
    },
    akunting: {
      dashboard: VIEW, reports: VIEW, sales: VIEW, purchases: VIEW, inventory: VIEW,
      gl: FULL, tax: FULL, assets: VIEW, master: VIEW, admin: NONE, config: NONE,
    },
    penjualan: {
      dashboard: VIEW, reports: VIEW, sales: RW, purchases: VIEW, inventory: VIEW,
      gl: NONE, tax: NONE, assets: NONE, master: RW, admin: NONE, config: NONE,
    },
    viewer: {
      dashboard: VIEW, reports: VIEW, sales: VIEW, purchases: VIEW, inventory: VIEW,
      gl: VIEW, tax: VIEW, assets: VIEW, master: VIEW, admin: NONE, config: NONE,
    },
    pending: {
      dashboard: VIEW, reports: NONE, sales: NONE, purchases: NONE, inventory: NONE,
      gl: NONE, tax: NONE, assets: NONE, master: NONE, admin: NONE, config: NONE,
    },
  };

  // Firestore collection → module (business data). System collections (below) are
  // exempt from the saveDB net entirely.
  const COLLECTION_MODULE = {
    salesOrders: 'sales', salesQuotations: 'sales', salesInvoices: 'sales',
    salesReceipts: 'sales', salesReturns: 'sales', deliveryOrders: 'sales',
    salesDownPayments: 'sales', salesTargets: 'sales',
    purchaseOrders: 'purchases', purchaseQuotations: 'purchases', purchaseInvoices: 'purchases',
    purchasePayments: 'purchases', purchaseReturns: 'purchases', purchaseDownPayments: 'purchases',
    goodsReceipts: 'purchases', supplierPrices: 'purchases',
    inventoryItems: 'inventory', itemAdjustments: 'inventory', itemTransfers: 'inventory',
    warehouses: 'inventory', itemRequisitions: 'inventory', jobCostings: 'inventory',
    // Kas & Bank records post to the ledger → module 'gl'.
    otherPayments: 'gl', otherDeposits: 'gl', bankTransfers: 'gl', bankStatements: 'gl',
    expenseAccruals: 'gl',
    contacts: 'master',
    // NOTE: journals/paymentLogs/accounts are NOT listed here. They are auto-
    // maintained side-effects of allowed sales/purchase activity (GL reconcile
    // runs inside saveDB), so gating them would block legitimate transactions.
    // Manual journal vouchers ARE gated separately (manualJournals, below).
    budgets: 'gl', budgetTransfers: 'gl', payrollRuns: 'gl',
    customers: 'master', suppliers: 'master', employees: 'master', fleet: 'master',
    expedition: 'master',
    assets: 'assets', faCategories: 'assets', fiscalFaCategories: 'assets',
    assetTransfers: 'assets', assetDispositions: 'assets',
    // The settings doc bundles admin config + reference data (asset/category/unit
    // lists) → module 'config' (admin+manajer). users/{uid} is managed outside DB.
    settings: 'config',
  };

  // App-internal side-effect collections: written as a by-product of legitimate
  // actions or by background schedulers (notifications/number sequences). Never
  // reverted by the net so a read-only role's session doesn't thrash.
  const SYSTEM_COLLECTIONS = new Set([
    'notifications', 'reservations', 'numberSequences', 'auditLog', 'trash',
    // GL side-effects of allowed transactions — exempt (see COLLECTION_MODULE).
    'paymentLogs', 'accounts',
  ]);

  // Sidebar group key → module (ui/nav.js). Entries inside a group are gated by
  // their own data-module; this map gates groups without entries (Ringkasan).
  const GROUP_MODULE = {
    dashboard: 'dashboard', entri: 'purchases', pickups: 'purchases', sales: 'sales', purchases: 'purchases', inventory: 'inventory',
    cashbank: 'gl', accounting: 'gl', assets: 'assets', reports: 'reports',
    master: 'master', settings: 'admin', tax: 'tax',
  };

  // View id → module (click-guard / button gating). Ambiguous shared views
  // (invoices/returns/quotations) map leniently; the saveDB net is authoritative.
  // entriHarian is the focused daily-entry surface — treated as 'purchases' for
  // button gating (its create buttons post PO/DO/receipt-side documents).
  const VIEW_MODULE = {
    dashboard: 'dashboard', settings: 'admin', tax: 'tax', master: 'master',
    ledger: 'gl', finance: 'gl', financials: 'reports', reports: 'reports',
    sales: 'sales', quotations: 'sales', logistics: 'sales', invoices: 'sales',
    returns: 'sales', purchase: 'purchases', inventory: 'inventory',
    warehouse: 'inventory', adjustments: 'inventory', assets: 'assets',
    entriHarian: 'purchases',
    pickups: 'purchases',
  };

  // ── Per-user module allowlist ("Akses menu") ─────────────────────────────────
  // An admin can limit a user to some modules: users/{uid}.modules in the cloud,
  // the local user record offline, published as window.__ERP_USER.modules.
  // Effective permission = role permission AND (no list OR module in the list),
  // so the list only narrows the role and never widens it. Missing or empty =
  // no restriction. Admins are never restricted (no lock-out of the last admin).
  // Always open: 'dashboard' (Ringkasan) and 'config' — the shared settings doc
  // also holds reference data of other modules (fixed assets, item categories,
  // units, tax settings) and is filled in lazily by several pages, so narrowing
  // it would block saves in modules the user may use. firestore.rules mirrors
  // this in moduleAllowed().
  const ALWAYS_ALLOWED = ['dashboard', 'config'];

  // The choices in Manajemen Pengguna → Akses menu: one per restrictable module,
  // named after the sidebar groups it opens (ui/nav.js MENU_CONFIG; see
  // accessMenus()). 'master' opens no menu of its own: it is the customer /
  // supplier / employee data behind Pelanggan, Supplier and Karyawan.
  const ACCESS_GROUPS = [
    { module: 'sales', label: 'Penjualan' },
    { module: 'purchases', label: 'Pembelian & Entri Harian' },
    { module: 'inventory', label: 'Persediaan' },
    { module: 'gl', label: 'Kas & Bank dan Akuntansi' },
    { module: 'tax', label: 'Pajak' },
    { module: 'assets', label: 'Aset Tetap' },
    { module: 'reports', label: 'Laporan' },
    {
      module: 'master',
      label: 'Data pelanggan, supplier & karyawan',
      hint: 'Menambah dan mengubah pelanggan, supplier, karyawan, armada dan ekspedisi',
    },
    { module: 'admin', label: 'Pengaturan' },
  ];

  // ── Dual-view surfaces (Section 5) ────────────────────────────────────────
  // Two handoff personas are layered on top of the resolved role WITHOUT
  // weakening the server-enforced rbac boundary:
  //   • 'entri'     — the Admin/Accounting daily data-entry surface (Entri
  //                   Harian): PO, Surat Jalan (DO), Timbangan (weighbridge
  //                   reconciliation) and Biaya Operasional (Transport / ATK /
  //                   Entertain via Other Payment). Minimal, distraction-free.
  //   • 'executive' — the Owner/Management surface: the Executive Dashboard with
  //                   pipeline funnels, real-time margin (revenue vs COGS),
  //                   outstanding invoices (piutang aging) and the full
  //                   financial reports.
  // A role can be granted either or both surfaces. This is a UI-composition
  // concept only — every actual mutation is still checked by can()/the saveDB
  // net and, on the server, by firestore.rules.
  const ROLE_SURFACES = {
    admin: ['entri', 'executive'],
    manajer: ['entri', 'executive'],
    akunting: ['entri'],
    penjualan: ['entri'],
    viewer: ['executive'],
    pending: [],
  };

  // The operational entry actions the Entri Harian surface exposes, in order.
  // Kept here (beside the surface map) so entri-harian.js and the tests share a
  // single source of truth for "exactly the operational entry tasks".
  const ENTRI_ACTIONS = ['po', 'suratJalan', 'timbangan', 'biayaOperasional'];

  // The executive analytics the management surface exposes.
  const EXECUTIVE_ANALYTICS = ['funnels', 'margin', 'piutang', 'financials'];

  // Surfaces granted to a role (falls back to the resolved current role).
  function surfaceFor(role) {
    const r = role || currentRole();
    return (ROLE_SURFACES[r] || []).slice();
  }
  // Does the (current or given) role get a named surface?
  function canViewSurface(surface, role) {
    return surfaceFor(role).indexOf(surface) !== -1;
  }

  // ── Role accessors ───────────────────────────────────────────────────────────
  function user() {
    return window.__ERP_USER || { role: 'viewer', active: true };
  }
  function currentRole() {
    const u = user();
    // An inactive (pending-approval) account behaves as `pending`.
    if (u.active === false) {
      return 'pending';
    }
    return PERMISSIONS[u.role] ? u.role : 'viewer';
  }
  function isAdmin() {
    return currentRole() === 'admin';
  }

  function actionsFor(module) {
    const perms = PERMISSIONS[currentRole()] || {};
    return perms[module] || NONE;
  }

  // The user's module allowlist, or null when there is none (no restriction).
  function moduleList() {
    const list = user().modules;
    if (!Array.isArray(list)) {
      return null;
    }
    const mods = list.filter(m => typeof m === 'string');
    return mods.length ? mods : null;
  }
  /** Is the current user narrowed by a module allowlist? Admins never are. */
  function isRestricted() {
    return !isAdmin() && moduleList() !== null;
  }
  /** Does the user's allowlist (if any) include `module`? Ignores the role. */
  function moduleAllowed(module) {
    if (!isRestricted() || ALWAYS_ALLOWED.indexOf(module) !== -1) {
      return true;
    }
    return moduleList().indexOf(module) !== -1;
  }

  // The role matrix alone, without the allowlist.
  function roleCan(action, module) {
    if (isAdmin()) {
      return true;
    }
    return actionsFor(module).indexOf(action) !== -1;
  }

  /** Can the current user perform `action` on `module`? (role AND allowlist) */
  function can(action, module) {
    return roleCan(action, module) && moduleAllowed(module);
  }
  function canView(module) {
    return can('view', module);
  }
  function canWrite(module) {
    return can('create', module) || can('edit', module);
  }
  function canViewGroup(groupKey) {
    const m = GROUP_MODULE[groupKey];
    return m ? canView(m) : true;
  }

  // ── Pages and menu entries per module (allowlist helpers) ────────────────────
  function menuConfig() {
    return window.__NSA_MENU_CONFIG || {};
  }
  function modulesOf(value) {
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  }

  // Modules a view serves: its VIEW_MODULE plus the module(s) of every menu entry
  // that opens it — shared views such as invoices serve sales AND purchases.
  function viewModules(viewId) {
    const mods = modulesOf(VIEW_MODULE[viewId]).slice();
    const add = m => {
      if (mods.indexOf(m) === -1) {
        mods.push(m);
      }
    };
    const cfg = menuConfig();
    Object.keys(cfg).forEach(key => {
      const g = cfg[key];
      if (g.view === viewId) {
        modulesOf(g.module).forEach(add);
      }
      (g.items || []).forEach(it => {
        if (it.view === viewId) {
          modulesOf(it.module || g.module).forEach(add);
        }
      });
    });
    return mods;
  }

  /** May the user open the page `viewId`? Only an allowlist closes pages: a
   *  restricted user needs one module the page serves (unclaimed pages stay open). */
  function viewAllowed(viewId) {
    if (!isRestricted()) {
      return true;
    }
    const mods = viewModules(viewId);
    return !mods.length || mods.some(moduleAllowed);
  }

  // Sidebar entries opened through `module`, one string per group: the group
  // title when the module opens all of it, "Group: Entry, Entry" for a few
  // entries, "Group (kecuali Entry, Entry)" when only a few are left out.
  function accessMenus(module) {
    const cfg = menuConfig();
    const out = [];
    Object.keys(cfg).forEach(key => {
      const g = cfg[key];
      const items = (g.items || []).filter(it => it.label);
      if (!items.length) {
        if (modulesOf(g.module).indexOf(module) !== -1) {
          out.push(g.title);
        }
        return;
      }
      const hit = items.filter(it => modulesOf(it.module || g.module).indexOf(module) !== -1);
      if (!hit.length) {
        return;
      }
      if (hit.length === items.length) {
        out.push(g.title);
        return;
      }
      const miss = items.filter(it => hit.indexOf(it) === -1);
      out.push(
        hit.length > 3 && miss.length <= 3
          ? `${g.title} (kecuali ${miss.map(it => it.label).join(', ')})`
          : `${g.title}: ${hit.map(it => it.label).join(', ')}`
      );
    });
    return out;
  }

  // Capabilities (admin-only): user management, settings, period lock, permanent delete.
  function canManageUsers() {
    return isAdmin();
  }
  function canManageSettings() {
    return isAdmin();
  }
  function canPeriodLock() {
    return isAdmin();
  }
  function canPermanentDelete() {
    return isAdmin();
  }

  // ── saveDB safety net (mirror of integrity.js) ───────────────────────────────
  function db() {
    return window.DB || {};
  }
  const trackedCollections = Object.keys(COLLECTION_MODULE);

  // Only MANUAL journal vouchers are user-authored GL entries; auto/accurate
  // journals are derived (rebuilt by GL reconcile on every save) and must be
  // exempt or they'd flag every allowed sales/purchase post as a 'gl' write.
  function manualJournals() {
    return (db().journals || []).filter(j => j && j.source === 'manual');
  }

  let snapshot = null;
  function takeSnapshot() {
    const snap = {};
    trackedCollections.forEach(name => {
      const arr = db()[name];
      // Object-style collections (settings) aren't arrays; capture them by JSON
      // identity under a single synthetic key.
      if (Array.isArray(arr)) {
        snap[name] = JSON.parse(JSON.stringify(arr));
      } else if (arr && typeof arr === 'object') {
        snap[name] = { __obj: JSON.stringify(arr) };
      } else {
        snap[name] = [];
      }
    });
    snap._manualJournals = JSON.parse(JSON.stringify(manualJournals()));
    snapshot = snap;
  }
  function refreshSnapshot() {
    try {
      takeSnapshot();
    } catch (e) {
      console.warn('[RBAC] snapshot refresh failed:', e);
    }
  }

  function byId(arr) {
    const m = new Map();
    (arr || []).forEach(r => {
      if (r && r.id != null) {
        m.set(String(r.id), r);
      }
    });
    return m;
  }

  // Modules a record belongs to. A pickup surat jalan / trip (deliveryOrders with
  // pickup: true) is recorded from Pengambilan (purchases) and billed from Tagih
  // Pelanggan (sales), so either right covers it. Mirror of firestore.rules.
  function recordModules(name, rec, module) {
    return name === 'deliveryOrders' && rec && rec.pickup === true ? [module, 'purchases'] : [module];
  }
  function canAny(action, mods) {
    return mods.some(m => can(action, m));
  }

  // Detect the first mutation the current role is NOT allowed to make.
  // Returns { module, action, collection } or null.
  function findViolation() {
    if (isAdmin()) {
      return null;
    }
    for (let i = 0; i < trackedCollections.length; i++) {
      const name = trackedCollections[i];
      if (SYSTEM_COLLECTIONS.has(name)) {
        continue;
      }
      const module = COLLECTION_MODULE[name];
      const oldSnap = snapshot[name];
      const live = db()[name];

      // Object-style collection: any change ⇒ an edit.
      if (oldSnap && oldSnap.__obj !== undefined) {
        const now = live && typeof live === 'object' ? JSON.stringify(live) : '';
        if (now !== oldSnap.__obj && !can('edit', module)) {
          return { module, action: 'edit', collection: name };
        }
        continue;
      }

      const oldMap = byId(oldSnap);
      const newMap = byId(live);
      let v = null;
      newMap.forEach((rec, id) => {
        if (v) {
          return;
        }
        const prev = oldMap.get(id);
        const mods = recordModules(name, prev || rec, module);
        if (prev && prev.pickup !== rec.pickup) {
          mods.length = 1; // turning a record into (or out of) a pickup needs its own module
        }
        if (!prev) {
          if (!canAny('create', mods)) {
            v = { module, action: 'create', collection: name };
          }
        } else if (JSON.stringify(prev) !== JSON.stringify(rec) && !canAny('edit', mods)) {
          v = { module, action: 'edit', collection: name };
        }
      });
      if (v) {
        return v;
      }
      oldMap.forEach((rec, id) => {
        if (v) {
          return;
        }
        if (!newMap.has(id) && !canAny('delete', recordModules(name, rec, module))) {
          v = { module, action: 'delete', collection: name };
        }
      });
      if (v) {
        return v;
      }
    }

    // Manual journal vouchers (module 'gl').
    const jOld = byId(snapshot._manualJournals);
    const jNew = byId(manualJournals());
    let jv = null;
    jNew.forEach((rec, id) => {
      if (jv) {
        return;
      }
      const prev = jOld.get(id);
      if (!prev && !can('create', 'gl')) {
        jv = { module: 'gl', action: 'create', collection: 'journals' };
      } else if (prev && JSON.stringify(prev) !== JSON.stringify(rec) && !can('edit', 'gl')) {
        jv = { module: 'gl', action: 'edit', collection: 'journals' };
      }
    });
    if (!jv) {
      jOld.forEach((rec, id) => {
        if (jv) {
          return;
        }
        if (!jNew.has(id) && !can('delete', 'gl')) {
          jv = { module: 'gl', action: 'delete', collection: 'journals' };
        }
      });
    }
    return jv;
  }

  function revertToSnapshot() {
    const data = db();
    trackedCollections.forEach(name => {
      const s = snapshot[name];
      if (s && s.__obj !== undefined) {
        try {
          data[name] = JSON.parse(s.__obj);
        } catch (_) {
          /* leave as-is */
        }
      } else {
        data[name] = JSON.parse(JSON.stringify(s || []));
      }
    });
    // Restore manual journals; keep derived (auto/accurate) ones — reconcile
    // rebuilds autos from the reverted documents on the next save.
    const keep = (data.journals || []).filter(j => !j || j.source !== 'manual');
    data.journals = keep.concat(JSON.parse(JSON.stringify(snapshot._manualJournals || [])));
  }

  const ACTION_LABEL = { create: 'menambah', edit: 'mengubah', delete: 'menghapus' };
  const MODULE_LABEL = {
    sales: 'Penjualan', purchases: 'Pembelian', inventory: 'Inventory', gl: 'Buku Besar',
    tax: 'Pajak', assets: 'Aset', master: 'Master Data', admin: 'Pengaturan/Admin',
    config: 'Pengaturan', reports: 'Laporan',
  };

  // Toast text for a refused action: the role, or the user's Akses menu.
  function denyMessage(action, module) {
    const label = MODULE_LABEL[module] || module;
    if (roleCan(action, module)) {
      return `Akses ditolak — akses menu Anda tidak mencakup ${label}.`;
    }
    return `Akses ditolak — peran "${currentRole()}" tidak boleh ${ACTION_LABEL[action] || action} data ${label}.`;
  }

  function installSaveHook() {
    if (typeof window.saveDB !== 'function') {
      console.warn('[RBAC] window.saveDB missing — net not installed');
      return;
    }
    const _origSave = window.saveDB;
    window.saveDB = function rbacGuardedSave() {
      try {
        if (snapshot) {
          const v = findViolation();
          if (v) {
            revertToSnapshot();
            const msg = denyMessage(v.action, v.module);
            console.warn('[RBAC] ' + msg, v);
            if (typeof window.showToast === 'function') {
              window.showToast(msg, 'danger');
            }
            try {
              if (typeof window.invalidateView === 'function' && window.activeView) {
                window.invalidateView(window.activeView);
              }
              if (typeof window.navigate === 'function' && window.activeView) {
                window.navigate(window.activeView);
              }
            } catch (_) {
              /* ignore */
            }
            return; // skip the save entirely
          }
        }
      } catch (err) {
        // An RBAC bug must never block a legitimate save.
        console.error('[RBAC] net check failed (save proceeds):', err);
      }
      const result = _origSave.apply(this, arguments);
      refreshSnapshot();
      return result;
    };
  }

  // ── Click guard (capture phase, runs before module bubble handlers) ──────────
  const CREATE_RE = /^(add|new|create|buat|tambah|post|save|simpan)/i;
  const DELETE_RE = /^(del|delete|hapus|remove|purge|void|reset)/i;
  const EDIT_RE = /^(edit|update|ubah)/i;
  // Whitelisted action verbs that are never writes (view/filter/print/etc.) and
  // must never be blocked even if they superficially match above.
  const SAFE_ACTIONS = new Set(['addWidget']);

  function activeModule() {
    const v = window.activeView || 'dashboard';
    return VIEW_MODULE[v] || 'dashboard';
  }

  // May the user do `need` on the page on screen? The role is checked against the
  // page's module as before; a restricted user also needs `need` on one module
  // the page serves (Faktur Pembelian lives in the shared invoices view).
  function canOnPage(need) {
    const module = activeModule();
    if (!roleCan(need, module)) {
      return false;
    }
    if (!isRestricted()) {
      return true;
    }
    return viewModules(window.activeView || 'dashboard').some(m => can(need, m));
  }

  function installClickGuard() {
    document.addEventListener(
      'click',
      function (e) {
        if (isAdmin()) {
          return;
        }
        const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
        if (!el) {
          return;
        }
        const action = el.getAttribute('data-action') || '';
        if (SAFE_ACTIONS.has(action)) {
          return;
        }
        let need = null;
        if (DELETE_RE.test(action)) {
          need = 'delete';
        } else if (CREATE_RE.test(action)) {
          need = 'create';
        } else if (EDIT_RE.test(action)) {
          need = 'edit';
        }
        if (!need) {
          return;
        }
        if (!canOnPage(need)) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.showToast === 'function') {
            window.showToast(denyMessage(need, activeModule()), 'danger');
          }
        }
      },
      true // capture
    );
  }

  // ── View button gating: hide create/delete buttons the role can't use ────────
  function guardView() {
    try {
      if (isAdmin()) {
        return;
      }
      const scope = document.querySelector('.main-content') || document.body;
      scope.querySelectorAll('[data-action]').forEach(el => {
        const action = el.getAttribute('data-action') || '';
        if (SAFE_ACTIONS.has(action)) {
          return;
        }
        let need = null;
        if (DELETE_RE.test(action)) {
          need = 'delete';
        } else if (CREATE_RE.test(action)) {
          need = 'create';
        } else if (EDIT_RE.test(action)) {
          need = 'edit';
        }
        if (need && !canOnPage(need)) {
          el.style.display = 'none';
        }
      });
    } catch (e) {
      console.warn('[RBAC] guardView failed:', e);
    }
  }

  // Hide sidebar entries the current user can't view (role and Akses menu, both
  // through canView): an entry lists its module(s) in data-module, a sub-heading
  // goes when none of its entries is left, and a group goes when it has no
  // visible entry (a group without entries is gated by GROUP_MODULE). Called by
  // nav.js after it renders the menu and from rbac.js boot (which loads after
  // nav.js). Idempotent.
  function applyNavGating() {
    try {
      document.querySelectorAll('.nav-item[data-module]').forEach(item => {
        const mods = (item.getAttribute('data-module') || '').split(/\s+/).filter(Boolean);
        item.style.display = mods.length && !mods.some(m => canView(m)) ? 'none' : '';
      });
      document.querySelectorAll('.nav-subhead').forEach(head => {
        let next = head.nextElementSibling;
        let any = false;
        while (next && !next.classList.contains('nav-subhead')) {
          if (next.classList.contains('nav-item') && next.style.display !== 'none') {
            any = true;
            break;
          }
          next = next.nextElementSibling;
        }
        head.style.display = any ? '' : 'none';
      });
      document.querySelectorAll('.nav-section').forEach(sec => {
        const items = sec.querySelectorAll('.nav-item');
        const head = sec.querySelector('.rail-item');
        const menuId = head && head.dataset.menu;
        const visible = items.length
          ? [...items].some(i => i.style.display !== 'none')
          : !menuId || canViewGroup(menuId);
        sec.style.display = visible ? '' : 'none';
      });
    } catch (e) {
      console.warn('[RBAC] applyNavGating failed:', e);
    }
  }

  let lastPageNotice = 0;
  function noticeBlockedPage() {
    const now = Date.now();
    if (now - lastPageNotice > 1500 && typeof window.showToast === 'function') {
      window.showToast('Halaman ini tidak termasuk akses menu Anda.', 'warning');
    }
    lastPageNotice = now;
  }

  function installNavigateHook() {
    if (typeof window.navigate !== 'function') {
      return;
    }
    const _orig = window.navigate;
    window.navigate = function rbacNavigate(id, ...rest) {
      let target = id;
      // A page outside the user's Akses menu — reached through a link, the
      // search or a notification, as its menu entry is hidden — opens Ringkasan.
      if (target && !viewAllowed(target)) {
        noticeBlockedPage();
        target = 'dashboard';
      }
      const r = _orig.call(this, target, ...rest);
      // Run after the view renders.
      requestAnimationFrame(guardView);
      return r;
    };
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  refreshSnapshot();
  installSaveHook();
  installClickGuard();
  installNavigateHook();
  applyNavGating();
  // The rail DOM may be (re)wired by nav.js slightly later; re-apply on the next
  // frame so gating wins regardless of init order.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(applyNavGating);
  }

  window.RBAC = {
    currentRole,
    isAdmin,
    can,
    canView,
    canWrite,
    canViewGroup,
    canManageUsers,
    canManageSettings,
    canPeriodLock,
    canPermanentDelete,
    refreshSnapshot,
    guardView,
    applyNavGating,
    surfaceFor,
    canViewSurface,
    isRestricted,
    moduleAllowed,
    viewAllowed,
    viewModules,
    accessMenus,
    PERMISSIONS,
    GROUP_MODULE,
    VIEW_MODULE,
    ROLE_SURFACES,
    ENTRI_ACTIONS,
    EXECUTIVE_ANALYTICS,
    ACCESS_GROUPS,
    ALWAYS_ALLOWED,
  };

  console.log('[RBAC] active — role:', currentRole());
})();
