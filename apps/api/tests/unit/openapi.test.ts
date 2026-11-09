import assert from "node:assert/strict";
import { test } from "vitest";
import { app } from "../../src/app.js";

type Document = {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
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
