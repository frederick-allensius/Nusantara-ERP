# 15 — Contoh Alur 500 Ton: dari PO Pelanggan sampai Tutup Bulan

Satu contoh lengkap pengambilan barang: pelanggan memesan 500 ton, truk mengambil langsung di supplier selama September, lalu penagihan, pembayaran, tagihan supplier, dan cut-off akhir bulan. Ceritanya mengikuti contoh yang dibahas di meeting 14 Sep 2026 ([11](11-KEBUTUHAN-MEETING-14-SEP-2026.md)).

- Nama perusahaan, nomor polisi, sopir, harga, dan berat adalah **data contoh**.
- Semua angka di dokumen ini diperiksa otomatis oleh `tests/round-trip-500t.test.ts`.
- Gambar ada di [`pitch/contoh-alur-500-ton/`](pitch/contoh-alur-500-ton/), diambil pada 11 Okt 2026. Tanggal transaksinya September, tetapi kolom waktu pencatatan (mis. "Dicatat", "Waktu") menunjukkan 11 Okt 2026.

## 1. Bagian meeting yang dicontohkan

| Di meeting | Menit | Di contoh ini |
|---|---|---|
| PO pelanggan 500 ton → PO ke supplier dengan jumlah sama | 25:04 | Langkah 1 |
| Truk ±35 ton; surat jalan dibuat sekaligus 500 ÷ 35 → 15, bernomor PO | 26:01, 28:04 | Langkah 1 |
| Rekap Excel dari timbangan masuk tanpa input ulang | 32:43 | Langkah 2, 4, 7 |
| Tagih pelanggan seminggu sekali, satu PO beberapa faktur | 34:23 | Langkah 3, 6, 7 |
| Rekap kumulatif; berat lama berubah 30 → 35 padahal sudah ditagih; usul faktur tambahan untuk selisih | 36:59, 39:53, 40:10 | Langkah 4–5 |
| Harga supplier berubah dan lupa diperbarui di faktur beli | 21:47 (catatan tangan) | Langkah 7 |
| Tagihan supplier dicocokkan dengan pengambilan (diambil 100, ditagih 110) | 62:48 | Langkah 9 |
| Cut-off akhir bulan | 29:18 | Langkah 10 |
| Data yang sama sampai ke laporan keuangan | 59:21 | Bagian 4 |

## 2. Data awal

| | |
|---|---|
| Pelanggan | PT Karya Jalan Sentosa (Cikarang), tempo 30 hari |
| Supplier | PT Batu Gunung Perkasa (Purwakarta), tempo 30 hari |
| Barang | Batu Split 1-2 cm, satuan Ton |
| PO pelanggan | SO.2026.09.00101 · 1 Sep · 500 t × Rp155.000 + PPN 11% = Rp86.025.000 · PO pelanggan KJS/PO/0901 |
| PO supplier | PO.2026.09.00101 · 1 Sep · 500 t × Rp120.000 + PPN 11% |
| Harga Supplier | Rp120.000 berlaku 1 Sep; Rp125.000 berlaku 14 Sep (dikabarkan supplier 12 Sep) |
| Kapasitas truk | 35 ton per surat jalan |

## 3. Langkah demi langkah

| # | Tanggal | Kejadian | Di aplikasi | Hasil | Gambar |
|---|---|---|---|---|---|
| 1 | 1 Sep | PO pelanggan masuk, PO ke supplier dibuat | Pengambilan → PO Pengambilan → **PO siap dibuka** | 15 surat jalan `PO.2026.09.00101/01…15`, batas pengambilan 30 Sep | [01](pitch/contoh-alur-500-ton/01-po-pelanggan.png), [02](pitch/contoh-alur-500-ton/02-po-dibuka-15-sj.png) |
| 2 | 2–4 Sep | 5 truk mengambil; timbangan mengirim rekap Excel | **Impor Rekap Timbangan** (atau Kotak Masuk Rekap) | 5 baru dicatat, tidak diketik ulang | [03](pitch/contoh-alur-500-ton/03-rekap-1-ditinjau.png) |
| 3 | Sen 7 Sep | Tagihan minggu 1 (1–6 Sep) | **Tagih Pelanggan** → pilih pelanggan dan periode → Buat Faktur | SI.2026.09.00001: 168,3 t → **Rp28.956.015** | [04](pitch/contoh-alur-500-ton/04-tagih-minggu-1.png) |
| 4 | 8–10 Sep | 5 truk lagi; rekap kumulatif 02–10 Sep. Timbangan mengubah SJ /04 dari 30 menjadi 35 ton, padahal sudah ditagih | Impor Rekap Timbangan | 5 baru, 4 sama, **1 berubah (merah: sudah ditagih)**. Faktur lama tidak diubah | [05](pitch/contoh-alur-500-ton/05-rekap-2-berat-berubah.png), [05b](pitch/contoh-alur-500-ton/05b-rekap-2-baris-berubah.png) |
| 5 | Sen 14 Sep | Selisih 5 ton ditagihkan | **Perubahan Timbangan** → Tagih selisih ke pelanggan | SI.2026.09.00002: 5 t → **Rp860.250**. Peringatan selesai | [06](pitch/contoh-alur-500-ton/06-perubahan-timbangan.png), [07](pitch/contoh-alur-500-ton/07-faktur-selisih.png) |
| 6 | Sen 14 Sep | Tagihan minggu 2 (7–13 Sep) | Tagih Pelanggan | SI.2026.09.00003: 173,5 t → **Rp29.850.675** | — |
| 7 | 12–21 Sep | Harga supplier naik mulai 14 Sep; 3 truk 15–16 Sep; rekap 02–16 Sep; tagihan minggu 3 (14–20 Sep) | Pembelian → **Harga Supplier**; Impor Rekap Timbangan; Tagih Pelanggan | Truk 15–16 Sep otomatis memakai harga beli Rp125.000. SI.2026.09.00004: 104,4 t → **Rp17.962.020** | [08](pitch/contoh-alur-500-ton/08-harga-supplier-naik.png), [09](pitch/contoh-alur-500-ton/09-tagih-minggu-3.png) |
| 8 | 28 Sep | Pelanggan membayar faktur minggu 1 lewat transfer BCA | Faktur Penjualan → faktur → **Catat Penerimaan** | SR.2026.09.00001 Rp28.956.015; faktur **Lunas** | [10](pitch/contoh-alur-500-ton/10-pembayaran-pelanggan.png) |
| 9 | 30 Sep | Supplier menagih **460 t × Rp125.000** (BGP/INV/2609-17) | **Tagihan Supplier** | Aplikasi menunjukkan: pengambilan kita 451,2 t (selisih +8,8 t) dan 10 truk berharga Rp120.000. Dicatat dengan angka pengambilan: PI.2026.09.00001 **Rp60.679.260**, alasan selisih "ditanyakan ke supplier" | [11](pitch/contoh-alur-500-ton/11-tagihan-supplier-selisih.png) |
| 10 | 1 Okt | Lewat batas pengambilan | Otomatis saat PO Pengambilan dibuka | PO supplier **Selesai**; SJ /14 dan /15 dibatalkan; diambil 451,2 dari 500 t, sisa 48,8 t. PO pelanggan tetap berjalan | [12](pitch/contoh-alur-500-ton/12-cut-off-po-selesai.png) |

Gambar akhir bulan: [13 Ringkasan](pitch/contoh-alur-500-ton/13-ringkasan.png) · [14 Laba Rugi](pitch/contoh-alur-500-ton/14-laba-rugi.png) · [15 Neraca Saldo](pitch/contoh-alur-500-ton/15-neraca-saldo.png) · [16 Faktur Penjualan](pitch/contoh-alur-500-ton/16-faktur-penjualan.png) · [17 Rekap Pengambilan](pitch/contoh-alur-500-ton/17-rekap-pengambilan.png)

### Rincian 13 truk

| SJ | Tanggal | No. polisi | Sopir | Bruto | Tara | Netto (t) | Harga beli | Faktur jual |
|---|---|---|---|---:|---:|---:|---:|---|
| /01 | 2 Sep | B 9012 KJS | Asep | 46,7 | 12,2 | 34,5 | 120.000 | SI-00001 |
| /02 | 2 Sep | B 9415 KJS | Dedi | 47,4 | 12,3 | 35,1 | 120.000 | SI-00001 |
| /03 | 3 Sep | B 9012 KJS | Asep | 46,0 | 12,2 | 33,8 | 120.000 | SI-00001 |
| /04 | 3 Sep | B 9733 KJS | Ujang | 42,4 → **47,4** | 12,4 | 30 → **35** | 120.000 | SI-00001 + SI-00002 (selisih) |
| /05 | 4 Sep | B 9415 KJS | Dedi | 47,2 | 12,3 | 34,9 | 120.000 | SI-00001 |
| /06 | 8 Sep | B 9012 KJS | Asep | 47,4 | 12,2 | 35,2 | 120.000 | SI-00003 |
| /07 | 8 Sep | B 9733 KJS | Ujang | 47,0 | 12,4 | 34,6 | 120.000 | SI-00003 |
| /08 | 9 Sep | B 9415 KJS | Dedi | 46,2 | 12,3 | 33,9 | 120.000 | SI-00003 |
| /09 | 10 Sep | B 9012 KJS | Asep | 47,0 | 12,2 | 34,8 | 120.000 | SI-00003 |
| /10 | 10 Sep | B 9733 KJS | Ujang | 47,4 | 12,4 | 35,0 | 120.000 | SI-00003 |
| /11 | 15 Sep | B 9415 KJS | Dedi | 46,7 | 12,3 | 34,4 | **125.000** | SI-00004 |
| /12 | 15 Sep | B 9012 KJS | Asep | 47,5 | 12,2 | 35,3 | **125.000** | SI-00004 |
| /13 | 16 Sep | B 9733 KJS | Ujang | 47,1 | 12,4 | 34,7 | **125.000** | SI-00004 |
| /14, /15 | — | — | — | — | — | — | — | Dibatalkan saat cut-off |
| **Total** | | | | | | **451,2** | | |

Semua truk masuk satu faktur pembelian, PI.2026.09.00001.

## 4. Hasil akhir September

### Faktur

| Faktur | Tanggal | Isi | Ton | DPP | PPN 11% | Total | Status |
|---|---|---|---:|---:|---:|---:|---|
| SI.2026.09.00001 | 7 Sep | SJ /01–/05 | 168,3 | 26.086.500 | 2.869.515 | 28.956.015 | Lunas |
| SI.2026.09.00002 | 14 Sep | Selisih SJ /04 | 5,0 | 775.000 | 85.250 | 860.250 | Belum lunas |
| SI.2026.09.00003 | 14 Sep | SJ /06–/10 | 173,5 | 26.892.500 | 2.958.175 | 29.850.675 | Belum lunas |
| SI.2026.09.00004 | 21 Sep | SJ /11–/13 | 104,4 | 16.182.000 | 1.780.020 | 17.962.020 | Belum lunas |
| **Penjualan** | | | **451,2** | **69.936.000** | **7.692.960** | **77.628.960** | |
| PI.2026.09.00001 | 30 Sep | SJ /01–/13 | 451,2 | 54.666.000 | 6.013.260 | 60.679.260 | Belum dibayar |

DPP pembelian: 346,8 t × 120.000 = 41.616.000 ditambah 104,4 t × 125.000 = 13.050.000.

### Neraca Saldo (seimbang)

| Akun | Debit | Kredit |
|---|---:|---:|
| 110102 Bank BCA | 28.956.015 | |
| 110201 Piutang Usaha | 48.672.945 | |
| 130101 PPN Masukan | 6.013.260 | |
| 210101 Hutang Usaha | | 60.679.260 |
| 210201 PPN Keluaran | | 7.692.960 |
| 400001 Penjualan | | 69.936.000 |
| 510101 Beban Pokok Penjualan | 54.666.000 | |
| **Jumlah** | **138.308.220** | **138.308.220** |

Persediaan nol, karena barang tidak pernah masuk gudang: setiap truk mencatat persediaan masuk dan keluar sekaligus ([04 §4.5](04-AKUNTANSI.md)). Piutang = tiga faktur yang belum lunas (860.250 + 29.850.675 + 17.962.020).

### Laba Rugi

| | Rp |
|---|---:|
| Penjualan | 69.936.000 |
| Harga pokok penjualan | 54.666.000 |
| **Laba kotor** | **15.270.000** (21,8%) |

Laba per ton: Rp35.000 untuk 346,8 t berharga beli lama, Rp30.000 untuk 104,4 t sesudah harga naik.

## 5. Yang masih terbuka di akhir contoh

- **Selisih tagihan supplier.** Supplier menagih 460 t × Rp125.000 = Rp57.500.000 sebelum PPN, sedangkan pengambilan kita Rp54.666.000. Selisihnya Rp2.834.000: 8,8 t × Rp125.000 = Rp1.100.000 dari tonase, dan 346,8 t × Rp5.000 = Rp1.734.000 karena harga baru dipakai untuk truk sebelum 14 Sep. Di Ringkasan, tagihan ini tetap ada di **Perlu tindakan → Cocokkan tagihan supplier** sampai dibereskan.
  - Bila ternyata supplier yang benar, faktur pembelian dibatalkan, lalu dibuat lagi di Tagihan Supplier dengan harga yang dikoreksi.
  - Bila ada truk yang belum tercatat, PO dibuka kembali (**Buka kembali**) untuk mencatatnya ([14 D3](14-PERTANYAAN-UNTUK-PEMILIK.md)).
- **Sisa 48,8 t untuk pelanggan.** PO pelanggan tetap berjalan, jadi sisanya bisa diambil lewat PO supplier baru di bulan berikutnya. Apakah PO pelanggan seharusnya ikut selesai saat cut-off — **REQUIRES USER CONFIRMATION** ([14 A3](14-PERTANYAAN-UNTUK-PEMILIK.md)).
- **PPN masa September:** PPN keluaran 7.692.960 − PPN masukan 6.013.260 = **1.679.700** kurang bayar, bila PPN masukan supplier dikreditkan di masa yang sama.

## 6. Memeriksa ulang

```bash
npx vitest run tests/round-trip-500t.test.ts
```

Tes ini menjalankan semua langkah di atas dengan modul aplikasi yang sebenarnya, lalu memastikan setiap angka di bagian 3–4 sama persis dan buku besar seimbang.
