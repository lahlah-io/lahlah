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
    ├── integrations/
    │   └── peridot/             # Klien PeridotID (exchange pid_code)
    └── shared/
        ├── audit/               # Helper activity_logs lintas fitur
        ├── auth/                # Token, sesi, cookie, middleware role
        ├── billing/             # Langganan, limit plan, pengecekan kuota
        ├── http/                # Error HTTP dan validator
        └── schemas/             # Skema lintas fitur, misalnya pagination
```

Modul yang ada: `auth`, `users`, `models`, `subscription-plans`, dan `subscriptions`. Fitur `chat`, `itinerary`, dan `destination` belum dibuat.

Session, billing, dan audit ditaruh di `shared/` karena dipakai beberapa modul sekaligus dan modul tidak boleh saling mengimpor. `shared/` boleh mengakses Prisma melalui repository-nya sendiri, tetapi tidak boleh mengimpor `modules/`.

Jangan membuat direktori kosong atau menyiapkan lapisan untuk fitur yang belum ada. Tambahkan file/folder ketika ada implementasi nyata. Route tidak boleh menjalankan query Prisma. Fitur hanya boleh mengimpor dirinya sendiri dan `shared/`; `shared/` tidak boleh mengimpor fitur.

## Konfigurasi dan endpoint

- Endpoint fitur berada di bawah `/api/v1` dan dipasang melalui `src/routes.ts`.
- `GET /health/live` memeriksa proses; `GET /health/ready` juga menguji koneksi PostgreSQL dan memberi status 503 bila DB tidak tersedia.
- Middleware global memasang request ID, log JSON (matikan dengan `LOG_LEVEL=silent`), security headers, CORS, dan batas body API 1 MiB.
- Error memakai bentuk `{ "error": { "code": "...", "message": "..." } }`. Jangan bocorkan detail database atau exception internal.
- Konfigurasi runtime dibaca dan divalidasi sekali melalui `src/env.ts`. Simpan rahasia di `apps/api/.env` lokal; hanya contoh tanpa rahasia boleh masuk `.env.example`.
- Variabel auth: `PERIDOT_CLIENT_ID` (wajib), `PERIDOT_CLIENT_SECRET` (opsional), `SESSION_TTL_DAYS`, `SESSION_TOKEN_PEPPER` (wajib), dan `ADMIN_EMAILS`.
- CORS mengizinkan kredensial (`credentials: true`) karena sesi browser dikirim sebagai cookie. Header `X-Session-Mode` dan `Authorization` diterima.
- Prisma 7 CLI memakai `apps/api/prisma.config.ts`. File tersebut memuat `dotenv/config` karena Prisma config tidak memuat `.env` otomatis.
- Client hasil generate berada di `src/generated/prisma`; jangan mengedit atau commit folder itu.
- Impor relatif TypeScript menggunakan akhiran `.js` (NodeNext).

## Skema Prisma

File di `prisma/schema/` mencakup seluruh 14 tabel ERD: users, models, subscription_plans, user_subscriptions, payments, chat_sessions, chat_messages, itinerary, destinations, categories, destination_categories, itinerary_destinations, destination_checkpoints, dan activity_logs.

- Nama field Prisma memakai camelCase; nama kolom dan tabel database dipetakan dengan `@map`/`@@map`.
- ID menggunakan PostgreSQL UUID; nilai uang memakai `Decimal`; JSONB memakai Prisma `Json`; waktu memakai `timestamptz`.
- Pertahankan unique constraint dan foreign key ERD. Nyatakan perilaku penghapusan relasi secara eksplisit dan telaah dampak data sebelum mengubahnya.
- `User.pid` unik dan menjadi kunci identitas PeridotID. Tidak ada kolom password; autentikasi sepenuhnya lewat PeridotID.
- `User.email` opsional karena identitas PeridotID bisa tidak punya email (passkey-only), tetapi tetap unik bila terisi. User yang dibuat admin boleh punya email lebih dulu; saat login pertama dengan email yang sama, `pid` PeridotID ditautkan ke baris tersebut.
- Tabel `sessions` menyimpan hash token (bukan token asli), masa berlaku, dan waktu pencabutan.
- `DestinationSource` saat ini mencakup `geoapify`, `admin`, dan `user`; unique place ID dibatasi per sumber.
- Jangan gunakan `prisma db push` pada lingkungan bersama/terpasang. Gunakan migrasi yang ditinjau dan `migrate deploy` untuk penerapan.

## Autentikasi dan sesi

- Login berjalan lewat `POST /api/v1/auth/peridot/exchange`: browser memperoleh `pid_code` dari SDK PeridotID, lalu backend menukarnya ke `https://api.peridot.id/v1/auth/exchange`. Kode bersifat sekali pakai dan tidak boleh dicatat di log.
- Backend tidak menyimpan token PeridotID. Backend membuat sesinya sendiri: token acak 32 byte, disimpan sebagai `sha256(pepper:token)` di tabel `sessions`, dan dikirim ke browser sebagai cookie `lahlah_session` (`httpOnly`, `SameSite=Lax`, `Secure` di production).
- Untuk klien non-browser, kirim header `X-Session-Mode: bearer` saat exchange agar token juga dikembalikan di body, lalu gunakan `Authorization: Bearer <token>`.
- `GET /api/v1/auth/me` mengembalikan user aktif; `POST /api/v1/auth/logout` mencabut sesi dan menghapus cookie.
- Middleware `requireAuth` dan `requireAdmin` berada di `src/shared/auth/middleware.ts`. Middleware menolak sesi tidak valid (401) dan user dengan `isActive=false` (403). Semua route admin memakai `requireAdmin`.
- Admin pertama dibuat lewat `ADMIN_EMAILS`: email yang terdaftar otomatis menjadi `admin` saat login. Role hanya pernah dinaikkan otomatis, tidak pernah diturunkan saat email dihapus dari daftar.
- Admin tidak dapat menurunkan role atau menonaktifkan akunnya sendiri (409 `CANNOT_MODIFY_SELF`).

## Fitur users

- `api/users.ts`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/role`, `PATCH /:id/status`, dan `DELETE /:id` (soft delete). Semua route memakai `requireAdmin`.
- `schemas/user.schema.ts`: validasi Zod untuk body, query (role, isActive, pencarian `q`), dan UUID path; pagination umum berada di `src/shared/schemas/pagination.schema.ts`.
- `services/users.service.ts`: membuat user beserta langganan free dalam satu transaksi, memetakan email duplikat/data tidak ditemukan ke error HTTP, dan mencatat `activity_logs`.
- `repositories/users.repository.ts`: semua query Prisma fitur users, termasuk transaksi pembuatan user + langganan free.
- `tests/integration/users.crud.test.ts` dan `admin-users.test.ts` menguji CRUD nyata melalui PostgreSQL.

List dibatasi hingga 1–100 data per halaman. Respons hanya memilih field yang boleh terlihat oleh API; jangan pernah mengekspos token atau rahasia.

## Billing, plan, dan kuota

- `subscription_plans.details` (JSONB) menyimpan batas plan: `chatMessagesPerMonth`, `maxChatSessions`, `maxItineraries`, dan `allowedModelIds`. `null` berarti tanpa batas, dan key lain dipertahankan untuk kompatibilitas. Validasi ada di `src/shared/billing/plan-limits.schema.ts`.
- Migrasi data menyisipkan plan `free` (30 pesan/bulan, 10 sesi chat, 3 itinerary). Plan `free` tidak bisa dihapus; plan yang masih dipakai langganan juga tidak bisa dihapus (409).
- Setiap user baru otomatis mendapat langganan `free` aktif, baik saat dibuat admin maupun saat login pertama. Fungsi idempotent ada di `src/shared/billing/subscription.service.ts`.
- `GET /api/v1/subscriptions/me` mengembalikan plan aktif, masa berlaku, limit, dan pemakaian. `GET /api/v1/subscriptions/me/history` mengembalikan riwayat langganan.
- `GET /api/v1/subscriptions/me/quota` dan `POST /api/v1/subscriptions/me/quota/check` memakai jendela bulan kalender UTC. Modul `chat` nanti memanggil `checkQuota(userId, metric, amount)` langsung dari `shared/billing`, bukan lewat HTTP internal.
- CRUD model (`/api/v1/models`) dan plan (`/api/v1/subscription-plans`) hanya untuk admin. `defaultModelId` pada plan harus menunjuk model yang aktif.

## Catatan pengujian

- `tests/unit/` tidak memerlukan koneksi DB; `tests/integration/` memerlukan PostgreSQL bermigrasi.
- Tes integrasi membuat user dan sesi langsung lewat Prisma (`tests/integration/helpers/session.ts`) sehingga tidak memanggil PeridotID. Alur exchange diuji dengan `fetch` yang di-stub.
- Data uji memakai email/UUID unik dan dibersihkan di blok `finally` tanpa menghapus data pengguna lain.

## Belum termasuk

Klien model OpenAI-compatible dan API key provider, Cloudflare R2, integrasi pembayaran, endpoint chat/itinerary/destination, serta deployment production belum dibuat. Tambahkan masing-masing ketika perilaku dan kredensialnya memang dibutuhkan.
