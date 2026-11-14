# Arsitektur frontend Lahlah

Aturan ini berlaku untuk `apps/app` dan `apps/admin`. Keduanya memakai Vite, React, TypeScript, React Router, Tailwind CSS, dan shadcn/ui. Jalankan `pnpm lint`, `pnpm check-types`, dan `pnpm build` setelah mengubah frontend. `pnpm lint` memeriksa struktur folder dan batas impor.

## Tiga folder di `src/`

```text
src/
├── main.tsx                 # satu-satunya entrypoint di root src
├── pages/
│   ├── home.tsx
│   ├── route.tsx
│   └── settings/
│       ├── index.tsx
│       ├── permission.tsx
│       └── route.tsx
├── feat/
│   └── settings/
│       ├── components/
│       └── hooks/
└── shared/
    ├── components/ui/       # primitive shadcn/ui
    ├── hooks/
    ├── styles/
    ├── types/
    └── utils/
```

Contoh folder `settings` menunjukkan pola, bukan fitur yang sudah tersedia. Buat hanya subfolder yang benar-benar diperlukan. `main.tsx` hanya memuat CSS global dan router dari `pages/route.tsx`.

## Batas impor

| Sumber               | Boleh mengimpor kode lokal dari | Dilarang                                          |
| -------------------- | ------------------------------- | ------------------------------------------------- |
| `shared/**`          | `shared/**`                     | `feat/**`, `pages/**`                             |
| `feat/nama-fitur/**` | fitur yang sama, `shared/**`    | fitur lain, `pages/**`                            |
| `pages/**`           | `feat/**`, `shared/**`          | halaman lain, kecuali aturan `route.tsx` di bawah |

Paket eksternal boleh dipakai sesuai kebutuhan. Alias `@/` menunjuk ke `src/`; aturan yang sama berlaku untuk alias, path relatif, impor dinamis dengan string literal, dan re-export. Jangan menghindari batas folder dengan path relatif yang lebih panjang.

Jangan mengimpor file `src/` dari aplikasi frontend lain melalui path relatif. Jika `app` dan `admin` membutuhkan kode yang sama, pindahkan kode tersebut ke paket workspace bersama.

`pages/` hanya berisi file `.tsx` untuk halaman dan `route.tsx`. Setiap folder di bawah `pages/` harus memiliki `route.tsx`. Halaman biasa tidak boleh mengimpor file apa pun dari `pages/`. **Pengecualian route:** `route.tsx` boleh mengimpor file halaman lain dalam foldernya sendiri dan `route.tsx` dari folder anak langsung untuk mendaftarkan route. Ini diperlukan agar route root bisa menggabungkan route kelompok, sementara komponen halaman tetap tidak saling bergantung. Simpan konfigurasi URL di `route.tsx`; jangan taruh UI atau logika fitur di sana.

Contoh saat menambah kelompok `settings`: `pages/settings/route.tsx` mengimpor `./index` dan `./permission`, lalu mengekspor daftar `RouteObject[]`. `pages/route.tsx` mengimpor `./settings/route` dan menyebarkan daftar itu ke `createBrowserRouter`. Halaman `index.tsx` dan `permission.tsx` tetap tidak saling mengimpor.

Halaman sebaiknya hanya menyusun section dan data pada tingkat route. Section yang mulai panjang atau memiliki perilaku sendiri pindah ke `feat/<nama-fitur>/components/`. Batas lint untuk setiap file `pages/**/*.tsx` adalah 300 baris efektif. Jangan memecah kode hanya untuk memenuhi angka; pilih batas komponen yang masuk akal dan mudah diaudit.

Setiap fitur memiliki folder sendiri di `feat/`. File fitur berada dalam subfolder tujuan seperti `components/`, `hooks/`, `styles/`, `utils/`, `types/`, `services/`, atau `schemas/`. Tidak perlu membuat folder yang kosong. Jika dua fitur membutuhkan logika atau komponen yang sama, pindahkan unit bersama itu ke `shared/` dan perbarui kedua impor. Jangan mengimpor langsung dari fitur lain.

`shared/` menampung potongan yang benar-benar dipakai lintas fitur, serta fondasi aplikasi yang memang global: tema, utilitas dasar, dan primitive shadcn/ui. Jangan menaikkan kode spesifik satu fitur ke `shared/` terlalu dini.

## shadcn/ui

Setiap frontend memiliki `components.json` sendiri. CLI menaruh primitive di `src/shared/components/ui/` dan CSS tema di `src/shared/styles/globals.css`. Tambahkan hanya komponen yang digunakan:

```sh
pnpm dlx shadcn@latest add dialog --cwd apps/app
pnpm dlx shadcn@latest add dialog --cwd apps/admin
```

Periksa file hasil generator sebelum menyimpan. Komponen atau blok yang merupakan bagian dari satu fitur harus ditempatkan di `feat/<nama-fitur>/`, bukan otomatis dianggap kode `shared/`. Jalankan lint dan build setelah penambahan.

## Tipografi

Dua peran font didefinisikan sebagai token di `src/shared/styles/globals.css`:

| Token            | Font                      | Dipakai untuk                                                        |
| ---------------- | ------------------------- | -------------------------------------------------------------------- |
| `--font-sans`    | Geist Variable            | Teks isi, label, tombol, input, dan semua angka (termasuk harga)     |
| `--font-heading` | Bricolage Grotesque Variable | Judul: `h1`–`h3`, `CardTitle`, `DialogTitle`, `SheetTitle`, dll.   |

Aturan:

- Jangan menulis nama font langsung di komponen. Pakai `font-heading` atau biarkan elemen `h1`–`h3` mendapatkannya dari base layer.
- Angka dan data numerik tetap di Geist. Jangan pasang `font-heading` pada nominal, persentase, atau statistik; pakai `tabular-nums` bila perlu perataan.
- Judul yang bukan elemen heading (misalnya `CardTitle` dari shadcn/ui) sudah memakai `font-heading`; jangan menggantinya dengan `font-sans`.
- Menambah font baru berarti menambah token di `globals.css` dan mendokumentasikan perannya di tabel ini.

## Autentikasi

`apps/admin` dan `apps/app` memakai fondasi auth yang sama di `src/feat/auth/`:

- `services/auth.api.ts` — `GET /api/v1/auth/me` dan `POST /api/v1/auth/logout`.
- `hooks/auth-provider.tsx` — satu sumber status sesi. Token dari `sessionStorage` (`lahlah.admin.token` / `lahlah.app.token`) dipasang ke klien API melalui `setApiSessionToken`, lalu diverifikasi ke `/auth/me` saat halaman dimuat.
- `components/require-admin.tsx` / `components/require-auth.tsx` — mengalihkan sesi anonim ke `/login`; versi admin juga menolak role selain `admin`.
- `pages/route.tsx` — root `AuthRoot` membungkus seluruh route, lalu route privat berada di bawah guard.
- `shared/api/client.ts` — satu-satunya tempat `fetch` ke API: base URL dari `VITE_API_BASE_URL` (default `http://localhost:8787`), envelope `{ error: { code, message } }` dipetakan ke `ApiError`.

Login memakai PeridotID: `peridot.auth.loginPopup()` lalu `pid_code` dikirim ke `POST /api/v1/auth/peridot/exchange` (header `X-Session-Mode: bearer`). Halaman admin masih menerima token sesi pengembangan sebagai fallback:

```sh
pnpm --filter api dev:session -- --admin
```

Sesi disimpan di `sessionStorage`, bukan `localStorage`, supaya token hilang ketika tab ditutup. Cookie `lahlah_session` tetap didukung karena setiap request memakai `credentials: "include"`. Salin `.env.example` aplikasi menjadi `.env` bila API tidak berjalan di port `8787`.

