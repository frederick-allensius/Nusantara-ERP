# Nusantara ERP System

A modern, lightweight Enterprise Resource Planning (ERP) system built for Nusantara businesses. Local-first by design — data lives in IndexedDB on the device — with an optional Firebase backend for cloud sync when configured.

## 🚀 Version 3.3.0

**Highlights:**

- 💾 **Local-first storage**: full dataset persists in IndexedDB (works without any backend)
- 🔥 **Optional Firestore sync**: real-time sync across devices, with concurrent-edit protection (`updatedBy` stamping + conflict surfacing)
- 📊 **Built-in reports**: Laporan Umur Piutang (AR aging), Kartu Stok (per-item movement card that reconciles to on-hand), and Kartu Piutang/Hutang (per-party running statement)
- ⚖️ **Trading pipeline**: PO → Surat Jalan & Timbangan (weighbridge capture) → Rekonsiliasi → Multi-Invoice → Payment, with the reconciled quantity driving invoicing
- 🔎 **Supplier SJ validation**: cross-checks field Surat Jalan tonnage/price against the supplier's Excel recap and flags mismatches before an invoice is issued (pluggable recap sources)
- 📉 **Pipeline funnels + custom-range report**: purchase & sales funnels on the dashboard plus a report filterable by date range, month, customer, supplier, and PO number
- 👥 **Dual-view access**: a minimal Entri Harian data-entry surface for admin/accounting and an executive dashboard (funnels, real-time margin, piutang aging, financial reports) for owner/management
- 🔠 **Senior-friendly UI**: 16-18px base type, high contrast, and ~44px touch targets across desktop and mobile
- 🛡️ **Data integrity**: audit trail, accounting period lock, and ledger self-check
- 🔐 **Hardened auth**: username login via Cloud Function custom tokens, PBKDF2-600k password hashing (OWASP), brute-force login throttle + admin session revocation, RBAC (5 roles) + optional TOTP 2FA
- 🔒 **Hardened delivery**: strict Content-Security-Policy + HSTS/anti-clickjacking headers (no inline scripts)
- 🌐 **Bilingual UI**: Indonesian ⇄ English toggle (i18n)
- 🔌 **Integration API**: read-only `/api/v1` (Firebase Cloud Functions — API-key auth, rotation, rate limiting, CORS pinning, cursor pagination + delta sync)
- ☁️ **Automated backups**: nightly server-side Firestore snapshots via a Cloud Scheduler function (14-day retention)
- 📦 **Modular architecture**: ES modules + a classic core bundle with on-demand lazy-loaded view chunks
- 📱 **PWA**: installable, offline-capable

**📋 Quick Start:** [QUICK_START.md](./QUICK_START.md)

---

## ✨ Features

### Core Modules

- **Dashboard** - Real-time metrics and analytics with Chart.js
- **Sales & Purchase** - Order management with line items
- **Inventory** - Stock tracking with reservation system
- **Finance** - Cash flow and expense tracking
- **Logistics** - Delivery order management
- **Master Data** - Customers, suppliers, and products

### Modern Capabilities

- **💾 Local-first** - IndexedDB persistence, no backend required
- **🔥 Optional Firebase** - Real-time sync + cloud auth when configured via `.env`
- **🛡️ Data Integrity** - Audit trail, period lock, ledger check (Finance view)
- **📱 PWA Support** - Install as native app, works offline
- **🌗 Dark/Light Mode** - Theme toggle in the topbar
- **✅ TypeScript** - Type-safe development
- **🧪 Testing** - Vitest test suite incl. a full classic-bundle smoke test
- **🎨 Code Quality** - ESLint + Prettier

## 💾 Storage Model

1. **IndexedDB (default)** — the whole DB is mirrored to IndexedDB
   (`nsa-local`/`kv`) on every save. localStorage is only used for one-time
   legacy migration and small flags.
2. **Firestore (optional)** — when `.env` has Firebase credentials and the
   database is provisioned, collections sync in real time across devices and
   email/password auth replaces the local fallback account.
3. **File backup** — Settings → Kelola Backup exports/imports the full DB as
   a JSON file.

## 📋 Quick Setup

**5-Minute Setup:** See [QUICK_START.md](./QUICK_START.md)

```bash
npm install                    # Install dependencies
cp .env.example .env          # Configure Firebase
firebase deploy --only rules  # Deploy security rules
npm run dev                   # Start development
```

**Login:** See [Firebase Auth Setup Guide](./docs/FIREBASE_AUTH_SETUP.md) for creating your first user

**Detailed setup:** [QUICK_START.md](./QUICK_START.md)

## 🧪 Testing

```bash
npm test              # Watch mode
npm run test:run      # Single run
npm run test:ui       # Interactive UI
npm run test:coverage # Coverage report
npm run type-check    # TypeScript check
```

See [docs/TESTING.md](./docs/TESTING.md) for details.

## 📱 Progressive Web App

Install as a native app on desktop or mobile:

- Works offline with cached data
- Faster load times
- Native app experience
- Background sync

## 📁 Project Structure

```
nusantara-erp/
├── src/                    # ES modules (auth, db, local-store, helpers, modal, …)
│   ├── core/              # Core modules
│   ├── config/            # Firebase config
│   └── classic/           # Classic modules migrated to ES (doc-registry)
├── public/classic/         # Classic scripts, concatenated into /classic/bundle.js
│   ├── core/              # ERP engine (erp-crud, erp-view, gl, integrity, …)
│   ├── modules/           # Dashboard, master, settings
│   └── ui/                # Sidebar navigation
├── tests/                  # Vitest suite (unit + classic-bundle smoke test)
├── docs/                   # Documentation
├── scripts/                # Accurate migration / export tooling (Node)
└── Configuration files
```

**Detailed structure:** See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

## 🎯 Key Modules

- **Dashboard** - Real-time metrics and charts
- **Sales & Purchase** - Order management with line items
- **Inventory** - Stock tracking with reservation
- **Finance** - Income, expenses, cash flow
- **Logistics** - Delivery orders
- **Master Data** - Customers, suppliers, products
- **Settings** - Configuration and user management

## 🔐 Security

- **Username login** - Server-verified via a Cloud Function that mints a Firebase custom token (populates `request.auth` so Firestore rules pass); transparent local fallback when the server is unreachable
- **PBKDF2-600k hashing** - Passwords hashed with PBKDF2-HMAC-SHA256 at the OWASP-recommended 600k iterations, both in-browser and server-side, with per-user salt and transparent lazy cost-upgrade of older hashes
- **Default-credential lockdown** - Once an online login has succeeded on a device, an untouched default account is refused as a backdoor; first login forces a password change. Seeded accounts get a random password (or `SEED_ADMIN_PASSWORD`), never a guessable `<username>123`
- **Brute-force throttle + session revocation** - Online login is rate-limited (8 failures / 15-min window, keyed by username+IP, applied before the store lookup so unknown usernames aren't an oracle); admin password/role/deactivate/delete operations revoke the target's refresh tokens so a stale role claim can't outlive the change
- **Strict CSP + security headers** - Content-Security-Policy with no `'unsafe-inline'` scripts (all bootstrap scripts externalised), plus HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy
- **Two-Factor Auth (optional)** - RFC 6238 TOTP (Google Authenticator/Authy/etc.) + one-time backup codes; secrets held server-side (cross-device) with a local fallback
- **Concurrent-edit protection** - Remote snapshots merge instead of clobbering unsaved local edits; true conflicts are surfaced and every write is stamped with `updatedBy`
- **Firestore & Storage Rules** - Row-level access control; `authUsers` and `serverBackups` are server-only (never client-reachable)
- **Session Timeout** - Auto logout after 30 minutes inactivity

**Setup Guide:** [Firebase Auth Setup](./docs/FIREBASE_AUTH_SETUP.md)

## 🌐 Browser Support

- Chrome, Firefox, Safari, Edge (latest 2 versions)
- Fully responsive: desktop, tablet, mobile
- PWA installable on all platforms

## 🐛 Troubleshooting

**Build/Install Issues**

```bash
rm -rf node_modules package-lock.json
npm install
```

**Firebase Connection**

- Check `.env` configuration
- Verify services enabled in Firebase Console
- Check browser console for errors

**PWA Not Installing**

- Requires HTTPS (or localhost)
- Check manifest.json accessible
- Clear browser cache

**Tests Failing**

```bash
npm run test:run -- --clearCache
```

## 📚 Documentation

| Document                                                         | Description                                |
| ---------------------------------------------------------------- | ------------------------------------------ |
| **[README.md](./README.md)**                                     | 👈 You are here - Quick start and overview |
| **[QUICK_START.md](./QUICK_START.md)**                           | 5-minute setup guide                       |
| **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)**               | Detailed project structure                 |
| **[docs/IMPROVEMENTS.md](./docs/IMPROVEMENTS.md)**               | v2.1.0 improvements details                |
| **[docs/FIREBASE_AUTH_SETUP.md](./docs/FIREBASE_AUTH_SETUP.md)** | 🔐 Firebase Authentication setup guide     |
| **[docs/API.md](./docs/API.md)**                                 | 🔌 Integration API (read-only) reference   |
| **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**                   | 🚀 Deploy + production data runbook        |
| **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**               | System architecture                        |
| **[docs/ARCHITECTURE_ERP_V4.md](./docs/ARCHITECTURE_ERP_V4.md)** | V4 document-flow engine plan               |
| **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)**                 | Development guide                          |
| **[docs/TESTING.md](./docs/TESTING.md)**                         | Testing guide                              |
| **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)**               | Contribution guidelines                    |

## 🔄 Version

**Version:** 3.3.0  
**Last Updated:** July 10, 2026  
**Firebase SDK:** 12.12.0  
**Vite:** 8.0.16  
**Node.js:** 20.19.0+

## 🛣️ Roadmap

### Completed ✅

- [x] Local-first IndexedDB persistence (whole-DB mirror, no quota limit issues)
- [x] Optional Firebase backend with real-time sync
- [x] Data integrity: audit trail + period lock + ledger check
- [x] Modular architecture (ES modules + classic bundle)
- [x] TypeScript support
- [x] Testing framework (Vitest) incl. classic-bundle smoke test
- [x] PWA capabilities
- [x] Mobile responsive design
- [x] Dark mode
- [x] Excel (XLSX) export — offline, zero-dependency
- [x] File-based backup/restore (export/import JSON)
- [x] OS notifications (overdue invoices, low stock)
- [x] Transaction rollback system
- [x] Role-based access control (RBAC) — 5 roles + pending, Firestore-enforced
- [x] Two-factor authentication (2FA) — optional TOTP (authenticator apps) + one-time backup codes
- [x] Multi-language support — Indonesian / English UI toggle (i18n)
- [x] PDF export for invoices & reports
- [x] Read-only integration API (Firebase Cloud Functions + API-key auth)
- [x] Username login via Cloud Function custom tokens (+ transparent local fallback)
- [x] Hardened auth — PBKDF2-600k hashing + default-credential lockdown
- [x] Strict Content-Security-Policy + security headers (no inline scripts)
- [x] Concurrent-edit protection — snapshot merge + conflict surfacing + `updatedBy` stamping
- [x] API hardening — rate limiting, key rotation, CORS pinning, cursor pagination + delta sync
- [x] Performance — on-demand lazy-loaded view chunks (split from the core bundle)
- [x] Automated nightly Firestore backups (Cloud Scheduler function, 14-day retention)
- [x] Reports — Laporan Umur Piutang (AR aging), Kartu Stok, Kartu Piutang/Hutang
- [x] Brute-force login throttle + admin-driven session revocation + random seed credentials
- [x] Notifikasi Sistem settings card — grant OS-notification permission + send a test
- [x] `goodsReceipts` (Penerimaan Barang) sync to Firestore

### Planned 📋

- [ ] Write endpoints for the integration API
- [ ] Accurate-style nested document tabs polish

---

Built with ❤️ for Nusantara using Firebase
