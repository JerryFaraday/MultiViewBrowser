import { artifactOutputPath } from "./test-artifacts.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { extractFile } from "@electron/asar";
import { createHash } from "node:crypto";
const executable = resolve(
  process.argv[2] ??
    "release/validation-performance/win-unpacked/MultiViewBrowser.exe",
);
const profile = mkdtempSync(join(tmpdir(), "mvb-perf-pack-"));
const preferences = {
  startupWindow: "normal",
  backgroundThrottling: false,
  autoReleaseStash: true,
  stashReleaseMinutes: 120,
  muteOnMaximize: false,
  pauseOnMaximize: true,
  pauseInSettings: true,
  autoFetchStashTitle: true,
  liveResize: false,
  logMode: "normal",
};
writeFileSync(
  join(profile, "config.json"),
  JSON.stringify({
    version: 1,
    revision: 0,
    restore: true,
    bookmarksBar: false,
    preferences,
    masterMuted: true,
    masterVolume: 100,
    pageStash: [],
    session: { pages: [], tree: { kind: "leaf", slot: 0 }, layoutId: "test" },
    favorites: [],
    groups: ["test"],
    layouts: [],
    workspaces: [],
  }),
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
async function run(restart) {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const child = spawn(
    executable,
    ["--user-data-dir=" + profile, "--remote-debugging-port=" + port],
    { windowsHide: true, stdio: "ignore" },
  );
  let ws;
  const pending = new Map();
  let seq = 0;
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("CDP timeout"));
      }, 4000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject,
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error("Page script failed");
    return r.result?.value;
  };
  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        target = (
          await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()
        ).find((t) => t.url.includes("index.html"));
        if (target) break;
      } catch {}
      await wait(100);
    }
    if (!target) throw Error("No packaged UI");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    ws.onmessage = (event) => {
      const m = JSON.parse(event.data),
        p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        m.error ? p.reject(Error("CDP error")) : p.resolve(m.result);
      }
    };
    const c = await evaluate("window.browser.load()");
    results[restart ? "restartPreferences" : "startupPreferences"] =
      Object.entries(preferences).every(([k, v]) => c.preferences[k] === v);
    for (
      let i = 0;
      i < 20 &&
      !(await evaluate(`!!document.querySelector('.toolbar>button')`));
      i++
    )
      await wait(50);
    await evaluate(
      `Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click();true`,
    );
    await wait(60);
    await evaluate(
      `Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='关于与诊断').click();true`,
    );
    await wait(60);
    results.version = await evaluate(
      `document.body.textContent.includes('V0.2.6.0')`,
    );
    if (!restart) {
      await evaluate(
        `window.resizeEvents=[];window.browser.onResizePointer(e=>window.resizeEvents.push(e));window.browser.beginResize('x')`,
      );
      await wait(150);
      const preview = (
        await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()
      ).find((t) => t.title === "分屏线预览");
      if (!preview) throw Error("No resize surface");
      const original = ws,
        probe = new WebSocket(preview.webSocketDebuggerUrl);
      await new Promise((r, j) => {
        probe.onopen = r;
        probe.onerror = j;
      });
      probe.onmessage = original.onmessage;
      ws = probe;
      await evaluate(
        `window.dispatchEvent(new MouseEvent('mousemove',{clientX:120,clientY:100}));true`,
      );
      await wait(60);
      await evaluate(
        `window.dispatchEvent(new MouseEvent('mouseup',{clientX:140,clientY:100}));true`,
      );
      await wait(100);
      ws = original;
      probe.close();
      results.resizePreload = await evaluate(
        `window.resizeEvents.some(e=>e.done&&e.x===140&&e.y===100)`,
      );
      await evaluate(
        `window.browser.load().then(c=>{c.masterVolume=107;return window.browser.save(c)})`,
      );
    } else results.restartLastSave = c.masterVolume === 107;
    // Normal close exercises renderer final state + asynchronous disk/log draining.
    await command("Runtime.evaluate", {
      expression: "window.close();true",
      returnByValue: true,
    });
    for (let i = 0; i < 100 && child.exitCode === null; i++) await wait(100);
    results[restart ? "restartClosed" : "normalClosed"] = child.exitCode === 0;
  } finally {
    ws?.close();
    if (child.exitCode === null) child.kill();
  }
}
try {
  const asar = join(resolve(executable, ".."), "resources/app.asar");
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  results.preloadIntegrity =
    hash(extractFile(asar, "dist-electron/resize-preload.cjs")) ===
    hash(readFileSync("dist-electron/resize-preload.cjs"));
  await run(false);
  results.exitPersisted =
    JSON.parse(readFileSync(join(profile, "config.json"), "utf8"))
      .masterVolume === 107;
  await run(true);
  results.pass = Object.values(results).every(Boolean);
  writeFileSync(
    artifactOutputPath("performance-pack-results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  process.exitCode = results.pass ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
