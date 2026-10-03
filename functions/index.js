// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Integration API on Firebase Cloud Functions (read-only /api/v1)
// -----------------------------------------------------------------------------
// The Firebase Hosting rewrite (firebase.json) forwards /api/** to this HTTPS
// function. It reuses the same framework-agnostic handler as the (retired) Vercel
// route, deriving the resource slug from the request path.
//   • GET /api/v1                 → discovery (resource list)
//   • GET /api/v1/:resource       → up to ?limit docs (header: x-api-key)
// Configure ERP_API_KEY (and optionally FIRESTORE_DATABASE_ID) via functions env.
// ═══════════════════════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https';
import { handleApi } from './handler.js';
import { getCollection } from './firestore.js';

// Nightly Firestore backup (Cloud Scheduler → serverBackups). See backup.js.
export { nightlyBackup } from './backup.js';

// Server-enforced audit trail (see access-log.js).
export { onBusinessWrite, recordLogout, adminListAccessLog } from './access-log.js';

// Username → Firebase custom-token auth callables (see auth.js).
export {
  loginWithUsername,
  changeMyPassword,
  enable2FA,
  disable2FA,
  regenerateBackupCodes,
  get2FAStatus,
  adminListUsers,
  adminCreateUser,
  adminSetPassword,
  adminSetRole,
  adminSetModules,
  adminSetActive,
  adminDeleteUser,
} from './auth.js';

export const api = onRequest(
  // Default region (us-central1) keeps the Hosting rewrite string form simple.
  // No built-in `cors` — the shared handler owns CORS so the ERP_API_ALLOWED_ORIGINS
  // allowlist (and its Vary: Origin) is authoritative and never double-set.
  { maxInstances: 10 },
  async (req, res) => {
    // Path arrives as /api/v1 or /api/v1/:resource. Pull the slug (if any) into
    // req.query.resource so the shared handler can route it; no slug → discovery.
    const path = String(req.path || req.url || '').split('?')[0];
    const m = path.match(/\/v1(?:\/([^/]+))?\/?$/);
    req.query = { ...(req.query || {}) };
    if (m && m[1]) {
      req.query.resource = decodeURIComponent(m[1]);
    }
    await handleApi(req, res, {
      getCollection,
      apiKey: process.env.ERP_API_KEY,
      apiKeyNext: process.env.ERP_API_KEY_NEXT, // optional: zero-downtime key rotation
      allowedOrigins: process.env.ERP_API_ALLOWED_ORIGINS, // optional: pin CORS
      rateLimit: { max: Number(process.env.ERP_API_RATE_MAX) || undefined },
    });
  }
);
