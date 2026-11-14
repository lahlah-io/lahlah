import { Luggage, Mountain, Navigation, type LucideIcon } from "lucide-react";

import type { ItineraryDay, Trip } from "@/shared/types/itinerary";

export const TRIP: Trip = {
  id: "padang-bukittinggi",
  isLive: true,
  likes: 128,
  shares: 32,
  views: 1240,
  summary: {
    dates: "Nov 14–16, 2026",
    description:
      "Tiga hari santai keliling Sumatera Barat: sarapan di kota, naik ke Bukittinggi, lalu pulang bawa oleh-oleh.",
    destination: "Padang",
    distance: "±120 km",
    duration: "3 hari",
    eyebrow: "Rencana perjalanan",
    title: "Padang & Bukittinggi",
  },
  days: [
    {
      city: "Padang",
      date: "Nov 14",
      dayLabel: "Day 1",
      destinations: [
        {
          coordinates: [100.359, -0.9443],
          id: "day-1-kopkit",
          name: "Caffe Kopkit",
          photo:
            "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80",
          rating: "4.5 Stars",
          timeRange: "08.00 - 10.00",
        },
        {
          coordinates: [100.3506, -0.9581],
          id: "day-1-pantai",
          name: "Pantai Padang",
          photo:
            "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80",
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
      date: "Nov 15",
      dayLabel: "Day 2",
      destinations: [
        {
          coordinates: [100.3694, -0.3051],
          id: "day-2-jam-gadang",
          name: "Jam Gadang",
          photo:
            "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=400&q=80",
          rating: "4.7 Stars",
          timeRange: "08.00 - 10.30",
        },
        {
          coordinates: [100.362, -0.3079],
          id: "day-2-sianok",
          name: "Ngarai Sianok",
          photo:
            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80",
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
      date: "Nov 16",
      dayLabel: "Day 3",
      destinations: [
        {
          coordinates: [100.3569, -0.9467],
          id: "day-3-pasar",
          name: "Pasar Raya Padang",
          photo:
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80",
          rating: "4.3 Stars",
          timeRange: "08.00 - 09.30",
        },
        {
          coordinates: [100.2811, -0.7869],
          id: "day-3-bandara",
          name: "Bandara Minangkabau",
          photo:
            "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&q=80",
          rating: "4.4 Stars",
          timeRange: "10.00 - 12.00",
        },
      ],
      icon: Luggage,
      id: "day-3",
      summary:
        "Pada jam 8 pagi kamu berangkat belanja oleh-oleh terakhir di Pasar Raya Padang, lalu langsung menuju bandara supaya tidak terburu-buru.",
    },
  ],
};

// Proyeksi datar supaya konsumen lama tidak perlu diubah.
export const TRIP_SUMMARY = TRIP.summary;
export const ITINERARY_DAYS: ItineraryDay[] = TRIP.days;

/** Seed ringkas untuk trip placeholder; id hari & destinasi dibuat otomatis. */
type TripSeed = {
  id: string;
  likes: number;
  shares: number;
  views: number;
  title: string;
  description: string;
  destination: string;
  dates: string;
  distance: string;
  duration: string;
  days: Array<{
    city: string;
    date: string;
    icon: LucideIcon;
    summary: string;
    stops: Array<{
      name: string;
      coordinates: [number, number];
      photo: string;
      timeRange: string;
    }>;
  }>;
};

const PHOTOS = {
  cafe: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80",
  beach: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80",
  temple: "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=400&q=80",
  valley: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80",
  market: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80",
  airport: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&q=80",
} as const;

function createTrip(seed: TripSeed): Trip {
  return {
    id: seed.id,
    likes: seed.likes,
    shares: seed.shares,
    views: seed.views,
    summary: {
      dates: seed.dates,
      description: seed.description,
      destination: seed.destination,
      distance: seed.distance,
      duration: seed.duration,
      eyebrow: "Rencana perjalanan",
      title: seed.title,
    },
    days: seed.days.map((day, dayIndex) => ({
      city: day.city,
      date: day.date,
      dayLabel: `Day ${dayIndex + 1}`,
      icon: day.icon,
      id: `${seed.id}-day-${dayIndex + 1}`,
      summary: day.summary,
      destinations: day.stops.map((stop, stopIndex) => ({
        coordinates: stop.coordinates,
        id: `${seed.id}-day-${dayIndex + 1}-stop-${stopIndex + 1}`,
        name: stop.name,
        photo: stop.photo,
        rating: "4.6 Stars",
        timeRange: stop.timeRange,
      })),
    })),
  };
}

const PLACEHOLDER_TRIPS: Trip[] = [
  createTrip({
    id: "bali-ubud-sanur",
    likes: 94,
    shares: 21,
    views: 512,
    title: "Bali: Ubud & Sanur",
    description:
      "Dua hari pelan di Bali: pagi di sawah Ubud, sore pindah ke Sanur buat sunset di tepi pantai.",
    destination: "Bali",
    dates: "Des 5–6, 2026",
    distance: "±80 km",
    duration: "2 hari",
    days: [
      {
        city: "Ubud",
        date: "Des 5",
        icon: Mountain,
        summary:
          "Mulai dari Puri Ubud, lalu naik ke Tegalalang untuk sarapan dengan pemandangan sawah bertingkat.",
        stops: [
          {
            name: "Puri Ubud",
            coordinates: [115.2625, -8.5069],
            photo: PHOTOS.temple,
            timeRange: "08.00 - 10.00",
          },
          {
            name: "Tegalalang",
            coordinates: [115.279, -8.4312],
            photo: PHOTOS.valley,
            timeRange: "10.30 - 13.00",
          },
        ],
      },
      {
        city: "Sanur",
        date: "Des 6",
        icon: Navigation,
        summary:
          "Jalan santai di Pantai Sanur, lanjut belanja di Pasar Sindhu sebelum balik ke bandara.",
        stops: [
          {
            name: "Pantai Sanur",
            coordinates: [115.2623, -8.6905],
            photo: PHOTOS.beach,
            timeRange: "07.30 - 10.00",
          },
          {
            name: "Pasar Sindhu",
            coordinates: [115.26, -8.696],
            photo: PHOTOS.market,
            timeRange: "10.30 - 12.00",
          },
        ],
      },
    ],
  }),
  createTrip({
    id: "yogyakarta-klasik",
    likes: 76,
    shares: 12,
    views: 386,
    title: "Yogyakarta Klasik",
    description:
      "Candi, keraton, dan Malioboro dalam dua hari. Rute pendek, tapi padat cerita.",
    destination: "Yogyakarta",
    dates: "Jan 9–10, 2027",
    distance: "±65 km",
    duration: "2 hari",
    days: [
      {
        city: "Yogyakarta",
        date: "Jan 9",
        icon: Navigation,
        summary:
          "Sarapan di Malioboro, masuk Keraton, lalu tutup hari dengan kopi di sisi utara kota.",
        stops: [
          {
            name: "Malioboro",
            coordinates: [110.3656, -7.7926],
            photo: PHOTOS.market,
            timeRange: "08.00 - 10.00",
          },
          {
            name: "Keraton Yogyakarta",
            coordinates: [110.3642, -7.8053],
            photo: PHOTOS.temple,
            timeRange: "10.30 - 12.30",
          },
        ],
      },
      {
        city: "Magelang",
        date: "Jan 10",
        icon: Mountain,
        summary:
          "Berangkat pagi ke Borobudur supaya masih sepi, lanjut Prambanan menjelang sore.",
        stops: [
          {
            name: "Borobudur",
            coordinates: [110.2038, -7.6079],
            photo: PHOTOS.temple,
            timeRange: "06.30 - 09.30",
          },
          {
            name: "Prambanan",
            coordinates: [110.4915, -7.752],
            photo: PHOTOS.valley,
            timeRange: "13.00 - 16.00",
          },
        ],
      },
    ],
  }),
  createTrip({
    id: "bandung-sejuk",
    likes: 63,
    shares: 9,
    views: 298,
    title: "Bandung Sejuk",
    description:
      "Kabur sebentar dari panas kota: Lembang di hari pertama, Kawah Putih di hari kedua.",
    destination: "Bandung",
    dates: "Feb 13–14, 2027",
    distance: "±110 km",
    duration: "2 hari",
    days: [
      {
        city: "Bandung",
        date: "Feb 13",
        icon: Navigation,
        summary:
          "Keliling pusat kota sebentar, lalu naik ke Lembang untuk makan siang dan udara dingin.",
        stops: [
          {
            name: "Gedung Sate",
            coordinates: [107.6188, -6.9025],
            photo: PHOTOS.cafe,
            timeRange: "08.00 - 09.30",
          },
          {
            name: "Lembang",
            coordinates: [107.6174, -6.8119],
            photo: PHOTOS.valley,
            timeRange: "10.30 - 15.00",
          },
        ],
      },
      {
        city: "Ciwidey",
        date: "Feb 14",
        icon: Mountain,
        summary:
          "Pagi-pagi ke Kawah Putih sebelum ramai, lalu duduk di Situ Patenggang sampai sore.",
        stops: [
          {
            name: "Kawah Putih",
            coordinates: [107.402, -7.166],
            photo: PHOTOS.valley,
            timeRange: "07.00 - 10.00",
          },
          {
            name: "Situ Patenggang",
            coordinates: [107.3556, -7.1717],
            photo: PHOTOS.beach,
            timeRange: "10.30 - 14.00",
          },
        ],
      },
    ],
  }),
  createTrip({
    id: "lombok-pantai-gili",
    likes: 111,
    shares: 27,
    views: 604,
    title: "Lombok: Pantai & Gili",
    description:
      "Pantai selatan Lombok yang kosong, lalu nyebrang ke Gili Trawangan buat snorkeling.",
    destination: "Lombok",
    dates: "Mar 20–21, 2027",
    distance: "±70 km",
    duration: "2 hari",
    days: [
      {
        city: "Kuta Lombok",
        date: "Mar 20",
        icon: Navigation,
        summary:
          "Dari Kuta Mandalika jalan ke Tanjung Aan, habiskan sore di pasir putihnya.",
        stops: [
          {
            name: "Kuta Mandalika",
            coordinates: [116.283, -8.893],
            photo: PHOTOS.beach,
            timeRange: "09.00 - 11.00",
          },
          {
            name: "Tanjung Aan",
            coordinates: [116.326, -8.907],
            photo: PHOTOS.beach,
            timeRange: "13.00 - 17.00",
          },
        ],
      },
      {
        city: "Gili Trawangan",
        date: "Mar 21",
        icon: Luggage,
        summary:
          "Nyebrang pagi ke Gili Trawangan, snorkeling, lalu balik lewat Gili Meno.",
        stops: [
          {
            name: "Gili Trawangan",
            coordinates: [116.04, -8.35],
            photo: PHOTOS.beach,
            timeRange: "08.00 - 13.00",
          },
          {
            name: "Gili Meno",
            coordinates: [116.0583, -8.3517],
            photo: PHOTOS.beach,
            timeRange: "14.00 - 16.00",
          },
        ],
      },
    ],
  }),
];

/** Satu trip = satu postingan profil. */
export const TRIPS: Trip[] = [TRIP, ...PLACEHOLDER_TRIPS];

/** Trip yang sedang berjalan, tampil sebagai carousel di Beranda. */
export const LIVE_TRIPS: Trip[] = TRIPS.filter((trip) => trip.isLive);

/**
 * URL trip: live dan selesai punya halaman berbeda.
 *
 * Live trip dipakai dari carousel Beranda; trip selesai jadi arsip tetap.
 */
export function getTripPath(trip: Trip): string {
  return trip.isLive ? `/live/${trip.id}` : `/detail/${trip.id}`;
}

/** Semua koordinat destinasi dalam trip, urut sesuai hari. */
export function getTripWaypoints(trip: Trip): [number, number][] {
  return trip.days.flatMap((day) =>
    day.destinations.map((destination) => destination.coordinates),
  );
}
