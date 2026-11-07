# Lahlah

Monorepo pnpm dan Turborepo untuk tiga aplikasi:

| Workspace | Stack | Port dev | Tujuan |
| --- | --- | --- | --- |
| `apps/app` | Vite + React + TypeScript | 5173 | Aplikasi pengguna |
| `apps/api` | Hono + Node.js | 8787 | API (`/health`) |
| `apps/admin` | Vite + React + TypeScript | 5174 | Dasbor admin |

## Menjalankan

Butuh Node.js 24+ dan pnpm 11.

```sh
pnpm install
pnpm dev
```

Semua aplikasi berjalan bersama. Untuk menjalankan satu aplikasi saja:

```sh
pnpm --filter app dev
pnpm --filter api dev
pnpm --filter admin dev
```

Periksa seluruh workspace dengan `pnpm build`, `pnpm lint`, dan `pnpm check-types`.

Hasil build berada di `dist/` setiap aplikasi. API dapat dijalankan setelah build dengan `pnpm --filter api start`. Port API dapat diubah melalui variabel lingkungan `PORT`; nilai defaultnya 8787.

`packages/ui`, `packages/eslint-config`, dan `packages/typescript-config` tersedia sebagai paket bersama. `packages/ui` belum dipakai oleh frontend saat ini. Tampilan aplikasi masih scaffold awal.

`.gitignore` di root berlaku untuk semua workspace: dependensi, hasil build, cache, log, dan file `.env` lokal diabaikan. Jika perlu membagikan daftar variabel lingkungan, gunakan `.env.example`.

## Aturan frontend

`apps/app` dan `apps/admin` memakai shadcn/ui dan struktur `src/pages`, `src/feat`, `src/shared`. Aturan penempatan file, batas impor, dan pola `route.tsx` dijelaskan di [docs/frontend-architecture.md](docs/frontend-architecture.md). `pnpm lint` menegakkannya secara otomatis. AI yang bekerja di repo ini wajib membaca [AGENTS.md](AGENTS.md) dan skill lokal di `.agents/skills/`.
