import { useCallback, useEffect, useState } from "react";

import { toTrip } from "@/shared/utils/itinerary-trip";
import type { Trip } from "@/shared/types/itinerary";

import * as homeApi from "../services/home.api";

/** Trip berjalan: `Trip` siap render + progres check-in dari API. */
export interface LiveTrip {
  checked: number;
  total: number;
  trip: Trip;
}

export type LiveTripStatus = "loading" | "ready" | "empty" | "error";

type LiveTripState = {
  data: LiveTrip | null;
  error: string | null;
  status: LiveTripStatus;
};

const INITIAL: LiveTripState = { data: null, error: null, status: "loading" };

/**
 * Trip berjalan milik user: `GET /trips/active` lalu detail itinerary-nya.
 *
 * `userId` dioper dari halaman (bukan `useAuth`) supaya fitur home tidak
 * mengimpor fitur auth. Tanpa trip aktif, statusnya `empty` — home cukup
 * menampilkan feed.
 */
export function useLiveTrip(userId: string | null) {
  const [state, setState] = useState<LiveTripState>(INITIAL);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function load(): Promise<Omit<LiveTripState, "error">> {
      const active = await homeApi.getActiveTrip();
      if (!active) return { data: null, status: "empty" };
      const detail = (await homeApi.getItinerary(userId!, active.tripId)).data;
      const trip = toTrip(detail);
      if (!trip) return { data: null, status: "empty" };
      return {
        data: {
          checked: active.checked,
          total: active.total,
          trip: { ...trip, isLive: true },
        },
        status: "ready",
      };
    }

    load()
      .then((next) => {
        if (!cancelled) setState({ ...next, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({ data: null, error: homeApi.errorMessage(cause), status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce, userId]);

  const reload = useCallback(() => {
    setState(INITIAL);
    setNonce((value) => value + 1);
  }, []);

  // Tanpa sesi, trip berjalan tidak mungkin ada; jangan tunggu permintaan API.
  const current: LiveTripState = userId
    ? state
    : { data: null, error: null, status: "empty" };

  return { ...current, reload };
}
