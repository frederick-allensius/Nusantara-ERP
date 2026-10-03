// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Server-side user store (authUsers) for Cloud Functions auth.
// -----------------------------------------------------------------------------
// Credentials live in the `authUsers/{username}` Firestore collection, which the
// security rules lock to server-only (allow read, write: if false). Only these
// functions — running with the Admin SDK (which bypasses rules) — can touch it,
// so password hashes never reach any client.
//
// Password hashing MUST stay byte-compatible with the browser fallback store
// (src/core/local-users.js): PBKDF2 / SHA-256, 256-bit output, hex-encoded, with
// a per-user hex salt and a stored `iterations` count. That lets us migrate a
// browser-seeded account server-side (and vice-versa) without invalidating
// passwords. Records predating the 600k bump verify at 100k, then lazily
// re-hash to the current cost on the next good login.
// ═══════════════════════════════════════════════════════════════════════════════

import { randomBytes, pbkdf2 as _pbkdf2, createHash } from 'node:crypto';
import { adminDb } from './admin.js';
import { MODULE_KEYS, normalizeModules } from './user-modules.js';

// OWASP-recommended cost for PBKDF2-HMAC-SHA256; keep in sync with local-users.js.
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_ITERATIONS_LEGACY = 100000;
const KEY_LEN = 32; // 256 bits
const DIGEST = 'sha256';
const COLLECTION = 'authUsers';

// First-run accounts, mirrored from src/core/local-users.js SEED_USERS. All
// admins for now; default password "<username>123"; flagged mustChangePassword.
const SEED_USERS = [
  { username: 'admin', displayName: 'Administrator' },
  { username: 'firna', displayName: 'Firna' },
  { username: 'richard', displayName: 'Richard' },
  { username: 'lisa', displayName: 'Lisa' },
];

const db = adminDb;

// ── hashing ────────────────────────────────────────────────────────────────────
export function randomSalt() {
  return randomBytes(16).toString('hex');
}

export function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  return new Promise((resolve, reject) => {
    _pbkdf2(
      Buffer.from(String(password), 'utf8'),
      Buffer.from(saltHex, 'hex'),
      iterations,
      KEY_LEN,
      DIGEST,
      (err, derived) => (err ? reject(err) : resolve(derived.toString('hex')))
    );
  });
}

// Constant-time hex-string compare to avoid leaking the hash via timing.
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Salted SHA-256 for 2FA backup codes — mirrors local-users.hashBackupCode.
export function hashBackupCode(code, saltHex) {
  const normalized = saltHex + ':' + String(code).replace(/\s+/g, '').toUpperCase();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// ── username normalization (mirror of local-users.normUsername) ─────────────────
export function normUsername(u) {
  const s = String(u || '')
    .trim()
    .toLowerCase();
  const at = s.indexOf('@');
  return at > 0 ? s.slice(0, at) : s;
}

/** Stable Firebase Auth uid derived from the username. */
export function uidFor(username) {
  return 'u_' + normUsername(username);
}

// ── persistence ──────────────────────────────────────────────────────────────
export async function getUser(username) {
  const key = normUsername(username);
  if (!key) {
    return null;
  }
  const snap = await db().collection(COLLECTION).doc(key).get();
  return snap.exists ? { username: key, ...snap.data() } : null;
}

export async function listUsers() {
  const snap = await db().collection(COLLECTION).get();
  const modules = await readModules(snap.docs.map(d => d.id));
  return snap.docs.map(d => {
    const u = d.data();
    // Strip secrets before returning to any caller.
    return {
      username: d.id,
      displayName: u.displayName || d.id,
      role: u.role || 'viewer',
      active: u.active !== false,
      mustChangePassword: !!u.mustChangePassword,
      twoFactorEnabled: !!(u.twoFactor && u.twoFactor.enabled),
      createdAt: u.createdAt || null,
      modules: modules.get(d.id) || [],
    };
  });
}

// ── Akses menu (per-user module allowlist) ─────────────────────────────────────
// Stored on users/u_<username>.modules — the document firestore.rules reads in
// moduleAllowed() — not on authUsers, so the rules see it without a claim and a
// change applies to the user's next write.
function userDocRef(username) {
  return db().collection('users').doc(uidFor(username));
}

async function readModules(usernames) {
  const out = new Map();
  if (!usernames.length) {
    return out;
  }
  const snaps = await db().getAll(...usernames.map(userDocRef));
  snaps.forEach((s, i) => {
    const list = s.exists ? s.get('modules') : null;
    if (Array.isArray(list)) {
      out.set(
        usernames[i],
        list.filter(m => MODULE_KEYS.includes(m))
      );
    }
  });
  return out;
}

/**
 * Set a user's Akses menu. `modules` must be known module keys; [] removes the
 * restriction. An admin account is never restricted. Returns the stored list.
 */
export async function setModules(username, modules) {
  const user = await getUser(username);
  if (!user) {
    throw new Error('User tidak ditemukan');
  }
  const list = normalizeModules(modules);
  if (list.length && user.role === 'admin') {
    throw new Error('Akses menu Admin tidak dapat dibatasi');
  }
  await userDocRef(user.username).set({ modules: list }, { merge: true });
  return list;
}

// Drop a leftover restriction (the account became admin, or was deleted).
async function clearModules(username) {
  const ref = userDocRef(username);
  const snap = await ref.get();
  const list = snap.exists ? snap.get('modules') : null;
  if (Array.isArray(list) && list.length) {
    await ref.update({ modules: [] });
  }
}

async function writeUser(username, data) {
  const key = normUsername(username);
  await db().collection(COLLECTION).doc(key).set(data, { merge: true });
}

/** A high-entropy, human-typable seed password (no ambiguous chars). */
function randomSeedPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Seed the default accounts once, if the collection is empty. Idempotent: a
 * second caller that finds users present is a no-op. Returns the number seeded.
 *
 * SECURITY: seeded passwords are NOT the guessable "<username>123" — that made
 * the public loginWithUsername callable a trivial admin backdoor on any fresh
 * deploy. Each account gets either a shared operator-supplied SEED_ADMIN_PASSWORD
 * (env) or a per-account random password that is written to the function logs
 * exactly once (Cloud Logging is admin-only) so the owner can retrieve it. Every
 * account is still flagged mustChangePassword.
 */
export async function ensureSeedUsers() {
  const snap = await db().collection(COLLECTION).limit(1).get();
  if (!snap.empty) {
    return 0;
  }
  const shared = process.env.SEED_ADMIN_PASSWORD || '';
  const logged = [];
  let n = 0;
  for (const seed of SEED_USERS) {
    const salt = randomSalt();
    const plain = shared || randomSeedPassword();
    const passwordHash = await hashPassword(plain, salt);
    await writeUser(seed.username, {
      displayName: seed.displayName,
      role: 'admin',
      salt,
      passwordHash,
      iterations: PBKDF2_ITERATIONS,
      active: true,
      mustChangePassword: true,
      createdAt: Date.now(),
    });
    if (!shared) {
      logged.push(`${seed.username} / ${plain}`);
    }
    n++;
  }
  if (logged.length) {
    // One-time disclosure to admin-only Cloud Logging. Change on first login.
    console.warn(
      '[authUsers] Seeded initial accounts with RANDOM passwords (change on first login):\n  ' +
        logged.join('\n  ')
    );
  } else {
    console.warn(
      '[authUsers] Seeded initial accounts using SEED_ADMIN_PASSWORD env (change on first login).'
    );
  }
  return n;
}

/** Verify a username/password pair. Returns the stored user record or null. */
export async function verifyPassword(username, password) {
  const user = await getUser(username);
  if (!user || user.active === false || !user.salt || !user.passwordHash) {
    return null;
  }
  // Records predating the 600k bump carry a lower (or missing) `iterations`.
  const iterations = user.iterations || PBKDF2_ITERATIONS_LEGACY;
  const hash = await hashPassword(password || '', user.salt, iterations);
  if (!safeEqualHex(hash, user.passwordHash)) {
    return null;
  }
  // Lazy cost upgrade: re-hash at the current iteration count now that we hold
  // the correct plaintext, so the stored hash strengthens on next login.
  if (iterations < PBKDF2_ITERATIONS) {
    try {
      const salt = randomSalt();
      const passwordHash = await hashPassword(password || '', salt);
      await writeUser(user.username, { salt, passwordHash, iterations: PBKDF2_ITERATIONS });
      user.salt = salt;
      user.passwordHash = passwordHash;
      user.iterations = PBKDF2_ITERATIONS;
    } catch (e) {
      console.warn('[authUsers] PBKDF2 cost upgrade failed — keeping old hash:', e && e.message);
    }
  }
  return user;
}

export async function createUser(username, displayName, password, role = 'viewer') {
  const key = normUsername(username);
  if (!key) {
    throw new Error('Username wajib diisi');
  }
  if (!/^[a-z0-9._-]+$/.test(key)) {
    throw new Error('Username hanya boleh huruf, angka, titik, garis, dan garis bawah');
  }
  if (!password || password.length < 6) {
    throw new Error('Password minimal 6 karakter');
  }
  if (await getUser(key)) {
    throw new Error('Username sudah dipakai');
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  await writeUser(key, {
    displayName: displayName || username,
    role,
    salt,
    passwordHash,
    iterations: PBKDF2_ITERATIONS,
    active: true,
    mustChangePassword: false,
    createdAt: Date.now(),
  });
  return true;
}

export async function setPassword(username, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password minimal 6 karakter');
  }
  const user = await getUser(username);
  if (!user) {
    throw new Error('User tidak ditemukan');
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  await writeUser(username, {
    salt,
    passwordHash,
    iterations: PBKDF2_ITERATIONS,
    mustChangePassword: false,
  });
  return true;
}

export async function setRole(username, role) {
  if (!(await getUser(username))) {
    throw new Error('User tidak ditemukan');
  }
  await writeUser(username, { role });
  // Admins are never restricted: drop a leftover Akses menu.
  if (role === 'admin') {
    await clearModules(username);
  }
  return true;
}

export async function setActive(username, active) {
  if (!(await getUser(username))) {
    throw new Error('User tidak ditemukan');
  }
  await writeUser(username, { active: !!active });
  return true;
}

export async function deleteUser(username) {
  const key = normUsername(username);
  if (key === 'admin') {
    throw new Error('Akun admin utama tidak dapat dihapus');
  }
  if (!(await getUser(key))) {
    throw new Error('User tidak ditemukan');
  }
  await db().collection(COLLECTION).doc(key).delete();
  // A new account with the same username must not inherit the old Akses menu.
  await clearModules(key);
  return true;
}

// ── two-factor (TOTP) ───────────────────────────────────────────────────────────
// twoFactor = { enabled, secret, backupCodes: [{ salt, hash, used }] } — stored on
// the authUsers doc (server-only), so the secret + backup-code hashes never leave
// the server.

export async function getTwoFactor(username) {
  const u = await getUser(username);
  return (u && u.twoFactor) || null;
}

export async function setTwoFactor(username, twoFactor) {
  if (!(await getUser(username))) {
    throw new Error('User tidak ditemukan');
  }
  await writeUser(username, { twoFactor: twoFactor == null ? null : twoFactor });
  return true;
}

/** Generate `n` plaintext backup codes (XXXXX-XXXXX) for one-time display. */
export function newBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const hex = randomBytes(5).toString('hex').toUpperCase();
    codes.push(hex.slice(0, 5) + '-' + hex.slice(5, 10));
  }
  return codes;
}

/** Hash a batch of plaintext backup codes into stored {salt, hash, used} entries. */
export function encodeBackupCodes(plainCodes) {
  return plainCodes.map(code => {
    const salt = randomSalt();
    return { salt, hash: hashBackupCode(code, salt), used: false };
  });
}

/**
 * Verify `code` as an UNUSED backup code for the user; burn it (mark used) and
 * persist on match. Returns true when a code was consumed.
 */
export async function verifyAndBurnBackupCode(username, code) {
  const tf = await getTwoFactor(username);
  if (!tf || !tf.enabled || !Array.isArray(tf.backupCodes)) {
    return false;
  }
  for (const entry of tf.backupCodes) {
    if (entry.used) {
      continue;
    }
    if (safeEqualHex(hashBackupCode(code, entry.salt), entry.hash)) {
      entry.used = true;
      await writeUser(username, { twoFactor: tf });
      return true;
    }
  }
  return false;
}
