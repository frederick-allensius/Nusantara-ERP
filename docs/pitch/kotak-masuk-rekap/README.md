# Bahan Demo — Kotak Masuk Rekap

Gambar dan file contoh untuk memperagakan alur rekap timbangan dari email dan pembacaan foto DO ([dokumen 13](../../13-SIMULASI-EMAIL-DAN-CV.md)). Semua nama perusahaan, nomor, dan angka adalah **data contoh**, bukan data perusahaan.

## Tangkapan layar (urutan demo)

| File | Isi |
|---|---|
| `01-kotak-masuk.png` | Dua email rekap dari bagian timbangan supplier di kotak masuk |
| `02-memeriksa.png` | Email dibuka, pemeriksaan otomatis berjalan |
| `03-email-cocok-hasil.png` | Email pertama: semua baris cocok, siap dicatat |
| `04-konfirmasi-catat.png` | Konfirmasi sebelum mencatat |
| `05-sudah-dicatat.png` | Setelah dicatat |
| `06-po-dengan-foto-do.png` | Detail PO: truk sudah tercatat beserta **Foto DO** |
| `07-email-bermasalah.png` | Email kedua: rekap kumulatif dengan beberapa masalah |
| `08-hasil-bermasalah.png` | Berat lama diubah (30 → 35 versi demo), rekap ≠ foto, foto kurang jelas, tanpa foto |
| `09-foto-do-terbaca.png` | Foto DO dengan kotak di bagian yang dibaca dan tingkat keyakinannya |
| `10-foto-do-kurang-jelas.png` | Foto DO yang angkanya tertutup bayangan: keyakinan rendah, ditandai oranye |
| `11-keputusan.png` | Keputusan per baris: pakai angka foto, pakai angka rekap, tunda |
| `12-balas-supplier.png` | Draf balasan otomatis ke supplier |
| `13-riwayat.png` | Hasil akhir dan riwayat email |

## File contoh

| File | Isi |
|---|---|
| `contoh-foto-DO-*.jpg` | Foto DO supplier buatan aplikasi (dummy). `…-19.jpg` adalah contoh foto kurang jelas |
| `contoh-rekap-timbangan-supplier.xlsx` | Rekap Excel yang menyertai email kedua; bisa juga dicoba di **Impor Rekap Timbangan** |

Foto dan rekap dibuat ulang dari data contoh setiap kali **Periksa email** ditekan, jadi angkanya bisa berbeda dari file di sini.
