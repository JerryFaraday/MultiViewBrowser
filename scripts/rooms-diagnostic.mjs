import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/rooms-diagnostic.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/rooms-diagnostic.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/rooms-diagnostic.cjs"], {
  stdio: "inherit",
});
p.on("exit", (code) => process.exit(code ?? 1));
