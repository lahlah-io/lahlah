import { useCallback, useState } from "react";

import type { ChatMessage, ChatThread } from "../types/chat";

const STORAGE_KEY = "lahlah-chat-threads-v2";
/** Local draft only, never synced: thread ids stay out of storage. */
const MAX_STORED_THREADS = 20;
const MAX_STORED_MESSAGES = 60;

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.text === "string" &&
    (message.role === "user" || message.role === "assistant")
  );
}

function isThread(value: unknown): value is ChatThread {
  if (typeof value !== "object" || value === null) return false;
  const thread = value as Record<string, unknown>;
  return (
    typeof thread.id === "string" &&
    typeof thread.title === "string" &&
    typeof thread.updatedAt === "number" &&
    Array.isArray(thread.messages) &&
    thread.messages.every(isMessage)
  );
}

function readStoredThreads(): ChatThread[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isThread)) return [];
    // Trim oversized histories before they hydrate state: long transcripts cost
    // parse time on every reload and balloon a key every tab writes to.
    return parsed.slice(0, MAX_STORED_THREADS).map((thread) => ({
      ...thread,
      messages: thread.messages.slice(-MAX_STORED_MESSAGES),
    }));
  } catch {
    // Invalid or unavailable storage opens on a fresh draft.
    return [];
  }
}

function persistThreads(threads: ChatThread[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(threads.slice(0, MAX_STORED_THREADS)),
    );
  } catch {
    // Private mode, quota, or disabled storage: the session keeps working in memory.
  }
}

export function useChatThreads() {
  const [threads, setThreads] = useState<ChatThread[]>(readStoredThreads);
  const [activeId, setActiveId] = useState<string | null>(() => threads[0]?.id ?? null);

  // `null` means the composer sits on a fresh draft: the empty state shows,
  // but no thread exists yet. The thread is born when the first message is
  // sent, so clicking "new" repeatedly never litters history with empties.
  const isDraft = activeId === null;
  const activeThread = isDraft
    ? undefined
    : (threads.find((thread) => thread.id === activeId) ?? threads[0]);

  const startDraft = useCallback(() => {
    setActiveId(null);
  }, []);

  const selectThread = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const renameThread = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      setThreads((current) => {
        const updated = current.map((thread) =>
          thread.id === id ? { ...thread, title: clean } : thread,
        );
        persistThreads(updated);
        return updated;
      });
    },
    [],
  );

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((current) => {
        // Deleting the last thread lands back on a fresh draft instead of a
        // persisted empty shell: nothing is stored until the next message.
        const updated = current.filter((thread) => thread.id !== id);
        persistThreads(updated);
        if (id === activeId) setActiveId(updated[0]?.id ?? null);
        return updated;
      });
    },
    [activeId],
  );

  const appendUserMessage = useCallback(
    (text: string): ChatMessage | null => {
      const clean = text.trim();
      if (!clean) return null;
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: clean,
      };
      if (activeId === null) {
        // First message on a fresh draft births the thread.
        const thread: ChatThread = {
          id: crypto.randomUUID(),
          messages: [message],
          title: clean.slice(0, 42),
          updatedAt: Date.now(),
        };
        setThreads((current) => {
          const updated = [thread, ...current];
          persistThreads(updated);
          return updated;
        });
        setActiveId(thread.id);
        return message;
      }
      const targetId = activeId;
      setThreads((current) => {
        const updated = current.map((thread) =>
          thread.id === targetId
            ? {
                ...thread,
                messages: [...thread.messages, message],
                title:
                  thread.messages.length === 0 && thread.title === "Percakapan baru"
                    ? clean.slice(0, 42)
                    : thread.title,
                updatedAt: Date.now(),
              }
            : thread,
        );
        persistThreads(updated);
        return updated;
      });
      return message;
    },
    [activeId],
  );

  const appendAssistantMessage = useCallback(
    (message: Omit<ChatMessage, "id" | "role">) => {
      const full: ChatMessage = {
        ...message,
        id: crypto.randomUUID(),
        role: "assistant",
      };
      // The draft is always resolved by the user's message first, so an active
      // id must exist — but guard anyway so a stray call never drops text.
      setThreads((current) => {
        if (current.length === 0) {
          const thread: ChatThread = {
            id: crypto.randomUUID(),
            messages: [full],
            title: "Percakapan baru",
            updatedAt: Date.now(),
          };
          persistThreads([thread]);
          return [thread];
        }
        const targetId = activeId ?? current[0]?.id;
        const updated = current.map((thread) =>
          thread.id === targetId
            ? {
                ...thread,
                messages: [...thread.messages, full],
                updatedAt: Date.now(),
              }
            : thread,
        );
        persistThreads(updated);
        return updated;
      });
      return full;
    },
    [activeId],
  );

  return {
    activeId,
    activeThread,
    appendAssistantMessage,
    appendUserMessage,
    deleteThread,
    isDraft,
    renameThread,
    selectThread,
    startDraft,
    threads,
  };
}
