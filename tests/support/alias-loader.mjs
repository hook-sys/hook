// Resolves the project's "@/..." alias to src/*.ts for Node's native TypeScript support.
// USE_FAKES=claude,store,meta replaces those integration modules with test doubles.
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = fileURLToPath(new URL("../../src", import.meta.url));

const FAKES = {
  claude: ["@/lib/integrations/claude", new URL("./fake-claude.mjs", import.meta.url).href],
  store: ["@/lib/integrations/store", new URL("./fake-store.mjs", import.meta.url).href],
  meta: ["@/lib/integrations/meta", new URL("./fake-meta.mjs", import.meta.url).href],
};
const enabled = new Map(
  (process.env.USE_FAKES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((k) => FAKES[k])
    .map((k) => FAKES[k])
);

export async function resolve(specifier, context, next) {
  if (enabled.has(specifier)) return { url: enabled.get(specifier), shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
