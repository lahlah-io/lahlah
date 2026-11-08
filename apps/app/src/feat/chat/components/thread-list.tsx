import {
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { cn } from "@/shared/utils/cn";

import type { ChatThread } from "../types/chat";

interface ThreadListProps {
  /** `null` while a fresh draft is open — no row is current then. */
  activeId: string | null;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onQueryChange: (value: string) => void;
  onRename: (id: string) => void;
  onSelect: (id: string) => void;
  query: string;
  threads: ChatThread[];
}

export function ThreadList({
  activeId,
  onCreate,
  onDelete,
  onQueryChange,
  onRename,
  onSelect,
  query,
  threads,
}: ThreadListProps) {
  const filtered = threads
    .filter((thread) => thread.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">Lahlah AI</p>
          <p className="text-xs text-muted-foreground">Ruang percakapan</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3">
        <Button className="w-full justify-start" onClick={onCreate}>
          <Plus data-icon="inline-start" /> Percakapan baru
        </Button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Cari percakapan"
            className="pl-9"
            placeholder="Cari percakapan..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </div>
      <div className="px-5 pt-4 pb-1 text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Riwayat
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-1 pb-4">
          {filtered.length === 0 ? (
            <p className="px-3 py-5 text-sm text-muted-foreground">
              Tidak ada percakapan yang cocok.
            </p>
          ) : null}
          {filtered.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                "group flex min-w-0 items-center rounded-lg pr-1 transition-colors hover:bg-sidebar-accent",
                thread.id === activeId &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <button
                type="button"
                aria-current={thread.id === activeId ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelect(thread.id)}
              >
                <MessageSquare
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{thread.title}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Opsi untuk ${thread.title}`}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRename(thread.id)}>
                    <Pencil data-icon="inline-start" /> Ubah nama
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(thread.id)}
                  >
                    <Trash2 data-icon="inline-start" /> Hapus
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Avatar className="size-9">
          <AvatarFallback>
            <User className="size-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Pengguna</p>
          <p className="text-xs text-muted-foreground">Pratinjau lokal</p>
        </div>
      </div>
    </div>
  );
}
