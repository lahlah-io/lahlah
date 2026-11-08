import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { createUser, deactivateUser, getUser, listUsers, updateUser } from "../services/users.service.js";
import { createUserSchema, listUsersQuerySchema, updateUserSchema, userIdSchema } from "../schemas/user.schema.js";

const usersApi = new Hono();

usersApi.use("*", async (c, next) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: { code: "AUTH_NOT_CONFIGURED", message: "User API is disabled until authentication is configured" } }, 503);
  }
  await next();
});

usersApi.get("/", zValidator("query", listUsersQuerySchema), async (c) =>
  c.json(await listUsers(c.req.valid("query"))),
);
usersApi.get("/:id", zValidator("param", userIdSchema), async (c) =>
  c.json({ data: await getUser(c.req.valid("param").id) }),
);
usersApi.post("/", zValidator("json", createUserSchema), async (c) =>
  c.json({ data: await createUser(c.req.valid("json")) }, 201),
);
usersApi.patch(
  "/:id",
  zValidator("param", userIdSchema),
  zValidator("json", updateUserSchema),
  async (c) => c.json({ data: await updateUser(c.req.valid("param").id, c.req.valid("json")) }),
);
usersApi.delete("/:id", zValidator("param", userIdSchema), async (c) =>
  c.json({ data: await deactivateUser(c.req.valid("param").id) }),
);

export { usersApi };
