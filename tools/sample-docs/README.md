# Generator dokumen supplier fiktif

Jalankan dari root repo Nusantara-ERP (Python 3.10 atau lebih baru):

```powershell
python -m pip install -r tools/sample-docs/requirements.txt
python tools/sample-docs/generate.py
python tools/sample-docs/generate.py --validate-only
node tools/sample-docs/verify-import.mjs
```

Generator menggunakan Pillow, numpy dan openpyxl serta font sistem; tidak mengakses
internet atau file referensi asli. Seed tetap `690926`. Hasil berada di
`docs/pitch/contoh-dokumen-supplier/`. Skrip hanya menulis ke folder keluaran ini,
menimpa nama hasil yang sama pada pengulangan, tanpa menghapus file lain.

Lihat README di folder keluaran untuk daftar dokumen, skenario dan cara demo.
Font dan versi library yang berbeda dapat mengubah raster foto; dalam lingkungan
yang sama hasil identik, termasuk timestamp ZIP Excel dan boundary MIME email.
Perintah Node opsional memakai dependency SheetJS yang sudah ada di repo dan
parser rekap ERP asli untuk memeriksa semua baris keempat Excel tanpa mutasi DB.
Validasi Python otomatis memeriksa struktur Excel, subtotal, konsistensi setiap kasus,
gambar, lampiran email dan batas 30 MB. Pengujian ini belum menjalankan ERP/OCR.
