import { Check, Minus, Star } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import type { ItineraryDestination } from "@/shared/types/itinerary";

type DestinationCardProps = {
  destination: ItineraryDestination;
  onSelect: () => void;
  /** Penanda status arsip; kosong berarti kartu dipakai apa adanya di chat. */
  status?: "done" | "missed";
};

function DestinationCard({
  destination,
  onSelect,
  status,
}: DestinationCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Lihat detail ${destination.name}`}
      className="flex w-full items-center gap-3 rounded-xl border bg-card p-2 text-left transition-colors hover:bg-accent/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
    >
      <img
        src={destination.photo}
        alt=""
        loading="lazy"
        className="size-14 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <time className="tabular-nums">{destination.timeRange}</time>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Star aria-hidden="true" className="size-3 fill-current" />
            {destination.rating}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium">{destination.name}</p>
      </div>

      {status ? (
        <Badge variant={status === "done" ? "secondary" : "outline"}>
          {status === "done" ? (
            <Check data-icon="inline-start" aria-hidden="true" />
          ) : (
            <Minus data-icon="inline-start" aria-hidden="true" />
          )}
          {status === "done" ? "Selesai" : "Terlewat"}
        </Badge>
      ) : null}
    </button>
  );
}

export { DestinationCard };
