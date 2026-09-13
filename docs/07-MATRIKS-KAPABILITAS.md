# 07 — Matriks Kapabilitas ERP dan Perbandingan

> **Tujuan:** memberi gambaran jujur posisi Nusantara ERP dibanding kapabilitas yang umum ada di sistem ERP — **bukan** daftar belanja fitur. Kolom "Belum ada" tidak berarti harus dibuat; kebutuhan diputuskan setelah validasi dengan pengguna ([06](06-MATRIKS-KEBUTUHAN.md)).
>
> **Status:** ✅ **Tercakup** (Covered) — tersedia dan berjalan · 🟡 **Sebagian** (Partial) — ada, tetapi terbatas atau perlu perbaikan · ⬜ **Belum ada** (Missing)

---

## Bagian A — Matriks kapabilitas

### A1. Penjualan

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Penawaran harga | Buat, kirim, terima/tolak, konversi ke SO | Penawaran dengan revisi, masa berlaku, konversi | 🟡 | Tidak bisa diubah; konversi bisa berulang (T-15) |
| Pesanan penjualan | SO dengan status, reservasi stok, cetak, duplikat, ubah status massal | Pesanan + cek batas kredit + persetujuan | 🟡 | Tanpa batas kredit & persetujuan |
| Pengiriman / surat jalan | Kirim sebagian, bagi muatan per truk, cetak | Pengiriman terhubung stok & pelacakan | 🟡 | Stok berkurang dari status SO, bukan surat jalan |
| Faktur penjualan | Faktur dari SO terkirim | Faktur dari satu/lebih pengiriman, faktur gabungan | 🟡 | 1 faktur = 1 SO; cetak faktur rusak (T-16); tidak bisa dibatalkan |
| Penerimaan pembayaran | Per faktur atau per SO; cicilan | Satu penerimaan untuk banyak faktur, lebih bayar, giro | 🟡 | Dua jalur tidak saling mengenali (T-06) |
| Uang muka pelanggan | Terima & terapkan ke SO | Sama | ✅ | Perlu perbaikan jurnal ganda (T-04) |
| Retur penjualan | Retur dari SO/faktur | Retur + nota kredit / pengembalian dana | 🟡 | Retur dari faktur gagal (T-12) |
| Harga & diskon | Harga jual per barang; diskon nominal per baris | Daftar harga per pelanggan/volume, promosi | 🟡 | |
| Batas kredit pelanggan | — | Umum tersedia | ⬜ | Relevansi **REQUIRES USER CONFIRMATION** |
| Tenaga penjual & komisi | — | Umum tersedia | ⬜ | Relevansi **REQUIRES USER CONFIRMATION** |

### A2. Pembelian

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Permintaan pembelian | "Permintaan Barang" (pencatatan) | Permintaan → persetujuan → PO | 🟡 | Tidak terhubung ke PO |
| Penawaran pembelian | Buat, terima/tolak, konversi ke PO | Sama + perbandingan penawaran | 🟡 | |
| Purchase Order | PO + harga supplier otomatis | PO + persetujuan | 🟡 | Tanpa persetujuan |
| Penerimaan barang | Status PO *Diterima* **atau** menu Penerimaan Barang | Penerimaan bertahap terhubung PO & stok | 🟡 | Dua cara tidak konsisten (T-07) |
| Faktur & pembayaran supplier | Faktur dari PO diterima, pembayaran bertahap | Pencocokan PO–penerimaan–faktur | 🟡 | 1 faktur = 1 PO |
| Pencocokan 3 arah (PO–barang–faktur) | — | Umum di ERP menengah ke atas | ⬜ | |
| Daftar harga supplier | Harga per supplier per barang | Sama | ✅ | |

### A3. Persediaan

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Stok per gudang | Multi-gudang, stok per gudang | Sama | ✅ | Perlu perbaikan konsistensi (T-05) |
| Transfer antar gudang | Ya | Ya | ✅ | Tanpa pembatalan |
| Penyesuaian & opname | Penyesuaian tambah/kurang | Sesi opname: hitung fisik → selisih otomatis | 🟡 | |
| Kartu stok | Ya | Ya | ✅ | |
| Penilaian persediaan | Rata-rata bergerak otomatis | Rata-rata / FIFO / standar | ✅ | Retur memakai harga statis (T-44) |
| Reservasi stok | Saat SO dikonfirmasi | Ya | ✅ | |
| Stok minimum & saran pembelian | Batas minimum + notifikasi | Titik pesan ulang + saran PO | 🟡 | Notifikasi tidak berjalan (T-23) |
| Konversi satuan | — | Umum tersedia | ⬜ | Relevan bila menjual Ton & M3 untuk barang yang sama |
| Lot / nomor seri / kedaluwarsa | — | Tersedia untuk industri tertentu | ⬜ | |
| Barcode / pemindai | — | Umum tersedia | ⬜ | |

### A4. Keuangan dan akuntansi

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Buku besar otomatis (double-entry) | Jurnal otomatis dari dokumen | Sama | ✅ | Perlu perbaikan posting ganda (T-01, T-02) |
| Bagan akun | 20 akun bawaan, hanya dilihat | Bisa diatur pengguna | 🟡 | Tidak ada form tambah/ubah akun |
| Jurnal umum | Ya, wajib seimbang | Ya | ✅ | |
| Kas & bank | Pengeluaran/penerimaan lain, transfer, rekening koran | Semua transaksi kas masuk buku besar | 🟡 | Belum membentuk jurnal (T-08) |
| Rekonsiliasi bank | Centang baris rekening koran | Pencocokan otomatis dengan mutasi | 🟡 | |
| Piutang & hutang + umur | Ya | Ya | 🟡 | Angka berbeda antar layar (T-09) |
| Biaya akrual | Ya → jurnal | Ya | ✅ | |
| Anggaran | Per akun per bulan + realisasi | Ya | ✅ | |
| Aset tetap | Daftar, mutasi, disposisi | + penyusutan otomatis & jurnal | 🟡 | Tanpa penyusutan |
| Penggajian | Gaji pokok + tunjangan → jurnal | + PPh 21, BPJS, slip gaji | 🟡 | |
| Tutup buku | Kunci periode | Kunci + jurnal penutup | 🟡 | |
| Multi mata uang | Pengaturan mata uang ada, transaksi hanya Rupiah | Tersedia | ⬜ | Hanya relevan bila ada transaksi valas |
| Multi perusahaan / cabang & konsolidasi | — | Tersedia di ERP menengah ke atas | ⬜ | |

### A5. Pajak (Indonesia)

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| PPN keluaran & masukan di jurnal | Ya (tarif dapat diatur) | Ya | ✅ | |
| Faktur pajak / e-Faktur | Ekspor CSV & pencatatan nomor | Integrasi dengan sistem DJP | 🟡 | Bukan integrasi resmi |
| PPh 21 / 23 | Hanya informasi di cetak PO | Perhitungan & bukti potong | ⬜ | |
| Rekap / SPT PPN | Ada | Ya | 🟡 | Angka belum andal (T-11) |

### A6. Laporan

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Laba Rugi, Neraca, Arus Kas | Ya, filter periode, cetak | Ya + perbandingan periode | 🟡 | Neraca per tanggal perlu perbaikan (T-13) |
| Laporan operasional | Umur piutang, kartu stok, kartu piutang/hutang, rekap SO/PO | Ya | ✅ | |
| Dashboard | Widget penjualan/pembelian/laba/jatuh tempo | Dashboard berbasis data transaksi | 🟡 | Angka keliru (T-22) |
| Ekspor | Excel, CSV, cetak browser | Excel, PDF, terjadwal | 🟡 | |
| Pembuat laporan kustom | — | Umum di ERP menengah ke atas | ⬜ | |

### A7. Alur kerja, hak akses, dan audit

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Rantai dokumen terhubung | "Jejak Dokumen" penawaran → pesanan → pengiriman → faktur → pembayaran | Ya | ✅ | Retur belum masuk rantai |
| Siklus status & koreksi | Status per dokumen; hapus bebas untuk SO/PO, faktur tidak bisa batal | Batal/koreksi terkontrol | 🟡 | Lihat [05](05-SIKLUS-STATUS-DAN-KOREKSI.md) |
| Persetujuan (approval) | — | Persetujuan bertingkat | ⬜ | |
| Peran pengguna | 5 peran bawaan + pending | Peran kustom per fitur | 🟡 | Peran tidak bisa dikustomisasi |
| Pembatasan per gudang/cabang | — | Tersedia | ⬜ | |
| Verifikasi 2 langkah | TOTP + kode cadangan | Ya | ✅ | |
| Log audit | Perubahan data (lokal) + log akses server (cloud) | Ya | ✅ | |
| Kunci periode | Ya | Ya | ✅ | |
| Recycle bin | 90 hari | Bervariasi | ✅ | |
| Jurnal balik eksplisit | — (jurnal dihitung ulang dari status) | Umum | ⬜ | **REQUIRES USER CONFIRMATION** apakah akuntan membutuhkannya |
| Lampiran dokumen (scan/foto) | — | Umum tersedia | ⬜ | |

### A8. Integrasi, otomasi, skalabilitas, kemudahan pemakaian

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| API untuk sistem lain | API baca-saja (butuh deploy Cloud Functions) | API baca & tulis | 🟡 | |
| Impor data | Template Excel (pesanan, faktur, pembayaran, saldo awal, stok awal) | Ya | ✅ | |
| Integrasi bank / marketplace / pajak | — (menu e-Banking hanya tampilan) | Tersedia via konektor | ⬜ | |
| Jurnal otomatis | Ya | Ya | ✅ | |
| Transaksi berulang | — | Umum tersedia | ⬜ | |
| Pengingat jatuh tempo | Notifikasi di aplikasi/perangkat | Notifikasi + email | 🟡 | |
| Backup | File (lokal), otomatis harian (cloud, simpan 14 hari) | Otomatis | ✅ | |
| Multi pengguna & perangkat | Mode cloud (Firestore, sinkron real-time) | Ya | 🟡 | Beberapa data belum tersinkron (T-27) |
| Volume data | Seluruh data dimuat ke perangkat; jurnal dihitung ulang setiap simpan | Server database dengan kueri | 🟡 | Cocok untuk ribuan dokumen per tahun, bukan ratusan ribu |
| Offline | Ya (mode lokal & PWA) | Jarang | ✅ | Kelebihan untuk lokasi dengan internet tidak stabil |
| Mobile | Tampilan responsif + dapat dipasang | Aplikasi mobile terpisah | ✅ | |
| Bahasa Indonesia | Isi Indonesia, menu masih campur | Ya | 🟡 | Diperbaiki pada revamp |
| Pencarian global | SO, PO, barang, pelanggan, supplier | Semua dokumen | 🟡 | Nama pelanggan tidak ditemukan (T-21) |
| Bantuan dalam aplikasi | — | Panduan & tooltip | ⬜ | |

---

## Bagian B — Perbandingan untuk pemangku kepentingan non-teknis

Tabel ini membandingkan **kategori** sistem, bukan merek tertentu. Tujuannya membantu memutuskan apa yang sebenarnya dibutuhkan.

| Aspek | Nusantara ERP saat ini | Software akuntansi/ERP untuk UKM pada umumnya | ERP kelas enterprise pada umumnya | Artinya bagi bisnis |
|---|---|---|---|---|
| **Penjualan** | Alur lengkap penawaran → pesanan → surat jalan → faktur → pembayaran → retur | Alur serupa, biasanya lebih matang untuk faktur gabungan & batas kredit | Sangat lengkap: kontrak, harga bertingkat, persetujuan, CRM | Cukup untuk penjualan B2B sederhana; faktur gabungan & batas kredit bisa ditambah bila memang dibutuhkan |
| **Pembelian** | PO, penerimaan, faktur, pembayaran, harga supplier | Serupa + pencocokan faktur | Pengadaan penuh dengan tender & persetujuan | Cukup bila pembelian ke supplier tetap tanpa proses persetujuan |
| **Persediaan** | Multi-gudang, kartu stok, harga pokok rata-rata otomatis | Serupa + konversi satuan, barcode | + lot/serial, perencanaan kebutuhan | Kuat untuk barang curah per satuan tunggal; perlu cek kebutuhan konversi satuan |
| **Keuangan** | Pembukuan otomatis, laporan standar, anggaran, kunci periode | Serupa + penyusutan aset, rekonsiliasi bank otomatis | Multi perusahaan, konsolidasi, kontrol ketat | Inti akuntansi ada; beberapa celah jurnal sedang diperbaiki (lihat [08](08-TEMUAN-TEKNIS.md)) |
| **Pajak** | PPN otomatis di jurnal, ekspor e-Faktur sederhana | Umumnya punya integrasi e-Faktur/pelaporan | Modul pajak lengkap | Faktur pajak resmi masih dibuat di luar sistem |
| **Laporan** | Laporan keuangan & operasional standar, ekspor Excel | Serupa + perbandingan periode | Pembuat laporan & BI terintegrasi | Cukup untuk laporan bulanan internal; format khusus perlu dikonfirmasi |
| **Alur kerja** | Rantai dokumen jelas; belum ada persetujuan | Persetujuan sederhana sering tersedia | Workflow bertingkat yang dapat dikonfigurasi | Persetujuan hanya perlu bila ada pemisahan wewenang |
| **Hak akses** | 5 peran bawaan, 2FA | Peran dapat dikustomisasi | Hak akses sangat rinci | Cukup untuk tim kecil dengan tugas yang jelas |
| **Audit** | Log perubahan, kunci periode, recycle bin | Serupa | Jejak audit lengkap & kepatuhan formal | Cukup untuk kontrol internal; belum ada jurnal balik eksplisit |
| **Integrasi** | API baca, impor Excel | Konektor bank/marketplace umum tersedia | Platform integrasi lengkap | Integrasi dibuat hanya bila ada sistem yang benar-benar perlu terhubung |
| **Otomasi** | Jurnal & harga pokok otomatis, notifikasi | + transaksi berulang, pengingat email | Otomasi proses end-to-end | Otomasi inti (pembukuan) sudah ada |
| **Skalabilitas** | Cocok untuk satu perusahaan dengan volume kecil–menengah | Menengah | Sangat besar, multi negara | Perlu dicek bila volume transaksi sangat tinggi |
| **Kemudahan pemakaian** | Web + PWA, bisa offline; tampilan sedang dirapikan | Umumnya matang & ada pelatihan | Kompleks, butuh implementasi & pelatihan panjang | Dapat disesuaikan langsung dengan cara kerja bisnis ini |

### Kesimpulan yang jujur

1. Nusantara ERP **sudah mencakup siklus dagang inti** (jual, beli, stok, kas, pembukuan otomatis) untuk satu perusahaan dagang skala kecil–menengah.
2. Nusantara ERP **tidak setara** dengan ERP kelas enterprise: belum ada persetujuan bertingkat, multi perusahaan, integrasi pajak resmi, dan kontrol akses rinci — dan tidak perlu diklaim setara.
3. Beberapa fitur yang ada **belum andal** dan sedang diperbaiki sebelum dipakai untuk laporan resmi (posting ganda, kas & bank tanpa jurnal, laporan PPN) — lihat [08](08-TEMUAN-TEKNIS.md).
4. Keunggulan yang nyata: **disesuaikan untuk satu bisnis**, bisa berjalan **offline**, alur dokumen dan pembukuan **terhubung otomatis**.
5. Fitur yang "belum ada" hanya layak dibuat bila hasil meeting menunjukkan kebutuhan nyata.
