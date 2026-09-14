# Skrip Demo & Talking Points — Nusantara ERP

> Untuk pitch ke **end user** (UMKM / pemilik bisnis). Durasi target: **12–15 menit**
> (8 menit demo + sisanya tanya-jawab). Bahasa: santai, fokus ke masalah mereka,
> bukan istilah teknis.

---

## 0. Persiapan H-1 (checklist anti-gagal)

- [ ] Jalankan **mode offline** untuk demo: `npm run dev:local`
      → app jalan 100% lokal, **tanpa internet**, tanpa error Firebase. Paling aman.
- [ ] Tes login: username **admin**, password awal **admin123** (diminta ganti saat
      login pertama — siapkan password baru)
- [ ] Buka tiap menu, pastikan terisi data & tidak ada error
- [ ] Reset ke data demo bersih bila perlu (**Pengaturan → Pengaturan Umum → Reset
      Data**; data demo dibuat relatif terhadap tanggal hari ini)
- [ ] Siapkan **video rekaman layar** + screenshot tiap modul (plan B kalau
      laptop/jaringan bermasalah)
- [ ] Charge laptop, matikan notifikasi, zoom browser ke 110–125% biar terbaca
- [ ] Siapkan 1 contoh data calon pelanggan (nama perusahaannya) untuk demo yang
      terasa personal

> **Kenapa mode offline?** Saat dijalankan dengan Firebase, app berkali-kali
> gagal auto-backup ke cloud (izin ditolak) dan memunculkan error di belakang
> layar. Untuk pitch, mode offline = nol gangguan, dan justru memperkuat pesan
> "data Anda aman di perangkat sendiri".

---

## 1. Pembukaan (60 detik) — pukul masalahnya dulu

> "Pak/Bu, boleh saya tanya — sekarang catatan penjualan, stok, sama keuangan
> dicatat di mana? Excel terpisah-pisah? Buku? Nah, masalahnya biasanya: stok di
> catatan beda sama stok asli, laporan untung-rugi baru ketahuan akhir bulan, dan
> kalau file-nya kena virus atau hilang… repot."

**Jangan** langsung buka aplikasi. Bangun dulu rasa "iya nih, ini masalah saya".

Tiga rasa sakit yang umum (pilih yang paling kena ke calon Anda):
- Stok tidak sinkron → barang dijanjikan ada, ternyata habis.
- Tidak tahu posisi kas & piutang real-time → kaget pas tagihan jatuh tempo.
- Data tersebar di banyak Excel → susah dirangkum, rawan hilang.

---

## 2. Solusi dalam 1 kalimat (30 detik)

> "Nusantara ERP itu satu aplikasi untuk **jualan, pembelian, stok, dan keuangan**
> — semuanya nyambung otomatis, jalan walau **tanpa internet**, dan datanya
> **tersimpan di perangkat Anda sendiri**."

---

## 3. Demo alur bisnis (6–7 menit) — INI BAGIAN UTAMA

> Aturan emas: **jangan tur menu satu per satu.** Ceritakan **satu transaksi
> nyata** dari awal sampai akhir, supaya kelihatan modulnya saling terhubung.

### Langkah 0 — Buka Ringkasan (45 dtk)
- Tunjuk angka yang sudah hidup: **kas & bank, piutang, hutang, penjualan bulan
  ini, tren 6 bulan, yang perlu ditindaklanjuti, jatuh tempo, stok menipis**.
- Talking point:
  > "Begitu buka, langsung kelihatan kondisi bisnis hari ini — nggak perlu buka
  > lima file Excel."

### Langkah 1 — Pelanggan pesan → buat **Pesanan Penjualan** (1,5 mnt)
- Menu **Penjualan → Pesanan Penjualan** → buat pesanan baru → pilih pelanggan (pakai nama calon Anda)
  → tambah 2–3 barang → simpan.
- Talking point:
  > "Saya catat pesanan sekali. Perhatikan — saya tidak perlu update stok manual.
  > Sistem yang urus."

### Langkah 2 — Stok otomatis ter-reserve → **Barang & Stok** (1 mnt)
- Buka **Persediaan → Barang & Stok**, tunjuk stok barang tadi sudah ter-reserve
  (stok berkurang saat pesanan terkirim).
- Talking point:
  > "Stoknya langsung menyesuaikan. Jadi nggak ada lagi 'janji ada, ternyata
  > habis'."

### Langkah 3 — Kirim barang → **Surat Jalan** (1 mnt)
- Menu **Penjualan → Surat Jalan** → buat surat jalan dari pesanan tadi.
- Talking point:
  > "Surat jalan keluar dari pesanan yang sama — tidak ketik ulang."

### Langkah 4 — Uang & pembukuan → **Akuntansi** (1,5 mnt)
- Setelah pesanan terkirim atau difakturkan, buka **Akuntansi → Jurnal**: jurnalnya
  terbentuk otomatis; piutang bertambah di **Ringkasan Keuangan**.
- Talking point:
  > "Yang biasanya dikerjain akuntan di akhir bulan, di sini jadi otomatis tiap
  > transaksi. Pembukuan double-entry, rapi."

### Langkah 5 — Balik ke **Ringkasan & Laporan** (1 mnt)
- Tunjuk angka Ringkasan ikut berubah. Buka **Laporan → Laba Rugi / Neraca** →
  **Export Excel**.
- Talking point:
  > "Satu transaksi tadi tadi langsung kebaca di laporan. Dan kalau perlu kirim ke
  > akuntan atau bank, tinggal export Excel."

---

## 4. Pembeda / kenapa pilih ini (1 menit)

Sebut yang **benar-benar ada** (jangan over-promise):
- **Local-first** — data tersimpan di perangkat (IndexedDB), aman, tetap jalan
  walau internet mati.
- **PWA** — bisa di-"install" seperti aplikasi, tanpa toko aplikasi.
- **Dwibahasa** — Indonesia & Inggris.
- **Audit trail + kunci periode + cek buku besar** — angka tidak bisa diubah
  diam-diam, cocok untuk yang serius soal kerapian.
- **Export Excel & backup file** — data Anda, bisa Anda bawa kapan saja.

---

## 5. Penutup & ajakan (1 menit)

> "Jadi bayangkan: catat sekali, semua nyambung, laporan real-time, dan data tetap
> di tangan Anda. Saya tawarkan **coba gratis / pilot 1 bulan** pakai data bisnis
> Anda sendiri — saya bantu setup-nya. Bagaimana, mau kita mulai minggu ini?"

Pilih CTA yang jelas (jangan ngambang):
- Coba gratis / trial
- Pilot 1 bulan dengan pendampingan
- Jadwal instalasi & migrasi data

---

## 6. Antisipasi pertanyaan (jawab jujur)

| Pertanyaan | Jawaban singkat |
|---|---|
| "Data saya aman? Disimpan di mana?" | Di perangkat Anda (lokal). Opsional sync ke cloud. Bisa backup ke file kapan saja. |
| "Kalau internet mati?" | Tetap jalan penuh — memang dirancang offline-first. |
| "Bisa banyak user / hak akses beda-beda?" | Bisa: tiap akun punya peran (admin, manajer, akunting, penjualan, viewer) yang membatasi menu dan perubahan data. |
| "Bisa cetak invoice PDF?" | Faktur, pesanan, dan surat jalan bisa dicetak dari aplikasi dan disimpan sebagai PDF lewat dialog cetak browser; daftar bisa diekspor ke Excel. |
| "Kalau saya berhenti pakai, data saya gimana?" | Bisa di-export penuh ke file — datanya milik Anda. |
| "Berapa harganya?" | (Isi paket & harga Anda — lihat slide harga.) |
| "Susah nggak pindah dari Excel?" | Ada fitur import; saya bantu migrasi di masa pilot. |
| "Jalan di HP?" | Ya, responsif & bisa di-install sebagai PWA di HP. |

---

## 7. Hal yang HARUS dihindari saat demo

- ❌ Menjelaskan arsitektur teknis (IndexedDB, Firestore, ES modules) — end user
  tidak peduli.
- ❌ Tur semua menu tanpa cerita.
- ❌ Menjanjikan fitur yang belum ada (mis. integrasi bank otomatis, kirim faktur pajak
  lewat email) seolah sudah ada.
- ❌ Demo dengan mode Firebase yang memunculkan error — pakai **mode offline**.
- ❌ Membiarkan jeda hening saat loading — isi dengan talking point.

---

### Kredensial demo
- **Username:** admin
- **Password awal:** admin123 (wajib diganti saat login pertama)
- **Jalankan:** `npm run dev:local` (mode offline, paling aman untuk demo)
