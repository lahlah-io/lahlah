import { memo, useRef, useState } from "react";
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/components/ui/sidebar";

import type { ChatThread } from "../types/chat";

interface ThreadItemProps {
  isActive: boolean;
  isEditing: boolean;
  onCancelEdit: () => void;
  onConfirmDelete: (thread: ChatThread) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  thread: ChatThread;
}

export const ThreadItem = memo(function ThreadItem({
  isActive,
  isEditing,
  onCancelEdit,
  onConfirmDelete,
  onRename,
  onSelect,
  onStartEdit,
  thread,
}: ThreadItemProps) {
  if (isEditing) {
    return (
      <ThreadRenameField
        initialTitle={thread.title}
        onCancel={onCancelEdit}
        onRename={(title) => onRename(thread.id, title)}
      />
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={thread.title}
        onClick={() => onSelect(thread.id)}
        aria-current={isActive ? "page" : undefined}
      >
        <MessageSquare aria-hidden="true" />
        <span className="truncate">{thread.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            aria-label={`Opsi untuk ${thread.title}`}
            showOnHover
          >
            <MoreHorizontal aria-hidden="true" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onStartEdit(thread.id)}>
              <Pencil data-icon="inline-start" /> Ubah nama
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onConfirmDelete(thread)}
            >
              <Trash2 data-icon="inline-start" /> Hapus
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
});

function ThreadRenameField({
  initialTitle,
  onCancel,
  onRename,
}: {
  initialTitle: string;
  onCancel: () => void;
  onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState(initialTitle);
  const cancelledRef = useRef(false);

  return (
    <SidebarMenuItem>
      <form
        className="p-0.5"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(draft);
        }}
      >
        <Input
          autoFocus
          aria-label="Nama percakapan"
          className="h-7 text-sm"
          value={draft}
          onBlur={() => {
            if (!cancelledRef.current) onRename(draft);
          }}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelledRef.current = true;
              onCancel();
            }
          }}
        />
      </form>
    </SidebarMenuItem>
  );
}
