import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";
import type { AiMessage, AiRoleConfig } from "../../../integrations/ai/schemas.js";
import { appendLog } from "../../../shared/logging/file-logger.js";

export type AnswererDeps = {
  completeAiChat?: typeof completeChat;
  retrieveRagContext?: (query: string) => Promise<string>;
  resolveConfig?: () => AiRoleConfig;
};

export function buildAnswererSystemPrompt(knowledgeBase: string, hint?: string): string {
  const kb = knowledgeBase
    ? `\n\nKnowledge base of Kota Padang destinations (the only source of destination facts):\n${knowledgeBase}\n`
    : "";
  const hintLine = hint ? `\n\nInstruction: ${hint}\n` : "";
  return `You are Lahlah, a travel assistant for Kota Padang.${kb}${hintLine}
Reply entirely in Indonesian. Keep responses singkat, ramah, and to the point, suitable for a chat window. Call the travel plan a "trip" (never "itinerary"); a trip contains one or more destinasi, and one chat holds exactly one trip. When naming destinations, use only destinations present in the knowledge base; do not invent names. If the question is not about Kota Padang travel, politely decline and redirect to Padang travel topics. Always address the user as "kamu" (never "Anda").`;
}

// Narrow on purpose: false rejects hurt more than a ~450-token model decline. Anything travel-ish goes to the model.
const OFF_TOPIC = /\b(python|javascript|typescript|java|php|sql|html|css|golang|pemrograman|programming|coding|ngoding|presiden|pemilu|pilpres|capres|cawapres|partai|politik)\b/i;
// Weather is only off-topic for another named city; "cuaca besok" in a Padang chat goes to the model.
const OTHER_CITY_WEATHER = /\b(cuaca|weather)\b[^.?!]*\b(jakarta|bandung|surabaya|medan|bali|denpasar|yogyakarta|jogja|semarang|makassar|pekanbaru|palembang)\b/i;
const TRAVEL = /\b(padang|trip|wisata|destinasi|museum|pantai|kuliner|jalan-jalan|liburan)\b/i;

export function isClearlyOffTopic(message: string): boolean {
  return (OFF_TOPIC.test(message) || OTHER_CITY_WEATHER.test(message)) && !TRAVEL.test(message);
}

export const OFF_TOPIC_REPLY =
  "Maaf, saya cuma bisa bantu soal trip dan wisata di Kota Padang. Mau coba? Misalnya \"saya ingin trip kuliner di Padang sore hari\".";

const dateFmt = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Deterministic, friendly summary of a saved itinerary version (no extra AI call, no invented facts). */
export function formatItineraryReply(input: {
  kind: "generate" | "update" | "select";
  versionNumber: number;
  travelDate: string;
  startTime: string;
  endTime: string;
  stops: Array<{ position: number; name: string; arrivalTime: string | null }>;
  defaults?: string[];
}): string {
  const date = dateFmt.format(new Date(`${input.travelDate}T00:00:00Z`));
  const n = input.stops.length;
  const head =
    input.kind === "generate"
      ? `${input.versionNumber > 1 ? "Trip kamu sudah saya susun ulang" : "Siap! Ini trip kamu"} di Padang untuk ${date} (${input.startTime}–${input.endTime}), berisi ${n} destinasi:`
      : input.kind === "update"
        ? `Beres! Trip kamu sudah saya perbarui, sekarang ada ${n} destinasi:`
        : `Oke, trip kamu sekarang pakai versi ${input.versionNumber}, isinya ${n} destinasi:`;
  const list = [...input.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.position}. ${s.arrivalTime ? `${s.arrivalTime} ` : ""}${s.name}`)
    .join("\n");
  const saved = input.kind === "select" ? "Rutenya sudah tampil di peta." : `Sudah tersimpan sebagai versi ${input.versionNumber} trip ini dan tampil di peta.`;
  const note = input.defaults?.length ? `\nCatatan: saya pakai ${input.defaults.join(" dan ")} — kabari kalau mau diubah ya.` : "";
  const next = n > 1 ? `ganti destinasi ke-${n}` : "tambah 1 destinasi";
  return `${head}\n${list}\n\n${saved}${note}\nMau ada yang diubah? Bilang saja, misalnya "${next}" atau "buat ulang".`;
}

/** Domain rule: 1 chat = 1 trip; a trip holds many destinasi and many versions. */
export const ONE_TRIP_PER_CHAT =
  "Di 1 chat saya cuma menyusun 1 trip, tapi trip itu bisa berisi banyak destinasi. Mau alternatif? Bilang \"buat ulang\", nanti tinggal pilih versi yang paling pas. Kalau mau trip yang berbeda, mulai chat baru ya.";

const FALLBACK = "Halo! Saya bisa bantu menyusun trip satu hari di Kota Padang. Ceritakan maunya, misalnya \"saya ingin trip di Padang pada pagi hari\" atau sebutkan kategori seperti pantai, kuliner, atau alam.";

export async function generateNaturalReply(
  deps: AnswererDeps,
  input: { userMessage: string; history: AiMessage[]; hint?: string },
): Promise<{ message: string; usage: { inputTokens?: number; outputTokens?: number } }> {
  const run = deps.completeAiChat ?? completeChat;
  let kbJson = "";
  if (deps.retrieveRagContext) {
    try {
      kbJson = await deps.retrieveRagContext(input.userMessage);
    } catch {
      kbJson = "";
    }
  }

  const systemPrompt = buildAnswererSystemPrompt(kbJson, input.hint);
  try {
    const config = deps.resolveConfig ? deps.resolveConfig() : resolveAiRoleConfig("tool");
    const result = await run({
      role: "tool",
      config,
      messages: [
        { role: "system", content: systemPrompt },
        ...input.history,
        { role: "user", content: input.userMessage },
      ],
    });
    const text = result.content?.trim();
    if (!text) return { message: FALLBACK, usage: {} };
    return {
      message: text,
      usage: result.usage ? { inputTokens: result.usage.promptTokens, outputTokens: result.usage.completionTokens } : {},
    };
  } catch (err) {
    appendLog("chat", {
      kind: "answerer_error",
      input: input.userMessage,
      error: err instanceof Error ? err.message : String(err),
    });
    return { message: FALLBACK, usage: {} };
  }
}
