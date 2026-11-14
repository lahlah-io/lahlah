import { Hono } from "hono";
import { requireAdmin, requireAuth, type AuthVariables } from "../../../shared/auth/middleware.js";
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

// Profil milik sendiri: cukup `requireAuth`. Semua route admin lain memakai
// `requireAdmin` per route supaya `/me` tidak ikut terkunci.
usersApi.patch(
  "/me",
  requireAuth,
  zValidator("json", updateUserSchema),
  async (c) =>
    c.json({
      data: await updateUser(
        c.get("auth").user.id,
        c.req.valid("json"),
        c.get("auth").user,
      ),
    }),
);

usersApi.get("/", requireAdmin, zValidator("query", listUsersQuerySchema), async (c) =>
  c.json(await listUsers(c.req.valid("query"))),
);

usersApi.get("/:id", requireAdmin, zValidator("param", userIdSchema), async (c) =>
  c.json({ data: await getUser(c.req.valid("param").id) }),
);

usersApi.post(
  "/",
  requireAdmin,
  zValidator("json", createUserSchema),
  async (c) =>
    c.json({ data: await createUser(c.req.valid("json"), c.get("auth").user) }, 201),
);

usersApi.patch(
  "/:id",
  requireAdmin,
  zValidator("param", userIdSchema),
  zValidator("json", updateUserSchema),
  async (c) =>
    c.json({
      data: await updateUser(c.req.valid("param").id, c.req.valid("json"), c.get("auth").user),
    }),
);

usersApi.patch(
  "/:id/role",
  requireAdmin,
  zValidator("param", userIdSchema),
  zValidator("json", updateUserRoleSchema),
  async (c) =>
    c.json({
      data: await changeUserRole(c.req.valid("param").id, c.req.valid("json").role, c.get("auth").user),
    }),
);

usersApi.patch(
  "/:id/status",
  requireAdmin,
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

usersApi.delete("/:id", requireAdmin, zValidator("param", userIdSchema), async (c) =>
  c.json({ data: await deactivateUser(c.req.valid("param").id, c.get("auth").user) }),
);

export { usersApi };
