import { app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { favoriteSchema } from "../src/core/model";
import { LiveMonitor } from "./LiveMonitor";
app.setPath("userData", app.getPath("temp") + "/mvb-live-ui-" + Date.now());
const c = defaults();
c.masterMuted = true;
c.bookmarksBar = true;
c.favorites = [
  ...["35", "35", "6", "7"].map((id, i) =>
    favoriteSchema.parse({
      id: "f" + i,
      name: ["live", "duplicate", "offline", "unknown"][i],
      url: "https://live.bilibili.com/" + id,
      category: "bilibili-live",
      roomId: id,
      group: "常用",
      note: "",
      created: "",
    }),
  ),
  ...["old", "bad"].map((id) =>
    favoriteSchema.parse({
      id,
      name: id,
      url:
        id === "old"
          ? "http://live.bilibili.com/35/?test=1"
          : "https://example.com",
      group: "常用",
      note: "",
      created: "",
    }),
  ),
];
mkdirSync(app.getPath("userData"), { recursive: true });
writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
const requests: any[] = [];
// UI/IPC test fixture only. Native WinHTTP is verified separately against APIs.
(LiveMonitor.prototype as any).request = async (
  kind: string,
  ids: string[],
  signal: AbortSignal,
) => {
  signal.throwIfAborted();
  requests.push({ kind, count: ids.length });
  if (kind === "room") return { uid: Number(ids[0]), room_id: Number(ids[0]) };
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        uid: Number(id),
        room_id: Number(id),
        roomid: Number(id),
        short_id: 0,
        live_status: id === "35" ? 1 : id === "6" ? 0 : 99,
      },
    ]),
  );
};
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
void import("./main");
app.whenReady().then(async () => {
  const timer = setTimeout(() => app.exit(2), 30000);
  await wait(1300);
  try {
    const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getTitle() === "MultiView Browser",
      )!,
      root = w.webContents;
    w.focus();
    root.focus();
    root.setBackgroundThrottling(false);
    const js = (s: string) => root.executeJavaScript(s),
      load = () => js("window.browser.load()");
    await js(
      "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
    );
    await wait(80);
    await js(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='收藏栏').click()",
    );
    await wait(80);
    const initial = await js(
      "document.querySelectorAll('.live-dot').length===0",
    );
    const initialBarHeight = await js(
      "document.querySelector('.bookmarks-bar').getBoundingClientRect().height",
    );
    await js(
      "document.querySelector('[aria-label=\"检测B站直播间开播状态\"]').click()",
    );
    await wait(200);
    const dots = await js(
      "Array.from(document.querySelectorAll('.live-dot')).map(e=>({status:e.className,label:e.getAttribute('aria-label'),right:e.getBoundingClientRect().left>=e.previousElementSibling.getBoundingClientRect().right}))",
    );
    const indicators =
      dots.length === 4 &&
      dots.filter((x: any) => x.status.includes(" live")).length === 2 &&
      dots.some((x: any) => x.status.includes("offline")) &&
      dots.some((x: any) => x.status.includes("unknown")) &&
      dots.every((x: any) => x.right);
    const barHeight = await js(
      "document.querySelector('.bookmarks-bar').getBoundingClientRect().height",
    );
    await js("document.querySelector('.settings-back').click()");
    await wait(80);
    writeFileSync(
      "live-bar-smoke.png",
      (await w.capturePage({ x: 0, y: 45, width: 1000, height: 75 })).toPNG(),
    );
    await js(
      "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
    );
    await wait(80);
    await js(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='收藏栏').click()",
    );
    await wait(80);
    const barStable =
      barHeight === initialBarHeight &&
      barHeight ===
        (await js(
          "document.querySelector('.bookmarks-bar').getBoundingClientRect().height",
        ));
    const dedup =
      requests.filter((r) => r.kind === "rooms").length === 1 &&
      requests.find((r) => r.kind === "rooms")?.count === 3;
    const input = async (selector: string, value: string) => {
      await js(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
      await wait(40);
    };
    const category = async (value: string) => {
      await js(
        `(()=>{const e=document.querySelector('[aria-label="标签类别"]');e.value='${value}';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
      );
      await wait(40);
    };
    const edit = async (name: string) => {
      await js(
        `Array.from(document.querySelectorAll('.favorite')).find(e=>e.querySelector('button').textContent==='${name}').querySelector('[title="编辑收藏"]').click()`,
      );
      await wait(50);
    };
    const save = async () => {
      await js("document.querySelector('.favorite-editor').requestSubmit()");
      await wait(300);
    };
    await edit("old");
    await category("bilibili-live");
    await save();
    let cfg = await load();

    const converted =
      cfg.favorites.find((f: any) => f.id === "old").roomId === "35";
    await edit("old");
    await category("web");
    await save();
    cfg = await load();
    const reversed =
      cfg.favorites.find((f: any) => f.id === "old").url ===
      "http://live.bilibili.com/35/?test=1";
    await edit("bad");
    await category("bilibili-live");
    const rejected = await js(
      "!!document.querySelector('.favorite-editor [role=alert]')&&document.querySelector('[aria-label=\"标签类别\"]').value==='web'",
    );
    await js("document.querySelector('[aria-label=\"关闭收藏编辑\"]').click()");
    await js("document.querySelector('.side-title button').click()");
    await wait(50);
    await input(".favorite-editor label:first-of-type input", "new");
    await category("bilibili-live");
    await input('[aria-label="直播间号"]', "abc");
    const invalidRoom = await js(
      "!document.querySelector('.favorite-editor').checkValidity()",
    );
    await input('[aria-label="直播间号"]', "55");
    await save();
    cfg = await load();
    const created = cfg.favorites.some(
      (f: any) =>
        f.name === "new" &&
        f.roomId === "55" &&
        f.url === "https://live.bilibili.com/55",
    );
    await js(
      "Array.from(document.querySelectorAll('.favorite')).find(e=>e.querySelector('button').textContent==='new').querySelector('[title=\"删除收藏\"]').click()",
    );
    await wait(300);
    const deleted =
      !(await load()).favorites.some((f: any) => f.name === "new") &&
      !(await js("window.browser.liveStatus()"))["55"];
    await js("document.querySelector('[aria-label=\"检测间隔\"]').focus()");
    await input('[aria-label="检测间隔"]', "30");
    await js("document.querySelector('[aria-label=\"检测间隔\"]').blur()");
    await wait(300);
    const interval = (await load()).preferences.liveInterval === 30;
    await js("document.querySelector('[aria-label=\"显示收藏栏\"]').click()");
    await wait(300);
    cfg = await load();
    const stopped =
      !cfg.preferences.liveDetection &&
      (await js(
        "document.querySelectorAll('.live-dot').length===0&&document.querySelector('[aria-label=\"检测B站直播间开播状态\"]').disabled",
      ));
    const count = requests.length;
    await wait(400);
    const noQuery = requests.length === count;
    const pass =
      barStable &&
      invalidRoom &&
      deleted &&
      initial &&
      indicators &&
      dedup &&
      converted &&
      reversed &&
      rejected &&
      created &&
      interval &&
      stopped &&
      noQuery;
    const result = {
      barStable,
      invalidRoom,
      deleted,
      initial,
      indicators,
      dedup,
      converted,
      reversed,
      rejected,
      created,
      interval,
      stopped,
      noQuery,
      pass,
    };
    writeFileSync("live-ui-diagnostic.json", JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(
      "Live UI smoke failed",
      e instanceof Error ? e.message : "unknown",
    );
    app.exit(1);
  } finally {
    clearTimeout(timer);
  }
});
