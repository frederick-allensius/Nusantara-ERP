# Perubahan sejak `b936455`

> **Sebelum:** `master` di `b936455` — *feat(audit): add server-enforced access log* (5 Agustus 2026).
> **Sesudah:** keadaan aplikasi sekarang (turunan langsung dari `b936455`; isi branch `feat/trading-refactor-pipeline` sudah termasuk). Tes otomatis: 18 → 56 file, **646 tes lulus**.
>
> Dokumen ini membandingkan keadaan aplikasi *sebelum* dan *sesudah*, bukan riwayat commit. Rinciannya ada di folder [`docs/`](docs/README.md). Setiap temuan berkode `T-xx` dijelaskan di [08 Temuan Teknis](docs/08-TEMUAN-TEKNIS.md).

---

## 1. Ringkasan

| Bidang | Sebelum (`b936455`) | Sesudah |
|---|---|---|
| Usaha utama | Penjualan/pembelian dari stok gudang | **Pengambilan (trading)**: PO pelanggan → PO supplier → surat jalan → truk ditimbang di supplier → rekap timbangan → faktur per periode → pembayaran. Penjualan dari gudang tetap ada |
| Akuntansi | Beberapa transaksi tercatat dua kali, sebagian tidak berjurnal sama sekali | Satu jurnal per rantai dokumen, neraca saldo seimbang, saldo piutang/hutang dari satu sumber (`balances.js`) |
| Bahasa | Campuran Inggris–Indonesia | Label menu, layar, dan dokumen berbahasa Indonesia |
| Navigasi | Menu datar, tab halaman | Menu per kelompok dengan langkah alur, satu tempat untuk setiap fitur |
| Tampilan | Tema awal | Tema baru (kanvas biru muda, kartu putih, aksen biru, font Geist, mode gelap), tata letak khusus HP |
| Data demo | Data contoh statis | Generator data demo yang konsisten dengan aturan aplikasi |
| Dokumentasi | Rencana dan spesifikasi awal | `docs/01–15` berbahasa Indonesia, mengikuti kode |

---

## 2. Modul baru: Pengambilan (trading)

Menu **Pengambilan** untuk barang yang diambil truk pelanggan langsung di supplier ([03 §V](docs/03-ALUR-TRANSAKSI.md#v-pengambilan-trading), [11](docs/11-KEBUTUHAN-MEETING-14-SEP-2026.md)).

- **PO Pengambilan:** PO supplier dipasangkan dengan PO pelanggan. Surat jalan dibuat otomatis (jumlah ÷ kapasitas truk, bawaan 35 ton). PO ditutup otomatis saat kuota terpenuhi atau batas pengambilan (cut-off) lewat; bisa juga ditutup manual dan dibuka kembali. Surat jalan bisa dicetak, dibatalkan dengan alasan, dan diekspor ke Excel.
- **Catat Pengambilan:** satu truk dicatat dari HP; netto dihitung otomatis.
- **Impor Rekap Timbangan:** membaca file rekap Excel supplier dalam format aslinya (semua sheet, header dua baris, kg/ton, subtotal harian dilewati). Setiap baris dicocokkan ke surat jalan lewat nomor SJ, DO, truk+tanggal, atau nomor PO. Tujuan yang menyebut lokasi lain ditandai.
- **Kotak Masuk Rekap** *(simulasi)*: email supplier berisi rekap Excel dan foto DO. Per surat jalan dibandingkan foto, Excel, dan data tercatat: Cocok, Perlu diperbarui, Rekap ≠ foto, Berat lama diubah, Foto kurang jelas, dan lain-lain. Balasan ke supplier ikut disiapkan. Integrasi email dan pembacaan foto (CV/OCR) yang sungguhan **belum dibangun**, lihat [13](docs/13-SIMULASI-EMAIL-DAN-CV.md).
- **Perubahan Timbangan:** berat yang berubah setelah ditagih ditandai. Selisihnya ditagih dengan **faktur selisih** tanpa mengubah faktur lama. **Koreksi berat** manual juga tersedia, dengan alasan.
- **Tagih Pelanggan:** satu faktur per periode (misalnya mingguan) dari banyak truk. Faktur yang dibatalkan mengembalikan truknya ke daftar belum ditagih.
- **Tagihan Supplier:** tonase dan harga tagihan supplier dibandingkan dengan pengambilan kita. Selisih wajib diberi alasan. Harga beli mengikuti **Harga Supplier** yang berlaku per tanggal.
- **Rekap Pengambilan** dan **Laporan per Periode:** semua truk per periode, mana yang belum ditagih di tiap sisi, ekspor Excel.
- **Jurnal per truk** sejak truk ditimbang. Faktur kemudian mengambil alih bagian penjualan/pembelian tanpa mencatat dua kali.
- **Nomor dokumen format perusahaan** (Pengaturan Umum → Nomor Dokumen), misalnya `PO-{###}/…/{BULAN-ROMAWI}/{TAHUN}`, reset tahunan atau bulanan.

File utama: `public/classic/core/trading.js`, `pickup-view.js`, `pickup-billing.js`, `recap-inbox.js`, `trading-summary.js`.

---

## 3. Akuntansi dan integritas data

Aturan posting ada di [04 Akuntansi](docs/04-AKUNTANSI.md). Semua temuan di [08](docs/08-TEMUAN-TEKNIS.md) berstatus *Diperbaiki*, kecuali **T-44** (menunggu keputusan metode penilaian persediaan).

- **Tidak ada pencatatan ganda:** pengiriman dan faktur dari SO yang sama (T-01), penerimaan dan faktur dari PO yang sama (T-02), serta uang muka yang diterapkan (T-04) hanya dijurnal sekali.
- **Transaksi yang dulu tanpa jurnal kini berjurnal:** Pengeluaran Lain, Penerimaan Lain, dan Transfer Bank (T-08). Faktur membawa PPN dari pesanannya (T-03).
- **Satu sumber saldo:** `public/classic/core/balances.js` menghitung sisa tagihan, umur piutang/hutang, jatuh tempo, dan status untuk semua layar (T-09).
- **Stok:** semua mutasi lewat modul gudang, sehingga stok per gudang dan total selalu sama (T-05, T-07). Kuantitas desimal didukung (T-25).
- **Pembatalan dan koreksi:** status Dibatalkan dan jalur pembatalan untuk pesanan, faktur, pembayaran, retur, penerimaan, dan penyesuaian ([05](docs/05-SIKLUS-STATUS-DAN-KOREKSI.md)). Ada juga kunci periode.
- **Pembayaran per faktur** (keputusan A1). Uang yang diterima sebelum faktur dicatat sebagai uang muka.
- **Uang muka pesanan pengambilan** langsung memotong faktur pengambilannya dari yang terlama; sisanya untuk truk berikutnya (T-45).
- **Pelanggan/supplier bernama sama** (satu perusahaan, dua lokasi) dipilih sebagai "Nama · Lokasi". Nama saja ditolak (T-46).
- **Barang yang tidak pernah disimpan di gudang** tidak memunculkan peringatan stok atau reservasi (T-47).
- **Laporan:** Neraca kumulatif (T-13), laporan PPN dari dokumen terposting (T-11), Analisis Bisnis dari buku besar (T-29/T-30).

---

## 4. Fitur lain yang ditambahkan

- **Ringkasan (dashboard)** dibangun ulang dari buku besar dan saldo: Kas & bank, Piutang, Hutang, Laba kotor, corong **Alur transaksi** (Diambil → Ditagih → Dibayar), Perlu tindakan per alur, tren 6 bulan. Kartu angka mengikuti hak akses pengguna.
- **Entri Harian:** layar tugas harian untuk staf input data.
- **Kas & Bank:** rekap pengeluaran per kategori dan periode (ekspor Excel); saldo bank dibandingkan dengan saldo akhir rekening koran; biaya admin dan bunga bank dicatat.
- **Pajak & PPN:** per masa pajak, dan **Ekspor Coretax XML** untuk faktur pajak keluaran.
- **Akses menu per pengguna** (daftar modul yang hanya mempersempit peran) — `functions/user-modules.js`.
- **Arsip Excel** per tahun di Kelola Backup.
- **Ukuran teks** yang bisa diatur (Normal / Besar / Sangat besar).
- **Penerimaan Barang** gudang dengan grid timbangan dan faktur per penerimaan. **Validasi SJ Supplier** untuk mencegah tagihan kurang.
- **Dialog konfirmasi milik aplikasi** menggantikan dialog bawaan browser. **Pemilih tanggal, bulan, dan pilihan** mengikuti tema.

---

## 5. Navigasi dan tampilan

- **Menu** dikelompokkan: Ringkasan · Entri Harian · Pengambilan · Penjualan · Pembelian · Persediaan · Kas & Bank · Akuntansi · Aset Tetap · Laporan · Data Master · Pengaturan. Di Pengambilan, Penjualan, dan Pembelian, langkah alur tampil sebagai rel dengan jumlah yang menunggu ([02](docs/02-PETA-MODUL-DAN-NAVIGASI.md)).
- **Satu tempat untuk setiap fitur:** halaman yang tumpang-tindih digabung. Contohnya Rekening Koran ke Rekonsiliasi Bank, dan Rekap PPN ke Pajak & PPN. Beberapa entri disembunyikan dari menu tetapi tetap bisa dibuka; daftarnya ada di [02 §4](docs/02-PETA-MODUL-DAN-NAVIGASI.md). **Tidak ada fitur yang dihapus.**
- **Dokumen dibuka sebagai tab** di dalam modulnya (`ui/doc-tabs.js`). Tab halaman lama (`ui/view-tabs.js`) dihapus.
- **Tema baru:** kanvas biru muda dengan kartu putih, aksen biru `#4169D7`, font Geist/Geist Mono, dan mode gelap grafit.
- **HP:** daftar tampil sebagai kartu (tanpa geser ke samping), tombol seukuran jempol, paging bersama (`list-pager.js`), tabel menjadi kartu di layar ≤560px.
- **Lebih ringkas:** teks penjelasan, angka berulang, dan tombol dikurangi. Aksi baris dipindah ke menu ⋯. Status ditulis sebagai teks berwarna, dengan satu format tanggal.

---

## 6. Data demo

`src/core/demo-data.js` membuat data demo yang deterministik relatif terhadap tanggal hari ini. Isinya pengambilan sebagai usaha utama (tiga bulan ditambah bulan berjalan), penjualan dan pembelian gudang, Kas & Bank, penggajian, dan jurnal saldo awal. Semua angka mematuhi aturan aplikasi dan diuji di `tests/demo-data.test.ts`. Data yang sudah ada di browser tidak ditimpa; data demo baru muncul pada penyimpanan kosong atau setelah Reset Data ([08 §E](docs/08-TEMUAN-TEKNIS.md#e-data-demo)).

---

## 7. Dokumentasi

- **`docs/01–15`** (berbahasa Indonesia): ringkasan sistem, peta menu, alur transaksi, akuntansi, siklus status, matriks kebutuhan dan kapabilitas, temuan teknis, audit UX, glosarium, kebutuhan meeting 14 September 2026, keamanan dan infrastruktur, simulasi email/CV, **pertanyaan untuk pemilik**, dan contoh alur 500 ton.
- **`docs/pitch/contoh-dokumen-supplier/`:** contoh rekap Excel, foto DO, dan email supplier dalam format asli. **Semua datanya fiktif.**
- **`docs/pitch/contoh-alur-500-ton/`:** tangkapan layar alur 500 ton dari PO sampai tutup bulan. Setiap angkanya diuji di `tests/round-trip-500t.test.ts`.
- Dihapus karena usang: `docs/PLAN_PARITY_NSA.md`, `docs/plans/2026-06-13-…`, `docs/specs/2026-06-13-…`, `.eslintignore`.

---

## 8. Yang perlu diketahui untuk melanjutkan

**Perlu deploy manual** (kode sudah berubah, server belum tentu): `firestore.rules`, Cloud Functions (`functions/`: `user-modules.js`, `auth-users.js`, `auth.js`, `backup.js`), lalu hosting. Langkahnya di [DEPLOYMENT](docs/DEPLOYMENT.md). Service worker sudah `v1.1.24`, sehingga aplikasi yang terpasang mengambil versi baru.

**Menunggu keputusan pemilik:** daftar lengkap ada di [14 Pertanyaan untuk Pemilik](docs/14-PERTANYAAN-UNTUK-PEMILIK.md), misalnya arti kode di nomor PO, aturan cut-off lintas bulan, daftar barang, biaya integrasi email/CV, dan metode penilaian persediaan (T-44). Hal yang belum bisa dipastikan ditandai **REQUIRES USER CONFIRMATION** di dokumen terkait.

**Belum dibangun (sudah didokumentasikan):**
- Integrasi email dan pembacaan foto DO sungguhan; Kotak Masuk Rekap masih simulasi.
- Pembatalan truk yang sudah tercatat (beratnya bisa dikoreksi).
- Layar pengaturan kapasitas truk bawaan.

**Pemeriksaan:**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx vite build
```

**Video walkthrough** (rekaman layar aplikasi dengan data fiktif, disimpan lewat Git LFS — jalankan `git lfs pull` bila yang terunduh hanya file penunjuk):
- [Bagian 1 — Alur Pengambilan](docs/video/Nusantara-ERP-Bagian-1-Alur-Pengambilan.mp4) (11:11): alur pengambilan dari PO sampai tutup bulan, dengan cabang setiap tahap dan empat kasus.
- [Bagian 2 — Biaya, Bank, Pajak, Akses](docs/video/Nusantara-ERP-Bagian-2-Biaya-Bank-Pajak-Akses.mp4) (2:12): Entri Harian, biaya, saldo bank, PPN, akses menu, ukuran teks, arsip.
