import { createContext, useContext, type ReactNode } from "react";

import { useChatThreads } from "../hooks/use-chat-threads";

type ChatThreadsValue = ReturnType<typeof useChatThreads>;

const ChatThreadsContext = createContext<ChatThreadsValue | null>(null);

/**
 * Satu store percakapan untuk setiap route. Chat dan Cari membaca state yang
 * sama, jadi memilih hasil pencarian membuka sesi API yang sedang aktif.
 */
export function ChatThreadsProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const value = useChatThreads(userId);

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
