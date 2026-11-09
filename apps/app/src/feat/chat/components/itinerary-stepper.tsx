import { DestinationCard } from "./destination-card";

import { ITINERARY_DAYS } from "../data/itinerary";

export function ItineraryStepper() {
  return (
    <ol
      className="flex flex-col gap-8 px-4 sm:px-6"
      aria-label="Langkah itinerary"
    >
      {ITINERARY_DAYS.map((day, index) => {
        const isLast = index === ITINERARY_DAYS.length - 1;
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
                  />
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
