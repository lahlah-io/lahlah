# Arsitektur API

API memakai Hono, Node.js 24+, TypeScript, Prisma 7, dan PostgreSQL. Struktur mengikuti alur **API → Service → Repository → basis data/integrasi**. Handler API menangani HTTP dan validasi; service memuat aturan bisnis; repository memiliki akses Prisma. Fitur tidak boleh saling mengimpor langsung. Tempatkan kode lintas fitur di `src/shared/` dan klien layanan eksternal di `src/integrations/` saat memang diperlukan.

Untuk tutorial menjalankan backend, perintah pnpm, istilah migrasi, serta langkah kerja dengan database, lihat [Panduan pengembangan API dan database](api-development.md).

## Struktur proyek

```text
apps/api/
├── prisma.config.ts
├── prisma/
│   ├── schema/                  # Skema Prisma per domain
│   └── migrations/              # Migrasi SQL yang terlacak
├── Dockerfile
├── tests/
│   ├── unit/
│   │   ├── features/users/      # Uji skema dan aturan fitur
│   │   └── shared/              # Uji helper/schema bersama
│   └── integration/             # Uji yang memerlukan PostgreSQL
└── src/
    ├── index.ts                 # Server Node dan shutdown
    ├── app.ts                   # Hono, middleware, health, error
    ├── env.ts                   # Validasi konfigurasi runtime
    ├── routes.ts                # Komposisi /api/v1
    ├── db/client.ts             # Prisma client dan adapter PostgreSQL
    ├── generated/prisma/        # Hasil generate; jangan diedit atau commit
    ├── modules/<fitur>/
    │   ├── api/                 # Route Hono dan pemetaan HTTP
    │   ├── schemas/             # Kontrak Zod
    │   ├── services/            # Aturan bisnis
    │   └── repositories/        # Query Prisma
    ├── integrations/            # Klien layanan eksternal (saat digunakan)
    └── shared/
        ├── http/                # Error HTTP dan validator
        └── schemas/             # Skema lintas fitur, misalnya pagination
```

Jangan membuat direktori kosong atau menyiapkan lapisan untuk fitur yang belum ada. Tambahkan file/folder ketika ada implementasi nyata. Route tidak boleh menjalankan query Prisma. Fitur hanya boleh mengimpor dirinya sendiri dan `shared/`; `shared/` tidak boleh mengimpor fitur.

## Konfigurasi dan endpoint

- Endpoint fitur berada di bawah `/api/v1` dan dipasang melalui `src/routes.ts`.
- `GET /health/live` memeriksa proses; `GET /health/ready` juga menguji koneksi PostgreSQL dan memberi status 503 bila DB tidak tersedia.
- Dokumentasi OpenAPI disusun di `src/openapi.ts` dari skema Zod yang ada. Saat `NODE_ENV` bukan `production`, `GET /docs` menyajikan Swagger UI dan `GET /openapi.json` menyajikan dokumennya; di production keduanya 404. Tes `tests/unit/openapi.test.ts` menjaga setiap rute `/api/v1` terdaftar di dokumen; `tests/integration/openapi.contract.test.ts` memvalidasi bentuk respons nyata ke DB terhadap `responseShapes` yang diekspor `src/openapi.ts`. Skema respons tetap ditulis manual (service mengembalikan hasil select Prisma), jadi perbarui `responseSchemas`/`responseShapes` di `src/openapi.ts` saat bentuk respons berubah.
- Middleware global memasang request ID, log JSON (matikan dengan `LOG_LEVEL=silent`), security headers, CORS, dan batas body API 1 MiB.
- Error memakai bentuk `{ "error": { "code": "...", "message": "..." } }`. Jangan bocorkan detail database atau exception internal.
- Konfigurasi runtime dibaca dan divalidasi sekali melalui `src/env.ts`. Simpan rahasia di `apps/api/.env` lokal; hanya contoh tanpa rahasia boleh masuk `.env.example`.
- Prisma 7 CLI memakai `apps/api/prisma.config.ts`. File tersebut memuat `dotenv/config` karena Prisma config tidak memuat `.env` otomatis.
- Client hasil generate berada di `src/generated/prisma`; jangan mengedit atau commit folder itu.
- Impor relatif TypeScript menggunakan akhiran `.js` (NodeNext).

## Skema Prisma

File di `prisma/schema/` mencakup seluruh 14 tabel ERD: users, models, subscription_plans, user_subscriptions, payments, chat_sessions, chat_messages, itinerary, destinations, categories, destination_categories, itinerary_destinations, destination_checkpoints, dan activity_logs.

- Nama field Prisma memakai camelCase; nama kolom dan tabel database dipetakan dengan `@map`/`@@map`.
- ID menggunakan PostgreSQL UUID; nilai uang memakai `Decimal`; JSONB memakai Prisma `Json`; waktu memakai `timestamptz`.
- Pertahankan unique constraint dan foreign key ERD. Nyatakan perilaku penghapusan relasi secara eksplisit dan telaah dampak data sebelum mengubahnya.
- `User.pid` unik dan dibuat sebagai UUID string. Field auth/password belum ditambahkan.
- `DestinationSource` mencakup `geoapify`, `firecrawl`, `overpass`, `wikidata`, `manual`, `admin`, dan `user`. Unique place ID dibatasi per sumber. `canonical_key` (nama ternormalisasi, unik) mencegah baris ganda saat sumber pemenang berubah.
- Jangan gunakan `prisma db push` pada lingkungan bersama/terpasang. Gunakan migrasi yang ditinjau dan `migrate deploy` untuk penerapan.

## Fitur contoh: users

`src/modules/users/` adalah contoh CRUD berlapis:

- `api/users.ts`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, dan `DELETE /:id`.
- `schemas/user.schema.ts`: validasi Zod untuk body, query, dan UUID path; pagination umum berada di `src/shared/schemas/pagination.schema.ts`.
- `services/users.service.ts`: memetakan email duplikat dan data yang tidak ditemukan ke error HTTP; penghapusan bersifat soft (`isActive=false`).
- `repositories/users.repository.ts`: semua query Prisma fitur users.
- `tests/unit/features/users/`: uji kontrak input; `tests/integration/users.crud.test.ts`: uji CRUD nyata melalui PostgreSQL.

List dibatasi hingga 1–100 data per halaman. Respons hanya memilih field yang boleh terlihat oleh API; jangan pernah mengekspos password atau secret. CRUD user belum memiliki autentikasi dan dikunci dengan status 503 di production. Jangan hapus pengaman itu sebelum autentikasi dan otorisasi tersedia.

## Skrip data destinasi

`src/scripts/scrape-destinations.ts` mengisi tabel `destinations` dari Geoapify, Firecrawl, Overpass, Wikidata, dan daftar manual.

- Jalankan `pnpm --filter api scrape:destinations`. Tambahkan `--dry-run` untuk melihat hasil tanpa menulis, atau `--source=<nama>` untuk satu sumber.
- Sumber tanpa API key dilewati, bukan dianggap gagal.
- Asal data disimpan di `destinations.source` dan `details.mergedSources`.
- Skrip tidak dijalankan otomatis dan tidak diekspos sebagai endpoint.

## Belum termasuk

Autentikasi/otorisasi, klien model OpenAI-compatible dan API key provider, Cloudflare R2, integrasi pembayaran, seed data, serta deployment production belum dibuat. Tambahkan masing-masing ketika perilaku dan kredensialnya memang dibutuhkan.
