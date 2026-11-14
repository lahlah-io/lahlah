import { useState } from "react";
import { History, Share2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";

import { useChatThreadsContext } from "../context/chat-threads-context";

/** Share memakai link sesi (titik masuk reload), bukan trip publik (tidak ada). */
function shareUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname.replace(/\/trip$/, "")}`;
}

export function ItineraryActions() {
  const { itinerary, restoring, restoreVersion, versions } =
    useChatThreadsContext();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const selectedVersion = picked ?? itinerary?.currentVersion ?? null;
  const activeVersion = itinerary?.currentVersion ?? null;

  async function handleShare() {
    const title = itinerary?.title ?? "Trip Padang";

    try {
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl() });
      } else {
        await navigator.clipboard.writeText(shareUrl());
      }
    } catch {
      // Pengguna membatalkan dialog bagikan.
    }
  }

  return (
    <div
      className="absolute right-6 bottom-6 z-10 flex flex-col gap-3"
      aria-label="Aksi itinerary"
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Bagikan trip ${itinerary?.title ?? ""}`}
        className="size-14 rounded-lg border border-border shadow-lg [&_svg:not([class*='size-'])]:size-6"
        onClick={handleShare}
      >
        <Share2 aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPicked(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            size="icon"
            aria-label="Riwayat versi itinerary"
            className="size-14 rounded-lg shadow-lg [&_svg:not([class*='size-'])]:size-6"
          >
            <History aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Riwayat versi</DialogTitle>
            <DialogDescription>
              Setiap jawaban baru menyimpan versi. Pulihkan versi lama menjadi
              versi terbaru.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {versions.map((entry) => (
              <li key={entry.version}>
                <button
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => setPicked(entry.version)}
                  aria-pressed={selectedVersion === entry.version}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted aria-pressed:bg-muted"
                >
                  <span className="font-medium">Versi {entry.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.changeType} · {entry.stopCount} stop
                    {entry.version === activeVersion ? " · aktif" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            disabled={
              restoring !== null ||
              selectedVersion === null ||
              selectedVersion === activeVersion
            }
            onClick={() => {
              if (selectedVersion !== null) void restoreVersion(selectedVersion);
            }}
          >
            {restoring !== null ? "Memulihkan…" : "Pulihkan versi"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
