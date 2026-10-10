# 14 — Pertanyaan untuk Pemilik

> **Tujuan:** daftar keputusan dan bahan yang masih ditunggu dari pemilik usaha setelah meeting 14 September 2026. Aplikasi sudah berjalan dengan pilihan bawaan; jawaban di sini menentukan apakah pilihan itu dipertahankan atau diubah.
>
> **Cara pakai:** tanyakan bagian A dan B lebih dulu. Setiap pertanyaan menyebut **yang dilakukan aplikasi sekarang**, jadi bila pemilik setuju cukup dicentang ✅. Kolom *Jawaban* diisi saat meeting.
>
> Dokumen terkait: [11 Kebutuhan Meeting](11-KEBUTUHAN-MEETING-14-SEP-2026.md) · [13 Kotak Masuk Rekap](13-SIMULASI-EMAIL-DAN-CV.md) · [08 Temuan Teknis](08-TEMUAN-TEKNIS.md) · [12 Keamanan & Infrastruktur](12-KEAMANAN-DAN-INFRASTRUKTUR.md)

---

## A. Keputusan yang mengubah cara aplikasi bekerja

| No | Pertanyaan | Kenapa ditanyakan | Yang dilakukan aplikasi sekarang | Pilihan | Jawaban |
|---|---|---|---|---|---|
| A1 | Pembayaran dari pelanggan (dan ke supplier) dicatat **per faktur** atau **per PO**? Siapa yang mencatat? | Ada dua tempat mencatat pembayaran. Bila uang yang sama dicatat di keduanya, kas tercatat dua kali (T-06) | Keduanya tersedia. Kedua dialog menampilkan pembayaran yang sudah tercatat di tempat lain dan sisa tagihan gabungan, lalu meminta konfirmasi bila jumlah melebihi sisa | a) Per faktur saja (disarankan untuk pengambilan, karena faktur dibuat per minggu) · b) Per PO saja · c) Keduanya tetap ada | |
| A2 | PPN atas pengambilan diakui **saat truk mengambil** atau **saat ditagih** (faktur dibuat)? | Menentukan kapan PPN Keluaran muncul di buku besar dan di Rekap PPN/Coretax | Buku besar mencatat PPN saat diambil; Rekap PPN dan Coretax baru menghitungnya saat difakturkan | a) Saat diambil · b) Saat ditagih | |
| A3 | Saat cut-off akhir bulan, **PO pelanggan** ikut selesai, atau tetap berjalan dan sisanya diambil lewat PO supplier baru bulan berikutnya? | Menentukan apakah sisa tonase pelanggan dibawa ke bulan berikutnya | PO supplier ditutup saat cut-off; PO pelanggan tetap berjalan sampai jumlahnya terpenuhi | a) PO pelanggan tetap berjalan · b) PO pelanggan ikut selesai | |
| A4 | Apakah perusahaan **menyimpan stok di gudang sendiri**? Bila ya, harga pokok dihitung dengan **rata-rata** atau **FIFO** (atau sesuai akuntan)? | Pengambilan langsung dari supplier tidak memakai stok; metode ini hanya untuk barang yang lewat gudang (T-44) | Rata-rata bergerak; retur dan faktur tanpa PO memakai harga beli terakhir | a) Tidak ada stok gudang · b) Rata-rata · c) FIFO | |
| A5 | **Siapa saja penggunanya**, dan menu apa yang boleh dibuka masing-masing? | Pemilik ingin pengguna A hanya membuka sebagian fitur, dan keuntungan hanya dilihat level di atasnya | Admin sistem membatasi menu per pengguna (**Akses menu**). Angka Kas & bank dan Laba kotor di Ringkasan hanya tampil bagi pengguna yang boleh membuka Akuntansi/Laporan | Isi tabel di bagian E | |
| A6 | Pengeluaran apa yang **tidak boleh dilihat** admin? | Di meeting disebut admin tidak perlu melihat semua pengeluaran | Pembatasan per grup menu (seluruh Kas & Bank), belum per kategori pengeluaran | a) Cukup per menu · b) Perlu per kategori (sebutkan kategorinya) | |
| A7 | **Rekap PPN** boleh dilihat staf penjualan? | Rekap PPN sekarang ikut hak akses menu Pajak | Staf penjualan tidak lagi melihat angka PPN per masa | a) Tidak perlu · b) Perlu | |
| A8 | Menu yang **tidak dipakai** (mis. Aset Tetap, Anggaran, Job Costing, Penggajian, Validasi SJ Supplier untuk penerimaan gudang) disembunyikan? | Mengurangi menu yang membingungkan; fitur tidak dihapus | Semua tetap tampil sesuai peran | Centang menu yang disembunyikan | |

## B. Kotak Masuk Rekap (email dan baca foto DO)

Dasar: di meeting disebut foto DO/surat jalan dan rekap Excel dikirim supplier lewat **email** dengan format subjek tertentu. Simulasinya sudah ada di aplikasi ([13](13-SIMULASI-EMAIL-DAN-CV.md)).

| No | Pertanyaan | Kenapa ditanyakan | Jawaban |
|---|---|---|---|
| B1 | Email supplier saat ini masuk ke **alamat email siapa**? Boleh dibuat alamat khusus rekap, atau diteruskan otomatis ke alamat itu? | Aplikasi perlu membaca email dari satu alamat | |
| B2 | Boleh minta **contoh email** dari bagian timbangan (subjek, isi, lampiran)? | Format subjek dipakai untuk mengenali email rekap | |
| B3 | Apakah **DO supplier mencantumkan nomor surat jalan kita** atau nomor PO kita? | Bila tidak, pencocokan memakai tanggal + no. polisi | |
| B4 | Kira-kira **berapa foto DO per bulan**? Siapa yang menanggung **biaya layanan baca foto** (AI)? | Biaya dihitung per foto | |
| B5 | Bila angka rekap berbeda dari foto DO, **siapa yang memutuskan** angka yang dipakai? Perlu persetujuan pemilik bila truknya sudah ditagih? | Menentukan hak akses di Kotak Masuk Rekap | |
| B6 | Mana yang dijadikan patokan bila berbeda: **DO supplier** atau **surat jalan kita**? | Di meeting disepakati DO sebagai bukti utama — mohon dikonfirmasi | |

## C. Bahan yang perlu dikirim

| No | Bahan | Untuk apa | Sudah diterima? |
|---|---|---|---|
| C1 | Contoh **rekap Excel asli** dari bagian timbangan | Memastikan Impor Rekap Timbangan dan Kotak Masuk Rekap membaca kolom yang benar | |
| C2 | Contoh **foto DO supplier** (beberapa, termasuk yang kurang jelas) | Menguji pembacaan foto | |
| C3 | Contoh **surat jalan, PO, dan invoice** perusahaan | Template cetak mengikuti format perusahaan | |
| C4 | **Daftar barang dan satuan**, termasuk kode barang untuk Coretax | Data barang dan ekspor Coretax | |
| C5 | **Rekening bank** yang aktif dan, bila ada, **daftar akun** dari akuntan | Akun kas/bank dan bagan akun | |
| C6 | **NPWP** dan status **PKP** perusahaan | Faktur pajak dan Coretax | |
| C7 | **Tanggal mulai** memakai aplikasi dan **saldo awal** (piutang, hutang, kas/bank per tanggal itu) | Saldo pembuka | |
| C8 | Data contoh **berformat sama** dengan data perusahaan untuk uji coba | Pemilik ingin mencoba sistem sebelum memutuskan | |

## D. Pilihan bawaan — cukup dikonfirmasi

| No | Topik | Pilihan bawaan saat ini | ✅ / Ubah menjadi |
|---|---|---|---|
| D1 | Kapasitas truk | 35 ton per surat jalan (bisa diubah per PO) | |
| D2 | Truk terakhir | Mengambil sisa kuota; melebihi kuota harus dikonfirmasi | |
| D3 | Rekap timbangan yang datang setelah cut-off | PO dibuka kembali untuk mengimpor pengambilan sebelum cut-off, lalu tertutup lagi | |
| D4 | Periode faktur pelanggan | Mingguan (Senin–Minggu), dipotong di akhir bulan | |
| D5 | Pengambilan belum ditagih | Peringatan bila belum ditagih lebih dari 7 hari | |
| D6 | Tagihan supplier | Dicatat dengan harga pengambilan (setelah koreksi); no. faktur supplier dan tonase wajib diisi | |
| D7 | PPN berbeda dalam satu faktur | Satu faktur pelanggan tidak menggabungkan PO dengan pengaturan PPN berbeda | |
| D8 | Akun biaya | Semua kategori pengeluaran (kecuali Gaji dan Biaya Bank) masuk satu akun Beban Operasional Lain; akuntan mungkin ingin akun terpisah | |
| D9 | Reimbursement | Dicatat saat dibayar | |
| D10 | Ukuran teks | Bawaan "Normal"; tiap pengguna bisa memilih Besar atau Sangat besar di menu pengguna (pemilik minta huruf agak besar — cukup dengan pilihan ini, atau bawaannya dijadikan Besar?) | |
| D11 | Foto DO kurang jelas | Dianggap kurang jelas bila keyakinan baca di bawah 80% | |

## E. Pengguna dan akses

| Nama / jabatan | Bekerja dari (kantor, rumah, lapangan) | Perangkat (PC, laptop, HP) | Menu yang boleh dibuka | Boleh melihat keuntungan? |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

## F. Infrastruktur dan komersial

| No | Pertanyaan | Catatan | Jawaban |
|---|---|---|---|
| F1 | Data disimpan di **cloud** (bisa dibuka dari mana saja) atau di **satu komputer kantor**? | Staf tidak bekerja di satu tempat; lihat [12](12-KEAMANAN-DAN-INFRASTRUKTUR.md) | |
| F2 | Akun Google yang dipakai untuk penyimpanan cloud: **akun milik perusahaan** yang dipegang pemilik? | Agar akses data ada di tangan perusahaan | |
| F3 | Perlu **perjanjian kerahasiaan (NDA)** tertulis dengan pengembang? | Dibahas di meeting; dokumen hukum di luar aplikasi | |
| F4 | Batas anggaran bulanan biaya server yang masih wajar? | Dipakai untuk memasang peringatan biaya | |
| F5 | Penawaran harga, biaya pemeliharaan, dan cara menghitung perubahan fitur | Keputusan bisnis, bukan bagian aplikasi | |
| F6 | Target waktu mulai uji coba dan mulai pakai penuh | | |
