// Runs each suite with the test doubles it needs (no network, no real credentials).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const suites = [
  ["phase89.test.mjs", ""],
  ["claude-json.test.mjs", "claude,store"],
  ["fal.test.mjs", "store"],
  ["meta-ads.test.mjs", "meta"],
  ["phase10_15.test.mjs", ""],
  ["providers.test.mjs", "store"],
  ["meta-assets.test.mjs", ""],
  ["ai-brain.test.mjs", "claude,store,admin,server,session,nextcache"],
];
let failed = 0;
for (const [file, fakes] of suites) {
  const res = spawnSync(
    process.execPath,
    ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", "./support/register.mjs", "--test", file],
    { cwd: dir, env: { ...process.env, USE_FAKES: fakes }, stdio: "inherit" }
  );
  if (res.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
