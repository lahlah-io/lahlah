# Demo Chat AI — Trip Maker + Peta

Panduan demo lomba: skrip chat, segmen error, dan struktur pitch.

Semua perilaku di bawah ini diambil dari kode yang sudah jalan di `apps/api`, bukan rencana. Referensi: `docs/chatbot-routing-map.md`, `docs/chat-api-untuk-fe.md`.

---

## 1. Tesis demo

> "Chatbot lain menjawab pertanyaan. Punya kami mengedit trip yang hidup: setiap kalimat mengubah peta, jam, dan rute — dan bisa dibatalkan."

Jangan pitch "AI travel planner". Itu generik dan semua peserta punya. Yang dijual: **conversational editing + versioning + rute jalan nyata**.

Tiga hal yang membedakan dari peserta lain:

1. AI mengubah **state yang hidup** (peta, jam, geometri rute), bukan menghasilkan teks.
2. Semua perubahan **versioned dan reversible** — AI tidak destruktif.
3. Saat rute gagal, sistem **degrade, bukan mati** — dan itu ditunjukkan, bukan disembunyikan.

---

## 2. Skrip chat (siap diketik live)

| # | Yang diketik | Yang muncul | Kalimat pitch |
|---|---|---|---|
| 0 | `halo` | balasan natural, tanpa draft | "Chat biasa dulu — bukan form." |
| 1 | `aku mau jalan-jalan di Padang besok` | `missing_information`: menanyakan jam + kategori | "Perhatikan: dia **tidak mengarang** itinerary. Dia tanya satu hal yang kurang." |
| 2 | `besok sore, kategori pantai` | draft + peta + marker bernomor + garis rute + total km/menit | **Wow #1** — "Dari satu kalimat jadi trip yang bisa dijalankan." |
| 3 | `tambah 1 destinasi kuliner` | marker bertambah, urutan & jam bergeser, rute dihitung ulang | **Wow #2** — "Peta bukan gambar. Dia recompute." |
| 4 | `ganti destinasi ke-2 dengan yang lebih dekat pantai` | marker ke-2 diganti, geometri jalan berubah | **Wow #3** — "Edit dengan bahasa manusia, bukan drag-drop." |
| 5 | `hapus yang terakhir` | trip memendek, penomoran dirapikan ulang | "Sama seperti user asli: berubah pikiran." |
| 6 | `kembali ke versi 1` | trip kembali ke bentuk awal | **Wow #4** — "AI-nya tidak destruktif. Semua versi immutable." |
| 7 | klik **Simpan** | itinerary tersimpan di DB, `by-session` restore | "Ini bukan chat yang lupa. Tutup browser, buka lagi, trip masih ada." |

Beat 2–6 harus selesai **di bawah 60 detik total**. Kalau satu balasan lebih dari 8 detik, juri bosan. Lihat bagian 5.

Catatan pemicu (dari kode, `chat.service.ts`):

- Tanggal + jam + kategori = draft langsung.
- Kata waktu umum dikenali: `pagi` 08:00–11:00, `siang` 11:00–14:00, `sore` 15:00–18:00, `malam` 18:30–21:30.
- Tanggal dipahami dalam zona `Asia/Jakarta`.
- Jam belum disebut → backend memberi saran waktu, bukan draft.

---

## 3. Segmen error

Jangan sembunyikan error. Jadikan segmen bernama: **"Bagaimana kalau AI salah?"**

| Ketik | Perilaku backend sekarang | Kalimat pitch |
|---|---|---|
| `ganti destinasi ke-7 jadi pantai` (padahal cuma 4) | `MODIFY_TARGET_NOT_FOUND` → balasan menyebut daftar destinasi aktif + contoh perintah | "Dia tidak crash, dia **mengoreksi dengan sopan** dan memberi jalan keluar." |
| `hapus destinasi Pantai` (2 kandidat cocok) | `MODIFY_TARGET_AMBIGUOUS` → "Ada beberapa yang cocok: … sebutkan nomornya" | "Ambiguitas tidak ditebak. Ditanya." |
| Matikan wifi / stop OSRM, lalu ubah trip | `source: fallback` → garis **oranye putus-putus** + label estimasi garis lurus | **Wow #5** — "Rute gagal? Trip tetap bisa disimpan. Kami **degrade, bukan mati**." |
| `buat trip ke Bali` | filter kota → jawaban jujur di luar cakupan | "Kami pilih dalam daripada lebar: Padang, 100% akurat." |

Aturan: **selalu tunjukkan satu kegagalan yang sengaja dipicu**, lalu satu yang tidak (matikan wifi). Juri menilai kejujuran lebih tinggi daripada demo mulus palsu.

---

## 4. Panel "proses" (satu-satunya UI baru yang wajib)

Backend sudah mengembalikan `intent` dan menyimpan `toolCallsJson` per pesan. Tampilkan strip kecil di bawah bubble assistant:

```
memahami → cari destinasi (12 kandidat) → susun jadwal → hitung rute (4 leg, OSRM)
```

Alasannya bukan teknis: juri harus **melihat AI berpikir**. Ini yang membuat latency 8 detik terasa seperti fitur, bukan lag. Biaya: satu komponen, datanya sudah ada.

---

## 5. Checklist pra-demo

Yang bisa membunuh pitch:

1. **`NODE_ENV` jangan `production`** — chat ditutup dengan `503 AUTH_NOT_CONFIGURED` di production. Demo = dev.
2. **Jangan restart API di tengah demo** — draft ada di memori proses, hilang saat restart.
3. **Panaskan cache rute**: jalankan skrip demo sekali sebelum naik panggung. OSRM publik bisa 429; cache membuat beat 3–6 instan.
4. **Siapkan sesi bersih** (`dev-user-demo`) dan data Padang ter-seed.
5. **Rekaman cadangan 90 detik** untuk beat 2–7. Kalau wifi panggung mati, putar rekaman, lanjut beat error live.
6. **Peta 420px cukup.** Jangan fullscreen — juri harus melihat chat dan peta bersamaan.

---

## 6. Struktur pitch 7 menit

| Waktu | Isi |
|---|---|
| 0:00–0:45 | Masalah: merencanakan trip = 6 tab, 2 jam, hasilnya dokumen mati |
| 0:45–1:15 | Tesis (bagian 1) + "semua yang kalian lihat hari ini sudah jalan, bukan mockup" |
| 1:15–4:15 | Demo live beat 0–7 |
| 4:15–5:15 | Segmen error (bagian 3) |
| 5:15–6:15 | Arsitektur satu slide: classifier → tool → generator → OSRM → versi immutable. Tekankan `fallback` dan cache |
| 6:15–7:00 | Penutup: Padang dulu, kontrak API sudah multi-kota; share link + multi-hari sebagai next |

---

## 7. Yang perlu dibangun sebelum demo

Urut prioritas:

1. `apps/app/src/pages/chat.tsx` — chat + panel peta (MapLibre) + panel itinerary. Logika referensi sudah lengkap di `apps/app/public/chat-test.html`; pindahkan ke React di `feat/chat/`.
2. Strip "proses" (bagian 4).
3. Tombol **Simpan** + restore `by-session` saat reload.
4. Opsional: tombol share. Kolom `isPublic`/`shareSlug` sudah ada di DB, endpoint belum. Finale bagus, tapi bukan wajib.

---

## 8. Risiko yang harus disadari

- Latency LLM 5–15 detik per balasan. Tanpa pre-warm cache dan rekaman cadangan, beat 3–6 terasa lambat di panggung.
- Draft hanya di memori. Reload halaman sebelum Simpan = draft hilang.
- Data destinasi hanya Padang. Cerita bisnis multi-kota harus disampaikan sebagai kontrak API, bukan demo.
- Estimasi motor masih kasar (`~1.2x` durasi mobil). Jangan tampilkan sebagai angka presisi.

---

## 9. Yang sengaja tidak dikerjakan

Dilewati karena tidak diminta dan menambah risiko demo: share link publik, itinerary multi-hari, multi-kota live, self-host OSRM.
