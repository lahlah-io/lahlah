import { HttpError } from "../../shared/http/errors.js";
import {
  chatCompletionResponseSchema,
  type AiMessage,
  type AiRoleConfig,
  type AiToolCall,
  type AiToolDefinition,
  type CompletionResult,
} from "./schemas.js";

export type AiChatRole = "classifier" | "tool";

type EnvLike = Record<string, string | undefined>;

function pick(shared: string, specific: string): string {
  return (specific || shared || "").trim();
}

function pickEffort(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  return value || fallback;
}

export function resolveAiRoleConfig(role: AiChatRole, source: EnvLike = process.env): AiRoleConfig {
  const sharedBase = pick(source.AI_BASE_URL ?? "", "");
  const sharedKey = pick(source.AI_API_KEY ?? "", "");
  const sharedProvider = pick(source.AI_PROVIDER ?? "", "openai-compatible");
  if (role === "classifier") {
    const model = pick(source.AI_CLASSIFIER_MODEL ?? "", "");
    const baseUrl = pick(sharedBase, source.AI_CLASSIFIER_BASE_URL ?? "");
    const apiKey = pick(sharedKey, source.AI_CLASSIFIER_API_KEY ?? "");
    const provider = pick(sharedProvider, source.AI_CLASSIFIER_PROVIDER ?? "");
    if (!model || !baseUrl || !apiKey) throw new HttpError(503, "AI_NOT_CONFIGURED", "AI classifier is not configured");
    return { baseUrl, apiKey, model, provider, reasoningEffort: pickEffort(source.AI_CLASSIFIER_REASONING_EFFORT, "low") };
  }
  const model = pick(source.AI_TOOL_MODEL ?? "", "");
  const baseUrl = pick(sharedBase, source.AI_TOOL_BASE_URL ?? "");
  const apiKey = pick(sharedKey, source.AI_TOOL_API_KEY ?? "");
  const provider = pick(sharedProvider, source.AI_TOOL_PROVIDER ?? "");
  if (!model || !baseUrl || !apiKey) throw new HttpError(503, "AI_NOT_CONFIGURED", "AI tool model is not configured");
  return { baseUrl, apiKey, model, provider, reasoningEffort: pickEffort(source.AI_TOOL_REASONING_EFFORT, "medium") };
}

function toProviderMessages(messages: AiMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, name: m.name, content: m.content };
    return { role: m.role, content: m.content };
  });
}

function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(502, "AI_UPSTREAM_ERROR", "AI provider returned invalid tool arguments");
  }
}

function normalizeToolCalls(calls: Array<{ id: string; function: { name: string; arguments: string } }>): AiToolCall[] {
  return calls.map((c) => ({ id: c.id, name: c.function.name, arguments: parseToolArguments(c.function.arguments) }));
}

export function normalizeChatCompletionResponse(raw: unknown): CompletionResult {
  const parsed = chatCompletionResponseSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(502, "AI_UPSTREAM_ERROR", "AI provider returned an invalid response");
  const choice = parsed.data.choices?.[0];
  const toolCallsRaw = choice?.message?.tool_calls ?? [];
  return {
    content: choice?.message?.content ?? null,
    toolCalls: toolCallsRaw.length ? normalizeToolCalls(toolCallsRaw) : [],
    finishReason: choice?.finish_reason ?? null,
    usage: parsed.data.usage
      ? {
          promptTokens: parsed.data.usage.prompt_tokens,
          completionTokens: parsed.data.usage.completion_tokens,
          totalTokens: parsed.data.usage.total_tokens,
        }
      : undefined,
  };
}

export async function completeChat(input: {
  role: AiChatRole;
  config: AiRoleConfig;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  toolChoice?: "auto" | "required";
}): Promise<CompletionResult> {
  const url = `${input.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: input.config.model,
    messages: toProviderMessages(input.messages),
  };
  if (input.tools?.length) body.tools = input.tools;
  if (input.toolChoice) body.tool_choice = input.toolChoice;
  if (input.config.reasoningEffort) body.reasoning_effort = input.config.reasoningEffort;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.config.apiKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, "AI_UPSTREAM_ERROR", "AI provider request failed");
  }

  if (!response.ok) {
    // Groq answers tool_choice=required + no tool call with 400 tool_use_failed; failed_generation is never forwarded.
    if (response.status === 400 && input.toolChoice === "required") {
      let code: unknown;
      try {
        code = (JSON.parse(await response.text()) as { error?: { code?: unknown } }).error?.code;
      } catch {
        code = undefined;
      }
      if (code === "tool_use_failed") throw new HttpError(422, "TOOL_CALL_REQUIRED", "AI provider did not return required tool calls");
    }
    const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 502;
    const message = response.status === 429 ? "AI provider rate limit exceeded" : "AI provider request failed";
    // shortcut: upstream body not inspected for safety/size, upgrade if specific provider codes needed.
    throw new HttpError(status, "AI_UPSTREAM_ERROR", message);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new HttpError(502, "AI_UPSTREAM_ERROR", "AI provider returned an invalid response");
  }

  const result = normalizeChatCompletionResponse(json);
  if (input.toolChoice === "required" && result.toolCalls.length === 0) {
    throw new HttpError(422, "TOOL_CALL_REQUIRED", "AI provider did not return required tool calls");
  }
  return result;
}
