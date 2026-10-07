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

**Status:** keputusan 1 dan 2 sudah diterapkan — `ui/view-tabs.js` dihapus; tab dokumen tampil di bawah judul modul hanya bila ada dokumen terbuka, maksimal 5, dan hanya di dalam modulnya (dari halaman lain, detail dokumen tampil sebagai dialog).

---

## 3. Arah struktur navigasi

Rincian menu lama → baru ada di [02-PETA-MODUL-DAN-NAVIGASI.md](02-PETA-MODUL-DAN-NAVIGASI.md). Prinsipnya:

- **Satu sidebar berlabel** (bisa diciutkan menjadi ikon), grup mengikuti alur kerja: Ringkasan → Entri Harian → Pengambilan → Penjualan → Pembelian → Persediaan → Kas & Bank → Akuntansi → Aset Tetap → Laporan → Data Master → Pengaturan. Alur pengambilan (inti usaha) berada dalam satu grup; **Entri Harian** mengumpulkan tugas rutin admin dalam satu halaman.
- **Bahasa Indonesia** untuk semua label; istilah Inggris dipertahankan hanya bila lebih dikenal (Sales Order, Purchase Order, PPN, e-Faktur).
- **Tidak ada fitur yang dihapus**; fitur yang jarang dipakai tetap ada di grupnya.
- Menu disembunyikan sesuai peran (RBAC) seperti sebelumnya, dan dapat dipersempit per pengguna lewat **Akses menu**.
- **Keterbacaan:** ukuran teks bisa dipilih per perangkat di menu pengguna — Normal, Besar (bawaan), Sangat besar; seluruh tampilan ikut membesar.

---

## 4. Dashboard — "apa yang perlu diketahui pemilik sekarang?"

Dashboard dibangun ulang hanya dari data yang benar-benar dicatat aplikasi. Tidak ada KPI rekaan.

| Blok | Pertanyaan yang dijawab | Sumber data |
|---|---|---|
| Kas & bank | Berapa uang yang tersedia? | Saldo akun kas/bank di buku besar |
| Piutang | Berapa tagihan belum dibayar, berapa yang lewat jatuh tempo? | Faktur Penjualan belum lunas − penerimaan, SO terkirim belum difakturkan, pengambilan belum ditagih |
| Hutang | Berapa kewajiban ke supplier, apa yang segera jatuh tempo? | Faktur Pembelian belum lunas − pembayaran, penerimaan/pengambilan belum difakturkan |
| Penjualan & laba kotor bulan ini | Bagaimana bulan ini dibanding hari yang sama bulan lalu? | Jurnal pendapatan & HPP |
| Alur pengambilan | Berapa PO supplier terbuka dan sisa kuotanya, surat jalan siap, truk yang sudah mengambil bulan ini; di sisi pelanggan: belum ditagih → ditagih belum lunas → lunas; di sisi supplier: belum ditagih supplier → ditagih belum dibayar → dibayar | PO pengambilan, truk, faktur dari truk (nilai termasuk PPN) |
| Tagihan pelanggan | Per pelanggan: berapa belum ditagih, ditagih belum lunas, lewat jatuh tempo, diterima bulan ini? | Saldo terbuka (sama dengan umur piutang) dan penerimaan |
| PO pengambilan berjalan | PO mana yang hampir habis kuotanya atau mendekati/lewat batas pengambilan? | PO pengambilan: kuota, surat jalan terpakai, batas |
| Tonase per bulan | Berapa ton diambil per bulan (6 bulan), naik atau turun; per pelanggan bulan ini; per PO 3 bulan | Netto truk per bulan, per satuan |
| Perlu tindakan | Pengambilan belum ditagih, perubahan timbangan belum ditindaklanjuti, PO lewat cut-off / hampir penuh, tagihan supplier berbeda dari pengambilan; pesanan dikonfirmasi belum dikirim, surat jalan pending, penawaran menunggu jawaban, draft | Status dokumen dan data pengambilan |
| Jatuh tempo terdekat | Tagihan dan kewajiban mana yang harus diurus lebih dulu? | Saldo faktur penjualan & pembelian |
| Stok menipis | Barang apa yang harus dibeli? | Stok vs stok minimum |
| Tren 6 bulan | Arah penjualan vs pembelian | Jurnal per bulan |
| Aktivitas terbaru | Apa yang baru terjadi? | Log audit (bila kosong: dokumen terbaru) |

Blok bisa disembunyikan per browser lewat **Atur Tampilan**. Selama data perusahaan belum lengkap, dashboard menampilkan daftar periksanya. Blok dan baris pengambilan hanya tampil untuk pengguna yang boleh membuka modulnya (Pembelian untuk alur pengambilan, PO berjalan, tonase, dan timbangan; Penjualan untuk tagihan pelanggan); tahap dan baris di blok tersebut membuka menu terkait.

**REQUIRES USER CONFIRMATION:** urutan prioritas blok dan apakah ada angka lain yang dipantau pemilik setiap hari (mis. target penjualan, pengiriman hari ini).

---

## 5. Arah desain visual

Target: **perangkat lunak bisnis yang tenang, rapi, dan mudah dibaca** — rasa aplikasi Mac yang matang, tanpa meniru merek mana pun.

| Aspek | Sebelum | Arah baru |
|---|---|---|
| Warna | Aksen emerald + warna per grup + gradien ungu | **Satu aksen biru (#4169D7)** untuk tombol utama, pilihan aktif (tab, periode, menu yang terbuka), tautan, dan fokus; warna lain hanya untuk status (hijau lunas/uang masuk, kuning perhatian, merah bahaya/lewat jatuh tempo) |
| Latar & permukaan | Kaca buram, gradien animasi | Latar biru sangat muda; setiap bagian berupa **kartu putih** tanpa garis tepi (cincin tipis + bayangan lembut), jarak antarkartu 16 px; garis tipis hanya di dalam kartu |
| Tipografi | Outfit + Instrument Serif + JetBrains Mono | Satu keluarga sans yang sangat terbaca (Geist, cadangan font sistem), angka **tabular**, Geist Mono hanya untuk nomor dokumen/kode akun; hierarki lewat ukuran & ketebalan, bukan judul raksasa |
| Spasi | Tidak seragam | Kelipatan 4 px; kepadatan nyaman untuk data |
| Radius | 6–24 px bercampur | 6 (input & chip), 8 (tombol & menu), 10 (dialog), 12 (kartu) |
| Kartu | Banyak bayangan & gradien | Putih dan datar, padding 24/28 px (HP 18–20/16 px); angka ringkas (KPI, statistik) juga berupa kartu kecil |
| Tombol | Beragam | Tombol utama biru dengan gradasi halus dan kilau tipis di tepi atas; tombol kedua putih bergaris tipis; ditekan sedikit mengecil. Hapus di dialog edit berupa teks merah di kiri, merah penuh hanya pada "Ya, hapus". Tinggi tetap besar: 36 px, 44 px di layar sentuh |
| Tabel | Beragam | Header lengket, baris 40 px, angka rata kanan tabular, status berupa titik + teks, aksi selalu terlihat |
| Form | Panjang tanpa kelompok | Label di atas, penanda wajib, bagian berjudul, validasi di tempat |
| Status | Pil berwarna penuh | Badge lembut (latar transparan + teks berwarna) yang konsisten di semua modul |
| Keadaan kosong/muat/error | Emoji & teks teknis | Pesan singkat berbahasa sehari-hari + satu tindakan yang jelas |
| Animasi | Latar bergerak, transisi beragam | Transisi singkat (150–200 ms) hanya untuk perubahan keadaan; menghormati *reduced motion* |
| Tema gelap | Warna yang dibalik | Grafit, berlapis seperti tema terang: latar & topbar paling terang, sidebar di tengah, kartu & dialog paling gelap; aksen biru lebih muda untuk teks dan tautan; grafik & tooltip mengikuti tema |

**Status penerapan:** token warna terang dan gelap di `style.css` dipakai di seluruh halaman termasuk modul tambahan; font Geist; ikon garis menggantikan emoji; status berupa titik + teks; kartu putih di latar biru muda; grafik dashboard mengikuti tema. Masih tersisa: sebagian tabel dan kartu statistik di modul tambahan memakai gaya inline.

**Tidak dilakukan:** mengganti identitas warna, menambah animasi dekoratif, menambah fitur "AI", membuat grafik tanpa arti.
