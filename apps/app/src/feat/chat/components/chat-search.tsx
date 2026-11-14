import { useMemo, useState } from "react";
import { MessageSquare, Search, X } from "lucide-react";
import { useNavigate } from "react-router";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

import { useChatThreadsContext } from "../context/chat-threads-context";
import { groupThreads } from "../utils/thread-groups";
import { searchThreads } from "../utils/thread-search";

export function ChatSearch() {
  const { threads } = useChatThreadsContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => groupThreads(searchThreads(threads, query)),
    [query, threads],
  );
  const isSearching = query.trim().length > 0;

  function handleSelect(id: string) {
    navigate(`/chat/${id}`);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-24 sm:px-6 md:pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cari</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Temukan percakapan dari judul atau isi pesannya.
        </p>
      </header>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          type="search"
          value={query}
          placeholder="Kata kunci percakapan"
          aria-label="Cari percakapan"
          className="h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Hapus pencarian"
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            onClick={() => setQuery("")}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <Empty className="border-0 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {isSearching ? (
                  <Search aria-hidden="true" />
                ) : (
                  <MessageSquare aria-hidden="true" />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {isSearching ? "Tidak ditemukan" : "Belum ada percakapan"}
              </EmptyTitle>
              <EmptyDescription>
                {isSearching
                  ? "Coba kata kunci lain."
                  : "Percakapan yang kamu mulai akan muncul di sini."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.id} aria-label={group.label}>
                <h2 className="px-1 pb-2 text-xs font-medium text-muted-foreground">
                  {group.label}
                </h2>
                <ul className="flex flex-col gap-1">
                  {group.threads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => handleSelect(thread.id)}
                      >
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <MessageSquare
                            aria-hidden="true"
                            className="size-4"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {thread.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {thread.messages.length} pesan
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
