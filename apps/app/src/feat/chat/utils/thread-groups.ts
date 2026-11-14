import type { ChatThread } from "../types/chat";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ThreadGroupId = "today" | "yesterday" | "week" | "older";

export interface ThreadGroup {
  id: ThreadGroupId;
  label: string;
  threads: ChatThread[];
}

const GROUP_LABELS: Record<ThreadGroupId, string> = {
  today: "Hari ini",
  yesterday: "Kemarin",
  week: "7 hari terakhir",
  older: "Lebih lama",
};

const GROUP_ORDER: ThreadGroupId[] = ["today", "yesterday", "week", "older"];

/** Case-insensitive title search that keeps the caller's array untouched. */
export function filterThreads(
  threads: ChatThread[],
  query: string,
): ChatThread[] {
  const needle = query.trim().toLocaleLowerCase("id-ID");
  if (!needle) return threads;
  return threads.filter((thread) =>
    thread.title.toLocaleLowerCase("id-ID").includes(needle),
  );
}

/**
 * Splits history into calm, predictable buckets. Newest first everywhere, and
 * empty buckets are dropped so the list never renders a lonely label.
 */
export function groupThreads(
  threads: ChatThread[],
  now = Date.now(),
): ThreadGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const today = startOfToday.getTime();
  const yesterday = today - DAY_MS;
  const lastWeek = today - 7 * DAY_MS;

  const buckets: Record<ThreadGroupId, ChatThread[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const thread of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (thread.updatedAt >= today) buckets.today.push(thread);
    else if (thread.updatedAt >= yesterday) buckets.yesterday.push(thread);
    else if (thread.updatedAt >= lastWeek) buckets.week.push(thread);
    else buckets.older.push(thread);
  }

  return GROUP_ORDER.filter((id) => buckets[id].length > 0).map((id) => ({
    id,
    label: GROUP_LABELS[id],
    threads: buckets[id],
  }));
}
