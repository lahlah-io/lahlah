import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const srcRoot = path.join(appRoot, "src");
const errors = [];

function entries(directory) {
  return readdirSync(directory, { withFileTypes: true });
}

for (const name of ["pages", "feat", "shared"]) {
  const location = path.join(srcRoot, name);
  try {
    if (!statSync(location).isDirectory())
      errors.push(`src/${name}/ must be a directory`);
  } catch {
    errors.push(`src/${name}/ is required`);
  }
}

if (errors.length === 0) {
  for (const entry of entries(srcRoot)) {
    if (entry.isDirectory() && ["pages", "feat", "shared"].includes(entry.name))
      continue;
    if (entry.isFile() && entry.name === "main.tsx") continue;
    errors.push(
      `src/${entry.name} is outside pages/, feat/, shared/ (only main.tsx is exempt)`,
    );
  }

  function inspectPages(directory) {
    const files = entries(directory);
    if (!files.some((entry) => entry.isFile() && entry.name === "route.tsx")) {
      errors.push(`${path.relative(appRoot, directory)}/ needs route.tsx`);
    }
    for (const entry of files) {
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) inspectPages(location);
      else if (!entry.isFile() || !entry.name.endsWith(".tsx")) {
        errors.push(
          `${path.relative(appRoot, location)}: pages/ only contains .tsx page and route files`,
        );
      }
    }
  }
  inspectPages(path.join(srcRoot, "pages"));

  for (const entry of entries(path.join(srcRoot, "feat"))) {
    if (!entry.isDirectory())
      errors.push(
        `src/feat/${entry.name}: feat/ only contains feature folders`,
      );
    else
      for (const child of entries(path.join(srcRoot, "feat", entry.name))) {
        if (!child.isDirectory())
          errors.push(
            `src/feat/${entry.name}/${child.name}: place feature files in a purpose folder`,
          );
      }
  }

  for (const entry of entries(path.join(srcRoot, "shared"))) {
    if (!entry.isDirectory())
      errors.push(
        `src/shared/${entry.name}: shared/ only contains purpose folders`,
      );
  }
}

if (errors.length > 0) {
  console.error(
    `Frontend structure errors in ${path.relative(path.dirname(appRoot), appRoot)}:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  );
  process.exitCode = 1;
}
