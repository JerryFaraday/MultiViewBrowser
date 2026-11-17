import { artifactOutputPath } from "./test-artifacts.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
const profile = mkdtempSync(join(tmpdir(), "mvb-live-pack-"));
const config = {
  version: 1,
  revision: 0,
  preferences: {
    liveDetection: true,
    liveInterval: 60,
    startupWindow: "normal",
  },
  restore: true,
  bookmarksBar: true,
  masterVolume: 100,
  masterMuted: true,
  pageStash: [],
  session: { pages: [], tree: { kind: "leaf", slot: 0 }, layoutId: "test" },
  favorites: [
    {
      id: "fixture",
      name: "fixture",
      category: "bilibili-live",
      roomId: "35",
      url: "https://live.bilibili.com/35",
      group: "常用",
      note: "",
      created: "",
    },
    {
      id: "douyu",
      name: "douyu fixture",
      category: "douyu-live",
      roomId: "1667826",
      url: "https://www.douyu.com/1667826",
      group: "常用",
      note: "",
      created: "",
    },
    {
      id: "douyu-offline",
      name: "offline fixture",
      category: "douyu-live",
      roomId: "6657",
      url: "https://www.douyu.com/6657",
      group: "常用",
      note: "",
      created: "",
    },
  ],
  groups: ["常用"],
  layouts: [],
  workspaces: [],
};
writeFileSync(join(profile, "config.json"), JSON.stringify(config));
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const child = spawn(
  resolve(process.argv[2] || "release/win-unpacked/MultiViewBrowser.exe"),
  ["--user-data-dir=" + profile, "--remote-debugging-port=" + port],
  { windowsHide: true, stdio: "ignore" },
);
const wait = (n) => new Promise((r) => setTimeout(r, n));
let ws;
const pending = new Map();
let id = 0;
const command = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const number = ++id;
    const timer = setTimeout(() => {
      pending.delete(number);
      reject(Error("CDP timeout"));
    }, 3000);
    pending.set(number, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    ws.send(JSON.stringify({ id: number, method, params }));
  });
let pass = false;
try {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      target = (
        await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()
      ).find((x) => x.type === "page" && x.url.includes("index.html"));
      if (target) break;
    } catch {}
    await wait(100);
  }
  if (!target) throw Error("No renderer");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data),
      p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error("CDP failed")) : p.resolve(m.result);
    }
  };
  let result;
  for (let i = 0; i < 100; i++) {
    const r = await command("Runtime.evaluate", {
      expression:
        'window.browser.liveStatus().then(s=>({status:s["35"]?.status,reason:s["35"]?.reason,douyu:s["douyu:1667826"]?.status,douyuReason:s["douyu:1667826"]?.reason,secondDouyu:s["douyu:6657"]?.status,secondReason:s["douyu:6657"]?.reason,dots:document.querySelectorAll(".live-dot").length}))',
      awaitPromise: true,
      returnByValue: true,
    });
    result = r.result?.value;
    if (
      result &&
      result.reason !== "pending" &&
      result.status &&
      result.douyuReason !== "pending" &&
      result.douyu &&
      result.secondDouyu &&
      result.secondReason !== "pending"
    )
      break;
    await wait(150);
  }
  const loaded = await command("Runtime.evaluate", {
    expression:
      "window.browser.load().then(c=>({enabled:c.preferences.liveDetection,category:c.favorites[0].category}))",
    awaitPromise: true,
    returnByValue: true,
  });
  pass =
    !!result &&
    (["live", "offline"].includes(result.status) ||
      result.reason === "replay") &&
    result.dots === 3 &&
    ["live", "offline"].includes(result.secondDouyu) &&
    ["live", "offline"].includes(result.douyu) &&
    loaded.result?.value?.enabled === true &&
    loaded.result?.value?.category === "bilibili-live";
  writeFileSync(
    artifactOutputPath("live-pack-diagnostic.json"),
    JSON.stringify(
      {
        status: result?.status,
        reason: result?.reason,
        dots: result?.dots,
        pass,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: result?.status,
      douyu: result?.douyu,
      secondDouyu: result?.secondDouyu,
      dots: result?.dots,
      pass,
    }),
  );
  await command("Runtime.evaluate", { expression: "window.close()" }).catch(
    () => {},
  );
} catch {
  console.error("Packaged live-status verification failed");
} finally {
  ws?.close();
  await wait(800);
  if (child.exitCode === null) child.kill();
}
try {
  const cached = JSON.parse(readFileSync(join(profile, "config.json"), "utf8"))
    .favorites[0].liveCache;
  const cachePersisted =
    cached?.inputRoomId === "35" &&
    /^\d+$/.test(cached.realRoomId) &&
    /^\d+$/.test(cached.uid) &&
    cached.checkedAt > 0 &&
    cached.formatVersion === 1;
  pass = pass && cachePersisted;
  console.log(JSON.stringify({ cachePersisted, pass }));
} catch {
  pass = false;
}
process.exit(pass ? 0 : 1);
