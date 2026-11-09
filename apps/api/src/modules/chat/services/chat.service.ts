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
const SYSTEM_PROMPT =
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

function parseTripDetails(text: string): TripDetails | null {
  const date = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  const times = [...text.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map((m) => `${m[1]}:${m[2]}`);
  const startTime = times[0];
  const endTime = times[1];
  const categories: string[] = [];
  const t = text.toLowerCase();
  if (t.includes("pantai")) categories.push("seed-pantai");
  if (t.includes("budaya")) categories.push("seed-budaya");
  if (t.includes("sejarah")) categories.push("seed-sejarah");
  if (t.includes("alam")) categories.push("seed-alam");
  if (t.includes("kuliner") || t.includes("makan")) categories.push("seed-kuliner");
  if (!date || !startTime || !endTime || categories.length === 0) return null;
  return { travelDate: date, startTime, endTime, categories };
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
    // backend builds draft after at least one tool result; keep loop bounded for orchestration.
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

    async listMessages(input: { userId: string; sessionId: string; page: number; limit: number }) {
      productionGate();
      await requireActiveUser(deps, input.userId);
      await requireOwnedSession(input.userId, input.sessionId);
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
        // greeting/general chat: no provider answer call required; confirm is explicit endpoint in Task 9.
        message = intent === "confirm_itinerary"
          ? "Untuk menyimpan itinerary, gunakan aksi konfirmasi draft yang tersedia."
          : "Halo! Saya bisa bantu buat itinerary satu hari di Kota Padang. Sebutkan tanggal, jam mulai-selesai, dan kategori (misalnya pantai atau kuliner).";
      } else if (intent === "generate_itinerary" || intent === "modify_itinerary" || intent === "regenerate_itinerary") {
        const trip = parseTripDetails(input.content);
        if (!trip) {
          intent = "missing_information";
          message = "Mohon sebutkan tanggal (YYYY-MM-DD), jam mulai dan selesai (HH:MM-HH:MM di hari yang sama), serta kategori wisata di Padang.";
        } else {
          const result = await runItineraryToolFlow({ deps, history, userMessage: input.content, sessionId: session.id, request: trip });
          draft = result.draft;
          usage = result.usage;
          const draftId = draftStore.replaceSessionDraft({ userId: input.userId, sessionId: session.id, itinerary: draft });
          draft = draftStore.getDraft({ draftId, userId: input.userId, sessionId: session.id });
          message = `Draft itinerary ${draft.travelDate} untuk ${draft.destinations.length} destinasi di Padang siap dikonfirmasi.`;
        }
      } else {
        intent = "missing_information";
        message = "Bisa jelaskan rencana Anda? Untuk itinerary, saya butuh tanggal, jam mulai-selesai, dan kategori wisata di Padang.";
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
