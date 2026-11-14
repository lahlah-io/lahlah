import { Camera, CircleCheck, ListOrdered, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import type { Checkpoint } from "@/shared/types/checkpoint";
import type { ItineraryDestination, Trip } from "@/shared/types/itinerary";
import { cn } from "@/shared/utils/cn";

/**
 * Tombol melayang di bawah kanan: daftar destinasi trip berurutan.
 *
 * Muncul saat tidak ada kartu yang terbuka, supaya pengguna tahu destinasi
 * pertama tanpa harus menebak pin di peta. Hover (atau klik/fokus) membuka
 * popover; daftar dipisah per hari lewat tab "Day 1", "Day 2", dst.
 */
export function TripDestinationMenu({
  trip,
  checkpoints,
  onSelect,
}: {
  trip: Trip;
  checkpoints: Checkpoint[];
  onSelect: (destination: ItineraryDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeDayId, setActiveDayId] = useState(trip.days[0]?.id ?? "");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const checkpointIds = useMemo(
    () => new Set(checkpoints.map((checkpoint) => checkpoint.destinationId)),
    [checkpoints],
  );

  const orderByDestination = useMemo(() => {
    const order = new Map<string, number>();
    let index = 0;
    for (const day of trip.days) {
      for (const destination of day.destinations) {
        index += 1;
        order.set(destination.id, index);
      }
    }
    return order;
  }, [trip]);

  // Maksimal tiga gambar destinasi ditumpuk; yang pertama paling depan.
  const stack = useMemo(
    () =>
      trip.days
        .flatMap((day) => day.destinations.map((destination) => destination))
        .slice(0, 3),
    [trip],
  );

  const activeDay =
    trip.days.find((day) => day.id === activeDayId) ?? trip.days[0];
  const destinations = activeDay?.destinations ?? [];

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto absolute right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 md:right-6 md:bottom-6"
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            key="trip-destination-menu"
            id="trip-destination-menu"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            style={{ transformOrigin: "bottom right" }}
            className="absolute right-0 bottom-full mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur"
          >
          <p className="px-1 text-xs font-semibold text-muted-foreground">
            Destinasi trip
          </p>

          {trip.days.length > 0 ? (
            <div
              role="tablist"
              aria-label="Pilih hari"
              className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {trip.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  role="tab"
                  aria-selected={day.id === (activeDay?.id ?? "")}
                  onClick={() => setActiveDayId(day.id)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    day.id === (activeDay?.id ?? "")
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {day.dayLabel}
                </button>
              ))}
            </div>
          ) : null}

          <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {destinations.map((destination) => {
              const done = checkpointIds.has(destination.id);
              const number = orderByDestination.get(destination.id) ?? 0;

              return (
                <li key={destination.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(destination);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.7rem] font-semibold tabular-nums">
                      {number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {destination.name}
                      </span>
                      <span className="flex items-center gap-1 truncate text-[0.7rem] text-muted-foreground">
                        {destination.timeRange}
                        <span aria-hidden="true">·</span>
                        <Star
                          aria-hidden="true"
                          className="size-2.5 shrink-0 fill-amber-400 text-amber-400"
                        />
                        {destination.rating}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 text-[0.7rem]",
                        done ? "text-green" : "text-muted-foreground",
                      )}
                    >
                      {done ? (
                        <CircleCheck aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Camera aria-hidden="true" className="size-3.5" />
                      )}
                      {done ? "Selesai" : "Belum"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        initial="rest"
        animate="rest"
        whileHover="hover"
        className="inline-block"
      >
        <Button
          type="button"
          size="lg"
          aria-label="Daftar destinasi"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls="trip-destination-menu"
          className="size-16 cursor-pointer aspect-square rounded-lg bg-black p-1.5 text-white shadow-lg hover:bg-neutral-900"
          onClick={() => setOpen((current) => !current)}
        >
          {stack.length > 0 ? (
            <span
              aria-hidden="true"
              className="relative block size-full"
            >
              {stack.map((destination, index) => (
                <motion.img
                  key={destination.id}
                  src={destination.photo}
                  alt=""
                  loading="lazy"
                  variants={{
                    rest: {
                      x: (index - 1) * 3,
                      y: 0,
                      rotate: [-20, 0, 20][index] ?? 0,
                    },
                    hover: {
                      x: (index - 1) * 5,
                      y: -1,
                      rotate: ([-20, 0, 20][index] ?? 0) * 1.1,
                    },
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  style={{ zIndex: stack.length - index }}
                  className="absolute top-1/2 left-1/2 -mt-4 -ml-4 size-8 rounded-sm border-2 border-background object-cover shadow-sm"
                />
              ))}
            </span>
          ) : (
            <ListOrdered aria-hidden="true" />
          )}
        </Button>
      </motion.div>
    </div>
  );
}
