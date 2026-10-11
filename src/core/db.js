// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Database Module (Firestore)
// Replaces localStorage with Firestore for real-time sync
// ═══════════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getCountFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db as firestore, isFirebaseConfigured } from '../config/firebase.js';
import { kvGet, kvSet } from './local-store.js';
import { buildDemoData } from './demo-data.js';

// Global DB object (in-memory cache).
// IMPORTANT: Vite's bundler hoists `DB` as a module-local variable, so
// `DB = ...` inside this module does NOT update the `window.DB` reference
// that classic <script> files read. We must call syncDBGlobal() after every
// reassignment to keep both in sync.
window.DB = {};
let DB = window.DB;
function syncDBGlobal() {
  window.DB = DB;
}

// Collection names synced with Firestore (load + realtime + save + migrate).
// NOTE: journals and accountsChart are intentionally NOT synced — gl-sync.js
// rebuilds them locally from the source documents on every load/save
// (GL.reconcileAll), so each device regenerates its own. auditLog is local-only
// by design. Everything else here is real user data that must sync.
const COLLECTIONS = {
  SALES_ORDERS: 'salesOrders',
  PURCHASE_ORDERS: 'purchaseOrders',
  INVENTORY_ITEMS: 'inventoryItems',
  DELIVERY_ORDERS: 'deliveryOrders',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  PAYMENT_LOGS: 'paymentLogs',
  NOTIFICATIONS: 'notifications',
  ACCOUNTS: 'accounts',
  RESERVATIONS: 'reservations',
  SETTINGS: 'settings',
  FLEET: 'fleet',
  EXPEDITION: 'expedition',
  // Document-flow collections (added 2026-06-06 so all modules sync, not just core)
  SALES_INVOICES: 'salesInvoices',
  PURCHASE_INVOICES: 'purchaseInvoices',
  SALES_RECEIPTS: 'salesReceipts',
  PURCHASE_PAYMENTS: 'purchasePayments',
  SALES_QUOTATIONS: 'salesQuotations',
  PURCHASE_QUOTATIONS: 'purchaseQuotations',
  SALES_RETURNS: 'salesReturns',
  PURCHASE_RETURNS: 'purchaseReturns',
  ITEM_ADJUSTMENTS: 'itemAdjustments',
  ITEM_TRANSFERS: 'itemTransfers',
  WAREHOUSES: 'warehouses',
  // Penerimaan Barang (sales-purchase-extras.js). Was missing here, so user-
  // created receipts never synced to Firestore and were lost on device switch or
  // storage clear; also feeds the (dormant) PO-side status derivation the same
  // way deliveryOrders feed SOs.
  GOODS_RECEIPTS: 'goodsReceipts',
  // Master data: employees (payroll module + department-driven RBAC role
  // assignment). Added so employee records sync across devices.
  EMPLOYEES: 'employees',
  NUMBER_SEQUENCES: 'numberSequences',
  AUDIT_LOG: 'auditLog',
  // Recycle bin (trash.js): deleted records held for one-click restore.
  TRASH: 'trash',
  // Manual journal vouchers (Jurnal Umum, posted accruals, salary payments, opening
  // balances). Derived journals are rebuilt per device; vouchers are user data and
  // must sync. gl.js keeps DB.journals and this store merged.
  JOURNAL_VOUCHERS: 'journalVouchers',
  // Records from the extras modules. Without these entries they only lived in
  // local memory in cloud mode and disappeared on reload / another device.
  SALES_DOWN_PAYMENTS: 'salesDownPayments',
  PURCHASE_DOWN_PAYMENTS: 'purchaseDownPayments',
  SALES_TARGETS: 'salesTargets',
  SUPPLIER_PRICES: 'supplierPrices',
  BUDGETS: 'budgets',
  BUDGET_TRANSFERS: 'budgetTransfers',
  EXPENSE_ACCRUALS: 'expenseAccruals',
  PAYROLL_RUNS: 'payrollRuns',
  OTHER_PAYMENTS: 'otherPayments',
  OTHER_DEPOSITS: 'otherDeposits',
  BANK_TRANSFERS: 'bankTransfers',
  BANK_STATEMENTS: 'bankStatements',
  ITEM_REQUISITIONS: 'itemRequisitions',
  JOB_COSTINGS: 'jobCostings',
  CONTACTS: 'contacts',
  FAVORITE_TRANSACTIONS: 'favoriteTransactions',
};

// Collections stored as a single object document ('default'), not an array.
const OBJECT_COLLECTIONS = new Set(['accounts', 'reservations', 'settings', 'numberSequences']);
function isObjectCollection(name) {
  return OBJECT_COLLECTIONS.has(name);
}

// Real-time listeners
const listeners = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Incremental sync. Firestore bills one read per document returned, so loading
// every collection on each open (and again through each listener's first
// snapshot) made reads grow with the data and the number of opens. Instead:
//   • the server's copy of every synced document is kept in IndexedDB
//     (SYNC_CACHE_KEY, server state only — never un-flushed local edits);
//   • an open asks only for documents with updatedAt ≥ the newest one cached,
//     plus a count per collection: a count that differs from the cache means a
//     document was deleted elsewhere (or lacks updatedAt) → that collection is
//     loaded in full;
//   • listeners watch updatedAt ≥ that same mark, so their first snapshot holds
//     only what changed since the load;
//   • while the app stays open, the counts are compared again every
//     RECONCILE_INTERVAL (deletions of older documents fire no listener event);
//   • a collection is loaded in full at least every SYNC_FULL_RELOAD_AGE.
// updatedAt is held as epoch milliseconds in memory and in the cache; every
// write replaces it with serverTimestamp() as before.
// ─────────────────────────────────────────────────────────────────────────────
const SYNC_CACHE_KEY = 'erp_fs_cache_v1';
const SYNC_FULL_RELOAD_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const RECONCILE_INTERVAL = 30 * 60 * 1000; // 30 minutes
const RECONCILE_ON_FOCUS_AFTER = 10 * 60 * 1000; // 10 minutes
// collectionName → Map(id → record as last seen on the server)
const _serverDocs = new Map();
// collectionName → epoch ms of the last full load of that collection
const _fullLoadedAt = new Map();
// collectionName → Set(id) written by this device and not yet acknowledged.
// While a write waits for the server its updatedAt is a pending server
// timestamp, which Firestore does not match against `updatedAt >= …`, so the
// listener reports the document as removed until the committed version
// arrives; such removals are not deletions.
const _inflight = new Map();
function markInflight(written, name, id) {
  if (!_inflight.has(name)) {
    _inflight.set(name, new Set());
  }
  _inflight.get(name).add(String(id));
  written.push([name, String(id)]);
}
function clearInflight(written) {
  written.forEach(([name, id]) => _inflight.has(name) && _inflight.get(name).delete(id));
}

function toMillis(v) {
  if (v == null) {
    return null;
  }
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v.toMillis === 'function') {
    return v.toMillis();
  }
  if (typeof v.seconds === 'number') {
    return v.seconds * 1000 + (Number(v.nanoseconds) || 0) / 1e6;
  }
  return null;
}

/** A Firestore document as an in-memory record (updatedAt as epoch ms). */
function fromServer(snap) {
  const data = snap.data() || {};
  const rec = { id: snap.id, ...data };
  if ('updatedAt' in data) {
    rec.updatedAt = toMillis(data.updatedAt);
  }
  return rec;
}

// Firestore returns documents ordered by id; keep that order after merging.
function byIdOrder(a, b) {
  const x = String(a.id);
  const y = String(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
}

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function newestUpdate(records) {
  let max = null;
  for (const r of records) {
    const t = r && typeof r.updatedAt === 'number' ? r.updatedAt : null;
    if (t != null && (max == null || t > max)) {
      max = t;
    }
  }
  return max;
}

function cacheProject() {
  try {
    return (firestore && firestore.app && firestore.app.options.projectId) || '';
  } catch (_) {
    return '';
  }
}

async function readSyncCache() {
  try {
    const c = await kvGet(SYNC_CACHE_KEY);
    if (!c || c.v !== 1 || c.project !== cacheProject() || !c.collections) {
      return null;
    }
    return c;
  } catch (_) {
    return null;
  }
}

let _cachePersistTimer = null;
function scheduleCachePersist() {
  if (_cachePersistTimer) {
    clearTimeout(_cachePersistTimer);
  }
  _cachePersistTimer = setTimeout(persistSyncCache, 1500);
}

function persistSyncCache() {
  _cachePersistTimer = null;
  const collections = {};
  for (const [name, docs] of _serverDocs) {
    collections[name] = { docs: [...docs.values()], fullAt: _fullLoadedAt.get(name) || 0 };
  }
  kvSet(SYNC_CACHE_KEY, { v: 1, project: cacheProject(), savedAt: Date.now(), collections }).catch(
    e => console.warn('[DB] sync cache not saved:', e)
  );
}

export { persistSyncCache as _persistSyncCache };

/** Forget the cached server data (logout, reset, migration). */
export async function clearSyncCache() {
  if (_cachePersistTimer) {
    clearTimeout(_cachePersistTimer);
    _cachePersistTimer = null;
  }
  _serverDocs.clear();
  _fullLoadedAt.clear();
  try {
    await kvSet(SYNC_CACHE_KEY, null);
  } catch (_) {
    /* ignore */
  }
}

async function loadFullCollection(name) {
  const snap = await getDocs(collection(firestore, name));
  const docs = [];
  snap.forEach(d => docs.push(fromServer(d)));
  docs.sort(byIdOrder);
  return { name, docs, fullAt: Date.now() };
}

/**
 * One collection for loadDB: the cached copy plus the documents changed since
 * its newest update, or a full load when there is no usable cache, the cache is
 * older than SYNC_FULL_RELOAD_AGE, or the count on the server differs.
 */
async function loadCollection(name, cached) {
  const usable =
    cached &&
    Array.isArray(cached.docs) &&
    Date.now() - (Number(cached.fullAt) || 0) < SYNC_FULL_RELOAD_AGE;
  const since = usable ? newestUpdate(cached.docs) : null;
  if (since != null) {
    try {
      const ref = collection(firestore, name);
      const [changed, counted] = await Promise.all([
        getDocs(query(ref, where('updatedAt', '>=', Timestamp.fromMillis(since)))),
        getCountFromServer(ref),
      ]);
      const byId = new Map(cached.docs.filter(r => r && r.id != null).map(r => [String(r.id), r]));
      changed.forEach(d => byId.set(d.id, fromServer(d)));
      if (counted.data().count === byId.size) {
        return { name, docs: [...byId.values()].sort(byIdOrder), fullAt: cached.fullAt };
      }
    } catch (e) {
      console.warn(`[DB] incremental load of ${name} failed, loading it in full:`, e.message);
    }
  }
  return loadFullCollection(name);
}

// Local-first persistence: when Firestore is unavailable, the whole DB is
// mirrored to IndexedDB (store 'kv' of database 'nsa-local') so data survives a
// page refresh. localStorage is only used as a legacy/migration source and as
// the handoff channel from import.html — it caps at ~5–10MB and the dataset
// already exceeds that comfort zone.
const LOCAL_KEY = 'erp_db_v1';
// Remember a Firestore outage so we don't re-probe (and block boot) on every
// refresh. Retry at most once per interval.
const FS_FAIL_KEY = 'erp_fs_unavailable_until';
const FS_RETRY_INTERVAL = 30 * 60 * 1000; // 30 minutes
let usingLocalStore = false;

/**
 * Read the locally persisted DB. Priority:
 *   1. localStorage erp_db_v1 — legacy data or a fresh import.html handoff.
 *      Migrated into IndexedDB and removed (frees the localStorage quota).
 *   2. IndexedDB 'nsa-local'/kv/erp_db_v1 — the normal storage backend.
 * Returns the parsed object or null.
 */
async function readLocalSaved() {
  // localStorage first: import.html writes here, and pre-IndexedDB installs
  // still have their data here. Either way it wins, then moves to IndexedDB.
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      try {
        await kvSet(LOCAL_KEY, parsed);
        localStorage.removeItem(LOCAL_KEY);
        console.warn('[DB] Migrated local data localStorage → IndexedDB');
      } catch (e) {
        console.warn('[DB] IndexedDB migration failed, keeping localStorage copy:', e);
      }
      return parsed;
    }
  } catch (_) {
    /* localStorage unavailable or corrupt — fall through to IndexedDB */
  }

  try {
    const saved = await kvGet(LOCAL_KEY);
    if (saved && typeof saved === 'object') {
      return saved;
    }
  } catch (e) {
    console.warn('[DB] IndexedDB read failed:', e);
  }
  return null;
}

/** Load the DB from IndexedDB/localStorage, or seed defaults on first run. */
async function loadLocal(reason) {
  let saved;
  try {
    saved = await readLocalSaved();
  } catch (_) {
    saved = null;
  }

  // Drop an empty saved copy so we fall through to the (empty) defaults seed.
  if (
    saved &&
    !(
      (saved.salesOrders || []).length > 0 ||
      (saved.inventoryItems || []).length > 0 ||
      (saved.customers || []).length > 0
    )
  ) {
    saved = null;
  }

  if (saved) {
    DB = normalizeImportedDB(saved);
    console.warn(`[DB] Loaded local data from IndexedDB (${reason})`);
  } else {
    // No local data yet: start from the demo dataset (empty when demo seeding is
    // disabled, see _demoSeedEnabled), so every screen is populated on first run.
    DB = normalizeImportedDB(initialData());
    console.warn(`[DB] No local data yet — seeded initial data (${reason})`);
  }

  applyDefaults();
  usingLocalStore = true;
  try {
    window.__nsaDataMode = 'local';
  } catch (_) {
    /* ignore */
  }
  persistLocal();
}

// Serialized fire-and-forget IndexedDB writes: at most one put in flight, and a
// burst of saves coalesces into a single trailing write of the latest state.
let _persistInFlight = false;
let _persistQueued = false;

/** Persist the entire in-memory DB to IndexedDB (async, coalesced). */
function persistLocal() {
  if (_persistInFlight) {
    _persistQueued = true;
    return true;
  }
  _persistInFlight = true;
  // The write captures whatever DB holds at put() time — with coalescing that
  // is always the latest state, which is exactly what we want persisted.
  kvSet(LOCAL_KEY, DB)
    .catch(err => {
      // DataCloneError (non-cloneable value snuck into DB) → JSON round-trip
      // strips it; other errors are surfaced.
      if (err && err.name === 'DataCloneError') {
        return kvSet(LOCAL_KEY, JSON.parse(JSON.stringify(DB)));
      }
      throw err;
    })
    .catch(err => {
      console.error('[DB] Failed to persist to IndexedDB:', err);
      try {
        showToast('Gagal menyimpan data lokal', 'danger');
      } catch (_) {
        /* ignore */
      }
    })
    .finally(() => {
      _persistInFlight = false;
      if (_persistQueued) {
        _persistQueued = false;
        persistLocal();
      }
    });
  return true;
}

/** Whether demo seeding is enabled (default on; set VITE_SEED_DEMO=false to disable). */
function _demoSeedEnabled() {
  try {
    return import.meta.env.VITE_SEED_DEMO !== 'false';
  } catch (_) {
    return true;
  }
}

/**
 * Seed the generic dummy dataset into an empty (first-run) Firestore database and
 * persist it, so a fresh cloud deploy starts populated just like local mode.
 * No-op when the DB already has data or seeding is disabled.
 */
async function seedDemoIfEmpty() {
  if (!_demoSeedEnabled()) {
    return false;
  }
  const empty = !(
    (DB.customers || []).length ||
    (DB.inventoryItems || []).length ||
    (DB.salesOrders || []).length
  );
  if (!empty) {
    return false;
  }
  const demo = initialData();
  Object.keys(demo).forEach(key => {
    if (Array.isArray(demo[key]) && !(DB[key] && DB[key].length)) {
      DB[key] = demo[key];
    }
  });
  if (!DB.reservations || !Object.keys(DB.reservations).length) {
    DB.reservations = demo.reservations;
  }
  // The demo documents refer to these settings lists; keep what is already there.
  const settings = DB.settings || (DB.settings = {});
  const accountIds = new Set((settings.bankAccounts || []).map(a => a.id));
  settings.bankAccounts = (settings.bankAccounts || []).concat(
    demo.settings.bankAccounts.filter(a => !accountIds.has(a.id))
  );
  ['itemCategories', 'units'].forEach(key => {
    settings[key] = [...new Set([...(settings[key] || []), ...demo.settings[key]])];
  });
  syncDBGlobal();
  try {
    // Persist the freshly seeded collections to Firestore (dirty vs the empty
    // baseline just taken), so the data survives reloads on the deployed site.
    await saveDB();
    console.warn('[DB] Seeded demo dataset into empty Firestore database');
  } catch (e) {
    console.warn('[DB] Demo seed persist failed (kept in memory):', e);
  }
  return true;
}

/**
 * Initialize database - Load all collections from Firestore
 */
export async function loadDB() {
  // Without credentials, Firestore calls retry for ~30s before failing and
  // block boot. Use local persistence instead.
  if (!isFirebaseConfigured) {
    await loadLocal('Firebase not configured');
    return false;
  }

  // If Firestore was recently found unavailable, skip the (slow) probe so
  // refreshes are instant. We retry at most once per FS_RETRY_INTERVAL.
  let failUntil = 0;
  try {
    failUntil = parseInt(localStorage.getItem(FS_FAIL_KEY) || '0', 10) || 0;
  } catch (_) {
    /* ignore */
  }
  if (Date.now() < failUntil) {
    await loadLocal('Firestore recently unavailable');
    return false;
  }

  try {
    // eslint-disable-next-line no-console
    console.log('[DB] Loading data from Firestore...');

    // Load all collections in parallel: from the sync cache plus what changed
    // since, or in full (see loadCollection).
    const cache = await readSyncCache();
    const promises = Object.values(COLLECTIONS).map(name =>
      loadCollection(name, cache && cache.collections[name])
    );

    // If Firestore is unreachable (e.g. the database isn't provisioned) the SDK
    // retries for ~30s and would block boot. Cap the wait and fall back.
    // 15s (was 4s): now loads 25 collections in parallel, and a first cold
    // connect to a regional DB (e.g. asia-southeast2) over the auth handshake can
    // legitimately take >4s. The outage is cached for 30 min so this longer wait
    // is only paid once when Firestore is genuinely down.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore load timed out')), 15000)
    );
    const results = await Promise.race([Promise.all(promises), timeout]);

    // Populate DB object. DB gets copies: screens edit records in place, and the
    // server copy (and the cache made from it) must not see un-flushed edits.
    // Keyed by the camelCase collection name (e.g. "salesOrders"), which is what
    // the rest of the app reads from DB.
    results.forEach(({ name, docs, fullAt }) => {
      _serverDocs.set(name, new Map(docs.map(r => [String(r.id), r])));
      _fullLoadedAt.set(name, fullAt);
      if (isObjectCollection(name)) {
        // These are objects, not arrays
        DB[name] = docs.length > 0 ? clone(docs[0]) : getDefaultValue(name);
      } else {
        DB[name] = docs.map(clone);
      }
    });
    scheduleCachePersist();

    // Load the GL seed (Accurate journals + chart of accounts) from the
    // auth-gated glSeed collection. This is the sole source for that data now
    // (it replaced the public accurate-data.json).
    await loadGlSeed();

    // Apply defaults for missing data
    applyDefaults();

    // Everything in memory now matches Firestore — baseline the dirty tracker
    // so the first saveDB() only writes records changed after this point.
    rebaselineSaved();

    // First-run demo seed: if the cloud database is empty, populate it with the
    // generic dummy dataset (and persist to Firestore) so every screen — and the
    // "Kesiapan Data Perusahaan" checklist — is filled on a fresh deploy too, not
    // just in local mode. Disable by setting VITE_SEED_DEMO=false.
    await seedDemoIfEmpty();

    // Set up real-time listeners, and the periodic count check for deletions
    setupRealtimeListeners();
    startReconcileLoop();

    // eslint-disable-next-line no-console
    console.log('✓ Data loaded from Firestore');
    usingLocalStore = false;
    try {
      window.__nsaDataMode = 'firestore';
    } catch (_) {
      /* ignore */
    }
    try {
      localStorage.removeItem(FS_FAIL_KEY);
    } catch (_) {
      /* ignore */
    }
    return true;
  } catch (error) {
    console.warn('[DB] Firestore unavailable, using local storage:', error.message);
    try {
      localStorage.setItem(FS_FAIL_KEY, String(Date.now() + FS_RETRY_INTERVAL));
    } catch (_) {
      /* ignore */
    }

    // Fall back to local persistence (IndexedDB), seeded from defaults.
    await loadLocal('Firestore unavailable');
    try {
      showToast('Mode offline — data disimpan di perangkat ini', 'warning');
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dirty-collection tracking. Almost every call site invokes saveDB() with no
// arguments after touching a single record, so a naive full-DB save rewrites
// thousands of unchanged documents per CRUD action — enough to blow the
// Firestore free-tier daily write quota ("resource-exhausted"). Instead we keep
// a per-collection snapshot of what Firestore last saw and only write the
// records whose serialized form actually differs (plus deletes for records
// that vanished).
// ─────────────────────────────────────────────────────────────────────────────

// collectionName → Map(id → JSON of record) for array collections,
// or the JSON string of the whole document for object collections.
const _savedSnapshot = new Map();

function snapshotOf(name, data) {
  if (isObjectCollection(name) || !Array.isArray(data)) {
    return JSON.stringify(data == null ? null : data);
  }
  const map = new Map();
  data.forEach(item => {
    if (item && item.id != null) {
      map.set(String(item.id), JSON.stringify(item));
    }
  });
  return map;
}

function markCollectionSaved(name, data) {
  _savedSnapshot.set(name, snapshotOf(name, data));
}

/** Re-baseline every synced collection as "already saved" (e.g. after load). */
export function rebaselineSaved() {
  for (const name of Object.values(COLLECTIONS)) {
    markCollectionSaved(name, DB[name]);
  }
}

/**
 * Compute what changed in a collection since the last successful save.
 * Returns null when nothing changed (or the collection is absent from DB).
 */
function diffCollection(name) {
  const data = DB[name];
  if (data == null) {
    return null;
  }

  if (isObjectCollection(name) || !Array.isArray(data)) {
    const json = JSON.stringify(data);
    if (_savedSnapshot.get(name) === json) {
      return null;
    }
    return { kind: 'object', data, snapshot: json };
  }

  const prev = _savedSnapshot.get(name);
  const prevMap = prev instanceof Map ? prev : new Map();
  const nextMap = new Map();
  const sets = [];
  for (const item of data) {
    if (!item || item.id == null) {
      continue;
    }
    const id = String(item.id);
    const json = JSON.stringify(item);
    nextMap.set(id, json);
    if (prevMap.get(id) !== json) {
      sets.push(item);
    }
  }
  const deletes = [];
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      deletes.push(id);
    }
  }
  if (sets.length === 0 && deletes.length === 0) {
    return null;
  }
  return { kind: 'array', sets, deletes, snapshot: nextMap };
}

/** Recursively remove undefined values so Firestore WriteBatch.set() doesn't reject them. */
function stripUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined);
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (obj[k] !== undefined) {
        out[k] = stripUndefined(obj[k]);
      }
    }
    return out;
  }
  return obj;
}

// Identity stamped onto every write so a record carries who last touched it
// (audit + concurrent-edit forensics). Read from the auth session written by
// auth.js (SESSION_KEY 'erp_session') to avoid an import cycle with auth.js.
function currentUserName() {
  try {
    const raw = sessionStorage.getItem('erp_session');
    if (!raw) {
      return null;
    }
    const s = JSON.parse(raw);
    return (s && s.username) || null;
  } catch (_) {
    return null;
  }
}

/** Write only the dirty records of dirty collections, in ≤450-op batches. */
async function flushDirtyCollections() {
  const dirty = [];
  for (const name of Object.values(COLLECTIONS)) {
    const diff = diffCollection(name);
    if (diff) {
      dirty.push([name, diff]);
    }
  }
  if (dirty.length === 0) {
    return;
  }

  let batch = writeBatch(firestore);
  let ops = 0;
  let total = 0;
  const addOp = async () => {
    ops++;
    total++;
    // Firestore batch limit is 500 operations — commit and start a fresh batch
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(firestore);
      ops = 0;
    }
  };

  const updatedBy = currentUserName();
  const written = [];
  try {
    for (const [name, diff] of dirty) {
      if (diff.kind === 'object') {
        markInflight(written, name, 'default');
        batch.set(
          doc(firestore, name, 'default'),
          stripUndefined({
            ...diff.data,
            updatedAt: serverTimestamp(),
            ...(updatedBy ? { updatedBy } : {}),
          }),
          { merge: true }
        );
        await addOp();
        continue;
      }
      for (const item of diff.sets) {
        markInflight(written, name, item.id);
        batch.set(
          doc(firestore, name, String(item.id)),
          stripUndefined({
            ...item,
            updatedAt: serverTimestamp(),
            ...(updatedBy ? { updatedBy } : {}),
          }),
          { merge: true }
        );
        await addOp();
      }
      for (const id of diff.deletes) {
        markInflight(written, name, id);
        batch.delete(doc(firestore, name, id));
        await addOp();
      }
    }
    if (ops > 0) {
      await batch.commit();
    }
  } finally {
    clearInflight(written);
  }

  // Baseline only after every batch committed; a partial failure simply
  // rewrites the affected records on the next flush (sets are merge-idempotent).
  let deleted = false;
  for (const [name, diff] of dirty) {
    _savedSnapshot.set(name, diff.snapshot);
    // A deleted document leaves the server copy now: listeners only report
    // deletions of documents changed since the load.
    if (diff.kind === 'array' && diff.deletes.length && _serverDocs.has(name)) {
      diff.deletes.forEach(id => _serverDocs.get(name).delete(id));
      deleted = true;
    }
  }
  if (deleted) {
    scheduleCachePersist();
  }
  // eslint-disable-next-line no-console
  console.log(`✓ Data saved to Firestore (${total} operations, ${dirty.length} collections)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GL seed (auth-gated). journals (the Accurate-sourced JVs needed for P&L) and
// accountsChart are NOT in the synced COLLECTIONS and used to come from the
// public accurate-data.json — a confidentiality leak. They now live in the
// admin-writable, signed-in-readable `glSeed` Firestore collection:
//   glSeed/meta          { version, migratedAt, journalChunks, journalCount }
//   glSeed/accountsChart { items: [...] }
//   glSeed/journals_NNN  { items: [...] }   (journals chunked < 1 MB/doc)
// loadGlSeed() populates DB.journals / DB.accountsChart from there.
// ─────────────────────────────────────────────────────────────────────────────
const GL_SEED = 'glSeed';

async function loadGlSeed() {
  try {
    const snap = await getDocs(collection(firestore, GL_SEED));
    if (snap.empty) {
      return false; // glSeed empty (offline/first cold start) — journals come from the local snapshot
    }
    let accountsChart = null;
    const chunks = [];
    snap.forEach(d => {
      if (d.id === 'accountsChart') {
        accountsChart = d.data().items;
      } else if (d.id.startsWith('journals_')) {
        chunks.push([d.id, d.data().items || []]);
      }
    });
    chunks.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const journals = chunks.flatMap(c => c[1]);
    if (journals.length > 0) {
      DB.journals = journals;
    }
    if (Array.isArray(accountsChart) && accountsChart.length > 0) {
      DB.accountsChart = accountsChart;
    }
    syncDBGlobal();
    // eslint-disable-next-line no-console
    console.log(
      `[DB] GL seed loaded from Firestore: ${journals.length} journals, ${(accountsChart || []).length} accounts`
    );
    return true;
  } catch (e) {
    console.warn('[DB] loadGlSeed failed:', e.message);
    return false;
  }
}

// NOTE: the one-time glSeed migration helper (window.__migrateGlToFirestore) and
// the deployed-JSON reseed machinery (maybeReseedFirestore + mergeDeployedData)
// were removed when the public accurate-data.json was deleted. Updating the GL
// seed in future re-scrapes is now an admin task that writes the glSeed docs
// directly (see scripts/ + docs); there is no public JSON to merge from anymore.

// Debounced, serialized flushing: a burst of saveDB() calls (e.g. a CRUD action
// that touches several collections) coalesces into one diff+commit, and at most
// one flush is in flight at a time. All callers in a burst share one promise.
const SAVE_DEBOUNCE_MS = 250;
let _saveTimer = null;
let _savePromise = null;
let _saveResolve = null;
let _saveReject = null;
let _saveInFlight = false;
let _saveRerun = false;

function scheduleSave() {
  if (!_savePromise) {
    _savePromise = new Promise((resolve, reject) => {
      _saveResolve = resolve;
      _saveReject = reject;
    });
  }
  if (_saveTimer) {
    clearTimeout(_saveTimer);
  }
  _saveTimer = setTimeout(runScheduledSave, SAVE_DEBOUNCE_MS);
  return _savePromise;
}

function runScheduledSave() {
  _saveTimer = null;
  if (_saveInFlight) {
    _saveRerun = true;
    return;
  }
  const resolve = _saveResolve || (() => {});
  const reject = _saveReject || (() => {});
  _savePromise = null;
  _saveResolve = null;
  _saveReject = null;
  _saveInFlight = true;
  flushDirtyCollections()
    .then(() => resolve())
    .catch(error => {
      reportSaveError(error);
      reject(error);
    })
    .finally(() => {
      _saveInFlight = false;
      if (_saveRerun) {
        _saveRerun = false;
        runScheduledSave();
      }
    });
}

/** Flush any pending debounced save immediately (e.g. on page unload). */
export function flushPendingSaves() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (!_savePromise && !_saveInFlight) {
    return Promise.resolve();
  }
  const pending = _savePromise || Promise.resolve();
  runScheduledSave();
  return pending;
}

function reportSaveError(error) {
  console.error('Failed to save data to Firestore:', error);
  // permission-denied almost always means the signed-in user hasn't verified
  // their email yet (Firestore rules require email_verified for writes).
  // Surface an actionable message instead of a generic failure.
  try {
    if (error && error.code === 'permission-denied') {
      showToast(
        'Gagal menyimpan: email belum diverifikasi. Cek banner verifikasi di atas.',
        'danger'
      );
    } else {
      showToast('Gagal menyimpan data ke server', 'danger');
    }
  } catch (_) {
    /* toast unavailable (early boot) */
  }
}

/**
 * Save data to Firestore
 * @param {string} collectionName - Collection to save
 * @param {object|array} data - Data to save
 */
export async function saveDB(collectionName = null, data = null) {
  // Local-first mode: mirror the whole DB to IndexedDB and stop here.
  if (usingLocalStore) {
    persistLocal();
    return;
  }

  // If specific collection provided, save only that (immediately).
  if (collectionName && data) {
    try {
      await saveCollection(collectionName, data);
      markCollectionSaved(collectionName, data);
      // eslint-disable-next-line no-console
      console.log(`✓ ${collectionName} saved to Firestore`);
    } catch (error) {
      reportSaveError(error);
      throw error;
    }
    return;
  }

  // Otherwise diff the whole DB against the last-saved snapshot and write only
  // what changed (debounced so rapid CRUD bursts coalesce into one commit).
  return scheduleSave();
}

/**
 * Save a single collection
 */
async function saveCollection(collectionName, data) {
  const updatedBy = currentUserName();
  const written = [];
  try {
    await writeCollection(collectionName, data, updatedBy, written);
  } finally {
    clearInflight(written);
  }
}

async function writeCollection(collectionName, data, updatedBy, written) {
  if (Array.isArray(data)) {
    // Save array items in chunks — a Firestore writeBatch caps at 500 ops.
    for (let i = 0; i < data.length; i += 450) {
      const batch = writeBatch(firestore);
      data.slice(i, i + 450).forEach(item => {
        markInflight(written, collectionName, item.id);
        const docRef = doc(firestore, collectionName, String(item.id));
        batch.set(
          docRef,
          {
            ...item,
            updatedAt: serverTimestamp(),
            ...(updatedBy ? { updatedBy } : {}),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  } else {
    // Save single object
    markInflight(written, collectionName, 'default');
    const docRef = doc(firestore, collectionName, 'default');
    await setDoc(
      docRef,
      {
        ...data,
        updatedAt: serverTimestamp(),
        ...(updatedBy ? { updatedBy } : {}),
      },
      { merge: true }
    );
  }
}

/**
 * Fold a remote snapshot into an array collection without clobbering unsaved
 * local edits. Remote docs win everywhere EXCEPT ids with pending (un-flushed)
 * local changes, which stay local — the debounced saveDB flush writes them out
 * moments later (local-wins last-write semantics, but no longer silent).
 * The dirty baseline is set to the REMOTE state so those pending edits remain
 * dirty and actually flush. Returns the number of true conflicts (docs changed
 * both locally and remotely since the last sync).
 */
function mergeRemoteSnapshot(name, remoteData) {
  const localDiff = diffCollection(name);
  if (!localDiff || localDiff.kind !== 'array') {
    DB[name] = remoteData;
    markCollectionSaved(name, remoteData);
    return 0;
  }

  const prev = _savedSnapshot.get(name);
  const baseline = prev instanceof Map ? prev : new Map();
  const pendingEdits = new Map(localDiff.sets.map(item => [String(item.id), item]));
  const pendingDeletes = new Set(localDiff.deletes);
  const remoteIds = new Set();
  let conflicts = 0;
  const merged = [];

  for (const rec of remoteData) {
    const id = String(rec.id);
    remoteIds.add(id);
    if (pendingDeletes.has(id)) {
      continue; // deleted locally — the flush will delete it remotely too
    }
    const local = pendingEdits.get(id);
    if (local) {
      // Changed remotely as well (differs from what this device last synced)?
      const base = baseline.get(id);
      if (base === undefined || base !== JSON.stringify(rec)) {
        conflicts++;
      }
      merged.push(local);
    } else {
      merged.push(rec);
    }
  }
  // Pending local docs the server doesn't have (created here, or deleted
  // remotely while being edited here) stay — the flush re-creates them.
  for (const [id, local] of pendingEdits) {
    if (!remoteIds.has(id)) {
      merged.push(local);
    }
  }

  DB[name] = merged;
  markCollectionSaved(name, remoteData);
  return conflicts;
}

// Test hook: exercised directly in tests (the onSnapshot plumbing is mocked away).
export { mergeRemoteSnapshot as _mergeRemoteSnapshot };

// JSON with sorted keys, so field order doesn't count as a difference.
function stableJson(v) {
  if (Array.isArray(v)) {
    return '[' + v.map(stableJson).join(',') + ']';
  }
  if (v && typeof v === 'object') {
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map(k => JSON.stringify(k) + ':' + stableJson(v[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v);
}

// A record's content for the conflict check, without the stamps every write
// changes (updatedAt, updatedBy): an echo of this device's own save is not a
// change made elsewhere.
function contentOf(json) {
  try {
    const o = JSON.parse(json);
    if (o && typeof o === 'object') {
      delete o.updatedAt;
      delete o.updatedBy;
    }
    return stableJson(o);
  } catch (_) {
    return json;
  }
}

/**
 * Fold changed documents from a listener into an array collection — the
 * per-document form of mergeRemoteSnapshot, with the same rules: un-flushed
 * local edits and deletions stay local (and still flush), everything else
 * takes the server's version. `removedIds` are documents deleted on the server.
 * Returns the number of true conflicts.
 */
function mergeRemoteChanges(name, upserts, removedIds) {
  const localDiff = diffCollection(name);
  const pendingEdits = new Set();
  const pendingDeletes = new Set();
  if (localDiff && localDiff.kind === 'array') {
    localDiff.sets.forEach(item => pendingEdits.add(String(item.id)));
    localDiff.deletes.forEach(id => pendingDeletes.add(id));
  }
  const prev = _savedSnapshot.get(name);
  const baseline = prev instanceof Map ? prev : new Map();
  const current = new Map(
    (Array.isArray(DB[name]) ? DB[name] : [])
      .filter(r => r && r.id != null)
      .map(r => [String(r.id), r])
  );
  let conflicts = 0;
  for (const rec of upserts) {
    const id = String(rec.id);
    const json = JSON.stringify(rec);
    if (pendingDeletes.has(id)) {
      baseline.set(id, json); // deleted here — the flush deletes it remotely
      continue;
    }
    if (pendingEdits.has(id) && current.has(id)) {
      // The server now holds what this device holds (the echo of its own save):
      // take the server copy, nothing is pending any more.
      if (contentOf(JSON.stringify(current.get(id))) === contentOf(json)) {
        current.set(id, rec);
        baseline.set(id, json);
        continue;
      }
    }
    if (pendingEdits.has(id)) {
      const base = baseline.get(id);
      if (base === undefined || contentOf(base) !== contentOf(json)) {
        conflicts++;
      }
      baseline.set(id, json); // local edit stays dirty against the remote → flushes
      continue;
    }
    current.set(id, rec);
    baseline.set(id, json);
  }
  for (const id of removedIds) {
    baseline.delete(id);
    if (!pendingEdits.has(id)) {
      current.delete(id); // edited here while deleted elsewhere: kept, re-created
    }
  }
  DB[name] = [...current.values()].sort(byIdOrder);
  _savedSnapshot.set(name, baseline);
  return conflicts;
}
export { mergeRemoteChanges as _mergeRemoteChanges };

let _conflictToastAt = 0;
function notifyEditConflict(name, count) {
  // At most one warning per 10s — the flush right after resolves the state.
  const now = Date.now();
  if (now - _conflictToastAt < 10_000) {
    return;
  }
  _conflictToastAt = now;
  try {
    showToast(
      `Konflik edit di ${name} (${count} dokumen): perangkat lain menyimpan versi berbeda — perubahan Anda dipertahankan.`,
      'warning'
    );
  } catch (_) {
    /* ignore */
  }
  console.warn(`[DB] concurrent edit on ${name}: ${count} doc(s) changed locally AND remotely`);
}

/**
 * Set up real-time listeners for all collections
 */
// Coalesce the burst of per-collection snapshots into a single active-view
// re-render. Also records the last sync time for the status indicator.
let _remoteRefreshScheduled = false;
function scheduleRemoteRefresh() {
  try {
    window.__nsaLastSync = Date.now();
  } catch (_) {
    /* ignore */
  }
  if (_remoteRefreshScheduled) {
    return;
  }
  _remoteRefreshScheduled = true;
  const run = () => {
    _remoteRefreshScheduled = false;
    try {
      if (typeof navigate === 'function' && typeof activeView !== 'undefined' && activeView) {
        if (typeof _renderedViews !== 'undefined') {
          try {
            _renderedViews.delete(activeView);
          } catch (_) {
            /* ignore */
          }
        }
        navigate(activeView);
      }
    } catch (e) {
      console.warn('[DB] remote refresh failed:', e);
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

// After a remote change reached DB: keep the global handle, the ledger and the
// integrity/recycle-bin/RBAC baselines in step, and redraw the open screen.
function afterRemoteChange(name) {
  // SO/PO status is owned by the sync script (Accurate authority); do not
  // re-derive from DO linkage here (see applyDefaults note + _deriveOrderStatuses).
  syncDBGlobal();

  // Vouchers synced from another device must reach DB.journals before the
  // integrity/RBAC snapshots re-baseline below; otherwise the next local
  // save would treat them as local additions.
  if (name === 'journalVouchers' && window.GL && typeof window.GL.reconcileAll === 'function') {
    try {
      window.GL.reconcileAll();
    } catch (e) {
      console.warn('[DB] ledger merge after voucher sync failed:', e);
    }
  }

  // A remote change just reached a local collection. Re-baseline the
  // data-integrity snapshot (integrity.js) so the next local save diffs
  // against the synced state — otherwise audit/period-lock would misfire
  // on records that arrived via sync, not via this device.
  if (window.Integrity && typeof window.Integrity.refreshSnapshot === 'function') {
    window.Integrity.refreshSnapshot();
  }
  // Same for the recycle bin (trash.js): records removed by a remote sync
  // were already binned on the deleting device — don't re-capture them.
  if (window.Trash && typeof window.Trash.refreshSnapshot === 'function') {
    window.Trash.refreshSnapshot();
  }
  // Same for the RBAC safety net (rbac.js): a remote-synced change is not a
  // local edit, so re-baseline before the next save diffs against it.
  if (window.RBAC && typeof window.RBAC.refreshSnapshot === 'function') {
    window.RBAC.refreshSnapshot();
  }

  // Re-render the active view on any relevant remote change. Most views
  // aggregate several collections, so refresh broadly (coalesced to one
  // render per animation frame to absorb a multi-collection burst).
  scheduleRemoteRefresh();
}

/** Server changes to one collection (from a listener) into the server copy and DB. */
function applyRemoteChanges(name, upserts, removedIds) {
  const server = _serverDocs.get(name) || new Map();
  _serverDocs.set(name, server);
  upserts.forEach(r => server.set(String(r.id), r));
  removedIds.forEach(id => server.delete(id));

  if (isObjectCollection(name)) {
    // Object collections replace outright and re-baseline (single document).
    const rec = server.get('default') || server.values().next().value;
    DB[name] = rec ? clone(rec) : getDefaultValue(name);
    markCollectionSaved(name, DB[name]);
  } else {
    // Array collections merge so a remote change can't silently clobber local
    // edits that haven't flushed yet — conflicts are surfaced, not dropped.
    const conflicts = mergeRemoteChanges(name, upserts.map(clone), removedIds);
    if (conflicts > 0) {
      notifyEditConflict(name, conflicts);
    }
  }
  afterRemoteChange(name);
  scheduleCachePersist();
}

/**
 * Set up real-time listeners for all collections. Each one watches the
 * documents updated at or after the newest one loaded, so its first snapshot
 * holds only what changed since (a collection without updatedAt is watched
 * whole).
 */
function setupRealtimeListeners() {
  Object.values(COLLECTIONS).forEach(name => {
    // Skip if listener already exists
    if (listeners.has(name)) {
      return;
    }
    const ref = collection(firestore, name);
    const since = newestUpdate((_serverDocs.get(name) || new Map()).values());
    const target =
      since == null ? ref : query(ref, where('updatedAt', '>=', Timestamp.fromMillis(since)));

    const unsubscribe = onSnapshot(
      target,
      snapshot => {
        const upserts = [];
        const removed = [];
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            // updatedAt only grows, so leaving the result set means deleted —
            // except for this device's own writes awaiting the server (see
            // _inflight); object collections are never deleted one by one.
            const own = _inflight.get(name);
            if (!isObjectCollection(name) && !(own && own.has(change.doc.id))) {
              removed.push(change.doc.id);
            }
          } else if (!(change.doc.metadata && change.doc.metadata.hasPendingWrites)) {
            // This device's own un-committed writes are skipped; the committed
            // version follows with the server's updatedAt.
            upserts.push(fromServer(change.doc));
          }
        });
        if (upserts.length || removed.length) {
          applyRemoteChanges(name, upserts, removed);
        }
      },
      error => {
        console.error(`Listener error for ${name}:`, error);
      }
    );

    listeners.set(name, unsubscribe);
  });

  // eslint-disable-next-line no-console
  console.log('✓ Real-time listeners active');
}

/**
 * Compare each collection's count on the server with the server copy held
 * here; a difference (a document deleted elsewhere, which no listener reports
 * for documents older than the load) reloads that collection in full.
 */
let _lastReconcile = 0;
let _reconcileRunning = false;
async function reconcileCounts() {
  if (usingLocalStore || !firestore || _reconcileRunning) {
    return;
  }
  _reconcileRunning = true;
  _lastReconcile = Date.now();
  try {
    const names = Object.values(COLLECTIONS);
    const counts = await Promise.all(
      names.map(name =>
        getCountFromServer(collection(firestore, name))
          .then(c => c.data().count)
          .catch(() => null)
      )
    );
    let changed = false;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (counts[i] == null || counts[i] === (_serverDocs.get(name) || new Map()).size) {
        continue;
      }
      try {
        const { docs, fullAt } = await loadFullCollection(name);
        _serverDocs.set(name, new Map(docs.map(r => [String(r.id), r])));
        _fullLoadedAt.set(name, fullAt);
        if (isObjectCollection(name)) {
          DB[name] = docs.length > 0 ? clone(docs[0]) : getDefaultValue(name);
          markCollectionSaved(name, DB[name]);
        } else {
          const conflicts = mergeRemoteSnapshot(name, docs.map(clone));
          if (conflicts > 0) {
            notifyEditConflict(name, conflicts);
          }
        }
        afterRemoteChange(name);
        changed = true;
      } catch (e) {
        console.warn(`[DB] reload of ${name} failed:`, e.message);
      }
    }
    if (changed) {
      scheduleCachePersist();
    }
  } finally {
    _reconcileRunning = false;
  }
}
export { reconcileCounts as _reconcileCounts };

let _reconcileTimer = null;
function startReconcileLoop() {
  if (_reconcileTimer || typeof document === 'undefined') {
    return;
  }
  const visible = () => document.visibilityState !== 'hidden';
  _reconcileTimer = setInterval(() => {
    if (visible()) {
      reconcileCounts();
    }
  }, RECONCILE_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (visible() && Date.now() - _lastReconcile > RECONCILE_ON_FOCUS_AFTER) {
      reconcileCounts();
    }
  });
  _lastReconcile = Date.now();
}

/**
 * Clean up listeners
 */
export function cleanupListeners() {
  listeners.forEach(unsubscribe => unsubscribe());
  listeners.clear();
  // eslint-disable-next-line no-console
  console.log('✓ Listeners cleaned up');
}

/**
 * One-time migration: push the current LOCAL data (localStorage / in-memory DB)
 * up to Firestore so existing records appear in the cloud and start syncing.
 * Requires Firebase Auth (request.auth) — the security rules reject anonymous
 * writes. Derived collections (journals, accountsChart) are skipped; each device
 * regenerates them via GL.reconcileAll. Calls onProgress({collection, written}).
 * Returns the number of documents written.
 */
export async function migrateLocalToFirestore(onProgress) {
  if (!isFirebaseConfigured || !firestore) {
    throw new Error('Firebase belum dikonfigurasi (cek .env).');
  }

  // Source priority:
  // 1. IndexedDB/localStorage erp_db_v1 (normal first-time migration)
  // 2. In-memory DB             (last resort)
  let source = DB;
  try {
    const saved = await readLocalSaved();
    if (saved) {
      source = saved;
      // eslint-disable-next-line no-console
      console.log('[Migrate] Source: local store');
    } else {
      // eslint-disable-next-line no-console
      console.log('[Migrate] Source: in-memory DB');
    }
  } catch (_) {
    source = DB;
  }

  let written = 0;
  const report = (name, phase) => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ collection: name, written, phase: phase || 'writing' });
      } catch (_) {
        /* ignore */
      }
    }
  };

  for (const collectionName of Object.values(COLLECTIONS)) {
    // ── Phase 1: wipe existing docs so a re-scrape doesn't leave stale IDs ──
    report(collectionName, 'clearing');
    try {
      const existingSnap = await getDocs(collection(firestore, collectionName));
      if (!existingSnap.empty) {
        const refs = [];
        existingSnap.forEach(d => refs.push(d.ref));
        for (let i = 0; i < refs.length; i += 450) {
          const delBatch = writeBatch(firestore);
          refs.slice(i, i + 450).forEach(ref => delBatch.delete(ref));
          await delBatch.commit();
        }
      }
    } catch (e) {
      console.warn('[Migrate] Could not clear', collectionName, ':', e.message);
    }

    // ── Phase 2: write new data ───────────────────────────────────────────────
    const data = source[collectionName];
    if (data == null) {
      continue;
    }

    // Object collections → single 'default' document.
    if (isObjectCollection(collectionName)) {
      if (typeof data !== 'object' || Array.isArray(data)) {
        continue;
      }
      await setDoc(
        doc(firestore, collectionName, 'default'),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true }
      );
      written++;
      report(collectionName, 'writing');
      continue;
    }

    // Array collections → one doc per item, batched (Firestore limit 500/batch).
    if (!Array.isArray(data) || data.length === 0) {
      continue;
    }
    let batch = writeBatch(firestore);
    let ops = 0;
    for (const item of data) {
      if (!item || item.id == null) {
        continue;
      }
      batch.set(
        doc(firestore, collectionName, String(item.id)),
        { ...item, updatedAt: serverTimestamp() },
        { merge: true }
      );
      ops++;
      written++;
      if (ops >= 450) {
        await batch.commit();
        report(collectionName, 'writing');
        batch = writeBatch(firestore);
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
      report(collectionName, 'writing');
    }
  }

  // Record which dataset version Firestore now holds (informational; the old
  // deployed-JSON reseed check that read this was removed with accurate-data.json).
  try {
    await setDoc(doc(firestore, 'meta', 'dataset'), {
      version: Number(source._version) || 0,
      migratedAt: source._migratedAt || '',
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[Migrate] Could not record meta/dataset:', e.message);
  }

  // Make the next load use Firestore instead of the cached "unavailable" path.
  try {
    localStorage.removeItem(FS_FAIL_KEY);
  } catch (_) {
    /* ignore */
  }
  // The server data was replaced: the next load starts from it in full.
  await clearSyncCache();
  return written;
}

/**
 * Get default value for a collection
 */
function getDefaultValue(key) {
  const defaults = {
    accounts: { cash: 0, bca: 0, mandiri: 0 },
    reservations: {},
    settings: {
      user: {
        name: 'Admin',
        initials: 'AD',
        role: 'Administrator',
        access: 'Full Access',
      },
      company: {
        name: 'Nusantara ERP',
        address: 'Jl. Contoh No. 1, Jakarta, Indonesia',
        phone: '+62 21 1234 5678',
      },
      tax: {
        pkp: true,
        npwp: '',
        ppnRate: 0.11,
        pphRate: 0,
        rounding: 'round',
      },
      users: [],
      itemCategories: ['Umum', 'ATK', 'Elektronik', 'Bahan Baku'],
      units: ['pcs', 'box', 'unit', 'rim', 'roll', 'kg'],
      assetCategories: ['Bangunan', 'Kendaraan', 'Peralatan'],
      assetFiscalCategories: ['Golongan 1', 'Golongan 2', 'Golongan 3'],
      assets: [],
      assetTransfers: [],
      assetDisposals: [],
    },
  };
  return defaults[key] || {};
}

/**
 * Apply default values for missing data
 */
function applyDefaults() {
  // Keys must match the camelCase collection names used throughout the app.
  if (!DB.salesOrders) {
    DB.salesOrders = [];
  }
  if (!DB.purchaseOrders) {
    DB.purchaseOrders = [];
  }
  if (!DB.inventoryItems) {
    DB.inventoryItems = [];
  }
  if (!DB.deliveryOrders) {
    DB.deliveryOrders = [];
  }
  if (!DB.customers) {
    DB.customers = [];
  }
  if (!DB.suppliers) {
    DB.suppliers = [];
  }
  if (!DB.paymentLogs) {
    DB.paymentLogs = [];
  }
  if (!DB.notifications) {
    DB.notifications = [];
  }
  if (!DB.fleet) {
    DB.fleet = [];
  }
  if (!DB.expedition) {
    DB.expedition = [];
  }
  if (!DB.accounts) {
    DB.accounts = getDefaultValue('accounts');
  }
  if (!DB.reservations) {
    DB.reservations = getDefaultValue('reservations');
  }
  // Dashboard chart seed arrays. Seeded in normalizeImportedDB on the local path,
  // but the Firestore path skips that — seed here so the dashboard's empty-state
  // charts (revenueData.find, etc.) don't crash when Firestore has no data yet.
  if (!Array.isArray(DB.revenueData)) {
    DB.revenueData = [];
  }
  if (!Array.isArray(DB.topProducts)) {
    DB.topProducts = [];
  }
  if (!Array.isArray(DB.accountsTrend)) {
    DB.accountsTrend = [];
  }
  // V4: per-doc-type numbering registry (PREFIX.YYYY.MM.NNNNN). Seeded empty;
  // DocEngine.nextNumber() populates it lazily. Additive — nothing reads it yet
  // except the opt-in engine. See docs/ARCHITECTURE_ERP_V4.md.
  if (
    !DB.numberSequences ||
    typeof DB.numberSequences !== 'object' ||
    Array.isArray(DB.numberSequences)
  ) {
    DB.numberSequences = {};
  }
  // Phase 2a/3a GL + costing collections.
  if (!Array.isArray(DB.accountsChart)) {
    DB.accountsChart = [];
  }
  if (!Array.isArray(DB.journals)) {
    DB.journals = [];
  }
  // journals (Accurate-sourced JVs, _accurateId) + accountsChart now come from
  // the auth-gated glSeed collection via loadGlSeed() (Firestore mode), or from
  // the persisted local snapshot (local mode). Nothing to supplement here.
  if (!Array.isArray(DB.itemAdjustments)) {
    DB.itemAdjustments = [];
  }
  // Phase 4: invoice & receipt doc types.
  if (!Array.isArray(DB.salesInvoices)) {
    DB.salesInvoices = [];
  }
  if (!Array.isArray(DB.purchaseInvoices)) {
    DB.purchaseInvoices = [];
  }
  if (!Array.isArray(DB.salesReceipts)) {
    DB.salesReceipts = [];
  }
  if (!Array.isArray(DB.purchasePayments)) {
    DB.purchasePayments = [];
  }
  if (!DB.settings) {
    DB.settings = getDefaultValue('settings');
  }
  if (!DB.settings.tax) {
    DB.settings.tax = getDefaultValue('settings').tax;
  }
  if (!Array.isArray(DB.settings.users)) {
    DB.settings.users = [];
  }
  if (!Array.isArray(DB.settings.itemCategories)) {
    DB.settings.itemCategories = getDefaultValue('settings').itemCategories;
  }
  if (!Array.isArray(DB.settings.units)) {
    DB.settings.units = getDefaultValue('settings').units;
  }
  if (!Array.isArray(DB.settings.assetCategories)) {
    DB.settings.assetCategories = getDefaultValue('settings').assetCategories;
  }
  if (!Array.isArray(DB.settings.assetFiscalCategories)) {
    DB.settings.assetFiscalCategories = getDefaultValue('settings').assetFiscalCategories;
  }
  if (!Array.isArray(DB.settings.assets)) {
    DB.settings.assets = [];
  }
  if (!Array.isArray(DB.settings.assetTransfers)) {
    DB.settings.assetTransfers = [];
  }
  if (!Array.isArray(DB.settings.assetDisposals)) {
    DB.settings.assetDisposals = [];
  }
  // Budget & GL extras
  if (!Array.isArray(DB.budgets)) {
    DB.budgets = [];
  }
  if (!Array.isArray(DB.budgetTransfers)) {
    DB.budgetTransfers = [];
  }
  if (!Array.isArray(DB.expenseAccruals)) {
    DB.expenseAccruals = [];
  }
  if (!Array.isArray(DB.employees)) {
    DB.employees = [];
  }
  if (!Array.isArray(DB.payrollRuns)) {
    DB.payrollRuns = [];
  }
  // Sales & Purchase extras
  if (!Array.isArray(DB.salesDownPayments)) {
    DB.salesDownPayments = [];
  }
  if (!Array.isArray(DB.purchaseDownPayments)) {
    DB.purchaseDownPayments = [];
  }
  if (!Array.isArray(DB.salesTargets)) {
    DB.salesTargets = [];
  }
  if (!Array.isArray(DB.goodsReceipts)) {
    DB.goodsReceipts = [];
  }
  if (!Array.isArray(DB.supplierPrices)) {
    DB.supplierPrices = [];
  }
  // Kas & Bank, inventory/master extras and the synced manual-voucher store.
  [
    'otherPayments',
    'otherDeposits',
    'bankTransfers',
    'bankStatements',
    'itemRequisitions',
    'jobCostings',
    'contacts',
    'favoriteTransactions',
    'journalVouchers',
  ].forEach(key => {
    if (!Array.isArray(DB[key])) {
      DB[key] = [];
    }
  });

  if (DB.settings.users.length === 0 && DB.settings.user && DB.settings.user.name) {
    DB.settings.users = [
      {
        id: 'USR-001',
        name: DB.settings.user.name,
        email: DB.settings.user.email || 'admin@nusantara.local',
        role: DB.settings.user.role || 'Administrator',
      },
    ];
  }

  // NOTE: SO/PO status is owned by the sync script (Phase 4, from Accurate's
  // authoritative statusName). The runtime DO-linkage derivation below is kept
  // for Option B but is NOT called automatically — it disagrees with Accurate
  // on ~62% of SOs today (DO qty/itemId don't reconcile), and auto-running it
  // here silently overwrote Accurate's statuses on every load. Re-enable only
  // once linkage agreement is high enough (see the diagnostic in
  // scripts/sync-from-accurate.cjs).

  // Sync the module-local DB variable back to window.DB so classic <script>
  // code (dashboard.js, erp-view.js, gl.js, etc.) sees the same data.
  syncDBGlobal();
}

// Option B (dormant): derive SO/PO status from DO/GR linkage instead of
// Accurate's reported status. NOT called automatically — Accurate is the
// current source of truth (see applyDefaults). Exposed as window.deriveOrderStatuses
// for manual/diagnostic use and as the eventual cutover point once DO qty data
// reconciles with SO lines. Re-deriving only when all orders share one status
// is a guard against the old broken migration mapping.
// Tolerance for comparing summed decimal quantities (see the epsilon note in
// the SO loop below). 0.01 absorbs float drift without masking a real shortfall
// (the smallest real partial in the data is whole units short).
const QTY_EPSILON = 0.01;

function _deriveOrderStatuses() {
  const orders = (DB.salesOrders || []).filter(function (o) {
    return o._type === 'order';
  });
  if (orders.length === 0) {
    return;
  }
  const statuses = {};
  orders.forEach(function (o) {
    statuses[o.status] = (statuses[o.status] || 0) + 1;
  });
  // Only re-derive if all orders share one status (the old broken mapping).
  if (Object.keys(statuses).length > 1) {
    return;
  }

  const doQty = {};
  (DB.deliveryOrders || []).forEach(function (d) {
    if (!d.soId) {
      return;
    }
    const qty = (d.items || d.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    doQty[d.soId] = (doQty[d.soId] || 0) + qty;
  });

  orders.forEach(function (o) {
    const ordered = (o.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    const delivered = doQty[o.id] || 0;
    // EPSILON: decimal stone quantities (m³/ton like 512.5) accumulate
    // floating-point error, so a fully-delivered SO reads 1127.9999998 vs
    // 1128 ordered. Without tolerance these flip to "Partially Processed" and
    // disagree with Accurate (8 SOs ≈ 4% of agreement).
    if (delivered <= QTY_EPSILON) {
      o.status = 'Waiting on Process';
    } else if (delivered >= ordered - QTY_EPSILON) {
      o.status = 'Processed';
    } else {
      o.status = 'Partially Processed';
    }
  });

  // Same for purchase orders
  const pos = (DB.purchaseOrders || []).filter(function (o) {
    return o._type === 'order';
  });
  if (pos.length === 0) {
    return;
  }
  const poStatuses = {};
  pos.forEach(function (o) {
    poStatuses[o.status] = (poStatuses[o.status] || 0) + 1;
  });
  if (Object.keys(poStatuses).length > 1) {
    return;
  }

  const grQty = {};
  (DB.goodsReceipts || []).forEach(function (r) {
    if (!r.poId) {
      return;
    }
    const qty = (r.items || r.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    grQty[r.poId] = (grQty[r.poId] || 0) + qty;
  });

  pos.forEach(function (o) {
    const ordered = (o.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    const received = grQty[o.id] || 0;
    if (received <= QTY_EPSILON) {
      o.status = 'Waiting on Process';
    } else if (received >= ordered - QTY_EPSILON) {
      o.status = 'Processed';
    } else {
      o.status = 'Partially Processed';
    }
  });
}

/**
 * Reset database to default data
 */
export async function resetDB() {
  if (
    !(await window.confirmAsk(
      'Apakah Anda yakin ingin mereset semua data? Tindakan ini tidak dapat dibatalkan.'
    ))
  ) {
    return;
  }

  // Local-first mode: just reseed defaults and persist locally.
  if (usingLocalStore) {
    DB = normalizeImportedDB(initialData());
    applyDefaults();
    persistLocal();
    if (typeof navigate !== 'undefined' && typeof activeView !== 'undefined') {
      navigate(activeView);
    }
    showToast('Data berhasil direset', 'success');
    return;
  }

  try {
    // Delete all documents in all collections (chunked — 500-op batch limit)
    for (const collectionName of Object.values(COLLECTIONS)) {
      const snapshot = await getDocs(collection(firestore, collectionName));
      const refs = [];
      snapshot.forEach(doc => {
        refs.push(doc.ref);
      });
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(firestore);
        refs.slice(i, i + 450).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }

    // Reload with defaults
    DB = normalizeImportedDB(initialData());
    syncDBGlobal();
    // The server was just wiped — clear the dirty-tracking baseline so the
    // full default dataset is written, not just what differs from pre-reset.
    _savedSnapshot.clear();
    await clearSyncCache();
    await saveDB();

    if (typeof navigate !== 'undefined' && typeof activeView !== 'undefined') {
      navigate(activeView);
    }

    showToast('Data berhasil direset', 'success');
  } catch (error) {
    console.error('Failed to reset database:', error);
    showToast('Gagal mereset data', 'danger');
  }
}

/**
 * Normalize imported data structure
 */
function normalizeImportedDB(raw) {
  const clone = v => JSON.parse(JSON.stringify(v));
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const data = clone(input);

  Object.keys(emptyData).forEach(key => {
    if (!(key in data)) {
      data[key] = clone(emptyData[key]);
    }
  });

  const arrayKeys = [
    'salesOrders',
    'purchaseOrders',
    'inventoryItems',
    'deliveryOrders',
    'notifications',
    'customers',
    'suppliers',
    'revenueData',
    'topProducts',
    'accountsTrend',
    'fleet',
    'expedition',
    'paymentLogs',
  ];

  arrayKeys.forEach(key => {
    if (!Array.isArray(data[key])) {
      data[key] = clone(emptyData[key] || []);
    }
  });

  if (!data.accounts || typeof data.accounts !== 'object' || Array.isArray(data.accounts)) {
    data.accounts = clone(emptyData.accounts);
  } else {
    data.accounts = { ...emptyData.accounts, ...data.accounts };
  }

  if (
    !data.reservations ||
    typeof data.reservations !== 'object' ||
    Array.isArray(data.reservations)
  ) {
    data.reservations = {};
  }

  _coerceIdsToString(data);

  return data;
}

// The demo seed uses numeric ids (1, 2, …), but everything the app creates at
// runtime uses string ids and DOM `data-id` attributes are ALWAYS strings. With
// strict `doc.id === datasetId` lookups all over the codebase, numeric-id demo
// docs become un-clickable ("tidak ditemukan") on a fresh seed. Coerce ids and
// their cross-reference fields to strings here so both seed and app-created docs
// behave identically. Idempotent for ids that are already strings.
function _coerceIdsToString(data) {
  const S = v => (v === null || v === undefined ? v : String(v));
  const REF = ['soId', 'poId', 'customerId', 'supplierId', 'invoiceId', 'orderId', 'sourceId'];
  const COLLS = [
    'salesOrders',
    'purchaseOrders',
    'deliveryOrders',
    'salesInvoices',
    'purchaseInvoices',
    'salesReceipts',
    'purchasePayments',
    'salesQuotations',
    'purchaseQuotations',
    'salesReturns',
    'purchaseReturns',
    'customers',
    'suppliers',
    'inventoryItems',
    'paymentLogs',
    'itemTransfers',
    'itemAdjustments',
    'goodsReceipts',
    'salesDownPayments',
    'purchaseDownPayments',
  ];
  COLLS.forEach(c => {
    const arr = data[c];
    if (!Array.isArray(arr)) {
      return;
    }
    arr.forEach(d => {
      if (!d || typeof d !== 'object') {
        return;
      }
      if ('id' in d) {
        d.id = S(d.id);
      }
      REF.forEach(f => {
        if (f in d && d[f] !== null && d[f] !== undefined) {
          d[f] = S(d[f]);
        }
      });
      if (Array.isArray(d.lines)) {
        d.lines.forEach(l => {
          if (l && 'itemId' in l && l.itemId !== null && l.itemId !== undefined) {
            l.itemId = S(l.itemId);
          }
        });
      }
    });
  });
}

// Structure of an empty database: fills keys missing from saved or imported data.
// Records come only from the demo dataset (src/core/demo-data.js).
const emptyData = {
  salesOrders: [],
  purchaseOrders: [],
  inventoryItems: [],
  deliveryOrders: [],
  customers: [],
  suppliers: [],
  paymentLogs: [],
  notifications: [],
  fleet: [],
  expedition: [],
  employees: [],
  warehouses: [{ id: 'WH-DEFAULT', name: 'Gudang Utama', location: 'Default', active: true }],
  itemTransfers: [],
  accounts: { cash: 0, bca: 0, mandiri: 0 },
  reservations: {},
  numberSequences: {},
  accountsChart: [],
  journals: [],
  itemAdjustments: [],
  salesInvoices: [],
  purchaseInvoices: [],
  salesReceipts: [],
  purchasePayments: [],
  settings: getDefaultValue('settings'),
};

/** Data for a new store: the demo dataset, or an empty database when seeding is disabled. */
function initialData() {
  const base = JSON.parse(JSON.stringify(emptyData));
  if (!_demoSeedEnabled()) {
    return base;
  }
  const { bankAccounts, itemCategories, units, ...collections } = buildDemoData(new Date());
  return {
    ...base,
    ...collections,
    settings: { ...base.settings, bankAccounts, itemCategories, units },
  };
}

// Clean up on page unload — push any debounced save out before the listeners go.
window.addEventListener('beforeunload', () => {
  try {
    flushPendingSaves();
  } catch (_) {
    /* ignore */
  }
  cleanupListeners();
});

// Export for global access
window.loadDB = loadDB;
window.saveDB = saveDB;
window.resetDB = resetDB;
window.migrateLocalToFirestore = migrateLocalToFirestore;
// Logout (auth.js) forgets the cached server data on this browser.
window.__nsaClearSyncCache = clearSyncCache;
// Dormant Option-B helper: derive SO/PO statuses from DO/GR linkage on demand.
window.deriveOrderStatuses = _deriveOrderStatuses;
