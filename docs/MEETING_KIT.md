# Meeting Kit — Validasi Alur Kerja Nusantara ERP

> Dokumen kerja untuk meeting dengan pemilik/pengguna bisnis. Bisa dicetak atau dibuka di laptop. Kolom **Jawaban** sengaja dikosongkan untuk dicatat saat meeting.
>
> Dokumen pendukung: [Ringkasan Sistem](01-RINGKASAN-SISTEM.md) · [Alur Transaksi](03-ALUR-TRANSAKSI.md) · [Akuntansi](04-AKUNTANSI.md) · [Matriks Kebutuhan](06-MATRIKS-KEBUTUHAN.md) · [Matriks Kapabilitas](07-MATRIKS-KAPABILITAS.md)

---

## 1. Tujuan meeting

> **Tujuan meeting ini adalah memastikan sistem mencerminkan alur kerja dan prioritas bisnis yang sebenarnya dari hari ke hari.**

Hasil yang diharapkan di akhir meeting:

1. Alur penjualan, pembelian, stok, dan keuangan yang **benar-benar dijalankan** bisnis sudah dipahami bersama.
2. Pertanyaan bertanda 🔴 terjawab, atau jelas siapa yang akan menjawabnya.
3. Prioritas disepakati: apa yang paling penting untuk dipakai lebih dulu.
4. Langkah berikutnya dan penanggung jawabnya jelas.

Yang **bukan** tujuan meeting ini: menilai sistem lama, memutuskan menghapus fitur, atau membahas detail teknis.

---

## 2. Agenda (± 75 menit)

| Waktu | Bagian | Keterangan |
|---|---|---|
| 5 menit | Pembuka | Naskah §3 |
| 10 menit | Gambaran sistem | Demo singkat §7 — cukup menunjukkan, bukan melatih |
| 45 menit | Pertanyaan per alur | §5 — dahulukan 🔴 |
| 10 menit | Prioritas & keputusan | §6 |
| 5 menit | Penutup | Rangkum, sepakati langkah berikutnya |

Jika waktu hanya 30 menit: pembuka singkat → semua pertanyaan 🔴 → penutup.

---

## 3. Naskah pembuka

### Versi lengkap (± 2 menit)

> "Terima kasih atas waktunya, Bapak/Ibu.
>
> Beberapa waktu terakhir saya sudah meninjau sistem Nusantara ERP secara menyeluruh — mulai dari penjualan, pembelian, stok, sampai pembukuannya. Sistemnya sudah memiliki banyak fungsi. Sebelum kita memfinalkan sistemnya, saya ingin memastikan bahwa saya memahami alur kerja bisnis yang sebenarnya dengan benar.
>
> Jadi hari ini saya lebih banyak ingin mendengar. Tujuannya sederhana: memastikan sistem ini mengikuti cara kerja dan prioritas bisnis sehari-hari.
>
> Saya sudah menyiapkan pertanyaan yang dikelompokkan per alur — penjualan, pembelian, stok, keuangan, laporan, dan pengguna. Tidak ada jawaban yang benar atau salah. Justru kalau ada hal yang di lapangan dilakukan berbeda dari yang tergambar di sistem, itu yang paling penting untuk saya ketahui.
>
> Di akhir, saya akan merangkum apa yang sudah jelas, apa yang masih perlu dipastikan, dan langkah berikutnya. Sebelum mulai, apakah ada hal yang ingin Bapak/Ibu sampaikan lebih dulu?"

### Versi singkat (± 30 detik)

> "Terima kasih waktunya. Saya sudah meninjau sistem yang ada saat ini dan ingin memastikan saya memahami alur kerja bisnis yang sebenarnya dengan benar sebelum kita memfinalkan sistemnya. Saya siapkan beberapa pertanyaan per alur kerja; di akhir akan saya rangkum bersama langkah berikutnya."

### Kalimat bantu selama meeting

| Situasi | Kalimat yang bisa dipakai |
|---|---|
| Pindah topik | "Baik, untuk penjualan sudah cukup jelas. Sekarang saya ingin memahami bagian pembelian." |
| Jawaban berbeda dari sistem | "Terima kasih, ini penting. Saya catat bahwa di lapangan prosesnya … — nanti sistem kita sesuaikan." |
| Fitur tidak dipakai | "Baik, kita catat belum menjadi prioritas. Fiturnya tetap ada dan bisa disembunyikan agar tidak mengganggu." |
| Permintaan fitur baru | "Saya catat sebagai kebutuhan. Nanti saya pelajari dampaknya dan saya sampaikan usulan waktunya." |
| Pengguna tidak tahu jawabannya | "Tidak apa-apa. Siapa yang biasanya menangani bagian ini? Saya bisa menanyakan langsung." |
| Membahas istilah akuntansi | "Singkatnya, sistem mencatat otomatis bahwa uangnya sudah diterima dan tagihan pelanggan berkurang." |
| Menutup | "Dari diskusi hari ini saya catat tiga hal utama: … Saya rangkum dan kirimkan untuk dikonfirmasi." |

**Hindari:** istilah teknis (database, Firestore, reconcile), menyebut sistem "salah/berantakan", menjanjikan tanggal selesai, memutuskan menghapus fitur di tempat.

---

## 4. Pemahaman saat ini

Pemisahan ini penting: hanya bagian **Terkonfirmasi** yang boleh dianggap fakta.

### ✅ Terkonfirmasi (terbukti dari sistem)

1. Sistem mencatat alur penjualan lengkap: penawaran → pesanan (SO) → surat jalan → faktur → penerimaan pembayaran → retur, termasuk uang muka.
2. Sistem mencatat alur pembelian lengkap: penawaran → pesanan (PO) → penerimaan barang → faktur → pembayaran → retur, termasuk uang muka dan harga per supplier.
3. Stok dicatat per gudang dan berubah otomatis saat pesanan dikirim/diterima, penyesuaian stok, retur, dan transfer.
4. Setiap transaksi yang berdampak keuangan **otomatis** membentuk jurnal; Laba Rugi, Neraca, dan Arus Kas disusun dari jurnal tersebut.
5. Harga pokok barang dihitung otomatis dengan rata-rata bergerak.
6. PPN (default 11%) bisa dikenakan per dokumen dan tercatat di jurnal.
7. Surat jalan mendukung pengiriman sebagian dan pembagian muatan per truk.
8. Tersedia 5 peran pengguna, verifikasi 2 langkah, log audit, kunci periode, dan recycle bin.
9. Sistem bisa berjalan di satu perangkat tanpa internet, atau tersinkron di cloud untuk banyak perangkat.
10. Data awal (pesanan, faktur, pembayaran, saldo awal akun, stok awal) bisa diimpor dari Excel.

### 🟡 Diasumsikan (dugaan — perlu dibenarkan)

1. Bisnis memperdagangkan material dalam satuan Ton/M3 kepada pelanggan bisnis (PT, CV, UD, toko).
2. Barang dikirim dengan truk; satu pesanan bisa dikirim bertahap.
3. Pelanggan membayar dengan tempo (sekitar 30 hari), umumnya melalui transfer bank.
4. Perusahaan memungut PPN.
5. Pengguna utama: pemilik/admin, staf akunting, staf penjualan.
6. Pemilik ingin melihat laba, piutang, kas, dan stok secara cepat.
7. Nama pelanggan, supplier, dan barang di sistem adalah **data contoh**, bukan data perusahaan.

### ❓ Belum diketahui

1. Volume transaksi per bulan, jumlah pengguna, jumlah gudang/lokasi.
2. Kapan faktur dibuat dan kapan stok dianggap keluar gudang.
3. Pembagian tugas: siapa membuat pesanan, surat jalan, faktur, mencatat pembayaran.
4. Apakah ada persetujuan (approval) untuk pembelian, diskon, atau pembatalan.
5. Bagan akun dan metode penilaian persediaan yang dipakai akuntan.
6. Proses pajak: pembuatan faktur pajak, pelaporan SPT, PPh.
7. Sistem yang dipakai saat ini, data yang perlu dipindahkan, dan tanggal mulai.
8. Apakah penggajian, aset tetap, anggaran, job costing, dan target penjualan dibutuhkan.
9. Laporan apa yang benar-benar dibaca dan oleh siapa.

---

## 5. Daftar pertanyaan per alur kerja

**Prioritas:**
- 🔴 **Wajib ditanyakan** — jawabannya mengubah cara stok atau pembukuan bekerja, atau menentukan apakah sistem bisa mulai dipakai.
- 🟡 **Sebaiknya ditanyakan** — memengaruhi tampilan, pengaturan awal, atau kemudahan kerja.
- 🟢 **Baik untuk diketahui** — untuk perencanaan berikutnya.

### 5.1 Gambaran bisnis

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| B1 | 🔴 | Bisa diceritakan alur bisnis dari pelanggan memesan sampai uang diterima? | Menjadi acuan semua alur di sistem | |
| B2 | 🔴 | Produk apa saja yang dijual, dan dalam satuan apa? | Menentukan data barang & satuan | |
| B3 | 🔴 | Saat ini transaksi dicatat di mana (Excel, buku, software lain)? Data apa yang perlu dipindahkan? | Menentukan rencana migrasi & saldo awal | |
| B4 | 🔴 | Mulai tanggal berapa sistem ini ingin dipakai penuh? | Menentukan tanggal saldo awal | |
| B5 | 🟡 | Kira-kira berapa pesanan, pengiriman, dan faktur per bulan? | Kapasitas & mode penyimpanan | |
| B6 | 🟡 | Siapa saja yang akan memakai sistem, dan dari perangkat apa (komputer kantor, HP, luar kantor)? | Mode lokal atau cloud | |
| B7 | 🟢 | Apakah ada rencana cabang, gudang, atau lini usaha baru dalam 1–2 tahun? | Perencanaan | |

### 5.2 Penjualan

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| S1 | 🔴 | Apakah setiap penjualan selalu diawali pesanan? Ada penjualan langsung/tunai? | Menentukan titik awal alur | |
| S2 | 🔴 | Kapan faktur dibuat: saat barang dikirim, setelah semua terkirim, atau direkap per periode? | Menentukan kapan pendapatan & piutang dicatat | |
| S3 | 🔴 | Satu pesanan bisa dikirim beberapa kali? Satu faktur bisa mencakup beberapa pengiriman? | Faktur per pengiriman vs gabungan | |
| S4 | 🔴 | Bagaimana pelanggan membayar (tunai, transfer, giro)? Ke rekening mana saja? Sering dicicil? | Akun kas/bank & cara mencatat penerimaan | |
| S5 | 🔴 | Pembayaran pelanggan dicatat per faktur atau per pesanan? Siapa yang mencatat? | Memilih satu jalur pembayaran baku (T-06) | |
| S6 | 🟡 | Apakah ada penawaran harga tertulis sebelum pesanan? | Relevansi menu Penawaran | |
| S7 | 🟡 | Termin pembayaran standar berapa hari? Berbeda per pelanggan? Ada batas kredit? | Jatuh tempo & peringatan | |
| S8 | 🟡 | Harga jual tetap per barang, per pelanggan, atau negosiasi per pesanan? Siapa boleh memberi diskon? | Daftar harga & hak akses | |
| S9 | 🟡 | Ongkos kirim ditagihkan ke pelanggan? Armada sendiri atau ekspedisi? | Baris ongkir, data armada | |
| S10 | 🟡 | Seberapa sering ada retur? Uang dikembalikan atau dipotong dari tagihan? | Alur retur | |
| S11 | 🟢 | Apakah pelanggan sering membayar uang muka? | Relevansi uang muka | |
| S12 | 🟢 | Apakah ada target penjualan untuk tim? | Relevansi target | |

### 5.3 Pembelian

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| P1 | 🔴 | Apakah setiap pembelian memakai PO? Siapa yang memutuskan membeli? | Titik awal alur pembelian | |
| P2 | 🔴 | Barang dari supplier datang sekaligus atau bertahap? Siapa yang mencatat saat barang datang? | Memilih satu cara penerimaan barang (T-07) | |
| P3 | 🔴 | Kapan tagihan supplier diterima dan dicatat? Berapa lama tempo pembayarannya? | Hutang & jatuh tempo | |
| P4 | 🟡 | Harga beli per supplier tetap atau berubah-ubah? | Daftar harga supplier | |
| P5 | 🟡 | Apakah ada pembayaran uang muka ke supplier? | Relevansi uang muka pembelian | |
| P6 | 🟡 | Apakah ada pemotongan PPh 23 saat membayar jasa (mis. sewa angkutan)? | Pajak pembelian | |
| P7 | 🟢 | Apakah pernah mengembalikan barang ke supplier? | Relevansi retur pembelian | |

### 5.4 Persediaan

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| I1 | 🔴 | Kapan stok dianggap berkurang: saat pesanan dikonfirmasi, saat surat jalan dibuat, atau saat barang diterima pelanggan? | Menentukan titik pengurangan stok | |
| I2 | 🔴 | Ada berapa lokasi penyimpanan/gudang? | Pengaturan gudang | |
| I3 | 🔴 | Apakah barang yang sama bisa dijual dalam dua satuan (mis. Ton dan M3)? | Kebutuhan konversi satuan | |
| I4 | 🟡 | Seberapa sering stock opname? Selisih biasanya disebabkan apa? | Alur penyesuaian stok | |
| I5 | 🟡 | Apakah perlu peringatan stok minimum? Siapa yang memantau? | Notifikasi & dashboard | |
| I6 | 🟡 | Apakah stok perlu "dipesan" saat pesanan dikonfirmasi agar tidak terjual ke pelanggan lain? | Reservasi stok | |
| I7 | 🟢 | Apakah ada permintaan barang internal atau pencatatan biaya proyek? | Relevansi Permintaan Barang & Job Costing | |

### 5.5 Keuangan dan akuntansi

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| F1 | 🔴 | Siapa yang mengurus pembukuan: staf internal, akuntan luar, atau konsultan pajak? | Siapa pengguna laporan & tingkat detail | |
| F2 | 🔴 | Apakah sudah ada bagan akun (daftar akun) yang harus dipakai? | Bagan akun di sistem | |
| F3 | 🔴 | Rekening bank dan kas apa saja yang aktif? | Akun kas & bank | |
| F4 | 🔴 | Biaya operasional apa saja yang rutin (gaji, BBM, sewa, listrik, perawatan truk)? Perlu dikelompokkan bagaimana? | Pemetaan kategori biaya → akun | |
| F5 | 🔴 | Apakah perusahaan PKP? Semua penjualan dikenakan PPN? | PPN default | |
| F6 | 🔴 | Jika ada transaksi salah yang sudah tercatat, siapa yang boleh membatalkan atau mengoreksi? | Model koreksi ([05](05-SIKLUS-STATUS-DAN-KOREKSI.md)) | |
| F7 | 🟡 | Setiap berapa lama tutup buku? Apakah bulan yang sudah ditutup perlu dikunci? | Kunci periode | |
| F8 | 🟡 | Siapa yang membuat faktur pajak dan melapor SPT? | Fitur pajak | |
| F9 | 🟡 | Metode penilaian persediaan yang dipakai akuntan (rata-rata, FIFO)? | Harga pokok | |
| F10 | 🟢 | Apakah penggajian dikelola di sistem ini atau terpisah? | Relevansi penggajian | |
| F11 | 🟢 | Apakah aset (truk, alat berat) perlu dicatat beserta penyusutannya? | Relevansi aset tetap | |
| F12 | 🟢 | Apakah ada anggaran biaya per bulan? | Relevansi anggaran | |

### 5.6 Laporan

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| R1 | 🔴 | Angka apa yang paling sering dicek pemilik (setiap hari/minggu)? | Isi dashboard | |
| R2 | 🔴 | Laporan apa yang dibutuhkan setiap bulan, dan untuk siapa (pemilik, bank, pajak)? | Prioritas laporan | |
| R3 | 🟡 | Dokumen apa yang wajib dicetak (pesanan, surat jalan, faktur, kwitansi)? Perlu logo/stempel/tanda tangan? | Template cetak | |
| R4 | 🟡 | Laporan biasanya dibaca di layar, dicetak, atau dikirim dalam Excel? | Format ekspor | |
| R5 | 🟢 | Apakah perlu laporan per pelanggan, per barang, atau per sales? | Laporan tambahan | |

### 5.7 Pengguna dan hak akses

| No | Prioritas | Pertanyaan | Mengapa penting | Jawaban |
|---|---|---|---|---|
| U1 | 🔴 | Siapa saja yang akan memakai sistem dan apa tugas masing-masing? | Akun & peran | |
| U2 | 🔴 | Siapa yang boleh melihat laba dan data keuangan? | Pembatasan akses | |
| U3 | 🟡 | Apakah ada transaksi yang perlu persetujuan atasan (pembelian besar, diskon, pembatalan)? | Kebutuhan approval | |
| U4 | 🟡 | Apakah staf gudang/sopir perlu akses (mis. dari HP)? | Peran tambahan & perangkat | |
| U5 | 🟢 | Apakah perlu ditinjau secara rutin siapa mengubah data apa? | Pemakaian log audit | |

---

## 6. Keputusan yang dibutuhkan

Keputusan ini menentukan perbaikan berikutnya. Sampai diputuskan, sistem memakai perilaku di kolom "Sementara".

| No | Keputusan | Pilihan | Sementara | Terkait |
|---|---|---|---|---|
| K1 | Kapan stok berkurang | (a) status pesanan *Terkirim* · (b) saat surat jalan dibuat/dikirim | (a) | I1 |
| K2 | Dasar penagihan | (a) 1 faktur per pesanan · (b) faktur per pengiriman · (c) faktur gabungan | (a) | S2, S3 |
| K3 | Jalur pencatatan pembayaran pelanggan/supplier | (a) atas faktur · (b) atas pesanan | Keduanya tersedia, dengan peringatan | S5 |
| K4 | Cara mencatat barang datang | (a) status PO *Diterima* · (b) menu Penerimaan Barang | Keduanya, dicegah ganda | P2 |
| K5 | Pemetaan biaya kas & bank ke akun | Usulan di [04 §6](04-AKUNTANSI.md) | Usulan dipakai | F4 |
| K6 | Bagan akun | (a) bawaan · (b) milik perusahaan | (a) | F2 |
| K7 | Wewenang koreksi & pembatalan | Per peran / dengan persetujuan | Admin & manajer | F6, U3 |
| K8 | Penyimpanan data | (a) satu perangkat · (b) cloud multi perangkat | Belum dipilih | B6 |
| K9 | Tanggal mulai & saldo awal | Tanggal + sumber data | — | B3, B4 |
| K10 | Modul yang belum dipakai | Disembunyikan per peran (tidak dihapus) | Semua tampil | F10–F12, I7 |

---

## 7. Demo singkat (10 menit)

Tujuan demo: menyamakan gambaran, **bukan** pelatihan. Gunakan data contoh.

**Persiapan (sebelum meeting):**
1. Jalankan aplikasi mode lokal: `npm run dev:local`, buka `http://localhost:8088/app.html`.
2. Login (akun lokal `admin`, lalu ganti password saat diminta).
3. Pastikan data demo terisi. Data demo dibuat relatif terhadap tanggal hari ini; bila perlu jalankan **Pengaturan → Pengaturan Umum → Reset Data** (menghapus semua data di perangkat itu — hanya untuk instalasi demo).
4. Pilih tema terang, perbesar tampilan browser bila memakai proyektor.

**Urutan tampilan:**

| Langkah | Menu | Yang disampaikan |
|---|---|---|
| 1 | Ringkasan | "Ini ringkasan kas, piutang, hutang, dan yang perlu ditindaklanjuti." |
| 2 | Penjualan → Pesanan Penjualan → buka satu pesanan | "Pesanan pelanggan, isi barang, status, dan jejak dokumennya." |
| 3 | Dari pesanan: Surat Jalan | "Surat jalan untuk sopir; bisa dikirim sebagian." |
| 4 | Penjualan → Faktur Penjualan | "Tagihan ke pelanggan dan status pembayarannya." |
| 5 | Penjualan → Penerimaan Pembayaran | "Pencatatan uang masuk." |
| 6 | Persediaan → Barang & Stok → kartu stok satu barang | "Riwayat keluar-masuk barang." |
| 7 | Laporan → Laba Rugi | "Laporan disusun otomatis dari transaksi." |

Kasus yang sudah tersedia di data demo bila muncul pertanyaan: faktur penjualan dan hutang ke supplier yang lewat jatuh tempo, barang di bawah stok minimum, pesanan yang masih draft, dikonfirmasi, dalam perjalanan, atau dibatalkan, penawaran yang diterima lalu menjadi pesanan, retur sebagian, uang muka, setoran tunai ke bank, dan penggajian bulanan.

Setelah demo, tanyakan: *"Dari yang barusan, bagian mana yang paling mirip dengan cara kerja sekarang, dan bagian mana yang berbeda?"*

---

## 8. Catatan untuk presenter

- Tunjukkan alur, bukan jumlah fitur. Banyaknya menu tidak perlu dijelaskan satu per satu.
- Jika ditanya "apakah bisa …", jawab jujur berdasarkan [07-MATRIKS-KAPABILITAS.md](07-MATRIKS-KAPABILITAS.md): tersedia, sebagian, atau belum ada.
- Temuan perhitungan dan perbaikannya tercatat di [08-TEMUAN-TEKNIS.md](08-TEMUAN-TEKNIS.md); yang masih menunggu keputusan adalah T-06 (jalur pembayaran baku) dan T-44 (metode penilaian persediaan). Semua angka di data demo fiktif — jangan dipakai sebagai contoh angka pajak perusahaan.
- Catat istilah yang dipakai pengguna sendiri (mis. "nota", "DO", "kwitansi") — istilah itu nanti dipakai di aplikasi.

---

## 9. Template notulen

**Tanggal:** ………… **Peserta:** …………

| No | Topik | Keputusan / jawaban | Tindak lanjut | PIC | Tenggat |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

**Pertanyaan yang belum terjawab:**

| No | Pertanyaan | Akan ditanyakan ke | Tenggat |
|---|---|---|---|
| 1 | | | |

**Penutup:**

> "Terima kasih banyak untuk waktunya dan penjelasannya. Dari diskusi hari ini saya catat beberapa hal utama: … Saya akan merangkumnya dalam dokumen dan mengirimkan kembali untuk Bapak/Ibu konfirmasi, lalu menyesuaikan sistem berdasarkan prioritas yang sudah kita sepakati."
