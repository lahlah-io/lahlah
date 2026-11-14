import { useEffect, useMemo, useState } from "react";

import { fetchDrivingRoute } from "@/shared/services/directions";
import {
  buildRouteCacheKey,
  readCachedRoute,
  writeCachedRoute,
} from "@/shared/utils/route-cache";

type RoadRoute = {
  /** Geometri rute yang mengikuti jalan, atau garis lurus saat gagal. */
  coordinates: [number, number][];
  /** `true` selama rute jalan belum tersedia dan garis lurus dipakai. */
  isFallback: boolean;
};

/**
 * Mengganti garis lurus antar destinasi dengan rute jalan dari OSRM.
 *
 * Hasil rute disimpan di `localStorage` per kombinasi waypoint, jadi kunjungan
 * berikutnya tidak memanggil OSRM lagi. Selama request berjalan atau saat
 * gagal, `fallback` tetap ditampilkan. Hook ini mengasumsikan `waypoints`
 * stabil selama komponen hidup (seperti data itinerary statis saat ini).
 */
export function useRoadRoute(
  waypoints: [number, number][],
  fallback: [number, number][],
): RoadRoute {
  const cacheKey = useMemo(() => buildRouteCacheKey(waypoints), [waypoints]);
  const cached = useMemo(() => readCachedRoute(cacheKey), [cacheKey]);
  const [route, setRoute] = useState<RoadRoute>(() => {
    if (cached) {
      return { coordinates: cached, isFallback: false };
    }
    return { coordinates: fallback, isFallback: true };
  });

  useEffect(() => {
    if (cached) return;

    const controller = new AbortController();

    fetchDrivingRoute(waypoints, controller.signal)
      .then((result) => {
        writeCachedRoute(cacheKey, result.encoded);
        setRoute({ coordinates: result.coordinates, isFallback: false });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRoute({ coordinates: fallback, isFallback: true });
      });

    return () => controller.abort();
  }, [cached, cacheKey, fallback, waypoints]);

  return route;
}
