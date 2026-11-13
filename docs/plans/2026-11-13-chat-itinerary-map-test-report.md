# Laporan Testing Chat, Itinerary Map, Generate Map Versi, dan Simpan Checkpoint

Tanggal: 2026-11-13
Branch: `feat/backend`
Commit acuan: `a6a6eff feat(chat): composer uses version wording, drop draft copy from chat-test.html`
Runtime: Node `v24.22.2`, pnpm `11.25.0`

## 1. Ringkasan eksekutif

- Chat + itinerary map: **PASS dengan bukti test**.
- Generate map versi (`Lihat` / `Pulihkan`): **PASS dengan bukti test**.
- Simpan checkpoint baru (create/read/upload/ownership): **BELUM ADA — design gap, tidak di-PASS-kan**.
- Hasil E2E sudah diimplementasikan ke kode `/api` + `chat-test.html`, bukan hanya mock test.
- Status produksi: **belum produksi**. Masih di branch `feat/backend`, uncommitted, `ahead 11` dari remote, dan `productionGate()` masih menonaktifkan Itinerary API saat `NODE_ENV=production`.

## 2. Implementasi yang diuji

Bukan hanya mock. Perubahan read-only, tanpa migrasi DB:

### Backend `/api`

- Baru: `apps/api/src/modules/itinerary/services/version-routes.ts`
  - `deriveVersionRoutes(routeJson, stops)`
  - Memetakan `routeJson.legs[fromPosition/toPosition]` ke `fromStopId/toStopId`.
  - Geometri + `provider/profile/fallback` diteruskan apa adanya.
  - Leg tanpa stop yang cocok di-skip.
- `apps/api/src/modules/itinerary/services/itinerary.service.ts`
  - `asVersionView()` sekarang mengembalikan:
    - `stops[].id`
    - `stops[].departureTime`
    - `routes[]` derivatif
    - `routeJson` tetap utuh
  - Snapshot tersimpan tidak diubah.
- `apps/api/src/shared/schemas/itinerary-version.ts`
  - Tambah `ItineraryVersionRoute`.
  - Tambah `routes?` opsional di `ItineraryVersionView`.
- `apps/api/src/openapi.ts`
  - Tambah `itineraryVersionRouteView`.
  - Tambah `routes?` opsional di `ItineraryVersionView`.
  - Validasi `geometryJson` memakai skema `LineString`.

### Halaman uji

- `apps/app/public/chat-test.html`
  - `snapshotFromVersion()` memakai `version.routes` bila ada.
  - Fallback membangun `routes` dari `version.routeJson.legs` via `position` bila backend lama belum mengirim `routes`.
- `apps/app/tests/chat-test.e2e.test.ts`
  - Mock API diselaraskan ke kontrak versi itinerary saat ini.
  - Model snapshot, `routeJson.legs`, preview, dan restore.

## 3. Hasil test browser E2E

Perintah:

```bash
pnpm --filter app exec vitest run tests/chat-test.e2e.test.ts --reporter=verbose
```

Hasil: **14/14 PASS**.

| ID | Yang di-test | Hasil |
|---|---|---|
| HTML-001 | Dua chat baru membuat dua tab independen | PASS |
| HTML-002 | Pindah tab menampilkan riwayat yang sesuai | PASS |
| HTML-003 | Reload memulihkan session aktif, history, draft, dan route | PASS |
| HTML-004 | Pesan itinerary valid me-render bubble user/assistant dan draft | PASS |
| HTML-005 | Pesan kosong ditolak sebelum API call | PASS |
| HTML-006 | API failure mempertahankan teks dan menandai bubble failed | PASS |
| HTML-007 | Panel draft menampilkan stops berurutan dengan versi aktif | PASS |
| HTML-008 | Restore membuat versi baru, lalu preview tidak mengubah versi aktif | PASS |
| HTML-009 | Fallback persisten dilabel garis lurus + marker bernomor 1-2-3 | PASS |
| HTML-010 | Fallback persisten dilabel garis lurus, tidak pernah road routing | PASS |
| HTML-011 | Kurang dari 2 titik: route tidak digambar | PASS |
| HTML-012 | Base URL dan user id tersimpan di localStorage | PASS |
| HTML-013 | Layout mobile 390px menumpuk chat di atas itinerary tanpa overflow | PASS |
| HTML-014 | Tabs/live regions aksesibel, chat baru memfokuskan composer | PASS |

Catatan penting:

- Test browser memakai mock API yang sesuai kontrak.
- Hasil ini membuktikan alur halaman bekerja terhadap kontrak tersebut.
- Ini bukan bukti terhadap PostgreSQL nyata.
- Test rute tidak membuktikan OSRM road routing. Rute persisten selalu dilabel garis lurus.

## 4. Hasil unit API

### 4.1 Test baru `version-routes`

Perintah:

```bash
pnpm --filter api exec vitest run tests/unit/features/itinerary/version-routes.test.ts --reporter=verbose
```

Hasil: **2/2 PASS**.

Yang di-test:

1. `deriveVersionRoutes` memetakan route legs persisten ke ID stop itinerary tanpa mengubah geometri/source.
2. `deriveVersionRoutes` melewatkan route legs tanpa stop yang cocok.

### 4.2 Seluruh unit API

Perintah:

```bash
pnpm --filter api exec vitest run tests/unit
```

Hasil terakhir yang terverifikasi:

- Test files: **30 passed**
- Tests: **201 passed, 11 todo**

## 5. Hasil check-types

Perintah:

```bash
pnpm check-types
```

Hasil terakhir yang terverifikasi:

- **4 successful, 4 total**
- Termasuk `api:check-types` dan `app:check-types`.

## 6. Hasil testing chat dan itinerary map

Status: **PASS**.

Alur yang terbukti:

1. Kirim pesan chat ke `/api/v1/chat/sessions/:sessionId/messages`.
2. Backend mengembalikan `version`.
3. Halaman memuat itinerary aktif via `by-session`.
4. Panel itinerary menampilkan:
   - Metadata versi aktif.
   - Daftar stops berurutan.
   - Marker peta bernomor.
   - `routeNote` yang benar.
5. Peta memakai snapshot versi aktif.
6. Rute persisten selalu dilabel:
   - `Rute garis lurus`
   - `Bukan rute jalan`

## 7. Hasil generate map versi

Status: **PASS**.

Perilaku versi yang terbukti:

- Setiap pesan generate membuat versi itinerary baru.
- `Lihat`:
  - Hanya preview.
  - Tidak mengubah versi aktif.
- `Pulihkan`:
  - Membuat versi baru dari snapshot lama.
  - Versi aktif berpindah ke versi baru tersebut.
- Versi lama tetap menjadi riwayat.
- Saving dan activation independen.
- Unsaving tidak menghapus versi.

## 8. Hasil simpan checkpoint

Status: **BELUM ADA / DESIGN GAP — tidak PASS**.

Temuan:

- Tidak ada endpoint checkpoint create/read/upload/ownership di `/api`.
- Tidak ada UI checkpoint di `chat-test.html`.
- Tidak ada test create/read/upload checkpoint yang bisa di-PASS-kan.
- Yang ada hanya retensi checkpoint di DB:
  - `DestinationCheckpoint` tetap menempel pada `itinerary_destination_id` aslinya saat versi diganti.
  - Dibuktikan oleh integration test `itinerary.version-select.test.ts` dan `itinerary.destination-sync.test.ts`.
  - Itu bukan fitur upload checkpoint baru.

Aturan yang dipertahankan:

- Checkpoint tidak dipindah antar versi.
- Tidak ada klaim straight-line fallback sebagai road routing.
- Tidak ada assertion atas wording AI yang persis.
- Regenerasi destinasi tidak diwajibkan berbeda.

## 9. Status produksi

Belum diimplementasikan ke produksi:

- Posisi masih di branch `feat/backend`.
- Masih ada perubahan uncommitted.
- Branch lokal `ahead 11` dari `origin/feat/backend`.
- `origin/main` belum berisi perubahan ini.
- Alur rilis repo: `feat/backend` → `dev` → `test` → `main`.
- `productionGate()` masih menonaktifkan Itinerary API di production sampai auth tersedia.

## 10. Yang sengaja tidak di-test / dilewati

- `pnpm lint` penuh.
- Integration test PostgreSQL penuh.
- Database writing integration dengan asumsi DB test khusus.
- Real-provider smoke yang butuh approval biaya/lingkungan terisolasi.
- Checkpoint create/read/upload/ownership karena belum ada implementasi dan belum disetujui sebagai fitur.

## 11. Risiko dan tindak lanjut

Risiko:

- Mapping `routes` mengandalkan `position`; leg tanpa stop yang cocok di-skip diam-diam.
- Cakupan browser untuk marker tiap versi masih terbatas pada metadata aktif + restore, bukan assertion marker penuh per versi historis.
- Working tree masih uncommitted; ada perubahan API lain yang sudah ada sebelum pekerjaan ini.

Tindak lanjut yang disarankan:

1. Commit perubahan backend + HTML + test secara terpisah dan jelas.
2. Tambah assertion marker peta untuk preview/restore tiap versi bila dibutuhkan.
3. Konfirmasi DB test terisolasi sebelum integration DB penuh.
4. Minta persetujuan eksplisit bila ingin smoke provider nyata.
5. Minta persetujuan fitur bila checkpoint create/upload benar-benar ingin dibangun.
