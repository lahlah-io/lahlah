import { Hono } from "hono";
import { authApi } from "./modules/auth/index.js";
import { categoriesApi, destinationsApi } from "./modules/destinations/index.js";
import { modelsApi } from "./modules/models/index.js";
import { subscriptionPlansApi } from "./modules/subscription-plans/index.js";
import { subscriptionsApi } from "./modules/subscriptions/index.js";
import { usersApi } from "./modules/users/index.js";

const apiV1 = new Hono();
apiV1.route("/auth", authApi);
apiV1.route("/users", usersApi);
apiV1.route("/models", modelsApi);
apiV1.route("/subscription-plans", subscriptionPlansApi);
apiV1.route("/subscriptions", subscriptionsApi);
apiV1.route("/categories", categoriesApi);
apiV1.route("/destinations", destinationsApi);

const routes = new Hono();
routes.route("/api/v1", apiV1);

export { routes };
