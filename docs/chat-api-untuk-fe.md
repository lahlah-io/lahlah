# panduan api chat untuk fe dev

Buat kamu yang bangun UI chat itinerary di frontend. Semua contoh di sini diambil dari kode yang sudah jalan, bukan rencana.

## gambaran cepat

Alur normalnya begini:

1. FE bikin session baru untuk satu `userId`
2. FE kirim pesan user ke session itu
3. Backend balas teks plus `draft` kalau request itinerary-nya lengkap
4. FE tampilkan draft di panel itinerary
5. User tekan simpan, FE panggil `POST /itineraries/confirm` (idempotent: `201` pertama kali, `200` jika draft/session sudah dikonfirmasi)
6. FE ambil itinerary terkonfirmasi dari DB via `GET /itineraries/by-session/:sessionId` atau `GET /itineraries/:id` dan render dari snapshot DB
7. FE bisa menampilkan riwayat versi itinerary, pratinjau versi, atau memulihkan versi lama

Base URL lokal default: API berjalan di `http://localhost:8989` (lihat `apps/api/.env`, `PORT`). Semua path di bawah prefix `/api/v1`. OpenAPI juga mendaftarkan server `http://localhost:8787`.

Catatan penting: tiap request chat/itinerary wajib bawa `userId` (query atau body sesuai endpoint). Backend mengecek user-nya aktif dan kepemilikan resource. Di production (`NODE_ENV=production`) endpoint chat, users, dan itineraries ditutup dengan `503 AUTH_NOT_CONFIGURED` sampai auth dipasang. Panduan ini untuk dev/staging.

Referensi implementasi: `apps/app/public/chat-test.html` (`request()`, `refreshSessions()`, `sendMessage()`, `loadMessages()` keyset, `regenerateMessage()`, `toggleMessageVersions()`, `confirmDraft()`, `loadItinerary()`, `previewItineraryVersion()`, `restoreItineraryVersion()`).

## 1. bikin session

```http
POST /api/v1/chat/sessions
Content-Type: application/json

{ "userId": "dev-user-1", "title": "Liburan Padang" }
```

Balasan `201`:

```json
{
  "data": {
    "id": "session-uuid",
    "userId": "dev-user-1",
    "modelId": "model-uuid",
    "title": "Liburan Padang",
    "status": "active",
    "summary": null,
    "contextJson": {},
    "metadata": {},
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0,
    "lastMessageAt": null,
    "schemaVersion": 1,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

`title` opsional. Kalau kosong, backend isi `"New chat"`. `summary` bisa `null`. Satu user boleh punya banyak session; FE menampilkannya sebagai tab.

## 2. daftar session

```http
GET /api/v1/chat/sessions?userId=dev-user-1&page=1&limit=100
```

Balasan:

```json
{
  "data": [{ "id": "session-uuid", "userId": "dev-user-1", "title": "Liburan Padang", "...": "..." }],
  "meta": { "page": 1, "limit": 100, "total": 3 }
}
```

Urut terbaru dulu. `page` mulai dari 1, `limit` 1 sampai 100, default 20.

## 3. ubah atau hapus session

### ubah judul/summary/status

```http
PATCH /api/v1/chat/sessions/:id
Content-Type: application/json

{ "userId": "dev-user-1", "title": "E2E Padang 20 Nov" }
```

Minimal salah satu dari `title`, `summary` (boleh `null`), atau `status` harus dikirim. Balasan `200` berisi `{ "data": <session ter-update> }`.

### hapus session

```http
DELETE /api/v1/chat/sessions/:id?userId=dev-user-1
```

Balasan `200`: `{ "data": { "deleted": true } }`. Menghapus session milik user (dan data terkait sesuai kebijakan penyimpanan).

## 4. ambil riwayat pesan

Tersedia dua mode: **page/limit** (legacy) dan **keyset** (direkomendasikan untuk load-more).

### keyset (direkomendasikan)

```http
GET /api/v1/chat/sessions/:id/messages?userId=dev-user-1&after_position=0&limit=20
```

- `after_position` (atau `afterPosition`): posisi pesan terakhir yang sudah dimuat. Kirim `0` untuk batch pertama.
- Urutan: naik berdasarkan `position` (lama ke baru).
- Balasan `200`:

```json
{
  "data": [
    {
      "id": "msg-uuid",
      "sessionId": "session-uuid",
      "modelId": "model-uuid",
      "role": "user",
      "content": "...",
      "position": 1,
      "inputTokens": 0,
      "outputTokens": 0,
      "metadata": {},
      "toolCallsJson": null,
      "toolCallId": null,
      "mode": null,
      "model": null,
      "latencyMs": null,
      "status": "completed",
      "errorJson": null,
      "versionsJson": [ { "version": 1, "content": "...", "status": "completed", "createdAt": "...", "metadata": {} } ],
      "activeVersion": 1,
      "schemaVersion": 1,
      "createdAt": "..."
    }
  ],
  "meta": { "limit": 20, "nextAfterPosition": 3 }
}
```

- `meta.nextAfterPosition` berisi posisi terakhir pada batch ini jika masih ada halaman berikutnya, atau `null` jika habis. FE cek `nextAfterPosition != null` untuk menampilkan tombol muat lagi.
- `role` bisa `user`, `assistant`, `system`, atau `tool`. Pesan `tool` adalah hasil tool-call; FE bisa menyaringnya dari bubble biasa.
- `versionsJson` menyimpan riwayat versi; `activeVersion` menandai versi yang aktif.

### page/limit (legacy)

```http
GET /api/v1/chat/sessions/:id/messages?userId=dev-user-1&page=1&limit=50
```

Balasan berisi `data` + `meta: { page, limit, total }`. Bentuk item bisa lebih ringkas (tanpa sebagian field detail). Kedua mode didukung; FE baru disarankan pakai keyset.

## 5. kirim pesan

```http
POST /api/v1/chat/sessions/:id/messages
Content-Type: application/json

{ "userId": "dev-user-1", "content": "besok jalan-jalan pantai dari jam 9 sampai 3 sore" }
```

Aturan `content`: string, minimal 1, maksimal 4000 karakter. Balasan `200`:

```json
{
  "data": {
    "message": "Siap, ini draft itinerary-nya...",
    "intent": "generate_itinerary",
    "draft": {
      "draftId": "draft-uuid",
      "status": "pending_confirmation",
      "travelDate": "2026-11-10",
      "startTime": "09:00",
      "endTime": "15:00",
      "destinations": [
        {
          "order": 1,
          "destinationId": "dest-uuid",
          "name": "Pantai Padang",
          "latitude": -0.95,
          "longitude": 100.35,
          "visitAt": "09:00",
          "durationMinutes": 90
        }
      ],
      "route": {
        "type": "LineString",
        "coordinates": [[100.35, -0.95], [100.36, -0.94]]
      }
    },
    "assistantMessageId": "msg-uuid",
    "sessionId": "session-uuid"
  }
}
```

Nilai `intent` yang mungkin keluar:

- `general_chat` — obrolan biasa
- `generate_itinerary`, `modify_itinerary`, `regenerate_itinerary` — alur itinerary
- `confirm_itinerary` — user bilang setuju/konfirmasi
- `missing_information` — tanggal, jam, atau kategori belum lengkap; `draft` bisa `null` dan `message` menyebut apa yang kurang

Contoh pemicu draft: tanggal + jam mulai-selesai + kategori, misalnya `"besok wisata pantai dari jam 09:00 sampai 15:00"`. Tanggal dipahami dalam zona `Asia/Jakarta`. Kata waktu umum juga dikenali: `pagi`/`siang`/`sore`/`malam` dipetakan ke rentang jam (08:00-11:00 / 11:00-14:00 / 15:00-18:00 / 18:30-21:30), jadi `"besok sore kategori pantai"` cukup untuk memicu draft. Kalau jam belum disebut, backend memberi saran waktu (bukan draft langsung).

`metadata` di pesan assistant menyimpan `intent` dan `draftId`.

## 6. versi pesan assistant (regenerate & aktivasi)

Pesan assistant menyimpan riwayat di `versionsJson` dan penanda `activeVersion`.

### daftar versi pesan

```http
GET /api/v1/chat/messages/:id/versions?userId=dev-user-1
```

Balasan `200`:

```json
{
  "data": {
    "messageId": "msg-uuid",
    "sessionId": "session-uuid",
    "activeVersion": 2,
    "versions": [
      { "version": 1, "content": "...", "status": "completed", "createdAt": "...", "metadata": { "intent": "generate_itinerary", "draftId": "..." } },
      { "version": 2, "content": "...", "status": "completed", "createdAt": "...", "metadata": { "intent": "generate_itinerary", "draftId": "..." } }
    ],
    "versionsJson": "..."
  }
}
```

### regenerate (buat versi baru)

```http
POST /api/v1/chat/messages/:id/regenerate
Content-Type: application/json

{ "userId": "dev-user-1" }
```

- Hanya untuk pesan `role: "assistant"`.
- Backend menggunakan pesan user pemicu (sebelum pesan assistant tersebut) sebagai konteks regenerasi.
- Balasan `200`: `{ "data": { "assistantMessageId", "sessionId", "message", "intent", "draft", "activeVersion" } }`. `draft` bisa berisi draft baru.

### aktifkan versi tertentu

```http
PATCH /api/v1/chat/messages/:id/versions/:version/activate
Content-Type: application/json

{ "userId": "dev-user-1" }
```

Mengganti konten/status/metadata pesan menjadi versi yang dipilih. Balasan `200`:

```json
{
  "data": {
    "messageId": "msg-uuid",
    "sessionId": "session-uuid",
    "activeVersion": 1,
    "content": "...",
    "status": "completed"
  }
}
```

## 7. simpan itinerary (confirm)

```http
POST /api/v1/itineraries/confirm
Content-Type: application/json

{ "draftId": "draft-uuid", "userId": "dev-user-1", "sessionId": "session-uuid", "profile": "car" }
```

- `profile` opsional: `car` | `motorcycle` | `foot` (default `car`). Tentukan profil transportasi saat konfirmasi agar rute jalan mengikuti profil yang dipilih.
- Idempotent: penyimpanan pertama `201`, pengulangan draft/session yang sama `200`. Bentuk `{ "data": { ... } }` (ringkas). Confirm ulang mengembalikan itinerary existing (tidak menghitung ulang rute).
- Backend menghitung rute jalan **per leg** saat konfirmasi (bila tersedia) dan mempersisten snapshot versi 1 (`changeType: "confirm"`) berisi `stops` dan `route legs` nyata: `geometryJson`/jarak/durasi/`provider`/`transportMode`/`providerProfile` sesuai profil.
- Jika rute jalan leg tertentu tidak tersedia, hanya leg itu yang menjadi fallback (`fallback: true`, `provider: "fallback"`, `providerProfile: "straight_line"`, geometri garis lurus). Leg lain tetap rute jalan bila tersedia (`mode` dapat `mixed`).
- `motorcycle` dipetakan ke rute driving OSRM dengan durasi estimasi; tampilkan sebagai estimasi di UI. `foot` memakai profil jalan kaki.
- Destinasi harus masih aktif di Padang.

**Rekomendasi FE:** setelah confirm sukses, fetch ulang `GET /api/v1/itineraries/by-session/:sessionId` dan render dari snapshot DB (stops/routes persisten). Read endpoint tidak memanggil OSRM.

## 8. ambil itinerary

### berdasarkan id

```http
GET /api/v1/itineraries/:id?userId=dev-user-1
```

Balasan `{ "data": <ItineraryDetail> }`. Hanya pemilik.

### berdasarkan session

```http
GET /api/v1/itineraries/by-session/:sessionId?userId=dev-user-1
```

Mengembalikan itinerary milik session (jika ada). Berguna untuk restore UI saat pindah tab/reload. `404 ITINERARY_NOT_FOUND` jika belum ada.

### bentuk `ItineraryDetail`

`ItineraryDetail` = data itinerary dasar + field `version` (snapshot versi saat ini). Hanya endpoint detail/by-session/get-version/restore yang mengembalikan bentuk detail dengan snapshot versi.

Contoh (dipotong):

```json
{
  "id": "itinerary-uuid",
  "userId": "dev-user-1",
  "sessionId": "session-uuid",
  "currentVersion": 3,
  "tripDate": "2026-11-20T00:00:00.000Z",
  "durationDays": 1,
  "city": "Padang",
  "transportMode": "straight_line",
  "title": "Itinerary Padang 2026-11-20",
  "content": "1. ...",
  "status": "final",
  "isPublic": false,
  "shareSlug": null,
  "metadata": { "date": "2026-11-20", "startTime": "08:00", "endTime": "16:00", "mode": "osrm", "distanceType": "osrm", "profile": "car", "route": { "type": "LineString", "coordinates": [[100.359, -0.965], [100.358, -0.964]] } },
  "createdAt": "...",
  "updatedAt": "...",
  "destinations": [
    { "id": "...", "itineraryId": "...", "destinationId": "dest-uuid", "visitAt": "2026-11-20T08:00:00.000Z", "estimatedCost": null, "notes": null, "createdAt": "..." }
  ],
  "version": {
    "id": "version-uuid",
    "itineraryId": "itinerary-uuid",
    "version": 3,
    "basedOnVersion": 1,
    "changeInstruction": null,
    "changeType": "restore",
    "totalDistanceM": 1234,
    "totalDurationMin": 8,
    "totalEstimatedMin": 8,
    "status": "confirmed",
    "createdAt": "...",
    "stops": [
      {
        "id": "stop-uuid",
        "itineraryVersionId": "version-uuid",
        "destinationId": "dest-uuid",
        "position": 1,
        "name": "Jembatan Siti Nurbaya",
        "latitude": "-0.9654557",
        "longitude": "100.3590942",
        "arrivalTime": "08:00",
        "departureTime": null,
        "visitDurationMin": 60,
        "travelDurationMin": null,
        "notes": null,
        "category": null
      }
    ],
    "routes": [
      {
        "id": "route-uuid",
        "itineraryVersionId": "version-uuid",
        "fromStopId": "stop-uuid-a",
        "toStopId": "stop-uuid-b",
        "transportMode": "car",
        "distanceM": 1234,
        "durationSec": 480,
        "geometryJson": { "type": "LineString", "coordinates": [[100.3590942, -0.9654557], [100.3582427, -0.964448]] },
        "provider": "osrm",
        "providerProfile": "car",
        "fallback": false,
        "createdAt": "..."
      }
    ]
  }
}
```

**Penting:**

- `stops[].latitude` dan `stops[].longitude` adalah **string** (Prisma `Decimal` diserialkan sebagai string di JSON). FE wajib parse ke number (`Number(...)`/`parseFloat`).
- `routes[].geometryJson.coordinates` berurutan **`[longitude, latitude]`** (GeoJSON). `fallback: true` atau `provider: "fallback"` menandakan garis lurus (bukan rute jalan). Route jalan nyata: `fallback: false` dengan `provider`/`providerProfile` sesuai profil (`car`/`foot`; `motorcycle` estimasi). Fallback bisa **per leg** (`mode`/metadata dapat `mixed`).
- `metadata.profile`, `metadata.mode`/`distanceType` (`osrm`/`straight_line`/`mixed`), dan `transportMode` mencerminkan hasil confirm yang dipersisten. Endpoint read itinerary mengembalikan data DB (tidak memanggil OSRM).
- `status` itinerary bisa `"final"` (alias legacy didukung).
- `changeType` contoh: `"confirm"`, `"restore"` (dan nilai lain yang relevan di masa depan).

## 9. versi & restore itinerary

### daftar versi

```http
GET /api/v1/itineraries/:id/versions?userId=dev-user-1
```

Balasan `200`:

```json
{
  "data": [
    {
      "version": 1,
      "basedOnVersion": null,
      "changeType": "confirm",
      "changeInstruction": null,
      "status": "confirmed",
      "totalDistanceM": null,
      "totalDurationMin": null,
      "totalEstimatedMin": null,
      "createdAt": "...",
      "stopCount": 8,
      "routeCount": 7
    }
  ]
}
```

### ambil snapshot versi tertentu

```http
GET /api/v1/itineraries/:id/versions/:version?userId=dev-user-1
```

Mengembalikan snapshot lengkap versi tersebut (`stops` + `routes`).

### pulihkan versi lama (restore)

```http
POST /api/v1/itineraries/:id/restore/:version
Content-Type: application/json

{ "userId": "dev-user-1", "expectedVersion": 3 }
```

- Membuat **versi baru** berbasis versi target (`basedOnVersion` = target, `changeType: "restore"`). Versi bersifat immutable.
- `expectedVersion` opsional untuk optimistic concurrency.
- Jika versi aktif berubah, balasan `409` dengan code `VERSION_CONFLICT` — FE disarankan reload itinerary saat ini lalu coba lagi.
- Balasan `200` mengembalikan `ItineraryDetail` terbaru (`currentVersion` sudah bertambah).

## 10. minta garis rute jalan (osrm proxy)

Gunakan proxy backend untuk **preview rute draft** (belum tersimpan). Itinerary terkonfirmasi dibaca dari DB (tidak memanggil OSRM):

```http
POST /api/v1/routes/driving
Content-Type: application/json

{
  "points": [
    { "latitude": -0.95, "longitude": 100.35 },
    { "latitude": -0.94, "longitude": 100.36 }
  ],
  "profile": "car"
}
```

- `points`: 2 sampai 50 titik. `profile`: `car` | `motorcycle` | `foot` (default `car`).
- Balasan `200`: `{ "data": { "source", "distanceKm", "durationMin", "estimated", "geometry", "error?" } }`

Arti `source`:

- `osrm` — geometri jalan asli (mengikuti profil bila tersedia)
- `cache` — hasil cache server
- `fallback` — OSRM gagal/timeout, geometri garis lurus antar titik; `durationMin` bisa `null`, ada `error`

Perhatian koordinat: input `{ latitude, longitude }`, tapi `geometry.coordinates` adalah `[longitude, latitude]`.

Catatan profil:
- `foot` memakai profil jalan kaki OSRM.
- `motorcycle` dipetakan ke rute driving dengan durasi estimasi (`estimated: true`); tampilkan sebagai estimasi di UI.

## 11. contoh fetch minimal

```ts
const BASE = "http://localhost:8989";
const userId = "dev-user-1";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
  return body;
}

// kirim pesan
const reply = await api(`/api/v1/chat/sessions/${sessionId}/messages`, {
  method: "POST",
  body: JSON.stringify({ userId, content: text }),
});
const draft = reply.data.draft;

// confirm lalu restore dari DB
if (draft) {
  await api("/api/v1/itineraries/confirm", {
    method: "POST",
    body: JSON.stringify({ draftId: draft.draftId, userId, sessionId }),
  });
  const detail = await api(`/api/v1/itineraries/by-session/${sessionId}?userId=${encodeURIComponent(userId)}`);
  // render detail.data.version.stops/routes
}

// keyset pagination pesan
let after = 0;
const page = await api(`/api/v1/chat/sessions/${sessionId}/messages?userId=${encodeURIComponent(userId)}&after_position=${after}&limit=20`);
after = page.meta.nextAfterPosition; // null jika habis
```

## 12. pola state yang disarankan

- Simpan `baseUrl`, `userId`, dan session aktif di `localStorage`.
- Riwayat pesan: pakai **keyset** (`after_position` + `meta.nextAfterPosition`); lakukan deduplikasi jika ada pesan optimistik lokal.
- Satu session pegang satu draft aktif. Draft baru menggantikan draft lama, tetapi pertahankan data itinerary terkonfirmasi agar daftar versi tetap tersedia sampai confirm/restore berikutnya.
- Setelah `confirm`, **fetch ulang via `by-session`** untuk snapshot DB (stops/routes persisten, versi aktif).
- `sessionStorage` hanya cache UI ringan; **DB adalah sumber kebenaran** untuk itinerary terkonfirmasi.
- Draft in-memory dari AI **tidak dipulihkan** setelah reload (belum ada endpoint publik "get draft"); itinerary terkonfirmasi dipulihkan via `by-session`.
- Batalkan request rute yang basi saat pindah tab cepat.

## 13. error yang bakal ditemui

Semua error bentuknya:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed" } }
```

Yang umum:

- `400 VALIDATION_ERROR` — body/query salah (mis. `content` kosong, `points` kurang dari 2, `userId` tidak dikirim)
- `401 AUTH_REQUIRED` — user tidak aktif/tidak ditemukan
- `403 FORBIDDEN` — resource bukan milik user
- `404 *_NOT_FOUND` — session/pesan/itinerary/versi tidak ketemu atau bukan milik user
- `409 VERSION_CONFLICT` — konflik saat restore (versi berubah di server)
- `422` — aturan bisnis tertentu (mis. `DESTINATION_UNAVAILABLE`, target regenerate tidak valid/konteks hilang)
- `503 AUTH_NOT_CONFIGURED` — di production, wajar untuk sekarang

Route `fallback` **bukan** error HTTP. Cek `data.source === "fallback"` atau `route.fallback === true`, tampilkan garis lurus dan pesan `error` jika ada.

## 14. batasan yang perlu diketahui fe

- Destinasi hanya kota Padang (filter backend).
- Draft belum permanen sampai `confirm`. Setelah reload, draft in-memory bisa hilang; itinerary terkonfirmasi tersedia via `by-session`.
- `stops.latitude/longitude` adalah string (Decimal) — parse ke number.
- `routes[].geometryJson.coordinates` berurutan `[longitude, latitude]`.
- Versi itinerary immutable; restore membuat versi baru (bukan mengubah versi lama). Relasi 1:1 session-itinerary.
- Read endpoint itinerary tidak memanggil OSRM; geometri/rute berasal dari snapshot DB.
- Estimasi motor (`~1.2x`) masih kasar.
