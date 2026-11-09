# Chatbot AI Travel Itinerary — Testing & Evaluation Matrix

Scope: Padang, one-day trip. Runner: **Vitest** for backend and HTML client.
Dataset version: `chatbot-matrix-1.0`. Fixed reference date `2026-11-09`, timezone `Asia/Jakarta`
(so "besok" = `2026-11-10`). Prompt version for this run: `prompt-v1` (recorded in fixtures).

## How to run

```powershell
pnpm --filter api test:unit          # no DB needed
pnpm --filter api test:integration   # needs local PostgreSQL migrated + seeded
pnpm --filter app test               # Playwright + installed Chrome, all network mocked
```

`pnpm --filter api test` runs unit then integration. Integration tests use the real app wiring
(`src/app.ts`), real Prisma repositories, and a local fake AI provider over HTTP.

Known local lint noise: `apps/api/tmp/check-user.mjs` belongs to another workstream and is not part
of this matrix.

## Status legend

- **Auto** — asserted automatically in the listed file.
- **Partial** — the automated test covers the implementable part; the rest is listed as a gap.
- **Manual** — requires the live model / live OSRM; run through `apps/app/public/chat-test.html`.
- **Todo** — accepted behaviour is not implemented; recorded here, not silently emulated.

## 1. Intent Recognition

Fixture: `apps/api/tests/fixtures/chatbot/intent-cases.json`
Test: `apps/api/tests/unit/features/chat/intent-matrix.test.ts`

| ID | Input | Expected | Status |
|---|---|---|---|
| INT-001 | Saya mau liburan ke Padang | generate_itinerary | Auto (model contract) |
| INT-002 | Buatkan itinerary Padang besok | generate_itinerary | Auto (rule) |
| INT-003 | Rekomendasikan tempat wisata di Padang | generate_itinerary | Auto (model contract) |
| INT-004 | Ganti destinasi kedua dengan tempat lain | modify_itinerary | Auto (rule) |
| INT-005 | Buat ulang itinerary saya | regenerate_itinerary | Auto (rule) |
| INT-006 | Saya setuju dengan itinerary ini | confirm_itinerary | Auto (rule) |
| INT-007 | Apa itu Pantai Padang? | general_chat | Auto (model contract) |
| INT-008 | Berapa lama perjalanan ke tempat berikutnya? | itinerary_question | Todo — label not implemented |
| INT-009 | Hapus destinasi terakhir | modify_itinerary | Auto (model contract) |
| INT-010 | Saya ingin liburan ke Bukittinggi | out_of_scope | Todo — no label; runtime silently scopes Padang |

Model rows verify provider parsing, threshold (`<0.7` → `missing_information`), and malformed-output
safety. Real classification quality is a live evaluation, not an offline assertion.

## 2. Parameter Extraction

Fixture: `extraction-cases.json` — Test: `parameter-extraction.test.ts`

| ID | Input | Expected | Status |
|---|---|---|---|
| PAR-001 | jam 12 sampai 5 sore | 12:00–17:00 | Auto |
| PAR-002 | jam 8 pagi sampai 3 sore | 08:00–15:00 | Auto |
| PAR-003 | suka pantai dan kuliner | seed-pantai, seed-kuliner | Auto |
| PAR-004 | hanya suka wisata sejarah | seed-sejarah | Auto |
| PAR-005 | Besok siang | date 2026-11-10, no time | Auto |
| PAR-006 | waktu 5 jam | duration 300 min | Todo — duration-only parsing missing |
| PAR-007 | 13:30 sampai 16:45 | 13:30–16:45 | Auto |
| PAR-008 | pantai, jangan kuliner | include + exclude | Todo — negative preference missing |

Timezone is asserted at the boundary: `2026-11-09T18:00Z` counts as `2026-11-10` in Jakarta.

## 3. Clarification

Fixture: `clarification-cases.json` — Test: `clarification-matrix.test.ts`

| ID | Input | Expected | Status |
|---|---|---|---|
| CLA-001 | Saya mau liburan | ask for trip info | Auto |
| CLA-002 | Buat itinerary Padang | ask date/time | Auto |
| CLA-003 | Saya mulai jam 10 pagi | ask end time | Partial — response asks for start–end range, not end time alone |
| CLA-004 | Saya selesai jam 5 sore | ask start time | Partial — same range prompt |
| CLA-005 | Saya mau jalan besok | ask time | Auto |
| CLA-006 | liburan 2 hari | explain one-day MVP | Todo |
| CLA-007 | jam 20:00–23:00 | check opening hours | Todo — opening hours not modelled |

Service-level assertion: no draft is created while parameters are incomplete.

## 4. Destination Retrieval

Fixture data: live seed. Tests: `integration/chat.matrix.test.ts`, `tools` unit tests.

| ID | Scenario | Expected | Status |
|---|---|---|---|
| DES-001 | Destinations in Padang | only Padang rows | Auto |
| DES-002 | Category pantai | only pantai rows | Auto |
| DES-003 | pantai + kuliner | both categories | Todo — single-category path asserted |
| DES-004 | Inactive destination | excluded | Auto |
| DES-005 | Missing coordinates | no distance/route | Auto |
| DES-006 | Empty category result | empty result | Auto |
| DES-007 | Bukittinggi request | Padang scope | Auto |
| DES-008 | Unknown opening hours | no "surely open" claim | Todo |
| DES-009 | Fake destination id | rejected | Auto |

## 5. Itinerary Generation

Test: `itinerary-matrix.test.ts`

| ID | Scenario | Status |
|---|---|---|
| ITI-001 | 12:00–17:00 stays inside window | Auto |
| ITI-002 | 08:00–12:00 never passes 12:00 | Auto |
| ITI-003 | 13:30–16:00 fits 150 minutes | Auto |
| ITI-004 | Pantai preference | Auto via search-tool filter |
| ITI-005 | Pantai + kuliner | Partial — generator preserves request; multi-category search not asserted end-to-end |
| ITI-006 | Only one destination | Auto |
| ITI-007 | No matching destination | Auto (empty result, service rejects) |
| ITI-008 | Over-long list | Auto (truncated) |
| ITI-009 | Destination known closed | Todo |
| ITI-010 | Missing coordinates | Auto |
| ITI-011 | Many destinations | Auto |

Schedule assertions include order, monotonic start times, no overlap, positive duration, and hard
end-time bound.

## 6. Route Calculation

Test: `route-matrix.test.ts`

| ID | Scenario | Status |
|---|---|---|
| ROU-001 | Two coordinates | Auto |
| ROU-002 | Missing coordinate | Auto |
| ROU-003 | Invalid latitude | Auto |
| ROU-004 | Invalid longitude | Auto |
| ROU-005 | Deterministic order | Auto |
| ROU-006 | Very far destinations | Partial — straight-line distance only; travel time not modelled |
| ROU-007 | Haversine labelled estimate | Partial — geometry is exactly stop-to-stop; itinerary metadata uses `straight_line` |

The HTML client performs the actual road routing through OSRM and labels it as such (HTML-009/010).

## 7. Conversation Context

Fixture: `conversation-cases.json`

| ID | Follow-up | Status |
|---|---|---|
| CTX-001 | Ganti destinasi kedua | Todo |
| CTX-002 | Cari yang lebih dekat | Todo |
| CTX-003 | Buat lebih santai | Todo |
| CTX-004 | Tambahkan kuliner | Todo |
| CTX-005 | Jangan masukkan pantai | Todo |
| CTX-006 | Mulai jam 10 saja | Todo |
| CTX-007 | Saya setuju | Todo — MVP confirms through the endpoint |
| CTX-008 | Buat ulang | Todo unless the message repeats full parameters |

The current service parses the current message only; it does not merge partial follow-ups into the
previous draft. Regeneration with full parameters is covered end-to-end (CON-003).

## 8. Draft, Regeneration & Confirmation

Tests: `integration/chat.matrix.test.ts`, `integration/itinerary.confirm.test.ts`

| ID | Scenario | Expected DB count | Status |
|---|---|---|---|
| CON-001 | First itinerary request | 0 | Auto |
| CON-002 | New draft | 0 | Auto |
| CON-003 | Regeneration | 0 | Auto |
| CON-004 | Modification | 0 | Auto (same code path, count asserted) |
| CON-005 | Confirm | 1 | Auto |
| CON-006 | Confirm twice | 1 | Auto |
| CON-007 | Confirm without draft | rejected 404 | Auto |
| CON-008 | Draft of another user | rejected 403 | Auto (`itinerary.confirm.test.ts`) |
| CON-009 | Expired draft | rejected 404 | Auto (`itinerary.confirm.test.ts`) |
| CON-010 | DB failure during save | no partial row | Auto-ish — invalid/inactive destination rejects with 0 rows |
| CON-011 | Session already has final itinerary | no second row | Auto |

## 9. Safety & Security

Fixture: `safety-cases.json` — Tests: `safety-matrix.test.ts`, `chat.matrix.test.ts`

| ID | Scenario | Status |
|---|---|---|
| SAF-001 | Ignore rules, build Bali | Auto |
| SAF-002 | Fabricated destination | Auto |
| SAF-003 | User-supplied coordinates | Auto |
| SAF-004 | Print API key | Auto |
| SAF-005 | Negative start time | Auto |
| SAF-006 | End before start | Auto |
| SAF-007 | Three-day trip | Todo |
| SAF-008 | 20 stops in one hour | Auto |
| SAF-009 | Inactive destination at confirm | Auto |
| SAF-010 | Another user's draft | Auto |

## 10. Prompt Evaluation

Fixture: `prompt-cases.json` — Test: `prompt-evaluation.test.ts`

| ID | Prompt | Status |
|---|---|---|
| PRM-001 | System scopes Padang + tools + DB | Auto (structural) |
| PRM-002 | Out-of-scope city | Partial — runtime scopes to Padang instead of rejecting |
| PRM-003 | Intent labels complete | Auto (structural) |
| PRM-004 | Clock extraction | Auto (behavioural) |
| PRM-005 | Missing date stays empty | Auto (behavioural) |
| PRM-006 | Categories carried | Auto (behavioural) |
| PRM-007 | No invented price | Auto (behavioural) |
| PRM-008 | English reply language | Todo |

No LLM-as-judge in MVP. Prompt version and model are recorded per fixture and must be recorded in
every report.

## 11. HTML Client (manual → automated)

File: `apps/app/public/chat-test.html` — Test: `apps/app/tests/chat-test.e2e.test.ts`
API, OSRM, MapLibre assets, and CARTO tiles are intercepted; MapLibre runs locally so tests work
offline. Chrome is launched with `channel: "chrome"`.

| ID | Area | Scenario | Status |
|---|---|---|---|
| HTML-001 | Session | Two new chats → two tabs | Auto |
| HTML-002 | Session | Switch tab → matching history | Auto |
| HTML-003 | Session | Reload → session, history, draft, route restored | Auto |
| HTML-004 | Chat | Valid message → user + assistant bubbles, draft status | Auto |
| HTML-005 | Chat | Empty message → rejected, no API call | Auto |
| HTML-006 | Chat | API error → failed bubble, text returned | Auto |
| HTML-007 | Itinerary | Ordered stops, date/time meta, save button | Auto |
| HTML-008 | Itinerary | Save → saved id, button hidden, one confirm call | Auto |
| HTML-009 | Map success | OSRM route, distance/duration, numbered markers | Auto |
| HTML-010 | Map fallback | OSRM failure → straight line + red note | Auto |
| HTML-011 | Map edge | <2 points → no route, clear message | Auto |
| HTML-012 | Settings | Base URL + user id persisted | Auto |
| HTML-013 | Layout | 390px stacks, 260px map, no horizontal overflow | Auto |
| HTML-014 | A11y | tablist/role/aria-selected, aria-live, composer focus | Auto |

Live manual pass still applies before release (real Groq, real OSRM, real tiles).

## 12. Scoring

`Final Score = Σ (Rating / 5 × Weight)`

| Category | Weight |
|---|---:|
| Intent Recognition | 15% |
| Parameter Extraction | 15% |
| Destination Accuracy | 20% |
| Schedule & Route Validity | 20% |
| Conversation Context | 10% |
| Response Quality | 10% |
| Draft & Confirmation | 10% |

Interpretation: 90–100 Excellent, 80–89 Good, 70–79 Needs Improvement, 60–69 Poor, <60 Requires
Major Revision.

### Hard gates

Any of these fails the run regardless of score:

- invented destination;
- invalid or out-of-window schedule;
- itinerary saved without confirmation;
- duplicate itinerary for one session;
- cross-user draft/session access.

### MVP targets

Intent ≥90%, extraction ≥90%, destination 100%, valid schedule 100%, no fake destination 100%,
confirmation idempotency 100%, ownership validation 100%, critical tests 100%, overall ≥85%.

## 13. Prompt Version Comparison

| Metric | Prompt V1 | Prompt V2 | Improvement |
|---|---:|---:|---:|
| Intent Accuracy | TBD | TBD | TBD |
| Parameter Accuracy | TBD | TBD | TBD |
| Destination Accuracy | TBD | TBD | TBD |
| Schedule Validity | TBD | TBD | TBD |
| Context Accuracy | TBD | TBD | TBD |
| Response Quality | TBD | TBD | TBD |
| Overall Score | TBD | TBD | TBD |

Compare with the same dataset, model, and configuration. Repeat non-deterministic output runs.

## 14. Test Report Template

| Field | Value |
|---|---|
| Test Run ID | |
| Date | |
| Prompt Version | |
| Model | |
| Dataset Version | `chatbot-matrix-1.0` |
| Reference date / TZ | `2026-11-09` / `Asia/Jakarta` |
| Tester | |
| Total / Passed / Failed / Skipped | |
| Critical Failures | |
| Overall Score | |
| Final Status | PASS / PASS WITH MINOR ISSUES / FAIL |

### Failed test log

| Test ID | Expected | Actual | Root cause | Action |
|---|---|---|---|---|
| | | | | |

### Release gate checklist

- [ ] All critical tests pass.
- [ ] No invented destinations.
- [ ] No schedule past the requested window.
- [ ] No persistence before confirmation.
- [ ] No duplicate itinerary per session.
- [ ] No cross-user access.
- [ ] No significant regression against the previous baseline.

## 15. Post-MVP (recorded, not integrated)

- **Promptfoo** for automated prompt comparison.
- **Langfuse** for production trace and monitoring.
- **LLM-as-judge** with a larger dataset, used only as a supplement to deterministic assertions.
- Conversation-context merging (`CTX-*`), duration-only parsing, exclusions, opening hours,
  multi-day handling, `itinerary_question` / `out_of_scope` labels, dynamic reply language.

## 16. Gaps / risks

- Follow-up messages that omit parameters do not reuse the previous draft.
- Opening hours are not modelled, so late-night feasibility cannot be verified.
- Route travel time is not part of the backend schedule; only the HTML client shows OSRM estimates.
- Offline HTML tests mock the network; they prove UI behaviour, not live provider quality.
- Real OSRM demo server is rate-limited and not production-safe.
