import { Prisma } from "../../../generated/prisma/client.js";
import { recordActivity } from "../../../shared/audit/activity-log.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as categoriesRepository from "../repositories/categories.repository.js";
import type { createCategorySchema, updateCategorySchema } from "../schemas/category.schema.js";
import type { z } from "zod";

export type Actor = { id: string };

export const listCategories = categoriesRepository.findCategories;

/** Derives a URL-safe slug when the admin does not send one explicitly. */
function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 255);

  if (!slug) {
    throw new HttpError(400, "INVALID_SLUG", "Cannot derive a slug from this name");
  }
  return slug;
}

export async function getCategory(id: string) {
  const category = await categoriesRepository.findCategoryById(id);
  if (!category) throw new HttpError(404, "CATEGORY_NOT_FOUND", "Category not found");
  return category;
}

export async function createCategory(input: z.infer<typeof createCategorySchema>, actor: Actor) {
  const slug = input.slug ?? slugify(input.name);

  try {
    const category = await categoriesRepository.insertCategory({ name: input.name, slug });
    await recordActivity({
      actorId: actor.id,
      action: "category.created",
      entityType: "category",
      entityId: category.id,
      metadata: { name: category.name, slug: category.slug },
    });
    return category;
  } catch (error) {
    throw mapCategoryWriteError(error);
  }
}

export async function updateCategory(
  id: string,
  input: z.infer<typeof updateCategorySchema>,
  actor: Actor,
) {
  const existing = await categoriesRepository.findCategoryById(id);
  if (!existing) throw new HttpError(404, "CATEGORY_NOT_FOUND", "Category not found");

  const data: Prisma.CategoryUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;

  try {
    const category = await categoriesRepository.patchCategory(id, data);
    await recordActivity({
      actorId: actor.id,
      action: "category.updated",
      entityType: "category",
      entityId: category.id,
      metadata: { fields: Object.keys(input) },
    });
    return category;
  } catch (error) {
    throw mapCategoryWriteError(error);
  }
}

/**
 * Hard delete. The join table cascades, so destinations keep existing and only
 * lose this tag.
 */
export async function deleteCategory(id: string, actor: Actor) {
  const existing = await categoriesRepository.findCategoryById(id);
  if (!existing) throw new HttpError(404, "CATEGORY_NOT_FOUND", "Category not found");

  try {
    await categoriesRepository.deleteCategoryById(id);
  } catch (error) {
    throw mapCategoryWriteError(error);
  }

  await recordActivity({
    actorId: actor.id,
    action: "category.deleted",
    entityType: "category",
    entityId: id,
    metadata: { name: existing.name, slug: existing.slug },
  });
  return { id };
}

function mapCategoryWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return new HttpError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    if (error.code === "P2002") {
      return new HttpError(409, "CATEGORY_SLUG_EXISTS", "A category with this slug already exists");
    }
  }
  return error;
}
