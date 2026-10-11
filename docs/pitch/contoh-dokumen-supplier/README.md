# Contoh kiriman supplier — seluruh data fiktif

Untuk demo **Impor Rekap Timbangan** dan **Kotak Masuk Rekap** Nusantara ERP.
Seluruh nama, plat, angka, nomor dokumen dan alamat email dibuat untuk demo;
perusahaan dan lokasi mengikuti cerita dalam prompt. Tidak menggunakan dokumen
asli. Alamat pengirim Gmail hanya teks contoh; tidak ada email yang dikirim.
Foto merupakan simulasi foto HP yang dirender dengan Pillow/numpy.

## Isi folder

| File/folder | Isi |
| --- | --- |
| `REKAP NSA-CKD.xlsx`, `REKAP NSA-SERANG.xlsx` | Rekap kumulatif 1 Juli–23 September 2026 |
| `REKAP NSA-CKD (2).xlsx`, `REKAP NSA-SERANG (2).xlsx` | Rekap kumulatif sampai 30 September, termasuk satu perubahan berat lama |
| `foto/` | 62 JPEG potret 900×1600: 31 DO dan 31 SJ, untuk kiriman 22–23 dan 29–30 September |
| `email/Kiriman-22-230926.eml` | 30 foto campuran DO/SJ dan 2 rekap awal |
| `email/Kiriman-29-300926.eml` | 32 foto campuran DO/SJ dan 2 rekap versi berikutnya |
| `email/Outlook-*.png` | Dua gambar simulasi Outlook sesuai email dan lampirannya |
| `manifest.json` | Semua trip, PO, kebenaran setiap foto, lokasi sel Excel, kasus uji, fixture Ditagih dan daftar lampiran |
| `validation.json` | Hasil pemeriksaan otomatis terakhir |

**Tata letak SJ adalah perkiraan**, karena contoh SJ asli belum tersedia dengan
jelas. Ada lembar biasa dan salinan karbon merah muda. DO continuous form memiliki
lubang di kedua sisi, huruf dot-matrix pucat, tanda tangan simulasi, lipatan,
perspektif dan rotasi ±90°. Tiga dari 31 DO sengaja kurang jelas. Berat DO dalam kg
dengan titik ribuan; berat Excel dalam ton, dua desimal, walaupun header menyebut kg.
Di setiap sheet, kolom No mulai 1 setiap tanggal; subtotal harian hanya berisi Qty.

## Jalankan ulang

Dari root repo:

```powershell
python -m pip install -r tools/sample-docs/requirements.txt
python tools/sample-docs/generate.py
python tools/sample-docs/generate.py --validate-only
node tools/sample-docs/verify-import.mjs
```

Seed `690926` tetap. Gunakan lingkungan/font/library yang sama untuk byte identik.
Semua hasil berada di folder ini; generator tidak mengubah aplikasi atau database.
Rekap dapat dibuka di Excel/LibreOffice; email dapat dibuka di Outlook/Thunderbird
dengan lampiran asli. PNG Outlook adalah simulasi, bukan tangkapan email terkirim.

## Demo dan tujuh kasus uji

Impor rekap awal, lalu cocokkan foto di email pertama. Setelah mempersiapkan
transaksi lama sebagai Ditagih, impor rekap `(2)` untuk menguji pembaruan kumulatif.
Nomor DO, BAP, SJ, PO dan baris Excel spesifik tersedia pada `test_cases` manifest.

1. Excel memuat Qty **3 ton lebih besar** daripada DO; Isi turut bertambah sehingga
   rumus Qty = Isi − Kosong tetap benar.
2. Satu DO pada kiriman pertama memiliki berat tertutup bayangan/blur; dua DO pada
   kiriman berikutnya juga kurang jelas agar proporsinya sekitar satu dari sepuluh.
3. Satu truk dalam rekap kiriman pertama tidak memiliki foto DO maupun SJ.
4. Satu truk memiliki foto DO/SJ tetapi tidak tercatat dalam kedua versi Excel.
5. Satu transaksi 5 September berubah **30 → 35 ton** dalam versi berikutnya.
   `application_fixture` memuat nomor invoice fiktif dan status **Ditagih**. Status
   ini harus disiapkan di ERP sebelum impor versi berikutnya; berkas saja tidak
   dapat menetapkan status penagihan di aplikasi.
6. Satu baris dalam file Cikande memiliki Keterangan **BETON SERANG**.
7. Plat/sopir yang sama mengambil dua kali pada 22 September, untuk material/PO
   berbeda; pencocokan tidak boleh menyatukan keduanya.

Foto dalam email hanya mewakili rentang tanggal kiriman; ketiadaan foto riwayat
Juli–Agustus dan hari lain bukan kasus foto hilang. Ada 468 trip aktual, 415 baris
rekap awal dan 467 baris versi berikutnya. PO memakai satu material/satu lokasi;
setiap PO 11–21 truk, sekitar 350 ton atau 700 ton. Truk aktual 29–41 ton bersih,
tara 11,4–12,8 ton; September memiliki 3–4 truk/hari/lokasi. Nomor SJ berlanjut
lintas lokasi, DO/BAP berurutan dan BAP − DO = 161.

Validasi membuka keempat workbook dengan openpyxl, seluruh gambar dengan Pillow,
kedua email dengan parser MIME, serta membandingkan setiap byte lampiran. Validasi
juga memeriksa semua tujuh kasus dan total keluaran <30 MB. Ini tidak menggantikan
uji impor langsung di UI ERP atau uji OCR. Pemeriksaan Node opsional memakai
parser rekap asli `Trading.recapRowsFromWorkbook` dan dependency SheetJS repo;
seluruh baris, semua sheet, satuan berat dan nomor dokumen dibandingkan manifest.
