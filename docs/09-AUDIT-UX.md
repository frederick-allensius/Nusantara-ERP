# 09 — Audit Pengalaman Pengguna (UX) dan Arah Desain

> **Tujuan:** menjelaskan hambatan yang dialami pengguna saat memakai aplikasi, **mengapa** hambatan itu terjadi, dan arah perbaikan tampilan.
>
> **Pengguna yang diasumsikan** (🟡 dugaan dari peran di aplikasi — **REQUIRES USER CONFIRMATION**): pemilik usaha, admin kantor, staf akunting, staf penjualan, staf gudang/logistik. Diasumsikan mereka paham bisnisnya, tetapi **tidak** harus paham istilah ERP.

---

## 1. Ringkasan temuan

| Kode | Masalah | Mengapa terjadi | Dampak bagi pengguna |
|---|---|---|---|
| U-01 | **Empat lapis navigasi**: sidebar ikon → panel sub-menu → bar tab halaman → tab dokumen di dalam modul | Setiap lapis ditambahkan untuk meniru pola Accurate Online | Pengguna harus menebak "saya sedang di mana"; layar sempit habis untuk navigasi |
| U-02 | Sidebar hanya ikon tanpa label; tiap grup punya warna sendiri | Rail ringkas 64 px | Pengguna harus menghafal ikon; warna tidak membawa arti |
| U-03 | **Bahasa campur**: menu berbahasa Inggris gaya Accurate (Receive Item, Other Deposit, FA Disposition, Fiscal FA Category, Job Costing), isi halaman Indonesia, layar login Inggris | Label menu disalin dari struktur Accurate | Admin awam tidak mengerti menu; istilah yang sama muncul dengan dua nama |
| U-04 | Sub-menu **melompat** ke grup lain saat membuka menu yang tampilannya dipakai bersama (T-18) | Pencarian grup memilih grup pertama yang memuat halaman tersebut | Menu yang baru diklik hilang dari panel; terasa seperti bug |
| U-05 | Judul halaman tidak sesuai menu: *Bank Transfer*, *Budget*, *Payroll* tampil di halaman "Keuangan"; *Uang Muka* dan *Target* di halaman "Penjualan" | Fitur tambahan disuntikkan ke halaman "induk" | Pengguna tidak yakin sudah membuka fitur yang benar |
| U-06 | Dashboard menampilkan angka 0 atau keliru, label Inggris, grafik "Arus Kas" berisi stok barang (T-22) | Widget membaca format data impor, bukan data aplikasi | Pemilik tidak bisa memakai dashboard untuk mengambil keputusan |
| U-07 | Status tidak konsisten: pilihan status memuat status impor (Waiting on Process, Partially Processed), label Inggris/Indonesia campur, satu status SO mencampur **pengiriman** dan **pembayaran** | Status tampilan tidak mengikuti registri dokumen | Pengguna bingung memilih status; laporan per status tidak bisa dipercaya |
| U-08 | **Efek akuntansi tidak terlihat**: mengubah SO ke *Terkirim* diam-diam mengurangi stok dan membentuk jurnal | Mesin jurnal bekerja di latar tanpa umpan balik | Pengguna tidak sadar dampak klik; kesalahan status langsung mengubah laporan |
| U-09 | Pola koreksi terbalik: dokumen berefek (SO/PO) bisa dihapus bebas, sedangkan dokumen keuangan (faktur, penerimaan) tidak bisa dibatalkan sama sekali | Fitur batal belum dibuat untuk dokumen keuangan | Pengguna memakai jalan pintas yang merusak jejak (lihat [05](05-SIKLUS-STATUS-DAN-KOREKSI.md)) |
| U-10 | Tampilan ramai: efek kaca (blur), gradien animasi di latar, warna aksen per grup, kartu gradien ungu di Pengaturan, emoji sebagai ikon (🚧, 🤖), ratusan gaya inline | Gaya bertumpuk dari beberapa tahap pengembangan | Perhatian terpecah; teks sekunder kurang kontras; kesan tidak konsisten |
| U-11 | Tabel: angka tidak selalu rata kanan/tabular, aksi baris hanya muncul saat hover, keadaan kosong berbeda-beda | Tiap modul membuat tabel sendiri | Sulit membandingkan nominal; aksi tidak terlihat di layar sentuh |
| U-12 | Form: pelanggan/supplier bisa diketik bebas (nama baru tidak masuk master), qty tidak menerima desimal (T-25), bagian form tidak dikelompokkan | Datalist teks bebas; `parseInt` | Data pelanggan ganda; kuantitas Ton/M3 salah |
| U-13 | Pesan kesalahan teknis ("Halaman X gagal dimuat" + pesan error mentah) | Fallback pengembang | Pengguna panik, tidak tahu harus apa |
| U-14 | Grafik dashboard: tooltip putih di mode gelap, font grafik tidak dimuat | Warna grafik tidak mengikuti tema | Grafik terlihat "tempelan" |
| U-15 | Aksesibilitas: tombol ikon tanpa label teks, fokus keyboard tidak terlihat jelas | Rail ikon & tombol aksi ikon | Sulit untuk pengguna keyboard/pembaca layar |

---

## 2. Investigasi antarmuka tab bergaya browser

Aplikasi punya **dua** sistem tab di dalam halaman:

| | Tab halaman (`ui/view-tabs.js`) | Tab dokumen (`ui/doc-tabs.js`) |
|---|---|---|
| Wujud | Bar tab di atas konten; setiap halaman yang pernah dibuka menjadi tab | Baris tab di dalam modul: "Daftar" + dokumen yang sedang dibuka |
| Isi tab | Satu tab per *halaman teknis* (mis. "Keuangan"), bukan per fitur | Detail SO, PO, Surat Jalan, Barang, Aset, Pelanggan, Supplier, Faktur |
| Disimpan | `localStorage` (tab muncul lagi saat login berikutnya) | Selama sesi |
| Masalah yang ingin diselesaikan | Berpindah cepat antar modul tanpa kehilangan posisi | Membuka beberapa dokumen sekaligus dan bolak-balik ke daftar |

**Pertanyaan evaluasi dan jawabannya:**

| Pertanyaan | Tab halaman | Tab dokumen |
|---|---|---|
| Masalah nyata apa yang diselesaikan? | Lemah — sidebar sudah memberi akses satu klik ke setiap modul | Nyata — aplikasi **tidak punya URL per dokumen**, sehingga tab browser tidak bisa dipakai untuk membuka dua dokumen |
| Apakah membantu pengguna? | Label tab sering salah (tab "Keuangan" padahal isinya Transfer Bank); 15 fitur berbagi satu tab | Membantu saat membandingkan pesanan dengan faktur/surat jalan |
| Apakah ada alur kerja yang bergantung? | Tidak ada logika bisnis yang bergantung | Tidak ada logika bisnis; hanya cara menampilkan detail |
| Apakah menduplikasi tab browser? | Ya, dan menambah lapis navigasi ketiga | Tidak (browser tidak bisa membuka dokumen tertentu) |
| Apakah mempersulit navigasi? | Ya — pengguna harus mengelola tab yang tidak dibuat dengan sengaja | Sedikit — bila tampilannya sama menonjol dengan navigasi utama |
| Pola yang lebih baik? | Sidebar berlabel + judul halaman yang jelas | Tab dokumen yang ringan dan konsisten di dalam modul |

**Keputusan:**
1. **Tab halaman dihapus.** Perannya digantikan sidebar berlabel dengan grup yang bisa dibuka-tutup, dan judul halaman yang selalu sesuai menu.
2. **Tab dokumen dipertahankan dan dirapikan**: tampil sebagai baris tab sekunder yang tenang di bawah judul modul, dengan tombol tutup, jumlah tab dibatasi, dan perilaku sama di semua modul.
3. **REQUIRES USER CONFIRMATION:** apakah staf memang sering membuka beberapa dokumen sekaligus? Bila tidak, tab dokumen bisa diganti panel detail tunggal pada tahap berikutnya.

---

## 3. Arah struktur navigasi

Rincian menu lama → baru ada di [02-PETA-MODUL-DAN-NAVIGASI.md](02-PETA-MODUL-DAN-NAVIGASI.md). Prinsipnya:

- **Satu sidebar berlabel** (bisa diciutkan menjadi ikon), grup mengikuti alur kerja: Ringkasan → Penjualan → Pembelian → Persediaan → Kas & Bank → Akuntansi → Aset Tetap → Laporan → Data Master → Pengaturan.
- **Bahasa Indonesia** untuk semua label; istilah Inggris dipertahankan hanya bila lebih dikenal (Sales Order, Purchase Order, PPN, e-Faktur).
- **Tidak ada fitur yang dihapus**; fitur yang jarang dipakai tetap ada di grupnya.
- Menu disembunyikan sesuai peran (RBAC) seperti sebelumnya.

---

## 4. Dashboard — "apa yang perlu diketahui pemilik sekarang?"

Dashboard dibangun ulang hanya dari data yang benar-benar dicatat aplikasi. Tidak ada KPI rekaan.

| Blok | Pertanyaan yang dijawab | Sumber data |
|---|---|---|
| Kas & bank | Berapa uang yang tersedia? | Saldo akun kas/bank di buku besar |
| Piutang | Berapa tagihan belum dibayar, berapa yang lewat jatuh tempo? | Faktur Penjualan belum lunas − penerimaan |
| Hutang | Berapa kewajiban ke supplier, apa yang segera jatuh tempo? | Faktur Pembelian belum lunas − pembayaran |
| Penjualan & laba kotor bulan ini | Bagaimana bulan ini dibanding bulan lalu? | Jurnal pendapatan & HPP |
| Perlu tindakan | Pesanan dikonfirmasi belum dikirim, surat jalan pending, penawaran menunggu jawaban, draft | Status dokumen |
| Stok menipis | Barang apa yang harus dibeli? | Stok vs stok minimum |
| Tren 6 bulan | Arah penjualan vs pembelian | Jurnal per bulan |
| Aktivitas terbaru | Apa yang baru terjadi? | Log audit |

**REQUIRES USER CONFIRMATION:** urutan prioritas blok dan apakah ada angka lain yang dipantau pemilik setiap hari (mis. target penjualan, pengiriman hari ini).

---

## 5. Arah desain visual

Target: **perangkat lunak bisnis yang tenang, rapi, dan mudah dibaca** — rasa aplikasi Mac yang matang, tanpa meniru merek mana pun.

| Aspek | Sebelum | Arah baru |
|---|---|---|
| Warna | Aksen emerald + warna per grup + gradien ungu | **Satu aksen emerald** yang sudah ada; warna lain hanya untuk status (hijau berhasil, kuning perhatian, merah bahaya, biru info) |
| Latar & permukaan | Kaca buram, gradien animasi | Permukaan datar, garis tipis (hairline), kedalaman halus hanya untuk popover & modal |
| Tipografi | Outfit + Instrument Serif + JetBrains Mono | Satu keluarga sans yang sangat terbaca (Inter, cadangan font sistem), angka **tabular**, mono hanya untuk nomor dokumen/kode akun; hierarki lewat ukuran & ketebalan, bukan judul raksasa |
| Spasi | Tidak seragam | Kelipatan 4 px; kepadatan nyaman untuk data |
| Radius | 6–24 px bercampur | 6 (kontrol kecil), 8 (input/tombol), 12 (kartu), 14 (modal) |
| Kartu | Banyak bayangan & gradien | Datar, border halus, isi yang padat informasi |
| Tabel | Beragam | Header lengket, baris 40 px, angka rata kanan tabular, status berupa titik + teks, aksi selalu terlihat |
| Form | Panjang tanpa kelompok | Label di atas, penanda wajib, bagian berjudul, validasi di tempat |
| Status | Pil berwarna penuh | Badge lembut (latar transparan + teks berwarna) yang konsisten di semua modul |
| Keadaan kosong/muat/error | Emoji & teks teknis | Pesan singkat berbahasa sehari-hari + satu tindakan yang jelas |
| Animasi | Latar bergerak, transisi beragam | Transisi singkat (150–200 ms) hanya untuk perubahan keadaan; menghormati *reduced motion* |
| Tema gelap | Warna yang dibalik | Dirancang terpisah: permukaan bertingkat, border tipis terang, teks sekunder kontras cukup, grafik & tooltip mengikuti tema |

**Tidak dilakukan:** mengganti identitas warna, menambah animasi dekoratif, menambah fitur "AI", membuat grafik tanpa arti.
