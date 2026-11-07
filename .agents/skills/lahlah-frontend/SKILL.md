---
name: lahlah-frontend
description: Membangun atau mengubah frontend Vite React di apps/app dan apps/admin dengan arsitektur pages, feat, shared, route.tsx, dan shadcn/ui Lahlah.
---

# Frontend Lahlah

Sebelum mengubah `apps/app` atau `apps/admin`, baca `docs/frontend-architecture.md` dari root repo. Perlakukan tabel batas impor dan aturan penempatan file di sana sebagai kontrak. Periksa `AGENTS.md` dan `components.json` aplikasi yang sedang diubah.

Rencanakan lokasi kode sebelum menulis: page hanya menyusun route/section, feat menyimpan perilaku satu fitur, shared menyimpan unit lintas fitur dan fondasi UI. Pindahkan kode ke shared saat fitur lain mulai memakainya; jangan membuat dependensi silang antarfitur.

Untuk UI baru, gunakan komponen shadcn yang sudah ada di `src/shared/components/ui/`. Jika perlu komponen baru, gunakan CLI dari root dengan `--cwd apps/app` atau `--cwd apps/admin`, lalu periksa hasil generator agar tetap mengikuti tiga folder. Baca skill lokal `shadcn` saat bekerja dengan komponen atau registry; baca `react-best-practices` untuk perubahan React yang berpengaruh pada data, render, atau bundle.

Sebelum selesai, jalankan `pnpm lint`, `pnpm check-types`, dan `pnpm build`. Lint mencakup pemeriksaan struktur folder dan batas impor; perbaiki pelanggaran dengan memindahkan kode ke tempat yang tepat, bukan menonaktifkan aturan.
