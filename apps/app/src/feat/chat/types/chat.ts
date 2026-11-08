export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  citations?: { id: string; index: number; title: string; url?: string }[];
  id: string;
  role: ChatRole;
  text: string;
}

export interface ChatThread {
  id: string;
  messages: ChatMessage[];
  title: string;
  updatedAt: number;
}
