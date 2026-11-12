import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
import { statSync, readFileSync } from "node:fs";
const started = Date.now();
await build({
  entryPoints: ["electron/interaction-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/interaction-smoke.cjs",
  external: ["electron"],
});
const p = spawn(electron, ["dist-electron/interaction-smoke.cjs"], {
  stdio: "inherit",
});
p.on("exit", (code) => {
  let verified = false;
  try {
    verified =
      statSync("interaction-smoke-results.json").mtimeMs >= started &&
      JSON.parse(readFileSync("interaction-smoke-results.json", "utf8"))
        .pass === true;
  } catch {}
  process.exit(code === 0 && verified ? 0 : 1);
});
