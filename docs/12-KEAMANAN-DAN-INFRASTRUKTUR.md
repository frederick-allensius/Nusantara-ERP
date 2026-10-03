# 12 — Keamanan Data, Infrastruktur, dan Perangkat

> Menjawab pertanyaan pemilik pada meeting 14 September 2026: di mana data disimpan, siapa yang bisa mengaksesnya, apa yang terjadi bila server bermasalah, berapa biayanya, dan komputer seperti apa yang dibutuhkan.
> Angka biaya dan kuota adalah perkiraan per Oktober 2026 dan **harus dicek ulang** di halaman harga Firebase sebelum penawaran dibuat.

---

## 1. Pilihan tempat menyimpan data

| | **Cloud (Firebase, Google)** | **Lokal (satu komputer)** |
|---|---|---|
| Cara kerja | Data di server Google; dibuka lewat browser dari komputer/HP mana saja | Data di browser satu komputer (IndexedDB); tanpa internet |
| Cocok bila | Staf bekerja di tempat berbeda — **kondisi perusahaan saat ini** | Hanya satu orang di satu komputer |
| Perlu komputer menyala 24 jam | Tidak | Tidak, tapi data hanya ada di komputer itu |
| Risiko utama | Ketergantungan pada layanan Google dan internet | Komputer rusak/hilang = data hilang bila tidak dicadangkan |
| Rekomendasi | **Disarankan** | Untuk demo atau uji coba |

Aplikasi mendukung keduanya tanpa perubahan program.

## 2. Kepemilikan dan akses data

Kekhawatiran pemilik: data perusahaan hanya boleh diketahui perusahaan; pengembang yang memelihara aplikasi tidak boleh memakai data di luar keperluan perbaikan.

Usulan pengaturan:

1. **Proyek Firebase dibuat atas akun Google milik perusahaan.** Perusahaan menjadi *Owner* proyek dan pembayar tagihan. Aplikasi dan data berada di proyek milik perusahaan, bukan di akun pengembang.
2. **Pengembang tidak memegang password akun Google perusahaan.** Bila perlu memeriksa masalah, pemilik menambahkan email pengembang sebagai anggota proyek (Google Cloud IAM, peran secukupnya) dan **mencabutnya** setelah selesai. Ini menggantikan cara "ganti password setelah setup", yang berisiko lupa password dan tetap memberi akses penuh selama password belum diganti.
3. **Jejak akses tercatat.**
   - Google Cloud mencatat siapa yang mengubah pengaturan proyek (Audit Logs).
   - Aplikasi mencatat login dan perubahan data per pengguna (Log Aktivitas, Log Akses, log audit dengan kunci periode).
4. **Di dalam aplikasi,** setiap pengguna punya peran dan — setelah fitur akses per pengguna selesai — daftar menu yang boleh dibuka. Contoh: admin tidak melihat pengeluaran tertentu. Tersedia verifikasi 2 langkah (2FA) untuk akun penting.
5. **Komitmen tertulis.** Perjanjian kerahasiaan (NDA) antara perusahaan dan pengembang tentang larangan memakai atau membuka data perusahaan — **REQUIRES USER CONFIRMATION** (dokumen hukum, di luar aplikasi).

## 3. Keandalan, cadangan, dan arsip

- **Ketersediaan.** Firestore menyimpan data tereplikasi di beberapa lokasi Google; gangguan layanan jarang terjadi dan biasanya pulih dalam hitungan jam. Tidak ada layanan yang menjamin 0% gangguan.
- **Cadangan otomatis.** Fungsi `nightlyBackup` menyimpan salinan harian di dalam proyek. Untuk perlindungan tambahan, disarankan ekspor terjadwal Firestore ke Cloud Storage (paket Blaze) — **REQUIRES USER CONFIRMATION**.
- **Cadangan di komputer perusahaan.** Menu pengguna → Kelola Backup → unduh file cadangan (JSON) secara berkala (misalnya setiap minggu) ke hard disk perusahaan. File ini bisa dipulihkan ke aplikasi.
- **Arsip jangka panjang.** Data tidak perlu dihapus; data usaha dan pajak disimpan bertahun-tahun. Setelah tutup buku tahunan:
  - unduh cadangan JSON tahun itu;
  - ekspor laporan dan daftar transaksi ke Excel (Laporan, Rekap Pengambilan, Pengeluaran Lain);
  - simpan di hard disk eksternal.

  Penghapusan data lama dari sistem hanya dilakukan bila diputuskan pemilik dan setelah arsip diverifikasi — **REQUIRES USER CONFIRMATION**.

## 4. Biaya server (Firebase)

Aplikasi memakai Cloud Functions untuk login dengan username, 2FA, manajemen pengguna, log akses, dan backup harian. Cloud Functions hanya tersedia di paket **Blaze (bayar sesuai pemakaian)**. Paket Blaze tetap memberi kuota gratis; tagihan muncul hanya bila pemakaian melewati kuota.

| Layanan | Kuota gratis (Spark / bagian gratis Blaze) |
|---|---|
| Firestore — data tersimpan | 1 GiB |
| Firestore — baca dokumen | 50.000 per hari |
| Firestore — tulis dokumen | 20.000 per hari |
| Hosting | 10 GB penyimpanan, 360 MB transfer per hari |
| Authentication | 50.000 pengguna aktif per bulan |
| Cloud Functions, Cloud Storage | Hanya di Blaze |

Perkiraan untuk perusahaan ini:

- **Ukuran data.** ±2–3 truk per PO per hari, beberapa PO berjalan, plus faktur dan pengeluaran. Kira-kira puluhan ribu dokumen per tahun — jauh di bawah 1 GiB.
- **Pembacaan data.** Setiap kali aplikasi dibuka, data dimuat dari server. Saat data sudah beberapa tahun dan beberapa pengguna membuka aplikasi beberapa kali sehari, pembacaan bisa melewati 50.000 per hari. Biaya kelebihannya kecil (sen dolar per 100.000 baca), tetapi perlu dipantau.
- **Saran.** Pasang **batas anggaran dan peringatan biaya** di Google Cloud (Budget alert) saat proyek dibuat. Perkiraan bulanan yang pasti dibuat setelah uji coba dengan data nyata — **REQUIRES USER CONFIRMATION**.

## 5. Spesifikasi perangkat

Aplikasi berjalan di browser; tidak perlu memasang program selain browser.

| Perangkat | Minimal | Disarankan |
|---|---|---|
| Komputer admin | Prosesor 4 inti (setara Intel Core i3 gen 10 / AMD Ryzen 3), RAM 8 GB, SSD, Windows 10/11 | RAM 16 GB bila banyak tab/Excel dibuka bersamaan |
| Layar | 1366×768 | **21–24 inci, 1920×1080**; ukuran teks aplikasi "Besar" |
| Browser | Chrome atau Edge versi terbaru | Sama; aplikasi bisa dipasang sebagai aplikasi desktop (PWA) |
| Internet (mode cloud) | 5 Mbps stabil | 10 Mbps atau lebih |
| HP | Android 10+/iOS 15+ dengan browser terbaru | Untuk melihat data dan mengambil foto tiket timbangan; pekerjaan utama tetap di komputer |
| Cadangan | Hard disk eksternal | Hard disk eksternal + penyimpanan cloud milik perusahaan |

## 6. Keputusan yang dibutuhkan

| No | Keputusan | Pilihan |
|---|---|---|
| 1 | Tempat data | Cloud Firebase (disarankan) / lokal |
| 2 | Akun Google pemilik proyek | Email perusahaan yang dipakai |
| 3 | Siapa yang boleh diberi akses teknis dan kapan | Atas permintaan, dicabut setelah selesai |
| 4 | Jadwal unduh cadangan ke hard disk | Mingguan / bulanan, oleh siapa |
| 5 | Batas anggaran biaya server per bulan | Nominal |
| 6 | NDA dengan pengembang | Ya / tidak |
