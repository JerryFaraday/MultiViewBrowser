import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
await build({
  entryPoints: ["electron/appearance-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/appearance-smoke.cjs",
  external: ["electron"],
});
const profile = mkdtempSync(join(tmpdir(), "mvb-appearance-"));
const run = (restart) =>
  new Promise((resolve) => {
    const child = spawn(electron, ["dist-electron/appearance-smoke.cjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        MVB_APPEARANCE_PROFILE: profile,
        MVB_APPEARANCE_RESTART: restart ? "1" : "0",
      },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
const first = await run(false);
process.exit(first === 0 ? await run(true) : first);
