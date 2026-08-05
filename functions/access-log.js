// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Server-enforced access/audit log.
// -----------------------------------------------------------------------------
// Records who touched what, and when, into the `accessLog` Firestore collection.
// Every entry is appended via the Admin SDK — firestore.rules blanket-denies
// client writes to `accessLog`, so no user (including an admin) can edit or
// erase their own trail through the app itself.
//
//   • onBusinessWrite — Firestore trigger on every top-level collection.
//     Records create/update/delete, keyed to the `updatedBy` username src/core/
//     db.js already stamps on every save (concurrent-edit forensics reused here
//     as the audit actor). Self-reported by the client, not cryptographically
//     verified — Firestore triggers don't carry the writer's auth context, only
//     the document contents.
//   • recordLogout — callable the client invokes on sign-out (there is no other
//     server-side hook for that event).
//   • adminListAccessLog — paginated admin-only read, mirroring the
//     adminListUsers callable pattern in auth.js (the Settings UI has no direct
//     Firestore access to this collection; it goes through a callable like
//     every other admin screen).
// Login success/failure is logged directly in auth.js (loginWithUsername),
// which already owns that flow and its brute-force throttle.
// ═══════════════════════════════════════════════════════════════════════════════

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { adminDb } from './admin.js';

const CALL_OPTS = { cors: true, maxInstances: 10 };

// Never mirror these into accessLog: the log itself (would self-trigger an
// infinite loop) and the other server-only stores (already blanket-denied to
// clients in firestore.rules, so logging their writes adds no client-facing value).
const EXCLUDED_COLLECTIONS = new Set(['accessLog', 'authUsers', 'serverBackups']);

/** Append one entry. Never throws — a logging failure must not break the
 *  operation it's observing. */
export async function appendAccessLog(entry) {
  try {
    await adminDb()
      .collection('accessLog')
      .add({ at: new Date().toISOString(), ...entry });
  } catch (e) {
    logger.error('[access-log] write failed', e);
  }
}

// {collectionId}/{docId} — the wildcard covers the collection segment itself,
// so this single trigger fires for every top-level collection (sales, purchases,
// inventory, GL, …) without needing one registration per collection name.
export const onBusinessWrite = onDocumentWritten('{collectionId}/{docId}', async event => {
  const { collectionId, docId } = event.params;
  if (EXCLUDED_COLLECTIONS.has(collectionId)) {
    return;
  }
  const before = event.data && event.data.before;
  const after = event.data && event.data.after;
  const existedBefore = !!(before && before.exists);
  const existsAfter = !!(after && after.exists);
  if (!existedBefore && !existsAfter) {
    return; // no-op write
  }
  const action = !existedBefore ? 'create' : !existsAfter ? 'delete' : 'update';
  const data = (existsAfter ? after.data() : before && before.data()) || {};

  await appendAccessLog({
    type: 'write',
    action,
    collection: collectionId,
    docId,
    actor: data.updatedBy || data.createdBy || null,
  });
});

/** Client calls this on sign-out (must fire before the ID token is dropped). */
export const recordLogout = onCall(CALL_OPTS, async request => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    return { ok: true }; // already signed out server-side; nothing to record
  }
  const username = uid.startsWith('u_') ? uid.slice(2) : uid;
  await appendAccessLog({ type: 'auth', action: 'logout', actor: username });
  return { ok: true };
});

/** Admin-only, paginated (newest first). Mirrors adminListUsers's shape. */
export const adminListAccessLog = onCall(CALL_OPTS, async request => {
  const role = request.auth && request.auth.token && request.auth.token.role;
  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang boleh melihat log akses.');
  }
  const limit = Math.min(Math.max(Number((request.data && request.data.limit) || 200), 1), 500);
  const snap = await adminDb().collection('accessLog').orderBy('at', 'desc').limit(limit).get();
  return { entries: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});
