import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["tests/electron/live-status-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/live-status-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/live-status-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (c) => process.exit(c ?? 1));
