<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Lahlah workspace

- `apps/app`: aplikasi pengguna, Vite + React + TypeScript, port dev 5173.
- `apps/api`: API Hono di Node.js, port dev 8787; endpoint kesehatan ada di `/health`.
- `apps/admin`: dasbor admin, Vite + React + TypeScript, port dev 5174.
- `packages/ui`, `packages/eslint-config`, dan `packages/typescript-config` adalah paket bersama. `packages/ui` belum digunakan oleh kedua frontend.

Gunakan pnpm 11 dengan Node.js 24 atau lebih baru. Jalankan `pnpm install` setelah mengubah dependensi, lalu periksa perubahan dengan `pnpm build`, `pnpm lint`, dan `pnpm check-types`. Seluruh aplikasi dapat dijalankan dengan `pnpm dev`; untuk satu workspace gunakan `pnpm --filter <nama> dev`.

Jaga konfigurasi port berbeda agar ketiga aplikasi dapat berjalan bersama. Jangan menambahkan situs marketing atau Next.js tanpa kebutuhan baru dari pengguna.

Simpan aturan ignore yang berlaku untuk semua workspace di `.gitignore` root. File `dist/`, `.turbo/`, `node_modules/`, log, dan `.env` lokal adalah hasil kerja mesin; jangan masukkan ke Git. Simpan contoh konfigurasi sebagai `.env.example` bila diperlukan.

## Aturan wajib untuk frontend dan AI

Sebelum mengubah `apps/app` atau `apps/admin`, baca [docs/frontend-architecture.md](docs/frontend-architecture.md) dan skill lokal [lahlah-frontend](.agents/skills/lahlah-frontend/SKILL.md). Gunakan skill [shadcn](.agents/skills/shadcn/SKILL.md) ketika bekerja dengan komponen shadcn/ui dan [react-best-practices](.agents/skills/react-best-practices/SKILL.md) ketika mengubah perilaku atau kinerja React. Skill lokal disimpan di repo agar aturan yang sama tersedia pada sesi AI berikutnya.

Di setiap `src/` frontend ada tiga folder utama: `pages/`, `feat/`, dan `shared/`; `main.tsx` adalah entrypoint tunggal di root. `shared/` tidak boleh mengimpor `feat/` atau `pages/`. Setiap `feat/<nama>/` hanya boleh mengimpor dirinya sendiri dan `shared/`. Halaman tidak boleh saling mengimpor; `route.tsx` hanya boleh mendaftarkan halaman sekandung dan `route.tsx` dari folder anak langsung. Jika dua fitur memerlukan kode yang sama, pindahkan kode tersebut ke `shared/`. Jalankan lint untuk menegakkan aturan ini sebelum menyerahkan perubahan.
