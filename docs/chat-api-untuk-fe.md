# Panduan API chat untuk FE dev

Buat kamu yang bangun UI chat itinerary di frontend. Semua contoh di sini diambil dari kode yang sudah jalan, bukan rencana.

## Gambaran cepat

Alur normalnya begini:

1. FE bikin session baru untuk satu `userId`
2. FE kirim pesan user ke session itu
3. Backend balas teks plus `draft` kalau request itinerary-nya lengkap
4. FE tampilkan draft di panel itinerary
5. User tekan simpan, FE panggil confirm
6. FE ambil garis rute jalan dari endpoint routing, lalu gambar peta

Base URL lokal default `http://localhost:8787`. Semua path di bawah prefix `/api/v1`.

Catatan penting: tiap request chat wajib bawa `userId`. Backend mengecek user-nya aktif dan session-nya milik user itu. Di production (`NODE_ENV=production`) endpoint chat dan users mati dengan `503 AUTH_NOT_CONFIGURED` sampai auth dipasang. Jadi panduan ini untuk dev/staging.

Referensi implementasi yang bisa dibuka: `apps/app/public/chat-test.html`. Fungsi `request()`, `refreshSessions()`, `sendMessage()`, `confirmDraft()`, dan `loadRoute()` di file itu sudah mempraktikkan semua pola di bawah.

## 1. Bikin session

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
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

`title` opsional. Kalau kosong, backend isi `"New chat"`. Satu user boleh punya banyak session, FE tampilkan sebagai tab.

## 2. Daftar session

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

## 3. Ambil riwayat pesan

```http
GET /api/v1/chat/sessions/:id/messages?userId=dev-user-1&page=1&limit=50
```

Balasan:

```json
{
  "data": [
    {
      "id": "msg-uuid",
      "sessionId": "session-uuid",
      "modelId": "model-uuid",
      "role": "user",
      "content": "besok jalan-jalan pantai dari jam 9 sampai 3 sore",
      "metadata": {},
      "createdAt": "..."
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "Siap, ini draft itinerary-nya...",
      "metadata": { "intent": "generate_itinerary", "draftId": "draft-uuid" }
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 12 }
}
```

Urut paling lama dulu, jadi bisa langsung render atas ke bawah. `role` isinya `user`, `assistant`, atau `system`.

## 4. Kirim pesan

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
- `missing_information` — tanggal, jam, atau kategori belum lengkap; `draft` null dan `message` menyebut apa yang kurang

Contoh pesan yang memicu draft: tanggal + jam mulai-selesai + kategori, misalnya `"besok wisata pantai dari jam 09:00 sampai 15:00"`. Tanggal dipahami dalam zona `Asia/Jakarta`. Kalau jam tidak disebut, backend balas saran waktu umum dulu, bukan draft.

`metadata` di pesan assistant menyimpan `intent` dan `draftId`, berguna kalau FE mau lanjutkan tanpa simpan state sendiri.

## 5. Simpan itinerary (confirm)

```http
POST /api/v1/itineraries/confirm
Content-Type: application/json

{ "draftId": "draft-uuid", "userId": "dev-user-1", "sessionId": "session-uuid" }
```

Penyimpanan pertama balas `201`, pengulangan draft yang sama balas `200` tanpa bikin data ganda. Keduanya bentuknya `{ "data": { ... } }`.

Ambil hasilnya:

```http
GET /api/v1/itineraries/:id?userId=dev-user-1
```

Balasan `{ "data": { ... } }`, hanya bisa dibuka pemiliknya.

## 6. Minta garis rute jalan

Jangan panggil demo OSRM dari browser. Pakai proxy backend:

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

Syarat: `points` 2 sampai 50 titik. `profile` boleh `car` atau `motorcycle`, default `car`. Balasan:

```json
{
  "data": {
    "source": "osrm",
    "distanceKm": 8.4,
    "durationMin": 16,
    "estimated": false,
    "geometry": { "type": "LineString", "coordinates": [[100.35, -0.95], [100.36, -0.94]] }
  }
}
```

Arti `source`:

- `osrm` — geometri jalan asli
- `cache` — hasil sama dari cache server
- `fallback` — OSRM gagal, geometri garis lurus antar titik, `durationMin` null, ada field `error`

Perhatian koordinat: input pakai `{ latitude, longitude }`, tapi `geometry.coordinates` urutannya `[longitude, latitude]`. MapLibre sudah pakai urutan itu, jadi teruskan apa adanya.

Untuk `profile: motorcycle`, geometri masih hasil routing mobil dengan `durationMin` dikali 1.2 dan `estimated: true`. Tampilkan label estimasi di UI, jangan tulis sebagai waktu pasti.

## Contoh fetch minimal

```ts
const BASE = "http://localhost:8787";
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
const draft = reply.data.draft; // null kalau info kurang

// simpan kalau user setuju
if (draft) {
  await api("/api/v1/itineraries/confirm", {
    method: "POST",
    body: JSON.stringify({ draftId: draft.draftId, userId, sessionId }),
  });
}

// garis rute untuk peta
const route = await api("/api/v1/routes/driving", {
  method: "POST",
  body: JSON.stringify({
    points: draft.destinations.map((d) => ({ latitude: d.latitude, longitude: d.longitude })),
    profile: "car",
  }),
});
```

## Pola state yang disarankan

- Simpan `baseUrl`, `userId`, dan session aktif di `localStorage`
- Simpan draft dan hasil rute per session di `sessionStorage` dengan kunci gabungan user + session, supaya pindah tab tidak fetch ulang
- Satu session pegang satu draft aktif. Draft baru dari backend menggantikan draft lama
- Draft dan cache rute di server ada di memori dan ada TTL-nya. Restart API mengosongkan keduanya, jadi FE harus siap fetch ulang kalau confirm balas draft kedaluwarsa
- Batalkan request rute yang basi kalau user cepat pindah tab, supaya peta tidak ketimpa data lama

## Error yang bakal ditemui

Semua error bentuknya:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed" } }
```

Yang umum:

- `400 VALIDATION_ERROR` — body atau query salah, misalnya `content` kosong, `points` cuma 1 titik, atau `userId` tidak dikirim
- `404` — session, pesan, atau itinerary tidak ketemu atau bukan milik user
- `503 AUTH_NOT_CONFIGURED` — kepanggil di production, wajar untuk sekarang
- Route `fallback` bukan error HTTP. Cek `data.source === "fallback"` lalu tampilkan garis putus-putus plus pesan dari `data.error`

## Batasan yang perlu diketahui FE

- Destinasi hanya kota Padang. Filter ini masih keras di backend
- Draft belum permanen sampai confirm dipanggil
- Hasil confirm tidak membawa nama dan koordinat selengkap draft. Kalau peta butuh marker, pakai draft yang masih disimpan di client
- Angka motor (`1.2x`) masih estimasi kasar
