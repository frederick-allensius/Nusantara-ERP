// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Nightly Firestore backup (Firebase Scheduled Function)
// -----------------------------------------------------------------------------
// Replaces NSA's Vercel-Cron backup (api/cron/backup.js) with a Cloud Scheduler
// job. Runs on the Admin SDK, so no HTTP surface or CRON_SECRET is needed — the
// scheduler invokes the function directly and firestore.rules blanket-denies all
// client access to the `serverBackups` collection.
//
// Snapshots every synced business collection into `serverBackups`:
//   serverBackups/{date}__meta                { date, createdAt, collections, … }
//   serverBackups/{date}__{collection}__{n}   { date, collection, chunk, items }
// `items` is a JSON string (≤CHUNK_SIZE records/chunk keeps docs well under the
// 1 MB Firestore doc cap). Retention: backup docs older than KEEP_DAYS are pruned.
//
// Restore: read {date}__meta, then JSON.parse each chunk's `items` and write the
// records back to their collection with the Admin SDK.
// ═══════════════════════════════════════════════════════════════════════════════

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { adminDb } from './admin.js';

// Mirror of src/core/db.js COLLECTIONS (the synced business data). authUsers is
// deliberately excluded — it carries password hashes + 2FA secrets that do not
// belong in bulk snapshots.
const COLLECTIONS = [
  'salesOrders',
  'purchaseOrders',
  'inventoryItems',
  'deliveryOrders',
  'customers',
  'suppliers',
  'paymentLogs',
  'notifications',
  'accounts',
  'reservations',
  'settings',
  'fleet',
  'expedition',
  'salesInvoices',
  'purchaseInvoices',
  'salesReceipts',
  'purchasePayments',
  'salesQuotations',
  'purchaseQuotations',
  'salesReturns',
  'purchaseReturns',
  'itemAdjustments',
  'itemTransfers',
  'warehouses',
  'employees',
  'numberSequences',
  'auditLog',
  'trash',
  'goodsReceipts',
  'journalVouchers',
  'salesDownPayments',
  'purchaseDownPayments',
  'salesTargets',
  'supplierPrices',
  'budgets',
  'budgetTransfers',
  'expenseAccruals',
  'payrollRuns',
  'otherPayments',
  'otherDeposits',
  'bankTransfers',
  'bankStatements',
  'itemRequisitions',
  'jobCostings',
  'contacts',
  'favoriteTransactions',
];

const BACKUP_COLLECTION = 'serverBackups';
const CHUNK_SIZE = 200; // records per backup doc (~≤400 KB, cap is 1 MB)
const KEEP_DAYS = 14;

async function deleteByQuery(db, query) {
  const snap = await query.get();
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(450, snap.docs.length - i);
  }
  return deleted;
}

async function runBackup() {
  const db = adminDb();
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  // Same-day re-runs overwrite deterministically (doc ids are date-keyed); the
  // pre-write cleanup sweeps stale higher-numbered chunks from a larger earlier run.
  await deleteByQuery(db, db.collection(BACKUP_COLLECTION).where('date', '==', stamp));

  const manifest = {};
  let totalDocs = 0;
  let chunks = 0;
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    manifest[name] = items.length;
    totalDocs += items.length;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunkNo = i / CHUNK_SIZE;
      await db
        .collection(BACKUP_COLLECTION)
        .doc(`${stamp}__${name}__${chunkNo}`)
        .set({
          date: stamp,
          collection: name,
          chunk: chunkNo,
          // JSON string: tolerant of exotic field values and keeps the doc a
          // single indexed-field-free blob.
          items: JSON.stringify(items.slice(i, i + CHUNK_SIZE)),
        });
      chunks++;
    }
  }

  await db.collection(BACKUP_COLLECTION).doc(`${stamp}__meta`).set({
    date: stamp,
    createdAt: now.toISOString(),
    collections: manifest,
    totalDocs,
    chunks,
    chunkSize: CHUNK_SIZE,
  });

  // Retention: delete every backup doc older than the KEEP_DAYS cutoff.
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const pruned = await deleteByQuery(
    db,
    db.collection(BACKUP_COLLECTION).where('date', '<', cutoff)
  );

  return { date: stamp, totalDocs, chunks, pruned, keepDays: KEEP_DAYS };
}

// Nightly at 20:00 Asia/Jakarta (WIB) — matches NSA's "0 20 * * *" cadence, but
// pinned to the business timezone instead of UTC.
export const nightlyBackup = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Asia/Jakarta', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    try {
      const result = await runBackup();
      logger.info('[backup] nightly snapshot complete', result);
    } catch (err) {
      logger.error('[backup] nightly snapshot failed', err);
      throw err; // let the scheduler mark the run failed (and retry per policy)
    }
  }
);

// Exposed for a manual/admin trigger or tests (not wired to HTTP by default).
export { runBackup as _runBackup };
