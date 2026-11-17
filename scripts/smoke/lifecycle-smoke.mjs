import "../lib/test-artifacts.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["tests/electron/lifecycle-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/lifecycle-smoke.cjs",
  external: ["electron"],
});
const child = spawn(electron, ["dist-electron/lifecycle-smoke.cjs"], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
