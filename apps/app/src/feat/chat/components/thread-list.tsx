import { useCallback, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/shared/components/ui/sidebar";

import { ThreadItem } from "./thread-item";
import type { ChatThread } from "../types/chat";
import { groupThreads } from "../utils/thread-groups";

interface ThreadListProps {
  /** `null` while a fresh draft is open — no row is current then. */
  activeId: string | null;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  threads: ChatThread[];
}

export function ThreadList({
  activeId,
  onDelete,
  onRename,
  onSelect,
  threads,
}: ThreadListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChatThread | null>(null);

  const groups = useMemo(() => groupThreads(threads), [threads]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  const handleCancelEdit = useCallback(() => setEditingId(null), []);

  const handleStartEdit = useCallback((id: string) => setEditingId(id), []);

  const handleRename = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      setEditingId(null);
      const thread = threads.find((item) => item.id === id);
      if (clean && thread && clean !== thread.title) onRename(id, clean);
    },
    [onRename, threads],
  );

  const handleConfirmDelete = useCallback(
    (thread: ChatThread) => setPendingDelete(thread),
    [],
  );

  return (
    <>
      <SidebarContent aria-label="Riwayat percakapan" role="navigation">
        {groups.length === 0 ? (
          <SidebarGroup>
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Belum ada percakapan</EmptyTitle>
                <EmptyDescription>
                  Percakapan yang kamu mulai akan muncul di sini.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </SidebarGroup>
        ) : (
          groups.map((group) => (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.threads.map((thread) => (
                    <ThreadItem
                      key={thread.id}
                      thread={thread}
                      isActive={thread.id === activeId}
                      isEditing={thread.id === editingId}
                      onSelect={handleSelect}
                      onStartEdit={handleStartEdit}
                      onCancelEdit={handleCancelEdit}
                      onRename={handleRename}
                      onConfirmDelete={handleConfirmDelete}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus percakapan?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” akan dihapus dari browser ini. Tindakan
              ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
