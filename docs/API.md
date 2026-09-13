# API Integrasi (baca-saja)

API HTTP sederhana untuk mengambil data master dan dokumen dari ERP ke sistem lain (spreadsheet, BI, sistem mitra). API berjalan sebagai Firebase Cloud Function `api` dan diakses melalui Firebase Hosting di path `/api/v1`. Data dibaca langsung dari Firestore, sehingga API hanya berguna pada **mode cloud**.

> **Hanya baca.** Hanya metode `GET`. API **tertutup secara default** dan membalas `503` sampai `ERP_API_KEY` dikonfigurasi.

---

## Konfigurasi

Variabel lingkungan Cloud Functions (mis. file `functions/.env` yang tidak di-commit), lalu deploy ulang functions:

| Variabel | Wajib | Fungsi |
|---|---|---|
| `ERP_API_KEY` | Ya | Kunci API panjang dan acak. Mengaktifkan API. |
| `ERP_API_KEY_NEXT` | Tidak | Kunci pengganti untuk rotasi tanpa jeda layanan (keduanya diterima) |
| `ERP_API_ALLOWED_ORIGINS` | Tidak | Membatasi origin browser yang diizinkan (CORS) |
| `ERP_API_RATE_MAX` | Tidak | Batas permintaan per menit (default 120) |
| `FIRESTORE_DATABASE_ID` | Tidak | ID database Firestore bila bukan database default |

```bash
firebase deploy --only functions:api
```

## Autentikasi

Kirim kunci pada header `x-api-key`:

```bash
curl -H "x-api-key: $ERP_API_KEY" https://<domain-hosting>/api/v1/customers
```

## Endpoint

### `GET /api/v1`

Discovery: versi, daftar resource, batas, dan parameter yang didukung.

### `GET /api/v1/:resource`

| Resource | Koleksi Firestore |
|---|---|
| `customers` | customers |
| `suppliers` | suppliers |
| `items` | inventoryItems |
| `sales-orders` | salesOrders |
| `purchase-orders` | purchaseOrders |
| `sales-invoices` | salesInvoices |
| `purchase-invoices` | purchaseInvoices |
| `delivery-orders` | deliveryOrders |

Koleksi lain (pembayaran, pengaturan, pengguna, akun, jurnal) **tidak** diekspos.

| Parameter | Keterangan |
|---|---|
| `limit` | 1–500, default 100 |
| `cursor` | Nilai `nextCursor` dari respons sebelumnya (paginasi) |
| `updatedSince` | Tanggal ISO 8601 (mis. `2026-07-01T00:00:00Z`) — hanya data yang berubah sejak tanggal tersebut |

Contoh:

```bash
curl -H "x-api-key: $ERP_API_KEY" "https://<domain-hosting>/api/v1/sales-orders?limit=50"
```

```json
{
  "resource": "sales-orders",
  "count": 50,
  "limit": 50,
  "nextCursor": "…",
  "data": [{ "id": "…", "number": "SO.2026.07.00012", "customer": "…", "amount": 0 }]
}
```

## Kode status

| Status | Arti |
|---|---|
| `200` | Berhasil |
| `400` | Parameter tidak valid (mis. `updatedSince` bukan tanggal ISO 8601) |
| `401` | Kunci API tidak ada/salah |
| `404` | Resource tidak dikenal |
| `405` | Metode selain `GET` |
| `429` | Batas permintaan terlampaui |
| `503` | `ERP_API_KEY` belum dikonfigurasi |

## Implementasi

- `functions/index.js` — Cloud Function `api`, membaca slug resource dari path.
- `functions/handler.js` — logika murni (autentikasi, whitelist, batas, paginasi, CORS, rate limit); diuji di `tests/api-handler.test.ts`.
- `functions/firestore.js` — akses Firestore via Admin SDK.
