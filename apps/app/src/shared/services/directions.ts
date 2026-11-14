import { decodePolyline } from "@/shared/utils/polyline";

/**
 * Rute jalan via OSRM (Open Source Routing Machine).
 *
 * Default memakai server demo publik OSRM yang hanya cocok untuk pengembangan.
 * Untuk produksi, arahkan `VITE_OSRM_ROUTE_URL` ke instance OSRM sendiri
 * (mis. `https://routing.example.com/route/v1/driving`).
 */
const OSRM_ROUTE_URL =
  import.meta.env.VITE_OSRM_ROUTE_URL ||
  "https://router.project-osrm.org/route/v1/driving";

type OsrmResponse = {
  code: string;
  routes?: Array<{
    geometry?: unknown;
  }>;
};

export type DrivingRoute = {
  /** Geometri siap pakai untuk MapLibre sebagai [longitude, latitude]. */
  coordinates: [number, number][];
  /** Geometri OSRM ter-encode, disimpan di cache agar hemat ruang. */
  encoded: string;
};

/**
 * Mengambil geometri rute yang mengikuti jalan dari OSRM.
 * Koordinat input `[longitude, latitude]`.
 */
export async function fetchDrivingRoute(
  waypoints: [number, number][],
  signal?: AbortSignal,
): Promise<DrivingRoute> {
  if (waypoints.length < 2) {
    throw new Error("Rute membutuhkan minimal dua titik.");
  }

  const path = waypoints
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(";");

  const response = await fetch(
    `${OSRM_ROUTE_URL}/${path}?overview=full&geometries=polyline6`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`OSRM gagal merespons (${response.status}).`);
  }

  const data = (await response.json()) as OsrmResponse;
  const encoded = data.routes?.[0]?.geometry;

  if (data.code !== "Ok" || typeof encoded !== "string") {
    throw new Error("OSRM tidak menemukan rute untuk titik-titik ini.");
  }

  const coordinates = decodePolyline(encoded);
  if (coordinates.length < 2) {
    throw new Error("OSRM mengembalikan geometri rute yang kosong.");
  }

  return { coordinates, encoded };
}
