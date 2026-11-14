import type { Prisma } from "../../../generated/prisma/client.js";
import { env } from "../../../env.js";
import { HttpError } from "../../../shared/http/errors.js";
import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";
import type { AiMessage, AiToolDefinition } from "../../../integrations/ai/schemas.js";
import { classify, type Intent } from "./classifier.js";
import { formatItineraryReply, generateNaturalReply, isClearlyOffTopic, OFF_TOPIC_REPLY, ONE_TRIP_PER_CHAT } from "./answerer.js";
import { normalizeDistrict } from "../../../shared/geo/padang-district.js";
import { buildConversationContext } from "./conversation-context.js";
import { generateItinerary, scheduleStops } from "./itinerary-generator.js";
import { createToolExecutor, mergeDestinationRows } from "./tools.js";
import { parseModification } from "./modification.js";
import { DISLIKE } from "./vocab.js";
import { applyModification, orderCandidates } from "./modification-ops.js";
import { haversineMeters, isCoordinate, routeLineString } from "./route-geometry.js";
import { activateVersion, appendVersion, type MessageVersion } from "./message-versioning.js";
import type { ItineraryModification } from "../../../shared/schemas/itinerary-modification.js";
import type {
  ItineraryVersionGateway,
  ItineraryVersionStop,
  ItineraryVersionView,
} from "../../../shared/schemas/itinerary-version.js";
import * as chatRepository from "../repositories/chat.repository.js";

async function ragContextMessage(deps: Pick<ChatDeps, "retrieveRagContext">, query: string): Promise<AiMessage[]> {
  if (!deps.retrieveRagContext) return [];
  const ragText = await deps.retrieveRagContext(query).catch(() => "");
  if (!ragText) return [];
  return [{ role: "system", content: `Destinasi relevan (jadikan petunjuk, tetap panggil tool untuk data final):\n${ragText}` }];
}

const HISTORY_LIMIT = 20;
export const SYSTEM_PROMPT =
  "You are a helpful Padang travel assistant. For itinerary requests, you MUST use provided tools to fetch destination data from the database before suggesting places. Return concise Indonesian responses. " +
  "Each destination may include `district` (kecamatan) and `details.estimatedCost` ({currency, min, max, kind, unit, basis, confidence}). " +
  "Use them only as enrichment: mention the wilayah and say cost as an estimate (e.g. \"sekitar Rp20.000–50.000/orang\") when it helps the user's question. " +
  "If a field is null or the user did not ask about cost/wilayah, answer from what you know without inventing numbers or districts.";

type UserRow = { id: string; isActive: boolean };
type ChatDeps = {
  findUserById: (id: string) => Promise<UserRow | null>;
  classifyMessage?: typeof classify;
  completeAiChat?: typeof completeChat;
  retrieveRagContext?: (query: string) => Promise<string>;
  itinerary?: ItineraryVersionGateway;
  searchDestinations: (input: {
    keywords?: string;
    categories?: string[];
    district?: string;
  }) => Promise<unknown[]>;
  getDestinationDetails: (input: { destinationIds: string[] }) => Promise<unknown[]>;
  /** Injectable randomness for the category pick; tests pass a fixed function. */
  random?: () => number;
};

export type TripDetails = { travelDate: string; startTime: string; endTime: string; categories: string[]; destinationCount?: number };

function asAiHistory(rows: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }>) {
  return rows.filter((r): r is { role: "user" | "assistant"; content: string } => r.role === "user" || r.role === "assistant");
}

async function requireActiveUser(deps: ChatDeps, userId: string) {
  const user = await deps.findUserById(userId);
  if (!user || user.isActive !== true) throw new HttpError(401, "AUTH_REQUIRED", "Active user required");
  return user;
}

async function requireOwnedSession(userId: string, sessionId: string) {
  const session = await chatRepository.findSessionById(sessionId);
  if (!session) throw new HttpError(404, "SESSION_NOT_FOUND", "Chat session not found");
  if (session.userId !== userId) throw new HttpError(403, "FORBIDDEN", "Session access denied");
  return session;
}

function productionGate() {
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Chat API is disabled until authentication is configured");
  }
}

async function resolveSystemModelId() {
  const modelIdentifier = (env.AI_TOOL_MODEL || "system-chat").trim();
  const provider = (env.AI_TOOL_PROVIDER || env.AI_PROVIDER || "system").trim();
  const row = await chatRepository.findOrCreateSystemModel({ provider, modelIdentifier, name: modelIdentifier });
  return row.id;
}

const MONTHS: Record<string, string> = {
  jan: "01", januari: "01", feb: "02", februari: "02", mar: "03", maret: "03", apr: "04", april: "04",
  mei: "05", may: "05", jun: "06", juni: "06", jul: "07", juli: "07", agu: "08", ags: "08", agustus: "08",
  aug: "08", sep: "09", sept: "09", september: "09", okt: "10", oct: "10", oktober: "10", nov: "11",
  november: "11", des: "12", dec: "12", desember: "12",
};

const JAKARTA_TZ = "Asia/Jakarta";

function todayYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function parseFlexibleDate(text: string, now = new Date()): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const named = text.toLowerCase().match(/\b(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|ags|aug|sep(?:t(?:ember)?)?|okt(?:ober)?|oct|nov(?:ember)?|des(?:ember)?|dec)\s+(20\d{2})\b/);
  if (named) {
    const mm = MONTHS[named[2]!];
    if (mm) return `${named[3]}-${mm}-${named[1]!.padStart(2, "0")}`;
  }
  const lower = text.toLowerCase().replace(/['’]/g, "");
  const today = todayYmd(now);
  if (/\bhari ini\b/.test(lower)) return today;
  if (/\bbesok\b/.test(lower)) return addDaysYmd(today, 1);
  if (/\blusa\b/.test(lower)) return addDaysYmd(today, 2);
  // A named weekday means its next occurrence; "selasa" spoken on Saturday is not today.
  const weekday = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"].findIndex((d) =>
    new RegExp(`\\b${d}\\b`).test(lower),
  );
  if (weekday >= 0) {
    const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDaysYmd(today, (weekday - todayDow + 7) % 7);
  }
  if (/\btanggal\b/.test(lower)) return today;
  return null;
}

export function parseFlexibleClock(raw: string, meridiemHint?: string): string | null {
  const clean = raw.trim().toLowerCase().replace(/\./g, ":");
  const hm = clean.match(/^(\d{1,2})(?::([0-5]\d))?$/);
  if (!hm) return null;
  let h = Number(hm[1]);
  const m = hm[2] ?? "00";
  const hint = (meridiemHint || "").toLowerCase();
  if (/\b(malam|night)\b/.test(hint) && h >= 1 && h <= 11) h += 12;
  if (/\b(sore|petang|evening)\b/.test(hint) && h >= 1 && h <= 6) h += 12;
  if (/\b(siang|pm)\b/.test(hint) && h >= 1 && h <= 6) h += 12;
  if (/\b(pagi|am)\b/.test(hint) && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m}`;
}

export function parseFlexibleTimeRange(text: string): { startTime: string; endTime: string } | null {
  const strict = [...text.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map((m) => `${m[1]}:${m[2]}`);
  if (strict[0] && strict[1]) return { startTime: strict[0], endTime: strict[1] };
  const range = text.toLowerCase().match(/\b(?:jam|pukul)?\s*(\d{1,2}(?:[:.][0-5]\d)?)\s*(pagi|siang|sore|malam)?\s*(?:sampai|-|–|—|hingga)\s*(?:jam|pukul)?\s*(\d{1,2}(?:[:.][0-5]\d)?)\s*(pagi|siang|sore|malam)?\b/);
  if (range) {
    const start = parseFlexibleClock(range[1]!, range[2] || range[4]);
    const end = parseFlexibleClock(range[3]!, range[4] || range[2]);
    if (start && end) return { startTime: start, endTime: end };
  }
  return null;
}

const WORD_NUMBERS: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };
const COUNT_NOUN = "destinasi|tempat(?:\\s+wisata)?|lokasi|spot|titik";

export function extractDestinationCount(text: string): number | null {
  const digit = new RegExp(`\\b(\\d+)\\s+(?:${COUNT_NOUN})\\b`, "i").exec(text);
  const word = new RegExp(`\\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\\s+(?:${COUNT_NOUN})\\b`, "i").exec(text);
  const pick = (m: RegExpExecArray | null): number | null => {
    if (!m) return null;
    const n = WORD_NUMBERS[m[1]!] ?? Number(m[1]);
    return n > 0 ? n : null;
  };
  if (digit && word) return (digit.index! <= word.index! ? pick(digit) : pick(word));
  const withNoun = digit ? pick(digit) : pick(word);
  if (withNoun != null) return withNoun;
  // shortcut: "jadikan/ubah jadi/ubah menjadi/ganti jadi 3" tanpa kata jumlah (CTX-008 + percakapan).
  const setCount = /\b(?:jadikan|ubah(?:kan)?\s+(?:jadi|menjadi)|ganti\s+(?:jadi|menjadi))\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d{1,2})\b/i.exec(text);
  return pick(setCount);
}

// "3 itinerary / alternatif / opsi / pilihan" berarti minta beberapa susunan, bukan jumlah destinasi.
const ALTERNATIVES_NOUN = "trip|itinerary|itinerari|itenerary|alternatif|opsi|pilihan";
export function wantsMultipleItineraries(text: string): boolean {
  return new RegExp(`\\b\\d+\\s+(?:${ALTERNATIVES_NOUN})\\b`, "i").test(text);
}

export function extractCategories(text: string): string[] {
  const categories: string[] = [];
  const t = text.toLowerCase();
  if (t.includes("pantai")) categories.push("pantai");
  if (t.includes("budaya")) categories.push("budaya");
  if (t.includes("sejarah")) categories.push("sejarah");
  // "alam" muncul di dalam "alamat"/"dalam"; scope kategori jangan dipicu kata biasa.
  if (/(?:^|[^a-z])alam(?!at)/.test(t)) categories.push("alam");
  if (t.includes("kuliner") || t.includes("makan")) categories.push("kuliner");
  // Vibe words map to "santai" (kafe, tempat duduk lama) because the catalog has no vibe tags.
  if (
    t.includes("santai") ||
    /\b(?:sepi|tenang|ngobrol|nongkrong|ngedate|kencan|romantis|santai|chill|kopi|kafe|cafe|tepi\s+laut|ngopi|santai\s+keluarga|jalan-jalan\s+sore|suasana\s+sore|santai\s+sore|sore\s+santai)\b/i.test(t)
  ) {
    categories.push("santai");
  }
  if (t.includes("belanja") || t.includes("shopping") || /\b(?:oleh-oleh|oleh2)\b/i.test(t)) categories.push("belanja");
  return [...new Set(categories)];
}

/** Kecamatan yang disebut user; null bila pesan tidak menyebut wilayah Padang. */
export function extractDistrict(text: string): string | null {
  return normalizeDistrict(text);
}

export const CATEGORY_LABELS: Record<string, string> = {
  pantai: "pantai",
  alam: "wisata alam",
  budaya: "seni & budaya",
  sejarah: "situs bersejarah",
  kuliner: "kuliner",
  belanja: "belanja",
  santai: "santai",
  keluarga: "ramah keluarga",
};

const REJECTION_CUE = new RegExp(
  `\\b(?:jangan|hindari|anti|tidak\\s+mau|nggak\\s+mau|gak\\s+mau|ga\\s+mau)\\b|${DISLIKE.source}`,
  "i",
);
// "museum" bukan slug kategori; semua museum di KB Padang berkategori sejarah + budaya.
const REJECTED_ALIASES: Array<[RegExp, string[]]> = [[/\bmuseum\b/i, ["sejarah", "budaya"]]];
const CLAUSE_SPLIT = /[.,;!?]|\b(?:tapi|tetapi|namun|malah|sebaliknya)\b/i;

export type RejectedDestination = {
  name: string;
  category: string;
  pattern: RegExp;
  aliases: string[];
  alternatives: string[];
};

export const KNOWN_DESTINATION_REJECTIONS: RejectedDestination[] = [
  {
    name: "Pantai Air Manis",
    category: "pantai",
    pattern: /\b(?:pantai\s+air\s+manis|pantai\s+manis|air\s+manis)\b/i,
    aliases: ["Pantai Air Manis", "Air Manis Beach", "pantai manis", "air manis"],
    alternatives: ["Pantai Padang (Taplau)", "Pantai Nirwana", "Pantai Carolina", "Pantai Pasir Jambak", "Pantai Bungus"],
  },
  {
    name: "Pantai Nirwana",
    category: "pantai",
    pattern: /\bpantai\s+nirwana\b/i,
    aliases: ["Pantai Nirwana"],
    alternatives: ["Pantai Air Manis", "Pantai Padang (Taplau)", "Pantai Carolina", "Pantai Pasir Jambak", "Pantai Bungus"],
  },
  {
    name: "Pantai Carolina",
    category: "pantai",
    pattern: /\bpantai\s+carolina\b/i,
    aliases: ["Pantai Carolina"],
    alternatives: ["Pantai Air Manis", "Pantai Padang (Taplau)", "Pantai Nirwana", "Pantai Pasir Jambak", "Pantai Bungus"],
  },
  {
    name: "Pantai Padang",
    category: "pantai",
    pattern: /\b(?:pantai\s+padang|taplau)\b/i,
    aliases: ["Pantai Padang", "Pantai Padang (Taplau)", "Taplau Padang"],
    alternatives: ["Pantai Air Manis", "Pantai Nirwana", "Pantai Carolina", "Pantai Pasir Jambak", "Pantai Bungus"],
  },
];

export function detectRejectedDestination(text: string): RejectedDestination | null {
  for (const clause of text.split(CLAUSE_SPLIT)) {
    if (!REJECTION_CUE.test(clause)) continue;
    for (const item of KNOWN_DESTINATION_REJECTIONS) {
      if (item.pattern.test(clause)) return item;
    }
  }
  return null;
}

export function detectRejectedDestinationNames(text: string): string[] {
  const dest = detectRejectedDestination(text);
  return dest ? dest.aliases : [];
}

/** Kategori yang ditolak pengguna, dibaca per klausa agar "jangan pantai, mau kuliner" hanya menolak pantai. */
export function detectRejectedCategories(text: string): string[] {
  const found: string[] = [];
  for (const clause of text.split(CLAUSE_SPLIT)) {
    if (!REJECTION_CUE.test(clause)) continue;
    const dest = detectRejectedDestination(clause);
    const cats = extractCategories(clause);
    for (const c of cats) {
      // Jika klausa ini menolak destinasi spesifik (misal Pantai Air Manis), kategori pantainya sendiri tidak ditolak.
      if (dest && dest.category === c) continue;
      found.push(c);
    }
    for (const [pattern, slugs] of REJECTED_ALIASES) {
      if (pattern.test(clause)) found.push(...slugs);
    }
  }
  return [...new Set(found)];
}

export function destinationRejectionReply(dest: RejectedDestination): string {
  const categoryLabel = CATEGORY_LABELS[dest.category] ?? dest.category;
  return `Oke, ${dest.name} kita lewati ya. Kamu lebih suka suasana ${categoryLabel} yang seperti apa? Pilihannya: ${dest.alternatives.join(", ")}.`;
}

/** Pertanyaan balik: jangan pilihkan pengganti sepihak saat pengguna menolak sesuatu. */
export function rejectionReply(text: string, rejected: string[]): string {
  const target = /\bmuseum\b/i.test(text)
    ? "museum"
    : rejected.map((slug) => CATEGORY_LABELS[slug] ?? slug).join(" dan ");
  const options = Object.entries(CATEGORY_LABELS)
    .filter(([slug]) => !rejected.includes(slug))
    .map(([, label]) => label);
  return `Oke, ${target} kita lewati ya. Sebelum saya ganti, kamu lebih suka diganti dengan apa? Pilihannya: ${options.join(", ")}.`;
}

export type RejectionOutcome =
  | { kind: "ask"; message: string }
  | { kind: "continue"; categories: string[]; excludedDestinations?: string[] };

/** null = tidak ada penolakan; "ask" = tanya dulu; "continue" = lanjut tanpa kategori/destinasi yang ditolak. */
export function handleRejection(text: string, categories: string[]): RejectionOutcome | null {
  const rejectedDest = detectRejectedDestination(text);
  const rejectedCats = detectRejectedCategories(text);

  if (!rejectedDest && rejectedCats.length === 0) return null;

  if (rejectedDest) {
    const wanted = extractCategories(text).filter((c) => c !== rejectedDest.category && !rejectedCats.includes(c));
    if (wanted.length > 0) {
      return {
        kind: "continue",
        categories: categories.filter((c) => c !== rejectedDest.category && !rejectedCats.includes(c)),
        excludedDestinations: rejectedDest.aliases,
      };
    }
    return { kind: "ask", message: destinationRejectionReply(rejectedDest) };
  }

  const wanted = extractCategories(text).filter((c) => !rejectedCats.includes(c));
  if (wanted.length === 0) return { kind: "ask", message: rejectionReply(text, rejectedCats) };
  return { kind: "continue", categories: categories.filter((c) => !rejectedCats.includes(c)) };
}

function parseTripDetails(text: string, now = new Date()): TripDetails | null {
  const travelDate = parseFlexibleDate(text, now);
  const time = parseFlexibleTimeRange(text);
  const categories = extractCategories(text);
  if (!travelDate || !time || categories.length === 0) return null;
  return { travelDate, startTime: time.startTime, endTime: time.endTime, categories };
}

export type TripParseOutcome =
  | { kind: "ready"; trip: TripDetails }
  | { kind: "general_time"; dateHint: string | null; categories: string[] }
  | { kind: "missing"; dateHint: string | null; timeHint: { startTime: string; endTime: string } | null; categories: string[] };

export function parseFullDay(text: string): { startTime: string; endTime: string } | null {
  return /\b(?:sehari(?:an)?(?:\s+penuh)?|satu\s+hari|1\s+hari|full\s*day)\b/i.test(text)
    ? { startTime: "08:00", endTime: "21:00" }
    : null;
}

export function parseGeneralTimeOfDay(text: string): { startTime: string; endTime: string } | null {
  const lower = text.toLowerCase();
  const full = parseFullDay(lower);
  if (full) return full;
  // shortcut: abaikan bila pengguna sudah menyebut jam eksplisit ("jam 10 pagi" tetap general_time).
  if (/\b(jam|pukul)\b/.test(lower)) return null;
  if (/\b(dini\s*hari)\b/.test(lower)) return { startTime: "00:00", endTime: "05:59" };
  if (/\b(pagi|morning)\b/.test(lower)) return { startTime: "06:00", endTime: "10:59" };
  if (/\b(siang)\b/.test(lower)) return { startTime: "11:00", endTime: "14:59" };
  if (/\b(sore|petang|sunset)\b/.test(lower)) return { startTime: "15:00", endTime: "17:59" };
  if (/\b(malam|night)\b/.test(lower)) return { startTime: "18:00", endTime: "23:59" };
  return null;
}

/**
 * Sinyal user menyerahkan keputusan waktu/kategori ke asisten. Sengaja luas:
 * "terserah", "kasih saran", sampai "kamu tentukan saja" harus sama-sama
 * dianggap delegasi — kalau tidak, balasan model bisa menjanjikan pencarian
 * tanpa pernah menyusun trip.
 */
const DEFER_TIME = new RegExp(
  [
    "terserah(?:lah)?(?:\\s+(?:kamu|anda))?",
    "bebas(?:\\s+(?:aja|saja))?",
    "kasih\\s+(?:saja\\s+)?(?:saran|rekomendasi)",
    "(?:beri|berikan|memberi|memberikan)\\s+(?:saya\\s+)?(?:saja\\s+)?(?:saran|rekomendasi)",
    "rekomendasi(?:nya)?",
    "rekomendasikan",
    "pilihkan",
    "pilih\\s+(?:saja|aja|sendiri)",
    "(?:kamu|anda)\\s+(?:pilih|tentukan)",
    "tentukan(?:\\s+(?:saja|aja|sendiri))?",
    "atur\\s+saja",
    "serahkan\\s+(?:saja\\s+)?(?:ke\\s+)?(?:kamu|anda|saya)",
    "ikut\\s+(?:kamu|anda|saja)",
    "(?:gak|nggak|enggak|tidak|ga)\\s*(?:tahu|tau)",
    "bingung",
    "yang\\s+(?:penting|terbaik|bagus|variatif)",
    "apa\\s*(?:aja|saja)",
    "sama\\s+saja",
  ].join("|"),
  "i",
);

/** User hands the time/category decision to the assistant ("terserah", "kasih saran"). */
export function isDeferringTime(text: string): boolean {
  return DEFER_TIME.test(text);
}

// Sentinels: a follow-up question is asked once per field, never repeated.
const ASK_CATEGORY_LEAD = "Mau ke tempat seperti apa?";
const ASK_CATEGORY = `${ASK_CATEGORY_LEAD} Pilih pantai, kuliner, alam, budaya, atau belanja. Kalau terserah, bilang saja nanti saya pilihkan yang variatif.`;
// Old wording is matched too, so a session that already asked is not asked again.
const ASK_CATEGORY_MARKS = [ASK_CATEGORY_LEAD, "Kategori mau ke mana"];
const ASK_TIME_MARKS = ["Jam berapa rencananya?", "Jam berapa mau mulai"];

function askedBefore(history: Array<{ role: string; content: string }>, marks: string[]): boolean {
  return history.some((m) => m.role === "assistant" && marks.some((mark) => m.content.includes(mark)));
}

const CATEGORY_POOL = ["pantai", "alam", "kuliner", "budaya", "sejarah", "santai", "belanja"];

/** Two categories that actually have destinations, so a deferred pick is never empty. */
async function pickCategories(deps: ChatDeps): Promise<string[]> {
  const rows = await deps.searchDestinations({}).catch(() => []);
  const slugs = [
    ...new Set(
      rows.flatMap((row) => {
        const cats = (row as { categories?: unknown } | null)?.categories;
        if (!Array.isArray(cats)) return [];
        return cats
          .map((c) => (c && typeof c === "object" ? (c as { slug?: unknown }).slug : null))
          .filter((s): s is string => typeof s === "string" && CATEGORY_POOL.includes(s));
      }),
    ),
  ];
  const pool = slugs.length > 0 ? slugs : CATEGORY_POOL;
  const rng = deps.random ?? Math.random;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, 2);
}

const TIME_CHANGE_HINT = /\b(?:ubah|ganti|jadwal(?:nya)?|mulai|majukan|mundur|jadi|menjadi)\b/i;

export type TimeChange = { startTime: string; endTime?: string };

/** Only reads time changes; caller must already know an active trip exists. */
export function parseTimeChange(text: string): TimeChange | null {
  const range = parseFlexibleTimeRange(text);
  if (range) return range;
  const full = parseFullDay(text);
  if (full) return full;
  const slot = parseGeneralTimeOfDay(text);
  if (slot) {
    const bareSlot = /^\s*(?:pagi|siang|sore|petang|malam|sunset|dini\s*hari)(?:\s+(?:aja|saja|dong))?\s*$/i.test(text);
    if (TIME_CHANGE_HINT.test(text) || bareSlot) return slot;
  }
  const clock = /\b(?:jam|pukul)\s*(?:jadi|ke|menjadi|mulai|dari)?\s*(\d{1,2}(?:[:.]\d{2})?)\s*(pagi|siang|sore|petang|malam)?\b/i.exec(text);
  if (clock && TIME_CHANGE_HINT.test(text)) {
    const startTime = parseFlexibleClock(clock[1]!, clock[2]);
    if (startTime) return { startTime };
  }
  return null;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function shiftMinutes(hhmm: string, delta: number): string {
  const total = Math.max(0, Math.min(23 * 60 + 59, minutesOf(hhmm) + delta));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A start-only change keeps the current day span so the trip stays intact. */
export function applyTimeChange(
  change: TimeChange,
  current: { startTime: string; endTime: string },
): { startTime: string; endTime: string } {
  if (change.endTime != null) return { startTime: change.startTime, endTime: change.endTime };
  const span = Math.max(60, minutesOf(current.endTime) - minutesOf(current.startTime));
  return { startTime: change.startTime, endTime: addMinutes(change.startTime, span) };
}

export function analyzeTripRequest(text: string, now = new Date()): TripParseOutcome {
  const travelDate = parseFlexibleDate(text, now);
  const time = parseFlexibleTimeRange(text) ?? parseGeneralTimeOfDay(text);
  const categories = extractCategories(text);
  if (travelDate && time && categories.length > 0) {
    const destinationCount = extractDestinationCount(text);
    return { kind: "ready", trip: { travelDate, startTime: time.startTime, endTime: time.endTime, categories, ...(destinationCount != null ? { destinationCount } : {}) } };
  }
  if (!time) return { kind: "general_time", dateHint: travelDate, categories };
  return { kind: "missing", dateHint: travelDate, timeHint: time, categories };
}

export type AccumulatedTripParams = {
  travelDate?: string;
  startTime?: string;
  endTime?: string;
  categories: string[];
  destinationCount?: number;
};

export function messageContributesParams(text: string, now?: Date): boolean {
  return (
    parseFlexibleDate(text, now) !== null ||
    parseFlexibleTimeRange(text) !== null ||
    parseGeneralTimeOfDay(text) !== null ||
    extractCategories(text).length > 0 ||
    extractDestinationCount(text) != null ||
    isDeferringTime(text)
  );
}

export function mergeCategories(prior: string[], text: string, latest: string[]): string[] {
  if (latest.length === 0) return prior;
  if (/\b(ganti|ubah|jadi|saja|hanya)\b/i.test(text)) return latest;
  return [...new Set([...prior, ...latest])];
}

const TRIP_REQUEST = /\b(buat|buatkan|rencana|rencanakan|itinerary|itinerari|itenerary|destinasi|susun|bikin|generate|minta)\b/i;

export function accumulateTripParams(
  history: Array<{ role: string; content: string }>,
  current: string,
  now?: Date,
): { params: AccumulatedTripParams; pending: boolean } {
  const params: AccumulatedTripParams = { categories: [] };
  let pending = false;
  const apply = (msg: string): void => {
    const date = parseFlexibleDate(msg, now);
    if (date) params.travelDate = date;
    const time = parseFlexibleTimeRange(msg) ?? parseGeneralTimeOfDay(msg);
    if (time) {
      params.startTime = time.startTime;
      params.endTime = time.endTime;
    }
    const count = extractDestinationCount(msg);
    if (count != null) params.destinationCount = count;
    const cats = extractCategories(msg);
    if (cats.length > 0) params.categories = mergeCategories(params.categories, msg, cats);
  };
  for (const row of history) {
    if (row.role === "user" && row.content !== current) {
      // Only an earlier trip request/param makes this turn a follow-up; small talk ("halo") does not.
      if (messageContributesParams(row.content, now) || TRIP_REQUEST.test(row.content)) pending = true;
      apply(row.content);
    }
  }
  apply(current);
  return { params, pending };
}

export type EffectiveOutcome =
  | { kind: "ready"; trip: TripDetails }
  | { kind: "general_time"; dateHint: string | null; categories: string[] }
  | { kind: "missing"; dateHint: string | null; timeHint: { startTime: string; endTime: string } | null; categories: string[] };

// Slot default per kategori tunggal; campuran/tak dikenal = seharian penuh.
const CATEGORY_TIME_SLOT: Record<string, { startTime: string; endTime: string }> = {
  pantai: { startTime: "06:00", endTime: "10:59" },
  alam: { startTime: "06:00", endTime: "10:59" },
  budaya: { startTime: "11:00", endTime: "14:59" },
  sejarah: { startTime: "11:00", endTime: "14:59" },
  belanja: { startTime: "11:00", endTime: "14:59" },
  kuliner: { startTime: "11:00", endTime: "14:59" },
  santai: { startTime: "15:00", endTime: "17:59" },
};

export function defaultTimeRange(categories: string[]): { startTime: string; endTime: string } {
  if (categories.length === 1) {
    const slot = CATEGORY_TIME_SLOT[categories[0]!];
    if (slot) return slot;
  }
  return { startTime: "08:00", endTime: "21:00" };
}

export function resolveEffectiveRequest(p: AccumulatedTripParams, now = new Date()): EffectiveOutcome {
  const time = defaultTimeRange(p.categories);
  return {
    kind: "ready",
    trip: {
      travelDate: p.travelDate ?? todayYmd(now),
      startTime: p.startTime ?? time.startTime,
      endTime: p.endTime ?? time.endTime,
      categories: p.categories,
      ...(p.destinationCount != null ? { destinationCount: p.destinationCount } : {}),
    },
  };
}

function generatedStops(generated: ReturnType<typeof generateItinerary>): ItineraryVersionStop[] {
  return generated.destinations.map((d) => ({
    position: d.order,
    destinationId: d.id,
    name: d.name,
    latitude: d.latitude ?? 0,
    longitude: d.longitude ?? 0,
    arrivalTime: d.startTime,
    visitDurationMin: Math.max(1, (() => {
      const [sh, sm] = d.startTime.split(":").map(Number);
      const [eh, em] = d.endTime.split(":").map(Number);
      return (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0));
    })()),
    category: null,
  }));
}

/** Same destinations in the same order at the same times means nothing changed. */
function sameStops(a: ItineraryVersionStop[], b: ItineraryVersionStop[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) =>
    (s.destinationId ?? "") === (b[i]!.destinationId ?? "") &&
    (s.arrivalTime ?? "") === (b[i]!.arrivalTime ?? ""));
}

/** Derive per-stop durations from consecutive arrivals; last stop falls back to 60 min. */
function stopDurations(stops: ItineraryVersionStop[]): number[] {
  return stops.map((s, i) => {
    const next = stops[i + 1];
    if (next?.arrivalTime && s.arrivalTime) {
      const diff = minutesOf(next.arrivalTime) - minutesOf(s.arrivalTime);
      if (diff > 0) return diff;
    }
    return s.visitDurationMin ?? 60;
  });
}

const ASK_TIME_LEAD = "Jam berapa rencananya?";
const ASK_TIME = `${ASK_TIME_LEAD} Pilih pagi (06:00–10:59), siang (11:00–14:59), sore (15:00–17:59), malam (18:00–23:59), atau seharian (08:00–21:00). Kalau terserah, bilang saja nanti saya pilihkan.`;
const ASK_DETAILS = `${ASK_CATEGORY}\n\n${ASK_TIME}`;

const BARE_MODIFICATION =
  /^\s*(?:tolong\s+|coba\s+)?(?:ganti(?:in|kan)?|ubah(?:in|kan)?|tuker(?:in)?|modifikasi(?:kan)?|hapus(?:in)?)(?:\s+(?:dong|aja|saja|ya|nih|deh|itu|semua|yang\s+lain))*\s*[.!?]*\s*$/i;

function buildRouteJson(stops: Array<{ position: number; latitude: number; longitude: number }>) {
  const legs = [];
  let totalDistanceM = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    const distanceM = haversineMeters(from, to);
    if (distanceM != null) totalDistanceM += distanceM;
    legs.push({
      fromPosition: from.position,
      toPosition: to.position,
      transportMode: "walk",
      distanceM: distanceM == null ? null : Math.round(distanceM),
      durationSec: null,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ] as Array<[number, number]>,
      },
      provider: "straight_line",
      profile: "straight_line",
      fallback: true,
    });
  }
  return {
    json: {
      type: "LineString" as const,
      coordinates: routeLineString(stops)?.coordinates ?? [],
      legs,
    },
    totalDistanceM: totalDistanceM > 0 ? Math.round(totalDistanceM) : null,
  };
}

function toCandidate(row: unknown) {
  const r = (row ?? {}) as Record<string, unknown>;
  const categories = Array.isArray(r.categories) ? r.categories : [];
  const first = categories[0] as Record<string, unknown> | undefined;
  return {
    destinationId: String(r.id ?? ""),
    name: String(r.name ?? ""),
    latitude: typeof r.latitude === "number" ? r.latitude : null,
    longitude: typeof r.longitude === "number" ? r.longitude : null,
    category: first && typeof first.slug === "string" ? first.slug : null,
  };
}

function addMinutes(hhmm: string | null, minutes: number): string {
  const [h, m] = (hhmm ?? "08:00").split(":").map(Number);
  const total = Math.min(23 * 60 + 59, (h ?? 8) * 60 + (m ?? 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function runItineraryToolFlow(input: {
  deps: ChatDeps;
  history: AiMessage[];
  userMessage: string;
  sessionId: string;
  request: TripDetails;
}) {
  const run = input.deps.completeAiChat ?? completeChat;
  const district = extractDistrict(input.userMessage);
  const executeTool = createToolExecutor({
    searchDestinations: input.deps.searchDestinations,
    getDestinationDetails: input.deps.getDestinationDetails,
    defaultCategories: input.request.categories,
    ...(district ? { defaultDistrict: district } : {}),
  });
  const config = resolveAiRoleConfig("tool");
  const tools: AiToolDefinition[] = [
    { type: "function", function: { name: "search_destinations", description: "Search active Padang destinations by keywords, category, or kecamatan (district).", parameters: { type: "object", properties: { keywords: { type: "string" }, categories: { type: "array", items: { type: "string" } }, district: { type: "string", description: "Kecamatan Kota Padang, mis. Padang Barat." } } } } },
    { type: "function", function: { name: "get_destination_details", description: "Get active Padang destination details.", parameters: { type: "object", properties: { destinationId: { type: "string" }, destinationIds: { type: "array", items: { type: "string" } } } } } },
  ];
  const messages: AiMessage[] = [
    ...input.history,
    ...(await ragContextMessage(input.deps, input.userMessage)),
    { role: "user", content: `User request (Padang, single day): ${input.userMessage}\nUse tools to fetch destinations. Required categories: ${input.request.categories.join(", ")}.` },
  ];
  const maxRounds = Math.max(1, Math.min(env.AI_TOOL_MAX_ROUNDS, 10));
  const collected = new Map<string, Record<string, unknown>>();
  let last: Awaited<ReturnType<typeof run>> | null = null;
  // Sum every provider round so usage stays correct if the loop ever runs more than once.
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let round = 0; round < maxRounds; round++) {
    const providerStarted = Date.now();
    try {
      last = await run({ role: "tool", config, messages, tools, toolChoice: "required", sessionId: input.sessionId });
    } catch (err) {
      await chatRepository.appendMessage({
        sessionId: input.sessionId,
        role: "tool",
        content: JSON.stringify({ round, error: err instanceof Error ? err.message : String(err) }),
        mode: "tool",
        model: config.model,
        latencyMs: Date.now() - providerStarted,
        status: "failed",
        errorJson: { message: err instanceof Error ? err.message : String(err) } as any,
        metadata: { round, kind: "provider" },
      });
      throw err;
    }
    const providerLatencyMs = Date.now() - providerStarted;
    usage.inputTokens += last.usage?.promptTokens ?? 0;
    usage.outputTokens += last.usage?.completionTokens ?? 0;
    if (last.toolCalls.length === 0) {
      await chatRepository.appendMessage({
        sessionId: input.sessionId,
        role: "tool",
        content: JSON.stringify({ round, error: "TOOL_CALL_REQUIRED" }),
        mode: "tool",
        model: config.model,
        latencyMs: providerLatencyMs,
        status: "failed",
        errorJson: { code: "TOOL_CALL_REQUIRED" } as any,
        metadata: { round, kind: "provider" },
      });
      throw new HttpError(422, "TOOL_CALL_REQUIRED", "Tool model did not return required tool calls");
    }
    // provider tool-call response (assistant in provider thread); not persisted as DB assistant to keep compat.
    messages.push({
      role: "assistant",
      content: JSON.stringify(last.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments }))),
    } as unknown as AiMessage);

    for (const call of last.toolCalls) {
      const toolStarted = Date.now();
      try {
        const result = await executeTool(call.name, call.arguments);
        const toolLatencyMs = Date.now() - toolStarted;
        // Merge any array result: alias names would otherwise skip the collection.
        if (Array.isArray(result)) mergeDestinationRows(collected, result);
        await chatRepository.appendMessage({
          sessionId: input.sessionId,
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify(result),
          mode: "tool",
          model: config.model,
          latencyMs: toolLatencyMs,
          status: "completed",
          toolCallsJson: [{ id: call.id, name: call.name, arguments: call.arguments }] as any,
          metadata: { name: call.name, arguments: call.arguments, round, kind: "tool_result" } as Prisma.InputJsonValue,
        });
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(result) });
      } catch (err) {
        const toolLatencyMs = Date.now() - toolStarted;
        await chatRepository.appendMessage({
          sessionId: input.sessionId,
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ name: call.name, arguments: call.arguments, error: err instanceof Error ? err.message : String(err) }),
          mode: "tool",
          model: config.model,
          latencyMs: toolLatencyMs,
          status: "failed",
          toolCallsJson: [{ id: call.id, name: call.name, arguments: call.arguments }] as any,
          errorJson: { message: err instanceof Error ? err.message : String(err) } as any,
          metadata: { name: call.name, arguments: call.arguments, round, kind: "tool_result" } as Prisma.InputJsonValue,
        });
        throw err;
      }
    }
    break;
  }
  if (!last) throw new HttpError(502, "AI_UPSTREAM_ERROR", "Tool loop did not complete");

  const candidates = [...collected.values()].map((r) => {
    const row = r as Record<string, unknown>;
    const cats = Array.isArray(row.categories) ? row.categories : [];
    return {
      id: String(row.id), name: String(row.name ?? ""),
      imageUrl: typeof row.imageUrl === "string" && row.imageUrl.trim() ? row.imageUrl : null,
      latitude: (row.latitude as number | null) ?? null, longitude: (row.longitude as number | null) ?? null,
      details: row.details,
      categories: cats.map((c) => (c as Record<string, unknown>).slug).filter((s): s is string => typeof s === "string"),
    };
  }).filter((c) => c.id && c.name && isCoordinate(c));
  const generated = generateItinerary({ city: "Padang", ...input.request, transportMode: "walk" }, candidates);
  if (generated.destinations.length === 0) {
    throw new HttpError(
      422,
      "ITINERARY_REQUEST_INVALID",
      "Tidak ada destinasi yang cocok. Coba sebut kategori (pantai, kuliner, santai, budaya, sejarah, alam, belanja) atau kata kunci lain.",
    );
  }
  return { generated, usage };
}

export function createChatService(deps: ChatDeps) {
  const doClassify = deps.classifyMessage ?? classify;

  /** Picks one friendly phrasing so hardcoded replies stay polite and not robotic. */
  function oneOf(...variants: string[]): string {
    return variants[Math.floor(Math.random() * variants.length)]!;
  }

  async function applyTripTimeChange(input: {
    userId: string;
    sessionId: string;
    content: string;
    sourceMessageId?: string;
    change: TimeChange;
  }): Promise<{ intent: Intent; message: string; version: ItineraryVersionView; usage: Record<string, never> } | null> {
    const gateway = deps.itinerary;
    if (!gateway) return null;
    const active = await gateway.getActiveVersion({ userId: input.userId, sessionId: input.sessionId });
    if (!active || active.stops.length === 0) return null;

    const durations = stopDurations(active.stops);
    let starts: string[];
    let startTime: string;
    let endTime: string;
    if (input.change.endTime == null) {
      // Start-only change shifts the whole schedule; destinations and relative gaps stay put.
      const delta = minutesOf(input.change.startTime) - minutesOf(active.startTime);
      starts = active.stops.map((s) => shiftMinutes(s.arrivalTime ?? active.startTime, delta));
      startTime = input.change.startTime;
      endTime = addMinutes(starts[starts.length - 1]!, durations[durations.length - 1]!);
    } else {
      const next = applyTimeChange(input.change, { startTime: active.startTime, endTime: active.endTime });
      const scheduled = scheduleStops(
        active.stops.map((s, i) => ({
          id: s.destinationId ?? "",
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          durationMin: durations[i]!,
        })),
        next.startTime,
      );
      starts = scheduled.destinations.map((d) => d.startTime);
      startTime = next.startTime;
      endTime = scheduled.endTime;
    }

    const stops: ItineraryVersionStop[] = active.stops.map((s, i) => ({
      position: i + 1,
      destinationId: s.destinationId,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      arrivalTime: starts[i]!,
      visitDurationMin: durations[i]!,
      category: s.category,
    }));

    if (sameStops(active.stops, stops)) {
      return {
        intent: "modify_itinerary",
        message: `Jam trip kamu sudah ${active.startTime}–${active.endTime}, jadi tidak ada yang saya ubah.`,
        version: active,
        usage: {},
      };
    }

    const route = buildRouteJson(
      stops.map((s) => ({ position: s.position, latitude: s.latitude, longitude: s.longitude })),
    );
    const saved = await gateway.saveDraftVersion({
      userId: input.userId,
      sessionId: input.sessionId,
      travelDate: active.travelDate,
      startTime,
      endTime,
      stops,
      routeJson: route.json,
      changeType: "reschedule",
      changeInstruction: input.content,
      basedOnVersion: active.versionNumber,
      sourceMessageId: input.sourceMessageId ?? null,
    });

    return {
      intent: "modify_itinerary",
      message: formatItineraryReply({
        kind: "update",
        ...saved,
        requestedEndTime: input.change.endTime ?? undefined,
      }),
      version: saved,
      usage: {},
    };
  }

  async function applyChatModification(input: {
    userId: string;
    sessionId: string;
    content: string;
    categories: string[];
    sourceMessageId?: string;
    mod: ItineraryModification;
  }): Promise<{ intent: Intent; message: string; version: ItineraryVersionView; usage: Record<string, never> } | null> {
    const gateway = deps.itinerary;
    if (!gateway) return null;
    const active = await gateway.getActiveVersion({ userId: input.userId, sessionId: input.sessionId });
    if (!active) return null;

    if (input.mod.operation === "clarify_modification") {
      return {
        intent: "modify_itinerary",
        message: oneOf(
          "Baik, destinasi mana yang ingin diubah? Sebutkan nomor atau namanya, misal \"ganti destinasi ke-3\" atau \"hapus destinasi ke-3\".",
          "Siap! Mau diganti atau dihapus destinasi itu? Contohnya \"ganti destinasi ke-3\" atau \"hapus destinasi ke-3\".",
        ),
        version: active,
        usage: {},
      };
    }

    if (input.mod.operation === "select_version") {
      const selected = await gateway.selectVersion({
        userId: input.userId,
        sessionId: input.sessionId,
        version: input.mod.version,
      });
      if (!selected) throw new HttpError(422, "VERSION_NOT_FOUND", "Versi trip tidak ditemukan");
      return {
        intent: "modify_itinerary",
        message: formatItineraryReply({ kind: "select", ...selected }),
        version: selected,
        usage: {},
      };
    }

    const rows = await deps.searchDestinations({ categories: input.categories });
    const candidates = rows
      .map(toCandidate)
      .filter((c) => c.destinationId && c.name && isCoordinate(c));
    const scoped = input.mod.operation === "add_destination" ? null : input.mod;
    const target = scoped?.targetLast
      ? active.stops[active.stops.length - 1]
      : scoped?.targetPosition != null
        ? active.stops.find((s) => s.position === scoped.targetPosition)
        : scoped?.targetName
          ? active.stops.find((s) => s.name.toLowerCase() === scoped.targetName!.trim().toLowerCase())
          : undefined;
    const targetCategory = target?.category ?? null;
    const takenIds = new Set(active.stops.map((s) => s.destinationId).filter((id): id is string => id != null));
    const ordered = orderCandidates(
      input.mod.operation === "replace_destination"
        ? candidates.filter((c) => !takenIds.has(c.destinationId))
        : candidates,
      targetCategory,
    );

    let applied: ReturnType<typeof applyModification>;
    try {
      applied = applyModification(
        active.stops.map((s) => ({
          position: s.position,
          destinationId: s.destinationId ?? "",
          name: s.name,
          category: s.category,
        })),
        input.mod,
        ordered,
      );
    } catch (err) {
      if (err instanceof HttpError && err.code === "MODIFY_TARGET_AMBIGUOUS") {
        const needle = (input.mod as { targetName?: string }).targetName?.trim().toLowerCase() ?? "";
        const matches = active.stops.filter((s) => s.name.toLowerCase().includes(needle));
        const list = matches.map((s) => `${s.position}. ${s.name}`).join("; ");
        const verb = input.mod.operation === "remove_destination" ? "hapus" : "ganti";
        return {
          intent: "modify_itinerary",
          message: `Ada beberapa destinasi yang cocok dengan "${needle}": ${list}. Sebutkan nomornya (misal "${verb} destinasi ke-2") atau nama lengkapnya ya.`,
          version: active,
          usage: {},
        };
      }
      if (err instanceof HttpError && err.code === "MODIFY_TARGET_NOT_FOUND") {
        const list = active.stops.map((s) => `${s.position}. ${s.name}`).join("; ");
        return {
          intent: "modify_itinerary",
          message: `Hmm, destinasi itu tidak saya temukan di trip kamu saat ini. Destinasi aktif: ${list}. Sebutkan nomornya (misal "hapus destinasi ke-3") atau nama persisnya ya.`,
          version: active,
          usage: {},
        };
      }
      throw err;
    }

    const pool = new Map<
      string,
      { latitude: number; longitude: number; category: string | null; arrivalTime: string | null; visitDurationMin: number | null }
    >();
    for (const s of active.stops) {
      if (s.destinationId) {
        pool.set(s.destinationId, {
          latitude: s.latitude,
          longitude: s.longitude,
          category: s.category,
          arrivalTime: s.arrivalTime,
          visitDurationMin: s.visitDurationMin,
        });
      }
    }
    for (const c of ordered) {
      if (!pool.has(c.destinationId)) {
        pool.set(c.destinationId, {
          latitude: c.latitude!,
          longitude: c.longitude!,
          category: c.category,
          arrivalTime: null,
          visitDurationMin: 60,
        });
      }
    }

    const activeDurations = stopDurations(active.stops);
    const durationByDestination = new Map(
      active.stops.map((s, i) => [s.destinationId ?? "", activeDurations[i]!] as const),
    );
    const scheduled = scheduleStops(
      applied.stops.map((s) => {
        const geo = pool.get(s.destinationId);
        if (!geo) throw new HttpError(422, "MODIFY_CANDIDATE_MISSING", "Destination details are unavailable");
        return {
          id: s.destinationId,
          name: s.name,
          latitude: geo.latitude,
          longitude: geo.longitude,
          durationMin: durationByDestination.get(s.destinationId) ?? geo.visitDurationMin ?? 60,
        };
      }),
      active.startTime,
    );
    const stops: ItineraryVersionStop[] = scheduled.destinations.map((d, i) => ({
      position: d.order,
      destinationId: d.id,
      name: d.name,
      latitude: d.latitude ?? 0,
      longitude: d.longitude ?? 0,
      arrivalTime: d.startTime,
      visitDurationMin: Math.max(1, minutesOf(d.endTime) - minutesOf(d.startTime)),
      category: applied.stops[i]?.category ?? pool.get(d.id)?.category ?? null,
    }));

    if (sameStops(active.stops, stops)) {
      return {
        intent: "modify_itinerary",
        message: "Trip kamu belum berubah, jadi saya tidak membuat versi baru. Mau ubah yang lain?",
        version: active,
        usage: {},
      };
    }

    const route = buildRouteJson(stops);
    const saved = await gateway.saveDraftVersion({
      userId: input.userId,
      sessionId: input.sessionId,
      travelDate: active.travelDate,
      startTime: active.startTime,
      endTime: scheduled.endTime,
      stops,
      routeJson: route.json,
      changeType: input.mod.operation,
      changeInstruction: input.content,
      basedOnVersion: active.versionNumber,
      sourceMessageId: input.sourceMessageId ?? null,
    });

    return {
      intent: "modify_itinerary",
      message: formatItineraryReply({ kind: "update", ...saved }),
      version: saved,
      usage: {},
    };
  }

  async function computeAssistantReply(input: {
    sessionId: string;
    userId: string;
    content: string;
    history: AiMessage[];
    sourceMessageId?: string;
  }): Promise<{ intent: Intent; message: string; version: ItineraryVersionView | null; usage: { inputTokens?: number; outputTokens?: number } }> {
    // Obvious off-topic (code, politics): fixed decline, zero AI calls/tokens.
    if (isClearlyOffTopic(input.content)) return { intent: "general_chat", message: OFF_TOPIC_REPLY, version: null, usage: {} };
    const classified = await doClassify(input.content, process.env, input.sessionId);
    let intent: Intent = classified.intent;
    let version: ItineraryVersionView | null = null;
    let usage: { inputTokens?: number; outputTokens?: number } = classified.usage
      ? { inputTokens: classified.usage.promptTokens, outputTokens: classified.usage.completionTokens }
      : {};

    // Feedback on the existing trip is a regeneration with fixes, not a missing-detail prompt.
    const isFeedback = intent === "feedback_itinerary";
    if (isFeedback) intent = "regenerate_itinerary";

    const merged = accumulateTripParams(input.history, input.content, new Date());
    // Pengguna menolak sesuatu (kategori/destinasi): jangan pilihkan pengganti sepihak.
    const rejection = handleRejection(input.content, merged.params.categories);
    if (rejection?.kind === "ask") {
      return { intent: "clarify_modification", message: rejection.message, version: null, usage };
    }
    if (rejection) merged.params.categories = rejection.categories;
    const contributes = messageContributesParams(input.content);
    const defersTime = isDeferringTime(input.content);
    const isGeneratorIntent = intent === "generate_itinerary" || intent === "modify_itinerary" || intent === "regenerate_itinerary";
    const wantsItinerary = TRIP_REQUEST.test(input.content);
    // "Rekomendasi kuliner Padang hari ini" sudah membawa parameter sendiri;
    // delegasi + parameter itu cukup untuk menyusun trip tanpa bertanya dulu.
    const hasTripContext =
      merged.pending ||
      merged.params.categories.length > 0 ||
      merged.params.travelDate != null ||
      merged.params.startTime != null;
    const usesTripFlow =
      isGeneratorIntent ||
      (contributes && (merged.pending || wantsItinerary)) ||
      (defersTime && hasTripContext);

    // An existing trip already decides the date and window; reuse them so a follow-up never re-asks.
    const activeTrip = deps.itinerary
      ? await deps.itinerary.getActiveVersion({ userId: input.userId, sessionId: input.sessionId })
      : null;
    if (activeTrip && (isGeneratorIntent || defersTime)) {
      merged.params.travelDate ??= activeTrip.travelDate;
      merged.params.startTime ??= activeTrip.startTime;
      merged.params.endTime ??= activeTrip.endTime;
      // Feedback asks for a better mix; searching unfiltered is what fixes "makan terus".
      if (isFeedback) merged.params.categories = [];
    }

    const modification = parseModification(input.content);
    const isModificationIntent =
      intent === "modify_itinerary" ||
      intent === "replace_destination" ||
      intent === "remove_destination" ||
      intent === "add_destination" ||
      intent === "select_itinerary_version" ||
      intent === "clarify_modification";
    if (modification && isModificationIntent && deps.itinerary) {
      const applied = await applyChatModification({
        userId: input.userId,
        sessionId: input.sessionId,
        content: input.content,
        categories: merged.params.categories,
        sourceMessageId: input.sourceMessageId,
        mod: modification,
      });
      if (applied) return { intent: applied.intent, message: applied.message, version: applied.version, usage };
    }

    // Classifier says "change a destination" but the parser found no target: ask, never regenerate.
    const destinationIntent =
      intent === "replace_destination" ||
      intent === "remove_destination" ||
      intent === "add_destination" ||
      intent === "select_itinerary_version" ||
      intent === "clarify_modification";
    if (!modification && destinationIntent && deps.itinerary) {
      const active = await deps.itinerary.getActiveVersion({ userId: input.userId, sessionId: input.sessionId });
      if (active) {
        return {
          intent: "modify_itinerary",
          message: oneOf(
            "Baik, destinasi mana yang ingin diubah? Sebutkan nomor atau namanya, misal \"ganti destinasi ke-2\" atau \"hapus destinasi ke-2\".",
            "Siap! Mau diganti atau dihapus destinasi yang mana? Contohnya \"ganti destinasi ke-2\" atau \"hapus destinasi ke-2\".",
          ),
          version: active,
          usage,
        };
      }
    }

    // A time change on an existing trip keeps the destinations and rebuilds the schedule.
    const timeChange = parseTimeChange(input.content);
    if (timeChange && !modification && !TRIP_REQUEST.test(input.content) && deps.itinerary) {
      const changed = await applyTripTimeChange({
        userId: input.userId,
        sessionId: input.sessionId,
        content: input.content,
        sourceMessageId: input.sourceMessageId,
        change: timeChange,
      });
      if (changed) return { intent: changed.intent, message: changed.message, version: changed.version, usage };
    }

    // Target-less "ganti dong" must never rewrite the trip.
    if (BARE_MODIFICATION.test(input.content) && deps.itinerary) {
      const active = await deps.itinerary.getActiveVersion({ userId: input.userId, sessionId: input.sessionId });
      if (active) {
        return {
          intent: "modify_itinerary",
          message: oneOf(
            "Baik, destinasi mana yang ingin diubah? Sebutkan nomor atau namanya, misal \"ganti destinasi ke-3\" atau \"hapus destinasi ke-3\".",
            "Siap! Mau diganti atau dihapus destinasi itu? Contohnya \"ganti destinasi ke-3\" atau \"hapus destinasi ke-3\".",
          ),
          version: active,
          usage,
        };
      }
    }

    if (wantsMultipleItineraries(input.content) && isGeneratorIntent) {
      return { intent, message: ONE_TRIP_PER_CHAT, version: null, usage };
    }

    // Missing details: ask once per field; a later "terserah" fills that field instead of re-asking.
    let assumedCategories: string[] | null = null;
    let assumedTime: { startTime: string; endTime: string } | null = null;
    if (usesTripFlow) {
      // Delegasi ("terserah", "kamu tentukan saja") cukup untuk mengisi field
      // kosong selama sudah ada konteks trip sebelumnya. Tanpa syarat ini,
      // balasan model yang memparafrase pertanyaan membuat user terjebak
      // menjawab berulang tanpa trip pernah dibuat.
      const delegatedCategory =
        defersTime && (askedBefore(input.history, ASK_CATEGORY_MARKS) || hasTripContext);
      const delegatedTime =
        defersTime && (askedBefore(input.history, ASK_TIME_MARKS) || hasTripContext);
      if (merged.params.categories.length === 0 && delegatedCategory) {
        merged.params.categories = await pickCategories(deps);
        assumedCategories = merged.params.categories;
      }
      if (merged.params.startTime == null && delegatedTime) {
        assumedTime = defaultTimeRange(merged.params.categories);
        merged.params.startTime = assumedTime.startTime;
        merged.params.endTime = assumedTime.endTime;
      }
      // Feedback deliberately drops the category filter to broaden the mix, so it is never "missing".
      const missingCategory = merged.params.categories.length === 0 && !isFeedback;
      const missingTime = merged.params.startTime == null;
      if (missingCategory || missingTime) {
        const message = missingCategory && missingTime ? ASK_DETAILS : missingCategory ? ASK_CATEGORY : ASK_TIME;
        return { intent: "missing_information", message, version: null, usage };
      }
    }
    const outcome = resolveEffectiveRequest(merged.params);

    // Non-generator turns that only "look like" trip params (e.g. "cuaca di bogor hari ini") may get no tool call; answer naturally instead of erroring.
    const result = usesTripFlow && outcome.kind === "ready"
      ? await runItineraryToolFlow({ deps, history: input.history, userMessage: input.content, sessionId: input.sessionId, request: outcome.trip })
        .catch((err: unknown) => {
          if (!isGeneratorIntent && err instanceof HttpError && err.code === "TOOL_CALL_REQUIRED") return null;
          throw err;
        })
      : null;
    if (result && outcome.kind === "ready") {
      if (!isGeneratorIntent) intent = "modify_itinerary";
      const generated = result.generated;
      usage = {
        inputTokens: (usage.inputTokens ?? 0) + (result.usage.inputTokens ?? 0),
        outputTokens: (usage.outputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      };
      const stops = generatedStops(generated);
      const endTime = generated.endTime ?? outcome.trip.endTime;
      let unchanged = false;
      if (deps.itinerary) {
        const active = activeTrip;
        if (active && active.travelDate === outcome.trip.travelDate && sameStops(active.stops, stops)) {
          version = active;
          unchanged = true;
        } else {
          const route = buildRouteJson(
            stops.map((s) => ({ position: s.position, latitude: s.latitude, longitude: s.longitude })),
          );
          version = await deps.itinerary.saveDraftVersion({
            userId: input.userId,
            sessionId: input.sessionId,
            travelDate: outcome.trip.travelDate,
            startTime: outcome.trip.startTime,
            endTime,
            stops,
            routeJson: route.json,
            changeType: merged.pending ? "regenerate" : "generate",
            sourceMessageId: input.sourceMessageId ?? null,
          });
        }
      }
      const defaults: string[] = [];
      if (merged.params.travelDate == null) defaults.push(`tanggal hari ini (${outcome.trip.travelDate})`);
      if (merged.params.startTime == null) defaults.push(`rekomendasi jam ${outcome.trip.startTime}-${endTime}`);
      if (assumedCategories) defaults.push(`kategori pilihan saya (${assumedCategories.join(", ")})`);
      if (assumedTime) defaults.push(`rekomendasi jam ${assumedTime.startTime}-${endTime}`);
      const message = formatItineraryReply({
        kind: unchanged ? "select" : "generate",
        versionNumber: version?.versionNumber ?? 1,
        travelDate: outcome.trip.travelDate,
        startTime: outcome.trip.startTime,
        endTime,
        stops: version?.stops ?? stops,
        defaults,
        adjustment: isFeedback
          ? "saya seimbangkan kategorinya dan urutkan ulang rutenya biar tidak makan terus"
          : undefined,
        requestedCount: generated.requestedCount,
        actualCount: generated.actualCount,
        requestedEndTime: merged.params.endTime != null ? outcome.trip.endTime : undefined,
      });
      return { intent, message, version, usage };
    } else {
      const hint = intent === "general_chat" ? undefined : "Beberapa detail perjalanan belum lengkap (kategori, tanggal, atau jam). Tanyakan detail yang kurang dengan ramah, jangan menjanjikan sedang mencari atau menyusun apa pun.";
      if (intent !== "general_chat") intent = "missing_information";
      const answer = await generateNaturalReply(deps, {
        userMessage: input.content,
        history: input.history,
        hint,
        sessionId: input.sessionId,
      });
      const generatedUsage = {
        inputTokens: (usage.inputTokens ?? 0) + (answer.usage.inputTokens ?? 0),
        outputTokens: (usage.outputTokens ?? 0) + (answer.usage.outputTokens ?? 0),
      };
      return { intent, message: answer.message, version, usage: generatedUsage };
    }
  }

  return {
    async createSession(input: { userId: string; title?: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const modelId = await resolveSystemModelId();
      return { data: await chatRepository.createSession({ userId: input.userId, modelId, title: input.title?.trim() || "New chat" }) };
    },

    async listSessions(input: { userId: string; page: number; limit: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      return chatRepository.listSessions(input);
    },

    async getSession(input: { userId: string; sessionId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const session = await requireOwnedSession(input.userId, input.sessionId);
      return { data: session };
    },

    async updateSession(input: { userId: string; sessionId: string; title?: string; summary?: string | null; status?: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      await requireOwnedSession(input.userId, input.sessionId);
      const updated = await chatRepository.updateSession({
        id: input.sessionId,
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      return { data: updated };
    },

    async deleteSession(input: { userId: string; sessionId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const session = await chatRepository.findSessionByIdRaw(input.sessionId);
      if (!session) throw new HttpError(404, "SESSION_NOT_FOUND", "Chat session not found");
      if (session.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Session access denied");
      if (session.deletedAt == null) await chatRepository.deleteSession(input.sessionId);
      return { data: { deleted: true } };
    },

    async listMessages(input: {
      userId: string;
      sessionId: string;
      page: number;
      limit: number;
      after_position?: number;
      afterPosition?: number;
    }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      await requireOwnedSession(input.userId, input.sessionId);
      const afterPosition = input.after_position ?? input.afterPosition;
      if (afterPosition !== undefined) {
        return chatRepository.listMessagesKeyset({ sessionId: input.sessionId, afterPosition, limit: input.limit });
      }
      return chatRepository.listMessages({ sessionId: input.sessionId, page: input.page, limit: input.limit });
    },

    async sendMessage(input: { userId: string; sessionId: string; content: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const session = await requireOwnedSession(input.userId, input.sessionId);
      const userMessage = await chatRepository.insertMessage({ sessionId: session.id, role: "user", content: input.content, metadata: {}, status: "completed" });
      const historyRows = await chatRepository.findRecentMessages(session.id, HISTORY_LIMIT);
      const history = buildConversationContext({ systemPrompt: SYSTEM_PROMPT, history: asAiHistory(historyRows) });

      const { intent, message, version, usage } = await computeAssistantReply({
        sessionId: session.id,
        userId: input.userId,
        content: input.content,
        history,
        sourceMessageId: userMessage.id,
      });

      const saved = await chatRepository.appendMessage({
        sessionId: session.id,
        modelId: session.modelId,
        role: "assistant",
        content: message,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        metadata: { intent, versionId: version?.versionId ?? null },
        status: "completed",
        mode: "chat",
      });

      const mapPoints = (version?.stops ?? [])
        .filter((s) => s.destinationId != null && isCoordinate(s))
        .map((s) => ({
          position: s.position,
          destinationId: s.destinationId ?? "",
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
        }));

      return {
        data: {
          message,
          intent,
          version,
          map: version ? { versionId: version.versionId, points: mapPoints } : null,
          assistantMessageId: saved.id,
          sessionId: session.id,
          usage: { inputTokens: saved.inputTokens, outputTokens: saved.outputTokens },
        },
      };
    },

    async regenerateMessage(input: { userId: string; messageId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const msg = await chatRepository.findMessageById(input.messageId);
      if (!msg) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Chat message not found");
      if (msg.session.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Message access denied");
      if (msg.role !== "assistant") throw new HttpError(422, "REGENERATE_TARGET_INVALID", "Only assistant messages can be regenerated");

      const prior = await chatRepository.listMessagesUpToPosition(msg.sessionId, msg.position);
      const trigger = [...prior].reverse().find((m) => m.role === "user");
      if (!trigger) throw new HttpError(422, "REGENERATE_CONTEXT_MISSING", "No user message found to regenerate from");

      const historyRows = prior.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
      const history = buildConversationContext({ systemPrompt: SYSTEM_PROMPT, history: asAiHistory(historyRows) });

      const prevInput = Number.isFinite(msg.inputTokens) ? Number(msg.inputTokens) : 0;
      const prevOutput = Number.isFinite(msg.outputTokens) ? Number(msg.outputTokens) : 0;
      const currentState = {
        versionsJson: msg.versionsJson as unknown,
        activeVersion: msg.activeVersion,
        content: msg.content,
        status: msg.status,
        model: msg.model,
        latencyMs: msg.latencyMs,
        errorJson: msg.errorJson as unknown,
        toolCallsJson: msg.toolCallsJson as unknown,
        inputTokens: prevInput,
        outputTokens: prevOutput,
        metadata: msg.metadata as unknown,
      };

      try {
        const { intent, message, version, usage } = await computeAssistantReply({
          sessionId: msg.sessionId,
          userId: input.userId,
          content: trigger.content,
          history,
          sourceMessageId: trigger.id,
        });
        const inTok = usage.inputTokens ?? 0;
        const outTok = usage.outputTokens ?? 0;
        const next: MessageVersion = {
          version: 0,
          content: message,
          status: "completed",
          createdAt: new Date().toISOString(),
          metadata: { intent, versionId: version?.versionId ?? null },
          usage: { promptTokens: inTok, completionTokens: outTok, totalTokens: inTok + outTok },
          inputTokens: inTok,
          outputTokens: outTok,
        };
        const appended = appendVersion(currentState as any, next);
        const saved = await chatRepository.updateMessageVersionState({
          messageId: msg.id,
          sessionId: msg.sessionId,
          content: appended.content,
          status: appended.status,
          model: (appended.model as string | null | undefined) ?? null,
          latencyMs: (appended.latencyMs as number | null | undefined) ?? null,
          errorJson: (appended.errorJson ?? null) as Prisma.InputJsonValue | null,
          toolCallsJson: (appended.toolCallsJson ?? null) as Prisma.InputJsonValue | null,
          metadata: (appended.metadata ?? {}) as Prisma.InputJsonValue,
          versionsJson: appended.versionsJson as unknown as Prisma.InputJsonValue,
          activeVersion: appended.activeVersion,
          inputTokens: appended.inputTokens,
          outputTokens: appended.outputTokens,
          deltaInputTokens: inTok,
          deltaOutputTokens: outTok,
        });
        return {
          data: {
            assistantMessageId: saved.id,
            sessionId: msg.sessionId,
            message,
            intent,
            version,
            activeVersion: saved.activeVersion,
            usage: { inputTokens: inTok, outputTokens: outTok },
          },
        };
      } catch (err) {
        const versions = Array.isArray(msg.versionsJson) ? ([...(msg.versionsJson as MessageVersion[])]) : [];
        const failed: MessageVersion = {
          version: versions.length + 1,
          content: "",
          status: "failed",
          createdAt: new Date().toISOString(),
          errorJson: { message: err instanceof Error ? err.message : String(err), code: (err as any)?.code },
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          inputTokens: 0,
          outputTokens: 0,
        };
        const versionsJson = [...versions, failed];
        await chatRepository.updateMessageVersionState({
          messageId: msg.id,
          sessionId: msg.sessionId,
          content: msg.content,
          status: msg.status,
          model: msg.model,
          latencyMs: msg.latencyMs,
          errorJson: (msg.errorJson ?? null) as Prisma.InputJsonValue | null,
          toolCallsJson: (msg.toolCallsJson ?? null) as Prisma.InputJsonValue | null,
          metadata: (msg.metadata ?? {}) as Prisma.InputJsonValue,
          versionsJson: versionsJson as unknown as Prisma.InputJsonValue,
          activeVersion: msg.activeVersion,
          inputTokens: prevInput,
          outputTokens: prevOutput,
          deltaInputTokens: 0,
          deltaOutputTokens: 0,
        });
        throw err;
      }
    },

    async listMessageVersions(input: { userId: string; messageId: string }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const msg = await chatRepository.findMessageById(input.messageId);
      if (!msg) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Chat message not found");
      if (msg.session.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Message access denied");
      const versions = Array.isArray(msg.versionsJson) ? msg.versionsJson : [];
      return {
        data: {
          messageId: msg.id,
          sessionId: msg.sessionId,
          activeVersion: msg.activeVersion,
          versions,
          versionsJson: versions,
        },
      };
    },

    async activateMessageVersion(input: { userId: string; messageId: string; version: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      const msg = await chatRepository.findMessageById(input.messageId);
      if (!msg) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Chat message not found");
      if (msg.session.userId !== input.userId) throw new HttpError(403, "FORBIDDEN", "Message access denied");
      const versions = Array.isArray(msg.versionsJson) ? (msg.versionsJson as MessageVersion[]) : [];
      const target = versions.find((v) => v.version === input.version);
      if (!target) throw new HttpError(404, "VERSION_NOT_FOUND", "Message version not found");

      const currentState = {
        versionsJson: msg.versionsJson as unknown,
        activeVersion: msg.activeVersion,
        content: msg.content,
        status: msg.status,
        model: msg.model,
        latencyMs: msg.latencyMs,
        errorJson: msg.errorJson as unknown,
        toolCallsJson: msg.toolCallsJson as unknown,
        inputTokens: Number.isFinite(msg.inputTokens) ? Number(msg.inputTokens) : 0,
        outputTokens: Number.isFinite(msg.outputTokens) ? Number(msg.outputTokens) : 0,
        metadata: msg.metadata as unknown,
      };
      const activated = activateVersion(currentState as any, input.version);
      const saved = await chatRepository.updateMessageVersionState({
        messageId: msg.id,
        sessionId: msg.sessionId,
        content: activated.content,
        status: activated.status,
        model: (activated.model as string | null | undefined) ?? null,
        latencyMs: (activated.latencyMs as number | null | undefined) ?? null,
        errorJson: (activated.errorJson ?? null) as Prisma.InputJsonValue | null,
        toolCallsJson: (activated.toolCallsJson ?? null) as Prisma.InputJsonValue | null,
        metadata: (activated.metadata ?? {}) as Prisma.InputJsonValue,
        versionsJson: activated.versionsJson as unknown as Prisma.InputJsonValue,
        activeVersion: activated.activeVersion,
        inputTokens: activated.inputTokens,
        outputTokens: activated.outputTokens,
        deltaInputTokens: 0,
        deltaOutputTokens: 0,
      });
      return {
        data: {
          messageId: saved.id,
          sessionId: msg.sessionId,
          activeVersion: saved.activeVersion,
          content: saved.content,
          status: saved.status,
        },
      };
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
