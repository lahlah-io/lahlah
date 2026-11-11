import { useMemo } from "react";
import { ImageIcon } from "lucide-react";

import { ITINERARY_DAYS } from "@/shared/data/itinerary";

interface GridItem {
  city: string;
  dayLabel: string;
  id: string;
  name: string;
  rating: string;
  timeRange: string;
}

/** Grid 3 kolom ala Instagram. Fotonya masih placeholder. */
export function ItineraryGrid() {
  const items = useMemo<GridItem[]>(
    () =>
      ITINERARY_DAYS.flatMap((day) =>
        day.destinations.map((destination) => ({
          city: day.city,
          dayLabel: day.dayLabel,
          id: destination.id,
          name: destination.name,
          rating: destination.rating,
          timeRange: destination.timeRange,
        })),
      ),
    [],
  );

  return (
    <ul aria-label="Grid itinerary" className="grid grid-cols-3 gap-[2px]">
      {items.map((item) => (
        <li
          key={item.id}
          className="group relative aspect-square overflow-hidden bg-muted"
        >
          {/* Placeholder sampai foto destinasi tersedia. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center bg-gradient-to-br from-muted to-muted-foreground/15"
          >
            <ImageIcon className="size-6 text-muted-foreground/50" />
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pb-1.5 transition-opacity group-hover:opacity-0">
            <p className="truncate text-[0.7rem] font-medium text-white">
              {item.name}
            </p>
          </div>

          <div className="absolute inset-0 flex flex-col justify-end gap-0.5 bg-black/70 p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate text-xs font-semibold text-white">
              {item.name}
            </p>
            <p className="text-[0.7rem] text-white/80">{item.rating}</p>
            <p className="text-[0.7rem] text-white/80">
              {item.dayLabel} · {item.timeRange}
            </p>
            <p className="truncate text-[0.7rem] text-white/80">
              {item.city}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
