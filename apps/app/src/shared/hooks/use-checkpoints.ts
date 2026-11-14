import { useCallback, useState } from "react";

import type { Checkpoint } from "@/shared/types/checkpoint";

const STORAGE_PREFIX = "lahlah-checkpoints-v1:";

function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== "object" || value === null) return false;
  const checkpoint = value as Record<string, unknown>;
  return (
    typeof checkpoint.destinationId === "string" &&
    typeof checkpoint.photo === "string" &&
    typeof checkpoint.latitude === "number" &&
    typeof checkpoint.longitude === "number" &&
    typeof checkpoint.accuracy === "number" &&
    typeof checkpoint.createdAt === "number"
  );
}

function readCheckpoints(tripId: string): Checkpoint[] {
  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${tripId}`);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isCheckpoint) : [];
  } catch {
    return [];
  }
}

/**
 * Checkpoint trip bersifat lokal perangkat.
 *
 * ponytail: localStorage saja, tanpa sinkron lintas device. Ganti dengan
 * endpoint API saat checkpoint perlu terlihat di profil publik atau admin.
 */
export function useCheckpoints(tripId: string) {
  // Sinkron tripId saat render (pola resmi React untuk derived state): halaman
  // detail dipakai ulang antar tripId tanpa remount, jadi state tidak boleh
  // basi saat pengguna pindah trip.
  const [state, setState] = useState(() => ({
    tripId,
    checkpoints: readCheckpoints(tripId),
  }));
  if (state.tripId !== tripId) {
    setState({ tripId, checkpoints: readCheckpoints(tripId) });
  }

  const saveCheckpoint = useCallback(
    (checkpoint: Checkpoint) => {
      setState((current) => {
        const next = [
          ...current.checkpoints.filter(
            (item) => item.destinationId !== checkpoint.destinationId,
          ),
          checkpoint,
        ];
        try {
          localStorage.setItem(
            `${STORAGE_PREFIX}${tripId}`,
            JSON.stringify(next),
          );
        } catch {
          // Kuota atau storage diblokir: sesi tetap jalan di memori.
        }
        return { tripId, checkpoints: next };
      });
    },
    [tripId],
  );

  return { checkpoints: state.checkpoints, saveCheckpoint };
}
