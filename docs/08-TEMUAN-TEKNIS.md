# 08 — Temuan Teknis dan Rencana Perbaikan

> **Tujuan:** daftar masalah yang ditemukan saat review kode, **mengapa** masalah itu merugikan pengguna, dan status perbaikannya.
>
> **Tingkat:** 🔴 Kritis (angka keuangan/stok bisa salah) · 🟠 Tinggi (fitur tidak berjalan sebagaimana mestinya) · 🟡 Sedang (membingungkan/tidak konsisten) · ⚪ Rendah (kosmetik/teknis internal)
>
> **Status:** `Direncanakan` · `Diperbaiki` (sudah diubah di kode + diuji) · `Perlu keputusan` (butuh konfirmasi bisnis sebelum diubah)
>
> Kondisi rekayasa saat review: **224 dari 224 tes lulus**, build produksi berhasil, lint bersih. Type-check (`npm run type-check`) memiliki 12 error pada file tes (bukan pada kode aplikasi).
>
> Kondisi terkini (14 Sep 2026): **245 tes lulus**, type-check bersih, lint bersih, build produksi berhasil.

---

## A. Akuntansi dan data keuangan

| Kode | Tingkat | Masalah | Dampak bagi pengguna | Lokasi | Rencana | Status |
|---|---|---|---|---|---|---|
| T-01 | 🔴 | SO berstatus *Terkirim* dan Faktur Penjualan dari SO yang sama **sama-sama** membentuk jurnal pendapatan, piutang, HPP, dan pengurangan persediaan | Penjualan, piutang, dan HPP di Laba Rugi/Neraca menjadi **dua kali lipat** pada alur normal "kirim lalu tagih" | `core/gl.js` (buildSOJournals, buildSIJournals), `core/invoice-view.js` | Pendapatan/piutang/PPN dibentuk sekali (oleh faktur bila ada); HPP tetap oleh pengiriman. Lihat [04 §4.1](04-AKUNTANSI.md) | Diperbaiki |
| T-02 | 🔴 | PO *Diterima* dan Faktur Pembelian dari PO yang sama sama-sama membentuk jurnal persediaan & hutang | Hutang usaha dan persediaan di buku besar **dua kali lipat** | `core/gl.js` | Jurnal penerimaan PO dilewati bila PO punya faktur aktif | Diperbaiki |
| T-03 | 🟠 | Faktur yang dibuat dari SO/PO tidak membawa tarif & nilai PPN; nilai faktur = subtotal tanpa PPN | Tagihan ke pelanggan lebih kecil dari pesanan; PPN keluaran/masukan tidak tercatat saat faktur menjadi dasar jurnal | `core/invoice-view.js` (saveInvoice) | Salin `taxRate`, `tax`, `taxInclusive` dari dokumen sumber | Diperbaiki |
| T-04 | 🔴 | Menerapkan Uang Muka menambah log pembayaran bermetode "Down Payment" yang juga membentuk jurnal kas | Kas dan pelunasan piutang/hutang tercatat **dua kali** untuk satu uang muka | `core/sales-purchase-extras.js`, `core/gl.js` | Log pembayaran bermetode "Down Payment" tidak membentuk jurnal kas | Diperbaiki |
| T-05 | 🔴 | Beberapa proses mengubah `item.stock` langsung tanpa melewati modul gudang, padahal total stok dihitung ulang dari stok per gudang | Stok bisa **berlipat atau hilang** setelah mengedit SO/PO yang sudah dikirim/diterima, menghapusnya, memposting retur, penyesuaian, atau penerimaan barang | `core/erp-crud.js` (editSO/editPO/deleteSO/deletePO/editItem), `return-view.js`, `adjust-view.js`, `sales-purchase-extras.js` | Semua mutasi stok lewat fungsi gudang (`Warehouse.addStock/removeStock`) | Diperbaiki |
| T-06 | 🟠 | Dua jalur pembayaran pelanggan/supplier (Log Pembayaran di SO/PO dan Penerimaan/Pembayaran atas faktur) tidak saling mengenali | Pembayaran yang dicatat di kedua tempat menggandakan kas; status SO dan faktur tidak sinkron | `erp-crud.js`, `invoice-view.js`, `sales-purchase-extras.js` | Diputuskan **per faktur** (11 Okt 2026). Detail SO/PO tidak lagi membuat log pembayaran: setelah ada faktur tombolnya membuka penerimaan/pembayaran faktur, sebelum ada faktur menawarkan uang muka untuk pesanan itu. Log lama tetap dihitung; dialog faktur tetap memperingatkan lebih bayar | Selesai |
| T-07 | 🟠 | Menu *Penerimaan Barang* menambah stok tanpa mengubah status PO, tanpa jurnal, tanpa kartu stok; status PO *Diterima* juga menambah stok | Stok bertambah dua kali bila keduanya dipakai; persediaan di buku besar tidak ikut bertambah | `core/sales-purchase-extras.js` | Cegah penambahan ganda (PO yang sudah *Diterima* tidak bisa diterima lagi, dan sebaliknya); jalur baku perlu keputusan | Diperbaiki |
| T-08 | 🔴 | Pengeluaran Lain, Penerimaan Lain, dan Transfer Bank hanya disimpan, tidak membentuk jurnal | Biaya operasional (listrik, sewa, BBM, dll.) **tidak muncul** di Laba Rugi; saldo kas buku besar tidak berkurang | `core/bank-extras.js`, `core/gl.js` | Jurnal otomatis dengan pemetaan kategori → akun ([04 §6](04-AKUNTANSI.md)); pemetaan perlu disetujui | Diperbaiki |
| T-09 | 🟠 | Piutang/hutang dihitung dengan dasar berbeda di tiap layar (daftar SO, umur piutang, kartu piutang, buku besar, dashboard). Umur piutang & kartu piutang menambahkan PPN pada nilai yang sudah termasuk PPN | Angka piutang berbeda antar layar; pengguna tidak tahu mana yang benar | `core/erp-view.js` (_piutangAgingSection, _hutangAgingSection), `erp-crud.js` (showPartyStatement), `modules/dashboard.js` | Satu fungsi perhitungan saldo faktur; hutang berbasis faktur pembelian | Diperbaiki |
| T-10 | 🟡 | Kartu "Kas Tunai / Bank BCA / Bank Mandiri" di halaman Keuangan memakai angka yang diketik manual, bukan saldo buku besar | Saldo kas di layar tidak sama dengan Neraca | `core/erp-view.js` (renderFinance) | Tampilkan saldo dari buku besar; angka manual diberi label jelas | Diperbaiki |
| T-11 | 🟠 | Laporan SPT PPN menghitung 11% dari total yang sudah termasuk PPN, memasukkan dokumen Draft, dan membaca nama pihak dari field yang tidak diisi | Angka PPN di laporan salah; tidak boleh dipakai untuk pelaporan | `core/report-extras.js` (openSPTPPN) | Pakai nilai PPN dari dokumen yang diposting | Diperbaiki |
| T-12 | 🟠 | Retur Penjualan dari **Faktur** tidak memuat baris barang (tipe sumber salah) | Retur atas faktur tidak bisa dibuat | `core/return-view.js` | Perbaiki tipe sumber | Diperbaiki |
| T-13 | 🟠 | Neraca dengan filter tanggal hanya menghitung jurnal dalam rentang (bukan saldo kumulatif); setiap baris ditampilkan sebagai nilai absolut | Neraca per tanggal tertentu salah; saldo negatif (mis. persediaan minus) tampil positif sehingga total tidak cocok | `core/financial-reports.js` | Neraca kumulatif s/d tanggal akhir; tampilkan tanda minus | Diperbaiki |
| T-26 | 🟠 | Migrasi penomoran SO/PO mengganti ID dokumen tetapi hanya memperbarui referensi di Surat Jalan | Log pembayaran, faktur, uang muka, reservasi, dan retur bisa kehilangan tautan ke SO/PO-nya setelah migrasi | `core/doc-migrate.js` | Perbarui semua referensi silang | Diperbaiki |
| T-35 | 🟡 | Data demo tidak konsisten dengan aturan aplikasi: faktur berstatus "Unpaid" (tidak dikenal), tautan `soId` alih-alih `sourceId`, 12 pesanan sintetis qty 1, barang jasa "ongkir" memiliki stok, tanpa saldo awal | Demo menampilkan angka yang tidak masuk akal (persediaan negatif di Neraca, piutang membengkak), menyulitkan validasi dengan pengguna | `src/core/db.js` (defaultData) | Generator data demo baru yang konsisten ([lihat §E](#e-data-demo)) | Diperbaiki |

## B. Alur dokumen dan status

| Kode | Tingkat | Masalah | Dampak | Lokasi | Rencana | Status |
|---|---|---|---|---|---|---|
| T-14 | 🟠 | Tombol Terima/Tolak Penawaran memakai `onclick` inline yang diblokir Content-Security-Policy hosting produksi | Di versi online, penawaran tidak bisa diterima/ditolak (di mode pengembangan tetap berjalan) | `core/quotation-view.js` | Ganti dengan event delegation `data-action` | Diperbaiki |
| T-15 | 🟡 | Penawaran yang sudah diterima bisa dikonversi ke SO/PO berkali-kali; nama barang manual hilang menjadi "Custom Item" | Pesanan ganda tanpa sengaja; deskripsi barang hilang | `core/quotation-view.js` | Tandai penawaran sudah dikonversi; simpan nama manual | Diperbaiki |
| T-16 | 🟠 | Tombol **Cetak** Faktur Penjualan/Pembelian memanggil fungsi cetak yang hanya mengenal SO/PO/DO | Jendela cetak berisi "undefined" | `core/invoice-view.js`, `core/erp-crud.js` (printDocument) | Template cetak faktur | Diperbaiki |
| T-17 | 🟡 | Form Edit SO/PO tidak memvalidasi perpindahan status (daftar dan aksi massal sudah memvalidasi) | Status bisa dilompati lewat form, melewati aturan reservasi/stok | `core/erp-crud.js` (editSO/editPO) | Pakai `DocEngine.canTransition` di form | Diperbaiki |
| T-34 | ⚪ | Dua skema penomoran berjalan bersamaan (`SO.YYYY.MM.NNN` berdasarkan tanggal hari ini dan `SO.YYYY.MM.NNNNN` berdasarkan tanggal dokumen); tampilan mengganti awalan `SI.`/`PI.` menjadi `SO.`/`PO.` | Nomor dokumen tidak seragam; nomor faktur bisa tampil seperti nomor pesanan | `src/core/helpers.js` (nextId), `core/doc-engine.js`, `core/erp-view.js` (docNum) | Satu skema untuk dokumen baru; format lama tetap dibaca | Diperbaiki |
| T-42 | ⚪ | Menghapus Biaya Akrual yang sudah diposting tidak menghapus jurnalnya | Jurnal "yatim" tanpa dokumen sumber | `core/budget-gl-extras.js` | Cegah hapus akrual terposting (tawarkan jurnal balik) | Diperbaiki |

## C. Navigasi dan tampilan

| Kode | Tingkat | Masalah | Dampak | Lokasi | Rencana | Status |
|---|---|---|---|---|---|---|
| T-18 | 🟠 | Saat membuka menu yang tampilannya dipakai beberapa grup (mis. *Customer* di Penjualan, *Purchase Invoice* di Pembelian, *Bank Transfer* di Kas & Bank), sub-menu melompat ke grup lain | Pengguna "tersesat": menu yang baru diklik hilang dari panel, grup aktif di sidebar berpindah | `ui/nav.js` (navigate, flyout click) | Utamakan grup yang sedang aktif / grup item yang diklik | Diperbaiki |
| T-19 | 🟡 | Klik ikon grup di sidebar hanya membuka sub-menu tanpa membuka halaman; menu *Chart of Accounts / Trial Balance / Journal Voucher* membuka halaman yang sama tanpa memilih tab | Klik terasa "tidak terjadi apa-apa"; menu tidak sesuai isi halaman | `ui/nav.js`, `core/menu-router.js`, `core/gl-view.js` | Rute ke tab yang tepat; sidebar berlabel | Diperbaiki |
| T-20 | 🟡 | Pengaturan menampilkan "Login sebagai: [object Object]" | Terlihat rusak | `core/erp-view.js` (renderSettings) | Tampilkan nama & peran pengguna | Diperbaiki |
| T-21 | 🟡 | Pencarian global mencari nama pelanggan di field `customerName`, padahal SO menyimpan `customer`; faktur & surat jalan tidak ikut dicari | Mencari nama pelanggan tidak menemukan pesanannya | `core/erp-view.js` (handleSearch) | Cari di field yang benar + faktur & surat jalan | Diperbaiki |
| T-22 | 🟠 | Widget dashboard: Laba/Rugi & Beban selalu 0 (membaca format jurnal lain), Penjualan/Pembelian memakai field hasil impor, widget "Arus Kas" sebenarnya grafik stok | Dashboard tidak bisa dipercaya untuk keputusan | `modules/dashboard.js` | Dashboard baru dari sumber data yang benar ([09](09-AUDIT-UX.md)) | Diperbaiki |
| T-23 | 🟡 | Notifikasi stok minimum membaca `minStock` (data memakai `min`) sehingga tidak pernah muncul; ikon notifikasi tidak ada; tautan faktur jatuh tempo menuju halaman yang salah | Peringatan penting tidak pernah terlihat | `src/core/notifications.js` | Perbaiki field, ikon, tautan | Diperbaiki |
| T-24 | 🟠 | Kartu "Impor Backup JSON" di Pengaturan memanggil fungsi yang tidak tersedia secara global; data impor tidak tersimpan | Pengguna mengira backup sudah dipulihkan padahal belum (jalur *Kelola Backup* berjalan normal) | `core/erp-view.js` | Arahkan ke jalur impor yang benar | Diperbaiki |
| T-25 | 🟠 | Qty pada baris dokumen dibaca sebagai bilangan bulat | Kuantitas desimal (mis. 12,5 Ton) terpotong menjadi 12 | `core/erp-crud.js`, `adjust-view.js`, `warehouse-view.js`, `sales-purchase-extras.js` | Terima desimal | Diperbaiki |
| T-28 | ⚪ | Daftar Laporan: kartu *Audit Journal* dan *Account History* membuka halaman Keuangan umum | Laporan yang dimaksud tidak terbuka | `core/report-extras.js` | Rute ke fitur yang benar | Diperbaiki |
| T-29 | 🟡 | Menu "🤖 AI Business Analysis" berisi aturan sederhana, bukan AI; laba kotor dihitung Σ SO − Σ PO | Label menjanjikan hal yang tidak ada; angka laba menyesatkan | `core/report-extras.js` | Ganti nama menjadi "Analisis Bisnis"; angka dari buku besar | Diperbaiki |
| T-30 | 🟡 | Kartu "Laba Rugi" di halaman Keuangan = total SO − total PO (termasuk PPN dan pesanan belum dikirim) | Bukan laba akuntansi; berbeda dengan laporan Laba Rugi | `core/erp-view.js` (renderFinance) | Ambil dari buku besar | Diperbaiki |
| T-31 | 🟡 | Template cetak memakai alamat & telepon perusahaan tertulis di kode bila profil kosong; cetak PO menulis "PPN (0.11%)" dan memakai ID internal; PPh 23 2% selalu tampil | Dokumen cetak bisa memuat alamat perusahaan lain dan angka pajak yang keliru | `core/erp-crud.js`, `modules/settings.js` | Pakai profil perusahaan; perbaiki format | Diperbaiki |
| T-32 | ⚪ | Kategori dan filter barang tertulis di kode (Granit, Marmer, Andesit, …) dan teks "batu alam", tidak sesuai kategori pada data | Filter kosong; istilah tidak sesuai bisnis | `core/erp-crud.js`, `core/erp-view.js` | Ambil kategori dari data master | Diperbaiki |
| T-33 | ⚪ | Layar login berbahasa Inggris dan mengisi username "admin" otomatis | Tidak konsisten; memberi petunjuk akun | `app.html`, `src/core/auth.js` | Bahasa Indonesia; kolom kosong | Diperbaiki |

## D. Rekayasa, sinkronisasi, dan keamanan

| Kode | Tingkat | Masalah | Dampak | Lokasi | Rencana | Status |
|---|---|---|---|---|---|---|
| T-27 | 🔴 (mode cloud) | Beberapa koleksi tidak ikut sinkron ke Firestore: jurnal manual (Jurnal Umum), anggaran, penggajian, uang muka, target penjualan, harga supplier, pengeluaran/penerimaan lain, transfer bank, rekening koran, permintaan barang, job costing, kontak, biaya akrual, penerimaan barang (sebagian) | Pada mode cloud data tersebut **hilang** saat aplikasi dimuat ulang atau dibuka di perangkat lain (mode lokal tidak terdampak) | `src/core/db.js` (COLLECTIONS), `firestore.rules`, `functions/backup.js` | Tambahkan ke daftar sinkron + aturan akses; deploy aturan manual | Diperbaiki di kode; `firestore.rules` dan functions perlu di-deploy manual |
| T-38 | ⚪ | 12 error type-check pada `tests/rbac.test.ts` dan `tests/twofa-flow.test.ts` (pengetikan `window.RBAC` dan union type hasil login) | `npm run type-check` gagal | `tests/` | Perbaiki anotasi tipe | Diperbaiki |
| T-39 | ⚪ | File `.eslintignore` sudah tidak didukung ESLint 10 (daftar abaikan sudah ada di `eslint.config.js`) | Peringatan setiap lint | root | Hapus file | Diperbaiki |
| T-40 | ⚪ | Dokumentasi lama merujuk file yang tidak ada, hosting Vercel, skrip yang sudah dihapus, port & cara login yang salah | Orang baru salah langkah saat instalasi/deploy | `README.md`, `QUICK_START.md`, `PROJECT_STRUCTURE.md`, `docs/API.md`, `docs/DEPLOYMENT.md` | Ditulis ulang | Diperbaiki |
| T-41 | ⚪ | Nomor Pengeluaran Lain dibuat dari jumlah data (bisa ganda setelah hapus); Riwayat Bank tidak memuat Penerimaan/Pembayaran faktur | Nomor ganda; riwayat bank tidak lengkap | `core/bank-extras.js` | Penomoran lewat DocEngine; riwayat dari buku besar | Diperbaiki |
| T-43 | ⚪ | Hapus pelanggan/supplier dicek berdasarkan **nama**; ganti nama hanya diteruskan ke sebagian dokumen | Data yatim atau riwayat terputus setelah ganti nama | `core/erp-crud.js` | Cek berdasarkan ID + nama | Diperbaiki |
| T-44 | ⚪ | Retur dan faktur tanpa SO memakai harga beli statis, nilai persediaan di halaman Barang = stok × harga beli | Nilai persediaan sedikit berbeda dengan buku besar | `core/gl.js`, `core/erp-view.js` | Pakai harga pokok rata-rata | Perlu keputusan (metode penilaian) |

## E. Data demo

Data demo dipakai untuk presentasi dan validasi, **bukan** data perusahaan. Dibuat oleh `src/core/demo-data.js` (T-35) saat database masih kosong atau Reset Data dijalankan:

- Relatif terhadap tanggal hari ini; hasilnya sama setiap kali dibuat (deterministik).
- **Usaha utama: pengambilan (trading)**, tiga bulan penuh ditambah bulan berjalan (mis. Juli–Oktober 2026 bila dibuat pada Oktober 2026). Barang yang diambil di supplier: batu split 1-2 & 2-3 cm, abu batu (supplier batu), agregat slag 10-20 & 20-30 mm (supplier slag), satuan Ton. Setiap bulan beberapa PO pelanggan (280–700 ton) dipasangkan dengan PO supplier dengan jumlah sama pada hari yang sama; surat jalan ⌈jumlah ÷ 35⌉ dibuat saat PO dibuka; truk pelanggan mengambil pada hari kerja (2–3 truk sehari, netto sekitar 34–39 ton) dan ditimbang.
- Kasus pengambilan: PO yang ditutup karena kuota terpenuhi; PO yang dibuka akhir bulan dan ditutup karena cut-off dengan sisa tonase, dilanjutkan PO supplier baru tanggal 1 bulan berikutnya untuk PO pelanggan yang sama; dua pelanggan mengambil barang yang sama di hari yang sama; satu truk dengan tujuan diubah; harga supplier naik di pertengahan bulan (Harga Supplier dengan tanggal berlaku, truk sejak tanggal itu memakai harga baru); satu **perubahan timbangan** terbuka (truk ditagih 30 ton, rekap berikutnya mengubahnya menjadi 35 ton); truk minggu berjalan belum ditagih.
- Penagihan pengambilan: pelanggan ditagih per minggu setelah minggunya selesai (satu faktur per pelanggan per minggu, satu baris per truk) dan dibayar seperti faktur lain; supplier menagih sekali per bulan di awal bulan berikutnya (dengan nomor faktur supplier) dan dibayar menjelang jatuh tempo.
- **Barang stok gudang** lima bulan penuh ditambah bulan berjalan: pasir beton, pasir urug, sirtu, batu belah (satuan M3) lewat PO → penerimaan barang → faktur → pembayaran dan penawaran → SO → surat jalan → faktur → penerimaan (lunas, bertahap, terlambat); retur, uang muka, penyesuaian stok, transfer gudang.
- **Kas & Bank:** sewa, BBM & perawatan armada, listrik & air dari rekening BCA; ATK, transport, dan entertain dari kas kecil (diisi ulang dari BCA setiap awal bulan); setoran tunai penerimaan pelanggan ke bank dua kali sebulan; bunga bank setiap akhir bulan; penggajian bulanan; jurnal saldo awal.
- 8 pelanggan dan 5 supplier fiktif berbentuk PT/CV/UD/Toko dengan kota, termin, dan cara bayar berbeda; truk pelanggan dengan sopir dan nomor polisi; 2 gudang; 3 rekening kas/bank; 8 karyawan; 3 truk perusahaan.
- Barang dalam keluarga produk yang sudah ada di aplikasi (material curah, satuan Ton/M3) — **daftar barang sebenarnya REQUIRES USER CONFIRMATION**.
- Aturan aplikasi dijaga dan diuji (`tests/demo-data.test.ts`): hanya status yang dikenal mesin dokumen, nomor dokumen unik, stok per gudang = total stok dan tidak pernah minus, neraca saldo seimbang, persediaan di buku besar = nilai stok, saldo kas/bank tidak pernah minus di hari mana pun; untuk pengambilan: setiap surat jalan terhubung ke PO pengambilan dan PO pelanggannya, kuota dan batas pengambilan dipatuhi, setiap truk ditagih paling banyak sekali per sisi, harga beli sesuai Harga Supplier yang berlaku.
- Kasus untuk dashboard dan meeting: pengambilan belum ditagih, PO pengambilan berjalan, perubahan timbangan, piutang dan hutang lewat jatuh tempo, barang di bawah stok minimum, pesanan dalam setiap status (draft, dikonfirmasi, dalam perjalanan, terkirim tanpa faktur, dibatalkan), penawaran dikirim/diterima/ditolak, retur sebagian.

---

## Riwayat pembaruan status

| Tanggal | Perubahan |
|---|---|
| 13 Sep 2026 | Dokumen dibuat dari hasil review kode |
| 14 Sep 2026 | Status diperbarui: semua temuan diperbaiki kecuali T-06 dan T-44 (perlu keputusan); aturan Firestore dan functions untuk T-27 masih perlu di-deploy |
| 11 Okt 2026 | T-06 selesai: pembayaran dicatat per faktur, sebelum faktur sebagai uang muka |
