import { Prisma } from "../../../generated/prisma/client.js";
import { recordActivity } from "../../../shared/audit/activity-log.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as categoriesRepository from "../repositories/categories.repository.js";
import * as destinationsRepository from "../repositories/destinations.repository.js";
import { toDestinationResponse } from "../repositories/destinations.repository.js";
import { resolveDistrict } from "../../../shared/geo/padang-district.js";
import type {
  createDestinationSchema,
  updateDestinationSchema,
} from "../schemas/destination.schema.js";
import type { z } from "zod";

export type Actor = { id: string };

export const listDestinations = destinationsRepository.findDestinations;

export const listKnowledgeBaseDestinations = () =>
  destinationsRepository.findActiveForKnowledgeBase().then((rows) => rows.map(toDestinationResponse));

export const listDistricts = destinationsRepository.findDistrictCounts;

export async function getDestination(id: string) {
  const destination = await destinationsRepository.findDestinationById(id);
  if (!destination) throw new HttpError(404, "DESTINATION_NOT_FOUND", "Destination not found");
  return toDestinationResponse(destination);
}

async function assertCategoriesExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await categoriesRepository.findCategoriesByIds(ids);
  if (found.length !== ids.length) {
    throw new HttpError(404, "CATEGORY_NOT_FOUND", "One or more categories do not exist");
  }
}

export async function createDestination(
  input: z.infer<typeof createDestinationSchema>,
  actor: Actor,
) {
  const categoryIds = [...new Set(input.categoryIds)];
  await assertCategoriesExist(categoryIds);

  const data: Prisma.DestinationUncheckedCreateInput = {
    name: input.name,
    description: input.description ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    address: input.address ?? null,
    // Admin tidak mengisi district; tebak dari alamat supaya filter wilayah tetap konsisten.
    district: input.district ?? resolveDistrict(input.address ?? null),
    source: "admin",
    createdBy: actor.id,
    imageUrl: input.imageUrl ?? null,
    details: input.details as Prisma.InputJsonValue,
  };

  try {
    const destination = await destinationsRepository.insertDestination(data, categoryIds);
    await recordActivity({
      actorId: actor.id,
      action: "destination.created",
      entityType: "destination",
      entityId: destination.id,
      metadata: { name: destination.name, categoryIds },
    });
    return toDestinationResponse(destination);
  } catch (error) {
    throw mapDestinationWriteError(error);
  }
}

export async function updateDestination(
  id: string,
  input: z.infer<typeof updateDestinationSchema>,
  actor: Actor,
) {
  const existing = await destinationsRepository.findDestinationById(id);
  if (!existing) throw new HttpError(404, "DESTINATION_NOT_FOUND", "Destination not found");

  const categoryIds =
    input.categoryIds === undefined ? undefined : [...new Set(input.categoryIds)];
  if (categoryIds) await assertCategoriesExist(categoryIds);

  const data: Prisma.DestinationUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.address !== undefined) data.address = input.address;
  if (input.district !== undefined) data.district = input.district;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.details !== undefined) {
    data.details = {
      ...(existing.details as Record<string, unknown>),
      ...input.details,
    } as Prisma.InputJsonValue;
  }

  try {
    const destination = await destinationsRepository.updateDestination(id, data, categoryIds);
    await recordActivity({
      actorId: actor.id,
      action: "destination.updated",
      entityType: "destination",
      entityId: destination.id,
      metadata: {
        fields: Object.keys(input),
        ...(categoryIds === undefined ? {} : { categoryIds }),
      },
    });
    return toDestinationResponse(destination);
  } catch (error) {
    throw mapDestinationWriteError(error);
  }
}

/**
 * Soft delete: `itinerary_destinations` references destinations with
 * `onDelete: Restrict`, so rows are deactivated instead of removed.
 */
export async function deleteDestination(id: string, actor: Actor) {
  const existing = await destinationsRepository.findDestinationById(id);
  if (!existing) throw new HttpError(404, "DESTINATION_NOT_FOUND", "Destination not found");

  try {
    const destination = await destinationsRepository.deactivateDestination(id);
    await recordActivity({
      actorId: actor.id,
      action: "destination.deleted",
      entityType: "destination",
      entityId: destination.id,
      metadata: { name: destination.name },
    });
    return toDestinationResponse(destination);
  } catch (error) {
    throw mapDestinationWriteError(error);
  }
}

function mapDestinationWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return new HttpError(404, "DESTINATION_NOT_FOUND", "Destination not found");
    }
    if (error.code === "P2003") {
      return new HttpError(404, "CATEGORY_NOT_FOUND", "One or more categories do not exist");
    }
    if (error.code === "P2002") {
      return new HttpError(409, "DESTINATION_ALREADY_EXISTS", "This destination already exists");
    }
  }
  return error;
}
