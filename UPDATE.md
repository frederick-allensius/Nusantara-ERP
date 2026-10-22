# UPDATE - Nusantara ERP

Dokumen ini mencatat daftar update/perbaikan yang perlu dikerjakan untuk sistem Nusantara ERP.

**Tanggal:** 22 Oktober 2026

---

## 1. Fitur "Ubah Status" di Menu Aksi

### Deskripsi
Tambahkan menu **"Ubah status"** di action menu (⋮) setiap baris tabel, sehingga user bisa mengubah status dokumen tanpa masuk ke halaman detail.

### Modul yang Perlu Ditambahkan:

#### Penjualan
- [ ] Penawaran Penjualan (Draft, Terkirim, Diterima, Ditolak, Kadaluarsa)
- [ ] Pesanan Penjualan / SO *(sudah ada - pastikan konsisten)*
- [ ] Surat Jalan (Draft, Dalam pengiriman, Terkirim, Dikembalikan)
- [ ] Faktur Penjualan (Draft, Diterbitkan, Dibayar sebagian, Lunas, Jatuh tempo)
- [ ] Penerimaan Pembayaran (Pending, Diterima, Terekonsiliasi)
- [ ] Uang Muka Penjualan (Draft, Diterima, Dialokasikan, Dikembalikan)
- [ ] Retur Penjualan (Draft, Disetujui, Selesai, Ditolak)

#### Pembelian
- [ ] Penawaran Pembelian (Draft, Terkirim, Diterima, Dibuat PO, Ditolak)
- [ ] Pesanan Pembelian / PO (Draft, Terkirim, Dikonfirmasi, Sebagian, Selesai, Dibatalkan)
- [ ] Penerimaan Barang (Draft, Diterima, Terekonsiliasi, Sudah difaktur)
- [ ] Validasi SJ Supplier (Pending, Cocok, Bermasalah)
- [ ] Faktur Pembelian (Draft, Diterima, Dibayar sebagian, Lunas, Jatuh tempo)
- [ ] Pembayaran ke Supplier (Pending, Dibayar, Terekonsiliasi)
- [ ] Uang Muka Pembelian (Draft, Dibayar, Dialokasikan)
- [ ] Retur Pembelian (Draft, Disetujui, Selesai, Ditolak)

#### Persediaan
- [ ] Permintaan Barang (Draft, Diajukan, Disetujui, Terpenuhi, Ditolak)
- [ ] Transfer Antar Gudang (Draft, Dalam transit, Diterima, Ditolak)
- [ ] Penyesuaian Stok (Draft, Disetujui, Diposting)

**Total: 21 modul**

**Catatan:** PO Pengambilan, Rekap Pengambilan, Perubahan Timbangan, dan Tagihan Supplier tidak perlu menu "Ubah status" karena statusnya otomatis atau tidak memiliki status yang bisa diubah manual.

---

## 2. Sorting Jurnal Berdasarkan Tanggal Terbaru ✅

### Deskripsi
Halaman Jurnal harus menampilkan jurnal dengan **tanggal terbaru di atas** secara default.

### Yang Perlu Dikerjakan:
- [x] Default sorting: tanggal descending (terbaru → terlama) ✅
- [x] Secondary sort by nomor jurnal (descending) ✅
- [ ] Klik header kolom "Tanggal" untuk toggle ascending/descending (future enhancement)
- [ ] Visual indicator (↓↑) pada header kolom (future enhancement)
- [ ] Simpan preference user di localStorage (future enhancement)
- [ ] Berlaku untuk semua jenis jurnal (Umum, Penjualan, Pembelian, Bank, Kas) (needs verification)

---

## 3. Logo Nusantara di Dokumen Cetak

### Deskripsi
Semua dokumen cetak harus memiliki logo Nusantara dan layout yang profesional.

### Logo
- File: `/public/logo-nusantara-sq.png` ✅ (sudah ada)

### Dokumen yang Perlu Di-redesign:
- [x] Faktur Penjualan ✅
- [x] Faktur Pembelian ✅
- [x] Purchase Order (PO) ✅ (sudah ada logo)
- [x] Surat Jalan ✅ (sudah ada logo)
- [ ] Rekap Pengambilan (belum ada format print HTML, hanya Excel export)
- [ ] Penawaran Pembelian (belum ada format print)
- [ ] Penawaran Penjualan (belum ada format print)
- [ ] Bukti Penerimaan (Receipt) (belum ada format print)
- [ ] Bukti Pembayaran (Payment Voucher) (belum ada format print)
- [x] Order Summary (Ringkasan PDF) ✅
- [x] Laporan Laba Rugi ✅
- [x] Neraca (Balance Sheet) ✅
- [x] Laporan Arus Kas ✅

**Catatan:** 
- SO, PO, DO sudah memiliki logo sejak awal
- SI/PI sudah ditambahkan logo
- Laporan keuangan (L/R, Neraca, Arus Kas) sudah ditambahkan logo
- Order Summary sudah ditambahkan logo
- Dokumen lain yang belum punya format print perlu dibuatkan template print terlebih dahulu

### Elemen Template:
- Header dengan logo di kiri atas
- Nama perusahaan, alamat, telepon, email, NPWP
- Nomor dokumen dan tanggal prominent
- Tabel item dengan border rapi
- Footer dengan kolom TTD (Dibuat, Diperiksa, Disetujui)
- Info pembayaran (No. Rek, Bank, a/n)

---

## 4. Satuan Barang Tambahan ✅

### Deskripsi
Tambahkan satuan baru untuk mendukung berbagai jenis barang.

### Satuan yang Perlu Ditambahkan:
- [x] **Meter Kubik (m³)** - untuk volume ✅
- [x] **Ton** - untuk berat ✅

### Implementasi:
- [x] Tambahkan di dropdown satuan ✅
- [x] Support symbol m³ (Unicode U+00B3) ✅
- [x] Backward compatible dengan data existing ✅

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
