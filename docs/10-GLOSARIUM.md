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
| e-Faktur | Aplikasi/format resmi DJP untuk faktur pajak |
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

## Sistem

| Istilah | Arti sederhana |
|---|---|
| ERP | Enterprise Resource Planning — satu sistem untuk berbagai bagian bisnis |
| Data master | Data acuan: pelanggan, supplier, barang, gudang, akun |
| RBAC / Peran | Pengaturan hak akses berdasarkan jabatan pengguna |
| 2FA / Verifikasi 2 langkah | Login memakai password + kode dari aplikasi di HP |
| Log audit | Catatan siapa mengubah data apa dan kapan |
| Recycle bin | Tempat penyimpanan sementara data yang dihapus |
| PWA | Aplikasi web yang bisa dipasang di komputer/HP seperti aplikasi biasa |
| Mode lokal / offline | Data tersimpan di perangkat itu saja |
| Mode cloud | Data tersimpan di server (Firebase) dan bisa diakses dari beberapa perangkat |
| IndexedDB | Tempat penyimpanan data di dalam browser |
| Firebase / Firestore | Layanan cloud Google untuk database dan login |
| API | Jalur agar sistem lain bisa membaca data ERP secara otomatis |
