import { ImageIcon, Star } from "lucide-react";

import type { ItineraryDestination } from "../types/itinerary";

function DestinationCard({ destination }: { destination: ItineraryDestination }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-2">
      <div
        aria-hidden="true"
        className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
      >
        <ImageIcon className="size-4" />
      </div>
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
    </div>
  );
}

export { DestinationCard };
