import "../lib/test-artifacts.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["tests/electron/resource-compat-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/resource-compat-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/resource-compat-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (c) => process.exit(c ?? 1));
