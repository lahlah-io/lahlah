import path from "node:path";

function sourcePath(importer, specifier, srcRoot) {
  if (specifier.startsWith("@/")) {
    return path.resolve(srcRoot, specifier.slice(2));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(importer), specifier);
  }
  return null;
}

function locationInSrc(file, srcRoot) {
  const relative = path.relative(srcRoot, file);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(path.sep);
}

function moduleName(file) {
  return path.basename(file).replace(/\.[^.]+$/, "");
}

export const frontendBoundaries = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce the pages, feat, and shared import boundaries",
    },
    messages: {
      shared:
        "shared/ may only import shared/ or external packages, never feat/ or pages/.",
      featPages: "feat/ may not import pages/.",
      crossFeature:
        "A feature may not import another feature. Move shared logic to shared/.",
      crossApp:
        "Do not import source files from another frontend app. Move cross-app code to a workspace package.",
      pagePage:
        "Pages may not import other pages. Only route.tsx may register local pages or direct child route.tsx files.",
    },
    schema: [],
  },
  create(context) {
    const srcRoot = path.resolve(context.cwd, "src");
    const importer = context.filename;
    const from = locationInSrc(importer, srcRoot);
    if (!from) return {};

    function check(node, specifier) {
      if (typeof specifier !== "string") return;
      const resolved = sourcePath(importer, specifier, srcRoot);
      if (!resolved) return;
      const to = locationInSrc(resolved, srcRoot);
      if (!to) {
        const acrossApps = path
          .relative(path.resolve(srcRoot, "../.."), resolved)
          .split(path.sep);
        if (
          ["app", "admin"].includes(acrossApps[0]) &&
          acrossApps[0] !== path.basename(path.dirname(srcRoot)) &&
          acrossApps[1] === "src"
        ) {
          context.report({ node, messageId: "crossApp" });
        }
        return;
      }

      if (from[0] === "shared" && (to[0] === "feat" || to[0] === "pages")) {
        context.report({ node, messageId: "shared" });
      } else if (from[0] === "feat" && to[0] === "pages") {
        context.report({ node, messageId: "featPages" });
      } else if (from[0] === "feat" && to[0] === "feat" && from[1] !== to[1]) {
        context.report({ node, messageId: "crossFeature" });
      } else if (from[0] === "pages" && to[0] === "pages") {
        const isRoute = moduleName(importer) === "route";
        const sameFolderPage =
          path.dirname(importer) === path.dirname(resolved) &&
          moduleName(resolved) !== "route";
        const directChildRoute =
          moduleName(resolved) === "route" &&
          path.dirname(path.dirname(resolved)) === path.dirname(importer);
        if (!isRoute || (!sameFolderPage && !directChildRoute)) {
          context.report({ node, messageId: "pagePage" });
        }
      }
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        check(node, node.source?.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        check(node, node.source.value);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require"
        ) {
          check(node, node.arguments[0]?.value);
        }
      },
    };
  },
};
