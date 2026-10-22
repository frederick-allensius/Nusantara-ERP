# UPDATE - Nusantara ERP

Dokumen ini mencatat daftar update/perbaikan yang perlu dikerjakan untuk sistem Nusantara ERP.

**Tanggal:** 22 Oktober 2026

---

## 1. Fitur "Ubah Status" di Menu Aksi

### Deskripsi
Tambahkan menu **"Ubah status"** di action menu (⋮) setiap baris tabel, sehingga user bisa mengubah status dokumen tanpa masuk ke halaman detail.

### Modul yang Perlu Ditambahkan:

#### Penjualan
- [x] Penawaran Penjualan (Draft, Terkirim, Diterima, Ditolak, Kadaluarsa) ✅
- [x] Pesanan Penjualan / SO *(sudah ada sebelumnya)* ✅
- [ ] Surat Jalan (Draft, Dalam pengiriman, Terkirim, Dikembalikan)
- [x] Faktur Penjualan (Draft, Diterbitkan, Dibayar sebagian, Lunas, Jatuh tempo) ✅
- [x] Penerimaan Pembayaran (Pending, Diterima, Terekonsiliasi) ✅
- [ ] Uang Muka Penjualan (Draft, Diterima, Dialokasikan, Dikembalikan)
- [x] Retur Penjualan (Draft, Disetujui, Selesai, Ditolak) ✅

#### Pembelian
- [x] Penawaran Pembelian (Draft, Terkirim, Diterima, Dibuat PO, Ditolak) ✅
- [x] Pesanan Pembelian / PO (Draft, Terkirim, Dikonfirmasi, Sebagian, Selesai, Dibatalkan) ✅
- [ ] Penerimaan Barang (Draft, Diterima, Terekonsiliasi, Sudah difaktur)
- [ ] Validasi SJ Supplier (Pending, Cocok, Bermasalah)
- [x] Faktur Pembelian (Draft, Diterima, Dibayar sebagian, Lunas, Jatuh tempo) ✅
- [x] Pembayaran ke Supplier (Pending, Dibayar, Terekonsiliasi) ✅
- [ ] Uang Muka Pembelian (Draft, Dibayar, Dialokasikan)
- [x] Retur Pembelian (Draft, Disetujui, Selesai, Ditolak) ✅

#### Persediaan
- [ ] Permintaan Barang (Draft, Diajukan, Disetujui, Terpenuhi, Ditolak)
- [ ] Transfer Antar Gudang (Draft, Dalam transit, Diterima, Ditolak)
- [ ] Penyesuaian Stok (Draft, Disetujui, Diposting)

**Total: 21 modul** (**10 sudah selesai: 48%**)

**Progress:** **10/21 modules implemented (48%)**

**Selesai:**
- ✅ SO (Sales Order) - sudah ada  
- ✅ PO (Purchase Order)
- ✅ SQ (Penawaran Penjualan)
- ✅ PQ (Penawaran Pembelian)
- ✅ SI (Faktur Penjualan)
- ✅ PI (Faktur Pembelian)
- ✅ SR (Penerimaan Pembayaran)
- ✅ PP (Pembayaran ke Supplier)
- ✅ SRN (Retur Penjualan)
- ✅ PRN (Retur Pembelian)

**Belum (11 tersisa):**
- ⬜ DO (Surat Jalan)
- ⬜ SDP (Uang Muka Penjualan)
- ⬜ PDP (Uang Muka Pembelian)
- ⬜ GR (Penerimaan Barang)
- ⬜ SJV (Validasi SJ Supplier)
- ⬜ MR (Permintaan Barang)
- ⬜ WT (Transfer Antar Gudang)
- ⬜ ADJ (Penyesuaian Stok)
- ⬜ Sales Advance
- ⬜ Purchase Advance
- ⬜ Goods Receipt Detail

**Catatan:** 
- Foundation 100% done (status constants, helpers, pattern)
- Implementation guide tersedia di `.agents/tasks/ubah-status-implementation-guide.md`
- 11 modules tersisa bisa diimplementasi mengikuti pattern yang sama
- PO Pengambilan, Rekap Pengambilan, Perubahan Timbangan, dan Tagihan Supplier tidak perlu menu "Ubah status" karena statusnya otomatis atau tidak memiliki status yang bisa diubah manual.

---

## 2. Sorting Jurnal Berdasarkan Tanggal Terbaru

### Deskripsi
Halaman Jurnal harus menampilkan jurnal dengan **tanggal terbaru di atas** secara default.

### Yang Perlu Dikerjakan:
- [ ] Default sorting: tanggal descending (terbaru → terlama)
- [ ] Klik header kolom "Tanggal" untuk toggle ascending/descending
- [ ] Visual indicator (↓↑) pada header kolom
- [ ] Secondary sort by nomor jurnal (descending)
- [ ] Simpan preference user di localStorage
- [ ] Berlaku untuk semua jenis jurnal (Umum, Penjualan, Pembelian, Bank, Kas)

---

## 3. Logo Nusantara di Dokumen Cetak

### Deskripsi
Semua dokumen cetak harus memiliki logo Nusantara dan layout yang profesional.

### Logo
- File: `/public/logo-nusantara-sq.png` ✅ (sudah ada)

### Dokumen yang Perlu Di-redesign:
- [ ] Faktur Penjualan
- [ ] Faktur Pembelian
- [ ] Purchase Order (PO)
- [ ] Surat Jalan
- [ ] Rekap Pengambilan
- [ ] Penawaran Pembelian
- [ ] Penawaran Penjualan
- [ ] Bukti Penerimaan (Receipt)
- [ ] Bukti Pembayaran (Payment Voucher)

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

### Satuan yang Perlu Ditambahkan:
- [ ] **Meter Kubik (m³)** - untuk volume
- [ ] **Ton** - untuk berat (1 ton = 1000 kg, auto konversi)

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
