/**
 * Minimal structural types for the OpenAPI document. They keep the spec
 * type-checked without pulling in an OpenAPI dependency.
 */

export type SchemaObject = Record<string, unknown>;

export type OpenApiParameter = {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema: SchemaObject;
  example?: unknown;
};

export type OpenApiMediaType = {
  schema?: SchemaObject;
  example?: unknown;
};

export type OpenApiResponse = {
  description: string;
  content?: Record<string, OpenApiMediaType>;
};

export type OpenApiRequestBody = {
  required?: boolean;
  description?: string;
  content: Record<string, OpenApiMediaType>;
};

export type OpenApiOperation = {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  security?: Record<string, string[]>[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
};

export type OpenApiHttpMethod = "get" | "post" | "patch" | "put" | "delete";

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  components: {
    securitySchemes: Record<string, SchemaObject>;
    schemas: Record<string, SchemaObject>;
  };
  paths: Record<string, Partial<Record<OpenApiHttpMethod, OpenApiOperation>>>;
};
