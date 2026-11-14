# Chatbot, routing, dan peta itinerary

Dokumen ini menjelaskan kode yang sudah jalan sekarang. Tujuannya supaya developer baru bisa mengikuti alur dari pesan user sampai peta tampil, tanpa harus menebak-nebak isi kode.

Cakupan: backend chat di `apps/api`, proxy routing OSRM di `apps/api/src/modules/routing`, dan client uji di `apps/app/public/chat-test.html`. Self-host OSRM belum dikerjakan.

## Alur chat sampai draft tersimpan

1. User membuka `apps/app/public/chat-test.html`, mengisi User ID dev, lalu membuat session baru.
2. Pesan dikirim ke `POST /api/v1/chat/sessions/:id/messages` dengan isi `userId` dan `content`.
3. `chat.service.ts` menyimpan pesan user, mengambil 20 riwayat terakhir, lalu menjalankan classifier untuk menentukan intent.
4. Kalau intent itinerary dan tanggal, jam, dan kategori lengkap, service memanggil tool model:
   `search_destinations` lalu `get_destination_details`. Tool ini membaca tabel `destinations` yang aktif di kota Padang.
5. Hasil tool dipakai `itinerary-generator.ts` untuk menyusun urutan kunjungan dan jam tiap titik. Rute bawaan dari generator ini garis lurus dari titik ke titik.
6. Draft disimpan di `draft-store.ts` dalam memori dengan TTL. Respons chat berisi `message`, `intent`, `draft`, `assistantMessageId`, dan `sessionId`.
7. User menekan Simpan di panel itinerary. Client memanggil `POST /api/v1/itineraries/confirm` dengan `draftId`, `userId`, dan `sessionId`. Penyimpanan pertama balas 201, pengulangan draft yang sama balas 200 tanpa data ganda.

File yang memegang alur ini:

- `apps/api/src/routes.ts`: merakit semua route `/api/v1`
- `apps/api/src/modules/chat/api/chat.ts`: definisi endpoint chat
- `apps/api/src/modules/chat/services/chat.service.ts`: orkestrasi pesan, intent, tool, draft
- `apps/api/src/modules/chat/services/classifier.ts`: aturan label dan panggilan model
- `apps/api/src/modules/chat/services/tools.ts`: validasi argumen tool dan batas kategori
- `apps/api/src/modules/chat/services/itinerary-generator.ts`: jadwal dan geometri garis lurus
- `apps/api/src/modules/chat/services/draft-store.ts`: TTL dan ganti draft per session
- `apps/api/src/modules/itinerary/api/itinerary.api.ts`: endpoint confirm dan ambil by id

## Endpoint routing jalan

Browser tidak lagi memanggil demo OSRM langsung. Client memanggil backend, backend yang memanggil OSRM.

Endpoint:

- `POST /api/v1/routes/driving`
- Body: `points` berisi 2 sampai 50 titik `latitude` dan `longitude`, plus `profile` yaitu `car` atau `motorcycle`. Kalau `profile` tidak diisi, dipakai `car`.
- Balasan: `data` berisi `source`, `distanceKm`, `durationMin`, `estimated`, `error` kalau ada, dan `geometry` LineString dengan koordinat `[longitude, latitude]`.

Contoh request:

```json
{
  "points": [
    { "latitude": -0.95, "longitude": 100.35 },
    { "latitude": -0.94, "longitude": 100.36 }
  ],
  "profile": "car"
}
```

Contoh balasan OSRM:

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

Nilai `source` punya tiga arti:

- `osrm`: geometri jalan dari OSRM
- `cache`: hasil yang sama diambil dari cache server
- `fallback`: OSRM gagal, client menerima garis lurus antar titik plus pesan error

File routing:

- `apps/api/src/modules/routing/api/routing.api.ts`: handler HTTP, validasi Zod saja
- `apps/api/src/modules/routing/schemas/routing.schema.ts`: kontrak request dan tipe hasil
- `apps/api/src/modules/routing/services/routing.service.ts`: kunci cache, panggil OSRM, retry sekali, fallback
- `apps/api/src/modules/routing/repositories/route-cache.repository.ts`: cache LRU dalam memori dengan TTL
- `apps/api/src/modules/routing/index.ts`: export modul
- `apps/api/src/routes.ts`: `apiV1.route("/routes", createRoutingApi(routingService))`
- `apps/api/src/env.ts`: `OSRM_BASE_URL`, `OSRM_TIMEOUT_MS`, `OSRM_CACHE_TTL_HOURS`
- `apps/api/.env.example`: contoh nilai untuk lokal

## Cara cache dan fallback bekerja

Tiap request dihitung kuncinya dari profile dan koordinat yang dibulatkan ke 5 desimal. Pembulatan ini membuat titik yang hampir sama tetap memakai cache yang sama.

Urutan di `getRoute`:

1. Hitung kunci, cek cache. Kalau ada dan belum kedaluwarsa, langsung kembalikan dengan `source: cache`.
2. Kalau tidak ada, panggil OSRM `route/v1/driving` dengan `overview=full` dan `geometries=geojson`.
3. Timeout default 8 detik. Untuk status 429 atau 5xx, service menunggu 400 ms lalu mencoba sekali lagi.
4. Kalau masih gagal, service mengembalikan garis lurus dengan `source: fallback` dan `durationMin: null`. Jarak fallback dihitung dengan Haversine, hanya untuk label di UI.

Untuk `profile: motorcycle`, geometri yang dipakai masih hasil routing mobil. Durasi dikali 1.2 dan `estimated: true`. Konstanta ini ada di `MOTORCYCLE_DURATION_FACTOR`. Ini batas yang disadari, sambil menunggu profil motor self-host.

## Tampilan peta di chat-test.html

Client uji ada di `apps/app/public/chat-test.html`. Ini file statis, tidak lewat build React. Aturannya tetap: jangan ubah `apps/app/src` untuk kebutuhan ini.

Yang tampil di panel kanan:

- Peta MapLibre GL JS setinggi 420px di desktop, 260px di layar kecil
- Basemap raster CARTO `light_all` dengan atribusi OpenStreetMap dan CARTO
- Badge sumber di kiri atas dan legenda di kiri bawah
- Kontrol navigasi, fullscreen, dan skala
- Marker bernomor 1, 2, 3 sesuai urutan kunjungan. Marker bisa diklik dan menunjukkan nama plus jam kunjungan
- Garis rute teal solid untuk hasil OSRM, garis orange putus-putus untuk fallback

Fungsi `loadRoute` di file itu sekarang:

1. Mengambil titik dari draft aktif
2. Mengecek `sessionStorage` dengan kunci hash waypoint. Kalau ada, peta langsung digambar tanpa request baru
3. Kalau tidak ada, POST ke `/api/v1/routes/driving` dengan profile `car`, menyimpan hasilnya ke `sessionStorage`, lalu menggambar peta
4. Request yang sudah basi dibatalkan lewat penanda `mapSeq` supaya tab yang cepat berpindah tidak menimpa peta yang benar

## Konfigurasi lokal

Variabel di `apps/api/.env`:

- `OSRM_BASE_URL`: default `https://router.project-osrm.org`. Nanti ganti ke URL self-host kalau sudah ada, misalnya `http://localhost:5000`
- `OSRM_TIMEOUT_MS`: default `8000`
- `OSRM_CACHE_TTL_HOURS`: default `24`

Client memakai `localStorage` untuk base URL, user id, dan session aktif, dan `sessionStorage` untuk draft plus hasil rute per session.

## Test yang menutup bagian ini

Backend:

- `apps/api/tests/unit/features/routing/routing.service.test.ts`: hasil OSRM lalu cache, faktor motor, 429 jadi fallback, pembulatan kunci, validasi schema
- `apps/api/tests/unit/features/routing/routing.api.test.ts`: endpoint 200 dan 400 untuk payload salah

Client:

- `apps/app/tests/chat-test.e2e.test.ts`: 14 test Vitest dengan Playwright. Mock route sekarang meniru `/api/v1/routes/driving`, bukan demo OSRM langsung. HTML-009 cek rute sukses, HTML-010 cek fallback

Perintah yang dipakai:

```sh
pnpm --filter api test:unit
pnpm --filter app test
pnpm check-types
pnpm build
```

Lint repo masih gagal di file sementara `apps/api/tmp/check-user.mjs`. File itu di luar perubahan ini.

## Batasan yang masih berlaku

- Data itinerary hanya Padang. Filter `city: Padang` masih ada di query tool dan repository chat.
- Demo OSRM untuk mobil. Profil demo tidak punya mode motor.
- Cache routing ada di memori proses. Restart server mengosongkan cache.
- Draft chat ada di memori proses dengan TTL, bukan di database.
- Endpoint users dan chat masih contoh dev dan mati di production sampai auth tersedia.
- Self-host OSRM ditunda. Kalau nanti dikerjakan, cakupan yang disepakati Sumbar saja, dua instance untuk mobil dan motor, dan `OSRM_BASE_URL` dipindah tanpa mengubah kontrak endpoint.
