<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the managed block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Ruang kerja Lahlah

- `apps/app`: aplikasi pengguna, Vite + React + TypeScript, port pengembangan 5173.
- `apps/api`: API Hono di Node.js, port 8787; struktur di `docs/api-architecture.md` dan panduan menjalankan/migrasi DB di `docs/api-development.md`.
- `apps/admin`: dasbor admin, Vite + React + TypeScript, port pengembangan 5174.
- `packages/ui`, `packages/eslint-config`, dan `packages/typescript-config` adalah paket bersama. `packages/ui` belum digunakan oleh frontend.

Gunakan Node.js 24 atau lebih baru dan pnpm 11. Setelah mengubah dependensi, jalankan `pnpm install`. Sebelum menyerahkan perubahan, jalankan `pnpm lint`, `pnpm check-types`, dan `pnpm build`; untuk API jalankan juga `pnpm --filter api test`. Semua aplikasi bisa dijalankan dengan `pnpm dev`, atau satu workspace dengan `pnpm --filter <nama> dev`.

Pertahankan port tiap aplikasi. Jangan menambahkan situs pemasaran atau Next.js tanpa kebutuhan baru. Aturan ignore lintas-workspace disimpan di `.gitignore` root; jangan commit `dist/`, `.turbo/`, `node_modules/`, log, atau `.env` lokal. Gunakan `.env.example` untuk contoh konfigurasi tanpa rahasia.

## Instruksi wajib frontend

Sebelum mengubah `apps/app` atau `apps/admin`, baca [docs/frontend-architecture.md](docs/frontend-architecture.md) dan skill lokal [lahlah-frontend](.agents/skills/lahlah-frontend/SKILL.md). Gunakan skill [shadcn](.agents/skills/shadcn/SKILL.md) ketika bekerja dengan komponen shadcn/ui dan [react-best-practices](.agents/skills/react-best-practices/SKILL.md) ketika mengubah perilaku atau kinerja React. Skill lokal disimpan di repo agar aturan tetap tersedia untuk sesi AI berikutnya.

Setiap frontend memiliki tiga folder utama di `src/`: `pages/`, `feat/`, dan `shared/`; `main.tsx` adalah satu-satunya entrypoint di root. `shared/` tidak boleh mengimpor `feat/` atau `pages/`. Setiap `feat/<nama>/` hanya boleh mengimpor dirinya sendiri dan `shared/`. Halaman tidak boleh saling mengimpor; `route.tsx` hanya boleh mendaftarkan halaman sekandung dan route anak langsung. Jika kode mulai dipakai lintas fitur, pindahkan ke `shared/`. Jalankan lint untuk menegakkan aturan.

## Instruksi wajib backend

Sebelum mengubah `apps/api`, baca [docs/api-architecture.md](docs/api-architecture.md), [docs/api-development.md](docs/api-development.md), dan skill lokal [lahlah-backend](.agents/skills/lahlah-backend/SKILL.md). Ikuti arsitektur Hono + Node.js + TypeScript + Prisma 7 + PostgreSQL yang sudah ada; jangan mengganti stack atau menambahkan dependensi tanpa kebutuhan.

API memakai `/api/v1`. Fitur di `src/modules/<fitur>/` mengikuti lapisan `api/`, `schemas/`, `services/`, dan `repositories/`; alur dependensi hanya API → service → repository → DB/integrasi. Route tidak boleh menjalankan query Prisma. Fitur tidak boleh mengimpor fitur lain; kode lintas fitur ditempatkan di `src/shared/`. Tambahkan hanya folder yang memiliki implementasi nyata, jangan membuat folder kosong untuk rencana masa depan. Gunakan impor TypeScript relatif dengan akhiran `.js`, validasi Zod di batas HTTP, dan envelope error bersama. Jangan mengirim detail internal atau rahasia ke respons.

Tes API dipisah di `apps/api/tests/unit/` dan `apps/api/tests/integration/`; buat `tests/fixtures/` hanya saat fixture bersama pertama memang diperlukan. Tes integrasi PostgreSQL memakai data unik dan membersihkan data uji tanpa menghapus data pengguna lain. `pnpm --filter api test:unit` tidak membutuhkan DB; `pnpm --filter api test:integration` membutuhkan DB lokal yang sudah dimigrasikan; `pnpm --filter api test` menjalankan keduanya.

Untuk skema DB, ikuti panduan migrasi di `docs/api-development.md`: ubah `prisma/schema/`, generate client, buat dan tinjau migrasi baru, lalu terapkan lokal. Jangan mengedit migrasi yang sudah diterapkan ke lingkungan bersama, jangan memakai `db push` untuk lingkungan bersama, dan jangan mereset DB berisi data tanpa persetujuan. Endpoint CRUD user belum memiliki autentikasi dan harus tetap dinonaktifkan di production sampai auth/authorization tersedia.

## Alur branch

Kerjakan perubahan pada branch kerja yang diminta; jangan commit atau push kecuali pengguna secara eksplisit meminta. Alur rilis adalah PR `dev` → `test`, kemudian PR `test` → `main`; jangan membuka PR ke `test` atau `main` dari branch lain dan jangan push langsung ke dua branch tujuan. Kedua branch harus mewajibkan PR dan pemeriksaan `branch-flow` serta `quality`. Workflow ada di `.github/workflows/pull-request.yml`; konfigurasi proteksi ada di `.github/branch-protection.json` dan diterapkan melalui `scripts/apply-branch-protection.sh` saat fitur tersedia.
