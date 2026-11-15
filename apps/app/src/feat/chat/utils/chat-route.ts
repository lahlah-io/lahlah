export type ChatRouteAction =
  | { type: "none" }
  | { type: "select"; id: string }
  | { type: "reset" }
  | { type: "fallback" };

/**
 * Menentukan reaksi state percakapan terhadap URL. URL adalah sumber kebenaran:
 * `/chat/:id` memilih sesi, `/chat` selalu draft baru, dan id yang tidak dikenal
 * kembali ke draft. Tanpa aturan ini, `/chat` pernah ikut me-redirect ke sesi
 * terakhir sehingga chat baru tidak pernah bisa dimulai.
 */
export function resolveChatRoute(input: {
  threadId?: string;
  activeId: string | null;
  listLoading: boolean;
  threadExists: boolean;
}): ChatRouteAction {
  if (input.listLoading) return { type: "none" };
  if (input.threadId) {
    if (!input.threadExists) return { type: "fallback" };
    return input.threadId === input.activeId
      ? { type: "none" }
      : { type: "select", id: input.threadId };
  }
  return input.activeId !== null ? { type: "reset" } : { type: "none" };
}
