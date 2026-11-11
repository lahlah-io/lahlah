import type { Prisma } from "../../../generated/prisma/client.js";
import { Prisma as PrismaNamespace } from "../../../generated/prisma/client.js";
import { recordActivity } from "../../../shared/audit/activity-log.js";
import { FREE_PLAN_NAME, parsePlanLimits } from "../../../shared/billing/plan-limits.schema.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as plansRepository from "../repositories/plans.repository.js";
import type { createPlanSchema, updatePlanSchema } from "../schemas/plan.schema.js";
import type { z } from "zod";

export type Actor = { id: string };

export const listPlans = plansRepository.findPlans;

export async function getPlan(id: string) {
  const plan = await plansRepository.findPlanById(id);
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Subscription plan not found");
  return plan;
}

async function assertModelAvailable(modelId: string): Promise<void> {
  const model = await plansRepository.findModelForPlan(modelId);
  if (!model) throw new HttpError(404, "MODEL_NOT_FOUND", "Default model not found");
  if (!model.isActive) throw new HttpError(400, "MODEL_INACTIVE", "Default model is inactive");
}

async function assertModelsAllowed(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;

  const models = await plansRepository.findModelsForPlan(unique);
  const found = new Map(models.map((model) => [model.id, model]));

  if (unique.some((id) => !found.has(id))) {
    throw new HttpError(404, "MODEL_NOT_FOUND", "One or more allowed models do not exist");
  }
  if (unique.some((id) => !found.get(id)?.isActive)) {
    throw new HttpError(400, "MODEL_INACTIVE", "One or more allowed models are inactive");
  }
}

/**
 * A plan that restricts its models must keep its default model inside that
 * list, otherwise the default silently becomes unusable.
 */
function assertDefaultModelAllowed(
  defaultModelId: string | null | undefined,
  allowedModelIds: string[] | null,
): void {
  if (!defaultModelId || allowedModelIds === null) return;
  if (!allowedModelIds.includes(defaultModelId)) {
    throw new HttpError(
      400,
      "DEFAULT_MODEL_NOT_ALLOWED",
      "Default model must be one of the allowed models",
    );
  }
}

export async function createPlan(input: z.infer<typeof createPlanSchema>, actor: Actor) {
  const details = parsePlanLimits(input.details ?? {});
  if (input.defaultModelId) await assertModelAvailable(input.defaultModelId);
  if (details.allowedModelIds) await assertModelsAllowed(details.allowedModelIds);
  assertDefaultModelAllowed(input.defaultModelId, details.allowedModelIds);

  const data: Prisma.SubscriptionPlanCreateInput = {
    name: input.name,
    description: input.description ?? null,
    price: input.price,
    billingInterval: input.billingInterval,
    details: details as Prisma.InputJsonValue,
    ...(input.defaultModelId
      ? { defaultModel: { connect: { id: input.defaultModelId } } }
      : {}),
  };

  try {
    const plan = await plansRepository.insertPlan(data);
    await recordActivity({
      actorId: actor.id,
      action: "plan.created",
      entityType: "subscription_plan",
      entityId: plan.id,
      metadata: { name: plan.name, billingInterval: plan.billingInterval },
    });
    return plan;
  } catch (error) {
    throw mapPlanWriteError(error);
  }
}

export async function updatePlan(
  id: string,
  input: z.infer<typeof updatePlanSchema>,
  actor: Actor,
) {
  const existing = await plansRepository.findPlanById(id);
  if (!existing) throw new HttpError(404, "PLAN_NOT_FOUND", "Subscription plan not found");

  const nextDetails =
    input.details === undefined
      ? parsePlanLimits(existing.details)
      : parsePlanLimits({ ...(existing.details as Record<string, unknown>), ...input.details });
  const nextDefaultModelId =
    input.defaultModelId === undefined ? existing.defaultModelId : input.defaultModelId;

  if (input.defaultModelId) await assertModelAvailable(input.defaultModelId);
  if (nextDetails.allowedModelIds) await assertModelsAllowed(nextDetails.allowedModelIds);
  assertDefaultModelAllowed(nextDefaultModelId, nextDetails.allowedModelIds);

  const data: Prisma.SubscriptionPlanUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.price !== undefined) data.price = input.price;
  if (input.billingInterval !== undefined) data.billingInterval = input.billingInterval;
  if (input.details !== undefined) {
    data.details = nextDetails as Prisma.InputJsonValue;
  }
  if (input.defaultModelId !== undefined) {
    data.defaultModel = input.defaultModelId
      ? { connect: { id: input.defaultModelId } }
      : { disconnect: true };
  }

  try {
    const plan = await plansRepository.patchPlan(id, data);
    await recordActivity({
      actorId: actor.id,
      action: "plan.updated",
      entityType: "subscription_plan",
      entityId: plan.id,
      metadata: { fields: Object.keys(input) },
    });
    return plan;
  } catch (error) {
    throw mapPlanWriteError(error);
  }
}

export async function deletePlan(id: string, actor: Actor) {
  const existing = await plansRepository.findPlanById(id);
  if (!existing) throw new HttpError(404, "PLAN_NOT_FOUND", "Subscription plan not found");
  if (existing.name === FREE_PLAN_NAME) {
    throw new HttpError(409, "SYSTEM_PLAN", "The free plan cannot be deleted");
  }

  const subscriptions = await plansRepository.countSubscriptionsForPlan(id);
  if (subscriptions > 0) {
    throw new HttpError(409, "PLAN_IN_USE", "This plan is used by existing subscriptions");
  }

  await plansRepository.deletePlanById(id);
  await recordActivity({
    actorId: actor.id,
    action: "plan.deleted",
    entityType: "subscription_plan",
    entityId: id,
    metadata: { name: existing.name },
  });
  return { id };
}

function mapPlanWriteError(error: unknown): unknown {
  if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return new HttpError(404, "PLAN_NOT_FOUND", "Subscription plan not found");
    if (error.code === "P2002") return new HttpError(409, "PLAN_NAME_EXISTS", "A plan with this name already exists");
  }
  return error;
}
