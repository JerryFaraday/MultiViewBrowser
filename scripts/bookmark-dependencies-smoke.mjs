import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electron from "electron";
await build({
  entryPoints: ["electron/bookmark-dependencies-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/bookmark-dependencies-smoke.cjs",
  external: ["electron"],
});
const profile = mkdtempSync(join(tmpdir(), "mvb-switch-dependency-"));
for (const extra of [[], ["--restart"]]) {
  const code = await new Promise((resolve) => {
    const p = spawn(
      electron,
      ["dist-electron/bookmark-dependencies-smoke.cjs", ...extra],
      {
        stdio: "inherit",
        env: { ...process.env, MVB_DEPENDENCY_PROFILE: profile },
      },
    );
    p.on("error", () => resolve(1));
    p.on("exit", (c) => resolve(c ?? 1));
  });
  if (code !== 0) process.exit(Number(code));
}
