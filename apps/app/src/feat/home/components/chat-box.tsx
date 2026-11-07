"use client"

import { useState, useCallback } from "react"
import { Send, Plus, Search, MoreHorizontal, Trash2, Pencil, MessageSquare, User, Bot } from "lucide-react"

import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/shared/components/ui/message-scroller"
import { Message, MessageContent } from "@/shared/components/ui/message"
import { Bubble, BubbleContent } from "@/shared/components/ui/bubble"
import { InputGroup, InputGroupInput, InputGroupButton } from "@/shared/components/ui/input-group"
import { Button } from "@/shared/components/ui/button"
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar"
import { ScrollArea } from "@/shared/components/ui/scroll-area"
import { Separator } from "@/shared/components/ui/separator"
import { TooltipProvider } from "@/shared/components/ui/tooltip"
import { Badge } from "@/shared/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu"

type MessageRole = "user" | "assistant"

type ChatMessage = { id: string; text: string; role: MessageRole }

type ChatThread = { id: string; title: string; messages: ChatMessage[] }

export function ChatBox() {
  const [threads, setThreads] = useState<ChatThread[]>([
    { id: "1", title: "Percakapan baru", messages: [{ id: "1", text: "Halo! Ada yang bisa saya bantu?", role: "assistant" }] },
  ])
  const [activeId, setActiveId] = useState("1")
  const [input, setInput] = useState("")

  const activeThread = threads.find((t) => t.id === activeId) ?? threads[0]
  const messages = activeThread?.messages ?? []

  const setMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, messages: updater(t.messages) } : t))
    )
  }, [activeId])

  const createNewChat = useCallback(() => {
    const id = crypto.randomUUID()
    setThreads((prev) => [...prev, { id, title: "Percakapan baru", messages: [{ id: crypto.randomUUID(), text: "Halo! Ada yang bisa saya bantu?", role: "assistant" }] }])
    setActiveId(id)
  }, [])

  const deleteThread = useCallback((id: string) => {
    setThreads((prev) => {
      const rest = prev.filter((t) => t.id !== id)
      if (rest.length === 0) {
        const nid = crypto.randomUUID()
        setActiveId(nid)
        return [{ id: nid, title: "Percakapan baru", messages: [{ id: crypto.randomUUID(), text: "Halo! Ada yang bisa saya bantu?", role: "assistant" }] }]
      }
      if (id === activeId) setActiveId(rest[0]!.id)
      return rest
    })
  }, [activeId])

  const renameThread = useCallback((id: string) => {
    const title = window.prompt("Nama chat baru:")
    if (!title) return
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
  }, [])

  const sendMessage = useCallback(() => {
    if (!input.trim()) return

    const userMessage: ChatMessage = { id: crypto.randomUUID(), text: input.trim(), role: "user" }
    setMessages((prev) => [...prev, userMessage])
    const text = input.trim()
    setInput("")

    // Update title based on first user message
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeId && t.title === "Percakapan baru" ? { ...t, title: text.slice(0, 30) } : t
      )
    )

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: `Diterima: ${text}`, role: "assistant" },
      ])
    }, 800)
  }, [input, activeId, setMessages])

  return (
    <TooltipProvider>
      <div className="flex h-[85vh] w-full">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="p-3">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={createNewChat}>
              <Plus className="size-4" /> Chat baru
            </Button>
          </div>
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                className="w-full h-8 rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Cari chat..."
              />
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors ${
                    t.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{t.title}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => renameThread(t.id)}>
                        <Pencil className="size-4 mr-2" /> Ubah nama
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteThread(t.id)} className="text-destructive">
                        <Trash2 className="size-4 mr-2" /> Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-3 flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Pengguna</p>
              <p className="text-xs text-muted-foreground truncate">Gratis</p>
            </div>
            <Badge variant="secondary">Pro</Badge>
          </div>
        </aside>

        {/* Main chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b border-border flex items-center px-4 gap-2 shrink-0">
            <span className="text-sm font-medium truncate">{activeThread?.title ?? "Percakapan"}</span>
          </header>

          <MessageScrollerProvider>
            <MessageScroller className="flex-1 min-h-0 w-full">
              <MessageScrollerViewport>
                <MessageScrollerContent className="max-w-3xl mx-auto w-full px-4">
                  {messages.map((m) => (
                    <MessageScrollerItem key={m.id}>
                      <Message align={m.role === "user" ? "end" : "start"}>
                        <MessageContent>
                          <div className="flex gap-3">
                            <Avatar className="size-7 shrink-0">
                              <AvatarFallback className={m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}>
                                {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                              </AvatarFallback>
                            </Avatar>
                            <Bubble align={m.role === "user" ? "end" : "start"} variant={m.role === "user" ? "default" : "muted"}>
                              <BubbleContent>{m.text}</BubbleContent>
                            </Bubble>
                          </div>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton direction="end" />
            </MessageScroller>
          </MessageScrollerProvider>

          <div className="border-t border-border p-4 shrink-0">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage() }} className="max-w-3xl mx-auto">
              <InputGroup className="h-12">
                <InputGroupInput
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Kirim pesan..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                />
                <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={!input.trim()}>
                  <Send className="size-4" />
                </InputGroupButton>
              </InputGroup>
              <p className="text-xs text-muted-foreground text-center mt-2">
                ChatGPT-like UI dibangun dengan shadcn/ui. Respons adalah simulasi.
              </p>
            </form>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
