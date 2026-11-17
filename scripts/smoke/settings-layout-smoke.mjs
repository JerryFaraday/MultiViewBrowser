import "../lib/test-artifacts.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["tests/electron/settings-layout-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/settings-layout-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/settings-layout-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (code) => process.exit(code ?? 1));
