import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { artifactOutputPath } from "../lib/test-artifacts.mjs";

const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(
  process.execPath,
  [
    "scripts/dev.mjs",
    "--user-data-dir=" + mkdtempSync(join(tmpdir(), "mvb-dev-smoke-")),
    "--remote-debugging-port=" + port,
  ],
  { stdio: "inherit", windowsHide: true },
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = {
  vite: false,
  renderer: false,
  bridge: false,
  closed: false,
  pass: false,
};
let ws;
try {
  let target;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(500),
      });
      target = (await response.json()).find(
        (entry) =>
          entry.type === "page" &&
          entry.url.startsWith("http://127.0.0.1:5173"),
      );
      if (target) break;
    } catch {}
    await wait(100);
  }
  if (!target) throw Error("Development renderer readiness timed out");
  results.vite = true;
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("CDP connection timed out")),
      3000,
    );
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(Error("CDP connection failed"));
    };
  });
  let state;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      state = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Development UI timed out")),
          10000,
        );
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.id !== 1) return;
          clearTimeout(timer);
          if (message.error || message.result?.exceptionDetails)
            reject(Error("Development UI evaluation failed"));
          else resolve(message.result?.result?.value);
        };
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: `(async()=>{if(document.querySelector('.toolbar')&&window.browser){const c=await window.browser.load();return {renderer:true,bridge:!!c.session}}return {renderer:false,bridge:false}})()`,
              awaitPromise: true,
              returnByValue: true,
            },
          }),
        );
      });
      if (state?.renderer && state?.bridge) break;
    } catch (error) {
      if (attempt === 29) throw error;
    }
    await wait(200);
  }
  results.renderer = state?.renderer === true;
  results.bridge = state?.bridge === true;
  ws.send(
    JSON.stringify({
      id: 2,
      method: "Runtime.evaluate",
      params: { expression: "window.close()" },
    }),
  );
  for (let i = 0; i < 100 && child.exitCode === null; i++) await wait(100);
  results.closed = child.exitCode === 0;
  results.pass =
    results.vite && results.renderer && results.bridge && results.closed;
} catch (error) {
  console.error(error.message);
} finally {
  ws?.close();
  if (child.exitCode === null) {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill();
  }
  writeFileSync(
    artifactOutputPath("startup-dev-results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  process.exitCode = results.pass ? 0 : 1;
}
