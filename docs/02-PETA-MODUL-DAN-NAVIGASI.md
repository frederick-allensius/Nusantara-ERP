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

Struktur yang berlaku sekarang ada di §4: **12 grup** dan **83 item menu** di sidebar berlabel yang bisa diciutkan (Ringkasan dan Entri Harian langsung membuka halaman), ditambah tab dokumen di dalam modul.

---

## 2. Menu saat review → layar yang dibuka

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
| Ekspor e-Faktur (CTAS) | Ekspor CSV + nomor e-Faktur | Ditampilkan di Akuntansi sebagai **Ekspor Coretax**: file XML faktur pajak keluaran per masa pajak untuk diimpor di Coretax, plus pencatatan nomor faktur pajak |
| e-Faktur format lama | Ekspor CSV format lama | Tombol **CSV format lama** di halaman Ekspor Coretax |
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

Prinsip: urutan mengikuti pekerjaan harian, bahasa Indonesia, satu tempat untuk setiap fitur, sidebar berlabel yang bisa diciutkan. Kolom "Sebelumnya" memastikan setiap menu lama tetap punya tempat; *(baru)* menandai menu yang tidak ada saat review.

| Grup | Menu baru | Sebelumnya |
|---|---|---|
| **Ringkasan** | Ringkasan | Dashboard |
| **Entri Harian** | Entri Harian | *(baru)* |
| **Pengambilan** | PO Pengambilan | *(baru)* |
| | Kotak Masuk Rekap (simulasi) | *(baru)* |
| | Perubahan Timbangan | *(baru)* |
| | Rekap Pengambilan | *(baru)* |
| | Tagih Pelanggan | *(baru)* |
| | Tagihan Supplier | *(baru)* |
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
| | Penerimaan Barang | Receive Item; termasuk Rekonsiliasi Timbangan |
| | Validasi SJ Supplier | *(baru)* |
| | Faktur Pembelian | Purchase Invoice |
| | Pembayaran ke Supplier | Purchase Payment |
| | Uang Muka Pembelian | Purchase Down Payment |
| | Retur Pembelian | Purchase Return |
| | Harga Supplier | Supplier Price |
| | Supplier | Supplier |
| **Persediaan** | Barang & Stok | Item |
| | Gudang | Warehouse; Item Transfer (tab Transfer Barang) |
| | Penyesuaian Stok | Item Adjustment |
| | Permintaan Barang | Item Requisition |
| | Job Costing | Job Costing |
| **Kas & Bank** | Pengeluaran Lain | Other Payment |
| | Penerimaan Lain | Other Deposit |
| | Transfer Antar Rekening | Bank Transfer |
| | Riwayat Kas & Bank | Bank History |
| | Rekonsiliasi Bank | Bank Reconcile; Bank Statement (Rekening Koran) |
| **Akuntansi** | Ringkasan Keuangan | *(halaman Keuangan tanpa menu)* |
| | Neraca Saldo | Trial Balance |
| | Jurnal | *(tab di Buku Besar)*; Journal Voucher (filter Jurnal Umum); Audit Journal (filter tanggal, akun, cari) |
| | Bagan Akun | Chart of Accounts |
| | Riwayat Akun | Account History |
| | Biaya Akrual | Expense Accrual |
| | Penggajian | Employee Payroll |
| | Anggaran | Budget; Budget Monitor (kolom realisasi); Budget Transfer |
| | Pajak & PPN | Tax; Rekap PPN (per masa pajak) |
| | Ekspor Coretax | *(tidak ada di menu: Ekspor e-Faktur CTAS)* |
| **Aset Tetap** | Daftar Aset | Fixed Asset |
| | Kategori Aset | Fixed Asset Category |
| | Golongan Aset Fiskal | Fiscal FA Category |
| | Riwayat Perubahan Aset | Fixed Asset Edited |
| | Mutasi Aset | Asset Transfer |
| | Pelepasan Aset | FA Disposition |
| | Aset per Lokasi | Asset per Location |
| **Laporan** | Laporan per Periode | *(baru)* |
| | Laba Rugi | Laba Rugi (P/L), Laporan Keuangan |
| | Neraca | Neraca (Balance Sheet) |
| | Arus Kas | Arus Kas (Cash Flow) |
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
- Menu disembunyikan sesuai hak akses peran seperti sebelumnya, dan dapat dipersempit per pengguna lewat **Akses menu** di Manajemen Pengguna ([01 §4](01-RINGKASAN-SISTEM.md)).
- **Entri Harian** dan grup **Pengambilan** mengikuti hak modul Pembelian; **Tagih Pelanggan** mengikuti hak Penjualan.
- **Pajak & PPN** dan **Ekspor Coretax** mengikuti hak akses modul Pajak, bukan modul Akuntansi.
- Menu **Surat Jalan** hanya menampilkan surat jalan pengiriman dari stok. Surat jalan pengambilan (dari PO pengambilan) ada di Pengambilan → PO Pengambilan; menu Surat Jalan menampilkan tautan ke sana dan menolak ubah/hapus surat jalan pengambilan.
- **REQUIRES USER CONFIRMATION:** grup yang tidak dipakai bisnis (mis. Aset Tetap, Anggaran, Job Costing) dapat disembunyikan per peran — **tidak dihapus** — setelah dikonfirmasi.
- Keputusan tentang tab halaman dan tab dokumen: lihat [09-AUDIT-UX.md §2](09-AUDIT-UX.md).
- **Pengambilan**, **Penjualan**, dan **Pembelian** dibagi menjadi **Alur** (langkah berurutan pada satu garis, dengan angka dokumen yang menunggu di langkah itu — angka yang sama dengan Perlu tindakan di Ringkasan), **Lainnya**, dan **Data**. Alur Pembelian: Penawaran → Pesanan → Penerimaan Barang → Faktur → Pembayaran; Validasi SJ Supplier ada di Lainnya.
- Satu cara ke setiap halaman: halaman tidak lagi punya tab yang mengulang entri menu (mis. Laba Rugi / Neraca / Arus Kas, Faktur / Penerimaan Pembayaran). Judul halaman selalu sama dengan entri menu yang dibuka.

### Halaman tanpa entri menu sendiri

Nama-nama ini tetap dikenali aplikasi (dari tombol, Entri Harian, notifikasi, dan Daftar Laporan), tetapi tidak lagi tampil di sidebar karena isinya sudah ada di halaman lain. Saat dibuka, sidebar menyorot halaman tempatnya berada.

| Nama | Dibuka dari / sekarang ada di | Alasan |
|---|---|---|
| Catat Pengambilan | Tombol **Catat Pengambilan** di PO Pengambilan, baris surat jalan di detail PO, kartu di Entri Harian | Langkah input per truk, bukan halaman tersendiri |
| Impor Rekap Timbangan | Tombol di PO Pengambilan dan Perubahan Timbangan, **Impor manual** di Kotak Masuk Rekap, kartu di Entri Harian | Langkah dari PO Pengambilan |
| Transfer Antar Gudang | Gudang → tab **Transfer Barang** | Halaman yang sama |
| Jurnal Umum | Jurnal → filter **Jurnal Umum**; tombol **Buat Jurnal Umum** | Halaman yang sama dengan filter |
| Audit Jurnal | Jurnal → filter Dari / Sampai / Akun / Cari | Daftar jurnal yang sama |
| Rekening Koran | Rekonsiliasi Bank → **Input Rekening Koran** dan daftar **Rekening koran tersimpan** | Rekonsiliasi membutuhkan rekening koran |
| Realisasi Anggaran | Anggaran → kolom Realisasi, Selisih, Pencapaian dan filter periode | Daftar anggaran yang sama |
| Transfer Anggaran | Anggaran → tombol **Transfer Anggaran** dan **Riwayat transfer anggaran** | Aksi pada anggaran |
| Rekonsiliasi Timbangan | Penerimaan Barang → kolom Rekonsiliasi dan Faktur, tombol **Rekonsiliasi** / **Buat Faktur** | Daftar penerimaan yang sama |
| Rekap PPN | Pajak & PPN → pilih masa pajak, **Ekspor CSV** | PPN dilaporkan per masa pajak |
| Daftar Laporan | Semua isinya punya entri menu sendiri (Laba Rugi, Neraca, Arus Kas, Pajak & PPN, Jurnal, Riwayat Akun, daftar SO/PO/faktur/barang) | Hanya berisi tautan |

> **REQUIRES USER CONFIRMATION:** Rekap PPN kini ikut hak akses modul Pajak (sebelumnya modul Laporan). Peran yang punya Laporan tetapi tidak punya Pajak — bawaannya peran penjualan — tidak lagi melihat angka PPN per masa.

### Isi menu yang tidak ada saat review

| Menu | Isi layar | Hak akses |
|---|---|---|
| Entri Harian | Kartu tugas harian: **Catat Pengambilan**, **Impor Rekap Timbangan**, **Tagih Pelanggan**, **Biaya Operasional** (membuka Pengeluaran Lain), dan pintasan **Buat PO**. Angka hari ini: pengambilan hari ini, perubahan timbangan, belum ditagih, biaya hari ini. Kartu yang modulnya tidak boleh dibuka pengguna tidak tampil | Pembelian |
| PO Pengambilan | PO berjalan dan selesai (diambil vs kuota, surat jalan terpakai/siap, batas pengambilan, status); daftar **PO siap dibuka** (PO supplier Dikonfirmasi berisi satu barang) dengan tombol **Buka untuk pengambilan**; ekspor Excel untuk timbangan per supplier. Detail PO: surat jalan per truk, Catat Pengambilan, **Koreksi berat**, Ekspor Excel untuk timbangan, Cetak SJ, batalkan surat jalan yang belum dipakai, **Tutup PO** / **Buka kembali**. Setiap kali daftar dibuka, PO yang lewat batas pengambilan ditutup otomatis | Pembelian |
| Catat Pengambilan (tombol di PO Pengambilan) | Form satu truk, nyaman dipakai di HP: PO, surat jalan, tanggal ambil, No. Polisi, sopir, bruto/tara/netto, tujuan, No. DO / tiket timbang, foto DO (opsional, diperkecil otomatis), catatan | Pembelian |
| Kotak Masuk Rekap | **Simulasi** email rekap dari supplier: rekap Excel dan foto DO dibaca, dicocokkan per surat jalan dengan yang tercatat; yang cocok dicatat sekali klik, yang beda menunggu keputusan; balasan ke supplier. Kotak masuk disimpan di browser saja — lihat [13](13-SIMULASI-EMAIL-DAN-CV.md) | Pembelian |
| Impor Rekap Timbangan (tombol di PO Pengambilan, **Impor manual** di Kotak Masuk Rekap) | Unggah rekap Excel/CSV dari timbangan supplier; hasil dikelompokkan menjadi baru dicatat, sama, berubah, tidak cocok/bermasalah; tombol **Terapkan** | Pembelian |
| Perubahan Timbangan | Berat yang berubah setelah ditagih (ditindaklanjuti dengan **Tandai selesai** + catatan) dan riwayat semua perubahan berat | Pembelian |
| Rekap Pengambilan | Semua truk yang sudah mengambil, disaring per periode, pelanggan, supplier, PO; total netto, belum ditagih ke pelanggan, belum ada faktur supplier; ekspor Excel | Pembelian |
| Tagih Pelanggan | Pelanggan dengan pengambilan belum ditagih → pilih periode dan truk → satu Faktur Penjualan; cetak dan ekspor rekap Excel untuk pelanggan | Penjualan |
| Tagihan Supplier | Catat faktur dari supplier (No. faktur supplier, tanggal, periode, tonase dan harga yang ditagih), cocokkan dengan pengambilan, lalu simpan sebagai Faktur Pembelian | Pembelian |
| Rekonsiliasi Timbangan (di Penerimaan Barang) | Per penerimaan barang: bandingkan qty pesanan, surat jalan, dan timbangan; tetapkan qty dasar faktur; **Buat Faktur** per penerimaan | Pembelian |
| Validasi SJ Supplier | Cocokkan rekap supplier (Excel) dengan penerimaan yang sudah direkonsiliasi sebelum faktur dibuat — lihat [SJ_VALIDATION_DEMO.md](SJ_VALIDATION_DEMO.md) | Pembelian |
| Ekspor Coretax | File XML faktur pajak keluaran per masa pajak untuk diimpor di Coretax, CSV format lama, pencatatan nomor faktur pajak, kode barang & satuan Coretax | Pajak |
| Laporan per Periode | Saring PO, SO, dan pengambilan per tanggal, bulan, pelanggan, supplier, atau nomor dokumen; pengambilan punya total netto sendiri | Laporan |

### Menu pengguna

Dibuka dari nama pengguna di bar atas: Profil & Perusahaan, Manajemen Pengguna (bila berhak mengelola pengguna), Ganti Password, Verifikasi 2 Langkah, **Kelola Backup** (termasuk **Arsip Excel** per tahun), Instal Aplikasi, Bahasa, **Ukuran teks** (Normal / Besar / Sangat besar; bawaan Normal; disimpan per perangkat), dan Keluar.

### Pengaturan Umum

Hanya berisi hal yang tidak punya tempat lain: Kelola Backup, Notifikasi Sistem, Manajemen Pengguna, Pengaturan Pajak, **Nomor Dokumen** (format nomor PO perusahaan, mis. `PO-{###}/BS/TMA/S/{BULAN-ROMAWI}/{TAHUN}`, urut per tahun; kosong = format bawaan PO.TTTT.BB.NNNNN), Ekspor/Impor Backup JSON, Sinkronisasi ke Firebase, dan Reset Data. Profil Perusahaan ada di menu Pengaturan dan menu pengguna; Ganti Password dan Instal Aplikasi di menu pengguna; Kategori Barang dan Satuan Barang di Data Master; Bagan Akun di Akuntansi.

### Data karyawan

Satu formulir karyawan dipakai di Data Master → Karyawan dan di Penggajian: profil (jabatan, departemen, status, telepon, tanggal bergabung), email dan **Departemen akses** (departemen di Manajemen Pengguna yang memberi peran pada akun login dengan email sama), serta gaji pokok dan tunjangan transport/makan.

### Notifikasi (ikon lonceng)

Diperiksa berkala dan bisa diteruskan ke notifikasi perangkat: piutang/hutang lewat jatuh tempo, hutang jatuh tempo 7 hari ke depan, stok menipis, anggaran terlampaui, **perubahan timbangan belum ditindaklanjuti**, **PO pengambilan di batas cut-off** (lewat batas tetapi masih terbuka, atau batas dalam 3 hari), dan **pengambilan belum ditagih lebih dari 7 hari**. Notifikasi pengambilan membuka menu terkait dan hanya tampil bila pengguna boleh membuka modulnya (Pembelian untuk timbangan dan cut-off, Penjualan untuk belum ditagih).
