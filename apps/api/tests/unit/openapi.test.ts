import assert from "node:assert/strict";
import { test } from "vitest";
import { app } from "../../src/app.js";

type Document = {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
};

type Operation = {
  operationId?: string;
  summary?: string;
  responses?: Record<string, unknown>;
};

async function readDocument(): Promise<Document> {
  const response = await app.request("/openapi.json");
  assert.equal(response.status, 200);
  return (await response.json()) as Document;
}

test("openapi document is served", async () => {
  const document = await readDocument();
  assert.equal(document.openapi, "3.1.0");
  assert.ok(document.paths["/api/v1/users"]);
  assert.ok(document.paths["/api/v1/routes/driving"]);
});

test("swagger ui is served", async () => {
  const response = await app.request("/docs");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("swagger ui page explains trip distance in meters before the spec loads", async () => {
  const html = await (await app.request("/docs")).text();
  // The banner must state the unit and the null rule so a reader never guesses.
  assert.match(html, /totalDistanceM/);
  assert.match(html, /meters/i);
  assert.match(html, /legsDistanceKm/);
  assert.match(html, /null/);
  // It is a note above the spec, not a replacement for it.
  assert.match(html, /id="swagger-ui"/);
  assert.match(html, /url: "\/openapi\.json"/);
});

test("every API route is documented", async () => {
  const document = await readDocument();
  const documented = new Set(Object.keys(document.paths));
  const registered = new Set(
    app.routes
      .filter((route) => route.method !== "ALL")
      .filter((route) => route.path.startsWith("/api/v1/"))
      .filter((route) => !route.path.includes("*"))
      .map((route) => route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")),
  );

  const missing = [...registered].filter((path) => !documented.has(path));
  assert.deepEqual(missing, []);
});

test("every operation is readable by a client generator and no schema is a placeholder", async () => {
  const document = (await readDocument()) as Document & {
    components: { schemas: Record<string, Record<string, unknown>> };
  };

  for (const [path, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations as Record<string, Operation>)) {
      const label = `${method.toUpperCase()} ${path}`;
      assert.ok(operation.operationId, `${label} has no operationId`);
      assert.ok(operation.summary, `${label} has no summary`);
      assert.ok(
        Object.keys(operation.responses ?? {}).some((status) => status.startsWith("2")),
        `${label} has no 2xx response`,
      );
    }
  }

  for (const [name, schema] of Object.entries(document.components.schemas)) {
    const freeform =
      schema.type === "object" && !schema.properties && !schema.oneOf && !schema.allOf && !schema.$ref;
    assert.ok(!freeform, `schema ${name} is a free-form placeholder`);
  }
});
