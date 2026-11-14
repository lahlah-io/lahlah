import { useState } from "react";

import type {
  ItineraryDay,
  ItineraryDestination,
} from "@/shared/types/itinerary";

import { DestinationCard } from "./destination-card";
import { DestinationDetail } from "./destination-detail";

type SelectedDestination = {
  day: ItineraryDay;
  destination: ItineraryDestination;
};

type TripStepperProps = {
  days: ItineraryDay[];
  /** Diisi halaman arsip: destinasi yang punya checkpoint ditandai selesai. */
  checkpointIds?: Set<string>;
};

/**
 * Timeline itinerary: rel hari di kiri, ringkasan hari, lalu kartu destinasi.
 *
 * Panel Trip di chat dan arsip trip memakai komponen yang sama; arsip hanya
 * menambahkan status checkpoint lewat `checkpointIds`.
 */
export function TripStepper({ days, checkpointIds }: TripStepperProps) {
  const [selected, setSelected] = useState<SelectedDestination | null>(null);

  const selectedStatus =
    checkpointIds && selected
      ? checkpointIds.has(selected.destination.id)
        ? "done"
        : "missed"
      : undefined;

  return (
    <>
      <ol
        aria-label="Langkah itinerary"
        className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 sm:px-6"
      >
        {days.map((day, index) => {
          const isLast = index === days.length - 1;
          return (
            <li
              key={day.id}
              className="relative grid grid-cols-[2.5rem_4.5rem_1fr] gap-3 sm:gap-4"
            >
              <div className="relative flex justify-center">
                {isLast ? null : (
                  <span
                    aria-hidden="true"
                    className="absolute top-10 -bottom-8 w-px bg-border"
                  />
                )}
                <span className="z-10 grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <day.icon aria-hidden="true" className="size-5" />
                </span>
              </div>

              <div>
                <p className="text-sm font-semibold">{day.dayLabel}</p>
                <p className="text-xs text-muted-foreground">{day.date}</p>
              </div>

              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-tight">
                  {day.city}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {day.summary}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {day.destinations.map((destination) => (
                    <DestinationCard
                      key={destination.id}
                      destination={destination}
                      status={
                        checkpointIds
                          ? checkpointIds.has(destination.id)
                            ? "done"
                            : "missed"
                          : undefined
                      }
                      onSelect={() => setSelected({ day, destination })}
                    />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <DestinationDetail
        day={selected?.day ?? null}
        destination={selected?.destination ?? null}
        status={selectedStatus}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
