# Kesiapan deploy Cloudflare Pages — `apps/app`

Audit untuk frontend `apps/app` (Vite SPA) ke Cloudflare Pages. Backend API (Hono/Node
di `apps/api`) tetap deploy terpisah; repo ini belum punya konfigurasi Workers.

## File yang sudah ada

| File | Fungsi |
| --- | --- |
| `apps/app/public/_redirects` | SPA fallback `/* /index.html 200` untuk route `/chat/:id`, `/chat/:id/trip`, dsb. |
| `apps/app/public/_headers` | Header hardening dasar (tanpa CSP — lihat catatan di bawah). |
| `apps/app/wrangler.jsonc` | `pages_build_output_dir: dist` (keluaran `vite build`). Tanpa Worker. |
| `apps/app/dist/` | Output build; Pages mengunggah direktori ini. |

## Variabel build

`VITE_API_BASE_URL` dibaca saat **build** (`apps/app/src/shared/api/client.ts`) dan
di-bake ke bundle JS — tidak bisa diganti saat runtime tanpa rebuild. Untuk deploy:

- Production: `VITE_API_BASE_URL=https://<domain-api>` (diset sebagai environment
  variable di dashboard Pages / perintah build).
- Lokal: default `http://localhost:8787` (`apps/app/.env`).
- Contoh: `apps/app/.env.example`.

## CORS

API hanya mengizinkan origin yang ada di `CORS_ORIGINS` (plus localhost saat
non-production). Setiap domain `*.pages.dev` / domain kustom frontend **wajib**
ditambahkan ke `CORS_ORIGINS` di API, karena client mengirim `credentials: include`
dan header `Authorization` (`apps/api/src/app.ts`, `apps/api/src/env.ts`).

## Pemblokir deploy (backend)

Chat dan itinerary melempar `503 AUTH_NOT_CONFIGURED` saat `NODE_ENV=production`
(`productionGate()` di `apps/api/src/modules/chat/services/chat.service.ts` dan
`apps/api/src/modules/itinerary/services/itinerary.service.ts`). Deploy production
frontend ke API production akan gagal sampai gate ini dicabut / auth dikonfigurasi.

## Catatan CSP

`_headers` sengaja tanpa `Content-Security-Policy`. Sebelum menambah CSP ketat,
uji dulu: MapLibre GL (worker `blob:`, tile/OSRM `https:`), SDK PeridotID, dan
gambar `https:`/Unsplash. Menambah CSP tanpa uji berisiko merusak peta/login.

## Langkah deploy (dashboard Pages)

1. Project Pages baru → root `apps/app`, build `pnpm --filter app build`,
   output `dist`, env `VITE_API_BASE_URL=<URL API>`.
2. Tambahkan domain Pages ke `CORS_ORIGINS` API lalu redeploy API.
3. Verifikasi: buka `/chat` → redirect login PeridotID; buka `/chat/<id>/trip` →
   panel itinerary; cek header via `curl -I`.

## Belum termasuk

- `wrangler deploy` / CI: tidak ada workflow Pages di repo; deploy via dashboard
  atau tambah `wrangler pages deploy dist` bila perlu.
- Preview branch: domain preview (`<branch>.<project>.pages.dev`) wajib ikut masuk
  `CORS_ORIGINS` atau request API gagal preflight.
