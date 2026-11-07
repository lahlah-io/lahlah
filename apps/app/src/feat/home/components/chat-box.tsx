import { useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUp, Bot, Menu, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar"
import { Badge } from "@/shared/components/ui/badge"
import { Bubble, BubbleContent } from "@/shared/components/ui/bubble"
import { Button } from "@/shared/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu"
import { Input } from "@/shared/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/shared/components/ui/input-group"
import { Message, MessageAvatar, MessageContent } from "@/shared/components/ui/message"
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/shared/components/ui/message-scroller"
import { ScrollArea } from "@/shared/components/ui/scroll-area"
import { Separator } from "@/shared/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet"
import { cn } from "@/shared/utils/cn"

type ChatMessage = { id: string; role: "user" | "assistant"; text: string }
type ChatThread = { id: string; title: string; messages: ChatMessage[]; updatedAt: number }
const storageKey = "lahlah-chat-threads-v1"
const suggestions = ["Bantu saya menyusun ide baru", "Ringkas topik yang sedang saya pelajari", "Buat rencana untuk minggu ini"]

function makeThread(): ChatThread {
  return { id: crypto.randomUUID(), title: "Percakapan baru", messages: [], updatedAt: Date.now() }
}

function readThreads(): ChatThread[] {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.every((item) =>
        typeof item?.id === "string" && typeof item?.title === "string" &&
        typeof item?.updatedAt === "number" && Array.isArray(item?.messages) &&
        item.messages.every((message: ChatMessage) =>
          typeof message?.id === "string" && typeof message?.text === "string" &&
          (message?.role === "user" || message?.role === "assistant")
        )
      )) return parsed.length ? parsed : [makeThread()]
    }
  } catch {
    // Invalid or unavailable browser storage should still open a fresh chat.
  }
  return [makeThread()]
}

function ThreadList({ threads, activeId, query, onQueryChange, onSelect, onCreate, onRename, onDelete }: {
  threads: ChatThread[]
  activeId: string
  query: string
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}) {
  const filtered = threads
    .filter((thread) => thread.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 pb-5 pt-6">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">Lahlah AI</p>
          <p className="text-xs text-muted-foreground">Ruang percakapan</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-3">
        <Button className="w-full justify-start" onClick={onCreate}>
          <Plus data-icon="inline-start" /> Percakapan baru
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Cari percakapan" className="pl-9" placeholder="Cari percakapan..." value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </div>
      </div>
      <div className="px-5 pb-2 pt-7 text-xs font-medium uppercase tracking-widest text-muted-foreground">Riwayat</div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-1 pb-4">
          {filtered.length === 0 && <p className="px-3 py-5 text-sm text-muted-foreground">Tidak ada percakapan yang cocok.</p>}
          {filtered.map((thread) => (
            <div key={thread.id} className={cn("group flex min-w-0 items-center rounded-lg pr-1 transition-colors hover:bg-sidebar-accent", thread.id === activeId && "bg-sidebar-accent text-sidebar-accent-foreground")}>
              <button type="button" aria-current={thread.id === activeId ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(thread.id)}>
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{thread.title}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={`Opsi untuk ${thread.title}`}><MoreHorizontal aria-hidden="true" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRename(thread.id)}><Pencil data-icon="inline-start" /> Ubah nama</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(thread.id)}><Trash2 data-icon="inline-start" /> Hapus</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex items-center gap-3 px-4 py-4">
        <Avatar className="size-9"><AvatarFallback><User className="size-4" aria-hidden="true" /></AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Pengguna</p><p className="text-xs text-muted-foreground">Pratinjau lokal</p></div>
      </div>
    </div>
  )
}

export function ChatBox() {
  const [threads, setThreads] = useState<ChatThread[]>(readThreads)
  const [activeId, setActiveId] = useState(() => threads[0]!.id)
  const [query, setQuery] = useState("")
  const [input, setInput] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeThread = threads.find((thread) => thread.id === activeId) ?? threads[0]!

  function saveThreads(next: ChatThread[]) {
    setThreads(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
  }
  function createThread() {
    const next = makeThread()
    saveThreads([next, ...threads])
    setActiveId(next.id)
    setInput("")
    setMobileOpen(false)
  }
  function selectThread(id: string) {
    setActiveId(id)
    setInput("")
    setMobileOpen(false)
  }
  function renameThread(id: string) {
    const thread = threads.find((item) => item.id === id)
    if (!thread) return
    const title = window.prompt("Nama percakapan", thread.title)?.trim()
    if (title) saveThreads(threads.map((item) => item.id === id ? { ...item, title } : item))
  }
  function deleteThread(id: string) {
    if (!window.confirm("Hapus percakapan ini dari browser?")) return
    const rest = threads.filter((thread) => thread.id !== id)
    const next = rest.length ? rest : [makeThread()]
    saveThreads(next)
    if (id === activeId) setActiveId(next[0]!.id)
  }
  function sendMessage() {
    const text = input.trim()
    if (!text) return
    const message: ChatMessage = { id: crypto.randomUUID(), role: "user", text }
    saveThreads(threads.map((thread) => thread.id === activeId ? {
      ...thread,
      title: thread.messages.length === 0 && thread.title === "Percakapan baru" ? text.slice(0, 42) : thread.title,
      messages: [...thread.messages, message], updatedAt: Date.now(),
    } : thread))
    setInput("")
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); sendMessage() }
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      sendMessage()
    }
  }
  const sidebarProps = { threads, activeId, query, onQueryChange: setQuery, onSelect: selectThread, onCreate: createThread, onRename: renameThread, onDelete: deleteThread }

  return (
    <div className="flex h-svh min-h-0 w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block"><ThreadList {...sidebarProps} /></aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="gap-0 p-0">
          <SheetHeader className="sr-only"><SheetTitle>Percakapan</SheetTitle></SheetHeader>
          <ThreadList {...sidebarProps} />
        </SheetContent>
      </Sheet>
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Chat">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Buka riwayat" onClick={() => setMobileOpen(true)}><Menu aria-hidden="true" /></Button>
          <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold">{activeThread.title}</h1><p className="text-xs text-muted-foreground">Ruang untuk bertanya dan berpikir</p></div>
          <Badge variant="secondary">Pratinjau UI</Badge>
        </header>
        <MessageScrollerProvider key={activeThread.id} autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-8 sm:px-6">
                {activeThread.messages.length === 0 ? (
                  <MessageScrollerItem>
                    <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
                      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Sparkles className="size-7" aria-hidden="true" /></div>
                      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Apa yang ingin kamu bahas?</h2>
                      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Mulai dengan sebuah pertanyaan, ide, atau rencana. Percakapan ini tersimpan di browsermu.</p>
                      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-3">
                        {suggestions.map((suggestion) => <Button key={suggestion} variant="outline" className="h-auto min-h-16 whitespace-normal px-4 py-3 text-left" onClick={() => setInput(suggestion)}>{suggestion}</Button>)}
                      </div>
                    </div>
                  </MessageScrollerItem>
                ) : activeThread.messages.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageAvatar><Avatar className="size-8"><AvatarFallback>{message.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</AvatarFallback></Avatar></MessageAvatar>
                      <MessageContent><Bubble align={message.role === "user" ? "end" : "start"} variant={message.role === "user" ? "default" : "muted"}><BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent></Bubble></MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton direction="end" />
          </MessageScroller>
        </MessageScrollerProvider>
        <div className="shrink-0 px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
            <InputGroup className="min-h-28 rounded-2xl shadow-sm">
              <InputGroupTextarea aria-label="Tulis pesan" className="min-h-20 max-h-48 px-4 pt-3" placeholder="Tulis pesanmu di sini..." value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} />
              <InputGroupAddon align="block-end" className="justify-between px-3 pb-2">
                <span className="text-xs text-muted-foreground">Enter untuk kirim · Shift+Enter untuk baris baru</span>
                <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={!input.trim()} aria-label="Kirim pesan"><ArrowUp aria-hidden="true" /></InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="mt-3 text-center text-xs text-muted-foreground">Pratinjau antarmuka. Balasan AI belum terhubung.</p>
          </form>
        </div>
      </section>
    </div>
  )
}
