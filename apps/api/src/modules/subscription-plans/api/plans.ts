import { Hono } from "hono";
import { requireAdmin, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  updatePlan,
} from "../services/plans.service.js";
import {
  createPlanSchema,
  listPlansQuerySchema,
  planIdSchema,
  updatePlanSchema,
} from "../schemas/plan.schema.js";

const subscriptionPlansApi = new Hono<{ Variables: AuthVariables }>();

// Plans are catalog data: pricing pages need them without a session. Writes
// stay behind `requireAdmin`.
subscriptionPlansApi.get("/", zValidator("query", listPlansQuerySchema), async (c) =>
  c.json(await listPlans(c.req.valid("query"))),
);

subscriptionPlansApi.get("/:id", zValidator("param", planIdSchema), async (c) =>
  c.json({ data: await getPlan(c.req.valid("param").id) }),
);

subscriptionPlansApi.post(
  "/",
  requireAdmin,
  zValidator("json", createPlanSchema),
  async (c) => c.json({ data: await createPlan(c.req.valid("json"), c.get("auth").user) }, 201),
);

subscriptionPlansApi.patch(
  "/:id",
  requireAdmin,
  zValidator("param", planIdSchema),
  zValidator("json", updatePlanSchema),
  async (c) =>
    c.json({
      data: await updatePlan(c.req.valid("param").id, c.req.valid("json"), c.get("auth").user),
    }),
);

subscriptionPlansApi.delete(
  "/:id",
  requireAdmin,
  zValidator("param", planIdSchema),
  async (c) => c.json({ data: await deletePlan(c.req.valid("param").id, c.get("auth").user) }),
);

export { subscriptionPlansApi };
