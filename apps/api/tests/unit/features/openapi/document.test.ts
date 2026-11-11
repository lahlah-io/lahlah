import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../../../../src/app.js";
import { openApiDocument } from "../../../../src/openapi/document.js";

type Json = unknown;

function collectRefs(value: Json, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
    return refs;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") refs.push(child);
      else collectRefs(child, refs);
    }
  }
  return refs;
}

/** Hono exposes `:id`; OpenAPI uses `{id}`. Normalise so both can be compared. */
function normalisePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

test("semua $ref menunjuk komponen yang ada", () => {
  const refs = collectRefs(openApiDocument);
  assert.ok(refs.length > 0, "dokumen harus memakai komponen");

  const components = openApiDocument.components.schemas;
  for (const reference of refs) {
    const prefix = "#/components/schemas/";
    assert.ok(reference.startsWith(prefix), `$ref tidak dikenal: ${reference}`);
    const name = reference.slice(prefix.length);
    assert.ok(components[name], `komponen tidak ditemukan: ${name}`);
  }
});

test("setiap operationId unik dan setiap operasi punya respons sukses", () => {
  const operationIds = new Set<string>();

  for (const [path, methods] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation) continue;
      assert.ok(!operationIds.has(operation.operationId), `operationId duplikat: ${operation.operationId}`);
      operationIds.add(operation.operationId);

      const statuses = Object.keys(operation.responses);
      assert.ok(
        statuses.some((status) => status.startsWith("2")),
        `${method.toUpperCase()} ${path} tidak punya respons 2xx`,
      );
      assert.ok(operation.tags.length > 0, `${method.toUpperCase()} ${path} tidak punya tag`);
    }
  }
});

test("setiap route yang terdaftar didokumentasikan", () => {
  const documented = new Set<string>();
  for (const [path, methods] of Object.entries(openApiDocument.paths)) {
    for (const method of Object.keys(methods)) {
      documented.add(`${method.toUpperCase()} ${normalisePath(path)}`);
    }
  }

  const infrastructure = new Set(["/docs", "/openapi.json"]);
  const actual = app.routes
    .filter((route) => ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(route.method))
    .filter((route) => !infrastructure.has(route.path))
    .map((route) => `${route.method} ${normalisePath(route.path)}`);

  assert.ok(actual.length > 0, "app harus mendaftarkan route");

  const missing = actual.filter((route) => !documented.has(route));
  assert.deepEqual(missing, [], `route belum didokumentasikan: ${missing.join(", ")}`);
});

test("GET /openapi.json menyajikan dokumen dan /docs menyajikan Swagger UI", async () => {
  const specResponse = await app.request("/openapi.json");
  assert.equal(specResponse.status, 200);
  assert.match(specResponse.headers.get("content-type") ?? "", /application\/json/);
  const spec = await specResponse.json();
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.title, "Lahlah API");
  assert.ok(spec.components.securitySchemes.bearerAuth);
  assert.ok(spec.components.securitySchemes.sessionCookie);

  const docsResponse = await app.request("/docs");
  assert.equal(docsResponse.status, 200);
  assert.match(docsResponse.headers.get("content-type") ?? "", /text\/html/);
  const html = await docsResponse.text();
  assert.match(html, /SwaggerUIBundle/);
  assert.match(html, /\/openapi\.json/);
});

test("endpoint admin mendokumentasikan guard dan error utamanya", () => {
  const listUsers = openApiDocument.paths["/api/v1/users"]?.get;
  assert.ok(listUsers);
  assert.deepEqual(listUsers.security, [{ bearerAuth: [] }, { sessionCookie: [] }]);
  assert.ok(listUsers.responses["401"]);
  assert.ok(listUsers.responses["403"]);

  const exchange = openApiDocument.paths["/api/v1/auth/peridot/exchange"]?.post;
  assert.ok(exchange);
  assert.equal(exchange.security, undefined, "exchange harus dapat diakses tanpa sesi");
  assert.ok(exchange.responses["429"]);
});
