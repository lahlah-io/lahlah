import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = path.join(repoRoot, "apps/app");
const eslint = new ESLint({
  cwd: appRoot,
  overrideConfigFile: path.join(appRoot, "eslint.config.js"),
});

const cases = [
  ["shared/utils/a.ts", 'import "@/shared/utils/cn";', true],
  ["feat/home/components/a.ts", 'import "@/shared/utils/cn";', true],
  ["feat/home/components/a.ts", 'import "../hooks/use-home";', true],
  ["pages/route.tsx", 'import "./home";', true],
  ["pages/route.tsx", 'import "./settings/route";', true],
  ["shared/utils/a.ts", 'import "@/feat/home/components/home-intro";', false],
  ["shared/utils/a.ts", 'import "../../pages/home";', false],
  ["feat/home/components/a.ts", 'import "@/pages/home";', false],
  [
    "feat/home/components/a.ts",
    'import "@/feat/dashboard/components/b";',
    false,
  ],
  [
    "feat/home/components/a.ts",
    'import "../../../feat/dashboard/components/b";',
    false,
  ],
  ["pages/home.tsx", 'import "./route";', false],
  ["pages/route.tsx", 'import "./settings/index";', false],
  [
    "feat/home/components/a.ts",
    'export * from "@/feat/dashboard/utils/b";',
    false,
  ],
  ["feat/home/components/a.ts", 'void import("@/pages/home");', false],
  ["feat/home/components/a.ts", 'require("@/pages/home");', false],
  [
    "shared/utils/a.ts",
    'import "../../../../admin/src/feat/dashboard/components/dashboard-intro";',
    false,
  ],
];

for (const [file, code, allowed] of cases) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(appRoot, "src", file),
  });
  const violations = result.messages.filter(
    (message) => message.ruleId === "lahlah-architecture/boundaries",
  );
  assert.equal(
    violations.length === 0,
    allowed,
    `${file}: ${code}\n${JSON.stringify(result.messages)}`,
  );
}

console.log(`Frontend boundary rules passed ${cases.length} cases.`);
