# Performa RAG yang berjalan saat ini

Ringkasan kondisi retrieval Padang setelah perubahan terakhir: konfigurasi,
skor, kekuatan, kelemahan, dan hasil penilaian LLM. Riwayat perbandingan varian
ada di [Benchmark retrieval RAG destinasi Padang](rag-retrieval-benchmark.md).

## Pipeline

1. Pesan masuk disaring `isClearlyOffTopic` (kode, politik, cuaca kota lain);
   pesan yang ditolak tidak pernah menyentuh retrieval.
2. Kategori yang diminta dibaca `extractCategories`, penolakan pengguna dibaca
   `detectRejectedCategories`.
3. Konteks RAG dibangun `makeRagContextProvider` → `retrieveRelevantChunks`:
   embed query, saring kandidat yang kategorinya ditolak, scope ke kategori yang
   diminta, urutkan cosine similarity, ambil top-3 di atas threshold, dan bila
   kosong ambil satu kandidat terbaik hanya jika skornya di atas floor.
4. Hasil dikirim ke LLM sebagai `system` message berisi daftar destinasi
   (`name` + `text`), hanya di alur itinerary tool flow.

Fungsi retrieval hanya dipanggil pada alur yang membutuhkan rekomendasi
destinasi. Chat umum dijawab tanpa RAG.

## Konfigurasi aktif

| Variabel | Nilai | Catatan |
|---|---|---|
| `EMBEDDING_MODEL` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | sama dengan referensi |
| `EMBEDDING_TOP_K` | 3 | konteks ±441 karakter |
| `EMBEDDING_SIMILARITY_THRESHOLD` | 0.30 | 0.15 meloloskan query off-topic |
| `EMBEDDING_FALLBACK_MIN_SIMILARITY` | 0.20 | fallback top-1 hanya di atas floor ini |
| `TRANSFORMERS_CACHE` | opsional | bila diisi, model tidak diunduh ulang saat cold start |

Scoping kategori dan pengecualian kategori yang ditolak berjalan di dalam
retrieval; keduanya tidak menambah panggilan model.

## Metrik yang dipakai

| Metrik | Definisi |
|---|---|
| `hit@1` | nama golden muncul sebagai hasil teratas |
| `hit@3` | nama golden muncul di tiga hasil teratas |
| `wrong_cat` | kategori hasil teratas tidak beririsan dengan kategori golden |
| `empty_rate` | proporsi query yang tidak menghasilkan konteks |
| `empty_valid` | query valid yang justru kosong (harus 0) |
| `ctx_chars` | panjang teks konteks yang dikirim ke LLM |
| retrieval | waktu `findRelevantChunks` per query, tanpa embedding |
| skor judge | 0 = salah/mengarang, 1 = sebagian, 2 = benar |

## Skor saat ini

Basis: 32 query, 239 destinasi Padang, hasil pengukuran terakhir pada kode yang
berjalan sekarang.

| Metrik | Nilai |
|---|---|
| `hit@1` | 0.250 (7/28 query valid) |
| `hit@3` | 0.393 (11/28) |
| `wrong_cat` | 0.179 (5/28) |
| query valid kosong | 0/28 |
| off-topic kosong | 2/2 (`off-01`, `off-02`) |
| `ctx_chars` | 441 karakter rata-rata |
| retrieval per query | <1 ms |
| embedding per query | ±10 ms (dominan) |
| build KB 239 chunk | ±5,9 detik, sekali per proses |

Per grup query (hit@3):

| Grup | n | hit@3 | Catatan |
|---|---|---|---|
| `name` | 6 | 4 (0.67) | nama tempat spesifik paling andal |
| `typo` | 3 | 2 (0.67) | embedding tahan salah ketik ringan |
| `real` | 6 | 2 (0.33) | query nyata didominasi perintah itinerary |
| `category` | 8 | 2 (0.25) | titik terlemah bersama parafrasa |
| `paraphrase` | 5 | 1 (0.20) | tidak ada sinonim di chunk |

## Kekuatan

- **Nama tempat spesifik**: 4/6 benar di top-3, termasuk nama yang salah ketik
  (`Jembatan Sitti/Siti/Siti Burbaya` semuanya tertangkap).
- **Tahan salah ketik**: 2/3 query typo benar tanpa normalisasi khusus.
- **Kosong saat ragu**: dua query off-topic tetap kosong, dan pesan yang jelas
  off-topic sudah ditolak sebelum retrieval. Tidak ada konteks karangan.
- **Penolakan per destinasi spesifik**: jika pengguna menolak tempat tertentu
  (misal "tidak suka Pantai Air Manis"), hanya tempat tersebut yang disingkirkan;
  kategori pantainya tetap aktif dan asisten menanyakan preferensi pantai alternatif
  (Pantai Padang, Pantai Nirwana, Pantai Carolina, Pantai Pasir Jambak, Pantai Bungus).
- **Penolakan kategori dihormati**: kategori yang ditolak tidak muncul lagi,
  termasuk lewat jalur fallback.
- **Enrichment kata kunci**: kategori `belanja` diperkaya kata kunci `oleh-oleh, oleh2`,
  dan kategori `santai` diperkaya `nongkrong, sore, tepi laut, ngopi, santai keluarga`
  pada teks chunk maupun ekstraksi kategori.
- **Deterministik dan murah**: retrieval <1 ms, tanpa panggilan API tambahan;
  biaya hanya embedding query ±10 ms.
- **Konteks ringkas**: ±441 karakter, sekitar 110 token per panggilan.

## Kelemahan

- **Parafrasa umum tanpa kata kunci** (1/5). Bila query memakai bahasa kiasan
  yang tidak memiliki padanan di teks chunk, retrieval berbasis kemiripan semantik
  masih bisa meleset.
- **Chunk miskin deskripsi**: sebagian destinasi memiliki `description: null`,
  sehingga teks chunk hanya berisi nama, kategori (beserta kata kunci), dan alamat.
- **Threshold tidak banyak berpengaruh**: distribusi skor bimodal, 0.15 dan 0.30
  menghasilkan ranking yang sama pada dataset ini.
- **Daftar destinasi spesifik statis**: pemetaan penolakan tempat spesifik saat ini
  mencakup pantai-pantai utama Padang; destinasi minor di luar daftar masih dibaca
  lewat kategorinya.

## Hasil penilaian LLM

16 query yang hasilnya berbeda antarvarian dinilai dengan
`muse-spark-1.3-contributor`. Penilaian dilakukan pada varian benchmark
(A/C/E), belum diulang untuk kode final; kode final menyamai A pada seluruh
query tersebut kecuali urutan hasil.

| Query | A | C | E |
|---|---|---|---|
| `real-01` | 1 | 1 | 1 |
| `real-04` | 0 | 0 | 0 |
| `real-06` | 0 | 0 | 0 |
| `real-07` | 1 | 1 | 1 |
| `name-02` | 0 | 0 | **2** |
| `name-04` | **2** | **2** | 0 |
| `name-06` | 1 | 1 | 1 |
| `cat-03` | 2 | 2 | 2 |
| `cat-04` | 0 | 0 | 0 |
| `cat-06` | 1 | 1 | 1 |
| `para-01` | 1 | 1 | 1 |
| `para-03` | 1 | 1 | 1 |
| `para-04` | 0 | 0 | **1** |
| `para-05` | 0 | 0 | **1** |
| `off-01` | **2** | 0 | 0 |
| `off-02` | **2** | 0 | 0 |
| **Rata-rata** | **0.88** | 0.63 | 0.75 |

Bacaan:

- Varian dengan fallback tanpa floor (C/E) kehilangan dua query off-topic:
  konteks dikarang (`Pantai Bungus`, `Sate Itjap`) dan dinilai 0.
- Scoping kategori (E) menang di `name-02` dan dua parafrasa, tetapi kalah di
  `name-04` karena kata "alamat" terbaca sebagai kategori `alam`.
- Kode final memakai scoping dengan perbaikan pembacaan "alamat" dan fallback
  ber-floor, sehingga perilaku off-topic kembali seperti A tanpa kehilangan
  `name-04`.

## Catatan pemeliharaan

- Setelah menambah atau mengubah destinasi di basis data, cache KB perlu dibangun
  ulang (restart proses) karena chunk disimpan sekali di memori.
- Bila kualitas rekomendasi ingin dinaikkan, prioritasnya memperkaya teks chunk
  (deskripsi dan sinonim kategori), bukan menurunkan threshold.
- Benchmark dijalankan dengan skrip sementara di `apps/api/`; lihat bagian
  reproduksi pada [dokumen benchmark](rag-retrieval-benchmark.md).
