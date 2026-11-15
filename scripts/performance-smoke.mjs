import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/performance-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/performance-smoke.cjs",
  external: ["electron"],
});
const p = spawn(
  electron,
  ["dist-electron/performance-smoke.cjs", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
p.on("exit", (c) => process.exit(c ?? 1));
