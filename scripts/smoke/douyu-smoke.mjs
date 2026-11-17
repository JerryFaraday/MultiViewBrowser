import "../lib/test-artifacts.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
// Public-room API probe; no Electron window, account, cookie or profile is used.
await build({
  entryPoints: ["tests/electron/douyu-probe.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/douyu-probe.cjs",
});
const p = spawn(
  process.execPath,
  ["dist-electron/douyu-probe.cjs", ...process.argv.slice(2)],
  { stdio: "inherit", windowsHide: true },
);
p.on("error", () => process.exit(1));
p.on("exit", (code) => process.exit(code ?? 1));
