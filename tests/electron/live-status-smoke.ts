import { artifactOutputPath } from "../../scripts/lib/test-artifacts.mjs";
import { app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../../src/core/WorkspaceManager";
import { favoriteSchema } from "../../src/core/model";
import { LiveMonitor } from "../../electron/LiveMonitor";
import { DouyuAdapter } from "../../electron/live/Douyu";
app.setPath("userData", app.getPath("temp") + "/mvb-live-ui-" + Date.now());
const c = defaults();
c.masterMuted = true;
c.bookmarksBar = true;
c.groups = ["常用", "Other"];
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
  ...["35", "9999", "10", "9999"].map((roomId, i) =>
    favoriteSchema.parse({
      id: "d" + i,
      name: "douyu" + i,
      category: "douyu-live",
      roomId,
      url: "https://www.douyu.com/" + roomId,
      group: "常用",
      note: "",
      created: "",
    }),
  ),
  ...["old", "bad", "oldDouyu"].map((id) =>
    favoriteSchema.parse({
      id,
      name: id,
      url:
        id === "oldDouyu"
          ? "http://www.douyu.com/9999/?test=1"
          : id === "old"
            ? "http://live.bilibili.com/35/?test=1"
            : "https://example.com",
      group: "常用",
      note: "",
      created: "",
    }),
  ),
];
c.favorites.find((f) => f.id === "bad")!.group = "Other";
c.favorites.find((f) => f.id === "old")!.note = "legacy note";
mkdirSync(app.getPath("userData"), { recursive: true });
writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
const requests: any[] = [];
(DouyuAdapter.prototype as any).attempt = async (
  id: string,
  signal: AbortSignal,
) => {
  signal.throwIfAborted();
  requests.push({ kind: "douyu", id });
  return {
    httpStatus: 200,
    body: {
      room: {
        room_id: Number(id),
        show_status: id === "35" ? 0 : 1,
        videoLoop: id === "10" ? 1 : 0,
      },
    },
  };
};
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
void import("../../electron/main");
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
    const js = async (s: string) => {
        try {
          return await root.executeJavaScript(s);
        } catch (error) {
          console.error("Fixture step failed:", s.slice(0, 180));
          throw error;
        }
      },
      load = () => js("window.browser.load()");
    // Only this disposable fixture accepts destructive confirmations.
    await js("window.confirm=()=>true;true");
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
      "document.querySelector('[aria-label=\"检测直播间开播状态\"]').click()",
    );
    await wait(1100);
    const dots = await js(
      "Array.from(document.querySelectorAll('.live-dot')).map(e=>({status:e.className,label:e.getAttribute('aria-label'),right:e.getBoundingClientRect().left>=e.previousElementSibling.getBoundingClientRect().right}))",
    );
    const indicators =
      dots.length === 8 &&
      dots.filter((x: any) => x.status.includes(" live")).length === 4 &&
      dots.some((x: any) => x.status.includes("offline")) &&
      dots.some((x: any) => x.status.includes("unknown")) &&
      dots.every((x: any) => x.right);
    const barHeight = await js(
      "document.querySelector('.bookmarks-bar').getBoundingClientRect().height",
    );
    await js("document.querySelector('.settings-back').click()");
    await wait(80);
    writeFileSync(
      artifactOutputPath("live-bar-smoke.png"),
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
      requests.find((r) => r.kind === "rooms")?.count === 3 &&
      requests.filter((r) => r.kind === "douyu").length === 3;
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
    const click = async (selector: string) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
      await wait(60);
    };
    await click('.settings-content [aria-label="编辑分组"]');
    const inlineFocus = await js(
      "(()=>{const e=document.querySelector('[aria-label=\"分组名称\"]');return document.activeElement===e&&e.selectionEnd===e.value.length&&!document.querySelector('.name-editor')})()",
    );
    await input('[aria-label="分组名称"]', "Other");
    await click('[aria-label="保存分组"]');
    const duplicateBlocked = await js(
      "!!document.querySelector('.group-error')",
    );
    await js(
      "document.querySelector('[aria-label=\"分组名称\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
    );
    await wait(50);
    const escCancelled = await js(
      "!document.querySelector('.group-name-input')&&!!document.querySelector('.settings-page')",
    );
    await click('.settings-content [aria-label="编辑分组"]');
    await input('[aria-label="分组名称"]', "  ");
    await click('[aria-label="保存分组"]');
    const blankBlocked = await js("!!document.querySelector('.group-error')");
    await input('[aria-label="分组名称"]', "Renamed");
    await js(
      "document.querySelector('[aria-label=\"分组名称\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
    );
    await wait(300);
    const renamed = (await load()).groups[0] === "Renamed";
    await click('.settings-content [aria-label="编辑分组"]');
    await input('[aria-label="分组名称"]', "Discard");
    await click('[aria-label="取消编辑分组"]');
    await wait(250);
    const cancelKept = (await load()).groups[0] === "Renamed";
    const iconSizes = await js(
      "Array.from(document.querySelectorAll('.settings-content .favorite-action')).every(b=>{const r=b.getBoundingClientRect(),s=b.querySelector('svg');return r.width>=32&&r.height>=32&&s?.getAttribute('width')==='16'&&!!b.title})&&!document.querySelector('.settings-content .favorite-group h4 small')",
    );
    await click('[aria-label="显示收藏分组名称"]');
    const beforeFlat = await js(
      "Array.from(document.querySelectorAll('.bookmarks-bar .bookmark-name')).map(e=>e.textContent)",
    );
    await click('[aria-label="显示收藏栏分组"]');
    await wait(250);
    const flat = await js(
      "!document.querySelector('.bookmarks-bar .bookmark-group-name')&&!document.querySelector('.bookmarks-bar .bookmark-separator')",
    );
    const afterFlat = await js(
      "Array.from(document.querySelectorAll('.bookmarks-bar .bookmark-name')).map(e=>e.textContent)",
    );
    await click('[aria-label="显示收藏栏"]');
    await wait(250);
    const dependencies = await js(
      "['显示收藏分组名称','显示收藏栏分组'].every(n=>document.querySelector('[aria-label=\"'+n+'\"]').disabled)",
    );
    const hidden = await load();
    await click('[aria-label="显示收藏分组名称"]');
    await click('[aria-label="显示收藏栏分组"]');
    const hiddenAfter = await load();
    await click('[aria-label="显示收藏栏"]');
    await wait(250);
    const restored =
      (await load()).preferences.showGroupNames === true &&
      (await load()).preferences.showBookmarkGroups === false;
    await click('[aria-label="显示收藏栏分组"]');
    await wait(1100);
    const uiRepairs =
      inlineFocus &&
      duplicateBlocked &&
      escCancelled &&
      blankBlocked &&
      renamed &&
      cancelKept &&
      iconSizes &&
      flat &&
      JSON.stringify(beforeFlat) === JSON.stringify(afterFlat) &&
      dependencies &&
      restored &&
      hidden.preferences.showGroupNames ===
        hiddenAfter.preferences.showGroupNames &&
      hidden.preferences.showBookmarkGroups ===
        hiddenAfter.preferences.showBookmarkGroups;
    await edit("old");
    const formLayout = await js(
      "(()=>{const rows=Array.from(document.querySelectorAll('.favorite-editor label'));return !document.querySelector('.favorite-editor textarea')&&rows.every(l=>getComputedStyle(l).display==='grid')&&rows.map(l=>l.querySelector('input,select')?.getBoundingClientRect().left).every((x,i,a)=>Math.abs(x-a[0])<2)})()",
    );
    writeFileSync(
      artifactOutputPath("favorites-inline-smoke.png"),
      (await w.capturePage()).toPNG(),
    );
    await category("live");
    await save();
    let cfg = await load();

    const converted =
      cfg.favorites.find((f: any) => f.id === "old").roomId === "35" &&
      cfg.favorites.find((f: any) => f.id === "old").note === "legacy note";
    await edit("old");
    await category("web");
    await save();
    cfg = await load();
    const reversed =
      cfg.favorites.find((f: any) => f.id === "old").url ===
      "http://live.bilibili.com/35/?test=1";
    await edit("oldDouyu");
    await category("live");
    const autoDouyu = await js(
      "document.querySelector('[aria-label=\"直播平台\"]').value==='douyu-live'&&document.querySelector('[aria-label=\"直播间号\"]').value==='9999'",
    );
    await save();
    cfg = await load();
    const douyuSaved =
      cfg.favorites.find((f: any) => f.id === "oldDouyu").category ===
      "douyu-live";
    await edit("oldDouyu");
    await category("web");
    await save();
    cfg = await load();
    const douyuReversed =
      cfg.favorites.find((f: any) => f.id === "oldDouyu").url ===
      "http://www.douyu.com/9999/?test=1";
    await edit("bad");
    await category("live");
    const rejected = await js(
      "!!document.querySelector('.favorite-editor [role=alert]')&&document.querySelector('[aria-label=\"标签类别\"]').value==='web'&&document.querySelector('[aria-label=\"标签类别\"] option[value=live]').disabled",
    );
    await js("document.querySelector('[aria-label=\"关闭收藏编辑\"]').click()");
    await js(
      "Array.from(document.querySelectorAll('.side-title button')).find(b=>b.textContent==='添加收藏').click()",
    );
    await wait(50);
    await input(".favorite-editor label:first-of-type input", "new");
    await category("live");
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
    await js(
      "Array.from(document.querySelectorAll('.side-title button')).find(b=>b.textContent==='添加收藏').click()",
    );
    await wait(50);
    await input(".favorite-editor label:first-of-type input", "newDouyu");
    await category("live");
    await js(
      "(()=>{const e=document.querySelector('[aria-label=\"直播平台\"]');e.value='douyu-live';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    await wait(50);
    await input('[aria-label="直播间号"]', "123");
    await save();
    cfg = await load();
    const newDouyu = cfg.favorites.some(
      (f: any) =>
        f.name === "newDouyu" &&
        f.category === "douyu-live" &&
        f.url === "https://www.douyu.com/123",
    );
    await js("document.querySelector('[aria-label=\"检测间隔\"]').focus()");
    await input('[aria-label="检测间隔"]', "30");
    await js("document.querySelector('[aria-label=\"检测间隔\"]').blur()");
    await wait(300);
    const interval = (await load()).preferences.liveInterval === 30;
    await js("document.querySelector('[aria-label=\"显示收藏栏\"]').click()");
    await wait(300);
    cfg = await load();
    const stopped =
      cfg.preferences.liveDetection &&
      (await js(
        "document.querySelectorAll('.live-dot').length===0&&document.querySelector('[aria-label=\"检测直播间开播状态\"]').disabled",
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
    const platformChecks =
      autoDouyu &&
      douyuSaved &&
      douyuReversed &&
      newDouyu &&
      uiRepairs &&
      formLayout;
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
      platformChecks,
      uiRepairs,
      formLayout,
      inlineFocus,
      duplicateBlocked,
      escCancelled,
      blankBlocked,
      renamed,
      cancelKept,
      iconSizes,
      flat,
      dependencies,
      restored,
      pass: pass && platformChecks,
    };
    writeFileSync(
      artifactOutputPath("live-ui-diagnostic.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    app.exit(pass && platformChecks ? 0 : 1);
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
