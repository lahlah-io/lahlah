import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { CheckpointDialog } from "@/shared/components/trip/checkpoint-dialog";
import { Button } from "@/shared/components/ui/button";
import { useCheckpoints } from "@/shared/hooks/use-checkpoints";
import type { ItineraryDestination, Trip } from "@/shared/types/itinerary";

import { TripCheckpointMap } from "./trip-checkpoint-map";
import { TripDestinationCarousel } from "./trip-destination-carousel";
import { TripDestinationMenu } from "./trip-destination-menu";

/**
 * Live trip detail: peta penuh layar, kartu destinasi muncul setelah salah
 * satu pin ditekan.
 *
 * Peta awalnya menampilkan seluruh rute. Memilih destinasi mendekatkan peta
 * dan membuka kartu; menutup kartu mengembalikan peta ke seluruh rute.
 */
export function LiveTripDetail({ trip }: { trip: Trip }) {
  const { summary, days } = trip;
  const navigate = useNavigate();
  const { checkpoints, saveCheckpoint } = useCheckpoints(trip.id);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [cameraDestination, setCameraDestination] =
    useState<ItineraryDestination | null>(null);

  const destinations = days.flatMap((day) => day.destinations);
  const selectedDestination =
    selectedIndex === null ? null : (destinations[selectedIndex] ?? null);

  function handleSelect(destination: ItineraryDestination) {
    const index = destinations.findIndex(
      (item) => item.id === destination.id,
    );
    setSelectedIndex(index === -1 ? null : index);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute inset-0">
        <TripCheckpointMap
          trip={trip}
          checkpoints={checkpoints}
          selectedDestination={selectedDestination}
          onSelectDestination={handleSelect}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3">
        <div className="pointer-events-auto inline-flex max-w-[calc(100%-5rem)] items-center gap-1 rounded-full border border-border bg-background/95 py-1 pr-3 pl-1 shadow-lg backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Kembali ke Beranda"
            onClick={() => navigate("/home")}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{summary.title}</p>
            <p className="truncate text-[0.65rem] text-muted-foreground">
              {summary.eyebrow} · {summary.dates}
            </p>
          </div>
        </div>
      </header>

      {selectedDestination ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4">
          <div className="pointer-events-auto mx-auto w-full max-w-xl px-3 pb-3 sm:px-4">
            <TripDestinationCarousel
              trip={trip}
              checkpoints={checkpoints}
              activeIndex={selectedIndex ?? 0}
              onActiveChange={setSelectedIndex}
              onRequestCheckpoint={setCameraDestination}
              onClose={() => setSelectedIndex(null)}
            />
          </div>
        </div>
      ) : (
        <TripDestinationMenu
          trip={trip}
          checkpoints={checkpoints}
          onSelect={handleSelect}
        />
      )}

      <CheckpointDialog
        trip={trip}
        expectedDestinationId={cameraDestination?.id}
        open={cameraDestination !== null}
        onOpenChange={(open) => {
          if (!open) setCameraDestination(null);
        }}
        onSave={saveCheckpoint}
      />
    </div>
  );
}
