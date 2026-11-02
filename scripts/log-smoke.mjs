import { build } from "esbuild";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import electron from "electron";

const before = new Set(readdirSync("logs"));
await build({
  entryPoints: ["electron/log-smoke.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/log-smoke.cjs",
  external: ["electron"],
});
const code = await new Promise((resolve) => {
  const child = spawn(electron, ["dist-electron/log-smoke.cjs"], {
    stdio: "inherit",
  });
  child.on("exit", resolve);
  child.on("error", () => resolve(1));
});
const files = readdirSync("logs").filter(
  (file) => file.endsWith(".log") && !before.has(file),
);
const file = files[0];
const content = file ? readFileSync("logs/" + file, "utf8") : "";
const rows = content
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const events = rows.map((row) => row.event);
const result = {
  file,
  count: rows.length,
  lifecycle:
    events[0] === "session.start" &&
    events.at(-1) === "session.end" &&
    events.includes("app.close_requested"),
  uiClick: rows.some(
    (row) => row.event === "ui.click" && row.action === "audio.toggle",
  ),
  audioChange: events.includes("audio.master_change"),
  webClick: events.includes("web.click"),
  privateDataAbsent: !/PRIVATE_LOG_SMOKE_MARKER|https?:\/\//.test(content),
};
result.pass =
  code === 0 &&
  files.length === 1 &&
  result.lifecycle &&
  result.uiClick &&
  result.audioChange &&
  result.webClick &&
  result.privateDataAbsent;
writeFileSync("log-smoke-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
