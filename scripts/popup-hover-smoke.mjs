import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/popup-hover-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/popup-hover-smoke.cjs",
  external: ["electron"],
});
for (const populated of ["0", "1"]) {
  const code = await new Promise((resolve) => {
    const child = spawn(electron, ["dist-electron/popup-hover-smoke.cjs"], {
      stdio: "inherit",
      env: { ...process.env, MVB_HOVER_STASH: populated },
    });
    child.on("exit", (value) => resolve(value ?? 1));
  });
  if (code !== 0) process.exit(Number(code));
}
