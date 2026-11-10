type ChatMessageRow = { role: "user" | "assistant" | "system" | "tool"; content: string };
type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export function buildConversationContext(input: {
  systemPrompt: string;
  history: ChatMessageRow[];
  currentUserMessage?: string;
  draftContext?: string | null;
}): AiMessage[] {
  const messages: AiMessage[] = [{ role: "system", content: input.systemPrompt }];
  if (input.draftContext) messages.push({ role: "system", content: `Current draft context:\n${input.draftContext}` });
  for (const row of input.history) {
    if (row.role !== "user" && row.role !== "assistant") continue;
    messages.push({ role: row.role, content: row.content });
  }
  if (input.currentUserMessage) messages.push({ role: "user", content: input.currentUserMessage });
  return messages;
}

export function summarizeDraft(draft: { draftId?: string; travelDate?: string; destinations?: Array<{ name: string }> } | null): string | null {
  if (!draft) return null;
  const names = draft.destinations?.map((d) => d.name).join(", ") ?? "";
  return JSON.stringify({ draftId: draft.draftId, travelDate: draft.travelDate, destinations: names });
}
