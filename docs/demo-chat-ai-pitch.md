# Demo Chat AI — Trip Maker + Peta

Panduan demo lomba: skrip chat, segmen error, dan struktur pitch.

Semua perilaku di bawah diambil dari kode yang jalan sekarang (`apps/api`). Referensi: `docs/chatbot-routing-map.md`, `docs/chat-api-untuk-fe.md`, OpenAPI di `GET /openapi.json`.

> Catatan: `docs/chat-api-untuk-fe.md` dan `docs/chat-itinerary-persistence.md` masih menyebut `POST /itineraries/confirm`. Endpoint itu **sudah tidak ada**. Versi trip sekarang tersimpan otomatis setiap kali chat menghasilkan atau mengubah trip.

---

## 1. Tesis demo

> "Chatbot lain menjawab pertanyaan. Punya kami mengedit trip yang hidup: setiap kalimat mengubah peta, jam, jarak, dan biaya — dan bisa dibatalkan."

Jangan pitch "AI travel planner". Itu generik dan semua peserta punya. Yang dijual: **conversational editing + versioning + jarak jalan nyata + estimasi biaya**.

Empat pembeda:

1. AI mengubah **state yang hidup** (peta, jam, geometri rute, jarak meter), bukan menghasilkan teks.
2. Semua perubahan **versioned dan reversible** — versi immutable, restore membuat versi baru.
3. Setiap stop punya **jarak jalan meter** dari stop sebelumnya, plus total per versi — bukan garis lurus.
4. **Wilayah + biaya** ikut jadi filter dan jawaban: 11 kecamatan, estimasi biaya per destinasi.

---

## 2. Aset data yang bisa dipamerkan (angka nyata)

Dari `apps/api/prisma/seed-data/destinations.padang.primary.json`, sudah ter-seed ke DB:

| Aset | Jumlah | Sumber di API |
|---|---|---|
| Destinasi aktif Kota Padang | 451 | `GET /api/v1/destinations` |
| Foto (`imageUrl`) | 450 | field `imageUrl` |
| Estimasi biaya (`details.estimatedCost`) | 451 | `currency`, `min`, `max`, `kind`, `unit`, `basis`, `confidence` |
| Punya kecamatan (`district`) | 449 (2 alamat tidak menyebut kecamatan) | field `district` |
| Kecamatan | 11 | `GET /api/v1/destinations/districts` |
| Kategori | 8 | `kuliner` 188, `alam` 94, `santai` 93, `keluarga` 87, `belanja` 72, `budaya` 51, `pantai` 41, `sejarah` 26 |

Sebaran wilayah terbesar: **Padang Barat 133**, Padang Utara 59, Padang Selatan 55, Kuranji 51, Padang Timur 49, Koto Tangah 42, Pauh 16, Bungus Teluk Kabung 13, Lubuk Kilangan 11, Lubuk Begalung 11, Nanggalo 9.

Jenis biaya: `konsumsi` 174, `tiket` 132, `gratis` 92, `parkir` 53.

Contoh nilai biaya nyata: `{"currency":"IDR","min":20000,"max":50000,"kind":"konsumsi","unit":"per orang","note":"estimasi minum + camilan","basis":"kedai kopi","confidence":"estimasi"}`.

Batas yang harus kamu tahu sebelum menjanjikan apa pun di panggung:

- **Biaya per destinasi, bukan total trip.** Backend tidak menjumlahkan biaya seluruh trip. Jangan tampilkan "total biaya trip" sebagai fitur.
- **Foto tidak dikirim lewat tool chat.** Tool chat hanya mengembalikan `details` (berisi biaya) dan `district`. Foto diambil dari `GET /destinations`; UI harus join sendiri pakai `destinationId`.
- **Biaya tidak tersimpan per stop versi.** `trip_destinations.estimated_cost` ada di skema, tapi alur chat belum mengisinya. Sumber biaya = `destination.details.estimatedCost`.

---

## 3. Skrip chat (siap diketik live)

| # | Yang diketik | Yang muncul | Kalimat pitch |
|---|---|---|---|
| 0 | `halo` | balasan natural, tanpa versi trip | "Chat biasa dulu — bukan form." |
| 1 | `aku mau jalan-jalan di Padang besok` | `missing_information`: menanyakan jam + kategori | "Perhatikan: dia **tidak mengarang** itinerary. Dia tanya satu hal yang kurang." |
| 2 | `besok sore, pantai, di Padang Barat` | versi 1: peta + marker bernomor + garis rute + **jarak per leg (meter)** + **total km** | **Wow #1** — "Dari satu kalimat jadi trip yang bisa dijalankan, plus jaraknya." |
| 3 | `tambah 1 destinasi kuliner` | versi 2: marker bertambah, jam bergeser, jarak tiap leg dan total dihitung ulang | **Wow #2** — "Peta bukan gambar. Dia recompute jarak jalan." |
| 4 | `ganti destinasi ke-2 dengan yang lebih dekat` | versi 3: marker ke-2 diganti, geometri dan total meter berubah | **Wow #3** — "Edit dengan bahasa manusia, bukan drag-drop." |
| 5 | `kembali ke versi 1` | versi 4: trip balik ke bentuk awal, total jarak balik | **Wow #4** — "AI-nya tidak destruktif. Versi immutable, restore bikin versi baru." |
| 6 | `kuliner murah di Padang Barat itu berapa?` | jawaban RAG menyebut wilayah + rentang Rp dari data, tanpa membuat versi baru | **Wow #5** — "Dia tidak menebak harga. Angkanya dari katalog: 174 tempat berkategori konsumsi." |
| 7 | reload halaman | `GET /itineraries/by-session/:sessionId` mengembalikan versi aktif + jarak | "Ini bukan chat yang lupa. Semua versi ada di DB." |

Beat 2–5 harus selesai **di bawah 60 detik**. Kalau satu balasan lebih dari 8 detik, juri bosan. Lihat bagian 5.

Detail pemicu (dari kode):

- Tanggal + jam + kategori = versi langsung. Kata waktu: `pagi` 06:00–10:59, `siang` 11:00–14:59, `sore` 15:00–17:59, `malam` 18:00–23:59, `dini hari` 00:00–05:59.
- Tanggal dipahami dalam zona `Asia/Jakarta`.
- Wilayah dikenali dari nama bebas: `padang barat`, `barat`, `Kec. Padang Bar.`, atau nama kelurahan (`Purus`, `Air Manis`, `Lubuk Buaya`).
- Kategori wajib. Tanpa kategori, backend bertanya, bukan menebak.
- Satu chat = satu trip. Minta trip berbeda → arahkan buat chat baru.

---

## 4. Segmen error

Jangan sembunyikan error. Jadikan segmen bernama: **"Bagaimana kalau AI salah?"**

| Ketik / lakukan | Perilaku backend sekarang | Kalimat pitch |
|---|---|---|
| `ganti destinasi ke-7 jadi pantai` (padahal cuma 4) | `MODIFY_TARGET_NOT_FOUND` → balasan menyebut daftar destinasi aktif + contoh perintah | "Dia tidak crash, dia **mengoreksi dengan sopan** dan memberi jalan keluar." |
| `hapus destinasi Pantai` (2 kandidat cocok) | `MODIFY_TARGET_AMBIGUOUS` → "Ada beberapa yang cocok: … sebutkan nomornya" | "Ambiguitas tidak ditebak. Ditanya." |
| Matikan wifi / stop OSRM, lalu ubah trip | rute `source: fallback`, **`distance`/`totalDistanceM` jadi `null`** — bukan 0, bukan jarak palsu | **Wow #6** — "Kalau rute gagal, kami **tidak mengarang jarak**. Null, dan UI bilang belum tersedia." |
| `trip ke Bali` / pertanyaan coding | `OFF_TOPIC_REPLY` + tawaran contoh prompt | "Kami pilih dalam daripada lebar: Padang, 451 destinasi, 100% akurat." |
| `besok sore pantai di Nanggalo` (wilayah sempit) | filter wilayah kosong → tool mencari ulang tanpa wilayah | "Dia tidak bilang kosong lalu berhenti. Dia melonggarkan wilayah, bukan mengarang tempat." |

Aturan: **selalu tunjukkan satu kegagalan yang sengaja dipicu**, lalu satu yang tidak (matikan wifi). Juri menilai kejujuran lebih tinggi daripada demo mulus palsu.

Perhatikan: kalau OSRM gagal, jarak jadi `null`. Pastikan UI menampilkan "jarak belum tersedia", bukan `0 m` atau `NaN`. Ini detail kecil yang dilihat juri teknis.

---

## 5. Panel yang wajib ada di UI demo

Bukan fitur baru di backend — backend sudah mengirim datanya. Yang dibangun cuma tampilan:

1. **Strip proses** di bawah bubble assistant: `memahami → cari destinasi (12 kandidat) → susun jadwal → hitung rute (4 leg)`. Sumber: `intent` di respons, `toolCallsJson` di pesan. Juri harus **melihat AI berpikir**; ini yang membuat latency 8 detik terasa fitur.
2. **Jarak per leg**: `distance`/`distanceKm` di setiap stop. Tampilkan "1.2 km · 4 mnt" di antara marker.
3. **Total jarak**: `totalDistanceM` (meter, angka utama) + `totalDistanceKm` (satu desimal, cermin).
4. **Chip wilayah** per stop: `category` ada di stop, `district` ambil dari `/destinations`.
5. **Chip biaya** per stop: `Rp20.000–50.000/orang` dari `details.estimatedCost`. Jenis `gratis` tampil "Gratis".
6. **Thumbnail foto** dari `imageUrl` (`/destinations`), fallback ke kotak warna kalau null.
7. **Timeline versi**: `v1 → v2 → v3 → v4` + tombol restore. Versi immutable, restore membuat versi baru.
8. **Tidak ada tombol Simpan.** Versi sudah tersimpan saat chat membalas. Kalau kamu menaruh tombol "Simpan", juri akan bertanya endpoint mana yang dipanggil — dan tidak ada.

---

## 6. Checklist pra-demo

Yang bisa membunuh pitch:

1. **`NODE_ENV` jangan `production`** — chat dan itinerary ditutup `503 AUTH_NOT_CONFIGURED`. Demo = dev.
2. **Jangan restart API di tengah demo** — aman untuk versi (sudah di DB), tapi riwayat sesi in-flight bisa membingungkan.
3. **Panaskan cache rute**: jalankan skrip demo sekali sebelum naik panggung. Setiap versi memanggil OSRM per leg; cache membuat beat 2–5 instan. OSRM publik bisa 429.
4. **Verifikasi data sebelum tampil**: `pnpm --filter api exec tsx tests/smoke/district-cost.smoke.ts`. Skrip ini membuktikan 11 kecamatan, biaya lengkap 451 destinasi, filter wilayah konsisten, dan jarak OSRM nyata — sekaligus bukti "bukan mockup" kalau juri bertanya.
5. **Siapkan sesi bersih** (`dev-user-demo`) + data Padang ter-seed.
6. **Rekaman cadangan 90 detik** untuk beat 2–7. Kalau wifi panggung mati, putar rekaman, lanjut segmen error live — justru kredibel.
7. **Peta 420px cukup.** Jangan fullscreen — juri harus melihat chat, peta, dan panel jarak bersamaan.

---

## 7. Struktur pitch 7 menit

| Waktu | Isi |
|---|---|
| 0:00–0:45 | Masalah: merencanakan trip = 6 tab, 2 jam, hasilnya dokumen mati tanpa jarak dan biaya |
| 0:45–1:15 | Tesis (bagian 1) + "semua yang kalian lihat hari ini jalan, bukan mockup" |
| 1:15–4:15 | Demo live beat 0–7 |
| 4:15–5:15 | Segmen error (bagian 4) |
| 5:15–6:15 | Arsitektur satu slide: classifier → RAG + tool (kategori, wilayah) → generator → OSRM per leg → versi immutable di DB. Tekankan `fallback = null`, bukan jarak palsu |
| 6:15–7:00 | Penutup: Padang dulu — 451 destinasi, 11 kecamatan, 451 estimasi biaya, 450 foto. Kontrak API sudah multi-kota; share link + multi-hari sebagai next |

---

## 8. Yang perlu dibangun sebelum demo

Urut prioritas:

1. `apps/app/src/pages/chat.tsx` — chat + peta MapLibre + panel itinerary. Logika referensi ada di `apps/app/public/chat-test.html`; pindahkan ke React di `feat/chat/`.
2. Panel jarak: per-leg + total (`totalDistanceM`), dengan state "belum tersedia" saat `null`.
3. Chip biaya + wilayah + thumbnail foto (join `destinationId` ke `/destinations`).
4. Timeline versi + restore (`GET /itineraries/:id/versions`, `POST /itineraries/:id/restore/:version`).
5. Strip proses (bagian 5).

Tidak perlu dibangun: tombol Simpan/confirm — endpointnya tidak ada.

---

## 9. Risiko yang harus disadari

- Latency LLM 5–15 detik per balasan, **ditambah** panggilan OSRM per leg saat versi disimpan. Tanpa pre-warm cache dan rekaman cadangan, beat 2–5 terasa lambat.
- Biaya tidak dijumlahkan backend. Menampilkan total biaya trip = fitur yang belum ada; jangan diklaim.
- Foto tidak ada di payload chat. UI harus fetch `/destinations` sendiri; kalau juri tanya "kok chat tidak kirim foto", jawabnya: chat mengirim id, UI yang render.
- 2 destinasi tanpa kecamatan, 1 tanpa foto. Jangan pakai dua baris itu di jalur demo.
- Estimasi motor masih `~1.2x` durasi mobil. Jangan tampilkan sebagai angka presisi.
- `docs/chat-api-untuk-fe.md` masih menyebut `confirm`. Kalau FE dev lain mengikuti dokumen itu, mereka akan memanggil endpoint yang tidak ada.

---

## 10. Yang sengaja tidak dikerjakan

Dilewati karena tidak diminta dan menambah risiko demo: total biaya trip, share link publik, itinerary multi-hari, multi-kota live, self-host OSRM, endpoint checkpoint foto (`DestinationCheckpoint` ada di skema, belum ada API).
