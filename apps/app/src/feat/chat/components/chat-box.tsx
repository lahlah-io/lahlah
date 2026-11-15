import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Map, MessagesSquare, PanelLeft, Sparkles } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router";

import { Button } from "@/shared/components/ui/button";
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
import { ChatTurn, PendingTurn } from "./chat-turn";
import { ItineraryPanel } from "./itinerary-panel";
import AIContextMeter from "./smoothui/ai-context-meter";
import AIConversation from "./smoothui/ai-conversation";
import AIPromptInput from "./smoothui/ai-prompt-input";
import { TripTask } from "./trip-task";
import { useChatThreadsContext } from "../context/chat-threads-context";
import { resolveChatRoute } from "../utils/chat-route";

const SUGGESTIONS = [
  "Buat itinerary pantai besok pagi",
  "Rekomendasi kuliner Padang hari ini",
  "Rute santai sore ini di Padang",
];

/**
 * Ukuran context window model chat. API belum mengekspos angka ini, jadi meter
 * memakai anggaran tetap; ganti satu nilai ini saat API mengirimkannya.
 */
const CONTEXT_WINDOW_TOKENS = 128_000;

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
    deleteThread,
    error,
    isDraft,
    listLoading,
    renameThread,
    selectThread,
    send,
    sending,
    sessionLoading,
    startDraft,
    threads,
    usage,
  } = useChatThreadsContext();
  const [draft, setDraft] = useState("");
  const { openMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const { threadId } = useParams<{ threadId?: string }>();
  const showTrip = location.pathname.endsWith("/trip");
  const view: ChatView = showTrip ? "itinerary" : "chat";

  // URL adalah sumber kebenaran: `/chat/:id` memilih thread, `/chat` draft,
  // `.../trip` membuka tab trip. Daftar thread belum diketahui sebelum API
  // menjawab, jadi sinkronisasi ditunda sampai `listLoading` selesai.
  useEffect(() => {
    const action = resolveChatRoute({
      threadId,
      activeId,
      listLoading,
      threadExists: threadId
        ? threads.some((thread) => thread.id === threadId)
        : false,
    });
    if (action.type === "fallback") {
      navigate("/chat", { replace: true });
    } else if (action.type === "select") {
      selectThread(action.id);
    } else if (action.type === "reset") {
      startDraft();
    }
  }, [
    activeId,
    listLoading,
    navigate,
    selectThread,
    startDraft,
    threadId,
    threads,
  ]);

  const openMobileHistory = useCallback(() => setOpenMobile(true), [
    setOpenMobile,
  ]);
  const closeMobileHistory = useCallback(() => setOpenMobile(false), [
    setOpenMobile,
  ]);

  const handleNewThread = useCallback(() => {
    setDraft("");
    startDraft();
    navigate("/chat");
  }, [navigate, startDraft]);

  const handleSelectThread = useCallback(
    (id: string) => {
      setDraft("");
      navigate(`/chat/${id}`);
    },
    [navigate],
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
      void renameThread(id, title);
    },
    [renameThread],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void deleteThread(id);
    },
    [deleteThread],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      if (sending) return;
      setDraft("");
      void send(value).then((result) => {
        // Trip pertama langsung dibuka supaya user melihat hasilnya tanpa
        // harus menebak tab mana yang berubah. Perubahan trip berikutnya
        // tidak merebut halaman supaya user tidak kehilangan bacaan.
        if (result?.firstTrip) navigate(`/chat/${result.sessionId}/trip`);
      });
    },
    [navigate, send, sending],
  );

  const composerState = sending ? "thinking" : "idle";
  const messages = activeThread?.messages ?? [];
  // Kegagalan kirim tampil sebagai status trip yang gagal, bukan layar kosong.
  const showEmptyState =
    !sending && !error && (isDraft || messages.length === 0);
  const showSessionLoader =
    sessionLoading && !isDraft && messages.length === 0;

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
              {/*
                Scroller milik SmoothUI: mengikuti bawah hanya saat pembaca
                sudah di bawah. `contentKey` berubah tiap ada pesan baru atau
                saat status kirim berubah, supaya daftar langkah trip yang
                baru muncul ikut terlihat.
              */}
              <AIConversation
                className="min-h-0 flex-1"
                contentKey={`${isDraft ? "draft" : activeId}-${messages.length}-${sending ? "sending" : "idle"}`}
              >
                {/* `justify-end` menempelkan konten pendek ke bawah supaya
                    pesan terbaru berada dekat composer. */}
                <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-5 px-4 py-8 sm:px-6">
                  {showEmptyState ? (
                    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                        <Sparkles className="size-7" aria-hidden="true" />
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        Mau ke mana di Padang?
                      </h2>
                      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                        Ceritakan rencanamu. Lahlah AI menyusun itinerary,
                        menyimpan versinya, dan menggambar rutenya.
                      </p>
                      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-3">
                        {SUGGESTIONS.map((suggestion) => (
                          <Button
                            key={suggestion}
                            variant="outline"
                            className="h-auto min-h-16 px-4 py-3 text-left whitespace-normal"
                            onClick={() => handleSubmit(suggestion)}
                            disabled={sending}
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[2vh] flex-1 flex-col justify-end gap-5">
                      {messages.map((message) => (
                        <ChatTurn key={message.id} message={message} />
                      ))}
                      {sending ? <PendingTurn /> : null}
                      {error?.kind === "send" ? (
                        <TripTask detail={error.message} state="failed" />
                      ) : null}
                    </div>
                  )}

                  {showSessionLoader ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Memuat percakapan…
                    </div>
                  ) : null}
                </div>
              </AIConversation>

              <div
                className={cn(
                  "shrink-0 px-4 pt-3 sm:px-6",
                  MOBILE_NAV_OFFSET,
                  "md:pb-6",
                )}
              >
                <div className="mx-auto max-w-3xl">
                  {error?.kind === "load" ? (
                    <p
                      role="alert"
                      className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      {error.message}
                    </p>
                  ) : null}
                  <AIPromptInput
                    aria-label="Tulis pesan untuk Lahlah AI"
                    placeholder="Tulis pesanmu di sini..."
                    value={draft}
                    state={composerState}
                    onValueChange={setDraft}
                    onSubmit={handleSubmit}
                  />
                  {/* Meter konteks: hover untuk rincian token input vs output
                      percakapan ini. Disembunyikan selama belum ada pesan. */}
                  {usage.total > 0 ? (
                    <div className="mt-2 flex justify-end">
                      <AIContextMeter
                        breakdown={[
                          { label: "Token input", tokens: usage.input },
                          { label: "Token output", tokens: usage.output },
                        ]}
                        limit={CONTEXT_WINDOW_TOKENS}
                        used={usage.total}
                      />
                    </div>
                  ) : null}
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
