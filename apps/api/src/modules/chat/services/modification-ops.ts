import { HttpError } from "../../../shared/http/errors.js";
import type { ItineraryModification } from "../../../shared/schemas/itinerary-modification.js";

export type ActiveStop = {
  position: number;
  destinationId: string;
  name: string;
  category?: string | null;
};

export type CandidateStop = {
  destinationId: string;
  name: string;
  category?: string | null;
};

export type ModificationResult = {
  stops: ActiveStop[];
  excludedIds: string[];
};

function findTarget(stops: ActiveStop[], mod: { targetPosition?: number; targetName?: string; targetLast?: boolean }) {
  if (mod.targetLast) return stops[stops.length - 1];
  if (mod.targetPosition != null) return stops.find((s) => s.position === mod.targetPosition);
  if (mod.targetName) {
    const needle = mod.targetName.trim().toLowerCase();
    const matches = stops.filter((s) => s.name.toLowerCase() === needle || s.name.toLowerCase().includes(needle));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new HttpError(422, "MODIFY_TARGET_AMBIGUOUS", "Destination name matches multiple stops");
    return undefined;
  }
  return undefined;
}

function renumber(stops: ActiveStop[]): ActiveStop[] {
  return stops.map((s, i) => ({ ...s, position: i + 1 }));
}

export function orderCandidates<T extends { destinationId: string; category?: string | null }>(
  candidates: T[],
  targetCategory: string | null,
): T[] {
  return [...candidates].sort((a, b) => {
    const ca = Number(a.category === targetCategory);
    const cb = Number(b.category === targetCategory);
    if (cb !== ca) return cb - ca;
    return a.destinationId.localeCompare(b.destinationId);
  });
}

/**
 * Pure stop-list edit. Scheduling, routing, and persistence happen in the caller.
 * Positions are 1-based and renumbered after a remove so the user keeps seeing 1..n.
 */
export function applyModification(
  active: ActiveStop[],
  mod: ItineraryModification,
  candidates: CandidateStop[],
): ModificationResult {
  if (mod.operation === "replace_destination") {
    const target = findTarget(active, mod);
    if (!target) throw new HttpError(422, "MODIFY_TARGET_NOT_FOUND", "Destination to replace was not found");
    const replacement = candidates[0];
    if (!replacement) throw new HttpError(422, "MODIFY_CANDIDATE_MISSING", "No replacement destination available");
    const stops = active.map((s) =>
      s.position === target.position
        ? {
            position: s.position,
            destinationId: replacement.destinationId,
            name: replacement.name,
            category: replacement.category ?? s.category ?? null,
          }
        : s,
    );
    return { stops, excludedIds: [target.destinationId] };
  }

  if (mod.operation === "remove_destination") {
    const target = findTarget(active, mod);
    if (!target) throw new HttpError(422, "MODIFY_TARGET_NOT_FOUND", "Destination to remove was not found");
    return {
      stops: renumber(active.filter((s) => s.position !== target.position)),
      excludedIds: [target.destinationId],
    };
  }

  if (mod.operation === "add_destination") {
    const taken = new Set(active.map((s) => s.destinationId));
    const additions: ActiveStop[] = [];
    for (const candidate of candidates) {
      if (additions.length >= mod.quantity) break;
      if (taken.has(candidate.destinationId)) continue;
      taken.add(candidate.destinationId);
      additions.push({
        position: active.length + additions.length + 1,
        destinationId: candidate.destinationId,
        name: candidate.name,
        category: candidate.category ?? null,
      });
    }
    if (additions.length < mod.quantity) {
      throw new HttpError(422, "MODIFY_CANDIDATE_MISSING", "Not enough new destinations available");
    }
    return { stops: [...active, ...additions], excludedIds: [] };
  }

  throw new HttpError(422, "MODIFY_NOT_APPLICABLE", "This modification does not change destinations");
}
