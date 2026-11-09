import { useState } from "react";
import { Map, Menu, MessagesSquare, Sparkles } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/shared/components/ui/message-scroller";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";
import { cn } from "@/shared/utils/cn";

import { ChatTurn, StreamingTurn } from "./chat-turn";
import { ItineraryPanel } from "./itinerary-panel";
import AIPromptInput from "./smoothui/ai-prompt-input";
import { ThreadList } from "./thread-list";
import { useChatThreads } from "../hooks/use-chat-threads";
import { useSimulatedReply } from "../hooks/use-simulated-reply";

const SUGGESTIONS = [
  "Bantu saya menyusun ide baru",
  "Ringkas topik yang sedang saya pelajari",
  "Buat rencana untuk minggu ini",
];

type ChatView = "chat" | "itinerary";

export function ChatBox() {
  const {
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
  } = useChatThreads();
  const { cancel, start, turn } = useSimulatedReply();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<ChatView>("chat");

  function handleNewThread() {
    cancel();
    setDraft("");
    startDraft();
    setMobileOpen(false);
  }

  function handleSelectThread(id: string) {
    cancel();
    setDraft("");
    selectThread(id);
    setMobileOpen(false);
  }

  function handleRename(id: string) {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    const title = window.prompt("Nama percakapan", thread.title)?.trim();
    if (title) renameThread(id, title);
  }

  function handleDelete(id: string) {
    if (!window.confirm("Hapus percakapan ini dari browser?")) return;
    cancel();
    deleteThread(id);
  }

  function handleSubmit(value: string) {
    const clean = value.trim();
    if (!clean || turn.streaming) return;
    appendUserMessage(clean);
    setDraft("");
    start(clean, (text, citations) => {
      appendAssistantMessage({ citations, text });
    });
  }

  const composerState = turn.streaming ? turn.state : "idle";
  const sidebar = (
    <ThreadList
      threads={threads}
      activeId={activeId}
      query={query}
      onQueryChange={setQuery}
      onSelect={handleSelectThread}
      onCreate={handleNewThread}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  );

  return (
    <div className="flex h-svh min-h-0 w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        {sidebar}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Percakapan</SheetTitle>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center justify-center px-5 py-2 sm:px-8">
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute left-3 sm:left-4 md:hidden"
            aria-label="Buka riwayat"
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <ToggleGroup
            type="single"
            variant="outline"
            size="lg"
            spacing={0}
            value={view}
            onValueChange={(value) => {
              if (value === "chat" || value === "itinerary") setView(value);
            }}
            aria-label="Pilih tampilan"
            className="rounded-xl"
          >
            <ToggleGroupItem
              value="chat"
              aria-label="Chat"
              className="h-10 gap-2.5 px-8 text-sm has-data-[icon=inline-end]:pr-8 has-data-[icon=inline-start]:pl-8 group-data-[spacing=0]/toggle-group:px-8 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-8 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-8 [&_svg:not([class*='size-'])]:size-4.5"
            >
              <MessagesSquare data-icon="inline-start" />
              Chat
            </ToggleGroupItem>
            <ToggleGroupItem
              value="itinerary"
              aria-label="Itinerary"
              className="h-10 gap-2.5 px-8 text-sm has-data-[icon=inline-end]:pr-8 has-data-[icon=inline-start]:pl-8 group-data-[spacing=0]/toggle-group:px-8 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-8 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-8 [&_svg:not([class*='size-'])]:size-4.5"
            >
              <Map data-icon="inline-start" />
              Itinerary
            </ToggleGroupItem>
          </ToggleGroup>
        </header>

        {/* Track dua panel selebar viewport: menggeser seluruh track
            memberi kesan satu panel mendorong panel lainnya. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex h-full transition-transform duration-300 ease-in-out motion-reduce:transition-none",
              view === "itinerary" ? "-translate-x-full" : "translate-x-0",
            )}
          >
            <div
              aria-label="Chat"
              className="flex h-full w-full min-w-0 shrink-0 flex-col"
              inert={view !== "chat"}
              role="region"
            >
              <MessageScrollerProvider key={isDraft ? "draft" : activeThread?.id} autoScroll>
                <MessageScroller className="min-h-0 flex-1">
                  <MessageScrollerViewport>
                    {/* `justify-end` pins short content to the bottom so the newest
                        turn starts next to the composer; long transcripts keep the
                        natural top-to-bottom flow and auto-scroll to the live edge. */}
                    <MessageScrollerContent className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-5 px-4 py-8 sm:px-6">
                      {isDraft || !activeThread || activeThread.messages.length === 0 ? (
                        <MessageScrollerItem>
                          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                              <Sparkles className="size-7" aria-hidden="true" />
                            </div>
                            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                              Apa yang ingin kamu bahas?
                            </h2>
                            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                              Mulai dengan sebuah pertanyaan. Jawaban disimulasikan di
                              browser: ada jeda berpikir, lalu teks mengalir kata per kata.
                            </p>
                            <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-3">
                              {SUGGESTIONS.map((suggestion) => (
                                <Button
                                  key={suggestion}
                                  variant="outline"
                                  className="h-auto min-h-16 px-4 py-3 text-left whitespace-normal"
                                  onClick={() => handleSubmit(suggestion)}
                                  disabled={turn.streaming}
                                >
                                  {suggestion}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </MessageScrollerItem>
                      ) : (
                        <div className="flex min-h-[2vh] flex-1 flex-col justify-end gap-5">
                          {activeThread.messages.map((message) => (
                            <ChatTurn key={message.id} message={message} />
                          ))}
                          {turn.streaming ? <StreamingTurn turn={turn} /> : null}
                        </div>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton direction="end" />
                </MessageScroller>
              </MessageScrollerProvider>

              <div className="shrink-0 px-4 pt-3 pb-4 sm:px-6 sm:pb-6">
                <div className="mx-auto max-w-3xl">
                  <AIPromptInput
                    aria-label="Tulis pesan untuk Lahlah AI"
                    placeholder="Tulis pesanmu di sini..."
                    value={draft}
                    state={composerState}
                    onValueChange={setDraft}
                    onSubmit={handleSubmit}
                    onStop={cancel}
                  />
                </div>
              </div>
            </div>

            <div
              className="h-full w-full min-w-0 shrink-0"
              inert={view !== "itinerary"}
            >
              <ItineraryPanel />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
