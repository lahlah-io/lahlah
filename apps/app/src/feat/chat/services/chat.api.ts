import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";

import type {
  ChatMessageDto,
  ChatSessionDto,
  KeysetResponse,
  ListResponse,
  SendMessageResult,
} from "../types/chat";

const BASE = "/api/v1/chat";

function owner(userId: string): string {
  return `userId=${encodeURIComponent(userId)}`;
}

export function listSessions(userId: string) {
  return apiRequest<ListResponse<ChatSessionDto>>(
    `${BASE}/sessions?${owner(userId)}&page=1&limit=50`,
  );
}

export function createSession(userId: string, title: string) {
  return apiRequest<DataEnvelope<ChatSessionDto>>(`${BASE}/sessions`, {
    method: "POST",
    body: { userId, title },
  });
}

export function renameSession(
  userId: string,
  sessionId: string,
  title: string,
) {
  return apiRequest<DataEnvelope<ChatSessionDto>>(
    `${BASE}/sessions/${sessionId}`,
    { method: "PATCH", body: { userId, title } },
  );
}

export function deleteSession(userId: string, sessionId: string) {
  return apiRequest<DataEnvelope<{ deleted: boolean }>>(
    `${BASE}/sessions/${sessionId}?${owner(userId)}`,
    { method: "DELETE" },
  );
}

/** Keyset fetch: `after_position=0` mengambil percakapan dari awal. */
export async function listMessages(
  userId: string,
  sessionId: string,
): Promise<KeysetResponse<ChatMessageDto>> {
  // API membatasi `limit` maksimal 100, jadi halaman diambil berurutan sampai
  // `nextAfterPosition` habis. Satu percakapan bisa lebih dari 100 pesan.
  const data: ChatMessageDto[] = [];
  let after = 0;
  for (;;) {
    const page = await apiRequest<KeysetResponse<ChatMessageDto>>(
      `${BASE}/sessions/${sessionId}/messages?${owner(userId)}&after_position=${after}&limit=100`,
    );
    data.push(...page.data);
    const next = page.meta.nextAfterPosition;
    if (next === null || page.data.length === 0) {
      return { data, meta: { ...page.meta, nextAfterPosition: null } };
    }
    after = next;
  }
}

export function sendMessage(
  userId: string,
  sessionId: string,
  content: string,
) {
  return apiRequest<DataEnvelope<SendMessageResult>>(
    `${BASE}/sessions/${sessionId}/messages`,
    { method: "POST", body: { userId, content } },
  );
}
