# 06 — Matriks Kebutuhan (Requirement Matrix)

> **Tujuan:** memisahkan dengan jujur antara **apa yang ada di sistem**, **apa yang kami pahami**, dan **apa yang harus dikonfirmasi** pengguna. Tidak ada kolom yang boleh diisi dengan kepastian palsu.
>
> **Keyakinan:**
> - **Tinggi** — terbukti di kode dan konsisten dengan kebutuhan umum usaha dagang, atau kebutuhannya sudah dikonfirmasi pemilik — ditandai *(dikonfirmasi)*, rinciannya di [11](11-KEBUTUHAN-MEETING-14-SEP-2026.md).
> - **Sedang** — fitur ada dan berjalan, tetapi belum diketahui apakah dipakai/dibutuhkan bisnis.
> - **Rendah** — hanya dugaan dari data contoh, template, atau nama menu.
>
> Kolom terakhir berisi pertanyaan untuk pengguna. Prioritas pertanyaan (🔴/🟡/🟢) ada di [MEETING_KIT.md](MEETING_KIT.md).

---

## 1. Gambaran bisnis

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Jenis usaha | Alur pengambilan: PO pelanggan → PO supplier → truk pelanggan mengambil di supplier, ditimbang per truk; data contoh material curah (Ton/M3) | Trading: barang utama batu split dalam ton, diambil truk pelanggan di supplier (dikonfirmasi, [11 §1–2](11-KEBUTUHAN-MEETING-14-SEP-2026.md)) | Tinggi | Daftar barang lengkap dan satuannya — **REQUIRES USER CONFIRMATION** |
| Skala transaksi | Tidak ada data riil | Usaha kecil–menengah | Rendah | Ya — kira-kira berapa pesanan, faktur, dan pengiriman per bulan |
| Sistem yang dipakai sekarang | Ada impor Excel dan status bergaya Accurate Online | Bisnis mungkin memakai Excel, catatan manual, atau software akuntansi lain | Rendah | Ya — apa yang dipakai hari ini dan data apa yang perlu dipindahkan |
| Lokasi & perangkat | Aplikasi web + PWA, mode lokal atau cloud | Dipakai di kantor, mungkin juga di HP | Rendah | Ya — berapa komputer/HP, perlu akses dari luar kantor? |
| Tanggal mulai memakai sistem | Saldo awal lewat impor Excel / Jurnal Umum | Perlu tanggal *cut-off* yang jelas | Tinggi (kebutuhan teknis) | Ya — mulai tanggal berapa, saldo awal dari mana |

## 2. Penjualan

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Penawaran harga | Penawaran → diterima/ditolak → konversi ke SO | Sebagian pelanggan meminta penawaran tertulis | Sedang | Apakah penawaran tertulis dipakai? Berapa lama berlaku? |
| Pesanan penjualan (SO) | Titik awal alur dokumen; status diubah manual | Semua penjualan dicatat sebagai pesanan | Sedang | Apakah ada penjualan langsung/tunai tanpa pesanan? |
| Pengiriman | Stok gudang: Surat Jalan dari SO, kirim sebagian, bagi muatan per truk; **stok berkurang lewat status SO**. Pengambilan: surat jalan per truk dibuat sekaligus saat PO supplier dibuka (⌈jumlah ÷ 35⌉), truk ditimbang, kuota dan batas akhir bulan | Pesanan diambil bertahap ±35 ton per truk sampai ±1 bulan (dikonfirmasi untuk pengambilan) | Tinggi (pengambilan) / Sedang (stok gudang) | Format rekap Excel dari timbangan supplier — **REQUIRES USER CONFIRMATION**. Untuk penjualan dari stok: stok seharusnya berkurang saat surat jalan? |
| Penagihan | Stok gudang: 1 faktur dari 1 SO terkirim. Pengambilan: **Tagih Pelanggan** menggabungkan truk satu pelanggan dalam satu periode menjadi satu faktur; truk tidak bisa ditagih dua kali | Pengambilan ditagih per periode (umumnya mingguan), tidak menunggu PO selesai (dikonfirmasi) | Tinggi (pengambilan) / Sedang (stok gudang) | Untuk penjualan dari stok: faktur per pengiriman, per pesanan, atau rekap bulanan? |
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
| Purchase Order | PO dengan harga dari daftar harga supplier; PO pengambilan berisi satu barang dan dipasangkan dengan PO pelanggan | PO ke supplier mengikuti PO pelanggan dengan jumlah sama (dikonfirmasi) | Tinggi | Siapa menyetujui PO? Apakah PO pelanggan juga berakhir saat cut-off — **REQUIRES USER CONFIRMATION** |
| Harga beli | Harga Supplier dengan tanggal berlaku; dipakai otomatis sebagai harga beli tiap pengambilan, selisih dengan harga PO ditandai | Supplier bisa mengubah harga di tengah PO (dikonfirmasi) | Tinggi | — |
| Penerimaan barang | Stok gudang: status PO *Diterima* atau menu *Penerimaan Barang* dengan timbangan (bruto/tara/netto), Rekonsiliasi Timbangan, faktur per penerimaan. Pengambilan: Catat Pengambilan / Impor Rekap Timbangan | Pengambilan dicatat per truk dari rekap timbangan supplier | Sedang | Untuk barang stok: siapa mencatat di gudang? |
| Faktur & pembayaran supplier | Faktur dari PO diterima atau per penerimaan; untuk pengambilan, **Tagihan Supplier** membandingkan tonase & harga tagihan dengan truk kita sebelum faktur disimpan; Validasi SJ Supplier untuk penerimaan gudang | Tagihan supplier per periode, selisih harus terdeteksi (dikonfirmasi) | Tinggi | Termin supplier? Siapa yang membayar dan kapan? |
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
| Bagan akun | 22 akun bawaan, belum bisa diedit dari tampilan | Perlu disesuaikan dengan akun perusahaan | Rendah | Sudah punya bagan akun sendiri? |
| Rekening kas & bank | Kas, Bank BCA, Bank Mandiri; Rekening Koran dan Rekonsiliasi Bank membandingkan saldo rekening koran dengan buku besar; biaya admin/transfer, pajak bunga, dan bunga dicatat langsung dari baris rekening koran | Selisih saldo biasanya dari biaya bank dan bunga yang belum dicatat (dikonfirmasi) | Sedang | Rekening apa saja yang aktif? |
| Biaya operasional | Pengeluaran Lain dengan kategori siap pakai (termasuk ATK, Entertain, Transportasi, Biaya Bank, Reimbursement) dan akun beban, otomatis dijurnal; rekap per kategori per bulan + ekspor Excel; kartu Biaya Operasional di Entri Harian. Biaya Akrual untuk biaya yang belum dibayar | Admin mencatat langsung di aplikasi dengan kategori; rekap dikirim ke akuntan (dikonfirmasi) | Tinggi | Pemetaan kategori → akun — **REQUIRES USER CONFIRMATION** ([04 §6](04-AKUNTANSI.md)) |
| Penggajian | Gaji pokok + tunjangan, tanpa potongan | Tidak diketahui | Rendah | Gaji dikelola di sistem ini atau terpisah? |
| Aset tetap | Daftar aset tanpa penyusutan | Tidak diketahui | Rendah | Perlu penyusutan otomatis? Aset apa (truk, alat berat)? |
| Anggaran | Anggaran per akun per bulan + realisasi | Tidak diketahui | Rendah | Dipakai? |
| Tutup buku | Kunci periode; tidak ada jurnal penutup | Laporan bulanan dikunci setelah final | Sedang | Tutup buku bulanan? Siapa yang mengunci? |
| Koreksi transaksi | Lihat [05](05-SIKLUS-STATUS-DAN-KOREKSI.md) | Dokumen berefek dibatalkan, bukan dihapus | Sedang | Siapa boleh membatalkan? Perlu persetujuan? |

## 6. Pajak

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Status PKP & PPN | PPN 11% opsional per dokumen; pengaturan PKP & NPWP | Sebagian transaksi kena PPN | Sedang | Perusahaan PKP? Semua penjualan kena PPN? |
| Faktur pajak / Coretax | **Ekspor Coretax**: XML faktur pajak keluaran per masa pajak dari faktur penjualan, diimpor manual di Coretax; nomor faktur pajak bisa dicatat kembali | Data yang sama dipakai untuk Coretax; admin tidak membuat faktur pajak dari nol (dikonfirmasi) | Sedang | Uji impor pertama di Coretax; kode barang & satuan Coretax — **REQUIRES USER CONFIRMATION** |
| Laporan pajak | Rekap PPN dari dokumen yang diposting (T-11 diperbaiki); pengambilan masuk rekap setelah ditagih | Dibutuhkan untuk rekap bulanan | Sedang | Format rekap yang dibutuhkan konsultan pajak? |

## 7. Laporan

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Laporan keuangan | Laba Rugi, Neraca, Arus Kas | Pemilik perlu laba dan posisi kas | Sedang | Laporan apa yang dilihat rutin? Untuk bank/pajak/internal? |
| Laporan operasional | Umur piutang, kartu stok, kartu piutang/hutang, rekap SO/PO, Rekap Pengambilan, Laporan per Periode (termasuk pengambilan) | Rekap pengambilan per PO per bulan/3 bulan dipakai memantau performa (dikonfirmasi) | Sedang | Laporan apa yang paling sering dicari? |
| Dashboard | Kas & bank, piutang/hutang, laba kotor, alur pengambilan, tagihan per pelanggan (belum ditagih / belum lunas / lewat jatuh tempo), PO pengambilan berjalan, tonase per bulan, perlu tindakan | Pemilik ingin melihat yang sudah/belum ditagih dan dibayar (dikonfirmasi) | Sedang | Urutan prioritas blok — **REQUIRES USER CONFIRMATION** |
| Ekspor & cetak | Excel, CSV, cetak SO/PO/Surat Jalan/faktur, ekspor rekap pengambilan untuk pelanggan, Arsip Excel per tahun | Format surat jalan dan invoice mengikuti format perusahaan | Sedang | Contoh format surat jalan dan invoice perusahaan — **REQUIRES USER CONFIRMATION** |

## 8. Pengguna, hak akses, dan kontrol

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Pengguna | 4 akun contoh, semuanya admin | Beberapa staf memakai sistem | Rendah | Siapa saja penggunanya dan apa tugasnya? |
| Peran | Admin, Manajer, Akunting, Penjualan, Viewer | Pembagian tugas kantor | Sedang | Apakah peran ini cocok? Ada peran gudang? |
| Akses per pengguna | **Akses menu**: admin mempersempit grup menu yang boleh dibuka tiap pengguna (tidak bisa melebihi perannya) | Pengguna berbeda membuka fitur berbeda (dikonfirmasi) | Tinggi | Siapa pengguna dan fitur yang boleh dibuka masing-masing; pengeluaran mana yang harus disembunyikan — **REQUIRES USER CONFIRMATION** |
| Persetujuan (approval) | Tidak ada | Tidak diketahui | Rendah | Perlu persetujuan untuk PO, diskon, pembatalan? |
| Jejak audit | Log audit perubahan data | Berguna untuk kontrol internal | Sedang | Perlu ditinjau rutin? |
| Keamanan login | Password, 2FA opsional | Tidak diketahui | Sedang | Wajib 2FA untuk admin? |

## 9. Operasional sistem

| Area | Sistem saat ini | Pemahaman kami | Keyakinan | Perlu konfirmasi user |
|---|---|---|---|---|
| Penyimpanan data | Lokal (satu perangkat) atau cloud (Firebase) | Tergantung jumlah perangkat | Rendah | Data harus bisa diakses dari beberapa perangkat? |
| Backup | Ekspor file (lokal) / backup harian otomatis (cloud); **Arsip Excel** per tahun untuk disimpan di hard disk | Data disimpan selamanya, bisa diarsipkan (dikonfirmasi) | Sedang | Siapa yang bertanggung jawab atas backup? |
| Integrasi | API baca-saja siap pakai | Tidak diketahui | Rendah | Ada sistem lain yang perlu terhubung (marketplace, bank, pajak)? |
| Bahasa | Indonesia (ada tombol Inggris) | Pengguna berbahasa Indonesia | Tinggi | — |
| Keterbacaan | Ukuran teks Normal / Besar / Sangat besar per perangkat, bawaan Besar | Huruf agak besar dan mudah dibaca, terutama di komputer kantor (dikonfirmasi) | Tinggi | — |

---

## 10. Fitur yang mungkin tidak dibutuhkan — **tetap dipertahankan**

Fitur di bawah ada di aplikasi, tetapi belum ada bukti bahwa bisnis membutuhkannya. Pada tahap ini **tidak ada yang dihapus**: fitur tetap tersedia. **Akses menu** per pengguna sudah bisa menyembunyikan satu kelompok modul utuh (mis. Aset Tetap); menyembunyikan menu satuan di dalam kelompok (mis. Anggaran saja, tanpa Kas & Bank) belum tersedia.

| Fitur | Mengapa mungkin tidak dibutuhkan | Mengapa dipertahankan sekarang | Pertanyaan |
|---|---|---|---|
| Anggaran, Realisasi Anggaran, Transfer Anggaran | Usaha kecil–menengah jarang menyusun anggaran per akun | Membaca buku besar, tidak mengganggu transaksi | F12 |
| Penggajian | Gaji sering diurus terpisah (Excel/konsultan) | Sudah terhubung ke jurnal | F10 |
| Aset Tetap (kategori, golongan fiskal, mutasi, pelepasan, riwayat) | Tanpa penyusutan, fungsinya hanya daftar | Berguna bila truk/alat berat perlu dicatat | F11 |
| Job Costing, Permintaan Barang | Tidak ada tanda pekerjaan proyek/permintaan internal | Pencatatan saja, tanpa efek | I7 |
| Target Penjualan | Tidak diketahui apakah ada target tim | Pencatatan saja | S12 |
| Uang Muka Penjualan/Pembelian | Tergantung kebiasaan pembayaran | Dibutuhkan bila ada DP | S11, P5 |
| Penawaran Penjualan/Pembelian | Pesanan mungkin langsung tanpa penawaran tertulis | Konversi ke pesanan menghemat input | S6 |
| Rekening Koran & Rekonsiliasi Bank | Input manual, belum otomatis | Kontrol kas bulanan; selisih saldo dengan buku besar terlihat dan biaya/bunga bank bisa dicatat langsung | F3 |
| Kalender, Metode Pengiriman, Kategori Penjualan, Kontak | Data pendukung yang jarang dipakai | Tidak mengganggu | — |
| Transaksi Favorit | Belum jelas pemakaiannya | Tidak mengganggu | — |
| Mata Uang | Transaksi hanya Rupiah | Pengaturan saja; tidak ditampilkan di menu | **REQUIRES USER CONFIRMATION** |
| SmartLink e-Banking | Belum ada koneksi bank nyata | Formulir konfigurasi; tidak ditampilkan di menu | — |
| e-Faktur format lama, Kirim Faktur Pajak via Email | Format lama digantikan Ekspor Coretax; email tidak benar-benar terkirim | Format lama: tombol CSV di halaman Ekspor Coretax; email: tetap di kode, tidak ditampilkan di menu | F8 |
| Analisis bisnis berbasis aturan ("AI Analysis") | Bukan AI; angka perlu diperbaiki | Tetap di kode; tidak ditampilkan di menu | R1 |
