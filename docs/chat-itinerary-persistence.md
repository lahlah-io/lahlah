# chat & itinerary persistence

Dokumen ini menjelaskan arsitektur penyimpanan, versioning, dan kontrak backend untuk chat serta itinerary di Lahlah. Sumber kebenaran adalah **database** (PostgreSQL via Prisma).

## ruang lingkup

- Chat berbasis session + pesan, dengan riwayat versi pesan assistant.
- Itinerary yang dikonfirmasi dari draft chat, disimpan sebagai snapshot versi (stops + routes).
- Padang saja, 1 hari, thread linear tunggal.
- Di production, endpoint terkait ditutup (`503 AUTH_NOT_CONFIGURED`) sampai auth/authorization tersedia.

## model data (ringkas)

### chat

- **ChatSession** (`chat_sessions`)
  - Milik `userId`, punya `modelId`, `title`, `status`, `summary` (nullable), token counters, `lastMessageAt`, `schemaVersion`, metadata/context JSON.
  - Relasi: banyak `ChatMessage`, 0..1 `Itinerary` (1:1 dengan session saat itinerary dikonfirmasi).
- **ChatMessage** (`chat_messages`)
  - `sessionId`, `role` (`user|assistant|system|tool`), `content`, `position` (urutan dalam session), token/latency/model metadata, `status`, `errorJson`, `toolCallsJson`.
  - **Versioning pesan**: `versionsJson` (array snapshot versi), `activeVersion`. Pesan assistant dapat diregenerasi (menambah versi) atau diaktifkan ke versi tertentu; konten/status/metadata aktif mencerminkan versi aktif.
- **Model**: referensi model sistem yang dipakai session/pesan.

### itinerary

- **Itinerary** (`itineraries`)
  - Milik `userId`, terikat `sessionId` (unik, **relasi 1:1 session-itinerary**), `currentVersion`, info trip (`tripDate`, `city`, `transportMode`, dll), `title`, `content`, `status`, metadata.
  - Relasi: `destinations` (ItineraryDestination/join ke master destination), `versions` (ItineraryVersion).
- **ItineraryVersion** (`itinerary_versions`)
  - Snapshot **immutable** per versi: `version` (incremental), `basedOnVersion`, `changeInstruction`, `changeType` (`confirm`, `restore`, dll), agregat jarak/durasi, `status`, `createdAt`.
  - Berisi `stops` dan `routes`.
- **ItineraryStop** (`itinerary_stops`)
  - Stop terurut dalam versi: `position`, `destinationId?`, `name`, `latitude/longitude` (Decimal), waktu kedatangan/keberangkatan (string HH:MM pada snapshot), durasi kunjung/perjalanan, catatan/kategori.
- **ItineraryRoute** (`itinerary_routes`)
  - Leg antar stop dalam versi: `fromStopId`, `toStopId`, `transportMode`, `distanceM`, `durationSec`, `geometryJson` (GeoJSON LineString, koordinat `[lng, lat]`), `provider`, `providerProfile`, `fallback`, timestamps.
- **ItineraryDestination**: tautan itinerary ke destinasi master + info kunjungan (visitAt/cost/notes).

## invarian & aturan utama

1. **DB adalah sumber kebenaran** untuk session, pesan, dan itinerary terkonfirmasi. Cache client (`sessionStorage`/state) hanya untuk UI.
2. **1:1 session-itinerary**: satu session memiliki paling banyak satu itinerary terkonfirmasi; confirm bersifat idempotent per session/draft.
3. **Versi itinerary immutable**: versi tidak diedit. Perubahan state aktif dilakukan dengan membuat versi baru (mis. `restore` membuat versi baru berbasis target) dan memajukan `currentVersion`.
4. **Versi pesan**: regenerasi menambahkan entri di `versionsJson` dan mengaktifkannya; aktivasi manual mengubah `activeVersion` dan memproyeksikan konten/status/metadata aktif.
5. **Ordering pesan**: `position` monotonik per session; keyset pagination berbasis `after_position` (`position > afterPosition`, urut ASC).
6. **Kepemilikan & akses**: operasi membaca/menulis memvalidasi `userId` aktif dan kepemilikan resource; 403/404 sesuai kasus.
7. **Read tidak memanggil OSRM**: endpoint baca itinerary/by-session/versions mengembalikan snapshot yang tersimpan di DB (stops/routes/geometry). Perhitungan rute eksternal dilakukan saat pembuatan/konfirmasi draft (atau alur yang relevan), bukan saat read.

## alur konfirmasi & persistensi rute

1. Chat menghasilkan **draft** (in-memory, bertied ke user/session/draftId) ketika informasi cukup (tanggal, jam, kategori, destinasi Padang). Draft bisa berisi rute sementara; FE boleh memanggil `/api/v1/routes/driving` untuk **preview rute jalan** per profil (`car|motorcycle|foot`, belum tersimpan).
2. `POST /api/v1/itineraries/confirm` menerima `draftId`, `userId`, `sessionId`, dan opsional `profile` (`car|motorcycle|foot`, default `car`). Backend memvalidasi draft & destinasi aktif, menghitung rute jalan **per leg** sesuai profil (bila tersedia), lalu dalam transaksi membuat:
   - Itinerary (jika belum ada untuk session) + `ItineraryVersion` v1 (`changeType: "confirm"`)
   - `ItineraryStop` per destinasi (posisi, nama, koordinat Decimal, waktu/durasi)
   - `ItineraryRoute` per leg berurutan dengan geometri/jarak/durasi/provider/mode/profile persisten. Leg rute jalan: `fallback: false`, `provider`/`providerProfile` sesuai profil (`car`/`foot`; `motorcycle` estimasi, dipetakan ke driving). Leg tanpa rute: **per-leg fallback** (`fallback: true`, `provider: "fallback"`, `providerProfile: "straight_line"`, geometri garis lurus). Mode/metadata dapat `osrm`/`straight_line`/`mixed`.
3. Respons confirm bersifat idempotent (`201` create, `200` existing; existing tidak dihitung ulang). FE disarankan me-fetch `by-session` untuk memperoleh `ItineraryDetail` lengkap dari DB.
4. **Fallback marking & read**: route leg dengan `fallback: true` (atau provider fallback) harus ditampilkan sebagai garis lurus, bukan rute jalan. Endpoint read itinerary mengembalikan snapshot DB dan **tidak memanggil OSRM**.

## versioning & restore itinerary

- `GET /itineraries/:id/versions` → daftar ringkasan (version, basedOnVersion, changeType, counts, status, timestamps).
- `GET /itineraries/:id/versions/:version` → snapshot lengkap versi.
- `POST /itineraries/:id/restore/:version` dengan body `{ userId, expectedVersion? }`:
  - Memvalidasi kepemilikan.
  - Jika `expectedVersion` diberikan dan tidak sama dengan `currentVersion`, kembalikan `409 VERSION_CONFLICT`.
  - Membuat versi baru yang menyalin snapshot target (`basedOnVersion` = target, `changeType: "restore"`), memajukan `currentVersion`, dan mengembalikan `ItineraryDetail` terbaru.
- Versi lama tetap ada (audit trail / riwayat).

## bentuk data & catatan serialisasi

- **Koordinat stop**: `ItineraryStop.latitude/longitude` bertipe Decimal di DB dan diserialkan sebagai **string** di JSON; FE harus parse ke number.
- **Geometri rute**: `geometryJson.coordinates` menggunakan urutan **`[longitude, latitude]`** (GeoJSON). Input endpoint routing memakai `{ latitude, longitude }`.
- **Status itinerary**: dapat bernilai `"final"` (alias kompatibilitas). `ItineraryDetail` menyertakan `version` (snapshot aktif).
- **Keyset pesan**: respons keyset berisi `meta: { limit, nextAfterPosition }`; `nextAfterPosition: null` berarti tidak ada halaman berikutnya.

## kompatibilitas

- Endpoint & bentuk lama tetap didukung secara aditif: page/limit listing pesan, `ChatMessage` ringkas, field/alias legacy (mis. `status: "final"`).
- Mode pesan: keyset (`after_position`/`afterPosition`) dan page/limit dapat sama-sama dipakai; `oneOf` didokumentasikan di OpenAPI.
- Draft dikirim inline pada respons kirim pesan/regenerate; konfirmasi memakai `draftId` + `sessionId` + `userId`.

## keterbatasan & perilaku diketahui

- **Draft in-memory tidak dipulihkan setelah reload**: belum ada endpoint publik "get draft". Jika server restart atau halaman direload sebelum confirm, draft yang belum dikonfirmasi hilang; itinerary yang sudah dikonfirmasi tetap bisa dipulihkan via `GET /itineraries/by-session/:sessionId`.
- **Satu itinerary per session**: confirm ulang untuk session yang sudah punya itinerary bersifat idempotent (mengembalikan data existing), bukan membuat itinerary kedua.
- **Cakupan MVP**: kota Padang saja, durasi 1 hari, thread linear.
- **Auth produksi**: gate `AUTH_NOT_CONFIGURED`/503 aktif di production hingga autentikasi/otorisasi dipasang.
- **Routing**: endpoint `/routes/driving` adalah proxy untuk profil `car|motorcycle|foot` (preview draft). `source: "fallback"` berarti garis lurus; `motorcycle` dipetakan ke driving dengan durasi estimasi. Confirm mempersisten rute per leg dengan per-leg fallback; read tidak memanggil OSRM.
- **Pembersihan data uji**: pesan sintetis untuk pengujian keyset (jika dibuat) harus dibersihkan agar tidak mengotori riwayat demo.

## referensi

- API routes: `apps/api/src/modules/chat/api/chat.ts`, `apps/api/src/modules/itinerary/api/itinerary.api.ts`
- Services: `apps/api/src/modules/chat/services/chat.service.ts`, `apps/api/src/modules/itinerary/services/itinerary.service.ts`
- Repositories: `apps/api/src/modules/chat/repositories/chat.repository.ts`, `apps/api/src/modules/itinerary/repositories/itinerary.repository.ts`
- OpenAPI: `apps/api/src/openapi/document.ts` (disajikan di `GET /openapi.json`)
- Panduan FE: `docs/chat-api-untuk-fe.md`
- Contoh integrasi: `apps/app/public/chat-test.html`
