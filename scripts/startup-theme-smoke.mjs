import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
await build({
  entryPoints: ["electron/startup-theme-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/startup-theme-smoke.cjs",
  external: ["electron"],
});
for (const theme of ["dark", "gray", "black", "light"]) {
  const code = await new Promise((resolve) => {
    const p = spawn(electron, ["dist-electron/startup-theme-smoke.cjs"], {
      stdio: "inherit",
      env: { ...process.env, MVB_STARTUP_THEME: theme },
    });
    p.on("exit", (c) => resolve(c ?? 1));
  });
  if (code !== 0) process.exit(Number(code));
}
