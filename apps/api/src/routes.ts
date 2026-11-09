import { Hono } from "hono";
import { usersApi } from "./modules/users/index.js";

const apiV1 = new Hono();
apiV1.route("/users", usersApi);

const routes = new Hono();
routes.route("/api/v1", apiV1);

export { routes };
