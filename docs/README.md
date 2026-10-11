# Dokumentasi Nusantara ERP

Semua dokumen ditulis dalam bahasa Indonesia dan menggambarkan **perilaku aplikasi saat ini** berdasarkan review kode. Kebutuhan bisnis yang belum dikonfirmasi selalu ditandai.

## Mulai dari sini

| Kebutuhan | Buka |
|---|---|
| Menyiapkan meeting dengan pemilik/pengguna | **[MEETING_KIT.md](MEETING_KIT.md)** |
| Memahami sistem dalam 10 menit | [01-RINGKASAN-SISTEM.md](01-RINGKASAN-SISTEM.md) |
| Menjalankan aplikasi | [../QUICK_START.md](../QUICK_START.md) |

## Dokumen produk dan bisnis

| No | Dokumen | Isi |
|---|---|---|
| 01 | [Ringkasan Sistem](01-RINGKASAN-SISTEM.md) | Apa yang dilakukan ERP, model data (master → transaksi → efek → laporan), area fungsi, peran pengguna, mode penyimpanan, batas cakupan |
| 02 | [Peta Modul dan Navigasi](02-PETA-MODUL-DAN-NAVIGASI.md) | Setiap menu dan layarnya, fitur tanpa menu, struktur navigasi baru |
| 03 | [Alur Transaksi](03-ALUR-TRANSAKSI.md) | Alur penjualan, pembelian & pengambilan (trading), dan 13 pertanyaan praktis untuk setiap transaksi |
| 04 | [Akuntansi dan Alur Dokumen](04-AKUNTANSI.md) | Aksi pengguna vs konsekuensi akuntansi, aturan jurnal, bagan akun, HPP, PPN, laporan |
| 05 | [Siklus Status dan Koreksi](05-SIKLUS-STATUS-DAN-KOREKSI.md) | Status dokumen, ubah/hapus/batal, model koreksi transaksi |
| 06 | [Matriks Kebutuhan](06-MATRIKS-KEBUTUHAN.md) | Sistem saat ini vs pemahaman kami vs yang perlu dikonfirmasi; fitur yang mungkin tidak dibutuhkan |
| 07 | [Matriks Kapabilitas dan Perbandingan](07-MATRIKS-KAPABILITAS.md) | Tercakup/Sebagian/Belum ada dibanding ERP pada umumnya; perbandingan untuk non-teknis |
| 08 | [Temuan Teknis](08-TEMUAN-TEKNIS.md) | Masalah yang ditemukan, dampaknya, dan status perbaikan |
| 09 | [Audit UX dan Arah Desain](09-AUDIT-UX.md) | Hambatan pengguna, investigasi tab, dashboard, arah visual |
| 10 | [Glosarium](10-GLOSARIUM.md) | Arti istilah dokumen, akuntansi, pajak, pengambilan, dan sistem |
| 11 | [Kebutuhan yang Dikonfirmasi](11-KEBUTUHAN-MEETING-14-SEP-2026.md) | Kebutuhan pemilik usaha, penyelesaiannya di aplikasi, dan hal yang masih menunggu konfirmasi |
| 12 | [Keamanan dan Infrastruktur](12-KEAMANAN-DAN-INFRASTRUKTUR.md) | Tempat menyimpan data, akses data, cadangan & arsip, perkiraan biaya server, spesifikasi perangkat |
| 13 | [Kotak Masuk Rekap — Simulasi Email dan Baca Foto](13-SIMULASI-EMAIL-DAN-CV.md) | Simulasi rekap timbangan dan foto DO dari email: yang diperagakan, yang nyata, skrip demo, rancangan sistem nyata |
| 14 | [Pertanyaan untuk Pemilik](14-PERTANYAAN-UNTUK-PEMILIK.md) | Keputusan dan bahan yang masih ditunggu dari pemilik, dengan pilihan bawaan aplikasi saat ini |
| 15 | [Contoh Alur 500 Ton](15-CONTOH-ALUR-500-TON.md) | Satu PO 500 ton dari pesanan pelanggan sampai tutup bulan: truk, rekap timbangan, faktur mingguan, selisih berat, harga naik, tagihan supplier, cut-off, dan laporan akhir |

## Dokumen teknis

| Dokumen | Isi |
|---|---|
| [ARSITEKTUR.md](ARSITEKTUR.md) | Cara aplikasi bekerja: boot, data, mesin dokumen/stok/akuntansi, keamanan, pengujian |
| [../PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) | Letak file dan folder |
| [../QUICK_START.md](../QUICK_START.md) | Instalasi dan menjalankan aplikasi (lokal & cloud) |
| [API.md](API.md) | API baca-saja untuk integrasi |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploy ke Firebase (hosting, functions, rules) |

## Materi presentasi

Folder [`pitch/`](pitch/) berisi contoh dokumen cetak, contoh laporan, naskah demo, dan materi penawaran. Materi ini **belum diperbarui** mengikuti dokumentasi di atas; beberapa pernyataan di dalamnya (misalnya hak akses, verifikasi 2 langkah, dan cetak PDF disebut sebagai rencana) sudah tidak sesuai dengan aplikasi saat ini. Gunakan dokumen 01–12 sebagai acuan.

Pengecualian, sudah mengikuti aplikasi saat ini: [`pitch/kotak-masuk-rekap/`](pitch/kotak-masuk-rekap/) (gambar dokumen 13) dan [`pitch/contoh-alur-500-ton/`](pitch/contoh-alur-500-ton/) (gambar dokumen 15), dan [`pitch/contoh-dokumen-supplier/`](pitch/contoh-dokumen-supplier/) (kiriman supplier tiruan: rekap Excel, foto DO/SJ, email; dibuat ulang dengan `tools/sample-docs/generate.py`).

Panduan demo per fitur: [SJ_VALIDATION_DEMO.md](SJ_VALIDATION_DEMO.md) (Validasi SJ Supplier). Urutan demo alur pengambilan ada di [MEETING_KIT.md §7](MEETING_KIT.md).

## Tanda yang dipakai

| Tanda | Arti |
|---|---|
| **REQUIRES USER CONFIRMATION** | Tidak bisa dipastikan dari kode; wajib dikonfirmasi pemilik/pengguna bisnis |
| ✅ / 🟡 / ❓ | Terbukti di aplikasi / dugaan / belum diketahui |
| 🔴 / 🟡 / 🟢 | Prioritas pertanyaan: wajib / sebaiknya / baik untuk diketahui |
| `T-xx` | Kode temuan teknis di [08](08-TEMUAN-TEKNIS.md) |
| `U-xx` | Kode temuan UX di [09](09-AUDIT-UX.md) |

## Peta cepat: pertanyaan → dokumen

| Pertanyaan | Dokumen |
|---|---|
| Apa yang dilakukan sistem? | 01 |
| Modul dan menu apa saja? | 02 |
| Bagaimana alur kerja operasional? | 03 |
| Bagaimana alur pengambilan (PO supplier diambil truk pelanggan)? | 03 §V, 04 §4.5, 11 |
| Bagaimana akuntansinya? | 04 |
| Bagaimana jika transaksi salah? | 05 |
| Mana yang sudah pasti dan mana yang dugaan? | MEETING_KIT §4, 06 |
| Apa yang harus ditanyakan ke pengguna? | MEETING_KIT §5 |
| Fitur apa yang mungkin tidak dibutuhkan? | 06 §10 |
| Apa yang rusak secara teknis? | 08 |
| Seberapa lengkap dibanding ERP lain? | 07 |
