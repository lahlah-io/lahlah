import type { LucideIcon } from "lucide-react";

export interface ItineraryDestination {
  /** Posisi destinasi sebagai [longitude, latitude]. */
  coordinates: [number, number];
  id: string;
  name: string;
  photo: string;
  rating: string;
  timeRange: string;
}

export interface ItineraryDay {
  city: string;
  date: string;
  dayLabel: string;
  destinations: ItineraryDestination[];
  icon: LucideIcon;
  id: string;
  summary: string;
}

export interface TripSummary {
  dates: string;
  description: string;
  destination: string;
  distance: string;
  duration: string;
  eyebrow: string;
  title: string;
}

/** Trip membungkus ringkasan dan itinerary (hari + destinasi) sebagai pecahannya. */
export interface Trip {
  days: ItineraryDay[];
  /** Slug trip, dipakai sebagai id postingan di profil. */
  id: string;
  /** Trip yang sedang berjalan; tampil di carousel Beranda. */
  isLive?: boolean;
  /** Jumlah suka awal untuk postingan placeholder. */
  likes?: number;
  /** Jumlah bagikan awal untuk postingan placeholder. */
  shares?: number;
  /** Jumlah tayangan postingan di profil; ditampilkan di bawah kartu trip. */
  views?: number;
  summary: TripSummary;
}
