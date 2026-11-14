import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  MapPin,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/shared/components/ui/button";
import type { Checkpoint } from "@/shared/types/checkpoint";
import type { ItineraryDestination, Trip } from "@/shared/types/itinerary";
import { distanceMeters, formatDistance } from "@/shared/utils/geo";

type DestinationEntry = {
  dayLabel: string;
  destination: ItineraryDestination;
};

type TripDestinationCarouselProps = {
  trip: Trip;
  checkpoints: Checkpoint[];
  /** Index kartu yang tampil; halaman mengatur peta dari sini. */
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onRequestCheckpoint: (destination: ItineraryDestination) => void;
  /** Tutup kartu dan kembalikan peta ke seluruh rute. */
  onClose: () => void;
};

function DestinationCard({
  dayLabel,
  destination,
  checkpoint,
  onRequestCheckpoint,
  onClose,
}: {
  dayLabel: string;
  destination: ItineraryDestination;
  checkpoint?: Checkpoint;
  onRequestCheckpoint: (destination: ItineraryDestination) => void;
  onClose: () => void;
}) {
  const distance = checkpoint
    ? distanceMeters(destination.coordinates, checkpoint)
    : null;

  return (
    <article
      aria-label={destination.name}
      className="relative flex h-40 w-full shrink-0 flex-col gap-2.5 overflow-hidden rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Tutup kartu"
        className="absolute top-2 right-2"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </Button>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="relative size-20 shrink-0">
          <img
            src={destination.photo}
            alt={destination.name}
            loading="lazy"
            className="size-full rounded-xl object-cover"
          />
          {checkpoint ? (
            <span className="absolute bottom-1 left-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[0.6rem] font-medium backdrop-blur">
              Checkpoint
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 pr-8">
          <p className="text-[0.7rem] font-medium text-muted-foreground">
            {dayLabel} · {destination.timeRange}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-semibold">
            {destination.name}
          </h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Star
              aria-hidden="true"
              className="size-3 shrink-0 fill-amber-400 text-amber-400"
            />
            {destination.rating}
          </p>

          {checkpoint ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-green">
              <CircleCheck aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">
                Selesai
                {distance !== null ? ` · ${formatDistance(distance)}` : null}
              </span>
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">Belum checkpoint</span>
            </p>
          )}
        </div>
      </div>

      <Button
        type="button"
        size="default"
        variant={checkpoint ? "outline" : "default"}
        aria-label={
          checkpoint
            ? `Ulangi checkpoint ${destination.name}`
            : `Ambil checkpoint ${destination.name}`
        }
        className="w-full shrink-0"
        onClick={() => onRequestCheckpoint(destination)}
      >
        <Camera aria-hidden="true" className="size-4" />
      </Button>
    </article>
  );
}

/**
 * Satu kartu destinasi di bawah peta, bisa digeser atau dipindah lewat panah.
 *
 * Tiap kartu selebar container (snap per kartu), jadi posisi scroll dibagi
 * `clientWidth` langsung menjadi index. Panah hanya muncul saat hover/fokus,
 * sehingga di layar sentuh cukup digeser. Selama scroll programatik berjalan,
 * event scroll diabaikan supaya animasi panah tidak melawan pembacaan index.
 */
export function TripDestinationCarousel({
  trip,
  checkpoints,
  activeIndex,
  onActiveChange,
  onRequestCheckpoint,
  onClose,
}: TripDestinationCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const snapTimer = useRef<number | null>(null);

  const destinations = useMemo<DestinationEntry[]>(
    () =>
      trip.days.flatMap((day) =>
        day.destinations.map((destination) => ({
          dayLabel: day.dayLabel,
          destination,
        })),
      ),
    [trip],
  );

  const checkpointByDestination = useMemo(
    () =>
      new Map(
        checkpoints.map((checkpoint) => [
          checkpoint.destinationId,
          checkpoint,
        ]),
      ),
    [checkpoints],
  );

  const total = destinations.length;
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(total - 1, 0));

  useEffect(
    () => () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
      }
      if (snapTimer.current !== null) {
        window.clearTimeout(snapTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || total === 0) return;

    const width = scroller.clientWidth;
    if (!width) return;

    const target = safeIndex * width;
    if (Math.abs(scroller.scrollLeft - target) < 1) return;

    scroller.scrollTo({ left: target, behavior: "smooth" });

    // Sebagian browser mengabaikan smooth scroll kedua saat animasi
    // sebelumnya belum selesai. Kalau kartu belum sampai, paksa posisinya
    // supaya panah tidak pernah "diam".
    snapTimer.current = window.setTimeout(() => {
      snapTimer.current = null;
      const node = scrollerRef.current;
      if (!node) return;
      if (Math.abs(node.scrollLeft - target) > 1) {
        node.scrollLeft = target;
      }
    }, 700);

    return () => {
      if (snapTimer.current !== null) {
        window.clearTimeout(snapTimer.current);
        snapTimer.current = null;
      }
    };
  }, [safeIndex, total]);

  if (total === 0) return null;

  /** Geser/roda dari pengguna membatalkan paksa-posisi panah. */
  function cancelProgrammaticScroll() {
    if (snapTimer.current !== null) {
      window.clearTimeout(snapTimer.current);
      snapTimer.current = null;
    }
  }

  function handleScroll() {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
    }

    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;

      const scroller = scrollerRef.current;
      if (!scroller) return;

      const width = scroller.clientWidth;
      if (!width) return;

      const index = Math.round(scroller.scrollLeft / width);
      const clamped = Math.min(Math.max(index, 0), total - 1);
      if (clamped !== safeIndex) {
        onActiveChange(clamped);
      }
    }, 120);
  }

  return (
    <section aria-label="Destinasi trip" className="w-full">
      <div className="group relative">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onPointerDown={cancelProgrammaticScroll}
          onWheel={cancelProgrammaticScroll}
          className="flex w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {destinations.map(({ dayLabel, destination }, index) => (
            <div
              key={destination.id}
              aria-hidden={index !== safeIndex}
              inert={index !== safeIndex}
              className="w-full shrink-0 snap-center px-1"
            >
              <DestinationCard
                dayLabel={dayLabel}
                destination={destination}
                checkpoint={checkpointByDestination.get(destination.id)}
                onRequestCheckpoint={onRequestCheckpoint}
                onClose={onClose}
              />
            </div>
          ))}
        </div>

        {safeIndex > 0 ? (
          <div className="pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Destinasi sebelumnya"
              className="rounded-full border-border bg-background/95 shadow-lg backdrop-blur"
              onClick={() => onActiveChange(safeIndex - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {safeIndex < total - 1 ? (
          <div className="pointer-events-none absolute top-1/2 right-2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Destinasi berikutnya"
              className="rounded-full border-border bg-background/95 shadow-lg backdrop-blur"
              onClick={() => onActiveChange(safeIndex + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
