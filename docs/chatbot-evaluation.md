# Chatbot Evaluation — Spesifikasi Audit (Phase 0)

Audit implementasi aktual chatbot itinerary Padang. Dasar untuk menyusun evaluation suite
(dataset + deterministic test + LLM evaluation). Bukan rencana tulis ulang prompt produksi.

Fixed context evaluasi:

```ts
export const evaluationContext = {
  referenceDate: "2026-11-09", // 03:00 UTC = 10:00 Asia/Jakarta
  timezone: "Asia/Jakarta",
  supportedCity: "Padang",
  tripDuration: "single_day",
};
```

## 1. Prompt aktual (hanya dua LLM prompt)

| Komponen | Lokasi | Isi |
|---|---|---|
| System prompt | `chat.service.ts` `SYSTEM_PROMPT` (baris 24) | "You are a helpful Padang travel assistant. For itinerary requests, you MUST use provided tools to fetch destination data from the database before suggesting places. Return concise Indonesian responses." |
| Intent classifier prompt | `classifier.ts` `CLASSIFIER_SYSTEM_PROMPT` (baris 38) | Perintah JSON-only dengan 13 label intent + confidence 0..1 |

Tidak ada prompt extraction/response terpisah: ekstraksi parameter bersifat **rule-based**
(`parseFlexibleDate`, `parseFlexibleClock`, `parseFlexibleTimeRange`, `extractCategories`,
`extractDestinationCount`, `parseGeneralTimeOfDay`) dan balasan memakai **template Bahasa Indonesia**.
Evaluasi tidak boleh menciptakan prompt baru yang tidak ada di produksi.

### Intent labels (13)

`general_chat · generate_itinerary · modify_itinerary · replace_destination · remove_destination ·
add_destination · regenerate_itinerary · select_itinerary_version · publish_itinerary_version ·
clarify_modification · confirm_itinerary · missing_information`

Deteksi dibagi dua: `matchRule()` (keyword regex deterministik: greeting, regenerate, modify,
generate, confirm, replace/remove/add, clarify) lalu fallback ke model bila confidence < 0.7 → `missing_information`.

## 2. API contract aktual

Prefix `/api/v1`.

| Metode & Path | Fungsi |
|---|---|
| `POST /chat/sessions` | buat sesi |
| `GET /chat/sessions` · `GET|PATCH|DELETE /chat/sessions/:id` | daftar/detail/ubah/hapus sesi |
| `GET /chat/sessions/:id/messages` | baca history (paginasi) |
| `POST /chat/sessions/:id/messages` | kirim pesan → draft/balasan |
| `POST /chat/messages/:id/regenerate` | regenerate pesan asisten |
| `GET /chat/messages/:id/versions` · `PATCH .../versions/:version/activate` | versi pesan |
| `POST /itineraries/confirm` | konfirmasi draft → itinerary final (idempotent) |
| `GET /itineraries/by-session/:sessionId` | itinerary final per sesi |
| `GET|POST /itineraries/:id/versions[/:version]` · `restore` · `publish` | versi itinerary |

`confirmItinerarySchema`: `{ draftId: uuid, userId, sessionId: uuid, profile: car|motorcycle|foot }`.

Alur draft: generate/regenerate/modify **tidak** menulis `itinerary` final; hanya draft via
`draftStore`/`saveDraftVersion`. Satu session maksimal satu itinerary final (`CON-001..012`).

## 3. Destination fixture (shape aktual)

Model `Destination` (`prisma/schema/destination.prisma`):

`id (uuid) · canonicalKey? · name · description? · latitude? · longitude? · address? · city? ·
source · isActive · imageUrl? · details (Json) · categories [DestinationCategory → Category{s.name,slug}]`

Nilai yang dipakai evaluasi deterministik: `city === "Padang"`, `isActive === true`, `Category.slug`
(canonical `pantai` dan `seed-pantai`). Koordinat null → tidak dipakai hitung jarak.

## 4. Matriks status kasus (gap terhadap plan)

Legenda: ✅ diimplementasi · 🟡 parsial · ❌ belum (todo) · ➖ di luar scope MVP saat ini.

### Intent (INT)
| ID | Status | Catatan |
|---|---|---|
| INT-001/002/003 | ✅ | generate (rule/model) |
| INT-004 replace_destination | ✅ | `RULE_PATTERNS` |
| INT-005 regenerate | ✅ | keyword rule |
| INT-006 confirm | ✅ | rule → tapi confirm via endpoint, bukan chat |
| INT-007 general_chat | ✅ | greeting rule + model |
| INT-008 itinerary_question | ❌ | label tidak ada; jatuh general_chat/missing |
| INT-009 remove_destination | ✅ | `RULE_PATTERNS` |
| INT-010 out_of_scope | 🟡 | bukan label; scope ditegakkan di generator (`SAF-001`) |

### Parameter (PAR)
| ID | Status |
|---|---|
| PAR-001..005, PAR-007 | ✅ (`parseFlexibleTimeRange`, `extractCategories`, `parseFlexibleDate`) |
| PAR-006 (durasi saja) | ❌ |
| PAR-008 (exclude) | ❌ (`extractCategories` hanya positif) |
| PAR-009 (17→12 invalid) | 🟡 tidak divalidasi; generator tidak menolak rentang mundur |
| PAR-010 (ref date tetap) | ✅ via `refNow` |

### Clarification (CLR)
> **Divergensi desain penting:** implementasi kini **auto-fill default** (tanggal hari ini, slot waktu
> per kategori/hibrid, count 8) lewat `resolveEffectiveRequest`, sehingga chatbot **tidak meminta
> klarifikasi**. Matriks clarification plan tidak selaras; ekspektasi harus diubah ke "langsung
> generate draft".

| ID | Status |
|---|---|
| CLR-001..005, CLR-008 | ➖ diganti auto-default (ready), bukan klarifikasi |
| CLR-006 (2 hari) | ❌ |
| CLR-007 (jam operasional) | ❌ opening hours belum dimodelkan |

### Destination retrieval (DST)
| ID | Status |
|---|---|
| DST-001..005 | ✅ integration `chat.matrix` |
| DST-006 (koordinat null) | 🟡 generator skip, tapi tidak diuji eksplisit |
| DST-007 (kategori kosong) | ✅ fallback tidak-ada-hasil |
| DST-008 (kota lain) | ✅ (`SAF-001`) |
| DST-009 (opening hours) | ❌ |
| DST-010 (ID fiktif) | ✅ `MODIFY_CANDIDATE_MISSING`/`DES-009` menolak ID non-DB |

### Itinerary generation (ITR)
| ID | Status |
|---|---|
| ITR-001..004 | ✅ generator + `final-time-slots` |
| ITR-005/006 | ✅ |
| ITR-007 (durasi tidak muat) | 🟡 generator memangkas, tidak menolak |
| ITR-008 (tutup) | ❌ |
| ITR-009 (koordinat null) | 🟡 |
| ITR-010 | ✅ |

### Conversation context (CTX)
| ID | Status |
|---|---|
| CTX-001..006, CTX-008 | ✅ `accumulateTripParams`/`mergeCategories` (uji di `context-merge.test.ts`) |
| CTX-007 (setuju) | ✅ tapi via endpoint confirm |
| CTX-009 (referensi "destinasi tadi") | ❌ |
| CTX-010 (lupakan sebelumnya) | 🟡 tidak ada reset eksplisit |

### Flow / draft-confirm (FLOW)
| ID | Status |
|---|---|
| FLOW-001..009 | ✅ integration `chat.matrix` + `chat.draft-persistence` + `chat-modify-version` |
| FLOW-010 (rollback transaksi) | 🟡 belum diuji eksplisit |
| FLOW-011 (draftId tak dikenal) | ✅ `CON-007` 404 |
| FLOW-012 (draft terganti) | ✅ `CON-002/003` |

### Safety (SAFE)
| ID | Status |
|---|---|
| SAFE-001..006, SAFE-009, SAFE-010 | ✅ |
| SAFE-007 (3 hari) | ❌ |
| SAFE-008 (20 dalam 1 jam) | ✅ generator memangkas count |

## 5. Fixture yang sudah ada (stale sebagian)

`tests/fixtures/chatbot/`: `intent-cases.json`, `extraction-cases.json`, `clarification-cases.json`,
`conversation-cases.json`, `safety-cases.json`, `prompt-cases.json`.

Beberapa `mode:"todo"` sudah ternyata diimplementasi (mis. `CTX-001/004/008`, count-change,
auto-default). Fixture perlu disegarkan di Phase 1 agar `notes` dan `mode` mencerminkan status aktual.
`conversation-cases.json` dan `safety-cases.json` belum dikonsumsi test mana pun — perlu test matrix
yang membacanya atau dihapus.

## 6. Next step (Phase 1 → 2)

1. Refresh fixture `todo` → status aktual (terutama conversation/CTX dan clarification/auto-default).
2. Tambah kasus hilang: `PAR-009`, `DST-006`, `FLOW-010`; konsumen matrix untuk `conversation-cases` & `safety-cases`.
3. LLM evaluation runner (Phase 3) = opsional, butuh AI key nyata; Pisahkan dari `test:unit` cepat.