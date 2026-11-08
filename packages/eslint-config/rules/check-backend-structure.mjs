import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { backendBoundaries } from "./backend-boundaries.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const apiRoot = path.join(repoRoot, "apps/api");
const modulesRoot = path.join(apiRoot, "src/modules");
const modules = fs.readdirSync(modulesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
assert.ok(modules.length > 0, "src/modules must contain at least one feature");

for (const { name } of modules) {
  const moduleRoot = path.join(modulesRoot, name);
  for (const folder of ["api", "schemas", "services", "repositories"]) {
    assert.ok(fs.existsSync(path.join(moduleRoot, folder)), `${name} feature is missing ${folder}/`);
  }
}

for (const file of [
  "api/users.ts",
  "schemas/user.schema.ts",
  "services/users.service.ts",
  "repositories/users.repository.ts",
]) {
  assert.ok(fs.existsSync(path.join(modulesRoot, "users", file)), `users feature is missing ${file}`);
}

for (const file of ["users.routes.ts", "users.schema.ts", "users.service.ts", "dependencies.ts", "app.test.ts"]) {
  assert.ok(!fs.existsSync(path.join(modulesRoot, "users", file)), `Remove duplicate or empty root file users/${file}`);
}
assert.ok(!fs.existsSync(path.join(modulesRoot, "users", "dependencies")), "Remove empty users/dependencies folder");
for (const directory of ["tests/unit/features", "tests/unit/shared", "tests/integration"]) {
  assert.ok(fs.existsSync(path.join(apiRoot, directory)), `apps/api/${directory} must exist`);
}
assert.ok(fs.existsSync(path.join(apiRoot, "tests/integration/users.crud.test.ts")), "Users PostgreSQL CRUD integration test is required");
assert.ok(fs.existsSync(path.join(apiRoot, "tests/unit/shared/pagination.schema.test.ts")), "Pagination unit test is required");


const cases = [
  ["src/shared/http/a.ts", 'import "./errors.js";', true],
  ["src/modules/users/api/users.ts", 'import "../../../shared/http/errors.js";', true],
  ["src/modules/users/api/users.ts", 'import "../services/users.service.js";', true],
  ["src/modules/users/services/users.service.ts", 'import "../repositories/users.repository.js";', true],
  ["src/modules/users/repositories/users.repository.ts", 'import "../services/users.service.js";', false],
  ["src/modules/users/services/users.service.ts", 'import "../api/users.js";', false],
  ["src/modules/users/api/users.ts", 'import "../../../db/client.js";', false],
  ["src/shared/http/a.ts", 'import "../../modules/users/services/users.service.js";', false],
  ["src/modules/users/api/users.ts", 'import "../../billing/services/billing.service.js";', false],
  ["src/modules/users/api/users.ts", 'require("../../billing/services/billing.service.js");', false],
  ["src/modules/users/api/users.ts", 'export * from "../../billing/services/billing.service.js";', false],
  ["src/modules/users/api/users.ts", 'import "hono";', true],
];

const eslint = new ESLint({
  cwd: apiRoot,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["src/**/*.{ts,tsx}"],
      plugins: { "lahlah-backend": { rules: { boundaries: backendBoundaries } } },
      rules: { "lahlah-backend/boundaries": "error" },
    },
  ],
});

for (const [file, code, allowed] of cases) {
  const [result] = await eslint.lintText(code, { filePath: path.join(apiRoot, file) });
  const violations = result.messages.filter(
    (message) => message.ruleId === "lahlah-backend/boundaries",
  );
  assert.equal(
    violations.length === 0,
    allowed,
    `${file}: ${code}\n${JSON.stringify(result.messages)}`,
  );
}

console.log(`Backend structure checks passed ${cases.length} import cases.`);
