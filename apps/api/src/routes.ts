import { Hono } from "hono";
import { destinationsApi } from "./modules/destinations/index.js";
import { usersApi } from "./modules/users/index.js";

const apiV1 = new Hono();
apiV1.route("/users", usersApi);
apiV1.route("/destinations", destinationsApi);

const routes = new Hono();
routes.route("/api/v1", apiV1);

export { routes };
