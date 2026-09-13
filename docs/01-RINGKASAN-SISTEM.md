# 01 — Ringkasan Sistem Nusantara ERP

> **Tujuan dokumen:** menjelaskan apa yang dilakukan aplikasi *saat ini*, dengan bahasa yang bisa dipahami pemilik bisnis maupun staf akunting.
>
> **Dasar penulisan:** review kode aplikasi versi 3.3.0. Semua pernyataan menggambarkan perilaku aplikasi, **bukan** kebutuhan bisnis yang sudah disepakati.
>
> **Tanda di dokumen ini:**
> - **REQUIRES USER CONFIRMATION** — tidak bisa dipastikan dari kode; wajib ditanyakan ke pemilik bisnis.
> - ✅ Terbukti di aplikasi · 🟡 Dugaan dari implementasi · ❓ Belum diketahui

---

## 1. Nusantara ERP dalam satu paragraf

Nusantara ERP adalah aplikasi web (bisa dipasang seperti aplikasi/PWA) untuk mencatat **penjualan, pembelian, persediaan, kas & bank, dan pembukuan** dalam satu tempat. Setiap dokumen transaksi — misalnya Sales Order, Faktur, atau Penerimaan Barang — otomatis **mengubah stok** (bila relevan) dan **membentuk jurnal akuntansi** (double-entry) di buku besar. Dari jurnal tersebut sistem menyusun Laba Rugi, Neraca, dan Arus Kas. Data disimpan di perangkat pengguna (IndexedDB) dan dapat disinkronkan ke cloud (Firebase) bila dikonfigurasi.

---

## 2. Model produk — bagaimana data mengalir

Cara paling mudah memahami sistem ini adalah sebagai lima lapis:

```mermaid
flowchart LR
  A["1. DATA MASTER<br/>Pelanggan · Supplier · Barang<br/>Gudang · Akun (COA) · Karyawan"]
  B["2. TRANSAKSI (dokumen)<br/>Penawaran · Order · Surat Jalan<br/>Faktur · Pembayaran · Retur<br/>Penyesuaian · Transfer · Jurnal"]
  C["3. CATATAN OPERASIONAL<br/>Status dokumen · Reservasi stok<br/>Log pembayaran · Jejak dokumen"]
  D["4. EFEK OTOMATIS<br/>Stok per gudang · HPP rata-rata<br/>Jurnal buku besar · Piutang/Hutang"]
  E["5. LAPORAN<br/>Dashboard · Laba Rugi · Neraca<br/>Arus Kas · Kartu Stok · Umur Piutang"]
  A --> B --> C --> D --> E
```

| Lapis | Isi | Contoh di aplikasi | Siapa yang mengisi |
|---|---|---|---|
| **1. Data master** | Data acuan yang jarang berubah | Pelanggan, Supplier, Barang, Gudang, Bagan Akun, Karyawan | Admin / staf |
| **2. Transaksi** | Dokumen yang mencatat kejadian bisnis | Sales Order, Purchase Order, Faktur, Penerimaan Pembayaran | Staf penjualan, pembelian, gudang, akunting |
| **3. Catatan operasional** | Status dan hubungan antar dokumen | Status "Dikonfirmasi", reservasi stok, log pembayaran, "Jejak Dokumen" | Otomatis dari transaksi |
| **4. Efek otomatis** | Dampak ke stok dan akuntansi | Stok berkurang saat SO "Terkirim", jurnal Piutang vs Penjualan | **Sistem** (bukan diketik manual) |
| **5. Laporan** | Ringkasan untuk pengambilan keputusan | Laba Rugi, Neraca, Kartu Stok, Umur Piutang | Dibaca pemilik / manajer / akunting |

**Prinsip penting:** pengguna bekerja di lapis 1–2 (mengisi data dan dokumen). Lapis 3–5 dihasilkan sistem. Jurnal akuntansi **tidak perlu diketik** untuk transaksi rutin — hanya untuk koreksi atau kejadian khusus (Jurnal Umum).

Penjelasan rinci tiap alur ada di [03-ALUR-TRANSAKSI.md](03-ALUR-TRANSAKSI.md); dampak akuntansinya di [04-AKUNTANSI.md](04-AKUNTANSI.md).

---

## 3. Area fungsi yang tersedia saat ini

Status kematangan: **Lengkap** = alur utama berjalan end-to-end · **Parsial** = berjalan tetapi ada celah/perilaku yang perlu diperbaiki atau dikonfirmasi · **Pencatatan saja** = menyimpan data tanpa efek ke stok/akuntansi · **Placeholder** = tampilan/konfigurasi tanpa proses nyata.

| Area | Yang bisa dilakukan | Efek stok | Efek akuntansi | Kematangan |
|---|---|---|---|---|
| **Ringkasan (Dashboard)** | Widget penjualan, pembelian, laba rugi, jatuh tempo, aktivitas | — | — | Parsial (lihat [08](08-TEMUAN-TEKNIS.md)) |
| **Penawaran Harga** (jual & beli) | Buat, kirim, terima/tolak, konversi ke SO/PO | Tidak | Tidak | Parsial |
| **Sales Order (SO)** | Buat, ubah, hapus, ubah status (satuan/massal), cetak, duplikat, log pembayaran | Reservasi saat *Dikonfirmasi*; stok keluar saat *Terkirim* | Ya, saat *Terkirim* | Lengkap |
| **Surat Jalan (Delivery Order)** | Buat dari SO/PO/manual, pengiriman sebagian, cetak, pecah per truk (Excel) | **Tidak** | Tidak | Lengkap (sebagai dokumen) |
| **Faktur Penjualan (SI)** | Buat dari SO terkirim, cetak | Tidak | Ya (piutang & pendapatan) | Parsial |
| **Penerimaan Pembayaran (SR)** | Catat pembayaran atas faktur | Tidak | Ya (kas/bank vs piutang) | Parsial |
| **Uang Muka Penjualan** | Catat DP, terapkan ke SO | Tidak | Ya | Parsial |
| **Retur Penjualan** | Buat dari SO/Faktur, posting | Stok kembali | Ya (balik pendapatan & HPP) | Parsial |
| **Target Penjualan** | Target per periode vs realisasi | — | — | Pencatatan saja |
| **Purchase Order (PO)** | Buat, ubah, hapus, cetak, duplikat, log pembayaran | Stok masuk saat *Diterima* | Ya, saat *Diterima* | Lengkap |
| **Penerimaan Barang** | Catat barang masuk dari PO | Ya (terpisah dari status PO) | **Tidak** | Parsial |
| **Faktur Pembelian (PI)** | Buat dari PO diterima | Tidak | Ya (persediaan & hutang) | Parsial |
| **Pembayaran ke Supplier (PP)** | Catat pembayaran atas faktur pembelian | Tidak | Ya (hutang vs kas/bank) | Parsial |
| **Uang Muka Pembelian** | Catat DP, terapkan ke PO | Tidak | Ya | Parsial |
| **Retur Pembelian** | Buat dari PO/Faktur, posting | Stok berkurang | Ya | Parsial |
| **Harga Supplier** | Daftar harga per supplier per barang (dipakai otomatis di PO) | — | — | Pencatatan saja |
| **Barang & Stok** | Daftar barang, stok minimum, kartu stok, harga beli/jual | Ya (edit stok manual) | Tidak langsung | Lengkap (dasar) |
| **Gudang & Transfer** | Multi-gudang, stok per gudang, transfer antar gudang | Ya (antar gudang) | Tidak (nilai tetap) | Lengkap (dasar) |
| **Penyesuaian Stok** | Tambah/kurang stok (opname, rusak) | Ya | Ya (selisih persediaan) | Lengkap (dasar) |
| **Permintaan Barang, Job Costing** | Pencatatan permintaan & biaya pekerjaan | — | — | Pencatatan saja |
| **Kas & Bank** | Pengeluaran lain, penerimaan lain, transfer rekening, rekening koran, rekonsiliasi | — | Lihat [04](04-AKUNTANSI.md) §6 | Parsial |
| **Buku Besar** | Neraca saldo, daftar jurnal, bagan akun (baca saja), Jurnal Umum | — | Ya | Lengkap (dasar) |
| **Anggaran** | Anggaran per akun, realisasi vs anggaran, transfer anggaran | — | Membaca jurnal | Lengkap (dasar) |
| **Biaya Akrual** | Catat biaya belum dibayar → posting jurnal | — | Ya (Jurnal Umum) | Lengkap (dasar) |
| **Penggajian** | Data karyawan, proses gaji, bayar gaji | — | Ya | Parsial (tanpa potongan PPh 21/BPJS) |
| **Aset Tetap** | Daftar aset, kategori, mutasi, disposisi | — | **Tidak** (tanpa penyusutan) | Pencatatan saja |
| **Pajak** | Pengaturan PPN/PKP/NPWP, rekap PPN, menu e-Faktur | — | PPN ikut jurnal SO/PO | Parsial |
| **Laporan** | Laba Rugi, Neraca, Arus Kas, Umur Piutang/Hutang, Kartu Stok, Kartu Piutang/Hutang, Rekap PPN, analisis | — | Membaca jurnal | Parsial |
| **Pengaturan** | Profil perusahaan, pengguna & peran, 2FA, backup, import Excel, notifikasi, kategori, satuan | — | — | Lengkap |
| **Integrasi (API)** | API baca-saja untuk sistem lain | — | — | Siap kode; butuh deploy Firebase Functions |

Daftar lengkap setiap menu dan layarnya ada di [02-PETA-MODUL-DAN-NAVIGASI.md](02-PETA-MODUL-DAN-NAVIGASI.md).

---

## 4. Pengguna dan hak akses (peran)

Sistem memiliki peran bawaan (RBAC). Pembatasan diterapkan di tampilan (menu/tombol disembunyikan) dan di lapisan simpan data; pada mode cloud juga di aturan keamanan server (`firestore.rules`).

| Peran | Label di aplikasi | Bisa melihat | Bisa menambah/mengubah | Bisa menghapus |
|---|---|---|---|---|
| `admin` | Admin / Owner | Semua | Semua, termasuk pengguna & pengaturan | Ya |
| `manajer` | Manajer | Semua kecuali administrasi pengguna | Penjualan, pembelian, persediaan, master, aset, buku besar (tanpa hapus) | Ya (kecuali buku besar) |
| `akunting` | Akunting | Semua modul (baca) | Buku besar & pajak | Buku besar & pajak |
| `penjualan` | Penjualan | Penjualan, pembelian (baca), persediaan (baca), master | Penjualan & data pelanggan | Tidak |
| `viewer` | Viewer (hanya lihat) | Semua kecuali administrasi | Tidak | Tidak |
| `pending` | Menunggu persetujuan | Dashboard saja | Tidak | Tidak |

Fitur keamanan yang tersedia: login username + password (hash PBKDF2), verifikasi 2 langkah (TOTP), batas percobaan login (mode cloud), log aktivitas login, log audit perubahan data, kunci periode akuntansi, recycle bin.

- ✅ Pada mode lokal, aplikasi menyiapkan akun contoh: `admin`, `firna`, `richard`, `lisa` (semua berperan **admin**, ditandai wajib ganti password).
- ❓ Siapa saja pengguna nyata, perannya, dan apa yang boleh mereka lakukan — **REQUIRES USER CONFIRMATION**.
- ❓ Satu alamat email "admin utama" (bootstrap admin) tertanam di `firestore.rules` dan `src/core/user-role.js`. Perlu dipastikan email pemilik akun cloud yang benar — **REQUIRES USER CONFIRMATION**.

---

## 5. Penyimpanan data dan mode operasi

| Mode | Kapan aktif | Data disimpan di | Login | Catatan |
|---|---|---|---|---|
| **Lokal (offline)** | Tidak ada konfigurasi Firebase (`npm run dev:local`) | IndexedDB di browser/perangkat tersebut | Akun lokal di browser | Data **tidak** otomatis berpindah ke perangkat lain. Backup lewat file JSON. |
| **Cloud (Firebase)** | File `.env` berisi kredensial Firebase | Firestore (sinkron real-time) + cache lokal | Username via Cloud Function | Backup otomatis harian di server, log akses server. Beberapa koleksi belum ikut sinkron — lihat [08](08-TEMUAN-TEKNIS.md). |

- ❓ Apakah bisnis akan memakai satu komputer, beberapa komputer, atau HP? Apakah perlu akses dari luar kantor? — **REQUIRES USER CONFIRMATION** (menentukan mode lokal vs cloud).
- ❓ Apakah sudah ada data nyata yang tersimpan di project Firebase? — **REQUIRES USER CONFIRMATION**.

---

## 6. Hal yang **tidak** ada di sistem saat ini

Ini bukan kekurangan yang pasti harus ditambah — hanya batas cakupan saat ini, untuk dikonfirmasi relevansinya.

| Tidak tersedia | Keterangan |
|---|---|
| Produksi / manufaktur (BOM, work order) | Ada "Job Costing" sederhana, bukan modul produksi |
| Multi perusahaan / multi cabang akuntansi | Satu buku besar untuk satu perusahaan (multi-gudang tersedia) |
| Penyusutan aset otomatis | Aset hanya didaftar; tidak ada jurnal perolehan/penyusutan |
| e-Faktur resmi / integrasi DJP | Ada menu e-Faktur, tetapi bukan integrasi resmi |
| Potongan gaji (PPh 21, BPJS) | Penggajian hanya gaji pokok + tunjangan |
| Penutupan buku (closing entry) | Ada kunci periode; laba tahun berjalan tidak ditutup ke laba ditahan |
| Lot/batch, nomor seri, tanggal kedaluwarsa | Stok dicatat per barang per gudang |
| Satuan ganda / konversi satuan per barang | Satu satuan per barang |
| Portal pelanggan, e-commerce, CRM | — |
| Integrasi bank otomatis | Menu "SmartLink e-Banking" hanya tampilan konfigurasi |

---

## 7. Dugaan jenis usaha berdasarkan bukti di aplikasi

Aplikasi tidak menyimpan deskripsi bisnis. Namun ada petunjuk di data contoh dan template:

| Bukti | Lokasi | Interpretasi (🟡 dugaan) |
|---|---|---|
| Data barang contoh: agregat, batu split, abu batu, pasir, dalam satuan Ton/M3 | `src/core/db.js` (data demo) | Perdagangan material (curah) |
| Kategori barang bawaan: Granit, Marmer, Andesit, Travertine, Koral, Candi, Paras, Batu Alam | `public/classic/core/erp-crud.js` | Pernah diarahkan ke batu alam |
| Surat Jalan memiliki baris P/L/T dan fitur "Bagi per Truck" berdasarkan kapasitas | `erp-crud.js` (template Surat Jalan) | Pengiriman dengan truk, muatan besar |
| Pelanggan contoh berbentuk PT/CV/UD/Toko, faktur bertempo 30 hari, PPN 11% | `db.js` | Penjualan B2B dengan termin |
| Barang jasa "ongkir", "jasa pengiriman", "ritase" | `db.js` | Ongkos kirim ditagihkan ke pelanggan |

➡ Jenis produk, cara pengiriman, dan pelanggan yang sebenarnya — **REQUIRES USER CONFIRMATION**. Data contoh bukan data riil perusahaan.

---

## 8. Ringkasan satu kalimat untuk meeting

> *"Sistem ini sudah punya alur dagang lengkap — dari penawaran sampai pembayaran — dengan pembukuan otomatis di belakangnya. Yang perlu kita pastikan bersama adalah langkah mana yang benar-benar dipakai bisnis sehari-hari, dan bagaimana laporan yang dibutuhkan pemilik."*
