// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Per-user module allowlist ("Akses menu") validation.
// -----------------------------------------------------------------------------
// users/{uid}.modules lists the RBAC modules a user may use; it can only narrow
// the role (firestore.rules moduleAllowed, public/classic/core/rbac.js). Missing
// or empty = no restriction. Pure helpers (no firebase imports) so the tests can
// load them directly.
// ═══════════════════════════════════════════════════════════════════════════════

// Known RBAC modules — must mirror rbac.js PERMISSIONS and the validModules()
// list in firestore.rules.
export const MODULE_KEYS = [
  'dashboard',
  'reports',
  'sales',
  'purchases',
  'inventory',
  'gl',
  'tax',
  'assets',
  'master',
  'admin',
  'config',
];

/**
 * Validate an allowlist from a client. Returns the de-duplicated list in
 * MODULE_KEYS order ([] = no restriction). Throws on anything but an array of
 * known module keys — nothing unknown is ever stored.
 */
export function normalizeModules(input) {
  if (input == null) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new Error('Daftar modul tidak valid');
  }
  for (const m of input) {
    if (typeof m !== 'string' || !MODULE_KEYS.includes(m)) {
      throw new Error(`Modul tidak dikenal: ${String(m)}`);
    }
  }
  return MODULE_KEYS.filter(m => input.includes(m));
}
