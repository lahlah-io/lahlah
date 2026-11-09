import { Hono } from "hono";
import { requireAdmin, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import {
  changeUserRole,
  changeUserStatus,
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  updateUser,
} from "../services/users.service.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdSchema,
} from "../schemas/user.schema.js";

const usersApi = new Hono<{ Variables: AuthVariables }>();

usersApi.use("*", requireAdmin);

usersApi.get("/", zValidator("query", listUsersQuerySchema), async (c) =>
  c.json(await listUsers(c.req.valid("query"))),
);

usersApi.get("/:id", zValidator("param", userIdSchema), async (c) =>
  c.json({ data: await getUser(c.req.valid("param").id) }),
);

usersApi.post("/", zValidator("json", createUserSchema), async (c) =>
  c.json({ data: await createUser(c.req.valid("json"), c.get("auth").user) }, 201),
);

usersApi.patch(
  "/:id",
  zValidator("param", userIdSchema),
  zValidator("json", updateUserSchema),
  async (c) =>
    c.json({
      data: await updateUser(c.req.valid("param").id, c.req.valid("json"), c.get("auth").user),
    }),
);

usersApi.patch(
  "/:id/role",
  zValidator("param", userIdSchema),
  zValidator("json", updateUserRoleSchema),
  async (c) =>
    c.json({
      data: await changeUserRole(c.req.valid("param").id, c.req.valid("json").role, c.get("auth").user),
    }),
);

usersApi.patch(
  "/:id/status",
  zValidator("param", userIdSchema),
  zValidator("json", updateUserStatusSchema),
  async (c) =>
    c.json({
      data: await changeUserStatus(
        c.req.valid("param").id,
        c.req.valid("json").isActive,
        c.get("auth").user,
      ),
    }),
);

usersApi.delete("/:id", zValidator("param", userIdSchema), async (c) =>
  c.json({ data: await deactivateUser(c.req.valid("param").id, c.get("auth").user) }),
);

export { usersApi };
