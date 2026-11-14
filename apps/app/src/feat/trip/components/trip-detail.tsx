import { useMemo } from "react";

import { TripHero } from "@/shared/components/trip/trip-hero";
import { TripRouteMapCard } from "@/shared/components/trip/trip-route-map-card";
import { TripStepper } from "@/shared/components/trip/trip-stepper";
import { useCheckpoints } from "@/shared/hooks/use-checkpoints";
import type { Trip } from "@/shared/types/itinerary";

import { TripDetailActions } from "./trip-detail-actions";

/**
 * Detail trip: susunan yang sama dengan panel Trip di chat, tanpa aksi
 * checkpoint. Peta penuh layar tetap milik halaman live.
 */
export function TripDetail({ trip }: { trip: Trip }) {
  const { checkpoints } = useCheckpoints(trip.id);

  const checkpointIds = useMemo(
    () => new Set(checkpoints.map((checkpoint) => checkpoint.destinationId)),
    [checkpoints],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <h2 className="sr-only">Detail trip</h2>
      <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">
        <div className="flex flex-col gap-6 pt-6 pb-8">
          <TripHero trip={trip} status="Selesai" />
          <TripRouteMapCard trip={trip} />
          <TripStepper days={trip.days} checkpointIds={checkpointIds} />
        </div>
      </div>
      <TripDetailActions trip={trip} />
    </div>
  );
}
