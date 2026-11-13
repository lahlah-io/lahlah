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
Reply entirely in Indonesian. Keep responses singkat, ramah, and to the point, suitable for a chat window. When naming destinations, use only destinations present in the knowledge base; do not invent names. If the question is not about Kota Padang travel, politely decline and redirect to Padang travel topics.`;
}

const FALLBACK = "Halo! Saya bisa bantu menyusun itinerary satu hari di Kota Padang. Sebutkan kategori wisata yang kamu suka, misalnya pantai, kuliner, atau alam.";

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
