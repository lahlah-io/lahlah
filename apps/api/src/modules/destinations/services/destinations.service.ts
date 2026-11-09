import { HttpError } from "../../../shared/http/errors.js";
import * as destinationsRepository from "../repositories/destinations.repository.js";
import type { listDestinationsQuerySchema } from "../schemas/destination.schema.js";
import type { z } from "zod";

function toNumber(value: { toNumber(): number } | null) {
  return value == null ? null : value.toNumber();
}

function toDto(row: Awaited<ReturnType<typeof destinationsRepository.findDestinationById>>) {
  if (!row) return row;
  return {
    ...row,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    categories: row.categories.map((c) => c.category),
  };
}

export async function listDestinations(input: z.infer<typeof listDestinationsQuerySchema>) {
  const result = await destinationsRepository.findDestinations(input);
  return { data: result.data.map((row) => toDto(row)!), meta: result.meta };
}

export async function getDestination(id: string) {
  const row = await destinationsRepository.findDestinationById(id);
  if (!row) throw new HttpError(404, "DESTINATION_NOT_FOUND", "Destination not found");
  return toDto(row)!;
}
