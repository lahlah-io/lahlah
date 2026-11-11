import { memo } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import { ThreadList } from "./thread-list";
import type { ChatThread } from "../types/chat";

interface ThreadPanelContentProps {
  activeId: string | null;
  onCreate: () => void;
  onDelete: (id: string) => void;
  /** Closes the mobile sheet after the user picks something. */
  onNavigate?: () => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  threads: ChatThread[];
}

export const ThreadPanelContent = memo(function ThreadPanelContent({
  activeId,
  onCreate,
  onDelete,
  onNavigate,
  onRename,
  onSelect,
  threads,
}: ThreadPanelContentProps) {
  function handleCreate() {
    onCreate();
    onNavigate?.();
  }

  function handleSelect(id: string) {
    onSelect(id);
    onNavigate?.();
  }

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 p-3">
        <div className="flex h-8 items-center justify-between px-1">
          <p className="text-sm font-semibold">Percakapan</p>
          <span className="text-xs text-muted-foreground">
            {threads.length}
          </span>
        </div>

        <Button
          size="sm"
          className="w-full justify-start font-medium"
          onClick={handleCreate}
        >
          <Plus data-icon="inline-start" /> Percakapan baru
        </Button>
      </div>

      <ThreadList
        threads={threads}
        activeId={activeId}
        onSelect={handleSelect}
        onRename={onRename}
        onDelete={onDelete}
      />
    </>
  );
});
