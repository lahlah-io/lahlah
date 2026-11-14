# Benchmark retrieval RAG destinasi Padang

Catatan hasil pengukuran retrieval Padang beserta keputusan yang diambil. Harness
benchmark bersifat sementara dan tidak disimpan di repo; langkah reproduksi ada di
bagian akhir.

## Tujuan

Menjawab satu pertanyaan: apakah menurunkan threshold embedding, menambah fallback
top-1, memakai scoping kategori, dan menyetel cache model benar-benar menaikkan
kualitas konteks yang dikirim ke LLM?

## Metode

- **Dataset**: 32 query berbahasa Indonesia — `real` 8 (dari pesan pengguna di DB),
  `category` 8, `name` 6, `paraphrase` 5, `typo` 3, `offtopic` 2. Empat query
  bertanda "harus kosong": dua off-topic (`off-01`, `off-02`) dan dua perintah
  (`real-05` "hapus destinasi ke 3", `real-08` "abaikan aturan ... Bali").
- **Knowledge base**: 239 destinasi Padang aktif dari
  `prisma/seed-data/destinations.padang.primary.json`, 239 chunk, build ±5,9 detik.
- **Model**: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (tidak diubah).
- **Metrik**: `hit@1`, `hit@3` (nama golden muncul di top-k), `empty_rate`,
  `wrong_cat` (kategori hasil teratas tidak beririsan dengan kategori golden),
  `avg_ctx_chars`, dan waktu retrieval.

Varian yang diuji:

| Varian | Threshold | Fallback top-1 | Scoping kategori | Cache |
|---|---|---|---|---|
| A | 0.30 | tidak | tidak | tidak |
| B | 0.15 | tidak | tidak | tidak |
| C | 0.15 | ya | tidak | tidak |
| D | 0.15 | ya | tidak | ya |
| E | 0.15 | ya | ya (proksi kata kunci) | ya |

Huruf A–E hanya label urutan percobaan, bukan singkatan: **A** adalah kode yang
berjalan saat itu (baseline), **C** adalah port termurah dari proyek referensi
(threshold 0.15 + fallback top-1 tanpa floor), dan **E** adalah C ditambah scoping
kategori memakai proksi kata kunci.

## Detail pengujian

| Tahap | Yang dibandingkan | Jumlah pengukuran | Keluaran |
|---|---|---|---|
| 1 | A, B, C, D, E pada 32 query | 160 | tabel retrieval + `stage1.json` |
| 2 | A, C, E pada 16 query yang hasilnya berbeda | 48 penilaian | skor judge + `stage2.json` |
| 3 | kode implementasi pertama vs emulasi A | 64 | alasan revert + `stage3-after.json` |
| 4 | kode final vs emulasi A | 64 | skor akhir + `stage4-real.json` |

Cara hitung:

- `hit@k` = jumlah query valid yang nama golden-nya muncul di k hasil teratas,
  dibagi jumlah query valid (28; empat query "harus kosong" tidak dihitung).
- `wrong_cat` = proporsi query valid yang kategori destinasi teratasnya tidak
  beririsan dengan kategori golden (dibaca dari `categorySlugs` seed).
- `empty_rate` = query tanpa konteks dibagi 32; `empty_valid` = yang kosong
  padahal punya golden.
- Query off-topic dinilai dari apakah hasilnya kosong, bukan dari `hit@k`.
- Waktu retrieval diukur hanya untuk `findRelevantChunks`; embedding query diukur
  terpisah karena mendominasi (±10 ms).

Protokol penilaian LLM:

- Model `muse-spark-1.3-contributor`, satu penilaian per query per varian, tanpa
  pengulangan.
- Prompt memuat query, golden, dan daftar destinasi hasil retrieval beserta skor
  kemiripannya; rubrik 0 = salah/mengarang, 1 = sebagian, 2 = benar. Khusus query
  off-topic, 2 = kosong/tepat menolak, 0 = mengarang.
- Jawaban wajib JSON; maksimal 4 percobaan dengan backoff saat kena rate limit.
  Tahap 2 selesai 48/48 tanpa error.
- Pemanggilan memakai `fetch` langsung dengan header `x-opencode-session` karena
  `completeChat` tidak mengirim header tersebut.

Lingkungan: Windows, Node.js 24, model di cache lokal, KB 239 chunk dibangun
sekali per proses. Tidak ada akses jaringan saat retrieval.

Yang tidak diuji:

- Kualitas jawaban chat end-to-end (hanya retrieval dan konteks).
- Variasi antar-run (retrieval deterministik; judge hanya sekali jalan).
- Beban bersamaan, mesin lain, atau dataset di luar 32 query ini.
- Kode final tidak dinilai ulang oleh LLM; skor judge melekat pada varian A/C/E.


## Tahap 1 — retrieval (deterministik)

| Varian | hit@1 | hit@3 | empty_rate | wrong_cat | ctx chars | retrieval |
|---|---|---|---|---|---|---|
| A | 0.250 | 0.393 | 0.094 | 0.214 | 420 | <1 ms |
| B | 0.250 | 0.393 | 0.031 | 0.214 | 444 | <1 ms |
| C | 0.250 | 0.393 | 0.000 | 0.214 | 445 | <1 ms |
| D | 0.250 | 0.393 | 0.000 | 0.214 | 445 | <1 ms |
| E | 0.250 | **0.464** | 0.000 | **0.143** | 461 | <1 ms |

Temuan: threshold 0.15 tidak mengubah satu pun ranking dibanding 0.30. Distribusi
skor bersifat bimodal (jauh di atas 0.3 atau jauh di bawah 0.15), sehingga
perbedaan A/B/C/D hanya soal berapa query yang dikosongkan. Hanya scoping kategori
(E) yang menaikkan `hit@3` dan menurunkan `wrong_cat`.

## Tahap 2 — penilaian LLM

16 query yang hasilnya berbeda dinilai dengan model `muse-spark-1.3-contributor`
(0 = salah/mengarang, 1 = sebagian, 2 = benar): A **0,88**, E 0,75, C 0,63.

Yang membalikkan hasil: dua query off-topic. A mengembalikan konteks kosong
(nilai 2), sedangkan C/E mengarang destinasi (nilai 0). E unggul di `name-02`
(Batu Malin Kundang) dan dua parafrasa, tetapi kalah di `name-04` karena proksi
kata kunci salah membaca "alamat" sebagai kategori `alam`.

## Implementasi yang ditolak

Versi pertama yang dipasang memakai threshold 0.15, scoping `extractCategories`,
fallback top-1 dengan floor 0.1, dan cache wiring. Hasil pengukuran ulang pada
kode nyata:

| Metrik | A | versi 0.15 + floor 0.1 |
|---|---|---|
| hit@3 | 0.393 | **0.357** |
| wrong_cat | 0.214 | 0.214 |
| off-topic kosong | 2/4 | **0/4** |
| query valid kosong | 1/28 | 0/28 |
| ctx chars | 420 | 459 |

Dua sebab kegagalan:

1. Skor off-topic sebenarnya 0.1081 (`off-01`) dan 0.1537 (`off-02`) — keduanya di
   atas floor 0.1, jadi fallback tetap mengarang.
2. Scoping `extractCategories` membaca "alam" di dalam "alamat", sehingga
   `name-04` kehilangan kandidat yang benar.

Tidak ada nilai floor yang menyelamatkan: `off-02` 0.1537 dan `real-04` ("saya
tidak suka ke museum") 0.2875. Floor di antaranya mengembalikan museum untuk query
yang menolak museum; floor di atas 0.2875 membuat fallback tidak pernah menyala.

## Implementasi final

Threshold tetap **0.30** (0.15 meloloskan `off-02`), ditambah scoping kategori dan
fallback top-1 dengan floor **0.20**, plus pengecualian kategori yang ditolak
pengguna.

| Metrik | A (sebelum) | final (sesudah) |
|---|---|---|
| hit@1 | 0.250 | 0.250 |
| hit@3 | 0.393 | 0.393 |
| wrong_cat | 0.214 | **0.179** |
| query valid kosong | 1/28 | 0/28 |
| off-topic kosong (`off-01`, `off-02`) | 2/2 | **2/2** |
| ctx chars | 420 | 441 |
| retrieval per query | <1 ms | <1 ms |

Waktu total per query ±10 ms pada pengukuran terakhir, tetapi itu didominasi
embedding query; fungsi retrieval sendiri tetap di bawah 1 ms. Biaya token naik
±5% karena konteks bertambah 21 karakter.

Penanganan penolakan pengguna ("saya tidak suka museum", "jangan pantai"):

- Dibaca per klausa, jadi `"jangan pantai, saya mau kuliner"` hanya menolak pantai.
- Tanpa preferensi pengganti, asisten bertanya lebih dulu dan tidak mengubah
  itinerary maupun memilih kategori lain sendiri.
- Kategori yang ditolak disingkirkan dari kandidat retrieval, termasuk dari jalur
  fallback.

## Batasan

- Golden answer disusun sebagai draf, belum divalidasi satu per satu. Empat query
  (`real-04`, `real-06`, `cat-04`, `name-06`) mendapat nilai 0 pada semua varian,
  kemungkinan karena golden-nya terlalu ketat.
- Dataset hanya 32 query; query nyata di DB didominasi perintah itinerary sehingga
  sulit membedakan varian.
- Penolakan nama destinasi spesifik masih terbaca sebagai penolakan kategorinya
  (`"tidak suka Pantai Air Manis"` = tolak seluruh kategori pantai).
- Pengungkit yang paling menjanjikan belum dikerjakan: banyak destinasi memiliki
  `description: null`, sehingga chunk miskin kata dan query kategori/parafrasa
  tidak punya jangkar teks. Memperkaya chunk kemungkinan menaikkan semua varian.

## Reproduksi

1. Siapkan dataset 32 query (JSON: `id`, `group`, `text`, `gold`, `expectEmpty`)
   dan KB dari seed primary (239 destinasi).
2. Buat skrip sementara di dalam `apps/api/` agar `@huggingface/transformers`
   resolve, lalu bangun KB dengan `buildDestinationChunk` + `embedBatch` dan
   ukur tiap query dengan `findRelevantChunks` / `retrieveRelevantChunks`.
3. Jalankan dengan `pnpm --filter api exec tsx <skrip>.mts`, lalu hapus skrip
   setelah selesai.
