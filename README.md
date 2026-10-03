# Nusantara ERP

Aplikasi ERP berbasis web untuk usaha dagang: **penjualan, pembelian, pengambilan barang di supplier oleh truk pelanggan, persediaan multi-gudang, kas & bank, pajak, dan pembukuan otomatis** (double-entry) lengkap dengan laporan keuangan. Aplikasi bisa berjalan sepenuhnya di satu perangkat tanpa internet, atau tersinkron ke cloud (Firebase) untuk banyak pengguna.

Versi **3.3.0**

---

## Fitur utama

| Area | Yang tersedia |
|---|---|
| Penjualan | Penawaran, pesanan (SO), surat jalan (kirim sebagian, bagi per truk), faktur, penerimaan pembayaran, uang muka, retur |
| Pembelian | Penawaran, purchase order (PO), penerimaan barang dengan timbangan (bruto/tara/netto), rekonsiliasi timbangan, faktur per penerimaan, validasi SJ supplier, faktur, pembayaran, uang muka, retur, harga supplier per tanggal berlaku |
| Pengambilan | PO supplier dibuka untuk diambil truk pelanggan: surat jalan untuk semua truk dibuat sekaligus, catat pengambilan per truk (timbangan, foto tiket), impor rekap timbangan Excel, kuota & batas pengambilan (akhir bulan), perubahan timbangan, rekap pengambilan, tagih pelanggan dan catat tagihan supplier per periode dari pengambilan |
| Persediaan | Multi-gudang, transfer, penyesuaian stok, reservasi, kartu stok, harga pokok rata-rata bergerak |
| Keuangan | Jurnal otomatis dari dokumen, jurnal umum, kas & bank (kategori biaya, rekap per bulan, ekspor Excel, biaya/bunga bank dari rekening koran, rekonsiliasi saldo), biaya akrual, anggaran, penggajian, aset tetap |
| Pajak | PPN otomatis di jurnal, Rekap PPN, ekspor XML faktur pajak keluaran untuk diimpor di Coretax |
| Laporan | Ringkasan (dashboard) dengan alur pengambilan dan tonase per bulan, Laba Rugi, Neraca, Arus Kas, umur piutang/hutang, kartu stok, kartu piutang/hutang, rekap PPN, laporan per periode |
| Kontrol | 5 peran pengguna, akses menu per pengguna, verifikasi 2 langkah, log audit, kunci periode, recycle bin |
| Data | Impor Excel (termasuk saldo awal & stok awal), ekspor Excel/CSV, arsip Excel per tahun, backup file & backup cloud harian |
| Integrasi | API baca-saja `/api/v1` (Firebase Cloud Functions) |
| Perangkat | Responsif, dapat dipasang sebagai aplikasi (PWA), mode offline, ukuran teks dapat diatur |

Status kematangan tiap fitur dan perbaikan yang sedang berjalan: [docs/01-RINGKASAN-SISTEM.md](docs/01-RINGKASAN-SISTEM.md) dan [docs/08-TEMUAN-TEKNIS.md](docs/08-TEMUAN-TEKNIS.md).

---

## Menjalankan aplikasi (mode lokal)

Prasyarat: Node.js 20.19 atau lebih baru.

```bash
npm ci
```

```bash
npm run dev:local
```

Buka `http://localhost:8088/app.html`, lalu masuk dengan akun lokal `admin` / `admin123`. Anda akan diminta mengganti password pada login pertama. Data tersimpan di browser perangkat tersebut (IndexedDB).

Mode cloud (Firebase), build, dan deploy: [QUICK_START.md](QUICK_START.md) dan [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan, memakai Firebase bila `.env` terisi |
| `npm run dev:local` | Server pengembangan mode lokal (tanpa Firebase) |
| `npm run build` | Build produksi ke `dist/` |
| `npm run build:local` | Build mode lokal |
| `npm run preview` | Menjalankan hasil build |
| `npm run test:run` | Menjalankan semua tes sekali |
| `npm run type-check` | Pemeriksaan TypeScript |
| `npm run lint` | Pemeriksaan ESLint |
| `npm run deploy:rules` | Deploy aturan keamanan Firestore |

---

## Dokumentasi

| Dokumen | Untuk |
|---|---|
| [docs/README.md](docs/README.md) | Indeks semua dokumentasi |
| [docs/MEETING_KIT.md](docs/MEETING_KIT.md) | Validasi alur kerja bersama pemilik/pengguna bisnis |
| [QUICK_START.md](QUICK_START.md) | Instalasi & menjalankan aplikasi |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Struktur folder dan file |
| [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) | Arsitektur teknis |

---

## Teknologi

Vite 8 · JavaScript (ES modules + skrip klasik yang digabung saat build) · IndexedDB · Firebase 12 (Auth, Firestore, Cloud Functions — opsional) · Chart.js 4 · Vitest 4 · TypeScript (type-check) · ESLint 10

## Keamanan

- Password di-hash PBKDF2-HMAC-SHA256 (600.000 iterasi); login cloud diverifikasi Cloud Function dengan pembatasan percobaan.
- Verifikasi 2 langkah (TOTP) dengan kode cadangan.
- Hak akses per peran — dapat dipersempit per pengguna lewat **Akses menu** — di tampilan, di lapisan simpan data, dan di aturan Firestore.
- Content-Security-Policy ketat tanpa skrip inline, HSTS, dan header keamanan lain di Firebase Hosting.
- Log audit, kunci periode akuntansi, dan recycle bin.

## Lisensi

Proprietary — tidak untuk didistribusikan.
