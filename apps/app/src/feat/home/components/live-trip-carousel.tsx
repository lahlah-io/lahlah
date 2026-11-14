import { Camera } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/shared/components/ui/button";
import { TripRouteMap } from "@/shared/components/trip/trip-route-map";
import { CheckpointDialog } from "@/shared/components/trip/checkpoint-dialog";
import { getTripPath, getTripWaypoints, LIVE_TRIPS } from "@/shared/data/itinerary";
import { useCheckpoints } from "@/shared/hooks/use-checkpoints";
import type { Trip } from "@/shared/types/itinerary";

/** Card Live trip: peta penuh, judul di atas, tombol foto di bawah. */
function LiveTripCard({ trip }: { trip: Trip }) {
  const { summary } = trip;
  const { checkpoints, saveCheckpoint } = useCheckpoints(trip.id);
  const [cameraOpen, setCameraOpen] = useState(false);

  return (
    <li className="w-[64%] max-w-64 shrink-0 snap-start">
      <article className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border bg-muted">
        <TripRouteMap
          waypoints={getTripWaypoints(trip)}
          label={`Peta rute ${summary.title}`}
          checkpoints={checkpoints}
        />

        <Link
          to={getTripPath(trip)}
          aria-label={`Buka detail trip ${summary.title}`}
          className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/75 via-background/30 to-transparent p-4 pb-20">
          <h3 className="text-2xl leading-[1.05] font-semibold tracking-tight text-balance">
            {summary.title}
          </h3>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background/85 via-background/40 to-transparent p-3 pt-20">
          <Button
            type="button"
            aria-label={`Ambil foto checkpoint untuk ${summary.title}`}
            onClick={() => setCameraOpen(true)}
            className="pointer-events-auto w-full shadow-lg"
          >
            <Camera aria-hidden="true" />
            Ambil foto
          </Button>
        </div>
      </article>

      <CheckpointDialog
        trip={trip}
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onSave={saveCheckpoint}
      />
    </li>
  );
}

/** Section pertama Beranda: carousel horizontal trip yang sedang berjalan. */
export function LiveTripCarousel() {
  if (LIVE_TRIPS.length === 0) return null;

  return (
    <section aria-labelledby="live-trip-heading" className="pt-4 pb-5">
      <div className="flex items-baseline justify-between px-4 pb-3">
        <h2 id="live-trip-heading" className="text-sm font-semibold">
          Live trip
        </h2>
        <span className="text-xs text-muted-foreground">
          {LIVE_TRIPS.length} sedang berjalan
        </span>
      </div>

      <ul
        aria-label="Trip yang sedang berjalan"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LIVE_TRIPS.map((trip) => (
          <LiveTripCard key={trip.id} trip={trip} />
        ))}
      </ul>
    </section>
  );
}
