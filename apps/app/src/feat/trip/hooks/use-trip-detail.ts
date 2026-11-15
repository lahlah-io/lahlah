import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/shared/api/client";
import { getItinerary } from "@/shared/api/itineraries";
import type { Trip } from "@/shared/types/itinerary";
import { toTrip } from "@/shared/utils/itinerary-trip";

export type TripDetailStatus = "loading" | "ready" | "missing" | "error";

type TripDetailState = {
  error: string | null;
  status: TripDetailStatus;
  trip: Trip | null;
};

const INITIAL: TripDetailState = { error: null, status: "loading", trip: null };
const MISSING: TripDetailState = { error: null, status: "missing", trip: null };

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  return cause instanceof Error ? cause.message : "Terjadi kesalahan.";
}

/**
 * Satu itinerary berdasarkan id: milik sendiri, atau trip publik user lain.
 *
 * Otorisasi diambil dari cookie/Bearer lewat `apiRequest`, jadi tidak ada
 * `userId` di URL; id yang tidak boleh dibaca dijawab 404 dan dipetakan ke
 * `missing`. `tripId` kosong mematikan permintaan: halaman detail masih punya
 * data contoh untuk id lama, dan itu tidak boleh memicu request API.
 */
export function useTripDetail(tripId: string | undefined) {
  const [state, setState] = useState<TripDetailState>(INITIAL);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;

    getItinerary(tripId)
      .then((detail) => {
        if (cancelled) return;
        const trip = detail ? toTrip(detail) : null;
        setState(trip ? { error: null, status: "ready", trip } : MISSING);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({ error: errorMessage(cause), status: "error", trip: null });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce, tripId]);

  const reload = useCallback(() => {
    setState(INITIAL);
    setNonce((value) => value + 1);
  }, []);

  const current = tripId ? state : MISSING;
  return { ...current, reload };
}
