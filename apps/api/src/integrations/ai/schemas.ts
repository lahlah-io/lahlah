import { z } from "zod";

export type AiRole = "system" | "user" | "assistant" | "tool";

export type AiMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type AiToolDefinition = {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
};

export type AiToolCall = { id: string; name: string; arguments: unknown };

export type CompletionResult = {
  content: string | null;
  toolCalls: AiToolCall[];
  finishReason: string | null;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export type AiRoleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
};

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function").optional(),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

const messageSchema = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z.array(toolCallSchema).optional(),
});

const choiceSchema = z.object({
  message: messageSchema.optional(),
  finish_reason: z.string().nullable().optional(),
});

const usageSchema = z.object({
  prompt_tokens: z.number().int(),
  completion_tokens: z.number().int(),
  total_tokens: z.number().int(),
});

export const chatCompletionResponseSchema = z.object({
  choices: z.array(choiceSchema).optional(),
  usage: usageSchema.optional(),
});

export type ChatCompletionResponse = z.infer<typeof chatCompletionResponseSchema>;
