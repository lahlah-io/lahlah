import { Hono } from "hono";
import { requireAdmin, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "../services/categories.service.js";
import {
  categoryIdSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "../schemas/category.schema.js";

const categoriesApi = new Hono<{ Variables: AuthVariables }>();

categoriesApi.use("*", requireAdmin);

categoriesApi.get("/", zValidator("query", listCategoriesQuerySchema), async (c) =>
  c.json(await listCategories(c.req.valid("query"))),
);

categoriesApi.get("/:id", zValidator("param", categoryIdSchema), async (c) =>
  c.json({ data: await getCategory(c.req.valid("param").id) }),
);

categoriesApi.post("/", zValidator("json", createCategorySchema), async (c) =>
  c.json({ data: await createCategory(c.req.valid("json"), c.get("auth").user) }, 201),
);

categoriesApi.patch(
  "/:id",
  zValidator("param", categoryIdSchema),
  zValidator("json", updateCategorySchema),
  async (c) =>
    c.json({
      data: await updateCategory(c.req.valid("param").id, c.req.valid("json"), c.get("auth").user),
    }),
);

categoriesApi.delete("/:id", zValidator("param", categoryIdSchema), async (c) =>
  c.json({ data: await deleteCategory(c.req.valid("param").id, c.get("auth").user) }),
);

export { categoriesApi };
