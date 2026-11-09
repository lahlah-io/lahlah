import { Prisma } from "../../../generated/prisma/client.js";
import { recordActivity } from "../../../shared/audit/activity-log.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as modelsRepository from "../repositories/models.repository.js";
import type { createModelSchema, updateModelSchema } from "../schemas/model.schema.js";
import type { z } from "zod";

export type Actor = { id: string };

export const listModels = modelsRepository.findModels;

export async function getModel(id: string) {
  const model = await modelsRepository.findModelById(id);
  if (!model) throw new HttpError(404, "MODEL_NOT_FOUND", "Model not found");
  return model;
}

export async function createModel(input: z.infer<typeof createModelSchema>, actor: Actor) {
  try {
    const model = await modelsRepository.insertModel(input);
    await recordActivity({
      actorId: actor.id,
      action: "model.created",
      entityType: "model",
      entityId: model.id,
      metadata: { provider: model.provider, modelIdentifier: model.modelIdentifier },
    });
    return model;
  } catch (error) {
    throw mapModelWriteError(error);
  }
}

export async function updateModel(
  id: string,
  input: z.infer<typeof updateModelSchema>,
  actor: Actor,
) {
  try {
    const model = await modelsRepository.patchModel(id, input);
    await recordActivity({
      actorId: actor.id,
      action: "model.updated",
      entityType: "model",
      entityId: model.id,
      metadata: { fields: Object.keys(input) },
    });
    return model;
  } catch (error) {
    throw mapModelWriteError(error);
  }
}

export async function deactivateModel(id: string, actor: Actor) {
  try {
    const model = await modelsRepository.deactivateModelById(id);
    await recordActivity({
      actorId: actor.id,
      action: "model.deactivated",
      entityType: "model",
      entityId: model.id,
    });
    return model;
  } catch (error) {
    throw mapModelWriteError(error);
  }
}

function mapModelWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return new HttpError(404, "MODEL_NOT_FOUND", "Model not found");
    if (error.code === "P2002") {
      return new HttpError(409, "MODEL_ALREADY_EXISTS", "This provider/model identifier already exists");
    }
  }
  return error;
}
