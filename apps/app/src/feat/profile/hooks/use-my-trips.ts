import { useEffect, useState } from "react";

import { ApiError } from "@/shared/api/client";

import { fetchMyTrips, type MyTripsResponse } from "../services/profile.api";

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  return cause instanceof Error ? cause.message : "Terjadi kesalahan.";
}

/**
 * Trip milik sesi aktif untuk grid profil: `GET /itineraries/mine`.
 *
 * `data === null` berarti permintaan pertama belum selesai; kegagalan
 * mengosongkan grid supaya halaman keluar dari status memuat.
 */
export function useMyTrips() {
  const [data, setData] = useState<MyTripsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyTrips()
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setData({ data: [], meta: { totalDistanceM: null, totalLikes: 0, totalTrips: 0 } });
        setError(errorMessage(cause));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error, loading: data === null };
}
