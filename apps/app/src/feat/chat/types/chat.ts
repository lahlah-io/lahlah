export type ChatRole = "user" | "assistant";

/** Status pembuatan trip yang ditampilkan sebagai daftar langkah. */
export type ChatTaskState = "running" | "created" | "skipped" | "failed";

export interface ChatMessage {
  citations?: { id: string; index: number; title: string; url?: string }[];
  id: string;
  /** Token prompt yang dipakai untuk menghasilkan pesan assistant. */
  inputTokens?: number;
  /** Token completion yang dihasilkan pesan assistant. */
  outputTokens?: number;
  role: ChatRole;
  /** Status pembuatan trip untuk balasan ini; hanya diisi pada pesan assistant. */
  task?: { state: ChatTaskState; detail?: string };
  text: string;
}

/**
 * Satu baris riwayat percakapan. `messages` hanya terisi setelah sesi dibuka,
 * karena daftar sesi dari API tidak membawa isi pesannya.
 */
export interface ChatThread {
  id: string;
  messages: ChatMessage[];
  title: string;
  updatedAt: number;
}

/* Kontrak API `/api/v1/chat`. Hanya field yang dipakai UI yang dideklarasikan. */

export interface ChatSessionDto {
  createdAt: string;
  id: string;
  lastMessageAt: string | null;
  title: string;
  updatedAt: string;
}

export interface ChatMessageDto {
  content: string;
  createdAt: string;
  id: string;
  inputTokens: number;
  /** `appendMessage` menyimpan intent dan versi trip di sini. */
  metadata: { intent?: string; versionId?: string | null } | null;
  outputTokens: number;
  position: number;
  role: "user" | "assistant" | "system" | "tool";
}

export interface PageMeta {
  limit: number;
  page: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface KeysetResponse<T> {
  data: T[];
  meta: { limit: number; nextAfterPosition: number | null };
}

export interface SendMessageResult {
  assistantMessageId: string;
  intent: string;
  message: string;
  sessionId: string;
  usage: { inputTokens: number; outputTokens: number };
  version: { versionId: string; versionNumber: number } | null;
}
