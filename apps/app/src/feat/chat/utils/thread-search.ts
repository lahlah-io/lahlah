import type { ChatThread } from "../types/chat";

/**
 * Matches the query against thread titles and message text so the Search page
 * can find a conversation from something that was said inside it.
 */
export function searchThreads(
  threads: ChatThread[],
  query: string,
): ChatThread[] {
  const needle = query.trim().toLocaleLowerCase("id-ID");
  if (!needle) return threads;
  return threads.filter(
    (thread) =>
      thread.title.toLocaleLowerCase("id-ID").includes(needle) ||
      thread.messages.some((message) =>
        message.text.toLocaleLowerCase("id-ID").includes(needle),
      ),
  );
}
