import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/review-probe.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/review-probe.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/review-probe.cjs"], {
  stdio: "inherit",
});
p.on("exit", (code) => process.exit(code ?? 1));
