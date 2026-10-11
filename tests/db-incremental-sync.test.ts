// Incremental sync (src/core/db.js): an open reads only what changed since the
// copy cached in IndexedDB, plus a count per collection; listeners watch only
// newer changes. Firestore bills one read per returned document (minimum one per
// query) and one per 1,000 entries counted — the fake server below counts the
// same way, so the tests can compare what an open costs.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const srv = vi.hoisted(() => {
  const ts = (ms: number) => ({ ms, toMillis: () => ms });
  const state = {
    cols: new Map<string, Map<string, any>>(),
    clock: 1_000_000,
    reads: 0,
    listeners: [] as Array<{ name: string; since: number | null; cb: (s: any) => void }>,
    kv: new Map<string, any>(),
    // Called while a batch commits (before it resolves), like Firestore's
    // latency-compensated listener events.
    onCommit: null as null | ((paths: string[]) => void),
    ts,
    reset() {
      state.cols.clear();
      state.reads = 0;
      state.listeners.length = 0;
      state.kv.clear();
      state.onCommit = null;
    },
    col(name: string) {
      if (!state.cols.has(name)) {
        state.cols.set(name, new Map());
      }
      return state.cols.get(name)!;
    },
    put(name: string, id: string, data: any) {
      state.clock += 10;
      state.col(name).set(id, { ...data, updatedAt: ts(state.clock) });
    },
    remove(name: string, id: string) {
      state.col(name).delete(id);
    },
    snap(id: string, data: any) {
      return { id, data: () => ({ ...data }), metadata: { hasPendingWrites: false } };
    },
    matching(target: any) {
      const docs = [...state.col(target.name).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (!target.where) {
        return docs;
      }
      const min = target.where.value.toMillis();
      return docs.filter(([, d]) => d.updatedAt && d.updatedAt.toMillis() >= min);
    },
    // Changes pushed to the listeners of a collection (as Firestore would).
    emit(name: string, changes: Array<{ type: string; id: string; data?: any }>) {
      state.listeners
        .filter(l => l.name === name)
        .forEach(l =>
          l.cb({
            docChanges: () =>
              changes.map(c => ({ type: c.type, doc: state.snap(c.id, c.data || {}) })),
          })
        );
    },
  };
  return state;
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: any, name: string) => ({ name }),
  doc: (_db: any, name: string, id: string) => ({ path: `${name}/${id}` }),
  where: (field: string, op: string, value: any) => ({ field, op, value }),
  query: (col: any, w: any) => ({ name: col.name, where: w }),
  getDocs: async (target: any) => {
    const docs = srv.matching(target);
    srv.reads += Math.max(1, docs.length);
    const snaps = docs.map(([id, d]) => srv.snap(id, d));
    return { empty: snaps.length === 0, forEach: (fn: any) => snaps.forEach(fn) };
  },
  getCountFromServer: async (col: any) => {
    const n = srv.col(col.name).size;
    srv.reads += Math.max(1, Math.ceil(n / 1000));
    return { data: () => ({ count: n }) };
  },
  onSnapshot: (target: any, cb: any) => {
    const first = srv.matching(target);
    srv.reads += first.length;
    const l = { name: target.name, since: target.where ? target.where.value.toMillis() : null, cb };
    srv.listeners.push(l);
    if (first.length) {
      cb({ docChanges: () => first.map(([id, d]) => ({ type: 'added', doc: srv.snap(id, d) })) });
    }
    return () => {
      srv.listeners.splice(srv.listeners.indexOf(l), 1);
    };
  },
  setDoc: async () => {},
  serverTimestamp: () => 'SERVER_TS',
  writeBatch: () => {
    const paths: string[] = [];
    return {
      set(ref: any) {
        paths.push(ref.path);
      },
      delete(ref: any) {
        paths.push(ref.path);
      },
      commit: async () => {
        if (srv.onCommit) {
          srv.onCommit(paths);
        }
      },
    };
  },
  Timestamp: { fromMillis: (ms: number) => srv.ts(ms) },
}));

vi.mock('../src/config/firebase.js', () => ({
  db: { app: { options: { projectId: 'demo-project' } } },
  isFirebaseConfigured: true,
}));

vi.mock('../src/core/local-store.js', () => ({
  kvGet: async (k: string) => (srv.kv.has(k) ? JSON.parse(JSON.stringify(srv.kv.get(k))) : null),
  kvSet: async (k: string, v: any) => {
    srv.kv.set(k, v == null ? v : JSON.parse(JSON.stringify(v)));
  },
}));

const DB = () => (window as any).DB;

// A fresh module = the app opened again in the same browser (IndexedDB kept).
async function openApp() {
  vi.resetModules();
  srv.listeners.length = 0;
  const mod = await import('../src/core/db.js');
  const before = srv.reads;
  await mod.loadDB();
  return { mod, reads: srv.reads - before };
}

function seedServer(customers = 300, orders = 1500) {
  for (let i = 0; i < customers; i++) {
    srv.put('customers', `C${String(i).padStart(4, '0')}`, { name: `Pelanggan ${i}` });
  }
  for (let i = 0; i < orders; i++) {
    srv.put('salesOrders', `SO${String(i).padStart(5, '0')}`, {
      customer: 'Pelanggan 1',
      amount: i,
    });
  }
  srv.put('inventoryItems', 'SPL12', { name: 'Split 1-2', stock: 0 });
  srv.put('settings', 'default', { company: { name: 'PT Contoh' } });
}

beforeEach(() => {
  srv.reset();
  seedServer();
});

describe('incremental sync', () => {
  it('the first open reads everything once — the listeners do not read it again', async () => {
    const { mod, reads } = await openApp();
    expect(DB().customers.length).toBe(300);
    expect(DB().salesOrders.length).toBe(1500);
    expect(DB().settings.company.name).toBe('PT Contoh');
    // 1,802 documents, one read per empty collection, glSeed; each listener
    // only re-reads the newest document of its collection.
    expect(reads).toBeLessThan(1802 + 60 + 10);
    mod._persistSyncCache();
    const cache = srv.kv.get('erp_fs_cache_v1');
    expect(cache.project).toBe('demo-project');
    expect(cache.collections.salesOrders.docs.length).toBe(1500);
  });

  it('the next open reads only the changes and a count per collection', async () => {
    const first = await openApp();
    first.mod._persistSyncCache();

    srv.put('customers', 'C0001', { name: 'Pelanggan 1 (ganti nama)' });
    srv.put('salesOrders', 'SO99999', { customer: 'Pelanggan 2', amount: 7 });

    const { reads } = await openApp();
    expect(DB().customers.find((c: any) => c.id === 'C0001').name).toBe('Pelanggan 1 (ganti nama)');
    expect(DB().salesOrders.length).toBe(1501);
    expect(DB().salesOrders[DB().salesOrders.length - 1].id).toBe('SO99999'); // id order kept
    // ±2 reads per synced collection instead of 1,800+.
    expect(reads).toBeLessThan(150);
    expect(reads).toBeLessThan(first.reads / 10);
  });

  it('a document deleted elsewhere is noticed by the count and that collection reloads', async () => {
    (await openApp()).mod._persistSyncCache();
    srv.remove('customers', 'C0005');

    await openApp();
    expect(DB().customers.some((c: any) => c.id === 'C0005')).toBe(false);
    expect(DB().customers.length).toBe(299);
  });

  it('updatedAt is held as milliseconds, and a cache from another project is ignored', async () => {
    const { mod } = await openApp();
    expect(typeof DB().customers[0].updatedAt).toBe('number');
    mod._persistSyncCache();
    srv.kv.get('erp_fs_cache_v1').project = 'other-project';
    const { reads } = await openApp();
    expect(reads).toBeGreaterThan(1802); // full load again
  });

  it('listener changes reach DB: updates, new documents, deletions', async () => {
    await openApp();
    srv.emit('customers', [
      { type: 'modified', id: 'C0002', data: { name: 'Diubah di HP', updatedAt: srv.ts(9e9) } },
      { type: 'added', id: 'C9999', data: { name: 'Baru', updatedAt: srv.ts(9e9) } },
      { type: 'removed', id: 'C0003' },
    ]);
    const ids = DB().customers.map((c: any) => c.id);
    expect(DB().customers.find((c: any) => c.id === 'C0002').name).toBe('Diubah di HP');
    expect(ids).toContain('C9999');
    expect(ids).not.toContain('C0003');
  });

  it('an un-flushed local edit survives a remote change and still counts as dirty', async () => {
    const { mod } = await openApp();
    DB().customers.find((c: any) => c.id === 'C0004').name = 'Diubah di sini';
    const conflicts = mod._mergeRemoteChanges(
      'customers',
      [{ id: 'C0004', name: 'Diubah di tempat lain', updatedAt: 9e9 }],
      []
    );
    expect(conflicts).toBe(1);
    expect(DB().customers.find((c: any) => c.id === 'C0004').name).toBe('Diubah di sini');
  });

  it('the cache holds the server copy, never un-flushed local edits', async () => {
    const { mod } = await openApp();
    DB().customers.find((c: any) => c.id === 'C0006').name = 'Belum disimpan';
    mod._persistSyncCache();
    const cached = srv.kv.get('erp_fs_cache_v1').collections.customers.docs;
    expect(cached.find((c: any) => c.id === 'C0006').name).toBe('Pelanggan 6');
  });

  it('clearing the cache (logout) makes the next open load in full', async () => {
    const { mod } = await openApp();
    mod._persistSyncCache();
    await mod.clearSyncCache();
    expect(srv.kv.get('erp_fs_cache_v1')).toBeNull();
    const { reads } = await openApp();
    expect(reads).toBeGreaterThan(1802);
  });

  it('the periodic count check removes documents deleted elsewhere while open', async () => {
    const { mod } = await openApp();
    srv.remove('salesOrders', 'SO00010');
    await mod._reconcileCounts();
    expect(DB().salesOrders.some((o: any) => o.id === 'SO00010')).toBe(false);
  });

  // While a save waits for the server, its updatedAt is a pending server
  // timestamp that Firestore does not match against `updatedAt >= …`, so the
  // listener reports the saved documents as removed until the commit lands.
  it("this device's own saves briefly leaving the listener are not deletions", async () => {
    const { mod } = await openApp();
    DB().customers.find((c: any) => c.id === 'C0007').name = 'Disimpan dari sini';
    DB().settings.company.name = 'PT Contoh Baru';
    srv.onCommit = () => {
      srv.emit('customers', [{ type: 'removed', id: 'C0007' }]);
      srv.emit('settings', [{ type: 'removed', id: 'default' }]);
    };
    await mod.saveDB();
    expect(DB().customers.find((c: any) => c.id === 'C0007').name).toBe('Disimpan dari sini');
    expect(DB().settings.company.name).toBe('PT Contoh Baru');

    // The committed version arrives: taken as is, not reported as a conflict.
    srv.onCommit = null;
    srv.emit('customers', [
      { type: 'added', id: 'C0007', data: { name: 'Disimpan dari sini', updatedAt: srv.ts(9e9) } },
    ]);
    const rec = DB().customers.find((c: any) => c.id === 'C0007');
    expect(rec.name).toBe('Disimpan dari sini');
    expect(rec.updatedAt).toBe(9e9);
  });

  it("the echo of this device's own save during the commit is not a conflict", async () => {
    const { mod } = await openApp();
    DB().customers.find((c: any) => c.id === 'C0008').name = 'Sama di server';
    const conflicts = mod._mergeRemoteChanges(
      'customers',
      [{ id: 'C0008', name: 'Sama di server', updatedAt: 9e9, updatedBy: 'admin' }],
      []
    );
    expect(conflicts).toBe(0);
    expect(DB().customers.find((c: any) => c.id === 'C0008').updatedAt).toBe(9e9);
  });
});
