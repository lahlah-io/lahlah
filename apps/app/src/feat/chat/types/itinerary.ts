import type { LucideIcon } from "lucide-react";

export interface ItineraryDestination {
  id: string;
  name: string;
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
