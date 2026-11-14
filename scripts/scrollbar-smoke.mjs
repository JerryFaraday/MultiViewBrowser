import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/scrollbar-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/scrollbar-smoke.cjs",
  external: ["electron"],
});
const child = spawn(electron, ["dist-electron/scrollbar-smoke.cjs"], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
