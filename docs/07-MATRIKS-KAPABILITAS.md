# 07 — Matriks Kapabilitas ERP dan Perbandingan

> **Tujuan:** memberi gambaran jujur posisi Nusantara ERP dibanding kapabilitas yang umum ada di sistem ERP — **bukan** daftar belanja fitur. Kolom "Belum ada" tidak berarti harus dibuat; kebutuhan diputuskan setelah validasi dengan pengguna ([06](06-MATRIKS-KEBUTUHAN.md)).
>
> **Status:** ✅ **Tercakup** (Covered) — tersedia dan berjalan · 🟡 **Sebagian** (Partial) — ada, tetapi terbatas atau perlu perbaikan · ⬜ **Belum ada** (Missing)

---

## Bagian A — Matriks kapabilitas

### A1. Penjualan

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Penawaran harga | Buat, kirim, terima/tolak, konversi ke SO | Penawaran dengan revisi, masa berlaku, konversi | 🟡 | Tidak bisa diubah; konversi bisa berulang (T-15) |
| Pesanan penjualan | SO dengan status, reservasi stok, cetak, duplikat, ubah status massal | Pesanan + cek batas kredit + persetujuan | 🟡 | Tanpa batas kredit & persetujuan |
| Pengiriman / surat jalan | Kirim sebagian, bagi muatan per truk, cetak; untuk pengambilan: surat jalan per truk dibuat sekaligus per PO, timbangan per truk | Pengiriman terhubung stok & pelacakan | 🟡 | Barang stok: stok berkurang dari status SO, bukan surat jalan |
| Faktur penjualan | Faktur dari SO terkirim; faktur gabungan banyak truk per periode dari pengambilan (Tagih Pelanggan); bisa dibatalkan | Faktur dari satu/lebih pengiriman, faktur gabungan | 🟡 | Barang stok: 1 faktur = 1 SO |
| Penerimaan pembayaran | Per faktur atau per SO; cicilan | Satu penerimaan untuk banyak faktur, lebih bayar, giro | 🟡 | Dua jalur tidak saling mengenali (T-06) |
| Uang muka pelanggan | Terima & terapkan ke SO | Sama | ✅ | Jurnal ganda sudah diperbaiki (T-04) |
| Retur penjualan | Retur dari SO/faktur | Retur + nota kredit / pengembalian dana | 🟡 | Retur dari faktur gagal (T-12) |
| Harga & diskon | Harga jual per barang; diskon nominal per baris | Daftar harga per pelanggan/volume, promosi | 🟡 | |
| Batas kredit pelanggan | — | Umum tersedia | ⬜ | Relevansi **REQUIRES USER CONFIRMATION** |
| Tenaga penjual & komisi | — | Umum tersedia | ⬜ | Relevansi **REQUIRES USER CONFIRMATION** |

### A2. Pembelian

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Permintaan pembelian | "Permintaan Barang" (pencatatan) | Permintaan → persetujuan → PO | 🟡 | Tidak terhubung ke PO |
| Penawaran pembelian | Buat, terima/tolak, konversi ke PO | Sama + perbandingan penawaran | 🟡 | |
| Purchase Order | PO + harga supplier otomatis | PO + persetujuan | 🟡 | Tanpa persetujuan |
| Penerimaan barang | Status PO *Diterima* **atau** menu Penerimaan Barang (bertahap, dengan bruto/tara/netto); dicegah ganda | Penerimaan bertahap terhubung PO & stok | ✅ | Cara baku perlu dipilih bisnis |
| Faktur & pembayaran supplier | Faktur dari PO diterima, per penerimaan (Rekonsiliasi Timbangan), atau dari truk pengambilan (Tagihan Supplier); pembayaran bertahap | Pencocokan PO–penerimaan–faktur | ✅ | Satu PO bisa punya beberapa faktur |
| Pencocokan 3 arah (PO–barang–faktur) | Rekonsiliasi Timbangan (pesanan vs surat jalan vs timbangan), Validasi SJ Supplier (rekap supplier vs penerimaan), Tagihan Supplier (tagihan vs truk pengambilan) | Umum di ERP menengah ke atas | 🟡 | Pencocokan ditandai di layar; faktur tetap bisa disimpan setelah konfirmasi |
| Daftar harga supplier | Harga per supplier per barang dengan tanggal berlaku; dipakai otomatis per truk pengambilan | Sama | ✅ | |

### A3. Persediaan

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Stok per gudang | Multi-gudang, stok per gudang | Sama | ✅ | Perlu perbaikan konsistensi (T-05) |
| Transfer antar gudang | Ya | Ya | ✅ | Tanpa pembatalan |
| Penyesuaian & opname | Penyesuaian tambah/kurang | Sesi opname: hitung fisik → selisih otomatis | 🟡 | |
| Kartu stok | Ya | Ya | ✅ | |
| Penilaian persediaan | Rata-rata bergerak otomatis | Rata-rata / FIFO / standar | ✅ | Retur memakai harga statis (T-44) |
| Reservasi stok | Saat SO dikonfirmasi | Ya | ✅ | |
| Stok minimum & saran pembelian | Batas minimum + notifikasi | Titik pesan ulang + saran PO | 🟡 | Notifikasi tidak berjalan (T-23) |
| Konversi satuan | — | Umum tersedia | ⬜ | Relevan bila menjual Ton & M3 untuk barang yang sama |
| Lot / nomor seri / kedaluwarsa | — | Tersedia untuk industri tertentu | ⬜ | |
| Barcode / pemindai | — | Umum tersedia | ⬜ | |

### A4. Keuangan dan akuntansi

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Buku besar otomatis (double-entry) | Jurnal otomatis dari dokumen | Sama | ✅ | Posting ganda faktur vs pengiriman/penerimaan sudah diperbaiki (T-01, T-02) |
| Bagan akun | 22 akun bawaan, hanya dilihat | Bisa diatur pengguna | 🟡 | Tidak ada form tambah/ubah akun |
| Jurnal umum | Ya, wajib seimbang | Ya | ✅ | |
| Kas & bank | Pengeluaran/penerimaan lain dengan kategori & akun, transfer, rekening koran; semua dijurnal otomatis; rekap per kategori per bulan + ekspor Excel | Semua transaksi kas masuk buku besar | ✅ | Pemetaan kategori → akun perlu disetujui akuntan |
| Rekonsiliasi bank | Centang baris rekening koran; saldo rekening koran vs buku besar dan selisihnya; catat biaya/bunga bank langsung dari baris rekening koran | Pencocokan otomatis dengan mutasi | 🟡 | Rekening koran diketik manual; pencocokan tidak otomatis |
| Piutang & hutang + umur | Ya, termasuk pengambilan yang belum ditagih (tanpa jatuh tempo) | Ya | ✅ | Satu perhitungan saldo di semua layar (T-09 diperbaiki) |
| Biaya akrual | Ya → jurnal | Ya | ✅ | |
| Anggaran | Per akun per bulan + realisasi | Ya | ✅ | |
| Aset tetap | Daftar, mutasi, disposisi | + penyusutan otomatis & jurnal | 🟡 | Tanpa penyusutan |
| Penggajian | Gaji pokok + tunjangan → jurnal | + PPh 21, BPJS, slip gaji | 🟡 | |
| Tutup buku | Kunci periode | Kunci + jurnal penutup | 🟡 | |
| Multi mata uang | Pengaturan mata uang ada, transaksi hanya Rupiah | Tersedia | ⬜ | Hanya relevan bila ada transaksi valas |
| Multi perusahaan / cabang & konsolidasi | — | Tersedia di ERP menengah ke atas | ⬜ | |

### A5. Pajak (Indonesia)

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| PPN keluaran & masukan di jurnal | Ya (tarif dapat diatur) | Ya | ✅ | |
| Faktur pajak / Coretax | Ekspor XML Coretax faktur pajak keluaran per masa pajak, CSV format lama, pencatatan nomor faktur pajak | Integrasi dengan sistem DJP | 🟡 | File diimpor manual di Coretax; impor pertama perlu diuji; kode barang & satuan **REQUIRES USER CONFIRMATION** |
| PPh 21 / 23 | Hanya informasi di cetak PO | Perhitungan & bukti potong | ⬜ | |
| Rekap / SPT PPN | Rekap PPN dari dokumen yang diposting (T-11 diperbaiki) | Ya | 🟡 | Pengambilan baru masuk rekap setelah ditagih |

### A6. Laporan

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Laba Rugi, Neraca, Arus Kas | Ya, filter periode, cetak | Ya + perbandingan periode | 🟡 | Neraca per tanggal perlu perbaikan (T-13) |
| Laporan operasional | Umur piutang, kartu stok, kartu piutang/hutang, rekap SO/PO, Rekap Pengambilan, Laporan per Periode | Ya | ✅ | |
| Dashboard | Ringkasan dari buku besar & saldo faktur: kas, piutang/hutang, laba kotor, alur pengambilan, tagihan per pelanggan, PO pengambilan berjalan, tonase per bulan, perlu tindakan (T-22 diperbaiki) | Dashboard berbasis data transaksi | ✅ | |
| Ekspor | Excel, CSV, cetak browser, Arsip Excel per tahun | Excel, PDF, terjadwal | 🟡 | Tidak ada ekspor terjadwal |
| Pembuat laporan kustom | — | Umum di ERP menengah ke atas | ⬜ | |

### A7. Alur kerja, hak akses, dan audit

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Rantai dokumen terhubung | "Jejak Dokumen" penawaran → pesanan → pengiriman → faktur → pembayaran | Ya | ✅ | Retur belum masuk rantai |
| Siklus status & koreksi | Status per dokumen; hapus bebas untuk SO/PO, faktur tidak bisa batal | Batal/koreksi terkontrol | 🟡 | Lihat [05](05-SIKLUS-STATUS-DAN-KOREKSI.md) |
| Persetujuan (approval) | — | Persetujuan bertingkat | ⬜ | |
| Peran pengguna | 5 peran bawaan + pending; **Akses menu** per pengguna mempersempit peran per kelompok modul | Peran kustom per fitur | 🟡 | Peran tidak bisa dikustomisasi; pembatasan per kelompok modul, bukan per menu atau per kategori biaya |
| Pembatasan per gudang/cabang | — | Tersedia | ⬜ | |
| Verifikasi 2 langkah | TOTP + kode cadangan | Ya | ✅ | |
| Log audit | Perubahan data (lokal) + log akses server (cloud) | Ya | ✅ | |
| Kunci periode | Ya | Ya | ✅ | |
| Recycle bin | 90 hari | Bervariasi | ✅ | |
| Jurnal balik eksplisit | — (jurnal dihitung ulang dari status) | Umum | ⬜ | **REQUIRES USER CONFIRMATION** apakah akuntan membutuhkannya |
| Lampiran dokumen (scan/foto) | Foto DO supplier per truk pengambilan | Umum tersedia | 🟡 | Dokumen lain belum bisa diberi lampiran |

### A8. Integrasi, otomasi, skalabilitas, kemudahan pemakaian

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| API untuk sistem lain | API baca-saja (butuh deploy Cloud Functions) | API baca & tulis | 🟡 | |
| Impor data | Template Excel (pesanan, faktur, pembayaran, saldo awal, stok awal) | Ya | ✅ | |
| Integrasi bank / marketplace / pajak | — (menu e-Banking hanya tampilan) | Tersedia via konektor | ⬜ | |
| Jurnal otomatis | Ya | Ya | ✅ | |
| Transaksi berulang | — | Umum tersedia | ⬜ | |
| Pengingat jatuh tempo | Notifikasi di aplikasi/perangkat, termasuk pengambilan belum ditagih > 7 hari, PO di batas cut-off, perubahan timbangan | Notifikasi + email | 🟡 | |
| Backup | File (lokal), otomatis harian (cloud, simpan 14 hari), Arsip Excel per tahun | Otomatis | ✅ | |
| Multi pengguna & perangkat | Mode cloud (Firestore, sinkron real-time) | Ya | 🟡 | Beberapa data belum tersinkron (T-27) |
| Volume data | Seluruh data dimuat ke perangkat; jurnal dihitung ulang setiap simpan | Server database dengan kueri | 🟡 | Cocok untuk ribuan dokumen per tahun, bukan ratusan ribu |
| Offline | Ya (mode lokal & PWA) | Jarang | ✅ | Kelebihan untuk lokasi dengan internet tidak stabil |
| Mobile | Tampilan responsif + dapat dipasang; Catat Pengambilan dirancang untuk HP | Aplikasi mobile terpisah | ✅ | |
| Keterbacaan | Ukuran teks Normal / Besar / Sangat besar per perangkat (bawaan Besar) | Bervariasi | ✅ | |
| Bahasa Indonesia | Isi Indonesia, menu masih campur | Ya | 🟡 | Diperbaiki pada revamp |
| Pencarian global | SO, PO, barang, pelanggan, supplier | Semua dokumen | 🟡 | Nama pelanggan tidak ditemukan (T-21) |
| Bantuan dalam aplikasi | — | Panduan & tooltip | ⬜ | |

### A9. Pengambilan (trading / drop-ship)

| Kapabilitas | Nusantara ERP saat ini | Kapabilitas ERP pada umumnya | Status | Catatan |
|---|---|---|---|---|
| Pesanan beli dipasangkan dengan pesanan jual | PO supplier dibuka untuk satu PO pelanggan (barang yang sama) | Drop-ship / back-to-back order | ✅ | Satu barang per PO supplier |
| Dokumen per muatan | Surat jalan per truk dibuat sekaligus (⌈jumlah ÷ kapasitas⌉), bernomor PO; ekspor Excel untuk timbangan; cetak | Pengiriman per muatan | ✅ | |
| Timbangan | Bruto/tara/netto per truk, foto DO, impor rekap timbangan Excel (kumulatif), riwayat & peringatan perubahan berat; simulasi rekap dan foto DO dari email (Kotak Masuk Rekap) | Jarang tersedia bawaan | ✅ | Format rekap asli supplier **REQUIRES USER CONFIRMATION** |
| Kuota & batas waktu | Kuota tonase per PO, batas pengambilan (akhir bulan), penutupan otomatis, buka kembali | Bervariasi | ✅ | Perilaku PO pelanggan saat cut-off **REQUIRES USER CONFIRMATION** |
| Penagihan per periode | Faktur pelanggan dan faktur supplier dari truk dalam satu periode; truk tidak bisa ditagih dua kali | Faktur gabungan | ✅ | |
| Pencocokan tagihan supplier | Tonase & harga tagihan vs truk kita; harga beli per tanggal berlaku | Pencocokan faktur | ✅ | |
| Akuntansi per muatan | Jurnal per truk (pembelian, HPP, penjualan), pindah ke faktur saat ditagih; persediaan bersih nol | Bervariasi | ✅ | |
| Pemantauan | Ringkasan (alur, tagihan pelanggan, PO berjalan, tonase per bulan), notifikasi, Rekap Pengambilan, Laporan per Periode | Dashboard | ✅ | |

---

## Bagian B — Perbandingan untuk pemangku kepentingan non-teknis

Tabel ini membandingkan **kategori** sistem, bukan merek tertentu. Tujuannya membantu memutuskan apa yang sebenarnya dibutuhkan.

| Aspek | Nusantara ERP saat ini | Software akuntansi/ERP untuk UKM pada umumnya | ERP kelas enterprise pada umumnya | Artinya bagi bisnis |
|---|---|---|---|---|
| **Penjualan** | Alur lengkap penawaran → pesanan → surat jalan → faktur → pembayaran → retur | Alur serupa, biasanya lebih matang untuk faktur gabungan & batas kredit | Sangat lengkap: kontrak, harga bertingkat, persetujuan, CRM | Cukup untuk penjualan B2B sederhana; faktur gabungan & batas kredit bisa ditambah bila memang dibutuhkan |
| **Pembelian** | PO, penerimaan dengan timbangan, rekonsiliasi & validasi SJ supplier, faktur per penerimaan, pembayaran, harga supplier per tanggal | Serupa + pencocokan faktur | Pengadaan penuh dengan tender & persetujuan | Cukup bila pembelian ke supplier tetap tanpa proses persetujuan |
| **Pengambilan (trading)** | PO supplier dipasangkan dengan PO pelanggan, surat jalan & timbangan per truk, impor rekap timbangan, kuota & cut-off, penagihan per periode dari truk, pencocokan tagihan supplier | Jarang tersedia tanpa modifikasi | Tersedia lewat modul drop-ship/logistik yang dikonfigurasi | Alur inti usaha sudah tercakup; format rekap timbangan dan aturan cut-off PO pelanggan masih perlu dikonfirmasi |
| **Persediaan** | Multi-gudang, kartu stok, harga pokok rata-rata otomatis | Serupa + konversi satuan, barcode | + lot/serial, perencanaan kebutuhan | Kuat untuk barang curah per satuan tunggal; perlu cek kebutuhan konversi satuan |
| **Keuangan** | Pembukuan otomatis termasuk kas & bank, laporan standar, anggaran, kunci periode, rekonsiliasi saldo bank | Serupa + penyusutan aset, rekonsiliasi bank otomatis | Multi perusahaan, konsolidasi, kontrol ketat | Inti akuntansi ada; temuan yang tersisa menunggu keputusan bisnis (lihat [08](08-TEMUAN-TEKNIS.md)) |
| **Pajak** | PPN otomatis di jurnal, Rekap PPN, ekspor XML untuk Coretax | Umumnya punya integrasi e-Faktur/pelaporan | Modul pajak lengkap | Faktur pajak dibuat dengan mengimpor file dari aplikasi ke Coretax; impor pertama perlu diuji |
| **Laporan** | Laporan keuangan & operasional standar, ekspor Excel | Serupa + perbandingan periode | Pembuat laporan & BI terintegrasi | Cukup untuk laporan bulanan internal; format khusus perlu dikonfirmasi |
| **Alur kerja** | Rantai dokumen jelas; belum ada persetujuan | Persetujuan sederhana sering tersedia | Workflow bertingkat yang dapat dikonfigurasi | Persetujuan hanya perlu bila ada pemisahan wewenang |
| **Hak akses** | 5 peran bawaan, akses menu per pengguna, 2FA | Peran dapat dikustomisasi | Hak akses sangat rinci | Cukup untuk tim kecil dengan tugas yang jelas |
| **Audit** | Log perubahan, kunci periode, recycle bin | Serupa | Jejak audit lengkap & kepatuhan formal | Cukup untuk kontrol internal; belum ada jurnal balik eksplisit |
| **Integrasi** | API baca, impor Excel | Konektor bank/marketplace umum tersedia | Platform integrasi lengkap | Integrasi dibuat hanya bila ada sistem yang benar-benar perlu terhubung |
| **Otomasi** | Jurnal & harga pokok otomatis, notifikasi | + transaksi berulang, pengingat email | Otomasi proses end-to-end | Otomasi inti (pembukuan) sudah ada |
| **Skalabilitas** | Cocok untuk satu perusahaan dengan volume kecil–menengah | Menengah | Sangat besar, multi negara | Perlu dicek bila volume transaksi sangat tinggi |
| **Kemudahan pemakaian** | Web + PWA, bisa offline; tampilan sedang dirapikan | Umumnya matang & ada pelatihan | Kompleks, butuh implementasi & pelatihan panjang | Dapat disesuaikan langsung dengan cara kerja bisnis ini |

### Kesimpulan yang jujur

1. Nusantara ERP **sudah mencakup siklus dagang inti** (jual, beli, pengambilan di supplier, stok, kas, pembukuan otomatis) untuk satu perusahaan dagang skala kecil–menengah.
2. Nusantara ERP **tidak setara** dengan ERP kelas enterprise: belum ada persetujuan bertingkat, multi perusahaan, koneksi langsung ke DJP, dan kontrol akses rinci per menu — dan tidak perlu diklaim setara.
3. Temuan perhitungan dari review (posting ganda, kas & bank tanpa jurnal, laporan PPN) sudah diperbaiki; yang tersisa menunggu keputusan bisnis — lihat [08](08-TEMUAN-TEKNIS.md). File Coretax perlu diuji impor sebelum dipakai rutin.
4. Keunggulan yang nyata: **disesuaikan untuk satu bisnis**, bisa berjalan **offline**, alur dokumen dan pembukuan **terhubung otomatis**.
5. Fitur yang "belum ada" hanya layak dibuat bila hasil meeting menunjukkan kebutuhan nyata.
