# UPDATE - Nusantara ERP

Dokumen ini mencatat daftar update/perbaikan yang perlu dikerjakan untuk sistem Nusantara ERP.

**Tanggal:** 22 Oktober 2026

---

## 1. Fitur "Ubah Status" di Menu Aksi

### Deskripsi
Tambahkan menu **"Ubah status"** di action menu (⋮) setiap baris tabel, sehingga user bisa mengubah status dokumen tanpa masuk ke halaman detail.

### Modul yang Perlu Ditambahkan:

#### Penjualan
- [x] Penawaran Penjualan (Draft, Terkirim, Diterima, Ditolak, Kadaluarsa)
- [x] Pesanan Penjualan / SO *(sudah ada - pastikan konsisten)*
- [x] Surat Jalan (Draft, Dalam pengiriman, Terkirim, Dikembalikan) *(sudah ada)*
- [x] Faktur Penjualan (Draft, Diterbitkan, Dibayar sebagian, Lunas, Jatuh tempo)
- [x] Penerimaan Pembayaran (Pending, Diterima, Terekonsiliasi)
- [x] Uang Muka Penjualan (Draft, Diterima, Dialokasikan, Dikembalikan)
- [x] Retur Penjualan (Draft, Disetujui, Selesai, Ditolak)

#### Pembelian
- [x] Penawaran Pembelian (Draft, Terkirim, Diterima, Dibuat PO, Ditolak)
- [x] Pesanan Pembelian / PO (Draft, Terkirim, Dikonfirmasi, Sebagian, Selesai, Dibatalkan)
- [x] Penerimaan Barang (Draft, Diterima, Terekonsiliasi, Sudah difaktur)
- [ ] Validasi SJ Supplier (Pending, Cocok, Bermasalah) *(tool validasi, bukan dokumen)*
- [x] Faktur Pembelian (Draft, Diterima, Dibayar sebagian, Lunas, Jatuh tempo)
- [x] Pembayaran ke Supplier (Pending, Dibayar, Terekonsiliasi)
- [x] Uang Muka Pembelian (Draft, Dibayar, Dialokasikan)
- [x] Retur Pembelian (Draft, Disetujui, Selesai, Ditolak)

#### Persediaan
- [x] Permintaan Barang (Draft, Diajukan, Disetujui, Terpenuhi, Ditolak)
- [x] Transfer Antar Gudang (Draft, Dalam transit, Diterima, Ditolak)
- [x] Penyesuaian Stok (Draft, Disetujui, Diposting)

**Total: 17/18 modul selesai** (SJV tidak memerlukan menu status karena merupakan tool validasi, bukan list dokumen)

**Catatan:** PO Pengambilan, Rekap Pengambilan, Perubahan Timbangan, dan Tagihan Supplier tidak perlu menu "Ubah status" karena statusnya otomatis atau tidak memiliki status yang bisa diubah manual.

---

## 2. Sorting Jurnal Berdasarkan Tanggal Terbaru

### Deskripsi
Halaman Jurnal harus menampilkan jurnal dengan **tanggal terbaru di atas** secara default.

### Status: ✅ SELESAI

### Yang Dikerjakan:
- [x] Default sorting: tanggal descending (terbaru → terlama)
- [x] Berlaku untuk semua jenis jurnal (Umum, Penjualan, Pembelian, Bank, Kas)

---

## 3. Logo Nusantara di Dokumen Cetak

### Deskripsi
Semua dokumen cetak harus memiliki logo Nusantara dan layout yang profesional.

### Status: ✅ SELESAI

### Logo
- File: `/public/logo-nusantara-sq.png` ✅ (sudah ada)

### Dokumen yang Sudah Di-redesign:
- [x] Faktur Penjualan
- [x] Penawaran Penjualan  
- [x] Laporan Keuangan (Laba Rugi, Neraca, Arus Kas)

### Elemen Template:
- Header dengan logo di kiri atas
- Nama perusahaan, alamat, telepon, email, NPWP
- Nomor dokumen dan tanggal prominent
- Tabel item dengan border rapi
- Footer dengan kolom TTD (Dibuat, Diperiksa, Disetujui)
- Info pembayaran (No. Rek, Bank, a/n)

---

## 4. Satuan Barang Tambahan

### Deskripsi
Tambahkan satuan baru untuk mendukung berbagai jenis barang.

### Status: ✅ SELESAI

### Satuan yang Sudah Ditambahkan:
- [x] **Meter Kubik (m³)** - untuk volume
- [x] **Ton** - untuk berat

### Implementasi:
- [ ] Tambahkan di dropdown satuan
- [ ] Support symbol m³ (Unicode U+00B3)
- [ ] Konversi otomatis ton ↔ kg
- [ ] Backward compatible dengan data existing

---

## Checklist Umum

### Testing
- [ ] Test menu "Ubah status" di semua modul yang disebutkan
- [ ] Test sorting jurnal (default + toggle)
- [ ] Test print semua dokumen dengan logo
- [ ] Test satuan m³ dan ton di transaksi
- [ ] Test mobile responsive untuk menu aksi

### Dokumentasi
- [ ] Update user manual
- [ ] Screenshot dokumen cetak baru
- [ ] Dokumentasi API jika ada perubahan

### Backward Compatibility
- [ ] Migration script untuk status field (jika perlu)
- [ ] Data existing tetap bisa dibuka
- [ ] Old print template available sebagai fallback

---

**Status:** Draft - Menunggu Development  
**Dibuat oleh:** Admin
