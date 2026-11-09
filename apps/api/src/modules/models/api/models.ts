import { Hono } from "hono";
import { requireAdmin, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import {
  createModel,
  deactivateModel,
  getModel,
  listModels,
  updateModel,
} from "../services/models.service.js";
import {
  createModelSchema,
  listModelsQuerySchema,
  modelIdSchema,
  updateModelSchema,
} from "../schemas/model.schema.js";

const modelsApi = new Hono<{ Variables: AuthVariables }>();

modelsApi.use("*", requireAdmin);

modelsApi.get("/", zValidator("query", listModelsQuerySchema), async (c) =>
  c.json(await listModels(c.req.valid("query"))),
);

modelsApi.get("/:id", zValidator("param", modelIdSchema), async (c) =>
  c.json({ data: await getModel(c.req.valid("param").id) }),
);

modelsApi.post("/", zValidator("json", createModelSchema), async (c) =>
  c.json({ data: await createModel(c.req.valid("json"), c.get("auth").user) }, 201),
);

modelsApi.patch(
  "/:id",
  zValidator("param", modelIdSchema),
  zValidator("json", updateModelSchema),
  async (c) =>
    c.json({
      data: await updateModel(c.req.valid("param").id, c.req.valid("json"), c.get("auth").user),
    }),
);

modelsApi.delete("/:id", zValidator("param", modelIdSchema), async (c) =>
  c.json({ data: await deactivateModel(c.req.valid("param").id, c.get("auth").user) }),
);

export { modelsApi };
