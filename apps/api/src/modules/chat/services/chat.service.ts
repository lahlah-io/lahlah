import { env } from "../../../env.js";
import { HttpError } from "../../../shared/http/errors.js";
import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";
import type { AiMessage, AiToolDefinition } from "../../../integrations/ai/schemas.js";
import { classify, type Intent } from "./classifier.js";
import { buildConversationContext } from "./conversation-context.js";
import { generateItinerary } from "./itinerary-generator.js";
import { createDraftStore, type ItineraryDraftResponse } from "./draft-store.js";
import { createToolExecutor } from "./tools.js";
import * as chatRepository from "../repositories/chat.repository.js";

const HISTORY_LIMIT = 20;
export const SYSTEM_PROMPT =
  "You are a helpful Padang travel assistant. For itinerary requests, you MUST use provided tools to fetch destination data from the database before suggesting places. Return concise Indonesian responses.";

type UserRow = { id: string; isActive: boolean };
type ChatDeps = {
  findUserById: (id: string) => Promise<UserRow | null>;
  classifyMessage?: typeof classify;
  completeAiChat?: typeof completeChat;
  draftStore?: ReturnType<typeof createDraftStore>;
  searchDestinations: (input: { keywords?: string; categories?: string[] }) => Promise<unknown[]>;
  getDestinationDetails: (input: { destinationIds: string[] }) => Promise<unknown[]>;
};

type TripDetails = { travelDate: string; startTime: string; endTime: string; categories: string[] };

function mapUsage(raw: unknown): { inputTokens?: number; outputTokens?: number } {
  // shortcut: completeChat normalizer does not expose usage yet; keep optional.
  void raw;
  return {};
}

function asAiHistory(rows: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  return rows.filter((r): r is { role: "user" | "assistant"; content: string } => r.role !== "system");
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

const GENERAL_TIME_SUGGESTION = `Waktu belum disebutkan. Berikut acuan umum:
1. Kencan Siang / Sore (Weekend / Hari Libur)
• Waktu Ideal: Pukul 13.00 – 17.00
• Suasana: Santai, kasual, dan ramah untuk mengobrol panjang.
• Aktivitas Populer:
• Nongkrong di coffee shop estetik.
• Jalan-jalan di dalam mall atau mengunjungi museum/galeri seni.
• Piknik sore di taman kota saat matahari sudah tidak terlalu terik (mulai jam 15.30).
2. Kencan Malam (Weeknight / Weekend)
• Waktu Ideal: Pukul 18.30 – 21.30
• Suasana: Lebih romantis, intim, dan suasananya cenderung lebih tenang.
• Aktivitas Populer:
• Makan malam romantis (dinner date) di restoran.
• Menonton bioskop atau jalan-jalan santai menikmati lampu kota.
• Night ride santai sambil mencari camilan malam.
Sebutkan juga tanggal, jam mulai-selesai, dan kategori wisata di Padang jika ingin dibuatkan itinerary draft.`;

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

export function extractCategories(text: string): string[] {
  const categories: string[] = [];
  const t = text.toLowerCase();
  if (t.includes("pantai")) categories.push("seed-pantai");
  if (t.includes("budaya")) categories.push("seed-budaya");
  if (t.includes("sejarah")) categories.push("seed-sejarah");
  if (t.includes("alam")) categories.push("seed-alam");
  if (t.includes("kuliner") || t.includes("makan")) categories.push("seed-kuliner");
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

export function analyzeTripRequest(text: string, now = new Date()): TripParseOutcome {
  const travelDate = parseFlexibleDate(text, now);
  const time = parseFlexibleTimeRange(text);
  const categories = extractCategories(text);
  if (travelDate && time && categories.length > 0) return { kind: "ready", trip: { travelDate, startTime: time.startTime, endTime: time.endTime, categories } };
  if (!time) return { kind: "general_time", dateHint: travelDate, categories };
  return { kind: "missing", dateHint: travelDate, timeHint: time, categories };
}

function toDraftResponse(input: {
  sessionId: string;
  request: TripDetails;
  generated: ReturnType<typeof generateItinerary>;
}): ItineraryDraftResponse {
  return {
    draftId: "pending",
    status: "pending_confirmation",
    travelDate: input.request.travelDate,
    startTime: input.request.startTime,
    endTime: input.request.endTime,
    destinations: input.generated.destinations.map((d) => ({
      order: d.order,
      destinationId: d.id,
      name: d.name,
      latitude: d.latitude ?? 0,
      longitude: d.longitude ?? 0,
      visitAt: d.startTime,
      durationMinutes: Math.max(1, (() => {
        const [sh, sm] = d.startTime.split(":").map(Number);
        const [eh, em] = d.endTime.split(":").map(Number);
        return (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0));
      })()),
    })),
    route: input.generated.route,
  };
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
  });
  const config = resolveAiRoleConfig("tool");
  const tools: AiToolDefinition[] = [
    { type: "function", function: { name: "search_destinations", description: "Search active Padang destinations.", parameters: { type: "object", properties: { keywords: { type: "string" }, categories: { type: "array", items: { type: "string" } } } } } },
    { type: "function", function: { name: "get_destination_details", description: "Get active Padang destination details.", parameters: { type: "object", properties: { destinationId: { type: "string" }, destinationIds: { type: "array", items: { type: "string" } } } } } },
  ];
  const messages: AiMessage[] = [
    ...input.history,
    { role: "user", content: `User request (Padang, single day): ${input.userMessage}\nUse tools to fetch destinations. Required categories: ${input.request.categories.join(", ")}.` },
  ];
  const maxRounds = Math.max(1, Math.min(env.AI_TOOL_MAX_ROUNDS, 10));
  let structured: unknown[] = [];
  let last: Awaited<ReturnType<typeof run>> | null = null;

  for (let round = 0; round < maxRounds; round++) {
    last = await run({ role: "tool", config, messages, tools, toolChoice: "required" });
    if (last.toolCalls.length === 0) throw new HttpError(422, "TOOL_CALL_REQUIRED", "Tool model did not return required tool calls");
    messages.push({
      role: "assistant",
      content: JSON.stringify(last.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments }))),
    } as unknown as AiMessage);
    for (const call of last.toolCalls) {
      const result = await executeTool(call.name, call.arguments);
      if (call.name === "search_destinations" || call.name === "get_destination_details") structured = Array.isArray(result) ? result : structured;
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(result) });
    }
    break;
  }
  if (!last) throw new HttpError(502, "AI_UPSTREAM_ERROR", "Tool loop did not complete");

  const candidates = structured.map((r) => {
    const row = r as Record<string, unknown>;
    return { id: String(row.id), name: String(row.name ?? ""), latitude: (row.latitude as number | null) ?? null, longitude: (row.longitude as number | null) ?? null, details: row.details };
  }).filter((c) => c.id && c.name);
  const generated = generateItinerary({ city: "Padang", ...input.request, transportMode: "walk" }, candidates);
  if (generated.destinations.length === 0) throw new HttpError(422, "ITINERARY_REQUEST_INVALID", "No valid destinations available for this request");
  const draft = toDraftResponse({ sessionId: input.sessionId, request: input.request, generated });
  return { draft, usage: mapUsage(last) };
}

export function createChatService(deps: ChatDeps) {
  const draftStore = deps.draftStore ?? createDraftStore();
  const doClassify = deps.classifyMessage ?? classify;

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
      await chatRepository.insertMessage({ sessionId: session.id, role: "user", content: input.content, metadata: {} });
      const historyRows = await chatRepository.findRecentMessages(session.id, HISTORY_LIMIT);
      const history = buildConversationContext({ systemPrompt: SYSTEM_PROMPT, history: asAiHistory(historyRows) });

      const classified = await doClassify(input.content, process.env);
      let intent: Intent = classified.intent;
      let message = "Ada yang bisa saya bantu untuk rencana perjalanan di Padang?";
      let draft: ItineraryDraftResponse | null = null;
      let usage: { inputTokens?: number; outputTokens?: number } = {};

      if (intent === "general_chat" || intent === "confirm_itinerary") {
        // greeting/general chat: no provider answer call required; 
        message = intent === "confirm_itinerary"
          ? "Untuk menyimpan itinerary, gunakan aksi konfirmasi draft yang tersedia."
          : "Halo! Saya bisa bantu buat itinerary satu hari di Kota Padang. Sebutkan tanggal, jam mulai-selesai, dan kategori (misalnya pantai atau kuliner).";
      } else if (intent === "generate_itinerary" || intent === "modify_itinerary" || intent === "regenerate_itinerary") {
        const trip = analyzeTripRequest(input.content);
        if (trip.kind === "ready") {
          const result = await runItineraryToolFlow({ deps, history, userMessage: input.content, sessionId: session.id, request: trip.trip });
          draft = result.draft;
          usage = result.usage;
          const draftId = draftStore.replaceSessionDraft({ userId: input.userId, sessionId: session.id, itinerary: draft });
          draft = draftStore.getDraft({ draftId, userId: input.userId, sessionId: session.id });
          message = `Draft itinerary ${draft.travelDate} untuk ${draft.destinations.length} destinasi di Padang siap dikonfirmasi.`;
        } else if (trip.kind === "general_time") {
          intent = "missing_information";
          const catHint = trip.categories.length ? `Kategori terdeteksi. ` : `Sebutkan juga kategori wisata di Padang (misalnya pantai, budaya, kuliner, alam, sejarah). `;
          message = (trip.dateHint ? `Tanggal terdeteksi ${trip.dateHint}. ` : `Tanggal bisa pakai hari ini (${todayYmd()}) jika belum lengkap. `) + catHint + GENERAL_TIME_SUGGESTION;
        } else {
          intent = "missing_information";
          const parts: string[] = [];
          if (trip.dateHint) parts.push(`tanggal ${trip.dateHint}`);
          if (trip.timeHint) parts.push(`jam ${trip.timeHint.startTime}-${trip.timeHint.endTime}`);
          if (trip.categories.length) parts.push(`kategori terdeteksi`);
          const known = parts.length ? `Saya menangkap ${parts.join(", ")}. ` : "";
          const need: string[] = [];
          if (!trip.dateHint) need.push("tanggal (YYYY-MM-DD; jika tidak lengkap dipakai tanggal hari ini)");
          if (!trip.timeHint) need.push("jam mulai-selesai (HH:MM-HH:MM)");
          if (trip.categories.length === 0) need.push("kategori (pantai, budaya, kuliner, alam, sejarah, santai, belanja)");
          message = `${known}Untuk membuat draft itinerary Padang, mohon lengkapi: ${need.join(", ")}.`;
        }
      } else {
        intent = "missing_information";
        const travelContext = /\b(perjalanan|jalan-jalan|liburan|wisata|trip|travel|itinerary|padang|kencan|date)\b/i.test(input.content);
        if (travelContext) {
          const trip = analyzeTripRequest(input.content);
          if (trip.kind === "general_time") {
            const catHint = trip.categories.length ? `Kategori terdeteksi. ` : ``;
            message = (trip.dateHint ? `Tanggal terdeteksi ${trip.dateHint}. ` : ``) + catHint + GENERAL_TIME_SUGGESTION;
          } else if (trip.kind === "missing") {
            const parts: string[] = [];
            if (trip.dateHint) parts.push(`tanggal ${trip.dateHint}`);
            if (trip.timeHint) parts.push(`jam ${trip.timeHint.startTime}-${trip.timeHint.endTime}`);
            if (trip.categories.length) parts.push(`kategori terdeteksi`);
            const known = parts.length ? `Saya menangkap ${parts.join(", ")}. ` : "";
            const need: string[] = [];
            if (!trip.timeHint) need.push("jam mulai-selesai (HH:MM-HH:MM; jika belum, bisa pakai acuan umum siang/sore 13.00–17.00 atau malam 18.30–21.30)");
            if (!trip.dateHint) need.push("tanggal (YYYY-MM-DD; jika tidak lengkap dipakai tanggal hari ini)");
            if (trip.categories.length === 0) need.push("kategori (pantai, budaya, kuliner, alam, sejarah, santai, belanja)");
            message = `${known}Untuk draft itinerary Padang, mohon lengkapi: ${need.join(", ")}.`;
          } else {
            message = "Bisa jelaskan rencana Anda? Untuk itinerary, saya butuh tanggal, jam mulai-selesai, dan kategori wisata di Padang.";
          }
        } else {
          message = "Bisa jelaskan rencana Anda? Untuk itinerary, saya butuh tanggal, jam mulai-selesai, dan kategori wisata di Padang.";
        }
      }

      const saved = await chatRepository.insertMessage({
        sessionId: session.id,
        modelId: session.modelId,
        role: "assistant",
        content: message,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        metadata: { intent, draftId: draft?.draftId ?? null },
      });

      return {
        data: {
          message,
          intent,
          draft,
          assistantMessageId: saved.id,
          sessionId: session.id,
        },
      };
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
