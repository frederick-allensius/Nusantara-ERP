# 05 — Siklus Status Dokumen dan Model Koreksi

> **Pertanyaan yang dijawab:** *"Kalau transaksi salah, apa yang boleh dilakukan — ubah, batalkan, retur, atau jurnal koreksi?"*
>
> Dokumen ini berisi (1) status dan (2) perilaku ubah/hapus/batal seperti ditemukan saat review, (3) model koreksi yang konsisten dengan logika akuntansi aplikasi, dan (4) status penerapannya.

---

## 1. Kosakata status yang dipakai di dokumen ini

| Istilah umum | Arti | Padanan di aplikasi |
|---|---|---|
| **Draft** | Belum berlaku; bebas diubah | Draft |
| **Diajukan / Dikonfirmasi** | Komitmen bisnis, belum ada efek akuntansi | Dikonfirmasi (SO/PO), Dikirim (penawaran), Pending (DO), Siap (surat jalan pengambilan) |
| **Diposting** | Sudah memengaruhi stok dan/atau buku besar | Terkirim (SO), Diterima (PO), Belum Lunas (faktur), Diposting (penerimaan, pembayaran, retur, transfer), Diambil (truk pengambilan) |
| **Lunas** | Kewajiban/tagihan sudah dibayar penuh | Lunas (SO/PO/faktur) |
| **Selesai** | Siklus dokumen tuntas | Difakturkan (DO), Ditagih (truk pengambilan), Diterima/Ditolak (penawaran), **Selesai** (SO/PO pengambilan yang ditutup) |
| **Dibatalkan** | Tidak berlaku; tetap tersimpan untuk jejak | Dibatalkan (SO/PO, faktur, penerimaan/pembayaran, retur draft), **Batal** (surat jalan pengambilan yang tidak dipakai) |
| **Dibalik (reversed)** | Efeknya dinetralkan oleh dokumen/jurnal lawan | Retur Penjualan/Pembelian, Jurnal Umum koreksi |
| **Diubah** | Isi dokumen diganti setelah dibuat | Form Edit |
| **Dikoreksi** | Kesalahan diperbaiki dengan dokumen koreksi | Retur, Penyesuaian Stok, Jurnal Umum |

---

## 2. Status per jenis dokumen (temuan review)

> Status dan transisi yang berlaku sekarang ada di mesin dokumen (`src/classic/core/doc-registry.js`); perubahan yang sudah diterapkan dirangkum di §5.

| Dokumen | Status | Transisi yang divalidasi mesin |
|---|---|---|
| Penawaran (SQ/PQ) | Draft → Dikirim → Diterima / Ditolak | Draft→Dikirim; Dikirim→Diterima/Ditolak/Draft; Diterima & Ditolak = akhir |
| Sales Order | Draft, Dikonfirmasi, Terkirim, Lunas, Dibatalkan (+ status impor) | Draft→Dikonfirmasi/Lunas/Terkirim; Dikonfirmasi→Lunas/Terkirim/Draft; Lunas→Terkirim/Dikonfirmasi; Terkirim→Lunas |
| Purchase Order | Draft, Dikonfirmasi, Diterima, Lunas, Dibatalkan (+ status impor) | Seperti SO dengan "Diterima" |
| Surat Jalan (DO) | Pending, Dalam Pengiriman, Terkirim, Faktur Sebagian, Difakturkan | Divalidasi di form Edit |
| Faktur (SI/PI) | Belum Lunas → Lunas | Otomatis dari penerimaan/pembayaran |
| Penerimaan / Pembayaran (SR/PP) | Diposting | — |
| Retur (SRN/PRN) | Draft → Diposting | — |
| Transfer Gudang (IT) | Diposting | — |
| Uang Muka | Diterima/Dibayar → Diterapkan | — |
| Biaya Akrual | Draft → Diposting | — |
| Penggajian | Draft → Diposting → Dibayar | — |

**Temuan:**
- Status "Dibatalkan" pada SO/PO hanya ada di daftar pilihan tampilan; mesin dokumen tidak mengenalnya sebagai status resmi (transisi dari/ke status yang tidak dikenal selalu diizinkan).
- Validasi transisi hanya berlaku saat mengubah status dari **daftar** (satuan/massal) dan di form Surat Jalan — **tidak** di form Edit SO/PO (T-17).
- Satu field status SO mencampur dua hal berbeda: **pengiriman** (Terkirim) dan **pembayaran** (Lunas). Pesanan yang sudah dikirim lalu dibayar tetap "Terkirim"; yang dibayar lebih dulu menjadi "Lunas" lalu harus diubah manual ke "Terkirim".

---

## 3. Apa yang terjadi saat mengubah, menghapus, membatalkan (temuan review)

> Perilaku setelah perbaikan dirangkum di §5.

| Dokumen | Ubah | Hapus | Batal | Efek pada stok & akuntansi |
|---|---|---|---|---|
| **SO** | ✅ Semua status | ✅ Semua status (undo + recycle bin) | Ubah status ke Dibatalkan | Reservasi dilepas; stok dikembalikan bila sebelumnya Terkirim; jurnal ikut hilang |
| **PO** | ✅ Semua status | ✅ Semua status | Ubah status | Stok dikurangi kembali bila sebelumnya Diterima; jurnal hilang |
| **Surat Jalan** | ✅ | ✅ | — | Tidak ada efek |
| **Penawaran** | ❌ | ❌ | Ditolak | — |
| **Faktur (SI/PI)** | ❌ | ❌ | ❌ | Koreksi hanya via retur |
| **Penerimaan/Pembayaran** | ❌ | ❌ | ❌ | — |
| **Retur** | ❌ | ❌ | ❌ (setelah posting) | — |
| **Penyesuaian stok** | ❌ | ✅ kapan saja | — | Stok dikembalikan; jurnal hilang |
| **Transfer gudang** | ❌ | ❌ | ❌ | — |
| **Jurnal Umum** | ❌ | ❌ | — | Koreksi dengan jurnal balik |
| **Uang muka, Biaya Akrual, Pengeluaran Lain** | Sebagian | ✅ kapan saja | — | Akrual yang dihapus meninggalkan jurnalnya |
| **Pelanggan/Supplier/Barang** | ✅ | ✅ dengan cek sebagian relasi | — | Mengubah stok di data barang tidak memperbarui stok per gudang (T-05) |

**Risiko terhadap integritas akuntansi:**
1. Dokumen yang sudah memengaruhi buku besar (SO Terkirim, PO Diterima) masih bisa **diubah atau dihapus** tanpa jejak di buku besar (hanya log audit). Laporan bulan lalu bisa berubah diam-diam kecuali periode dikunci.
2. Menghapus SO/PO tidak ikut membatalkan Surat Jalan, Faktur, atau pembayaran turunannya.
3. Dokumen keuangan yang salah (faktur, penerimaan) tidak bisa dibatalkan sama sekali — pengguna terdorong memakai jalan pintas.

---

## 4. Model koreksi yang direkomendasikan

Model ini **mengikuti mesin yang sudah ada** (jurnal diturunkan dari status dokumen) dan menambahkan batasan yang wajar. Bagian yang sudah diterapkan dicatat di §5.

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Dikonfirmasi: konfirmasi
  Draft --> [*]: hapus (bebas)
  Dikonfirmasi --> Draft: kembali ke draft
  Dikonfirmasi --> Diposting: kirim / terima / posting
  Dikonfirmasi --> Dibatalkan: batalkan
  Diposting --> Lunas: pembayaran penuh
  Diposting --> Dibatalkan: batalkan (hanya jika belum ada dokumen turunan aktif)
  Diposting --> Dikoreksi: retur / penyesuaian / jurnal koreksi
  Lunas --> Dikoreksi: retur
  Dibatalkan --> [*]
```

| Situasi | Tindakan yang benar | Efek |
|---|---|---|
| Salah ketik di dokumen **Draft** | **Ubah** atau **hapus** | Tidak ada efek stok/akuntansi |
| Salah di dokumen **Dikonfirmasi** (belum ada efek akuntansi) | **Ubah** (dengan pemberitahuan) atau **Batalkan** | Reservasi stok diperbarui/dilepas |
| Dokumen **Diposting** salah dan belum punya dokumen turunan | **Batalkan** (status Dibatalkan, dokumen tetap tersimpan) | Stok dikembalikan; jurnal otomatis tidak lagi dibentuk; tercatat di log audit |
| Dokumen **Diposting** yang sudah punya faktur/pembayaran | **Tidak diubah langsung.** Batalkan dokumen turunan lebih dulu, atau gunakan **Retur** | Rantai dokumen tetap konsisten |
| Barang dikembalikan pelanggan/ke supplier | **Retur Penjualan / Retur Pembelian** | Stok & jurnal dibalik sebagian atau penuh |
| Selisih stok fisik | **Penyesuaian Stok** | Jurnal selisih persediaan |
| Salah akun / nilai di buku besar tanpa kesalahan dokumen | **Jurnal Umum koreksi** | Jejak koreksi terlihat di buku besar |
| Faktur salah dan belum dibayar | **Batalkan faktur** | Piutang/hutang tidak lagi terbentuk |
| Penerimaan/pembayaran salah | **Batalkan penerimaan/pembayaran** | Kas/bank dan piutang/hutang kembali; status faktur kembali Belum Lunas |
| Bulan sudah ditutup | **Kunci periode**; koreksi dibukukan di periode berjalan | Laporan periode lama tidak berubah |

Prinsip:
1. **Hapus hanya untuk Draft** (dan dokumen tanpa efek). Dokumen berefek dibatalkan, bukan dihapus.
2. **Batalkan dari hilir ke hulu:** pembayaran → faktur → pengiriman → order.
3. **Jejak tidak hilang:** dokumen batal tetap tersimpan dengan status Dibatalkan dan tercatat di log audit.
4. **Koreksi nilai akuntansi yang sudah dilaporkan** memakai dokumen koreksi (retur, penyesuaian, jurnal umum), bukan mengubah dokumen lama.

❓ Keputusan yang perlu disepakati dengan pemilik/akuntan — **REQUIRES USER CONFIRMATION**:
- Apakah dokumen yang sudah dikirim/diterima boleh diubah oleh staf, atau hanya oleh peran tertentu (misalnya admin)?
- Apakah pembatalan perlu persetujuan (approval)?
- Apakah auditor/akuntan membutuhkan **jurnal balik eksplisit** di buku besar (bukan hanya log audit)?
- Apakah ada batas waktu koreksi (misalnya setelah tanggal 5 bulan berikutnya dikunci)?

---

## 5. Status penerapan model

Kolom ini diperbarui seiring perbaikan aplikasi. Rincian teknis di [08-TEMUAN-TEKNIS.md](08-TEMUAN-TEKNIS.md).

| Aturan | Status |
|---|---|
| Validasi transisi status juga berlaku di form Edit SO/PO | Diterapkan |
| Dokumen yang sudah punya dokumen turunan tidak bisa dihapus (ditawarkan Batalkan) | Diterapkan |
| Pembatalan Faktur Penjualan/Pembelian (bila belum ada pembayaran) | Diterapkan |
| Pembatalan Penerimaan/Pembayaran (status faktur dihitung ulang) | Diterapkan |
| Konversi penawaran hanya sekali | Diterapkan |
| Status **Dibatalkan** resmi di mesin dokumen: SO/PO, faktur, penerimaan/pembayaran, dan retur yang masih draft | Diterapkan |
| Pesanan yang sudah difakturkan tidak bisa diubah sebelum fakturnya dibatalkan | Diterapkan |
| Retur yang sudah diposting bersifat final; koreksi dengan dokumen baru | Diterapkan |
| Biaya akrual yang sudah diposting tidak bisa dihapus; koreksi dengan Jurnal Umum (jurnal balik) | Diterapkan |
| Status **Selesai** (SO/PO pengambilan yang ditutup) dan **Batal** (surat jalan pengambilan yang tidak dipakai) di mesin dokumen | Diterapkan |
| Membatalkan faktur dari pengambilan mengembalikan truknya menjadi belum ditagih / belum difakturkan supplier | Diterapkan |
| Surat jalan pengambilan hanya diubah dari menu Pengambilan (menu Surat Jalan menolak ubah/hapus) | Diterapkan |
| Perubahan berat setelah ditagih tidak mengubah faktur; muncul peringatan sampai ditindaklanjuti | Diterapkan |
| Jurnal balik eksplisit untuk pembatalan | Menunggu konfirmasi kebutuhan |
| Approval pembatalan | Menunggu konfirmasi kebutuhan |

---

## 6. Pengambilan — status dan koreksi

Alur lengkapnya di [03 §V](03-ALUR-TRANSAKSI.md#v-pengambilan-trading); dampak akuntansinya di [04 §4.5](04-AKUNTANSI.md#45-pengambilan-trading).

| Dokumen | Status | Perpindahan |
|---|---|---|
| PO supplier pengambilan | Dikonfirmasi (berjalan) → **Selesai** | Ditutup otomatis saat kuota terpenuhi atau lewat batas pengambilan, atau lewat **Tutup PO**. **Buka kembali** mengembalikannya ke Dikonfirmasi |
| PO pelanggan (Pesanan Penjualan) | Dikonfirmasi → **Selesai** | Selesai saat seluruh qty sudah diambil dan tidak ada PO supplier yang masih berjalan untuknya (dicek saat PO supplier ditutup) |
| Surat jalan pengambilan (satu per truk) | **Siap** → **Diambil** → **Ditagih**; **Batal** | Siap → Diambil saat truk dicatat; Diambil → Ditagih saat masuk Faktur Penjualan aktif, kembali Diambil bila faktur itu dibatalkan; Siap → Batal bila dibatalkan manual atau PO ditutup, kembali Siap bila PO dibuka kembali |

| Situasi | Tindakan di aplikasi | Efek |
|---|---|---|
| Surat jalan tidak akan dipakai | Detail PO → **Batalkan** surat jalan (hanya yang masih Siap) | Tidak ada efek akuntansi |
| PO tidak akan diambil lagi | **Tutup PO** | Surat jalan Siap menjadi Batal; PO pelanggan selesai bila sudah habis diambil |
| PO ditutup terlalu cepat | **Buka kembali** | PO Dikonfirmasi lagi; surat jalan yang dibatalkan saat penutupan aktif kembali dengan nomor yang sama. Bila batas sudah lewat, hanya pengambilan sampai batas yang bisa dicatat dan PO ditutup lagi saat daftar PO Pengambilan dibuka |
| Berat truk salah / berubah | **Impor Rekap Timbangan** dengan berat yang benar | Berat diperbarui, riwayat disimpan. Bila truk sudah masuk faktur: faktur tetap, muncul peringatan di Perubahan Timbangan sampai **Tandai selesai** dengan catatan tindak lanjut |
| Harga beli truk salah | Tagihan Supplier → samakan harga dengan tagihan atau Harga Supplier (sebelum faktur supplier dibuat) | Riwayat harga disimpan; jurnal pembelian & HPP truk ikut berubah |
| Faktur dari pengambilan salah | **Batalkan** faktur (bila belum ada penerimaan/pembayaran dan retur), lalu buat lagi | Truk kembali belum ditagih / belum difakturkan supplier; jurnal truk kembali memuat bagian itu |
| Truk tercatat padahal tidak mengambil | Tidak ada tombol batal/hapus untuk pengambilan yang sudah dicatat | Koreksi butuh keputusan cara baku — **REQUIRES USER CONFIRMATION** |
