# Panduan Cepat — Nusantara ERP

## Prasyarat

- Node.js **20.19** atau lebih baru (npm 10+)
- Browser modern (Chrome, Edge, Firefox, Safari)
- Untuk mode cloud: akun Firebase dan Firebase CLI (`npm install -g firebase-tools`)

---

## 1. Instal

```bash
npm ci
```

## 2. Mode lokal (tanpa Firebase)

Cocok untuk demo, uji coba, dan pemakaian di satu perangkat.

```bash
npm run dev:local
```

1. Buka `http://localhost:8088/app.html` (browser biasanya terbuka otomatis).
2. Login dengan akun lokal **`admin` / `admin123`**. Anda diminta mengganti password pada login pertama.
3. Data contoh dimuat otomatis saat database masih kosong.

Catatan mode lokal:
- Data tersimpan di **browser dan perangkat itu saja** (IndexedDB). Membersihkan data situs di browser akan menghapus data.
- Buat backup lewat menu pengguna → **Kelola Backup** → Ekspor.
- Akun lokal lain untuk uji coba: `firna`, `richard`, `lisa` (password `<nama>123`, semuanya peran Admin).

## 3. Mode cloud (Firebase)

Dibutuhkan bila data harus diakses dari beberapa perangkat/pengguna.

1. **Buat project Firebase** dan gunakan paket Blaze (dibutuhkan Cloud Functions).
2. Aktifkan **Firestore** dan **Authentication**. Login memakai username melalui Cloud Function, sehingga tidak perlu mengaktifkan provider email.
3. Salin konfigurasi:
   ```bash
   cp .env.example .env
   ```
   Isi `VITE_FIREBASE_*` dari Firebase Console → Project settings → Your apps (Web).
4. Sesuaikan ID project di `.firebaserc`.
5. Sesuaikan email **admin utama** yang tertulis di `firestore.rules` dan `src/core/user-role.js` — **REQUIRES USER CONFIRMATION** (email pemilik akun).
6. Deploy aturan dan functions:
   ```bash
   npm run deploy:rules
   ```
   ```bash
   npm --prefix functions ci
   ```
   ```bash
   firebase deploy --only functions
   ```
7. Jalankan aplikasi:
   ```bash
   npm run dev
   ```
8. **Akun pertama:** saat login pertama kali dan belum ada pengguna, server membuat akun awal berperan Admin. Passwordnya diambil dari variabel `SEED_ADMIN_PASSWORD` (di `functions/.env`) atau, bila tidak diisi, password acak yang dicatat **satu kali** di Cloud Logging. Semua akun awal wajib ganti password.

Detail deploy produksi: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 4. Build

```bash
npm run build
```

```bash
npm run preview
```

`npm run build:local` menghasilkan build mode lokal (tanpa Firebase).

## 5. Pemeriksaan kode

```bash
npm run test:run
```

```bash
npm run type-check
```

```bash
npm run lint
```

---

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| Port 8088 sudah dipakai | Jalankan dengan port lain: `npm run dev:local -- --port 8090` |
| Jendela cetak tidak muncul | Browser memblokir pop-up — izinkan pop-up untuk alamat aplikasi |
| Login cloud gagal dengan pesan terkait IAM/signBlob | Service account Cloud Functions perlu peran *Service Account Token Creator* untuk membuat token login |
| Status data di topbar menampilkan "Lokal" padahal `.env` terisi | Periksa semua nilai `VITE_FIREBASE_*` lalu jalankan ulang `npm run dev` |
| Sebagian data hilang setelah reload di mode cloud | Koleksi tertentu belum tersinkron — lihat T-27 di [docs/08-TEMUAN-TEKNIS.md](docs/08-TEMUAN-TEKNIS.md) |
