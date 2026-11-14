import type { SchemaObject } from "./types.js";

const uuid: SchemaObject = { type: "string", format: "uuid" };
const timestamp: SchemaObject = { type: "string", format: "date-time" };
const nullableString: SchemaObject = { type: ["string", "null"] };
const nullableTimestamp: SchemaObject = { type: ["string", "null"], format: "date-time" };
const nullableUuid: SchemaObject = { type: ["string", "null"], format: "uuid" };

const username: SchemaObject = {
  type: "string",
  minLength: 3,
  maxLength: 30,
  pattern: "^[a-z0-9_]+$",
  example: "budi_santoso",
  description: "Lowercase letters, digits, underscores. Unique per user.",
};

const role: SchemaObject = { type: "string", enum: ["user", "admin"] };
const subscriptionStatus: SchemaObject = {
  type: "string",
  enum: ["active", "canceled", "expired", "pending"],
};
const billingInterval: SchemaObject = { type: "string", enum: ["monthly", "yearly", "forever"] };
const destinationSource: SchemaObject = { type: "string", enum: ["geoapify", "admin", "user"] };

const planLimits: SchemaObject = {
  type: "object",
  description:
    "Plan limits stored as JSONB. `null` means unlimited. Unknown keys are preserved.",
  additionalProperties: true,
  properties: {
    chatMessagesPerMonth: { type: ["integer", "null"], minimum: 0 },
    maxChatSessions: { type: ["integer", "null"], minimum: 0 },
    maxItineraries: { type: ["integer", "null"], minimum: 0 },
    allowedModelIds: {
      type: ["array", "null"],
      items: uuid,
      description: "`null` allows every active model; `[]` allows none.",
    },
  },
};

const quotaUsage: SchemaObject = {
  type: "object",
  required: ["chatMessages", "chatSessions", "itineraries"],
  properties: {
    chatMessages: { type: "integer", minimum: 0 },
    chatSessions: { type: "integer", minimum: 0 },
    itineraries: { type: "integer", minimum: 0 },
  },
};

const quotaLimits: SchemaObject = {
  type: "object",
  required: ["chatMessages", "chatSessions", "itineraries"],
  properties: {
    chatMessages: { type: ["integer", "null"], minimum: 0 },
    chatSessions: { type: ["integer", "null"], minimum: 0 },
    itineraries: { type: ["integer", "null"], minimum: 0 },
  },
};

const quotaPeriod: SchemaObject = {
  type: "object",
  required: ["start", "end"],
  properties: { start: timestamp, end: timestamp },
  description: "UTC calendar-month window.",
};

const durationMetadata = {
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const schemas: Record<string, SchemaObject> = {
  Error: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            description: "Stable machine-readable error code.",
            example: "VALIDATION_ERROR",
          },
          message: { type: "string", example: "Request validation failed" },
        },
      },
    },
  },

  PaginationMeta: {
    type: "object",
    required: ["page", "limit", "total"],
    properties: {
      page: { type: "integer", minimum: 1, example: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, example: 20 },
      total: { type: "integer", minimum: 0, example: 42 },
    },
  },

  AuthUser: {
    type: "object",
    required: ["id", "pid", "name", "username", "email", "role", "isActive"],
    properties: {
      id: uuid,
      pid: {
        ...uuid,
        description: "PeridotID identity linked to this account.",
      },
      name: { type: "string", maxLength: 255 },
      username,
      email: { ...nullableString, format: "email" },
      role,
      isActive: { type: "boolean" },
    },
  },

  ExchangeRequest: {
    type: "object",
    required: ["code", "redirectUri"],
    properties: {
      code: {
        type: "string",
        minLength: 1,
        maxLength: 2048,
        description: "Single-use `pid_code` returned by `peridot.auth.loginPopup()`.",
      },
      codeVerifier: {
        type: "string",
        minLength: 1,
        maxLength: 512,
        description: "PKCE verifier when the PeridotID app requires one.",
      },
      redirectUri: {
        type: "string",
        minLength: 1,
        maxLength: 2048,
        description: "Must exactly match the URL the code was issued for (OAuth binding).",
      },
    },
  },

  ExchangeResponse: {
    type: "object",
    required: ["user"],
    properties: {
      user: { $ref: "#/components/schemas/AuthUser" },
      token: {
        type: "string",
        description: "Only returned when the request sends `X-Session-Mode: bearer`.",
      },
      expiresAt: { ...timestamp, description: "Present together with `token`." },
    },
  },

  SubscriptionSummary: {
    type: "object",
    required: ["id", "status", "startedAt", "expiresAt", "plan"],
    properties: {
      id: uuid,
      status: subscriptionStatus,
      startedAt: nullableTimestamp,
      expiresAt: nullableTimestamp,
      plan: {
        type: "object",
        required: ["id", "name"],
        properties: { id: uuid, name: { type: "string", example: "free" } },
      },
    },
  },

  User: {
    type: "object",
    required: [
      "id",
      "pid",
      "name",
      "username",
      "email",
      "role",
      "isActive",
      "createdAt",
      "updatedAt",
      "subscriptions",
    ],
    properties: {
      id: uuid,
      pid: uuid,
      name: { type: "string", maxLength: 255 },
      username,
      email: { ...nullableString, format: "email" },
      role,
      isActive: { type: "boolean" },
      ...durationMetadata,
      subscriptions: {
        type: "array",
        description: "At most one active subscription per user.",
        items: { $ref: "#/components/schemas/SubscriptionSummary" },
      },
    },
  },

  CreateUserRequest: {
    type: "object",
    required: ["name", "username", "email"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255, example: "Budi Santoso" },
      username,
      email: { type: "string", format: "email", maxLength: 255, example: "budi@example.com" },
      role: { ...role, default: "user" },
    },
  },

  UpdateUserRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      username,
      email: { type: "string", format: "email", maxLength: 255 },
    },
  },

  UpdateUserRoleRequest: {
    type: "object",
    required: ["role"],
    properties: { role },
  },

  UpdateUserStatusRequest: {
    type: "object",
    required: ["isActive"],
    properties: { isActive: { type: "boolean", example: false } },
  },

  Model: {
    type: "object",
    required: [
      "id",
      "name",
      "provider",
      "modelIdentifier",
      "priceInputPer1m",
      "priceOutputPer1m",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      id: uuid,
      name: { type: "string", example: "GPT-4o mini" },
      provider: { type: "string", example: "openai" },
      modelIdentifier: { type: "string", example: "gpt-4o-mini" },
      priceInputPer1m: {
        type: "string",
        pattern: "^\\d+(\\.\\d{1,6})?$",
        example: "0.150000",
        description: "USD per 1M input tokens, encoded as a decimal string.",
      },
      priceOutputPer1m: {
        type: "string",
        pattern: "^\\d+(\\.\\d{1,6})?$",
        example: "0.600000",
        description: "USD per 1M output tokens, encoded as a decimal string.",
      },
      isActive: { type: "boolean" },
      ...durationMetadata,
    },
  },

  PublicModel: {
    type: "object",
    required: [
      "id",
      "name",
      "provider",
      "modelIdentifier",
      "priceInputPer1m",
      "priceOutputPer1m",
      "isActive",
    ],
    properties: {
      id: uuid,
      name: { type: "string" },
      provider: { type: "string" },
      modelIdentifier: { type: "string" },
      priceInputPer1m: { type: "string" },
      priceOutputPer1m: { type: "string" },
      isActive: { type: "boolean" },
    },
  },

  CreateModelRequest: {
    type: "object",
    required: ["name", "provider", "modelIdentifier"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255, example: "GPT-4o mini" },
      provider: { type: "string", minLength: 1, maxLength: 255, example: "openai" },
      modelIdentifier: { type: "string", minLength: 1, maxLength: 255, example: "gpt-4o-mini" },
      priceInputPer1m: {
        type: ["number", "string"],
        default: "0",
        example: "0.15",
      },
      priceOutputPer1m: {
        type: ["number", "string"],
        default: "0",
        example: "0.60",
      },
      isActive: { type: "boolean", default: true },
    },
  },

  UpdateModelRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      provider: { type: "string", minLength: 1, maxLength: 255 },
      modelIdentifier: { type: "string", minLength: 1, maxLength: 255 },
      priceInputPer1m: { type: ["number", "string"] },
      priceOutputPer1m: { type: ["number", "string"] },
      isActive: { type: "boolean" },
    },
  },

  PlanLimits: planLimits,

  Plan: {
    type: "object",
    required: [
      "id",
      "name",
      "description",
      "price",
      "billingInterval",
      "defaultModelId",
      "details",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      id: uuid,
      name: { type: "string", example: "free" },
      description: nullableString,
      price: {
        type: "string",
        pattern: "^\\d+(\\.\\d{1,2})?$",
        example: "0.00",
        description: "Decimal string. Payments charge the plan price gross.",
      },
      billingInterval,
      defaultModelId: nullableUuid,
      details: { $ref: "#/components/schemas/PlanLimits" },
      ...durationMetadata,
    },
  },

  CreatePlanRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255, example: "pro" },
      description: { type: "string", maxLength: 2000 },
      price: { type: ["number", "string"], default: "0", example: "49000" },
      billingInterval: { ...billingInterval, default: "monthly" },
      defaultModelId: nullableUuid,
      details: { $ref: "#/components/schemas/PlanLimits" },
    },
  },

  UpdatePlanRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      description: { type: "string", maxLength: 2000 },
      price: { type: ["number", "string"] },
      billingInterval,
      defaultModelId: nullableUuid,
      details: { $ref: "#/components/schemas/PlanLimits" },
    },
  },

  MyPlan: {
    type: "object",
    required: ["subscription", "plan", "limits", "usage", "period", "quotaLimits"],
    properties: {
      subscription: {
        type: "object",
        required: ["id", "status", "startedAt", "expiresAt"],
        properties: {
          id: uuid,
          status: subscriptionStatus,
          startedAt: nullableTimestamp,
          expiresAt: nullableTimestamp,
        },
      },
      plan: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "price",
          "billingInterval",
          "defaultModelId",
        ],
        properties: {
          id: uuid,
          name: { type: "string" },
          description: nullableString,
          price: { type: "string" },
          billingInterval,
          defaultModelId: nullableUuid,
        },
      },
      limits: { $ref: "#/components/schemas/PlanLimits" },
      usage: { $ref: "#/components/schemas/QuotaUsage" },
      period: { $ref: "#/components/schemas/QuotaPeriod" },
      quotaLimits: { $ref: "#/components/schemas/QuotaLimits" },
    },
  },

  QuotaUsage: quotaUsage,
  QuotaLimits: quotaLimits,
  QuotaPeriod: quotaPeriod,

  QuotaCheck: {
    type: "object",
    required: ["metric", "allowed", "limit", "used", "amount", "remaining", "period"],
    properties: {
      metric: { type: "string", enum: ["chatMessages", "chatSessions", "itineraries"] },
      allowed: { type: "boolean" },
      limit: { type: ["integer", "null"], minimum: 0 },
      used: { type: "integer", minimum: 0 },
      amount: { type: "integer", minimum: 1 },
      remaining: { type: ["integer", "null"], minimum: 0 },
      period: { $ref: "#/components/schemas/QuotaPeriod" },
    },
  },

  CheckQuotaRequest: {
    type: "object",
    required: ["metric"],
    properties: {
      metric: { type: "string", enum: ["chatMessages", "chatSessions", "itineraries"] },
      amount: { type: "integer", minimum: 1, maximum: 1000, default: 1 },
    },
  },

  MyModels: {
    type: "object",
    required: ["defaultModelId", "allowedModelIds", "models"],
    properties: {
      defaultModelId: nullableUuid,
      allowedModelIds: {
        type: ["array", "null"],
        items: uuid,
        description: "`null` means the plan allows every active model.",
      },
      models: { type: "array", items: { $ref: "#/components/schemas/PublicModel" } },
    },
  },

  SubscriptionHistoryItem: {
    type: "object",
    required: ["id", "status", "startedAt", "expiresAt", "plan"],
    properties: {
      id: uuid,
      status: subscriptionStatus,
      startedAt: nullableTimestamp,
      expiresAt: nullableTimestamp,
      plan: {
        type: "object",
        required: ["id", "name", "price", "billingInterval"],
        properties: {
          id: uuid,
          name: { type: "string" },
          price: { type: "string", pattern: "^\\d+\\.\\d{2}$", example: "49000.00" },
          billingInterval,
        },
      },
    },
  },

  Category: {
    type: "object",
    required: ["id", "name", "slug", "createdAt", "updatedAt"],
    properties: {
      id: uuid,
      name: { type: "string", maxLength: 255, example: "Pantai" },
      slug: {
        type: "string",
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        example: "pantai",
      },
      ...durationMetadata,
    },
  },

  CreateCategoryRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255, example: "Pantai" },
      slug: {
        type: "string",
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description: "Optional. Derived from `name` when omitted.",
        example: "pantai",
      },
    },
  },

  UpdateCategoryRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    },
  },

  Destination: {
    type: "object",
    required: [
      "id",
      "name",
      "description",
      "latitude",
      "longitude",
      "address",
      "source",
      "sourcePlaceId",
      "createdBy",
      "isActive",
      "imageUrl",
      "details",
      "lastSyncedAt",
      "createdAt",
      "updatedAt",
      "categories",
    ],
    properties: {
      id: uuid,
      name: { type: "string", maxLength: 255, example: "Danau Toba" },
      description: nullableString,
      latitude: {
        type: ["string", "null"],
        pattern: "^-?\\d+\\.\\d{7}$",
        example: "-6.2000000",
        description: "Normalised to 7 decimal places.",
      },
      longitude: {
        type: ["string", "null"],
        pattern: "^-?\\d+\\.\\d{7}$",
        example: "106.8166660",
        description: "Normalised to 7 decimal places.",
      },
      address: nullableString,
      source: destinationSource,
      sourcePlaceId: nullableString,
      createdBy: nullableUuid,
      isActive: { type: "boolean" },
      imageUrl: { ...nullableString, format: "uri" },
      details: {
        type: "object",
        additionalProperties: true,
        description: "Free-form metadata. PATCH merges instead of replacing.",
      },
      lastSyncedAt: nullableTimestamp,
      ...durationMetadata,
      categories: {
        type: "array",
        items: { $ref: "#/components/schemas/Category" },
      },
    },
  },

  CreateDestinationRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255, example: "Danau Toba" },
      description: { ...nullableString, maxLength: 5000 },
      latitude: {
        type: ["number", "string", "null"],
        minimum: -90,
        maximum: 90,
        example: -6.2,
      },
      longitude: {
        type: ["number", "string", "null"],
        minimum: -180,
        maximum: 180,
        example: 106.8166666,
      },
      address: { ...nullableString, maxLength: 255 },
      imageUrl: { ...nullableString, format: "uri", maxLength: 2048 },
      details: {
        type: "object",
        additionalProperties: true,
        default: {},
        example: { entranceFee: 10000 },
      },
      categoryIds: {
        type: "array",
        items: uuid,
        default: [],
        description: "Duplicate ids are ignored; unknown ids return `404 CATEGORY_NOT_FOUND`.",
      },
    },
  },

  UpdateDestinationRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      description: { ...nullableString, maxLength: 5000 },
      latitude: { type: ["number", "string", "null"], minimum: -90, maximum: 90 },
      longitude: { type: ["number", "string", "null"], minimum: -180, maximum: 180 },
      address: { ...nullableString, maxLength: 255 },
      imageUrl: { ...nullableString, format: "uri", maxLength: 2048 },
      details: {
        type: "object",
        additionalProperties: true,
        description: "Merged into the existing details object.",
      },
      categoryIds: {
        type: "array",
        items: uuid,
        description: "Replaces the full tag list. `[]` removes every tag.",
      },
      isActive: {
        type: "boolean",
        description: "Set to `true` to restore a soft-deleted destination.",
      },
    },
  },

  HealthStatus: {
    type: "object",
    required: ["status", "requestId"],
    properties: {
      status: { type: "string", example: "ok" },
      requestId: uuid,
    },
  },

  ReadinessStatus: {
    type: "object",
    required: ["status", "dependencies", "requestId"],
    properties: {
      status: { type: "string", enum: ["ok", "not_ready"] },
      dependencies: {
        type: "object",
        required: ["database"],
        properties: { database: { type: "string", enum: ["ok", "unavailable"] } },
      },
      requestId: uuid,
    },
  },
};
