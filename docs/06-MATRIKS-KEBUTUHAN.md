# 06 — Matriks Kebutuhan (Requirement Matrix)

> **Tujuan:** memisahkan dengan jujur antara **apa yang ada di sistem**, **apa yang kami pahami**, dan **apa yang harus dikonfirmasi** pengguna. Tidak ada kolom yang boleh diisi dengan kepastian palsu.
>
> **Keyakinan:**
> - **Tinggi** — terbukti di kode dan konsisten dengan kebutuhan umum usaha dagang.
> - **Sedang** — fitur ada dan berjalan, tetapi belum diketahui apakah dipakai/dibutuhkan bisnis.
> - **Rendah** — hanya dugaan dari data contoh, template, atau nama menu.
>
> Kolom terakhir berisi pertanyaan untuk pengguna. Prioritas pertanyaan (🔴/🟡/🟢) ada di [MEETING_KIT.md](MEETING_KIT.md).

---

## 1. Gambaran bisnis

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Jenis usaha | Data contoh: material curah (Ton/M3), kategori batu alam, surat jalan per truk | Perdagangan material ke pelanggan bisnis dengan pengiriman truk | Rendah | Ya — produk apa yang dijual, siapa pelanggannya |
| Skala transaksi | Tidak ada data riil | Usaha kecil–menengah | Rendah | Ya — kira-kira berapa pesanan, faktur, dan pengiriman per bulan |
| Sistem yang dipakai sekarang | Ada impor Excel dan status bergaya Accurate Online | Bisnis mungkin memakai Excel, catatan manual, atau software akuntansi lain | Rendah | Ya — apa yang dipakai hari ini dan data apa yang perlu dipindahkan |
| Lokasi & perangkat | Aplikasi web + PWA, mode lokal atau cloud | Dipakai di kantor, mungkin juga di HP | Rendah | Ya — berapa komputer/HP, perlu akses dari luar kantor? |
| Tanggal mulai memakai sistem | Saldo awal lewat impor Excel / Jurnal Umum | Perlu tanggal *cut-off* yang jelas | Tinggi (kebutuhan teknis) | Ya — mulai tanggal berapa, saldo awal dari mana |

## 2. Penjualan

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Penawaran harga | Penawaran → diterima/ditolak → konversi ke SO | Sebagian pelanggan meminta penawaran tertulis | Sedang | Apakah penawaran tertulis dipakai? Berapa lama berlaku? |
| Pesanan penjualan (SO) | Titik awal alur dokumen; status diubah manual | Semua penjualan dicatat sebagai pesanan | Sedang | Apakah ada penjualan langsung/tunai tanpa pesanan? |
| Pengiriman | Surat Jalan dari SO, kirim sebagian, bagi muatan per truk; **stok berkurang lewat status SO**, bukan surat jalan | Pesanan besar dikirim bertahap | Sedang | Siapa yang membuat surat jalan? Stok seharusnya berkurang saat barang keluar gudang (surat jalan)? |
| Penagihan | 1 faktur dari 1 SO yang sudah terkirim | Faktur dibuat setelah barang dikirim | Sedang | Faktur per pengiriman, per pesanan, atau rekap bulanan? |
| Termin & jatuh tempo | Jatuh tempo per SO; daftar termin di pengaturan | Pelanggan bisnis membayar dengan tempo | Rendah | Termin standar? Berbeda per pelanggan? Batas kredit? |
| Penerimaan pembayaran | Dua jalur: log pembayaran di SO dan penerimaan atas faktur; metode Tunai/BCA/Mandiri | Pembayaran umumnya transfer | Rendah | Bagaimana pelanggan membayar? Rekening mana? Sering dicicil? |
| Uang muka | Uang muka penjualan diterapkan ke SO | Ada pelanggan membayar DP | Rendah | Seberapa sering? Berapa persen? |
| Harga & diskon | Harga jual per barang; diskon nominal per baris | Harga bisa berbeda per pesanan | Sedang | Ada daftar harga per pelanggan? Diskon persen? Siapa boleh memberi diskon? |
| Ongkos kirim | Baris jasa "ongkir / jasa pengiriman" di pesanan | Ongkir ditagihkan ke pelanggan | Rendah | Ongkir ditagih? Pakai armada sendiri atau ekspedisi? |
| Retur penjualan | Retur dari SO/faktur, stok kembali | Jarang terjadi | Rendah | Seberapa sering? Uang dikembalikan atau potong tagihan? |
| Target penjualan | Target per periode/kategori | Tidak diketahui | Rendah | Apakah ada target untuk tim penjualan? |
| Data pelanggan | Nama, kontak, alamat, NPWP, kategori; bisa diketik bebas di SO | Pelanggan tetap B2B | Sedang | Data wajib pelanggan? Siapa boleh menambah pelanggan? |

## 3. Pembelian

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Purchase Order | PO dengan harga dari daftar harga supplier | Pembelian ke supplier tetap | Sedang | Semua pembelian pakai PO? Siapa menyetujui? |
| Penerimaan barang | Dua cara: status PO *Diterima* dan menu *Penerimaan Barang* | Barang dari supplier bisa datang bertahap | Rendah | Barang datang sekaligus atau bertahap? Siapa mencatat di gudang? |
| Faktur & pembayaran supplier | Faktur dari PO diterima → pembayaran | Supplier memberi tempo | Sedang | Termin supplier? Siapa yang membayar dan kapan? |
| Uang muka pembelian | DP pembelian diterapkan ke PO | Beberapa supplier minta DP | Rendah | Seberapa sering? |
| PPh 23 | Tampil sebagai informasi di cetak PO | Tidak diketahui | Rendah | Apakah perusahaan memotong PPh 23 atas jasa? |
| Retur pembelian | Retur dari PO/faktur | Jarang | Rendah | Seberapa sering? |

## 4. Persediaan

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Daftar barang | Barang stok dan jasa dalam satu daftar; satu satuan per barang | Barang dijual per Ton/M3/unit | Sedang | Perlu konversi satuan (mis. Ton ↔ M3)? |
| Gudang | Multi-gudang + transfer antar gudang | Tidak diketahui | Rendah | Berapa lokasi penyimpanan? |
| Stok minimum | Batas minimum per barang + notifikasi | Pemilik ingin tahu kapan harus beli | Sedang | Dipakai? Siapa yang memantau? |
| Stock opname | Penyesuaian stok (tambah/kurang) | Dilakukan berkala | Rendah | Seberapa sering? Selisih dicatat bagaimana? |
| Reservasi stok | Stok dipesan saat SO dikonfirmasi | Menghindari menjual stok yang sudah dijanjikan | Sedang | Perlu? |
| Penilaian persediaan | Rata-rata bergerak | Tidak diketahui | Sedang | Metode yang dipakai akuntan? |
| Permintaan barang & job costing | Pencatatan tanpa efek stok/akuntansi | Tidak diketahui | Rendah | Dipakai? |

## 5. Keuangan dan akuntansi

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Pembukuan otomatis | Jurnal dibentuk otomatis dari dokumen | Staf tidak perlu menulis jurnal untuk transaksi rutin | Tinggi | Siapa yang membaca laporan: pemilik, akuntan internal, atau konsultan luar? |
| Bagan akun | 20 akun bawaan, belum bisa diedit dari tampilan | Perlu disesuaikan dengan akun perusahaan | Rendah | Sudah punya bagan akun sendiri? |
| Rekening kas & bank | Kas, Bank BCA, Bank Mandiri | Diambil dari data contoh | Rendah | Rekening apa saja yang aktif? |
| Biaya operasional | Pengeluaran Lain (belum masuk jurnal) dan Biaya Akrual (masuk jurnal) | Biaya harus masuk Laba Rugi | Sedang | Biaya apa saja yang rutin? Perlu dikelompokkan per kategori/proyek? |
| Penggajian | Gaji pokok + tunjangan, tanpa potongan | Tidak diketahui | Rendah | Gaji dikelola di sistem ini atau terpisah? |
| Aset tetap | Daftar aset tanpa penyusutan | Tidak diketahui | Rendah | Perlu penyusutan otomatis? Aset apa (truk, alat berat)? |
| Anggaran | Anggaran per akun per bulan + realisasi | Tidak diketahui | Rendah | Dipakai? |
| Tutup buku | Kunci periode; tidak ada jurnal penutup | Laporan bulanan dikunci setelah final | Sedang | Tutup buku bulanan? Siapa yang mengunci? |
| Koreksi transaksi | Lihat [05](05-SIKLUS-STATUS-DAN-KOREKSI.md) | Dokumen berefek dibatalkan, bukan dihapus | Sedang | Siapa boleh membatalkan? Perlu persetujuan? |

## 6. Pajak

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Status PKP & PPN | PPN 11% opsional per dokumen; pengaturan PKP & NPWP | Sebagian transaksi kena PPN | Sedang | Perusahaan PKP? Semua penjualan kena PPN? |
| Faktur pajak / e-Faktur | Menu e-Faktur tanpa integrasi resmi | Faktur pajak dibuat di aplikasi DJP | Rendah | Siapa yang membuat faktur pajak dan melapor SPT? |
| Laporan pajak | Rekap PPN, SPT PPN (angka belum andal, T-11) | Dibutuhkan untuk rekap bulanan | Sedang | Format rekap yang dibutuhkan konsultan pajak? |

## 7. Laporan

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Laporan keuangan | Laba Rugi, Neraca, Arus Kas | Pemilik perlu laba dan posisi kas | Sedang | Laporan apa yang dilihat rutin? Untuk bank/pajak/internal? |
| Laporan operasional | Umur piutang, kartu stok, kartu piutang/hutang, rekap SO/PO | Piutang dan stok dipantau rutin | Sedang | Laporan apa yang paling sering dicari? |
| Dashboard | Widget penjualan, pembelian, laba, jatuh tempo | Pemilik ingin ringkasan cepat | Rendah | Angka apa yang dicek pemilik setiap pagi? |
| Ekspor & cetak | Excel, CSV, cetak SO/PO/Surat Jalan | Dokumen dicetak untuk pelanggan/sopir | Sedang | Dokumen apa yang wajib dicetak? Perlu logo/stempel? |

## 8. Pengguna, hak akses, dan kontrol

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Pengguna | 4 akun contoh, semuanya admin | Beberapa staf memakai sistem | Rendah | Siapa saja penggunanya dan apa tugasnya? |
| Peran | Admin, Manajer, Akunting, Penjualan, Viewer | Pembagian tugas kantor | Sedang | Apakah peran ini cocok? Ada peran gudang? |
| Persetujuan (approval) | Tidak ada | Tidak diketahui | Rendah | Perlu persetujuan untuk PO, diskon, pembatalan? |
| Jejak audit | Log audit perubahan data | Berguna untuk kontrol internal | Sedang | Perlu ditinjau rutin? |
| Keamanan login | Password, 2FA opsional | Tidak diketahui | Sedang | Wajib 2FA untuk admin? |

## 9. Operasional sistem

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Penyimpanan data | Lokal (satu perangkat) atau cloud (Firebase) | Tergantung jumlah perangkat | Rendah | Data harus bisa diakses dari beberapa perangkat? |
| Backup | Ekspor file (lokal) / backup harian otomatis (cloud) | Perlu penanggung jawab | Sedang | Siapa yang bertanggung jawab atas backup? |
| Integrasi | API baca-saja siap pakai | Tidak diketahui | Rendah | Ada sistem lain yang perlu terhubung (marketplace, bank, pajak)? |
| Bahasa | Indonesia (ada tombol Inggris) | Pengguna berbahasa Indonesia | Tinggi | — |

---

## 10. Fitur yang mungkin tidak dibutuhkan — **tetap dipertahankan**

Fitur di bawah ada di aplikasi, tetapi belum ada bukti bahwa bisnis membutuhkannya. Pada tahap ini **tidak ada yang dihapus**: fitur tetap tersedia dan dapat disembunyikan per peran setelah dikonfirmasi.

| Fitur | Mengapa mungkin tidak dibutuhkan | Mengapa dipertahankan sekarang | Pertanyaan |
|---|---|---|---|
| Anggaran, Realisasi Anggaran, Transfer Anggaran | Usaha kecil–menengah jarang menyusun anggaran per akun | Membaca buku besar, tidak mengganggu transaksi | F12 |
| Penggajian | Gaji sering diurus terpisah (Excel/konsultan) | Sudah terhubung ke jurnal | F10 |
| Aset Tetap (kategori, golongan fiskal, mutasi, pelepasan, riwayat) | Tanpa penyusutan, fungsinya hanya daftar | Berguna bila truk/alat berat perlu dicatat | F11 |
| Job Costing, Permintaan Barang | Tidak ada tanda pekerjaan proyek/permintaan internal | Pencatatan saja, tanpa efek | I7 |
| Target Penjualan | Tidak diketahui apakah ada target tim | Pencatatan saja | S12 |
| Uang Muka Penjualan/Pembelian | Tergantung kebiasaan pembayaran | Dibutuhkan bila ada DP | S11, P5 |
| Penawaran Penjualan/Pembelian | Pesanan mungkin langsung tanpa penawaran tertulis | Konversi ke pesanan menghemat input | S6 |
| Rekening Koran & Rekonsiliasi Bank | Input manual, belum otomatis | Kontrol kas bulanan | F3 |
| Kalender, Metode Pengiriman, Kategori Penjualan, Kontak | Data pendukung yang jarang dipakai | Tidak mengganggu | — |
| Transaksi Favorit | Belum jelas pemakaiannya | Tidak mengganggu | — |
| Mata Uang | Transaksi hanya Rupiah | Pengaturan saja; tidak ditampilkan di menu | **REQUIRES USER CONFIRMATION** |
| SmartLink e-Banking | Belum ada koneksi bank nyata | Formulir konfigurasi; tidak ditampilkan di menu | — |
| e-Faktur format lama, Kirim Faktur Pajak via Email | Format lama; email tidak benar-benar terkirim | Tetap di kode; tidak ditampilkan di menu | F8 |
| Analisis bisnis berbasis aturan ("AI Analysis") | Bukan AI; angka perlu diperbaiki | Tetap di kode; tidak ditampilkan di menu | R1 |
