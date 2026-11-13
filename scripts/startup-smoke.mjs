import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import electron from "electron";
await build({
  entryPoints: ["electron/startup-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/startup-smoke.cjs",
  external: ["electron"],
});
const folder = mkdtempSync(join(tmpdir(), "mvb-startup-")),
  server = createServer((_q, r) =>
    r.end("<title>local startup fixture</title>"),
  );
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const mode of ["save-off", "restore", "blank"]) {
    const code = await new Promise((resolve) => {
      const p = spawn(
        electron,
        [
          "dist-electron/startup-smoke.cjs",
          mode,
          folder,
          "http://127.0.0.1:" + server.address().port,
        ],
        { stdio: "inherit" },
      );
      p.on("exit", resolve);
    });
    if (code !== 0) {
      process.exitCode = 1;
      break;
    }
  }
} finally {
  server.close();
}
