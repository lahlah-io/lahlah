import { useCallback, useEffect, useState } from "react";
import { Map, MessagesSquare, PanelLeft, Sparkles } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router";

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
import { SidebarProvider, useSidebar } from "@/shared/components/ui/sidebar";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";
import { cn } from "@/shared/utils/cn";

import { ThreadPanelContent } from "./thread-panel";
import { ChatTurn, StreamingTurn } from "./chat-turn";
import { ItineraryPanel } from "./itinerary-panel";
import AIPromptInput from "./smoothui/ai-prompt-input";
import { useChatThreadsContext } from "../context/chat-threads-context";
import { useSimulatedReply } from "../hooks/use-simulated-reply";

const SUGGESTIONS = [
  "Bantu saya menyusun ide baru",
  "Ringkas topik yang sedang saya pelajari",
  "Buat rencana untuk minggu ini",
];

type ChatView = "chat" | "itinerary";

const MOBILE_NAV_OFFSET = "pb-[calc(4.5rem+env(safe-area-inset-bottom))]";

export function ChatBox() {
  return (
    <SidebarProvider className="h-full w-full">
      <ChatWorkspace />
    </SidebarProvider>
  );
}

function ChatWorkspace() {
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
  } = useChatThreadsContext();
  const { cancel, start, turn } = useSimulatedReply();
  const [draft, setDraft] = useState("");
  const { openMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const { threadId } = useParams<{ threadId?: string }>();
  const showTrip = location.pathname.endsWith("/trip");
  const view: ChatView = showTrip ? "itinerary" : "chat";

  // URL adalah sumber kebenaran: `/chat/:id` memilih thread, `/chat` draft,
  // `.../trip` membuka tab trip. State store disinkronkan ke URL, bukan
  // sebaliknya, supaya tautan bisa dibagikan dan reload tetap di tempat sama.
  useEffect(() => {
    if (threadId) {
      if (!threads.some((thread) => thread.id === threadId)) {
        navigate("/chat", { replace: true });
        return;
      }
      if (threadId !== activeId) selectThread(threadId);
      return;
    }
    if (!showTrip && activeId) {
      navigate(`/chat/${activeId}`, { replace: true });
    }
  }, [activeId, navigate, selectThread, showTrip, threadId, threads]);

  const openMobileHistory = useCallback(() => setOpenMobile(true), [
    setOpenMobile,
  ]);
  const closeMobileHistory = useCallback(() => setOpenMobile(false), [
    setOpenMobile,
  ]);

  const handleNewThread = useCallback(() => {
    cancel();
    setDraft("");
    startDraft();
    navigate("/chat");
  }, [cancel, navigate, startDraft]);

  const handleSelectThread = useCallback(
    (id: string) => {
      cancel();
      setDraft("");
      navigate(`/chat/${id}`);
    },
    [cancel, navigate],
  );

  const handleViewChange = useCallback(
    (next: ChatView) => {
      const base = threadId ? `/chat/${threadId}` : "/chat";
      navigate(next === "itinerary" ? `${base}/trip` : base);
    },
    [navigate, threadId],
  );

  const handleRename = useCallback(
    (id: string, title: string) => {
      renameThread(id, title);
    },
    [renameThread],
  );

  const handleDelete = useCallback(
    (id: string) => {
      cancel();
      deleteThread(id);
    },
    [cancel, deleteThread],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      const clean = value.trim();
      if (!clean || turn.streaming) return;
      appendUserMessage(clean);
      setDraft("");
      start(clean, (text, citations) => {
        appendAssistantMessage({ citations, text });
      });
    },
    [appendAssistantMessage, appendUserMessage, start, turn.streaming],
  );

  const composerState = turn.streaming ? turn.state : "idle";

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside
        aria-label="Riwayat percakapan"
        className="hidden h-full w-72 shrink-0 flex-col border-r border-sidebar-border md:flex"
      >
        <ThreadPanelContent
          activeId={activeId}
          onCreate={handleNewThread}
          onDelete={handleDelete}
          onRename={handleRename}
          onSelect={handleSelectThread}
          threads={threads}
        />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center justify-center px-3 sm:px-6">
          <div className="absolute left-2 flex items-center gap-1 sm:left-4">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Buka riwayat percakapan"
              aria-expanded={openMobile}
              className="md:hidden"
              onClick={openMobileHistory}
            >
              <PanelLeft aria-hidden="true" />
            </Button>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="lg"
            spacing={0}
            value={view}
            onValueChange={(value) => {
              if (value === "chat" || value === "itinerary") {
                handleViewChange(value);
              }
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
              aria-label="Trip"
              className="h-10 gap-2.5 px-8 text-sm has-data-[icon=inline-end]:pr-8 has-data-[icon=inline-start]:pl-8 group-data-[spacing=0]/toggle-group:px-8 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-8 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-8 [&_svg:not([class*='size-'])]:size-4.5"
            >
              <Map data-icon="inline-start" />
              Trip
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
              <MessageScrollerProvider
                key={isDraft ? "draft" : activeThread?.id}
                autoScroll
              >
                <MessageScroller className="min-h-0 flex-1">
                  <MessageScrollerViewport>
                    {/* `justify-end` pins short content to the bottom so the newest
                        turn starts next to the composer; long transcripts keep the
                        natural top-to-bottom flow and auto-scroll to the live edge. */}
                    <MessageScrollerContent className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-5 px-4 py-8 sm:px-6">
                      {isDraft ||
                      !activeThread ||
                      activeThread.messages.length === 0 ? (
                        <MessageScrollerItem>
                          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                              <Sparkles className="size-7" aria-hidden="true" />
                            </div>
                            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                              Apa yang ingin kamu bahas?
                            </h2>
                            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                              Mulai dengan sebuah pertanyaan. Jawaban
                              disimulasikan di browser: ada jeda berpikir, lalu
                              teks mengalir kata per kata.
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
                          {turn.streaming ? (
                            <StreamingTurn turn={turn} />
                          ) : null}
                        </div>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton direction="end" />
                </MessageScroller>
              </MessageScrollerProvider>

              <div
                className={cn(
                  "shrink-0 px-4 pt-3 sm:px-6",
                  MOBILE_NAV_OFFSET,
                  "md:pb-6",
                )}
              >
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
              className={cn(
                "h-full w-full min-w-0 shrink-0",
                MOBILE_NAV_OFFSET,
                "md:pb-0",
              )}
              inert={view !== "itinerary"}
            >
              <ItineraryPanel />
            </div>
          </div>
        </div>
      </section>

      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="data-[side=left]:w-80 gap-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Riwayat percakapan</SheetTitle>
          </SheetHeader>
          <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
            <ThreadPanelContent
              activeId={activeId}
              onCreate={handleNewThread}
              onDelete={handleDelete}
              onNavigate={closeMobileHistory}
              onRename={handleRename}
              onSelect={handleSelectThread}
              threads={threads}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
