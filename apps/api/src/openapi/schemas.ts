import { intentLabels } from "../modules/chat/services/classifier.js";
import type { SchemaObject } from "./types.js";

const uuid: SchemaObject = { type: "string", format: "uuid" };
const timestamp: SchemaObject = { type: "string", format: "date-time" };
const nullableString: SchemaObject = { type: ["string", "null"] };
const nullableTimestamp: SchemaObject = { type: ["string", "null"], format: "date-time" };
const nullableUuid: SchemaObject = { type: ["string", "null"], format: "uuid" };
const integer: SchemaObject = { type: "integer", minimum: 0 };
const nullableInteger: SchemaObject = { type: ["integer", "null"], minimum: 0 };

/** Road distance in meters from the previous stop; null on the first stop or when routing failed. */
const legDistanceM: SchemaObject = {
  type: ["integer", "null"],
  minimum: 0,
  description:
    "Road distance in meters from the previous stop to this one (OSRM driving route, not a straight line). " +
    "`null` for the first stop of a version, when a stop lacks coordinates, or when routing fell back to a straight line.",
  example: 1200,
};

/** Same value as `distance`, in km with one decimal, for display. */
const legDistanceKm: SchemaObject = {
  type: ["number", "null"],
  minimum: 0,
  description: "Same value as `distance`, in km with one decimal, for display.",
  example: 1.2,
};

const totalDistanceM: SchemaObject = {
  type: ["integer", "null"],
  minimum: 0,
  description:
    "Road distance total for this version batch, in meters: `SUM(distance)` over its stops. A batch is the set of " +
    "`trip_destinations` rows sharing one `createdAt`. `null` when no stop has a road distance.",
  example: 3000,
};

const totalDistanceKm: SchemaObject = {
  type: ["number", "null"],
  minimum: 0,
  description: "Same total as `totalDistanceM`, in km with one decimal.",
  example: 3,
};
const jsonObject: SchemaObject = { type: "object", additionalProperties: true };
const nullableJson: SchemaObject = { type: ["object", "array", "null"] };
const ymd: SchemaObject = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2026-12-01" };
const hhmm: SchemaObject = { type: "string", pattern: "^\\d{2}:\\d{2}$", example: "08:00" };
const coordinatePair: SchemaObject = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
};
const geoLineString: SchemaObject = {
  type: "object",
  required: ["type", "coordinates"],
  properties: {
    type: { const: "LineString" },
    coordinates: { type: "array", items: coordinatePair },
  },
};

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
const destinationSource: SchemaObject = {
  type: "string",
  enum: ["geoapify", "firecrawl", "overpass", "wikidata", "manual", "admin", "user"],
};

/** Kecamatan Kota Padang. Nilai resmi saja; input bebas dinormalisasi backend. */
const PADANG_DISTRICT_NAMES = [
  "Bungus Teluk Kabung",
  "Koto Tangah",
  "Kuranji",
  "Lubuk Begalung",
  "Lubuk Kilangan",
  "Nanggalo",
  "Padang Barat",
  "Padang Selatan",
  "Padang Timur",
  "Padang Utara",
  "Pauh",
] as const;

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
        type: "string",
        description: "PeridotID identity linked to this account. Legacy rows are not uuid-shaped.",
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
      pid: { type: "string", description: "PeridotID identity; legacy rows are not uuid-shaped." },
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

  District: {
    type: "string",
    enum: [...PADANG_DISTRICT_NAMES],
    example: "Padang Barat",
    description:
      "Kecamatan Kota Padang (11 kecamatan). Query/filter menerima nama bebas (`padang barat`, `barat`, `Kec. Padang Bar.`) dan menormalkannya; nilai di luar daftar ditolak `422`.",
  },
  DistrictCount: {
    type: "object",
    required: ["district", "total"],
    properties: {
      district: { $ref: "#/components/schemas/District" },
      total: { type: "integer", minimum: 0, example: 134, description: "Destinasi aktif di kecamatan ini." },
    },
  },
  EstimatedCost: {
    type: "object",
    description:
      "Estimasi biaya kasar per destinasi, disimpan di `Destination.details.estimatedCost`. " +
      "Bukan harga resmi: `confidence` selalu `estimasi` dan `verified` masih `false` sampai diverifikasi lapangan. " +
      "Tampilkan sebagai rentang (mis. \"sekitar Rp20.000–50.000/orang\") dan jangan dijumlahkan sebagai biaya final trip. " +
      "`null` bila destinasi belum punya estimasi; jawaban tetap valid tanpa field ini.",
    required: ["currency", "min", "max", "kind", "confidence", "verified"],
    properties: {
      currency: { type: "string", enum: ["IDR"], example: "IDR" },
      min: { type: "integer", minimum: 0, example: 20000, description: "Batas bawah estimasi (inklusif)." },
      max: { type: "integer", minimum: 0, example: 50000, description: "Batas atas estimasi (inklusif)." },
      kind: {
        type: "string",
        enum: ["konsumsi", "tiket", "parkir", "gratis"],
        example: "konsumsi",
        description:
          "`konsumsi` makanan/minuman, `tiket` tiket masuk, `parkir` biaya parkir, `gratis` tanpa biaya (min=max=0).",
      },
      unit: { type: "string", example: "per orang", description: "Satuan biaya, mis. `per orang`, `per kendaraan`." },
      note: { type: "string", example: "estimasi minum + camilan" },
      basis: { type: "string", example: "kedai kopi", description: "Kategori Google/katalog yang jadi dasar estimasi." },
      confidence: { type: "string", enum: ["estimasi"], example: "estimasi" },
      verified: { type: "boolean", example: false, description: "`true` hanya setelah dicek lapangan." },
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
      "district",
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
      city: {
        type: ["string", "null"],
        maxLength: 100,
        example: "Padang",
        description: "Kota administratif destinasi. Katalog chat hanya memakai `Padang`.",
      },
      district: {
        $ref: "#/components/schemas/District",
        description:
          "Kecamatan Kota Padang. Bisa `null` bila alamat tidak menyebut kecamatan/kelurahan; baris seperti itu tetap muncul di filter kategori, tetapi tidak di filter `district`.",
      },
      source: destinationSource,
      sourcePlaceId: nullableString,
      createdBy: nullableUuid,
      isActive: { type: "boolean" },
      imageUrl: { ...nullableString, format: "uri" },
      details: {
        type: "object",
        additionalProperties: true,
        description:
          "Free-form metadata. PATCH merges instead of replacing. " +
          "Katalog seeder Padang mengisi `estimatedCost` (lihat `EstimatedCost`), `googleCategory`, `reviewRating`, `phone`, `link`.",
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
      district: { $ref: "#/components/schemas/District" },
      imageUrl: { ...nullableString, format: "uri", maxLength: 2048 },
      details: {
        type: "object",
        additionalProperties: true,
        default: {},
        example: {
          estimatedCost: {
            currency: "IDR",
            min: 20000,
            max: 50000,
            kind: "konsumsi",
            unit: "per orang",
            basis: "kedai kopi",
            confidence: "estimasi",
            verified: false,
          },
        },
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
      district: { $ref: "#/components/schemas/District" },
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

  ChatSession: {
    type: "object",
    description: "Chat session owned by `userId`, with token counters and soft-delete state.",
    required: [
      "id", "userId", "modelId", "title", "status", "summary", "contextJson", "metadata",
      "promptTokens", "completionTokens", "totalTokens", "lastMessageAt", "schemaVersion",
      "createdAt", "updatedAt",
    ],
    properties: {
      id: uuid,
      userId: uuid,
      modelId: uuid,
      title: { type: "string", example: "Trip Padang" },
      status: { type: "string", example: "active", description: "Free-form lifecycle string; new sessions start as `active`." },
      summary: nullableString,
      contextJson: jsonObject,
      metadata: jsonObject,
      promptTokens: integer,
      completionTokens: integer,
      totalTokens: integer,
      lastMessageAt: nullableTimestamp,
      schemaVersion: { type: "integer", minimum: 1, example: 1 },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },

  CreateChatSessionRequest: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: uuid,
      title: { type: "string", minLength: 1, maxLength: 255 },
    },
  },

  UpdateChatSessionRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      userId: uuid,
      title: { type: "string", minLength: 1, maxLength: 255 },
      summary: { type: ["string", "null"], maxLength: 4000 },
      status: { type: "string", minLength: 1, maxLength: 64 },
    },
  },

  ChatSessionDeleted: {
    type: "object",
    required: ["deleted"],
    properties: { deleted: { type: "boolean", example: true } },
  },

  ChatMessage: {
    type: "object",
    description: "Chat message row (page mode). `userId` is not echoed: it belongs to the session.",
    required: ["id", "sessionId", "modelId", "role", "content", "position", "inputTokens", "outputTokens", "metadata", "createdAt"],
    properties: {
      id: uuid,
      sessionId: uuid,
      modelId: nullableUuid,
      role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
      content: { type: "string" },
      position: { type: "integer", minimum: 1, description: "Monotonic order inside the session." },
      inputTokens: integer,
      outputTokens: integer,
      metadata: jsonObject,
      createdAt: timestamp,
    },
  },

  MessageVersion: {
    type: "object",
    description: "One stored version of an assistant message.",
    required: ["version", "content", "status", "createdAt"],
    properties: {
      version: { type: "integer", minimum: 1 },
      content: { type: "string" },
      status: { type: "string", enum: ["pending", "completed", "failed"] },
      createdAt: timestamp,
      model: { type: "string" },
      latencyMs: { type: "integer", minimum: 0 },
      toolCalls: { type: "array", items: jsonObject },
      usage: {
        type: "object",
        required: ["promptTokens", "completionTokens", "totalTokens"],
        properties: { promptTokens: integer, completionTokens: integer, totalTokens: integer },
      },
      editInstruction: { type: "string" },
      errorJson: nullableJson,
      inputTokens: integer,
      outputTokens: integer,
      metadata: jsonObject,
    },
  },

  ChatMessageDetailed: {
    type: "object",
    description: "Chat message with tool calls, versions, and run state (keyset mode).",
    required: [
      "id", "sessionId", "modelId", "role", "content", "position", "inputTokens", "outputTokens",
      "metadata", "toolCallsJson", "toolCallId", "mode", "model", "latencyMs", "status", "errorJson",
      "versionsJson", "activeVersion", "schemaVersion", "createdAt",
    ],
    properties: {
      id: uuid,
      sessionId: uuid,
      modelId: nullableUuid,
      role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
      content: { type: "string" },
      position: { type: "integer", minimum: 1 },
      inputTokens: integer,
      outputTokens: integer,
      metadata: jsonObject,
      toolCallsJson: nullableJson,
      toolCallId: nullableString,
      mode: nullableString,
      model: nullableString,
      latencyMs: nullableInteger,
      status: { type: "string", example: "completed" },
      errorJson: nullableJson,
      versionsJson: { type: "array", items: { $ref: "#/components/schemas/MessageVersion" } },
      activeVersion: { type: "integer", minimum: 1 },
      schemaVersion: { type: "integer", minimum: 1 },
      createdAt: timestamp,
    },
  },

  ChatMessagePage: {
    type: "object",
    description: "Page-mode messages (`page`/`limit`, no `after_position`).",
    required: ["data", "meta"],
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/ChatMessage" } },
      meta: { $ref: "#/components/schemas/PaginationMeta" },
    },
  },

  ChatMessageKeyset: {
    type: "object",
    description: "Keyset-mode messages (`after_position` given). Pass `meta.nextAfterPosition` back as `after_position`; `null` means the end.",
    required: ["data", "meta"],
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/ChatMessageDetailed" } },
      meta: {
        type: "object",
        required: ["limit", "nextAfterPosition"],
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          nextAfterPosition: nullableInteger,
        },
      },
    },
  },

  SendChatMessageRequest: {
    type: "object",
    required: ["userId", "content"],
    properties: {
      userId: uuid,
      content: { type: "string", minLength: 1, maxLength: 4000 },
    },
  },

  RegenerateChatMessageRequest: {
    type: "object",
    required: ["userId"],
    properties: { userId: uuid },
  },

  ActivateChatMessageVersionRequest: {
    type: "object",
    required: ["userId"],
    properties: { userId: uuid },
  },

  ChatReply: {
    type: "object",
    description:
      "Assistant reply with the detected intent, the rendered text, and the itinerary version it produced. " +
      "`intent` is the classifier label; `version` is `null` for plain chat.",
    required: ["message", "intent", "version", "map", "assistantMessageId", "sessionId"],
    properties: {
      message: { type: "string", description: "Assistant text, already stripped of tool-call markup." },
      intent: { type: "string", enum: [...intentLabels] },
      version: {
        oneOf: [{ $ref: "#/components/schemas/ItineraryVersionView" }, { type: "null" }],
      },
      map: {
        oneOf: [
          {
            type: "object",
            required: ["versionId", "points"],
            properties: {
              versionId: { type: "string" },
              points: {
                type: "array",
                items: {
                  type: "object",
                  required: ["position", "destinationId", "name", "latitude", "longitude"],
                  properties: {
                    position: { type: "integer", minimum: 1 },
                    destinationId: uuid,
                    name: { type: "string" },
                    latitude: { type: "number" },
                    longitude: { type: "number" },
                  },
                },
              },
            },
          },
          { type: "null" },
        ],
      },
      assistantMessageId: uuid,
      sessionId: uuid,
      usage: {
        type: "object",
        required: ["inputTokens", "outputTokens"],
        properties: { inputTokens: integer, outputTokens: integer },
      },
    },
  },

  ChatRegenerateResult: {
    type: "object",
    description: "New assistant message version with its text, intent, version snapshot, and usage counters.",
    required: ["assistantMessageId", "sessionId", "message", "intent", "version", "activeVersion", "usage"],
    properties: {
      assistantMessageId: uuid,
      sessionId: uuid,
      message: { type: "string" },
      intent: { type: "string", enum: [...intentLabels] },
      version: {
        oneOf: [{ $ref: "#/components/schemas/ItineraryVersionView" }, { type: "null" }],
      },
      activeVersion: { type: "integer", minimum: 1 },
      usage: {
        type: "object",
        required: ["inputTokens", "outputTokens"],
        properties: { inputTokens: integer, outputTokens: integer },
      },
    },
  },

  ChatMessageVersions: {
    type: "object",
    description: "Every stored version of one assistant message plus the active version number.",
    required: ["messageId", "sessionId", "activeVersion", "versions"],
    properties: {
      messageId: uuid,
      sessionId: uuid,
      activeVersion: { type: "integer", minimum: 1 },
      versions: { type: "array", items: { $ref: "#/components/schemas/MessageVersion" } },
      versionsJson: {
        type: "array",
        items: { $ref: "#/components/schemas/MessageVersion" },
        description: "Deprecated alias of `versions`, kept for older clients.",
      },
    },
  },

  ChatVersionActivation: {
    type: "object",
    description: "Result of activating one message version.",
    required: ["messageId", "sessionId", "activeVersion", "content", "status"],
    properties: {
      messageId: uuid,
      sessionId: uuid,
      activeVersion: { type: "integer", minimum: 1 },
      content: { type: "string" },
      status: { type: "string" },
    },
  },

  ItineraryDestination: {
    type: "object",
    description:
      "One `trip_destinations` row: a stop of the trip. Rows sharing one `createdAt` form one version batch; " +
      "`distance` and the batch total (`ItineraryVersion.totalDistanceM`) come from road routing, never from a straight line.",
    required: ["id", "itineraryId", "destinationId", "visitAt", "estimatedCost", "distance", "distanceKm", "notes", "createdAt"],
    properties: {
      id: uuid,
      itineraryId: uuid,
      destinationId: uuid,
      visitAt: nullableTimestamp,
      estimatedCost: { type: ["number", "null"] },
      distance: legDistanceM,
      distanceKm: legDistanceKm,
      notes: nullableString,
      createdAt: timestamp,
    },
  },

  Itinerary: {
    type: "object",
    description:
      "Trip with the active version snapshot. `currentVersion` equals the number of `trip_destinations` batches, " +
      "so the newest version is always `currentVersion`.",
    required: [
      "id", "userId", "sessionId", "currentVersion", "tripDate", "durationDays", "city",
      "transportMode", "title", "content", "status", "isPublic", "shareSlug", "metadata",
      "createdAt", "updatedAt", "destinations", "version",
    ],
    properties: {
      id: uuid,
      userId: uuid,
      sessionId: nullableUuid,
      currentVersion: { type: "integer", minimum: 0 },
      tripDate: nullableTimestamp,
      durationDays: { type: "integer", minimum: 1 },
      city: { type: "string", example: "Padang" },
      transportMode: nullableString,
      title: { type: "string" },
      content: { type: "string" },
      status: { type: "string", enum: ["draft", "final"] },
      isPublic: { type: "boolean" },
      shareSlug: nullableString,
      metadata: jsonObject,
      createdAt: timestamp,
      updatedAt: timestamp,
      destinations: { type: "array", items: { $ref: "#/components/schemas/ItineraryDestination" } },
      version: {
        oneOf: [{ $ref: "#/components/schemas/ItineraryVersion" }, { type: "null" }],
        description: "Active version snapshot, or `null` when the trip has no batch yet.",
      },
    },
  },

  ItineraryStop: {
    type: "object",
    description:
      "One stop inside a version snapshot. `arrivalTime` is local Padang time (`HH:mm`). `distance` is the road " +
      "distance travelled to reach this stop from the previous one.",
    required: [
      "id", "itineraryVersionId", "destinationId", "position", "name", "latitude", "longitude",
      "arrivalTime", "departureTime", "visitDurationMin", "travelDurationMin", "notes", "category", "snapshotJson",
      "distance", "distanceKm",
    ],
    properties: {
      id: uuid,
      itineraryVersionId: uuid,
      destinationId: nullableUuid,
      position: { type: "integer", minimum: 1 },
      name: { type: "string" },
      latitude: { type: "number" },
      longitude: { type: "number" },
      arrivalTime: nullableString,
      departureTime: nullableString,
      visitDurationMin: nullableInteger,
      travelDurationMin: nullableInteger,
      notes: nullableString,
      category: nullableString,
      snapshotJson: nullableJson,
      distance: legDistanceM,
      distanceKm: legDistanceKm,
    },
  },

  ItineraryRouteLeg: {
    type: "object",
    description: "Leg between two consecutive stops. `fallback` means straight-line geometry.",
    required: ["fromPosition", "toPosition", "transportMode", "distanceM", "durationSec", "geometry", "provider", "profile", "fallback"],
    properties: {
      fromPosition: { type: "integer", minimum: 1 },
      toPosition: { type: "integer", minimum: 1 },
      transportMode: { type: "string", example: "walk" },
      distanceM: nullableInteger,
      durationSec: nullableInteger,
      geometry: { oneOf: [{ $ref: "#/components/schemas/GeoLineString" }, { type: "null" }] },
      provider: nullableString,
      profile: nullableString,
      fallback: { type: "boolean" },
    },
  },

  ItineraryRouteJson: {
    type: "object",
    description: "Display-ready route: one GeoJSON LineString plus per-leg metadata.",
    required: ["type", "coordinates", "legs"],
    properties: {
      type: { const: "LineString" },
      coordinates: { type: "array", items: coordinatePair },
      legs: { type: "array", items: { $ref: "#/components/schemas/ItineraryRouteLeg" } },
    },
  },

  ItineraryVersion: {
    type: "object",
    description: "Immutable version snapshot stored as one `trip_destinations` batch.",
    required: [
      "id", "itineraryId", "version", "basedOnVersion", "changeInstruction", "changeType",
      "totalDistanceM", "totalDistanceKm", "totalDurationMin", "totalEstimatedMin", "status", "sourceMessageId",
      "routeJson", "expiresAt", "createdAt", "stops", "travelDate", "startTime", "endTime",
    ],
    properties: {
      id: uuid,
      itineraryId: uuid,
      version: { type: "integer", minimum: 1 },
      basedOnVersion: nullableInteger,
      changeInstruction: nullableString,
      changeType: { type: "string", example: "snapshot" },
      totalDistanceM,
      totalDistanceKm,
      totalDurationMin: nullableInteger,
      totalEstimatedMin: nullableInteger,
      status: { type: "string", example: "confirmed" },
      sourceMessageId: nullableUuid,
      routeJson: { oneOf: [{ $ref: "#/components/schemas/ItineraryRouteJson" }, { type: "null" }] },
      expiresAt: nullableTimestamp,
      createdAt: timestamp,
      stops: { type: "array", items: { $ref: "#/components/schemas/ItineraryStop" } },
      travelDate: ymd,
      startTime: hhmm,
      endTime: hhmm,
    },
  },

  ItineraryVersionSummary: {
    type: "object",
    description: "One row of the version history. The active version is the one with `isSelected: true`.",
    required: [
      "version", "basedOnVersion", "changeType", "changeInstruction", "status", "totalDistanceM", "totalDistanceKm",
      "totalDurationMin", "totalEstimatedMin", "createdAt", "stopCount", "routeCount", "isSaved", "isSelected",
    ],
    properties: {
      version: { type: "integer", minimum: 1 },
      basedOnVersion: nullableInteger,
      changeType: { type: "string" },
      changeInstruction: nullableString,
      status: { type: "string" },
      totalDistanceM,
      totalDistanceKm,
      totalDurationMin: nullableInteger,
      totalEstimatedMin: nullableInteger,
      createdAt: timestamp,
      stopCount: integer,
      routeCount: integer,
      isSaved: { type: "boolean" },
      isSelected: { type: "boolean" },
    },
  },

  ItineraryVersionView: {
    type: "object",
    description:
      "Version payload returned by the chat reply. Rendered on the map as `stops`; `totalDistanceM`/`totalDistanceKm` " +
      "is the road distance of the whole batch, and each stop carries the leg distance from the previous one.",
    required: [
      "versionId", "versionNumber", "itineraryId", "travelDate", "startTime", "endTime", "stops", "routeJson",
      "totalDistanceM", "totalDistanceKm",
    ],
    properties: {
      versionId: { type: "string", description: "First stop id, or an ISO timestamp for an empty batch." },
      versionNumber: { type: "integer", minimum: 1 },
      itineraryId: { type: "string" },
      travelDate: ymd,
      startTime: hhmm,
      endTime: hhmm,
      stops: {
        type: "array",
        items: {
          type: "object",
          required: ["position", "destinationId", "name", "latitude", "longitude", "arrivalTime", "visitDurationMin", "category"],
          properties: {
            id: uuid,
            position: { type: "integer", minimum: 1 },
            destinationId: nullableUuid,
            name: { type: "string" },
            latitude: { type: "number" },
            longitude: { type: "number" },
            arrivalTime: nullableString,
            departureTime: nullableString,
            visitDurationMin: nullableInteger,
            category: nullableString,
            distance: legDistanceM,
            distanceKm: legDistanceKm,
          },
        },
      },
      routes: { type: "array", items: jsonObject, description: "Optional per-leg geometry; currently empty." },
      routeJson: { oneOf: [{ $ref: "#/components/schemas/ItineraryRouteJson" }, { type: "null" }] },
      totalDistanceM,
      totalDistanceKm,
    },
  },

  ItineraryOwnerRequest: {
    type: "object",
    required: ["userId"],
    properties: { userId: uuid },
  },

  RestoreItineraryVersionRequest: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: uuid,
      expectedVersion: { type: "integer", minimum: 1 },
    },
  },

  GeoLineString: geoLineString,

  RouteResult: {
    type: "object",
    description:
      "Route between waypoints. `source: \"cache\"` is a cached OSRM hit, `\"fallback\"` is a straight line " +
      "(`durationMin: null`, render dashed).",
    required: ["source", "distanceKm", "durationMin", "estimated", "legsDistanceKm", "geometry"],
    properties: {
      source: { type: "string", enum: ["osrm", "cache", "fallback"] },
      distanceKm: { type: ["number", "null"], minimum: 0, example: 12.4 },
      durationMin: nullableInteger,
      estimated: { type: "boolean", description: "True when `motorcycle` duration was derived from driving." },
      error: { type: "string", description: "Only present on fallback." },
      legsDistanceKm: {
        type: "array",
        items: { type: "number", minimum: 0 },
        description:
          "Road distance per consecutive point pair, in km, in request order (`length === points.length - 1`). " +
          "This is what per-stop itinerary distance is built from. On `source: \"fallback\"` these are straight-line " +
          "distances, so clients must check `source` before treating them as road distance.",
        example: [1.2, 1.8],
      },
      geometry: { $ref: "#/components/schemas/GeoLineString" },
    },
  },

  CalculateRouteRequest: {
    type: "object",
    required: ["points"],
    properties: {
      points: {
        type: "array",
        minItems: 2,
        maxItems: 50,
        items: {
          type: "object",
          required: ["latitude", "longitude"],
          properties: {
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
          },
        },
      },
      profile: { type: "string", enum: ["car", "motorcycle", "foot"], default: "car" },
    },
  },
};
