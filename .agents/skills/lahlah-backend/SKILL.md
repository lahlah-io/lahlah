---
name: lahlah-backend
description: Panduan wajib saat menambah atau mengubah API di apps/api, skema/migrasi Prisma, route berversi, lapisan fitur backend, konfigurasi runtime, atau pemeriksaan arsitektur backend Lahlah.
---

# Backend Lahlah

Ikuti [`docs/api-architecture.md`](../../../docs/api-architecture.md) sebagai sumber utama struktur dan aturan kode API, serta [`docs/api-development.md`](../../../docs/api-development.md) untuk menjalankan backend, perintah pnpm, dan alur basis data. Jika mengubah command atau konfigurasi Turborepo, patuhi petunjuk versi terpasang dalam `AGENTS.md` dan dokumentasi paket lokalnya.

## Konvensi wajib

- Stack: Hono di Node.js 24+, TypeScript NodeNext (akhiran impor relatif `.js`), Prisma 7, PostgreSQL.
- Tempatkan endpoint di `/api/v1` dan pasang router fitur melalui `src/routes.ts`.
- Pertahankan alur `api → service → repository → basis data/integrasi`. Handler API tidak boleh menjalankan query Prisma; repository memiliki akses persistence.
- Fitur tidak saling mengimpor. Fitur boleh memakai kodenya sendiri dan `src/shared/`; `shared/` tidak boleh mengimpor fitur. Klien layanan eksternal masuk integrasi saat sudah digunakan.
- Validasi input HTTP dengan Zod. Gunakan envelope error bersama dan jangan bocorkan detail exception atau database.
- Baca konfigurasi dari `src/env.ts`. Simpan rahasia hanya pada `.env` lokal yang diabaikan Git; jangan menaruh kredensial nyata di kode atau dokumentasi.
- Ubah skema pada `prisma/schema/`, generate client, buat/tinjau migrasi, lalu terapkan lokal. Jangan mengedit `src/generated/prisma` atau migrasi yang sudah diterapkan ke lingkungan bersama.
- Jangan gunakan `db push` untuk database bersama dan jangan reset DB berisi data tanpa persetujuan.
- Auth memakai PeridotID (`pid_code` → exchange) dan sesi internal di tabel `sessions`; jangan menyimpan password atau token PeridotID. Route admin wajib memakai `requireAdmin`, dan user nonaktif ditolak `requireAuth`.
- R2 dan API key/provider model belum dibuat. Jangan menambahkan integrasi sebelum ada pemakai nyata.
- Jangan membuat folder kosong atau lapisan generik tanpa pemakai saat ini.

## Pengujian dan serah-terima

- Tempatkan tes unit di `tests/unit/` dan tes yang membutuhkan layanan nyata di `tests/integration/`. Tambahkan fixture bersama hanya saat lebih dari satu tes benar-benar membutuhkannya.
- `pnpm --filter api test:unit` harus dapat dijalankan tanpa DB. `pnpm --filter api test:integration` menggunakan PostgreSQL lokal bermigrasi, data unik, dan cleanup aman.
- Sebelum serah-terima jalankan `pnpm --filter api test`, `pnpm lint`, `pnpm check-types`, dan `pnpm build`. Bila schema berubah, jalankan juga `db:generate`, `prisma validate`, serta pemeriksaan status migrasi.
- Root lint menjalankan `packages/eslint-config/rules/check-backend-structure.mjs`; perbaiki pelanggaran struktur/batas impor, jangan menonaktifkan checker.
