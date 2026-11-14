import { readdirSync, statSync } from "node:fs";
import path from "node:path";

function entries(directory) {
  return readdirSync(directory, { withFileTypes: true });
}

const appRoot = process.cwd();
const srcRoot = path.join(appRoot, "src");
const errors = [];
const requiredFiles = ["app.ts", "env.ts", "index.ts", "openapi/index.ts", "routes.ts"];
const requiredDirs = ["db", "modules", "shared"];
const allowedDirs = new Set([...requiredDirs, "generated", "integrations", "openapi", "scripts"]);
const moduleLayers = ["api", "schemas", "services", "repositories"];

for (const name of requiredFiles) {
  try {
    if (!statSync(path.join(srcRoot, name)).isFile())
      errors.push(`src/${name} must be a file`);
  } catch {
    errors.push(`src/${name} is required`);
  }
}
for (const name of requiredDirs) {
  try {
    if (!statSync(path.join(srcRoot, name)).isDirectory())
      errors.push(`src/${name}/ must be a directory`);
  } catch {
    errors.push(`src/${name}/ is required`);
  }
}

if (errors.length === 0) {
  for (const entry of entries(srcRoot)) {
    if (entry.isDirectory()) {
      if (!allowedDirs.has(entry.name))
        errors.push(`src/${entry.name}/ is not an allowed top-level directory`);
    } else if (!entry.isFile() || !requiredFiles.includes(entry.name)) {
      errors.push(`src/${entry.name} is not allowed at src/ root`);
    }
  }

  try {
    if (!statSync(path.join(srcRoot, "db", "client.ts")).isFile())
      errors.push("src/db/client.ts must be a file");
  } catch {
    errors.push("src/db/client.ts is required");
  }

  for (const mod of entries(path.join(srcRoot, "modules"))) {
    if (!mod.isDirectory()) {
      errors.push(`src/modules/${mod.name}: modules/ only contains feature folders`);
      continue;
    }
    const modRoot = path.join(srcRoot, "modules", mod.name);
    const children = entries(modRoot);
    const names = new Set(children.map((c) => c.name));
    for (const layer of moduleLayers) {
      if (!names.has(layer))
        errors.push(`src/modules/${mod.name}/ is missing ${layer}/`);
    }
    for (const child of children) {
      if (child.isDirectory()) {
        if (!moduleLayers.includes(child.name))
          errors.push(
            `src/modules/${mod.name}/${child.name}/ is not an allowed module layer`,
          );
      } else if (!child.isFile() || child.name !== "index.ts") {
        errors.push(
          `src/modules/${mod.name}/${child.name}: only index.ts is allowed as a file in a module root`,
        );
      }
    }
  }

  for (const entry of entries(path.join(srcRoot, "shared"))) {
    if (!entry.isDirectory())
      errors.push(`src/shared/${entry.name}: shared/ only contains purpose folders`);
  }

  try {
    for (const entry of entries(path.join(srcRoot, "integrations"))) {
      if (!entry.isDirectory())
        errors.push(
          `src/integrations/${entry.name}: integrations/ only contains integration folders`,
        );
    }
  } catch {
    /* integrations/ opsional */
  }
}

if (errors.length > 0) {
  console.error(
    `Backend structure errors in ${path.relative(path.dirname(appRoot), appRoot)}:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  );
  process.exitCode = 1;
}
