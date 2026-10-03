# 10 — Glosarium

Istilah yang muncul di aplikasi dan dokumentasi, dijelaskan dengan bahasa sehari-hari. Istilah Inggris dipertahankan bila lebih dikenal di dunia usaha.

## Dokumen transaksi

| Singkatan | Istilah | Arti sederhana |
|---|---|---|
| SQ | Penawaran Penjualan (Sales Quotation) | Surat penawaran harga ke pelanggan sebelum pesanan pasti |
| SO | Sales Order / Pesanan Penjualan | Pesanan pelanggan yang sudah disepakati |
| DO | Delivery Order / Surat Jalan | Dokumen yang ikut bersama barang saat dikirim |
| SI | Sales Invoice / Faktur Penjualan | Tagihan resmi ke pelanggan |
| SR | Sales Receipt / Penerimaan Pembayaran | Catatan uang masuk dari pelanggan atas faktur |
| SRN | Sales Return / Retur Penjualan | Barang yang dikembalikan pelanggan |
| SDP | Sales Down Payment / Uang Muka Penjualan | Uang yang dibayar pelanggan di muka sebelum pesanan selesai |
| PQ | Penawaran Pembelian (Purchase Quotation) | Penawaran harga dari supplier |
| PO | Purchase Order / Pesanan Pembelian | Pesanan resmi ke supplier |
| GR | Goods Receipt / Penerimaan Barang | Catatan barang yang datang dari supplier |
| PI | Purchase Invoice / Faktur Pembelian | Tagihan dari supplier |
| PP | Purchase Payment / Pembayaran | Catatan uang keluar untuk membayar supplier |
| PRN | Purchase Return / Retur Pembelian | Barang yang dikembalikan ke supplier |
| PDP | Purchase Down Payment / Uang Muka Pembelian | Uang muka yang dibayarkan ke supplier |
| IT | Item Transfer / Transfer Antar Gudang | Pemindahan barang dari satu gudang ke gudang lain |
| ADJ | Item Adjustment / Penyesuaian Stok | Koreksi jumlah stok (hasil opname, rusak, hilang) |
| JV | Journal Voucher / Jurnal Umum | Jurnal akuntansi yang diketik manual |

## Akuntansi

| Istilah | Arti sederhana |
|---|---|
| Double-entry | Setiap transaksi dicatat di minimal dua akun: debit dan kredit dengan jumlah sama |
| Buku Besar (General Ledger) | Kumpulan semua jurnal per akun |
| Bagan Akun (Chart of Accounts, COA) | Daftar akun yang dipakai perusahaan beserta nomornya |
| Jurnal | Catatan akuntansi satu kejadian (tanggal, akun, debit, kredit) |
| Posting | Membuat transaksi resmi berlaku sehingga memengaruhi stok/buku besar |
| Neraca Saldo (Trial Balance) | Daftar saldo semua akun; total debit harus sama dengan kredit |
| Laba Rugi (Profit & Loss) | Pendapatan dikurangi HPP dan beban dalam satu periode |
| Neraca (Balance Sheet) | Posisi aset, kewajiban, dan modal pada suatu tanggal |
| Arus Kas (Cash Flow) | Uang masuk dan keluar dari kas/bank |
| Piutang (Accounts Receivable, AR) | Uang yang masih harus diterima dari pelanggan |
| Hutang (Accounts Payable, AP) | Uang yang masih harus dibayar ke supplier |
| Umur Piutang (Aging) | Pengelompokan piutang berdasarkan lamanya belum dibayar (0–30, 31–60 hari, dst.) |
| Kartu Piutang / Kartu Hutang | Riwayat tagihan dan pembayaran per pelanggan/supplier |
| HPP (Harga Pokok Penjualan, COGS) | Modal barang yang terjual |
| Rata-rata bergerak (moving average) | Harga pokok dihitung ulang setiap barang masuk: total nilai ÷ total qty |
| Persediaan | Nilai barang yang masih ada di gudang |
| Biaya Akrual | Biaya yang sudah terjadi tetapi belum dibayar |
| Saldo awal (opening balance) | Saldo akun dan stok saat mulai memakai sistem |
| Kunci periode | Pengaman agar transaksi pada bulan yang sudah ditutup tidak bisa diubah |
| Jurnal balik (reversal) | Jurnal lawan untuk menetralkan jurnal yang salah |
| Laba ditahan | Akumulasi laba tahun-tahun sebelumnya |

## Pajak

| Istilah | Arti sederhana |
|---|---|
| PPN | Pajak Pertambahan Nilai (tarif default di aplikasi 11%) |
| PPN Keluaran | PPN yang dipungut dari pelanggan saat menjual |
| PPN Masukan | PPN yang dibayar ke supplier saat membeli |
| DPP | Dasar Pengenaan Pajak — nilai sebelum PPN |
| PKP | Pengusaha Kena Pajak — perusahaan yang wajib memungut PPN |
| NPWP | Nomor Pokok Wajib Pajak |
| e-Faktur | Aplikasi/format resmi DJP untuk faktur pajak (format lama) |
| Coretax | Sistem administrasi pajak DJP yang dipakai untuk faktur pajak. **Ekspor Coretax** di aplikasi membuat file XML faktur pajak keluaran per masa pajak untuk diimpor di Coretax |
| Masa pajak | Periode pelaporan pajak bulanan (mis. Oktober 2026) |
| PPh 23 | Pajak penghasilan atas jasa tertentu (dipotong pembeli jasa) |
| PPh 21 | Pajak penghasilan atas gaji karyawan |
| SPT Masa PPN | Laporan PPN bulanan ke kantor pajak |

## Persediaan dan logistik

| Istilah | Arti sederhana |
|---|---|
| Stok fisik | Jumlah barang yang benar-benar ada |
| Reservasi stok | Stok yang "dipesan" oleh SO Dikonfirmasi dan belum dikirim |
| Stok tersedia | Stok fisik dikurangi reservasi |
| Stok minimum | Batas bawah; di bawahnya muncul peringatan untuk membeli lagi |
| Kartu Stok | Riwayat masuk-keluar barang dengan saldo berjalan |
| Stock opname | Penghitungan fisik stok untuk dicocokkan dengan catatan |
| Multi-gudang | Stok dicatat terpisah per lokasi gudang |
| Pengiriman sebagian | Satu pesanan dikirim dalam beberapa kali pengiriman |

## Pengambilan (trading)

| Istilah | Arti sederhana |
|---|---|
| Pengambilan | Truk pelanggan mengambil barang langsung di lokasi supplier; barang tidak masuk gudang perusahaan |
| PO pelanggan | Pesanan dari pelanggan, dicatat sebagai Pesanan Penjualan (SO) |
| PO pengambilan | PO ke supplier (satu barang) yang sudah dibuka untuk diambil truk pelanggan, terhubung ke satu PO pelanggan |
| Surat jalan pengambilan | Surat jalan untuk satu truk, dibuat sekaligus saat PO dibuka, bernomor `<No PO>/01`, `/02`, … Status: Siap, Diambil, Ditagih, Batal |
| Trip / truk | Satu kali pengambilan oleh satu truk dengan satu surat jalan dan satu hasil timbangan |
| Kapasitas truk | Muatan per truk yang dipakai menghitung jumlah surat jalan (bawaan 35 ton) |
| Bruto / Tara / Netto | Berat truk bermuatan / berat truk kosong / berat barang (bruto − tara). Netto menjadi jumlah yang ditagih |
| Tiket timbangan | Bukti hasil timbang dari supplier; nomornya dan fotonya bisa disimpan di pengambilan |
| Kuota PO | Jumlah di PO supplier; pengambilan yang melebihinya ditolak kecuali dikonfirmasi, dan PO ditutup saat kuota terpenuhi |
| Cut-off / batas pengambilan | Tanggal terakhir PO boleh dipakai (bawaan akhir bulan). Setelah itu PO ditutup dan surat jalan sisa dibatalkan |
| Selesai | Status PO supplier/PO pelanggan pengambilan yang sudah ditutup |
| Rekap timbangan | File Excel dari bagian timbangan supplier berisi semua truk (No SJ, tanggal, No. Polisi, bruto, tara, netto); diimpor lewat **Impor Rekap Timbangan** |
| Perubahan timbangan | Berat truk yang berubah setelah dicatat, biasanya dari rekap yang diperbarui supplier. Bila truk sudah ditagih, faktur tidak berubah dan muncul peringatan sampai ditindaklanjuti |
| Tagih Pelanggan | Membuat satu faktur penjualan dari truk-truk satu pelanggan dalam satu periode |
| Tagihan Supplier | Mencatat faktur dari supplier dan mencocokkan tonase & harganya dengan truk yang sudah diambil |
| Belum ditagih | Truk yang sudah diambil tetapi belum masuk faktur; dihitung sebagai piutang tanpa jatuh tempo |
| Harga Supplier (tanggal berlaku) | Harga beli dari supplier yang berlaku mulai tanggal tertentu; dipakai otomatis untuk truk yang diambil sejak tanggal itu |
| Rekonsiliasi Timbangan | Untuk penerimaan barang ke gudang: membandingkan qty pesanan, surat jalan, dan timbangan sebelum faktur pembelian dibuat |

## Sistem

| Istilah | Arti sederhana |
|---|---|
| ERP | Enterprise Resource Planning — satu sistem untuk berbagai bagian bisnis |
| Data master | Data acuan: pelanggan, supplier, barang, gudang, akun |
| RBAC / Peran | Pengaturan hak akses berdasarkan jabatan pengguna |
| Akses menu | Daftar kelompok menu yang boleh dibuka seorang pengguna, diatur admin di Manajemen Pengguna; hanya mempersempit peran |
| Entri Harian | Halaman pintasan tugas harian: catat pengambilan, impor rekap timbangan, tagih pelanggan, biaya operasional |
| Arsip Excel | File Excel berisi data utama satu tahun (Kelola Backup), untuk disimpan atau dibaca akuntan; bukan untuk memulihkan data |
| Ukuran teks | Pilihan besar huruf di menu pengguna: Normal, Besar (bawaan), Sangat besar |
| 2FA / Verifikasi 2 langkah | Login memakai password + kode dari aplikasi di HP |
| Log audit | Catatan siapa mengubah data apa dan kapan |
| Recycle bin | Tempat penyimpanan sementara data yang dihapus |
| PWA | Aplikasi web yang bisa dipasang di komputer/HP seperti aplikasi biasa |
| Mode lokal / offline | Data tersimpan di perangkat itu saja |
| Mode cloud | Data tersimpan di server (Firebase) dan bisa diakses dari beberapa perangkat |
| IndexedDB | Tempat penyimpanan data di dalam browser |
| Firebase / Firestore | Layanan cloud Google untuk database dan login |
| API | Jalur agar sistem lain bisa membaca data ERP secara otomatis |
