# Struktur Proyek

Cara kerja tiap bagian dijelaskan di [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md).

## Root

| File | Fungsi |
|---|---|
| `app.html` | Shell aplikasi: layar login, sidebar, topbar, kontainer halaman `#view-*` |
| `index.html` | Halaman landing |
| `style.css` | Token desain (tema terang/gelap) dan komponen |
| `mobile.css` | Penyesuaian layar kecil |
| `vite.config.js` | Konfigurasi Vite, termasuk plugin penggabung skrip klasik (`classicAll`) |
| `vitest.config.ts`, `tsconfig.json` | Tes & type-check |
| `eslint.config.js` | Aturan lint (dipakai ESLint 10). `.eslintrc.json` adalah format lama yang tidak dipakai |
| `.prettierrc.json`, `.prettierignore` | Format kode |
| `firebase.json`, `.firebaserc` | Hosting (rewrite, header keamanan), functions, emulator, project Firebase |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Aturan keamanan & indeks |
| `.env.example` | Contoh konfigurasi Firebase (salin ke `.env`) |
| `.env.offline` | Konfigurasi mode lokal (dipakai `dev:local` / `build:local`) |
| `icon.svg` | Ikon sumber |

## `public/` — disajikan apa adanya

| Path | Fungsi |
|---|---|
| `classic/` | Skrip klasik aplikasi (lihat di bawah) |
| `styles/landing.css`, `landing.js`, `landing-skip.js` | Halaman landing |
| `theme-init.js` | Menerapkan tema sebelum halaman dirender |
| `mobile-ui.js` | Drawer sidebar & menu tambahan di layar kecil |
| `sw.js`, `manifest.json`, `icon-*.png`, `apple-touch-icon.png`, `favicon.svg`, `logo-nusantara-sq.png` | PWA & ikon |

### `public/classic/`

| File | Fungsi |
|---|---|
| `erp.ns.js` | Namespace `ERP` dan registri aksi (`data-action`) |
| **Mesin inti** | |
| `core/schema.js` | Versi skema data & gudang default |
| `core/doc-engine.js` | Penomoran dokumen, validasi transisi status, total |
| `core/doc-flow.js` | Jejak dokumen (rantai penawaran → pesanan → surat jalan → faktur → pembayaran) |
| `core/doc-migrate.js` | Migrasi data dokumen |
| `core/warehouse.js` | Stok per gudang |
| `core/cost-ledger.js` | Harga pokok rata-rata bergerak |
| `core/gl.js` | Buku besar: bagan akun, jurnal otomatis, neraca saldo, jurnal umum |
| `core/gl-sync.js` | Menyusun ulang jurnal setiap `saveDB` |
| `core/balances.js` | Saldo piutang/hutang, open items, umur, kartu pihak (`Balances`) |
| `core/trading.js` | Aturan pengambilan: PO pengambilan, surat jalan, trip, kuota, cut-off, faktur dari trip, rekap timbangan (`Trading`) |
| `core/trading-summary.js` | Angka pengambilan untuk Ringkasan, Entri Harian, notifikasi (`TradingSummary`) |
| `core/integrity.js` | Log audit, kunci periode, cek buku besar |
| `core/trash.js` | Recycle bin |
| `core/rbac.js` | Hak akses per peran |
| `core/lazy-views.js` | Memuat chunk halaman saat dibuka |
| `core/menu-router.js` | Menghubungkan item menu ke fitur (`window.NSAMenu`) |
| **Halaman & form** | |
| `core/erp-crud.js` | Form & aksi pesanan, surat jalan, barang, pelanggan, supplier, pengguna, aset, armada; template cetak |
| `core/erp-view.js` | Renderer halaman utama, filter, paginasi, ekspor, pencarian global |
| `core/order-summary.js` | Ringkasan pesanan per periode (cetak/PDF) |
| `core/invoice-view.js` | Faktur penjualan/pembelian, penerimaan, pembayaran |
| `core/quotation-view.js` | Penawaran penjualan/pembelian |
| `core/return-view.js` | Retur penjualan/pembelian |
| `core/adjust-view.js` | Penyesuaian stok |
| `core/warehouse-view.js` | Gudang, stok per gudang, transfer |
| `core/gl-view.js` | Neraca saldo, jurnal, bagan akun, jurnal umum |
| `core/financial-reports.js` | Laba Rugi, Neraca, Arus Kas |
| `core/excel-import.js` | Impor Excel (termasuk saldo awal & stok awal) |
| `core/xlsx-export.js` | Penulis file Excel tanpa dependensi (`NSAXlsx`) |
| `core/archive-export.js` | Arsip Excel per tahun di Kelola Backup (`NSAArchive`) |
| **Pengambilan** | |
| `core/pickup-view.js` | PO Pengambilan, Catat Pengambilan, Impor Rekap Timbangan, Perubahan Timbangan, Rekap Pengambilan |
| `core/pickup-billing.js` | Tagih Pelanggan, Tagihan Supplier |
| `core/entri-harian.js` | Halaman Entri Harian (tugas rutin) |
| `core/pipeline-extras.js` | Rekonsiliasi Timbangan penerimaan barang, faktur per penerimaan |
| `core/sj-validation.js` | Validasi SJ Supplier |
| `core/funnel-report.js` | Alur pembelian/penjualan dan Laporan per Periode |
| **Modul tambahan** | |
| `core/sales-purchase-extras.js` | Uang muka, target penjualan, penerimaan barang, harga supplier |
| `core/bank-extras.js` | Kas & bank |
| `core/budget-gl-extras.js` | Anggaran, riwayat akun, biaya akrual, penggajian, audit jurnal |
| `core/inventory-extras.js` | Satuan, kategori, merek, permintaan barang, job costing |
| `core/master-extras.js` | Karyawan, kontak, kategori pelanggan/supplier |
| `core/asset-extras.js` | Aset tetap |
| `core/tax-extras.js` | Faktur pajak, Ekspor Coretax (XML) |
| `core/report-extras.js` | Daftar laporan, SPT PPN, analisis |
| `core/settings-extras.js` | Termin, pengiriman, kalender, log aktivitas, kategori penjualan, transaksi favorit |
| `core/*.d.ts` | Deklarasi tipe untuk tes |
| **Modul & UI** | |
| `modules/dashboard.js` | Halaman Ringkasan |
| `modules/master.js` | Data master |
| `modules/settings.js` | Profil, keamanan akun, 2FA, backup, instal aplikasi, notifikasi |
| `ui/nav.js` | Sidebar, sub-menu, menu pengguna, notifikasi, tema, `navigate()` |
| `ui/doc-tabs.js` | Tab dokumen di dalam modulnya |

## `src/` — ES modules (di-bundle Vite)

| File | Fungsi |
|---|---|
| `main.js` | Boot aplikasi |
| `pwa-register.js` | Registrasi service worker |
| `mobile-enhancements.js` | Penyempurnaan perangkat sentuh |
| `config/firebase.js` | Inisialisasi Firebase & deteksi mode lokal/cloud |
| `classic/core/doc-registry.js` | Registri tipe & status dokumen |
| `core/auth.js` | Login, logout, 2FA, ganti password |
| `core/local-users.js` | Akun lokal (hash PBKDF2) |
| `core/user-role.js` | Peran & label peran, fungsi admin pengguna |
| `core/totp.js` | Kode verifikasi 2 langkah |
| `core/db.js` | Muat/simpan data, sinkron Firestore, data awal (`initialData`), reset, impor |
| `core/demo-data.js` | Generator data demo (relatif terhadap tanggal hari ini, deterministik) |
| `core/indexeddb.js`, `core/local-store.js` | Penyimpanan IndexedDB |
| `core/backup.js` | Backup file & cloud |
| `core/helpers.js` | Format Rupiah, badge status, header, penomoran lama |
| `core/modal.js` | Modal, toast, dialog konfirmasi |
| `core/stock.js` | Mutasi & reservasi stok |
| `core/notifications.js` | Peringatan jatuh tempo, stok minimum, anggaran |
| `core/i18n.js` | Terjemahan tampilan Indonesia ↔ Inggris |
| `core/intersection-observer.js`, `core/view-transitions.js`, `core/performance-monitor.js` | Lazy loading, transisi halaman, pemantauan performa |

## `functions/` — Firebase Cloud Functions

| File | Fungsi |
|---|---|
| `index.js` | Ekspor semua function + API `api` |
| `handler.js`, `firestore.js` | Logika & akses data API |
| `auth.js`, `auth-users.js`, `totp.js` | Login username, akun, 2FA, admin pengguna |
| `access-log.js` | Log akses server |
| `backup.js` | Backup harian terjadwal |
| `admin.js` | Inisialisasi Admin SDK |

## Folder lain

| Folder | Isi |
|---|---|
| `tests/` | Tes Vitest (daftar di [docs/ARSITEKTUR.md §11](docs/ARSITEKTUR.md)) |
| `docs/` | Dokumentasi ([indeks](docs/README.md)) |
| `docs/pitch/` | Materi presentasi & contoh output |
| `scripts/generate-pwa-icons.ps1` | Membuat ikon PWA |
