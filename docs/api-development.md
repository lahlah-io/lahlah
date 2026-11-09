# Menjalankan backend dan mengelola database

Dokumen ini berisi langkah kerja pengembangan API Lahlah: setup lokal, perintah pnpm, pengujian, serta pembuatan dan penerapan migrasi. Untuk susunan folder, batas dependensi, dan aturan implementasi API, lihat [Arsitektur API](api-architecture.md).

## Istilah singkat

- **Workspace**: paket/aplikasi dalam monorepo pnpm. Backend ada di `apps/api` dan nama paketnya `api`.
- **`--filter api`**: membatasi perintah pnpm ke workspace API, sehingga tidak menjalankannya pada frontend atau paket lain.
- **Schema Prisma**: deklarasi model, enum, relasi, dan constraint di `apps/api/prisma/schema/`.
- **Prisma Client**: kode TypeScript yang dihasilkan dari schema untuk dipakai aplikasi. Jangan mengedit hasil generate.
- **Migration/migrasi**: catatan perubahan database yang diberi timestamp dan disimpan di `apps/api/prisma/migrations/`. Migrasi memungkinkan perubahan database diterapkan dengan urutan dan hasil yang terlacak.
- **`migrate dev`**: membuat (bila perlu) dan menerapkan migrasi pada database pengembangan.
- **`migrate deploy`**: menerapkan migrasi yang sudah ada, tanpa membuat migrasi baru; dipakai untuk deployment.
- **`DATABASE_URL`**: alamat koneksi database yang dipakai aplikasi dan Prisma CLI.

## Kebutuhan lokal

Gunakan Node.js 24+ dan pnpm 11. Pastikan PostgreSQL berjalan dan buat database lokal `lahlah_db`. Contoh koneksi dalam `apps/api/.env.example` adalah `postgres://postgres:CHANGE_ME@localhost:5432/lahlah_db`; ganti `CHANGE_ME` dengan kata sandi role Anda dan sesuaikan role, host, atau port lokal. `DATABASE_URL` wajib diisi; API dan Prisma CLI akan gagal dengan pesan jelas bila variabel ini kosong.

Dari root repository, salin file contoh konfigurasi:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Di macOS/Linux, padanannya:

```sh
cp apps/api/.env.example apps/api/.env
```

Edit `DATABASE_URL` di `apps/api/.env` bila konfigurasi PostgreSQL berbeda. `.env` berisi konfigurasi lokal/rahasia dan tidak boleh masuk Git.

Isi juga variabel autentikasi berikut di `apps/api/.env`:

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `PERIDOT_CLIENT_ID` | ya | Client id aplikasi PeridotID (`pidapp_...`). |
| `SESSION_TOKEN_PEPPER` | ya | String acak minimal 16 karakter untuk meng-hash token sesi. Jangan diganti setelah ada sesi aktif karena semua sesi lama menjadi tidak valid. |
| `SESSION_TTL_DAYS` | tidak | Umur sesi dalam hari, default 30. |
| `ADMIN_EMAILS` | tidak | Daftar email dipisah koma yang otomatis menjadi admin saat login. |
| `PERIDOT_CLIENT_SECRET` | tidak | Hanya untuk aplikasi PeridotID confidential client. |

## Login, sesi, dan admin pertama

Login hanya lewat PeridotID; API tidak menyimpan password.

1. Frontend memanggil SDK PeridotID (`peridot.auth.loginPopup()`) dan menerima `pidCode`.
2. Frontend mengirim `POST /api/v1/auth/peridot/exchange` dengan body `{ "code": "..." }` dan `credentials: "include"`.
3. Backend menukar kode ke PeridotID, membuat/menautkan user berdasarkan `pid`, memberi langganan `free`, lalu mengirim cookie `lahlah_session`.
4. Frontend memakai `GET /api/v1/auth/me` untuk membaca user aktif dan `POST /api/v1/auth/logout` untuk keluar.

Untuk klien non-browser, tambahkan header `X-Session-Mode: bearer` saat exchange. Token akan dikembalikan sekali di body dan dapat dipakai sebagai `Authorization: Bearer <token>`.

Admin pertama tidak dibuat lewat seed. Daftarkan emailnya di `ADMIN_EMAILS`, login sekali, lalu role otomatis menjadi `admin`. Setelah itu admin dapat mengelola user lain lewat `/api/v1/users`.

Contoh memakai Bearer di PowerShell:

```powershell
$body = @{ code = "<pid_code>" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post `
  -Uri http://localhost:8787/api/v1/auth/peridot/exchange `
  -ContentType "application/json" `
  -Headers @{ "X-Session-Mode" = "bearer" } `
  -Body $body
$headers = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Uri http://localhost:8787/api/v1/auth/me -Headers $headers
```

## Endpoint admin dan kuota

- Admin: `/api/v1/users`, `/api/v1/models`, `/api/v1/subscription-plans`.
- User login: `/api/v1/subscriptions/me`, `/api/v1/subscriptions/me/quota`, `/api/v1/subscriptions/me/quota/check`.
- Plan `free` disisipkan oleh migrasi data (`30` pesan/bulan, `10` sesi chat, `3` itinerary) dan tidak bisa dihapus. Batas plan lain diatur lewat `details` pada CRUD plan.
- `GET /api/v1/health` dan `/health/ready` tetap publik.

## Instalasi dan menjalankan API

Jalankan dari root repository:

```sh
pnpm install
pnpm --filter api db:generate
pnpm --filter api dev
```

API berjalan di `http://localhost:8787` secara default. Endpoint pemeriksaan:

- `GET http://localhost:8787/health/live` — memastikan proses aktif.
- `GET http://localhost:8787/health/ready` — memastikan proses dan PostgreSQL siap.

Untuk menjalankan semua aplikasi sekaligus gunakan `pnpm dev`. Port dan variabel lain dijelaskan dalam `.env.example` serta divalidasi oleh `apps/api/src/env.ts`.

## Perintah pnpm API

Jalankan perintah dari root repository:

| Perintah | Fungsi |
| --- | --- |
| `pnpm --filter api dev` | Menjalankan server pengembangan dengan watch mode. |
| `pnpm --filter api build` | Membuat Prisma Client lalu mengompilasi TypeScript. |
| `pnpm --filter api start` | Menjalankan hasil build dengan file `.env` lokal bila tersedia. |
| `pnpm --filter api test:unit` | Menjalankan tes unit; tidak memerlukan PostgreSQL. |
| `pnpm --filter api test:integration` | Menjalankan tes integrasi; memerlukan PostgreSQL bermigrasi. |
| `pnpm --filter api test` | Menjalankan tes unit dan integrasi. |
| `pnpm --filter api db:generate` | Membuat atau memperbarui Prisma Client dari schema. |
| `pnpm --filter api db:migrate:status` | Memeriksa apakah migrasi lokal dan database selaras. |
| `pnpm --filter api db:studio` | Membuka Prisma Studio untuk database pada `DATABASE_URL`. |
| `pnpm --filter api db:deploy` | Menerapkan migrasi yang sudah ada ke database target. |

## Siklus perubahan schema dan migrasi lokal

1. Ubah model terkait di `apps/api/prisma/schema/`.
2. Buat dan terapkan migrasi ke database lokal:

```sh
pnpm --filter api run db:migrate --name tambah_kolom_pengguna
```

pnpm meneruskan `--name` ke script `db:migrate`, yang menjalankan `prisma migrate dev`. Perintah tersebut membuat file migrasi bertimestamp, menerapkannya ke DB lokal, dan memperbarui status migrasi.
3. Tinjau SQL baru di `apps/api/prisma/migrations/<timestamp>_tambah_kolom_pengguna/migration.sql` dan pastikan hanya perubahan yang dimaksud yang ada.
4. Generate ulang client dan validasi:

```sh
pnpm --filter api db:generate
pnpm --filter api exec prisma validate
pnpm --filter api db:migrate:status
```

Untuk membuat file migrasi tanpa langsung menerapkannya, gunakan:

```sh
pnpm --filter api run db:migrate:create --name tambah_kolom_pengguna
```

Setelah meninjau SQL dan memastikan database target benar, terapkan ke DB pengembangan dengan `pnpm --filter api run db:migrate`.

## Menerapkan migrasi saat deployment

Commit schema dan folder migrasi bersama perubahan aplikasi. Atur `DATABASE_URL` melalui secret/environment target, periksa status, lalu jalankan:

```sh
pnpm --filter api db:migrate:status
pnpm --filter api db:deploy
```

`db:deploy` menjalankan `prisma migrate deploy`; ia menjalankan migrasi yang telah dibuat sebelumnya. Jangan memakai `migrate dev` terhadap production, jangan membuat perubahan schema manual di database bersama, dan jangan memakai `prisma db push` untuk deployment.

Jangan mengedit SQL migrasi yang telah diterapkan ke lingkungan bersama. Jika status migrasi berbeda, hentikan dan selidiki; jangan menjalankan reset pada database berisi data tanpa persetujuan eksplisit.

## Menguji auth, admin, dan kuota

Tes integrasi mengirim request melalui API dan menyimpan perubahan ke PostgreSQL lokal. Tes membuat user dan sesi langsung lewat Prisma dengan email/UUID unik, memeriksa auth, CRUD admin, plan, model, dan kuota, lalu menghapus data uji di blok `finally`. Alur `pid_code` diuji dengan `fetch` PeridotID yang di-stub sehingga tidak memerlukan kredensial nyata. Jalankan dengan:

```sh
pnpm --filter api test:integration
```

Tes ini memerlukan database hidup dan semua migrasi sudah diterapkan. Untuk tes yang tidak mengakses DB:

```sh
pnpm --filter api test:unit
```

Tes unit tetap membaca `DATABASE_URL` dari `.env` karena modul dimuat bersama `src/env.ts`, tetapi tidak membuka koneksi atau query ke database.

Route users, models, dan subscription-plans mewajibkan sesi admin (`401` tanpa sesi, `403` untuk role `user`). Tidak ada lagi pengaman `503` di production karena autentikasi dan otorisasi sudah tersedia.
