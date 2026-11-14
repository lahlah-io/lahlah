import { useMemo } from "react";

import { FanGallery } from "@/shared/components/gallery/fan-gallery";
import type { ItineraryDay } from "@/shared/types/itinerary";

/** Galeri kipas foto destinasi; dipakai hero trip di chat dan arsip trip. */
export function TripGallery({ days }: { days: ItineraryDay[] }) {
  const items = useMemo(
    () =>
      days.flatMap((day) =>
        day.destinations.map((destination) => ({
          alt: destination.name,
          src: destination.photo,
        })),
      ),
    [days],
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
