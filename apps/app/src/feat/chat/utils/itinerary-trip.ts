import { Navigation } from "lucide-react";

import type { ItineraryDestination, Trip } from "@/shared/types/itinerary";
import { distanceMeters, formatDistance } from "@/shared/utils/geo";

import type {
  ItineraryDetailDto,
  ItineraryStopDto,
  ItineraryVersionDto,
} from "../types/itinerary";

/** Foto pengganti: destinasi dari API belum menyimpan foto terkurasi. */
const STOP_PHOTO =
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80";

const CATEGORY_LABELS: Record<string, string> = {
  alam: "Alam",
  belanja: "Belanja",
  budaya: "Budaya",
  kuliner: "Kuliner",
  pantai: "Pantai",
  santai: "Santai",
  sejarah: "Sejarah",
};

function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToClock(total: number): string {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(
    bounded % 60,
  ).padStart(2, "0")}`;
}

function formatDate(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return ymd;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function timeRange(stop: ItineraryStopDto, next: ItineraryStopDto | undefined) {
  if (!stop.arrivalTime) return "Jam fleksibel";
  const start = clockToMinutes(stop.arrivalTime);
  if (start === null) return stop.arrivalTime;
  const end =
    next?.arrivalTime != null
      ? clockToMinutes(next.arrivalTime)
      : start + (stop.visitDurationMin ?? 60);
  return `${minutesToClock(start)} - ${minutesToClock(end ?? start + 60)}`;
}

function totalDistance(version: ItineraryVersionDto): number {
  const stops = [...version.stops].sort((a, b) => a.position - b.position);
  return stops.reduce((sum, stop, index) => {
    const next = stops[index + 1];
    if (!next) return sum;
    return (
      sum +
      distanceMeters([stop.longitude, stop.latitude], {
        latitude: next.latitude,
        longitude: next.longitude,
      })
    );
  }, 0);
}

function toDestination(
  stop: ItineraryStopDto,
  next: ItineraryStopDto | undefined,
): ItineraryDestination {
  return {
    coordinates: [stop.longitude, stop.latitude],
    id: stop.destinationId ?? `${stop.position}-${stop.name}`,
    name: stop.name,
    photo: STOP_PHOTO,
    rating: stop.category
      ? (CATEGORY_LABELS[stop.category] ?? stop.category)
      : "Padang",
    timeRange: timeRange(stop, next),
  };
}

/** Satu versi itinerary API menjadi `Trip` bergaya arsip (satu hari). */
export function toTrip(detail: ItineraryDetailDto): Trip | null {
  const version = detail.version;
  if (!version || version.stops.length === 0) return null;

  const stops = [...version.stops].sort((a, b) => a.position - b.position);
  const dateLabel = formatDate(version.travelDate);
  const distance = totalDistance(version);

  return {
    id: detail.id,
    summary: {
      dates: dateLabel,
      description: `${stops.length} destinasi di Padang, mulai ${version.startTime} sampai sekitar ${version.endTime}.`,
      destination: "Padang",
      distance: distance > 0 ? `±${formatDistance(distance)}` : "—",
      duration: "1 hari",
      eyebrow: "Rencana perjalanan",
      title: detail.title || `Trip Padang ${dateLabel}`,
    },
    days: [
      {
        city: "Padang",
        date: dateLabel,
        dayLabel: "Day 1",
        destinations: stops.map((stop, index) =>
          toDestination(stop, stops[index + 1]),
        ),
        icon: Navigation,
        id: `${detail.id}-day-1`,
        summary: `Rute disusun Lahlah AI untuk ${dateLabel}. Urutan stop mengikuti jam kunjungan dari itinerary yang tersimpan.`,
      },
    ],
  };
}
