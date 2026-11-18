import "../lib/test-artifacts.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["tests/electron/native-tooltip-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/native-tooltip-smoke.cjs",
  external: ["electron"],
});
const child = spawn(electron, ["dist-electron/native-tooltip-smoke.cjs"], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
