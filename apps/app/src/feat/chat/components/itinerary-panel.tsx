import { LoaderCircle, Route } from "lucide-react";

import { TripHero } from "@/shared/components/trip/trip-hero";
import { TripRouteMapCard } from "@/shared/components/trip/trip-route-map-card";
import { TripStepper } from "@/shared/components/trip/trip-stepper";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";

import { ItineraryActions } from "./itinerary-actions";
import { useChatThreadsContext } from "../context/chat-threads-context";

export function ItineraryPanel() {
  const { activeId, itinerary, itineraryLoading, sessionLoading } =
    useChatThreadsContext();

  const trip = itinerary?.trip ?? null;
  const waiting = itineraryLoading || (sessionLoading && !trip);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <h2 className="sr-only">Trip</h2>
      <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">
        {waiting ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Memuat itinerary…
          </div>
        ) : trip ? (
          <div className="flex flex-col gap-6 pt-6 pb-8">
            <TripHero trip={trip} />
            <TripRouteMapCard trip={trip} />
            <TripStepper days={trip.days} />
          </div>
        ) : (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Route aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Belum ada itinerary</EmptyTitle>
              <EmptyDescription>
                {activeId
                  ? "Minta Lahlah AI menyusun trip di percakapan ini, misalnya “buat itinerary pantai besok pagi”."
                  : "Mulai percakapan dulu, lalu minta itinerary satu hari di Padang."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      {trip ? <ItineraryActions /> : null}
    </div>
  );
}
