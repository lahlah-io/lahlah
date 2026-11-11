import { useMemo } from "react";

import { FanGallery } from "./gallery/fan-gallery";
import { ITINERARY_DAYS } from "@/shared/data/itinerary";

export function TripGallery() {
  const items = useMemo(
    () =>
      ITINERARY_DAYS.flatMap((day) =>
        day.destinations.map((destination) => ({
          alt: destination.name,
          src: destination.photo,
        })),
      ),
    [],
  );

  return (
    <FanGallery
      items={items}
      ariaLabel="Galeri foto destinasi"
      className="pt-2"
      cardWidth={140}
      trigger="scroll"
      once
    />
  );
}
