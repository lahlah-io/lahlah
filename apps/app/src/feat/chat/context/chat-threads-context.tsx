import { createContext, useContext, type ReactNode } from "react";

import { useChatThreads } from "../hooks/use-chat-threads";

type ChatThreadsValue = ReturnType<typeof useChatThreads>;

const ChatThreadsContext = createContext<ChatThreadsValue | null>(null);

/**
 * Keeps one thread store for every route. Chat and Search both read the same
 * state, so selecting a result in Search opens the live thread instead of a
 * separate copy hydrated from storage.
 */
export function ChatThreadsProvider({ children }: { children: ReactNode }) {
  const value = useChatThreads();

  return (
    <ChatThreadsContext.Provider value={value}>
      {children}
    </ChatThreadsContext.Provider>
  );
}

export function useChatThreadsContext(): ChatThreadsValue {
  const context = useContext(ChatThreadsContext);
  if (!context) {
    throw new Error(
      "useChatThreadsContext must be used within ChatThreadsProvider.",
    );
  }
  return context;
}
