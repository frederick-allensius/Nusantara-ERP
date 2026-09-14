# 02 — Peta Modul dan Navigasi

> **Tujuan:** menunjukkan setiap menu, layar yang dibukanya, dan struktur navigasi baru yang lebih mudah dipahami. **Tidak ada fitur yang dihapus** — hanya diberi nama dan tempat yang lebih jelas.

---

## 1. Gambaran singkat

| Hal | Jumlah (saat review) |
|---|---|
| Grup menu di sidebar | 9 (Dashboard, Company, General Ledger, Cash & Bank, Fixed Assets, Sales, Purchases, Inventory, Reports) |
| Item menu | 74 |
| Halaman (view) di aplikasi | 24 kontainer; banyak fitur "menumpang" di halaman lain |
| Lapis navigasi | 4: sidebar ikon → panel sub-menu → bar tab halaman → tab dokumen |

---

## 2. Menu saat ini → layar yang dibuka

Label ditulis persis seperti di aplikasi saat review. Kolom "Halaman induk" menunjukkan kontainer tempat fitur ditampilkan.

### Company (ikon roda gigi di bawah sidebar)

| Menu | Arti | Halaman induk | Catatan |
|---|---|---|---|
| Profil Perusahaan | Nama, telepon, alamat perusahaan & identitas pengguna | Dialog | Belum ada NPWP/logo/rekening |
| Tax | Pengaturan & rekap pajak | Perpajakan | |
| Payment Term | Termin pembayaran | Pengaturan | |
| Shipment | Metode pengiriman | Pengaturan | |
| Employee | Karyawan | Data Master | Juga dipakai Penggajian |
| Contact | Kontak | Data Master | |
| Calendar | Kalender fiskal & hari libur | Pengaturan | |
| Activity Log | Log aktivitas | Pengaturan | |
| Recycle Bin | Data terhapus | Pengaturan | |
| Import dari Excel | Impor data & saldo awal | Import Excel | Juga ada di Inventory |

### General Ledger

| Menu | Arti | Halaman induk | Catatan |
|---|---|---|---|
| Chart of Accounts | Bagan akun | Buku Besar | Tab Bagan Akun tidak otomatis terpilih (T-19) |
| Trial Balance | Neraca saldo | Buku Besar | |
| Laporan Keuangan | Laba Rugi/Neraca/Arus Kas | Laporan Keuangan | Juga ada di Reports |
| Expense Accrual | Biaya akrual | Keuangan | |
| Employee Payroll | Penggajian | Keuangan | |
| Journal Voucher | Jurnal umum | Buku Besar | Form jurnal tidak otomatis terbuka |
| Budget Monitor | Realisasi anggaran | Keuangan | |
| Budget Transfer | Transfer anggaran | Keuangan | |
| Budget | Anggaran | Keuangan | |
| Account History | Riwayat akun | Keuangan | |
| Audit Journal | Daftar semua jurnal | Keuangan | Nama mirip "Audit Log" |

### Cash & Bank

| Menu | Arti | Halaman induk |
|---|---|---|
| Other Payment | Pengeluaran lain | Keuangan |
| Other Deposit | Penerimaan lain | Keuangan |
| Bank Transfer | Transfer antar rekening | Keuangan |
| Bank Statement | Rekening koran | Keuangan |
| Bank History | Riwayat kas & bank | Keuangan |
| Bank Reconcile | Rekonsiliasi bank | Keuangan |

### Sales

| Menu | Arti | Halaman induk | Catatan |
|---|---|---|---|
| Sales Quotation | Penawaran penjualan | Penawaran | |
| Sales Order | Pesanan penjualan | Penjualan | |
| Delivery Order | Surat jalan | Logistik | Halaman juga memuat Armada & Ekspedisi |
| Sales Down Payment | Uang muka penjualan | Penjualan | |
| Sales Invoice | Faktur penjualan | Faktur | |
| Sales Receipt | Penerimaan pembayaran | Faktur | |
| Sales Return | Retur penjualan | Retur | |
| Customer Category | Kategori pelanggan | Data Master | |
| Sales Category | Kategori penjualan | Pengaturan | |
| Customer | Pelanggan | Data Master | Sub-menu melompat ke "Company" (T-18) |

### Purchases

| Menu | Arti | Halaman induk | Catatan |
|---|---|---|---|
| Purchase Quotation | Penawaran pembelian | Penawaran | Sub-menu melompat ke "Sales" (T-18) |
| Purchase Order | Pesanan pembelian | Pembelian | |
| Receive Item | Penerimaan barang | Pembelian | |
| Purchase Down Payment | Uang muka pembelian | Pembelian | |
| Purchase Invoice | Faktur pembelian | Faktur | Melompat ke "Sales" |
| Purchase Payment | Pembayaran ke supplier | Faktur | Melompat ke "Sales" |
| Purchase Return | Retur pembelian | Retur | Melompat ke "Sales" |
| Supplier Price | Harga supplier | Pembelian | |
| Supplier Category | Kategori supplier | Data Master | |
| Supplier | Supplier | Data Master | Melompat ke "Company" |

### Inventory

| Menu | Arti | Halaman induk |
|---|---|---|
| Item Requisition | Permintaan barang | Persediaan |
| Item Transfer | Transfer antar gudang | Gudang |
| Item Adjustment | Penyesuaian stok | Penyesuaian |
| Job Costing | Biaya pekerjaan | Persediaan |
| Item | Barang & stok | Persediaan |
| Warehouse | Gudang & stok per gudang | Gudang |
| Item Unit / Item Category / Item Brand | Satuan / kategori / merek barang | Persediaan |
| Import dari Excel | Impor data | Import Excel |

### Fixed Assets

Fixed Asset (daftar aset), Fixed Asset Category, Fiscal FA Category (golongan fiskal), Fixed Asset Edited (riwayat perubahan), FA Disposition (pelepasan), Asset Transfer (mutasi), Asset per Location — semuanya di halaman Aset Tetap.

### Reports

Report List (daftar laporan), Laba Rugi (P/L), Neraca (Balance Sheet), Arus Kas (Cash Flow).

### Fitur yang ada di kode tetapi tidak punya pintu masuk di menu

| Fitur | Keadaan | Keputusan di struktur baru |
|---|---|---|
| Target Penjualan | Berjalan | Ditampilkan di menu Penjualan |
| Transaksi Favorit | Daftar template | Ditampilkan di Pengaturan |
| Ekspor e-Faktur (CTAS) | Ekspor CSV + nomor e-Faktur | Ditampilkan di Akuntansi |
| e-Faktur format lama | Ekspor CSV format lama | Tetap di kode, dibuka dari halaman e-Faktur bila diperlukan |
| Rekap / SPT PPN | Angka dari dokumen yang diposting (T-11 diperbaiki) | Ditampilkan di Laporan sebagai **Rekap PPN** |
| Halaman Keuangan (umur piutang/hutang, kunci periode, cek buku besar, log audit) | Tidak punya item menu langsung | Ditampilkan sebagai **Ringkasan Keuangan** |
| Halaman Pengaturan (pengguna, backup, reset data, kategori) | Tidak punya item menu langsung | Ditampilkan sebagai **Pengaturan Umum** |
| Mata Uang | Pengaturan kurs, transaksi hanya Rupiah | **Tidak ditampilkan** agar tidak memberi kesan sistem mendukung valas — **REQUIRES USER CONFIRMATION** |
| Kirim Faktur Pajak via Email | Hanya mencatat; email tidak benar-benar terkirim | **Tidak ditampilkan** — perlu server email |
| SmartLink e-Banking | Formulir konfigurasi tanpa koneksi bank | **Tidak ditampilkan** — belum ada integrasi |
| Analisis Bisnis | Aturan sederhana, bukan AI; angka dari buku besar, faktur, dan saldo faktur (T-29) | **Tidak ditampilkan** di menu; tetap bisa dibuka lewat rute di kode — **REQUIRES USER CONFIRMATION** apakah perlu ditampilkan |

---

## 3. Masalah struktur menu

| Masalah | Contoh | Akibat |
|---|---|---|
| Bahasa campur | "Receive Item", "Other Deposit", "FA Disposition" berdampingan dengan "Profil Perusahaan" | Admin awam tidak paham |
| Grup tidak sesuai isi | "Company" berisi pajak, karyawan, recycle bin, import | Sulit menebak letak menu |
| Menu ganda | Laporan Keuangan (General Ledger & Reports), Import dari Excel (Company & Inventory), Customer/Supplier (Sales/Purchases & Data Master) | Posisi aktif melompat antar grup |
| Halaman induk tidak sesuai menu | 15 fitur tampil di halaman "Keuangan" | Judul tab/halaman salah |
| Ikon tanpa label | Sidebar 64 px | Harus menghafal ikon |
| Urutan tidak mengikuti alur kerja | General Ledger & Cash & Bank di atas Sales/Purchases | Menu harian berada di bawah |

---

## 4. Struktur navigasi baru

Prinsip: urutan mengikuti pekerjaan harian, bahasa Indonesia, satu tempat untuk setiap fitur, sidebar berlabel yang bisa diciutkan. Kolom "Sebelumnya" memastikan setiap menu lama tetap punya tempat.

| Grup | Menu baru | Sebelumnya |
|---|---|---|
| **Ringkasan** | Ringkasan | Dashboard |
| **Penjualan** | Penawaran Penjualan | Sales Quotation |
| | Pesanan Penjualan (SO) | Sales Order |
| | Surat Jalan | Delivery Order |
| | Faktur Penjualan | Sales Invoice |
| | Penerimaan Pembayaran | Sales Receipt |
| | Uang Muka Penjualan | Sales Down Payment |
| | Retur Penjualan | Sales Return |
| | Target Penjualan | *(tidak ada di menu)* |
| | Pelanggan | Customer |
| **Pembelian** | Penawaran Pembelian | Purchase Quotation |
| | Pesanan Pembelian (PO) | Purchase Order |
| | Penerimaan Barang | Receive Item |
| | Faktur Pembelian | Purchase Invoice |
| | Pembayaran ke Supplier | Purchase Payment |
| | Uang Muka Pembelian | Purchase Down Payment |
| | Retur Pembelian | Purchase Return |
| | Harga Supplier | Supplier Price |
| | Supplier | Supplier |
| **Persediaan** | Barang & Stok | Item |
| | Gudang | Warehouse |
| | Transfer Antar Gudang | Item Transfer |
| | Penyesuaian Stok | Item Adjustment |
| | Permintaan Barang | Item Requisition |
| | Job Costing | Job Costing |
| **Kas & Bank** | Pengeluaran Lain | Other Payment |
| | Penerimaan Lain | Other Deposit |
| | Transfer Antar Rekening | Bank Transfer |
| | Rekening Koran | Bank Statement |
| | Riwayat Kas & Bank | Bank History |
| | Rekonsiliasi Bank | Bank Reconcile |
| **Akuntansi** | Ringkasan Keuangan | *(halaman Keuangan tanpa menu)* |
| | Neraca Saldo | Trial Balance |
| | Jurnal | *(tab di Buku Besar)* |
| | Bagan Akun | Chart of Accounts |
| | Jurnal Umum | Journal Voucher |
| | Riwayat Akun | Account History |
| | Audit Jurnal | Audit Journal |
| | Biaya Akrual | Expense Accrual |
| | Penggajian | Employee Payroll |
| | Anggaran | Budget |
| | Realisasi Anggaran | Budget Monitor |
| | Transfer Anggaran | Budget Transfer |
| | Pajak & PPN | Tax |
| | Ekspor e-Faktur | *(tidak ada di menu)* |
| **Aset Tetap** | Daftar Aset | Fixed Asset |
| | Kategori Aset | Fixed Asset Category |
| | Golongan Aset Fiskal | Fiscal FA Category |
| | Riwayat Perubahan Aset | Fixed Asset Edited |
| | Mutasi Aset | Asset Transfer |
| | Pelepasan Aset | FA Disposition |
| | Aset per Lokasi | Asset per Location |
| **Laporan** | Daftar Laporan | Report List |
| | Laba Rugi | Laba Rugi (P/L), Laporan Keuangan |
| | Neraca | Neraca (Balance Sheet) |
| | Arus Kas | Arus Kas (Cash Flow) |
| | Rekap PPN | *(hanya dari Daftar Laporan)* |
| **Data Master** | Karyawan | Employee |
| | Kontak | Contact |
| | Kategori Pelanggan | Customer Category |
| | Kategori Supplier | Supplier Category |
| | Kategori Penjualan | Sales Category |
| | Satuan Barang | Item Unit |
| | Kategori Barang | Item Category |
| | Merek Barang | Item Brand |
| **Pengaturan** | Profil Perusahaan | Profil Perusahaan |
| | Pengaturan Umum | *(halaman Pengaturan tanpa menu)* |
| | Termin Pembayaran | Payment Term |
| | Metode Pengiriman | Shipment |
| | Kalender | Calendar |
| | Transaksi Favorit | *(tidak ada di menu)* |
| | Log Aktivitas | Activity Log |
| | Recycle Bin | Recycle Bin |
| | Import dari Excel | Import dari Excel (2 tempat) |

Catatan:
- Menu disembunyikan sesuai hak akses peran seperti sebelumnya.
- **Pajak & PPN** dan **Ekspor e-Faktur** mengikuti hak akses modul Pajak, bukan modul Akuntansi.
- **REQUIRES USER CONFIRMATION:** grup yang tidak dipakai bisnis (mis. Aset Tetap, Anggaran, Job Costing) dapat disembunyikan per peran — **tidak dihapus** — setelah dikonfirmasi.
- Keputusan tentang tab halaman dan tab dokumen: lihat [09-AUDIT-UX.md §2](09-AUDIT-UX.md).
