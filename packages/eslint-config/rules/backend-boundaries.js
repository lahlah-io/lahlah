import path from "node:path";

function resolveLocal(importer, specifier, srcRoot) {
  if (specifier.startsWith("@/")) return path.resolve(srcRoot, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(importer), specifier);
  return null;
}

function sourceParts(file, srcRoot) {
  const relative = path.relative(srcRoot, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep);
}

export const backendBoundaries = {
  meta: {
    type: "problem",
    docs: { description: "Enforce API shared, feature and layer import boundaries" },
    messages: {
      shared: "shared/ may not import from modules/. Move shared code into shared/.",
      crossModule: "A module may only import itself and shared/. Move shared code into shared/.",
      layer: "Keep backend direction API -> service -> repository; lower layers must not depend on API or service layers.",
    },
    schema: [],
  },
  create(context) {
    const srcRoot = path.resolve(context.cwd, "src");
    const importer = context.filename;
    const from = sourceParts(importer, srcRoot);
    if (!from) return {};

    function check(node, specifier) {
      if (typeof specifier !== "string") return;
      const resolved = resolveLocal(importer, specifier, srcRoot);
      if (!resolved) return;
      const to = sourceParts(resolved, srcRoot);
      if (!to) return;

      if (from[0] === "shared" && to[0] === "modules") {
        context.report({ node, messageId: "shared" });
      } else if (from[0] === "modules" && to[0] === "modules" && from[1] !== to[1]) {
        context.report({ node, messageId: "crossModule" });
      } else if (from[0] === "modules" && to[0] === "modules" && from[1] === to[1]) {
        const sourceLayer = from[2];
        const targetLayer = to[2];
        if (
          (sourceLayer === "api" && targetLayer === "repositories") ||
          (sourceLayer === "services" && targetLayer === "api") ||
          (sourceLayer === "repositories" && ["api", "services"].includes(targetLayer))
        ) {
          context.report({ node, messageId: "layer" });
        }
      } else if (
        from[0] === "modules" &&
        to[0] === "db" &&
        ["api", "services"].includes(from[2])
      ) {
        context.report({ node, messageId: "layer" });
      }
    }

    return {
      ImportDeclaration(node) { check(node, node.source.value); },
      ExportNamedDeclaration(node) { check(node, node.source?.value); },
      ExportAllDeclaration(node) { check(node, node.source.value); },
      ImportExpression(node) { check(node, node.source.value); },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node, node.arguments[0]?.value);
        }
      },
    };
  },
};
