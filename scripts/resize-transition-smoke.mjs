import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/resize-transition-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/resize-transition-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/resize-transition-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (code) => process.exit(code ?? 1));
