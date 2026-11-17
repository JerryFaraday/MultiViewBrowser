import "../lib/test-artifacts.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["tests/electron/first-layout-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/first-layout-smoke.cjs",
  external: ["electron"],
});
const child = spawn(electron, ["dist-electron/first-layout-smoke.cjs"], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
