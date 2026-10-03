// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Username → Firebase custom-token auth (Cloud Functions).
// -----------------------------------------------------------------------------
// The browser logs in with a username/password. These callables verify the
// password server-side against the locked-down `authUsers` collection and mint a
// Firebase custom token carrying the user's role as a claim. The client then
// calls signInWithCustomToken(), which populates request.auth (uid + role) so the
// Firestore security rules pass and data syncs on every device — without any
// shared password ever being shipped to the client.
//
//   • loginWithUsername({ username, password })  → { token, mustChangePassword }
//   • changeMyPassword({ oldPassword, newPassword })  (self, must be signed in)
//   • admin* ({...})                              (caller must have role=admin)
// ═══════════════════════════════════════════════════════════════════════════════

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { adminAuth } from './admin.js';
import {
  ensureSeedUsers,
  verifyPassword,
  listUsers,
  createUser,
  setPassword,
  setRole,
  setActive,
  setModules,
  deleteUser,
  uidFor,
  getTwoFactor,
  setTwoFactor,
  newBackupCodes,
  encodeBackupCodes,
  verifyAndBurnBackupCode,
} from './auth-users.js';
import { verifyTOTP } from './totp.js';
import { appendAccessLog } from './access-log.js';
import { normalizeModules } from './user-modules.js';

const CALL_OPTS = { cors: true, maxInstances: 10 };

// ── Brute-force throttle for password verification ───────────────────────────────
// In-memory, per warm instance (same trade-off as handler.js): effective because
// a warm instance is reused across calls, and it degrades to per-instance limits
// under scale-out — still enough to blunt online password guessing. Keyed by
// username+IP so one attacker can't lock out a whole account from many IPs, and a
// shared IP can't be locked out by targeting many usernames.
const LOGIN_MAX_ATTEMPTS = 8; // failures allowed per window before lockout
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window
const _loginAttempts = new Map(); // key → { count, windowStart }

function throttleKey(request, username) {
  const req = request.rawRequest || {};
  const fwd = (req.headers && req.headers['x-forwarded-for']) || '';
  const ip = fwd
    ? String(fwd).split(',')[0].trim()
    : (req.socket && req.socket.remoteAddress) || 'unknown';
  return `${String(username || '').toLowerCase()}::${ip}`;
}

/** Throw resource-exhausted when the key is locked out; otherwise a no-op. */
function assertNotLockedOut(key) {
  const now = Date.now();
  if (_loginAttempts.size > 10_000) {
    for (const [k, b] of _loginAttempts) {
      if (now - b.windowStart >= LOGIN_WINDOW_MS) {
        _loginAttempts.delete(k);
      }
    }
  }
  const bucket = _loginAttempts.get(key);
  if (bucket && now - bucket.windowStart < LOGIN_WINDOW_MS && bucket.count >= LOGIN_MAX_ATTEMPTS) {
    throw new HttpsError(
      'resource-exhausted',
      'Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.'
    );
  }
}

/** Record a failed attempt against the key (opens/extends its lockout window). */
function recordFailedAttempt(key) {
  const now = Date.now();
  const bucket = _loginAttempts.get(key);
  if (!bucket || now - bucket.windowStart >= LOGIN_WINDOW_MS) {
    _loginAttempts.set(key, { count: 1, windowStart: now });
  } else {
    bucket.count += 1;
  }
}

/** Clear the counter after a successful auth so a good login resets the window. */
function clearFailedAttempts(key) {
  _loginAttempts.delete(key);
}

function need(value, message) {
  if (value == null || value === '') {
    throw new HttpsError('invalid-argument', message);
  }
  return value;
}

// The caller must be signed in as an admin (role claim on their token).
function requireAdmin(request) {
  const role = request.auth && request.auth.token && request.auth.token.role;
  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang boleh melakukan ini.');
  }
}

// Revoke every outstanding session for a username after a role/active/password
// change (or deletion). Firestore rules read the role from the token claim and do
// NOT re-check revocation, so the current ID token keeps its old claim until it
// expires — but revoking bars the client from minting a fresh one, so the session
// dies within the token TTL (≤1h) instead of lingering indefinitely. Without this
// a downgraded/disabled account could refresh its old role indefinitely.
// Best-effort: a revoke failure must not fail the admin operation itself.
async function revokeSessions(username) {
  try {
    await adminAuth().revokeRefreshTokens(uidFor(username));
  } catch (e) {
    logger.warn('[auth] revokeRefreshTokens failed for', username, e && e.message);
  }
}

// Run an auth-users store operation, converting its plain validation Errors
// (e.g. "Username sudah dipakai") into an HttpsError so the message reaches the
// client instead of being masked as a generic INTERNAL.
async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError('failed-precondition', (e && e.message) || 'Operasi gagal');
  }
}

async function mintToken(user) {
  // Additional claims ride inside the ID token, so the Firestore rules can read
  // request.auth.token.role without a users/{uid} lookup.
  return adminAuth().createCustomToken(uidFor(user.username), { role: user.role || 'viewer' });
}

/**
 * Verify username/password and return a Firebase custom token.
 * Auto-seeds the four default accounts the first time the store is empty. Their
 * passwords are NOT guessable defaults — they come from SEED_ADMIN_PASSWORD or a
 * per-account random string logged once to Cloud Logging (see ensureSeedUsers).
 * Rate-limited per username+IP to throttle online password guessing.
 */
export const loginWithUsername = onCall(CALL_OPTS, async request => {
  const username = need(request.data && request.data.username, 'Username wajib diisi');
  const password = need(request.data && request.data.password, 'Password wajib diisi');

  // Throttle before touching the store so lockout also applies to unknown users
  // (otherwise "does this username exist" is itself a rate-unlimited oracle).
  const tKey = throttleKey(request, username);
  assertNotLockedOut(tKey);

  await ensureSeedUsers();

  const user = await verifyPassword(username, password);
  if (!user) {
    recordFailedAttempt(tKey);
    await appendAccessLog({ type: 'auth', action: 'login_failed', actor: username });
    // Same message for unknown user and wrong password — don't reveal which.
    throw new HttpsError('unauthenticated', 'Username atau password salah');
  }

  // Second factor: when the account has 2FA on, require a valid TOTP or an unused
  // backup code before minting a token. A missing code returns { twoFactor: true }
  // so the client can prompt for step 2 (which re-calls with `totp`).
  if (user.twoFactor && user.twoFactor.enabled) {
    const totp = request.data && request.data.totp;
    if (!totp) {
      return { twoFactor: true };
    }
    const okTotp = verifyTOTP(user.twoFactor.secret, totp);
    const okBackup = okTotp ? false : await verifyAndBurnBackupCode(user.username, totp);
    if (!okTotp && !okBackup) {
      recordFailedAttempt(tKey);
      await appendAccessLog({ type: 'auth', action: 'login_failed', actor: user.username });
      throw new HttpsError('unauthenticated', 'Kode 2FA salah atau sudah dipakai');
    }
  }

  clearFailedAttempts(tKey);
  const token = await mintToken(user);
  await appendAccessLog({ type: 'auth', action: 'login', actor: user.username });
  return { token, mustChangePassword: !!user.mustChangePassword, role: user.role || 'viewer' };
});

/** Change the signed-in user's own password (re-verifies the old one). */
export const changeMyPassword = onCall(CALL_OPTS, async request => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !uid.startsWith('u_')) {
    throw new HttpsError('unauthenticated', 'Harus login terlebih dahulu.');
  }
  const username = uid.slice(2);
  const oldPassword = need(request.data && request.data.oldPassword, 'Password lama wajib diisi');
  const newPassword = need(request.data && request.data.newPassword, 'Password baru wajib diisi');
  if (String(newPassword).length < 6) {
    throw new HttpsError('invalid-argument', 'Password minimal 6 karakter');
  }

  const ok = await verifyPassword(username, oldPassword);
  if (!ok) {
    throw new HttpsError('permission-denied', 'Password lama salah');
  }
  await guard(() => setPassword(username, newPassword));
  // Note: the caller's own session is NOT revoked here — they just proved the old
  // password and keep working. Admin-driven resets (adminSetPassword) DO revoke.
  return { ok: true };
});

// ── two-factor (TOTP) for the signed-in user ─────────────────────────────────────
// The account is identified by the token uid (u_<username>), so 2FA can only ever
// be managed for one's own account. Secrets/backup hashes stay server-side.
function callerUsername(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid || !uid.startsWith('u_')) {
    throw new HttpsError('unauthenticated', 'Harus login terlebih dahulu.');
  }
  return uid.slice(2);
}

/** Enable 2FA: verify a live TOTP for `secret`, store it, and return one-time backup codes. */
export const enable2FA = onCall(CALL_OPTS, async request => {
  const username = callerUsername(request);
  const d = request.data || {};
  const secret = need(d.secret, 'Secret wajib diisi');
  const token = need(d.token, 'Kode verifikasi wajib diisi');
  if (!verifyTOTP(secret, token)) {
    throw new HttpsError(
      'invalid-argument',
      'Kode salah — pastikan jam perangkat & authenticator sinkron.'
    );
  }
  const plainCodes = newBackupCodes();
  await guard(() =>
    setTwoFactor(username, { enabled: true, secret, backupCodes: encodeBackupCodes(plainCodes) })
  );
  return { backupCodes: plainCodes };
});

/** Disable 2FA. Confirm with the account password OR a valid TOTP / backup code. */
export const disable2FA = onCall(CALL_OPTS, async request => {
  const username = callerUsername(request);
  const confirm = need(request.data && request.data.confirm, 'Konfirmasi wajib diisi');
  const tf = await getTwoFactor(username);
  if (!tf || !tf.enabled) {
    return { ok: true }; // already off
  }
  const okPassword = !!(await verifyPassword(username, confirm));
  const okTotp = okPassword ? false : verifyTOTP(tf.secret, confirm);
  const okBackup = okPassword || okTotp ? false : await verifyAndBurnBackupCode(username, confirm);
  if (!okPassword && !okTotp && !okBackup) {
    throw new HttpsError(
      'permission-denied',
      'Konfirmasi salah — masukkan password atau kode 2FA yang benar.'
    );
  }
  await guard(() => setTwoFactor(username, null));
  return { ok: true };
});

/** Issue a fresh batch of backup codes (invalidates the old ones). */
export const regenerateBackupCodes = onCall(CALL_OPTS, async request => {
  const username = callerUsername(request);
  const tf = await getTwoFactor(username);
  if (!tf || !tf.enabled) {
    throw new HttpsError('failed-precondition', '2FA belum aktif.');
  }
  const plainCodes = newBackupCodes();
  await guard(() => setTwoFactor(username, { ...tf, backupCodes: encodeBackupCodes(plainCodes) }));
  return { backupCodes: plainCodes };
});

/** 2FA status snapshot for the settings UI. */
export const get2FAStatus = onCall(CALL_OPTS, async request => {
  const username = callerUsername(request);
  const tf = await getTwoFactor(username);
  return {
    enabled: !!(tf && tf.enabled),
    backupCodesRemaining:
      tf && Array.isArray(tf.backupCodes) ? tf.backupCodes.filter(c => !c.used).length : 0,
  };
});

// ── admin user management (caller must be an admin) ──────────────────────────────
export const adminListUsers = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  return { users: await listUsers() };
});

export const adminCreateUser = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  const d = request.data || {};
  await guard(() => createUser(d.username, d.displayName, d.password, d.role || 'viewer'));
  return { ok: true };
});

export const adminSetPassword = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  const d = request.data || {};
  const username = need(d.username, 'Username wajib diisi');
  await guard(() => setPassword(username, need(d.password, 'Password wajib diisi')));
  await revokeSessions(username); // force re-login with the new password
  return { ok: true };
});

export const adminSetRole = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  const d = request.data || {};
  const username = need(d.username, 'Username wajib diisi');
  await guard(() => setRole(username, need(d.role, 'Role wajib diisi')));
  await revokeSessions(username); // stale role claim must not outlive the change
  return { ok: true };
});

// Akses menu: the modules a user may use, narrowing their role ([] = all their
// role allows). Stored on users/u_<username>, which firestore.rules reads on
// every write, so no session revoke is needed. Unknown module keys and
// restricting an admin are rejected.
export const adminSetModules = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  const d = request.data || {};
  const username = need(d.username, 'Username wajib diisi');
  let modules;
  try {
    modules = normalizeModules(d.modules);
  } catch (e) {
    throw new HttpsError('invalid-argument', e.message);
  }
  const stored = await guard(() => setModules(username, modules));
  return { ok: true, modules: stored };
});

export const adminSetActive = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  const d = request.data || {};
  const username = need(d.username, 'Username wajib diisi');
  await guard(() => setActive(username, !!d.active));
  // Deactivating cuts off existing sessions within the token TTL (the claim alone
  // would otherwise keep them working, and refreshing indefinitely).
  if (!d.active) {
    await revokeSessions(username);
  }
  return { ok: true };
});

export const adminDeleteUser = onCall(CALL_OPTS, async request => {
  requireAdmin(request);
  const d = request.data || {};
  const username = need(d.username, 'Username wajib diisi');
  await guard(() => deleteUser(username));
  await revokeSessions(username);
  return { ok: true };
});
