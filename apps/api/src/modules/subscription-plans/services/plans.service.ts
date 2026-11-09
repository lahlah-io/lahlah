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

export async function createPlan(input: z.infer<typeof createPlanSchema>, actor: Actor) {
  if (input.defaultModelId) await assertModelAvailable(input.defaultModelId);

  const data: Prisma.SubscriptionPlanCreateInput = {
    name: input.name,
    description: input.description ?? null,
    price: input.price,
    billingInterval: input.billingInterval,
    details: parsePlanLimits(input.details ?? {}) as Prisma.InputJsonValue,
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

  if (input.defaultModelId) await assertModelAvailable(input.defaultModelId);

  const data: Prisma.SubscriptionPlanUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.price !== undefined) data.price = input.price;
  if (input.billingInterval !== undefined) data.billingInterval = input.billingInterval;
  if (input.details !== undefined) {
    const merged = {
      ...(existing.details as Record<string, unknown>),
      ...input.details,
    };
    data.details = parsePlanLimits(merged) as Prisma.InputJsonValue;
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
