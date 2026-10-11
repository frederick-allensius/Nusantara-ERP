# Deploy ke Firebase

Seluruh aplikasi berjalan di Firebase. Setiap bagian di-deploy terpisah.

| Bagian | Sumber | Perintah |
|---|---|---|
| Hosting (aplikasi web) | `dist/` hasil `npm run build` | `firebase deploy --only hosting` |
| Cloud Functions | `functions/` | `firebase deploy --only functions` |
| Aturan & indeks Firestore | `firestore.rules`, `firestore.indexes.json` | `npm run deploy:rules` atau `firebase deploy --only firestore` |
| Aturan Storage | `storage.rules` | `firebase deploy --only storage` |

Project default ada di `.firebaserc`.

**Demo (prototype):** `npm run deploy:demo` membangun aplikasi dalam mode lokal (data demo di browser masing-masing pengunjung, login bawaan, tanpa Firestore) dan men-deploy hosting saja ke project `nusantara-erp-demo` → https://nusantara-erp-demo.web.app/app. Konfigurasinya `firebase.demo.json` (hosting tanpa rewrite ke Cloud Function).

---

## Prasyarat (sekali)

1. Firebase CLI terpasang dan login: `firebase login`.
2. Project memakai paket **Blaze** (Cloud Functions & Cloud Scheduler).
3. File `.env` berisi konfigurasi Firebase produksi (`VITE_FIREBASE_*`). Nilai ini tertanam saat build.
4. Variabel lingkungan functions (mis. `functions/.env`, jangan di-commit):

| Variabel | Fungsi |
|---|---|
| `SEED_ADMIN_PASSWORD` | Password akun awal saat database pengguna masih kosong (opsional; tanpa ini password acak dicatat sekali di Cloud Logging) |
| `ERP_API_KEY`, `ERP_API_KEY_NEXT`, `ERP_API_ALLOWED_ORIGINS`, `ERP_API_RATE_MAX` | API integrasi — lihat [API.md](API.md) |

5. Email admin utama di `firestore.rules` dan `src/core/user-role.js` sudah sesuai — **REQUIRES USER CONFIRMATION**.

## Langkah deploy

```bash
npm run test:run
```

```bash
npm run build
```

```bash
npm --prefix functions ci
```

```bash
firebase deploy
```

`firebase deploy` tanpa `--only` men-deploy semua bagian di tabel atas.

## Setelah deploy

- Buka domain hosting, pastikan layar login muncul dan status data di topbar menunjukkan **Firebase**.
- Login dengan akun admin, cek halaman Ringkasan, Penjualan, dan Laporan.
- `GET /api/v1` membalas `503` bila API sengaja belum diaktifkan, atau daftar resource bila `ERP_API_KEY` sudah diisi.
- Setelah perubahan daftar koleksi tersinkron (T-27), deploy ulang aturan Firestore dan functions.

## Header keamanan

`firebase.json` memasang Content-Security-Policy ketat (`script-src 'self'` tanpa `unsafe-inline`), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, dan Permissions-Policy. Konsekuensinya: **event handler inline (`onclick="…"`) tidak berjalan di hosting** meskipun berjalan di server pengembangan. Uji fitur baru dengan `npm run build` + `npm run preview` sebelum deploy.

File `.js`/`.css` dan gambar diberi cache 1 tahun; nama file hasil build Vite memakai hash sehingga versi baru langsung terambil. Skrip klasik (`/classic/bundle.js`, `/classic/view-*.js`) tidak memakai hash — service worker memperbarui cache saat versi baru terdeteksi.

## Backup server

Function `nightlyBackup` berjalan setiap hari pukul **20:00 WIB**, menyalin koleksi tersinkron ke koleksi `serverBackups` (tidak bisa diakses dari aplikasi), dan menyimpan **14 hari** terakhir. Pemulihan dilakukan dengan Admin SDK: baca dokumen `<tanggal>__meta`, lalu tulis kembali isi setiap potongan ke koleksi asalnya. Admin juga dapat membuat dan memulihkan backup dari menu pengguna → **Kelola Backup**.

## Emulator lokal

```bash
firebase emulators:start
```

Port: Auth 9099, Firestore 8080, Storage 9199, Functions 5001, UI 4000. Atur `VITE_USE_EMULATORS=true` di `.env` untuk mengarahkan aplikasi ke emulator.

## Build tanpa Firebase

`npm run build:local` menghasilkan aplikasi mode lokal yang bisa di-host di server statis mana pun. Data setiap pengguna tersimpan di browser masing-masing.
