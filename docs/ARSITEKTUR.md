# Arsitektur Teknis

> Untuk pengembang. Menjelaskan cara aplikasi bekerja dan aturan yang harus dijaga saat mengubah kode. Letak file: [../PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md).

---

## 1. Gambaran

Nusantara ERP adalah aplikasi web satu halaman **tanpa framework UI**.

| Lapisan | Lokasi | Cara dimuat |
|---|---|---|
| Halaman | `index.html` (landing), `app.html` (aplikasi) | Entry Vite; Firebase Hosting me-rewrite path lain ke `app.html` |
| ES modules | `src/` | Di-bundle Vite: boot, auth, database, helper, modal, i18n, notifikasi, backup, stok |
| Skrip klasik | `public/classic/` | Digabung plugin `classicBundlePlugin` (`vite.config.js`, urutan di `classicAll`) menjadi `/classic/bundle.js`; halaman besar dipecah menjadi chunk `/classic/view-<id>.js` yang dimuat saat dibuka (`core/lazy-views.js`) |
| Cloud Functions | `functions/` | Deploy terpisah ke Firebase |

Skrip klasik berbagi satu *global scope* dan saling memanggil melalui `window` (`window.DB`, `window.GL`, `window.navigate`, `window.saveDB`). Urutan di `classicAll` penting: file yang dipakai harus dimuat lebih dulu.

```mermaid
flowchart TB
  subgraph Browser
    UI["app.html + style.css/mobile.css"]
    ES["src/ (ES modules)<br/>auth · db · helpers · modal · i18n · stock"]
    CL["/classic/bundle.js<br/>nav · view · crud · gl · warehouse · rbac · integrity"]
    LZ["/classic/view-*.js<br/>ledger · financials · invoices · quotations · returns · warehouse · adjustments"]
    IDB[("IndexedDB")]
  end
  subgraph Firebase["Firebase (opsional)"]
    FS[("Firestore")]
    FN["Cloud Functions<br/>login · 2FA · admin user · API · backup · audit"]
  end
  UI --> ES --> CL --> LZ
  ES <--> IDB
  ES <-.-> FS
  ES <-.-> FN
```

---

## 2. Urutan boot (`src/main.js`)

1. `initI18n()` → registrasi service worker (PWA).
2. Muat `doc-registry` (ES) dan Chart.js (`window.Chart`).
3. `idb.init()` → `initAuth()`.
4. Belum login → layar login (`setupLoginScreen`). Sudah login → `startApp()`:
   1. `loadDB()` — lokal: dari IndexedDB; cloud: snapshot Firestore.
   2. `resolveUserRole()` → `window.__ERP_USER`.
   3. `initBackup()`.
   4. Muat `/classic/bundle.js`.
   5. `navigate('dashboard')` → `initNotifications()`.

Mode ditentukan `isFirebaseConfigured` (`src/config/firebase.js`): kunci `VITE_FIREBASE_*` kosong → mode lokal.

---

## 3. Data

- Semua data ada di satu objek **`window.DB`**: koleksi berbentuk array (`salesOrders`, `purchaseOrders`, `inventoryItems`, `deliveryOrders`, `salesInvoices`, …) dan objek tunggal (`settings`, `accounts`, `reservations`, `numberSequences`).
- **Menyimpan:** ubah `DB` lalu panggil `window.saveDB()`.
  - Mode lokal: seluruh `DB` ditulis ke IndexedDB (`nsa-local` → store `kv` → kunci `erp_db_v1`).
  - Mode cloud: dokumen yang berubah dikirim ke Firestore (debounce ±250 ms); snapshot real-time digabung tanpa menimpa perubahan lokal yang belum tersimpan; setiap tulis diberi `updatedBy`.
- **Koleksi tersinkron** ditentukan `COLLECTIONS` di `src/core/db.js` (dan harus sama dengan `functions/backup.js` serta `firestore.rules`). Koleksi di luar daftar hanya tersimpan lokal (T-27).
- **Data turunan** — dihitung ulang, bukan sumber kebenaran: jurnal otomatis, harga pokok, total stok (`item.stock` = Σ stok per gudang).
- **Skema & migrasi:** `core/schema.js` (versi skema, gudang default), `core/doc-migrate.js` (penomoran & referensi), `normalizeImportedDB` (impor backup).
- **Data contoh:** `defaultData` di `src/core/db.js`, dimuat saat database kosong atau lewat Reset Data.

---

## 4. Rantai pembungkus (wrapper)

Beberapa modul membungkus fungsi global. Selalu panggil versi `window.*`, bukan referensi lokal, agar semua lapisan berjalan.

| Fungsi | Urutan dari luar ke dalam |
|---|---|
| `window.saveDB` | `rbac` (tolak & kembalikan perubahan yang tidak diizinkan) → `integrity` (log audit, kunci periode) → `trash` (salin data terhapus) → `gl-sync` (`GL.reconcileAll()`) → `db.js` (persist) |
| `window.navigate` | `lazy-views` (muat chunk) → `rbac` (cek akses halaman) → `doc-tabs` → `view-tabs` → `ui/nav.js` (render) |
| `window.openModal` | `doc-tabs` (detail dokumen tertentu ditampilkan sebagai tab) → `src/core/modal.js` |

---

## 5. Mesin dokumen

| Komponen | File | Tugas |
|---|---|---|
| Registri | `src/classic/core/doc-registry.js` | Tipe dokumen (SQ, PQ, SO, PO, DO, SI, PI, SR, PP, SRN, PRN, IT), prefix, status, transisi |
| Engine | `core/doc-engine.js` | `nextNumber` (`PREFIX.YYYY.MM.NNNNN`), `canTransition`, total |
| Jejak | `core/doc-flow.js` | Rantai dokumen lewat `sourceQuotation`, `soId`/`poId`, `sourceId`, `invoiceId` |
| Penomoran lama | `src/core/helpers.js` `nextId` | `PREFIX.YYYY.MM.NNN` — masih dipakai sebagian form (T-34) |

## 6. Stok

| Komponen | File | Tugas |
|---|---|---|
| Gudang | `core/warehouse.js` | `warehouseStock` per barang; `addStock`, `removeStock`, `transferStock`, `setStock`; `item.stock` disinkronkan sebagai total |
| Mutasi & reservasi | `src/core/stock.js` | `applyStockMutation(order, 'in'|'out')`, `reserveStock`, `releaseReservation`, `checkOversell`, `getAvailableStock` |
| Harga pokok | `core/cost-ledger.js` | Rata-rata bergerak dari PO diterima, penyesuaian, SO terkirim |

**Aturan:** setiap perubahan stok harus lewat fungsi gudang. Mengubah `item.stock` langsung akan tertimpa saat total dihitung ulang (T-05).

## 7. Akuntansi

- `core/gl.js` — bagan akun bawaan, pemetaan akun (barang → pihak → default perusahaan), pembentuk jurnal per tipe dokumen, `reconcileAll()`, `trialBalance()`, `postJournalVoucher()`.
- `reconcileAll()` menyusun ulang **semua jurnal otomatis** dengan ID stabil (`J:SO:<id>:rev`, `J:PO:<id>:recv`, …) setiap kali `saveDB`. Jurnal manual (`source: 'manual'`) dan jurnal impor dipertahankan.
- Konsumen jurnal: `core/gl-view.js` (neraca saldo, jurnal, bagan akun), `core/financial-reports.js` (laporan keuangan), `core/budget-gl-extras.js` (anggaran, riwayat akun, biaya akrual, penggajian), dashboard.
- Aturan posting lengkap: [04-AKUNTANSI.md](04-AKUNTANSI.md).

## 8. Keamanan dan kontrol

| Aspek | Implementasi |
|---|---|
| Login lokal | `src/core/local-users.js` (PBKDF2-HMAC-SHA256 600k, wajib ganti password pertama kali), `src/core/auth.js` |
| Login cloud | Callable `loginWithUsername` → custom token Firebase; pembatasan percobaan; `functions/auth.js`, `functions/auth-users.js` |
| 2FA | TOTP RFC 6238 (`src/core/totp.js`) + kode cadangan; rahasia disimpan di server pada mode cloud |
| Peran | `src/core/user-role.js` (peran & label), `core/rbac.js` (matriks peran × modul, sembunyikan menu, cegah klik, saring `saveDB`), `firestore.rules` (penegakan di server) |
| Audit & periode | `core/integrity.js` (log audit lokal, kunci periode, cek buku besar); `functions/access-log.js` (log akses server) |
| Recycle bin | `core/trash.js` (90 hari, maks. 300 entri) |
| CSP | `firebase.json`: `script-src 'self'` tanpa `unsafe-inline` — **dilarang** memakai atribut `onclick`/`onmouseover` inline; gunakan `data-action` + event delegation |

## 9. Antarmuka

- **Shell:** `app.html` — sidebar, panel sub-menu, topbar (pencarian, status data, tema, notifikasi, pengguna), dan kontainer halaman `#view-<id>`.
- **Navigasi:** `ui/nav.js` — `MENU_CONFIG`, `navigate(id)` merender lewat `getRenderer(id)` (`core/erp-view.js`) dan menyimpan cache halaman (`window.invalidateView(id)` untuk memaksa render ulang).
- **Router menu:** `core/menu-router.js` (`window.NSAMenu`) memetakan item menu ke fungsi `open*()` modul tambahan. Modul tambahan memakai pola *inject*: invalidasi halaman induk → `navigate` → ganti isi kontainer.
- **Komponen:** `src/core/helpers.js` (`idr`, `badge`, `secHdr`, `statRow`, …), `src/core/modal.js` (`openModal`, `closeModal`, `showToast`, `confirmDialog`).
- **Gaya:** `style.css` (token warna & komponen, tema terang/gelap via `data-theme`), `mobile.css`, `public/theme-init.js` (tema sebelum render), `public/mobile-ui.js`.
- **Bahasa:** `src/core/i18n.js` menerjemahkan teks Indonesia → Inggris di DOM saat bahasa Inggris dipilih.
- **Tab:** `ui/view-tabs.js`, `ui/doc-tabs.js` — lihat keputusan di [09-AUDIT-UX.md §2](09-AUDIT-UX.md).

## 10. Cloud Functions (`functions/`)

| Fungsi | Jenis | Tugas |
|---|---|---|
| `api` | HTTPS | API baca-saja `/api/v1` ([API.md](API.md)) |
| `nightlyBackup` | Terjadwal | Snapshot koleksi ke `serverBackups` |
| `onBusinessWrite`, `recordLogout`, `adminListAccessLog` | Trigger/callable | Log akses server |
| `loginWithUsername`, `changeMyPassword` | Callable | Login & ganti password |
| `enable2FA`, `disable2FA`, `regenerateBackupCodes`, `get2FAStatus` | Callable | Verifikasi 2 langkah |
| `adminListUsers`, `adminCreateUser`, `adminSetPassword`, `adminSetRole`, `adminSetActive`, `adminDeleteUser` | Callable | Manajemen pengguna oleh admin |

## 11. Pengujian

Vitest + happy-dom (`tests/`). Tes yang memuat skrip klasik mengevaluasi file asli di `public/classic/`.

| Tes | Cakupan |
|---|---|
| `classic-bundle-smoke.test.ts` | Semua skrip klasik termuat; global wajib ada (`NSAMenu`, `GL`, `Integrity`, `DocEngine`, `NSAXlsx`, `navigate`, `invalidateView`); **setiap** `#view-*` di `app.html` bisa dirender; **setiap** rute `NSAMenu` bisa dibuka |
| `gl.test.ts`, `cost-ledger.test.ts` | Jurnal otomatis, neraca saldo, jurnal umum, harga pokok |
| `doc-engine.test.ts`, `erp-flow.test.ts`, `stock-reservation.test.ts`, `transaction-rollback.test.ts` | Penomoran, transisi, alur dokumen, reservasi stok, rollback |
| `rbac.test.ts`, `integrity.test.ts` | Hak akses dan log audit/kunci periode |
| `auth.test.ts`, `twofa-flow.test.ts`, `totp.test.ts` | Login lokal & 2FA |
| `db-dirty-save.test.ts`, `indexeddb-sync.test.ts` | Penyimpanan & sinkronisasi |
| `api-handler.test.ts` | API integrasi |
| `i18n.test.ts`, `data-validation.test.ts`, `example.test.ts` | Utilitas |

## 12. Daftar periksa saat menambah fitur

1. File klasik baru → daftarkan di `classicAll` (`vite.config.js`) setelah dependensinya.
2. Halaman baru → kontainer `<div id="view-x" class="view">` di `app.html` **dan** renderer di `getRenderer` (diwajibkan smoke test).
3. Menu → `MENU_CONFIG` (`ui/nav.js`); bila membuka fungsi modul tambahan, tambahkan rute di `core/menu-router.js`.
4. Hak akses → petakan modul di `core/rbac.js`.
5. Koleksi baru → nilai default (`src/core/db.js`), `COLLECTIONS` (sinkron), `firestore.rules` (`moduleOf`), `functions/backup.js`.
6. Efek stok → lewat `core/warehouse.js`; efek akuntansi → pembentuk jurnal di `core/gl.js` + tes di `tests/gl.test.ts`.
7. Tanpa event handler inline (CSP); gunakan `data-action`.
8. Jalankan `npm run test:run`, `npm run type-check`, `npm run lint`, `npm run build`.
