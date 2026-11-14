import type { Prisma } from "../../../generated/prisma/client.js";
import { env } from "../../../env.js";
import { HttpError } from "../../../shared/http/errors.js";
import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";
import type { AiMessage, AiToolDefinition } from "../../../integrations/ai/schemas.js";
import { classify, type Intent } from "./classifier.js";
import { formatItineraryReply, generateNaturalReply, isClearlyOffTopic, OFF_TOPIC_REPLY, ONE_TRIP_PER_CHAT } from "./answerer.js";
import { buildConversationContext } from "./conversation-context.js";
import { generateItinerary } from "./itinerary-generator.js";
import { createToolExecutor, mergeDestinationRows } from "./tools.js";
import { parseModification } from "./modification.js";
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
  "You are a helpful Padang travel assistant. For itinerary requests, you MUST use provided tools to fetch destination data from the database before suggesting places. Return concise Indonesian responses.";

type UserRow = { id: string; isActive: boolean };
type ChatDeps = {
  findUserById: (id: string) => Promise<UserRow | null>;
  classifyMessage?: typeof classify;
  completeAiChat?: typeof completeChat;
  retrieveRagContext?: (query: string) => Promise<string>;
  itinerary?: ItineraryVersionGateway;
  searchDestinations: (input: { keywords?: string; categories?: string[] }) => Promise<unknown[]>;
  getDestinationDetails: (input: { destinationIds: string[] }) => Promise<unknown[]>;
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
  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const named = text.toLowerCase().match(/\b(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|ags|aug|sep(?:t(?:ember)?)?|okt(?:ober)?|oct|nov(?:ember)?|des(?:ember)?|dec)\s+(20\d{2})\b/);
  if (named) {
    const mm = MONTHS[named[2]!];
    if (mm) return `${named[3]}-${mm}-${named[1]!.padStart(2, "0")}`;
  }
  const lower = text.toLowerCase();
  const today = todayYmd(now);
  if (/\bhari ini\b/.test(lower)) return today;
  if (/\bbesok\b/.test(lower)) return addDaysYmd(today, 1);
  if (/\blusa\b/.test(lower)) return addDaysYmd(today, 2);
  // shortcut: named weekdays with no explicit date use today (MVP).
  if (/\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|tanggal)\b/i.test(text)) return today;
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
  if (t.includes("alam")) categories.push("alam");
  if (t.includes("kuliner") || t.includes("makan")) categories.push("kuliner");
  // Vibe words map to "santai" (kafe, tempat duduk lama) because the catalog has no vibe tags.
  if (/\b(sepi|tenang|ngobrol|nongkrong|ngedate|kencan|romantis|santai|chill|kopi|kafe|cafe)\b/.test(t)) {
    categories.push("santai");
  }
  if (t.includes("belanja") || t.includes("shopping")) categories.push("belanja");
  return [...new Set(categories)];
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

export function parseGeneralTimeOfDay(text: string): { startTime: string; endTime: string } | null {
  const lower = text.toLowerCase();
  // shortcut: abaikan bila pengguna sudah menyebut jam eksplisit ("jam 10 pagi" tetap general_time).
  if (/\b(jam|pukul)\b/.test(lower)) return null;
  if (/\b(dini\s*hari)\b/.test(lower)) return { startTime: "00:00", endTime: "05:59" };
  if (/\b(pagi|morning)\b/.test(lower)) return { startTime: "06:00", endTime: "10:59" };
  if (/\b(siang)\b/.test(lower)) return { startTime: "11:00", endTime: "14:59" };
  if (/\b(sore|petang|sunset)\b/.test(lower)) return { startTime: "15:00", endTime: "17:59" };
  if (/\b(malam|night)\b/.test(lower)) return { startTime: "18:00", endTime: "23:59" };
  return null;
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
  return parseFlexibleDate(text, now) !== null
    || parseFlexibleTimeRange(text) !== null
    || parseGeneralTimeOfDay(text) !== null
    || extractCategories(text).length > 0
    || extractDestinationCount(text) != null;
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
      destinationCount: p.destinationCount ?? 8,
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
  const executeTool = createToolExecutor({
    searchDestinations: input.deps.searchDestinations,
    getDestinationDetails: input.deps.getDestinationDetails,
    defaultCategories: input.request.categories,
  });
  const config = resolveAiRoleConfig("tool");
  const tools: AiToolDefinition[] = [
    { type: "function", function: { name: "search_destinations", description: "Search active Padang destinations.", parameters: { type: "object", properties: { keywords: { type: "string" }, categories: { type: "array", items: { type: "string" } } } } } },
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
      last = await run({ role: "tool", config, messages, tools, toolChoice: "required" });
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
        if (call.name === "search_destinations" || call.name === "get_destination_details") {
          mergeDestinationRows(collected, result);
        }
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
    const ordered = orderCandidates(candidates, targetCategory);

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

    const baseArrival = active.stops[active.stops.length - 1]?.arrivalTime ?? active.startTime;
    const stops = applied.stops.map((s) => {
      const geo = pool.get(s.destinationId);
      if (!geo) throw new HttpError(422, "MODIFY_CANDIDATE_MISSING", "Destination details are unavailable");
      const arrivalTime = geo.arrivalTime ?? addMinutes(baseArrival, 60 * Math.max(1, s.position - active.stops.length));
      return {
        position: s.position,
        destinationId: s.destinationId,
        name: s.name,
        latitude: geo.latitude,
        longitude: geo.longitude,
        arrivalTime,
        visitDurationMin: geo.visitDurationMin ?? 60,
        category: s.category ?? geo.category,
      };
    });

    const route = buildRouteJson(stops);
    const saved = await gateway.saveDraftVersion({
      userId: input.userId,
      sessionId: input.sessionId,
      travelDate: active.travelDate,
      startTime: active.startTime,
      endTime: active.endTime,
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

    const merged = accumulateTripParams(input.history, input.content, new Date());
    const outcome = resolveEffectiveRequest(merged.params);
    const contributes = messageContributesParams(input.content);
    const isGeneratorIntent = intent === "generate_itinerary" || intent === "modify_itinerary" || intent === "regenerate_itinerary";
    const wantsItinerary = TRIP_REQUEST.test(input.content);
  const usesTripFlow = isGeneratorIntent || (contributes && (merged.pending || wantsItinerary));

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

    if (wantsMultipleItineraries(input.content) && isGeneratorIntent) {
      return { intent, message: ONE_TRIP_PER_CHAT, version: null, usage };
    }

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
      if (deps.itinerary) {
        const stops = generatedStops(generated);
        const route = buildRouteJson(
          stops.map((s) => ({ position: s.position, latitude: s.latitude, longitude: s.longitude })),
        );
        version = await deps.itinerary.saveDraftVersion({
          userId: input.userId,
          sessionId: input.sessionId,
          travelDate: outcome.trip.travelDate,
          startTime: outcome.trip.startTime,
          endTime: outcome.trip.endTime,
          stops,
          routeJson: route.json,
          changeType: merged.pending ? "regenerate" : "generate",
          sourceMessageId: input.sourceMessageId ?? null,
        });
      }
      const defaults: string[] = [];
      if (merged.params.travelDate == null) defaults.push(`tanggal hari ini (${outcome.trip.travelDate})`);
      if (merged.params.startTime == null) defaults.push(`jam ${outcome.trip.startTime}-${outcome.trip.endTime}`);
      const message = formatItineraryReply({
        kind: "generate",
        versionNumber: version?.versionNumber ?? 1,
        travelDate: outcome.trip.travelDate,
        startTime: outcome.trip.startTime,
        endTime: outcome.trip.endTime,
        stops: version?.stops ?? generatedStops(generated),
        defaults,
      });
      return { intent, message, version, usage };
    } else {
      const hint = intent === "general_chat" ? undefined : "Beberapa detail perjalanan belum lengkap (kategori, tanggal, atau jam). Tanyakan detail yang kurang dengan ramah.";
      if (intent !== "general_chat") intent = "missing_information";
      const answer = await generateNaturalReply(deps, {
        userMessage: input.content,
        history: input.history,
        hint,
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
      await requireOwnedSession(input.userId, input.sessionId);
      await chatRepository.deleteSession(input.sessionId);
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
