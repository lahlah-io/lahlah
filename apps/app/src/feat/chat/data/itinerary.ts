import { Luggage, Mountain, Navigation } from "lucide-react";

import type { ItineraryDay, TripSummary } from "../types/itinerary";

export const TRIP_SUMMARY: TripSummary = {
  dates: "Nov 9–11, 2026",
  description:
    "Tiga hari santai keliling Sumatera Barat: sarapan di kota, naik ke Bukittinggi, lalu pulang bawa oleh-oleh.",
  destination: "Padang",
  distance: "±120 km",
  duration: "3 hari",
  eyebrow: "Rencana perjalanan",
  title: "Padang & Bukittinggi",
};

export const ITINERARY_DAYS: ItineraryDay[] = [
  {
    city: "Padang",
    date: "Nov 9",
    dayLabel: "Day 1",
    destinations: [
      {
        id: "day-1-kopkit",
        name: "Caffe Kopkit",
        rating: "4.5 Stars",
        timeRange: "08.00 - 10.00",
      },
      {
        id: "day-1-pantai",
        name: "Pantai Padang",
        rating: "4.8 Stars",
        timeRange: "10.30 - 12.30",
      },
    ],
    icon: Navigation,
    id: "day-1",
    summary:
      "Pada jam 8 pagi kamu harus sudah mulai berangkat dari rumahmu menuju Caffe Kopkit untuk sarapan, lalu lanjut jalan kaki ke Pantai Padang sebelum matahari terlalu terik.",
  },
  {
    city: "Bukittinggi",
    date: "Nov 10",
    dayLabel: "Day 2",
    destinations: [
      {
        id: "day-2-jam-gadang",
        name: "Jam Gadang",
        rating: "4.7 Stars",
        timeRange: "08.00 - 10.30",
      },
      {
        id: "day-2-sianok",
        name: "Ngarai Sianok",
        rating: "4.9 Stars",
        timeRange: "11.00 - 13.00",
      },
    ],
    icon: Mountain,
    id: "day-2",
    summary:
      "Pada jam 8 pagi kamu berangkat menuju Jam Gadang untuk foto pagi saat masih sepi, lalu turun ke Ngarai Sianok untuk makan siang dengan pemandangan lembah.",
  },
  {
    city: "Padang",
    date: "Nov 11",
    dayLabel: "Day 3",
    destinations: [
      {
        id: "day-3-pasar",
        name: "Pasar Raya Padang",
        rating: "4.3 Stars",
        timeRange: "08.00 - 09.30",
      },
      {
        id: "day-3-bandara",
        name: "Bandara Minangkabau",
        rating: "4.4 Stars",
        timeRange: "10.00 - 12.00",
      },
    ],
    icon: Luggage,
    id: "day-3",
    summary:
      "Pada jam 8 pagi kamu berangkat belanja oleh-oleh terakhir di Pasar Raya Padang, lalu langsung menuju bandara supaya tidak terburu-buru.",
  },
];
