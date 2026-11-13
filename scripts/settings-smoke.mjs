import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/settings-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/settings-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/settings-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (c) => process.exit(c ?? 1));
