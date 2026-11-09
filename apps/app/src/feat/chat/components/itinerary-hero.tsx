import { motion } from "motion/react";
import { CalendarDays, MapPin, Milestone } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";

import { TRIP_SUMMARY } from "../data/itinerary";
import { TripGallery } from "./trip-gallery";

const META = [
  { icon: CalendarDays, label: TRIP_SUMMARY.dates },
  { icon: MapPin, label: `Berakhir di ${TRIP_SUMMARY.destination}` },
  { icon: Milestone, label: `Total ${TRIP_SUMMARY.distance}` },
] as const;

export function ItineraryHero() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full"
      >
        <TripGallery />
      </motion.div>

      <section
        aria-label="Ringkasan perjalanan"
        className="flex flex-col items-center px-4 pt-2 pb-6 text-center sm:px-6"
      >
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {TRIP_SUMMARY.title}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-3 max-w-md text-sm leading-6 text-muted-foreground"
        >
          {TRIP_SUMMARY.description}
        </motion.p>

        <motion.ul
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-5 flex flex-wrap justify-center gap-2.5"
          aria-label="Detail perjalanan"
        >
          {META.map((item) => (
            <li key={item.label}>
              <Badge variant="outline" className="px-2.5">
                <item.icon data-icon="inline-start" />
                {item.label}
              </Badge>
            </li>
          ))}
          <li>
            <Badge variant="secondary" className="px-2.5">
              {TRIP_SUMMARY.duration}
            </Badge>
          </li>
        </motion.ul>
      </section>
    </div>
  );
}
