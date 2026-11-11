import { schemas } from "./schemas.js";
import type {
  OpenApiDocument,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiResponse,
  SchemaObject,
} from "./types.js";

const json = (schema: SchemaObject): Record<string, OpenApiMediaType> => ({
  "application/json": { schema },
});

const ref = (name: string): SchemaObject => ({ $ref: `#/components/schemas/${name}` });

const single = (name: string): SchemaObject => ({
  type: "object",
  required: ["data"],
  properties: { data: ref(name) },
});

const list = (name: string): SchemaObject => ({
  type: "object",
  required: ["data", "meta"],
  properties: {
    data: { type: "array", items: ref(name) },
    meta: ref("PaginationMeta"),
  },
});

const errorResponse = (description: string): OpenApiResponse => ({
  description,
  content: json(ref("Error")),
});

const validation = errorResponse("Request body or query failed validation (`VALIDATION_ERROR`).");
const unauthorized = errorResponse("Missing, invalid, or revoked session (`UNAUTHENTICATED`).");
const forbidden = errorResponse(
  "Admin role required (`FORBIDDEN`), or the account is inactive (`ACCOUNT_INACTIVE`).",
);
const internal = errorResponse("Unexpected server error (`INTERNAL_ERROR`).");
const payloadTooLarge = errorResponse("Body exceeds 1 MiB (`PAYLOAD_TOO_LARGE`).");

const notFound = (code: string) => errorResponse(`Resource not found (\`${code}\`).`);
const conflict = (code: string, description: string) => errorResponse(`${description} (\`${code}\`).`);

/** Both session transports are accepted; Swagger UI can use either one. */
const sessionSecurity: Record<string, string[]>[] = [
  { bearerAuth: [] },
  { sessionCookie: [] },
];

const idPath = (description: string): OpenApiParameter => ({
  name: "id",
  in: "path",
  required: true,
  description,
  schema: { type: "string", format: "uuid" },
});

const pageQuery: OpenApiParameter = {
  name: "page",
  in: "query",
  schema: { type: "integer", minimum: 1, default: 1 },
  description: "1-based page number.",
};

const limitQuery: OpenApiParameter = {
  name: "limit",
  in: "query",
  schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  description: "Page size (1–100).",
};

const searchQuery: OpenApiParameter = {
  name: "q",
  in: "query",
  schema: { type: "string", minLength: 1, maxLength: 255 },
  description: "Case-insensitive partial match.",
};

const activeQuery = (description: string): OpenApiParameter => ({
  name: "isActive",
  in: "query",
  schema: { type: "string", enum: ["true", "false"] },
  description,
});

const body = (name: string, description?: string): OpenApiOperation["requestBody"] => ({
  required: true,
  ...(description ? { description } : {}),
  content: json(ref(name)),
});

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Lahlah API",
    version: "1.0.0",
    description: [
      "Backend API for Lahlah: authentication through PeridotID, users and roles,",
      "models, subscription plans, quotas, destinations, and categories.",
      "",
      "**Authentication.** Send `Authorization: Bearer <token>` or the `lahlah_session` cookie.",
      "Get a development token with `pnpm --filter api dev:session`, then use **Authorize**.",
      "",
      "**Response envelope.** Successful responses are `{ \"data\": ... }`; lists add",
      "`meta: { page, limit, total }`. Failures are `{ \"error\": { code, message } }`.",
      "",
      "**Admin-only.** Users, models, categories, destinations, and plan writes require",
      "the `admin` role. Plan reads are public for the pricing page.",
    ].join("\n"),
  },
  servers: [
    { url: "/", description: "Current host (works in local development and production)" },
  ],
  tags: [
    { name: "Auth", description: "PeridotID exchange, current session, logout." },
    { name: "Users", description: "Admin user management." },
    { name: "Models", description: "Admin LLM model catalog." },
    { name: "Subscription Plans", description: "Plan catalog and admin CRUD." },
    { name: "Subscriptions", description: "The caller's plan, models, history, and quota." },
    { name: "Categories", description: "Admin destination categories (hard delete, cascades tags)." },
    { name: "Destinations", description: "Admin destination catalog (delete is soft)." },
    { name: "Health", description: "Liveness and readiness probes." },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Session token returned by the exchange endpoint with `X-Session-Mode: bearer`.",
      },
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "lahlah_session",
        description: "HttpOnly session cookie set by the exchange endpoint.",
      },
    },
    schemas,
  },
  paths: {
    "/": {
      get: {
        tags: ["Health"],
        summary: "Service name",
        operationId: "getServiceInfo",
        responses: {
          "200": {
            description: "Service identifier.",
            content: json({
              type: "object",
              required: ["name"],
              properties: { name: { type: "string", example: "lahlah-api" } },
            }),
          },
        },
      },
    },

    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Process is running.",
            content: json(ref("HealthStatus")),
          },
        },
      },
    },

    "/health/live": {
      get: {
        tags: ["Health"],
        summary: "Liveness probe",
        operationId: "getLiveness",
        responses: {
          "200": {
            description: "Process is running.",
            content: json(ref("HealthStatus")),
          },
        },
      },
    },

    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        operationId: "getReadiness",
        description: "Also verifies the PostgreSQL connection.",
        responses: {
          "200": {
            description: "Database reachable.",
            content: json(ref("ReadinessStatus")),
          },
          "503": {
            description: "Database unavailable.",
            content: json(ref("ReadinessStatus")),
          },
        },
      },
    },

    "/api/v1/auth/peridot/exchange": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a PeridotID pid_code for a session",
        operationId: "exchangePidCode",
        description: [
          "The frontend obtains `pid_code` from `peridot.auth.loginPopup()` and posts it here.",
          "The backend exchanges it server-side, creates or links the user, grants the free plan,",
          "and sets the `lahlah_session` cookie.",
          "",
          "Send `X-Session-Mode: bearer` to also receive the token in the response body.",
          "`pid_code` is single-use and short-lived, so exchange it immediately.",
        ].join("\n"),
        parameters: [
          {
            name: "X-Session-Mode",
            in: "header",
            required: false,
            description: "Set to `bearer` to receive `token` and `expiresAt` in the response.",
            schema: { type: "string", enum: ["bearer"] },
          },
        ],
        requestBody: body("ExchangeRequest"),
        responses: {
          "200": {
            description: "Session created.",
            content: json(single("ExchangeResponse")),
          },
          "400": validation,
          "401": errorResponse("PeridotID rejected the code (`PERIDOT_EXCHANGE_FAILED`)."),
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "429": errorResponse("PeridotID rate limit reached (`PERIDOT_EXCHANGE_FAILED`)."),
          "502": errorResponse("PeridotID unreachable or returned an invalid response."),
          "500": internal,
        },
      },
    },

    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        operationId: "getCurrentUser",
        security: sessionSecurity,
        responses: {
          "200": { description: "Authenticated user.", content: json(single("AuthUser")) },
          "401": unauthorized,
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "500": internal,
        },
      },
    },

    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke the current session",
        operationId: "logout",
        description: "Revokes the session token if the request carries one and clears the cookie.",
        responses: {
          "200": {
            description: "Session revoked (idempotent).",
            content: json({
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "object",
                  required: ["ok"],
                  properties: { ok: { type: "boolean", example: true } },
                },
              },
            }),
          },
          "500": internal,
        },
      },
    },

    "/api/v1/users": {
      get: {
        tags: ["Users"],
        summary: "List users",
        operationId: "listUsers",
        security: sessionSecurity,
        parameters: [
          pageQuery,
          limitQuery,
          searchQuery,
          {
            name: "role",
            in: "query",
            schema: { type: "string", enum: ["user", "admin"] },
            description: "Filter by role.",
          },
          activeQuery("Filter by account status."),
        ],
        responses: {
          "200": { description: "Paginated users.", content: json(list("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "500": internal,
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create a user",
        operationId: "createUser",
        description: "Creates the user and an active free subscription in one transaction.",
        security: sessionSecurity,
        requestBody: body("CreateUserRequest"),
        responses: {
          "201": { description: "User created.", content: json(single("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "409": conflict("EMAIL_ALREADY_EXISTS", "Email is already registered"),
          "413": payloadTooLarge,
          "500": internal,
        },
      },
    },

    "/api/v1/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get a user",
        operationId: "getUser",
        security: sessionSecurity,
        parameters: [idPath("User id.")],
        responses: {
          "200": { description: "User detail.", content: json(single("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("USER_NOT_FOUND"),
          "500": internal,
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update a user profile",
        operationId: "updateUser",
        security: sessionSecurity,
        parameters: [idPath("User id.")],
        requestBody: body("UpdateUserRequest"),
        responses: {
          "200": { description: "Updated user.", content: json(single("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("USER_NOT_FOUND"),
          "409": conflict("EMAIL_ALREADY_EXISTS", "Email is already registered"),
          "500": internal,
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Soft-delete a user",
        operationId: "deleteUser",
        description: "Sets `isActive=false`. Admins cannot delete their own account.",
        security: sessionSecurity,
        parameters: [idPath("User id.")],
        responses: {
          "200": { description: "Deactivated user.", content: json(single("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("USER_NOT_FOUND"),
          "409": conflict("CANNOT_MODIFY_SELF", "Admins cannot deactivate themselves"),
          "500": internal,
        },
      },
    },

    "/api/v1/users/{id}/role": {
      patch: {
        tags: ["Users"],
        summary: "Change a user role",
        operationId: "updateUserRole",
        security: sessionSecurity,
        parameters: [idPath("User id.")],
        requestBody: body("UpdateUserRoleRequest"),
        responses: {
          "200": { description: "Updated user.", content: json(single("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("USER_NOT_FOUND"),
          "409": conflict("CANNOT_MODIFY_SELF", "Admins cannot change their own role"),
          "500": internal,
        },
      },
    },

    "/api/v1/users/{id}/status": {
      patch: {
        tags: ["Users"],
        summary: "Activate or deactivate a user",
        operationId: "updateUserStatus",
        security: sessionSecurity,
        parameters: [idPath("User id.")],
        requestBody: body("UpdateUserStatusRequest"),
        responses: {
          "200": { description: "Updated user.", content: json(single("User")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("USER_NOT_FOUND"),
          "409": conflict("CANNOT_MODIFY_SELF", "Admins cannot deactivate themselves"),
          "500": internal,
        },
      },
    },

    "/api/v1/models": {
      get: {
        tags: ["Models"],
        summary: "List models",
        operationId: "listModels",
        security: sessionSecurity,
        parameters: [pageQuery, limitQuery, searchQuery, activeQuery("Filter by active flag.")],
        responses: {
          "200": { description: "Paginated models.", content: json(list("Model")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "500": internal,
        },
      },
      post: {
        tags: ["Models"],
        summary: "Create a model",
        operationId: "createModel",
        security: sessionSecurity,
        requestBody: body("CreateModelRequest"),
        responses: {
          "201": { description: "Model created.", content: json(single("Model")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "409": conflict(
            "MODEL_ALREADY_EXISTS",
            "This provider/model identifier already exists",
          ),
          "413": payloadTooLarge,
          "500": internal,
        },
      },
    },

    "/api/v1/models/{id}": {
      get: {
        tags: ["Models"],
        summary: "Get a model",
        operationId: "getModel",
        security: sessionSecurity,
        parameters: [idPath("Model id.")],
        responses: {
          "200": { description: "Model detail.", content: json(single("Model")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("MODEL_NOT_FOUND"),
          "500": internal,
        },
      },
      patch: {
        tags: ["Models"],
        summary: "Update a model",
        operationId: "updateModel",
        security: sessionSecurity,
        parameters: [idPath("Model id.")],
        requestBody: body("UpdateModelRequest"),
        responses: {
          "200": { description: "Updated model.", content: json(single("Model")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("MODEL_NOT_FOUND"),
          "409": conflict(
            "MODEL_ALREADY_EXISTS",
            "This provider/model identifier already exists",
          ),
          "500": internal,
        },
      },
      delete: {
        tags: ["Models"],
        summary: "Soft-delete a model",
        operationId: "deleteModel",
        description: "Sets `isActive=false`; the row is kept for historical references.",
        security: sessionSecurity,
        parameters: [idPath("Model id.")],
        responses: {
          "200": { description: "Deactivated model.", content: json(single("Model")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("MODEL_NOT_FOUND"),
          "500": internal,
        },
      },
    },

    "/api/v1/subscription-plans": {
      get: {
        tags: ["Subscription Plans"],
        summary: "List plans (public)",
        operationId: "listPlans",
        parameters: [pageQuery, limitQuery, searchQuery],
        responses: {
          "200": { description: "Paginated plans.", content: json(list("Plan")) },
          "400": validation,
          "500": internal,
        },
      },
      post: {
        tags: ["Subscription Plans"],
        summary: "Create a plan",
        operationId: "createPlan",
        security: sessionSecurity,
        requestBody: body("CreatePlanRequest"),
        responses: {
          "201": { description: "Plan created.", content: json(single("Plan")) },
          "400": errorResponse(
            "Validation failed, model inactive (`MODEL_INACTIVE`), or default model not allowed (`DEFAULT_MODEL_NOT_ALLOWED`).",
          ),
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("MODEL_NOT_FOUND"),
          "413": payloadTooLarge,
          "500": internal,
        },
      },
    },

    "/api/v1/subscription-plans/{id}": {
      get: {
        tags: ["Subscription Plans"],
        summary: "Get a plan (public)",
        operationId: "getPlan",
        parameters: [idPath("Plan id.")],
        responses: {
          "200": { description: "Plan detail.", content: json(single("Plan")) },
          "400": validation,
          "404": notFound("PLAN_NOT_FOUND"),
          "500": internal,
        },
      },
      patch: {
        tags: ["Subscription Plans"],
        summary: "Update a plan",
        operationId: "updatePlan",
        description: "`details` is merged into the existing limits object.",
        security: sessionSecurity,
        parameters: [idPath("Plan id.")],
        requestBody: body("UpdatePlanRequest"),
        responses: {
          "200": { description: "Updated plan.", content: json(single("Plan")) },
          "400": errorResponse(
            "Validation failed, model inactive (`MODEL_INACTIVE`), or default model not allowed (`DEFAULT_MODEL_NOT_ALLOWED`).",
          ),
          "401": unauthorized,
          "403": forbidden,
          "404": errorResponse("Plan not found (`PLAN_NOT_FOUND`) or model not found (`MODEL_NOT_FOUND`)."),
          "500": internal,
        },
      },
      delete: {
        tags: ["Subscription Plans"],
        summary: "Delete a plan",
        operationId: "deletePlan",
        description: "The `free` plan and plans referenced by subscriptions cannot be deleted.",
        security: sessionSecurity,
        parameters: [idPath("Plan id.")],
        responses: {
          "200": {
            description: "Deleted plan id.",
            content: json({
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "object",
                  required: ["id"],
                  properties: { id: { type: "string", format: "uuid" } },
                },
              },
            }),
          },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("PLAN_NOT_FOUND"),
          "409": errorResponse(
            "Protected system plan (`SYSTEM_PLAN`) or plan still in use (`PLAN_IN_USE`).",
          ),
          "500": internal,
        },
      },
    },

    "/api/v1/subscriptions/me": {
      get: {
        tags: ["Subscriptions"],
        summary: "My plan, limits, usage, and quota window",
        operationId: "getMyPlan",
        description: "Expired subscriptions are flipped to `expired` and fall back to the free plan.",
        security: sessionSecurity,
        responses: {
          "200": { description: "Current plan summary.", content: json(single("MyPlan")) },
          "401": unauthorized,
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "500": internal,
        },
      },
    },

    "/api/v1/subscriptions/me/models": {
      get: {
        tags: ["Subscriptions"],
        summary: "Models my plan can use",
        operationId: "getMyModels",
        security: sessionSecurity,
        responses: {
          "200": { description: "Allowed models and default model.", content: json(single("MyModels")) },
          "401": unauthorized,
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "500": internal,
        },
      },
    },

    "/api/v1/subscriptions/me/history": {
      get: {
        tags: ["Subscriptions"],
        summary: "My subscription history",
        operationId: "getSubscriptionHistory",
        security: sessionSecurity,
        responses: {
          "200": {
            description: "Newest first.",
            content: json({
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "array",
                  items: ref("SubscriptionHistoryItem"),
                },
              },
            }),
          },
          "401": unauthorized,
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "500": internal,
        },
      },
    },

    "/api/v1/subscriptions/me/quota": {
      get: {
        tags: ["Subscriptions"],
        summary: "Current quota usage",
        operationId: "getMyQuota",
        description:
          "Without `metric`, returns all three quotas. With `metric`, returns one `QuotaCheck`.",
        security: sessionSecurity,
        parameters: [
          {
            name: "metric",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["chatMessages", "chatSessions", "itineraries"] },
            description: "Limit the result to a single metric.",
          },
        ],
        responses: {
          "200": {
            description: "All quotas, or one quota check when `metric` is set.",
            content: json({
              oneOf: [
                {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "object",
                      required: ["chatMessages", "chatSessions", "itineraries"],
                      properties: {
                        chatMessages: ref("QuotaCheck"),
                        chatSessions: ref("QuotaCheck"),
                        itineraries: ref("QuotaCheck"),
                      },
                    },
                  },
                },
                single("QuotaCheck"),
              ],
            }),
          },
          "400": validation,
          "401": unauthorized,
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "500": internal,
        },
      },
    },

    "/api/v1/subscriptions/me/quota/check": {
      post: {
        tags: ["Subscriptions"],
        summary: "Check whether an action fits the quota",
        operationId: "checkQuota",
        description: "Read-only; does not consume quota. The chat module calls the same service directly.",
        security: sessionSecurity,
        requestBody: body("CheckQuotaRequest"),
        responses: {
          "200": { description: "Quota decision.", content: json(single("QuotaCheck")) },
          "400": validation,
          "401": unauthorized,
          "403": errorResponse("Account is inactive (`ACCOUNT_INACTIVE`)."),
          "500": internal,
        },
      },
    },

    "/api/v1/categories": {
      get: {
        tags: ["Categories"],
        summary: "List categories",
        operationId: "listCategories",
        security: sessionSecurity,
        parameters: [pageQuery, limitQuery, searchQuery],
        responses: {
          "200": { description: "Paginated categories.", content: json(list("Category")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "500": internal,
        },
      },
      post: {
        tags: ["Categories"],
        summary: "Create a category",
        operationId: "createCategory",
        description: "The slug is derived from `name` when omitted.",
        security: sessionSecurity,
        requestBody: body("CreateCategoryRequest"),
        responses: {
          "201": { description: "Category created.", content: json(single("Category")) },
          "400": errorResponse(
            "Validation failed, or no slug can be derived from the name (`INVALID_SLUG`).",
          ),
          "401": unauthorized,
          "403": forbidden,
          "409": conflict("CATEGORY_SLUG_EXISTS", "A category with this slug already exists"),
          "413": payloadTooLarge,
          "500": internal,
        },
      },
    },

    "/api/v1/categories/{id}": {
      get: {
        tags: ["Categories"],
        summary: "Get a category",
        operationId: "getCategory",
        security: sessionSecurity,
        parameters: [idPath("Category id.")],
        responses: {
          "200": { description: "Category detail.", content: json(single("Category")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("CATEGORY_NOT_FOUND"),
          "500": internal,
        },
      },
      patch: {
        tags: ["Categories"],
        summary: "Update a category",
        operationId: "updateCategory",
        security: sessionSecurity,
        parameters: [idPath("Category id.")],
        requestBody: body("UpdateCategoryRequest"),
        responses: {
          "200": { description: "Updated category.", content: json(single("Category")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("CATEGORY_NOT_FOUND"),
          "409": conflict("CATEGORY_SLUG_EXISTS", "A category with this slug already exists"),
          "500": internal,
        },
      },
      delete: {
        tags: ["Categories"],
        summary: "Delete a category",
        operationId: "deleteCategory",
        description:
          "Hard delete. `destination_categories` cascades, so destinations survive and only lose the tag.",
        security: sessionSecurity,
        parameters: [idPath("Category id.")],
        responses: {
          "200": {
            description: "Deleted category id.",
            content: json({
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "object",
                  required: ["id"],
                  properties: { id: { type: "string", format: "uuid" } },
                },
              },
            }),
          },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("CATEGORY_NOT_FOUND"),
          "500": internal,
        },
      },
    },

    "/api/v1/destinations": {
      get: {
        tags: ["Destinations"],
        summary: "List destinations",
        operationId: "listDestinations",
        security: sessionSecurity,
        parameters: [
          pageQuery,
          limitQuery,
          searchQuery,
          activeQuery("Filter by active flag; deleted destinations are inactive."),
          {
            name: "source",
            in: "query",
            schema: { type: "string", enum: ["geoapify", "admin", "user"] },
            description: "Filter by origin.",
          },
          {
            name: "categoryId",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description: "Only destinations tagged with this category.",
          },
        ],
        responses: {
          "200": { description: "Paginated destinations.", content: json(list("Destination")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "500": internal,
        },
      },
      post: {
        tags: ["Destinations"],
        summary: "Create a destination",
        operationId: "createDestination",
        description:
          "Always stored with `source=admin` and `createdBy` from the session. Coordinates are normalised to 7 decimals.",
        security: sessionSecurity,
        requestBody: body("CreateDestinationRequest"),
        responses: {
          "201": { description: "Destination created.", content: json(single("Destination")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("CATEGORY_NOT_FOUND"),
          "413": payloadTooLarge,
          "500": internal,
        },
      },
    },

    "/api/v1/destinations/{id}": {
      get: {
        tags: ["Destinations"],
        summary: "Get a destination",
        operationId: "getDestination",
        security: sessionSecurity,
        parameters: [idPath("Destination id.")],
        responses: {
          "200": { description: "Destination detail.", content: json(single("Destination")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("DESTINATION_NOT_FOUND"),
          "500": internal,
        },
      },
      patch: {
        tags: ["Destinations"],
        summary: "Update a destination",
        operationId: "updateDestination",
        description:
          "`details` is merged. `categoryIds` replaces the full tag list. Set `isActive=true` to restore.",
        security: sessionSecurity,
        parameters: [idPath("Destination id.")],
        requestBody: body("UpdateDestinationRequest"),
        responses: {
          "200": { description: "Updated destination.", content: json(single("Destination")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("DESTINATION_NOT_FOUND / CATEGORY_NOT_FOUND"),
          "500": internal,
        },
      },
      delete: {
        tags: ["Destinations"],
        summary: "Soft-delete a destination",
        operationId: "deleteDestination",
        description:
          "Sets `isActive=false` because itineraries reference destinations with `onDelete: Restrict`.",
        security: sessionSecurity,
        parameters: [idPath("Destination id.")],
        responses: {
          "200": { description: "Deactivated destination.", content: json(single("Destination")) },
          "400": validation,
          "401": unauthorized,
          "403": forbidden,
          "404": notFound("DESTINATION_NOT_FOUND"),
          "500": internal,
        },
      },
    },
  },
};
