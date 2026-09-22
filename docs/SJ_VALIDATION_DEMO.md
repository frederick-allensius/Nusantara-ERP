# Validasi SJ Supplier — Cara Kerja & Panduan Demo

> Alat anti **kurang-tagih / lebih-bayar** untuk pembelian. Mencocokkan **Surat
> Jalan & timbangan di lapangan** dengan **rekap dari supplier** SEBELUM faktur
> pembelian diterbitkan. Bahasa: sederhana, fokus ke masalah nyata di lapangan.

---

## 1. Masalah yang diselesaikan

Di bisnis trading (batu alam, pasir, material curah), supplier sering mengirim
**rekap tagihan** sendiri lewat email atau file Excel. Rekap ini kadang:

- **melebih-lebihkan tonase** (mis. truk sebenarnya bawa 30 ton, di rekap ditulis
  33 ton), atau
- **menaikkan harga satuan** dari yang disepakati.

Kalau rekap itu langsung dijadikan dasar faktur, perusahaan **membayar barang
yang tidak pernah datang**. Selisih kecil per truk, tapi menumpuk besar sebulan.

**Sumber kebenaran** kita adalah data lapangan: **netto timbangan** (bruto − tara)
dan harga yang tercatat saat **Rekonsiliasi Penerimaan** (modul Timbangan &
Rekonsiliasi). Alat ini membandingkan rekap supplier terhadap data itu, baris per
baris, lalu **menandai setiap selisih** sebelum faktur dibuat.

---

## 2. Alur kerja

```
PO Pembelian
   └─ Surat Jalan & Timbangan (bruto/tara/netto)   ← data lapangan
        └─ Rekonsiliasi Penerimaan (netto + harga)  ← sumber kebenaran
             └─ Validasi SJ Supplier                 ← alat ini
                  ├─ lampirkan rekap supplier (Excel)
                  ├─ cocokkan per No. PO / No. DO / item
                  ├─ hitung selisih tonase & selisih harga
                  └─ TANDAI selisih (merah) → cek dulu
                       └─ Faktur Pembelian (baru dibuat jika aman)
```

Pencocokan baris memakai **No. PO / No. DO + nama item**. Selisih tonase atau
harga di atas **toleransi kecil** (default 0,05 ton atau 1%, dan Rp 1 atau 0,5%
untuk harga) akan ditandai. Toleransi ini dapat diatur.

Baris rekap yang **tidak punya padanan** di data lapangan juga ditonjolkan
(potensi tagihan fiktif).

---

## 3. Sumber rekap yang dapat dipasang (pluggable)

Rekap supplier masuk lewat **kontrak sumber** yang seragam:

```js
window.SJValidation.registerRecapSource({
  id: 'upload',                       // sumber bawaan: unggah file Excel
  label: 'Unggah File Excel',
  fetchRecaps: function () { /* → Promise<baris rekap[]> */ }
});
```

Saat ini yang dikirim adalah sumber **Unggah File Excel** (manual). Ingest lewat
**email supplier belum diaktifkan** (belum ada API email). Namun, ketika nanti
tersedia, sumber email cukup mengimplementasikan **kontrak yang sama** —
tanpa mengubah mesin cross-check maupun tampilannya:

```js
window.SJValidation.registerRecapSource({
  id: 'mailbox',
  label: 'Kotak Masuk Email Supplier',
  fetchRecaps: function () {
    return mailboxApi.latestAttachment().then(window.SJValidation.parseRecapWorkbook);
  }
});
```

Format kolom rekap Excel mengikuti sheet **Delivery Orders** pada
`docs/pitch/Template-Import-Nusantara.xlsx` (Tanggal, Nomor, PO Number, Item Name,
Qty/Tonase, Harga). Kolom bahasa Indonesia (Tanggal, Nomor, Nama Item, Tonase,
Harga) juga dikenali.

---

## 4. Langkah demo (±3 menit)

1. Buka menu **Purchases → Validasi SJ Supplier**.
2. Klik **Muat Contoh Demo** di kanan atas header.
   - Ini menanam satu penerimaan terekonsiliasi (Surat Jalan / timbangan) berisi
     dua item: **Batu Andesit 20cm** (netto 24,6 ton @ Rp 185.000) dan **Pasir
     Cor** (netto 30 ton @ Rp 210.000), plus rekap supplier contoh.
3. Perhatikan hasil cross-check:
   - **Batu Andesit 20cm** → rekap 24,6 ton @ Rp 185.000 → **Sesuai** (hijau).
   - **Pasir Cor** → rekap **33 ton @ Rp 225.000** → **Selisih Tonase** dan
     **Selisih Harga** (baris merah).
4. Spanduk merah di atas memperingatkan: **jangan terbitkan faktur** sebelum
   selisih diperiksa. Inilah inti pencegahan kurang-tagih.
5. Untuk data asli: pilih **Unggah File Excel** pada dropdown sumber, klik
   **Lampirkan & Validasi**, lalu pilih file rekap supplier.

Talking point: *"Truk yang sama, tapi rekap supplier menulis 3 ton lebih banyak
dan harga lebih tinggi. Tanpa alat ini, selisih itu langsung jadi tagihan. Di
sini, merah dulu — diperiksa dulu — baru difakturkan."*

---

## 5. Catatan teknis

- Mesin cross-check (`window.SJValidation.crossCheck`) adalah fungsi murni tanpa
  DOM, sehingga dapat diuji unit (lihat `tests/sj-validation.test.ts`).
- Data lapangan diambil dari `goodsReceipts` yang sudah **terekonsiliasi**
  (`window.SJValidation.fieldLinesFromReceipts`).
- Toleransi default ada di `window.SJValidation.DEFAULT_TOLERANCE` dan dapat
  ditimpa lewat argumen `options` pada `crossCheck`.
