import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import { checkQuotaSchema, quotaMetricSchema } from "../schemas/quota.schema.js";
import {
  checkQuota,
  getMyPlanSummary,
  getSubscriptionHistory,
} from "../services/subscriptions.service.js";

const subscriptionsApi = new Hono<{ Variables: AuthVariables }>();

subscriptionsApi.use("*", requireAuth);

subscriptionsApi.get("/me", async (c) =>
  c.json({ data: await getMyPlanSummary(c.get("auth").user.id) }),
);

subscriptionsApi.get("/me/history", async (c) =>
  c.json({ data: await getSubscriptionHistory(c.get("auth").user.id) }),
);

subscriptionsApi.get(
  "/me/quota",
  zValidator("query", z.object({ metric: quotaMetricSchema.optional() })),
  async (c) => {
    const metric = c.req.valid("query").metric;
    const userId = c.get("auth").user.id;
    if (metric) {
      return c.json({ data: await checkQuota(userId, metric, 0) });
    }
    return c.json({
      data: {
        chatMessages: await checkQuota(userId, "chatMessages", 0),
        chatSessions: await checkQuota(userId, "chatSessions", 0),
        itineraries: await checkQuota(userId, "itineraries", 0),
      },
    });
  },
);

subscriptionsApi.post(
  "/me/quota/check",
  zValidator("json", checkQuotaSchema),
  async (c) => {
    const { metric, amount } = c.req.valid("json");
    return c.json({ data: await checkQuota(c.get("auth").user.id, metric, amount) });
  },
);

export { subscriptionsApi };
