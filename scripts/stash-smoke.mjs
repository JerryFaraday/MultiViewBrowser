import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/stash-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/stash-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/stash-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (code) => process.exit(code ?? 1));
