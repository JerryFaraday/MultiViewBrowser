import { app, BrowserWindow, session, dialog, webContents } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { OperationLogger, setOperationLogger } from "./OperationLogger";
import version from "../version.json";
app.setPath(
  "userData",
  join(app.getPath("temp"), "mvb-settings-smoke-" + Date.now()),
);
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
let failedAt = 0;
const server = createServer((q, r) => {
  if (q.url === "/retry") {
    if (!failedAt) failedAt = Date.now();
    if (Date.now() - failedAt < 900) {
      q.socket.destroy();
      return;
    }
  }
  r.setHeader("Content-Type", "text/html");
  r.end(
    '<title>settings local page</title><input value="preserved"><canvas width="50" height="50"></canvas><script>window.marker=Math.random();document.querySelector("canvas").onclick=e=>window.hit=e.isTrusted</script>',
  );
});
server.listen(0, "127.0.0.1", async () => {
  const base = "http://127.0.0.1:" + (server.address() as any).port,
    seed = defaults(),
    folder = app.getPath("userData");
  seed.bookmarksBar = true;
  seed.favorites = [
    {
      id: "favorite",
      name: "local",
      url: base,
      group: "常用",
      note: "",
      created: "",
    },
  ];
  seed.preferences.startupWindow = "normal";
  seed.preferences.startupContent = "workspace";
  seed.preferences.defaultWorkspace = "start";
  seed.session.pages = [newPage(base + "/old")];
  const snapshot = structuredClone(seed.session);
  snapshot.pages = [newPage(base + "/workspace")];
  snapshot.pages[0]!.scale.mode = "responsive";
  seed.workspaces = [
    {
      id: "start",
      name: "startup fixture",
      snapshot,
      created: "",
      modified: "",
    },
  ];
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "config.json"), JSON.stringify(seed));
  await import("./main");
  await app.whenReady();
  await wait(1800);
  try {
    const w = BrowserWindow.getAllWindows().find(
        (x) => x.webContents.getTitle() === "MultiView Browser",
      )!,
      root = w.webContents;
    const load = () => root.executeJavaScript("window.browser.load()");
    const edit = async (expression: string) => {
      await root.executeJavaScript(
        "window.browser.load().then(c=>{" +
          expression +
          ";return window.browser.save(c)})",
      );
      root.reload();
      await wait(800);
    };
    let c = await load();
    const startup =
      !w.isMaximized() &&
      c.session.pages[0]?.url === base + "/workspace" &&
      c.workspaces[0].snapshot.pages[0].url === base + "/workspace";
    const original = webContents
        .getAllWebContents()
        .find((x) => x.getURL() === base + "/workspace")!,
      identity = await original.executeJavaScript("window.marker");
    await edit(
      "c.preferences.theme='light';c.preferences.uiScale=1.25;c.preferences.tooltips=false;c.preferences.showGroupNames=true;c.preferences.resolution='1440';c.preferences.scaleMode='responsive';c.preferences.pageZoom=1.25;c.preferences.retryCount=2",
    );
    const appearance = await root.executeJavaScript(
      "getComputedStyle(document.querySelector('.toolbar')).backgroundColor==='rgb(232, 238, 246)'&&document.querySelectorAll('[title]').length===0&&document.querySelector('.bookmark-group-name').textContent==='常用'",
    );
    const scale = root.getZoomFactor() === 1.25;
    await root.executeJavaScript(
      "window.browser.newPage(" + JSON.stringify(base + "/retry") + ")",
    );
    await wait(2500);
    c = await load();
    const created = c.session.pages.find(
        (p: any) => p?.url === base + "/retry",
      ),
      newDefaults =
        created?.pageZoom === 1.25 &&
        created.scale.width === 2560 &&
        created.scale.height === 1440 &&
        created.scale.mode === "responsive";
    const retry =
      webContents
        .getAllWebContents()
        .some(
          (x) =>
            x.getURL() === base + "/retry" &&
            x.getTitle() === "settings local page",
        ) && Date.now() - failedAt >= 1000;
    const intact =
      original.id > 0 &&
      identity === (await original.executeJavaScript("window.marker")) &&
      c.workspaces[0].snapshot.pages[0].pageZoom === 1;
    const view = w.contentView.children.find(
      (v: any) => v.webContents?.id === original.id,
    )!;
    const expected = await root.executeJavaScript(
      "(()=>{const r=document.querySelector('.web-area').getBoundingClientRect();return {x:r.x*1.25,y:r.y*1.25,width:r.width*1.25,height:r.height*1.25}})()",
    );
    const rect = view.getBounds(),
      coordinates =
        Math.abs(rect.x - expected.x) < 5 &&
        Math.abs(rect.y - expected.y) < 5 &&
        rect.width <= expected.width + 2 &&
        rect.height <= expected.height + 2;
    const point = await original.executeJavaScript(
      "(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    await original.executeJavaScript(
      "document.addEventListener('mousedown',e=>window.lastMouse={x:e.clientX,y:e.clientY,tag:e.target.tagName,trusted:e.isTrusted},true)",
    );
    original.debugger.attach("1.3");
    for (const type of ["mousePressed", "mouseReleased"])
      await original.debugger.sendCommand("Input.dispatchMouseEvent", {
        type,
        x: point.x,
        y: point.y,
        button: "left",
        clickCount: 1,
      });
    original.debugger.detach();
    await wait(150);
    const clickable = await original.executeJavaScript("window.hit===true");
    if (!clickable)
      console.log(
        "click diagnostic",
        JSON.stringify({
          zoom: original.getZoomFactor(),
          point,
          rect,
          expected,
          visible: view.getVisible(),
          focused: original.isFocused(),
          event: await original.executeJavaScript("window.lastMouse"),
        }),
      );
    await root.executeJavaScript(
      "window.browser.load().then(c=>{const r=document.querySelector('.pane[data-slot=\"0\"] .audio-toggle').getBoundingClientRect();return window.browser.showVolume(c.session.pages[0].id,{x:r.x,y:r.y,width:r.width,height:r.height})})",
    );
    await wait(150);
    const volume = BrowserWindow.getAllWindows().find(
      (x) => x.webContents.getTitle() === "窗口音量",
    )!;
    const popupAppearance =
      volume.webContents.getZoomFactor() === 1.25 &&
      Math.abs(volume.getBounds().height - 200) <= 1 &&
      (await volume.webContents.executeJavaScript(
        "getComputedStyle(document.body).backgroundColor==='rgb(232, 238, 246)'",
      ));
    await root.executeJavaScript("window.browser.hideVolume()");
    await wait(200);
    const logs = join(folder, "test-logs");
    setOperationLogger(new OperationLogger(logs, version.version));
    const oldLog = join(logs, "MultiViewBrowser_V0.2.0.0_fixture.log");
    writeFileSync(oldLog, "fixture");
    let promptCount = 0;
    (dialog as any).showMessageBoxSync = () => {
      promptCount++;
      return 1;
    };
    await session
      .fromPartition("persist:multiview")
      .cookies.set({ url: base, name: "preserved", value: "fixture" });
    const run = (id: string) =>
      root.executeJavaScript(
        "window.browser.settingsAction(" + JSON.stringify(id) + ")",
      );
    await run("clear-cache");
    const cookies = (
      await session
        .fromPartition("persist:multiview")
        .cookies.get({ url: base })
    ).some((x) => x.name === "preserved");
    await run("clear-logs");
    const cleaned = !existsSync(oldLog) && promptCount >= 2;
    const report = join(folder, "diagnostics.json");
    (dialog as any).showSaveDialog = async () => ({
      filePath: report,
      canceled: false,
    });
    await run("diagnostics");
    const text = readFileSync(report, "utf8"),
      diagnostics =
        !text.includes(base) &&
        !text.includes("startup fixture") &&
        !text.includes(folder) &&
        !text.includes("cookie") &&
        JSON.parse(text).version === "V" + version.version;
    const incoming = defaults();
    incoming.preferences.theme = "dark";
    incoming.favorites = [];
    const file = join(folder, "import.json");
    writeFileSync(file, JSON.stringify(incoming));
    (dialog as any).showOpenDialog = async () => ({
      filePaths: [file],
      canceled: false,
    });
    const beforeImport = await load();
    await root.executeJavaScript(
      "window.browser.transfer('import','favorites')",
    );
    c = await load();
    const importScope =
      c.favorites.length === 0 &&
      c.preferences.theme === "light" &&
      c.session.pages[0].id === beforeImport.session.pages[0].id &&
      c.workspaces.length === 1;
    await root.executeJavaScript(
      "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
    );
    await wait(200);
    const categories = await root.executeJavaScript(
      "document.querySelectorAll('.settings-tabs button').length===6",
    );
    try {
      writeFileSync("settings-smoke.png", (await root.capturePage()).toPNG());
    } catch {
      console.log("Screenshot unavailable; functional assertions continue");
    }
    const removedTools = await root.executeJavaScript(
      "!Array.from(document.querySelectorAll('.toolbar>button')).some(b=>['☆ 收藏夹','收藏栏','＋ 网页'].includes(b.textContent))",
    );
    await root.executeJavaScript(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='收藏栏').click()",
    );
    const switches = await root.executeJavaScript(
      "document.querySelectorAll('[role=switch]').length===2&&document.querySelectorAll('.settings-content select').length===0",
    );
    await root.executeJavaScript(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='收藏栏').click()",
    );
    const editor = await root.executeJavaScript(
      "!!document.querySelector('.side-title button')&&!document.querySelector('input[placeholder=\"搜索名称、地址、备注\"]')&&!Array.from(document.querySelectorAll('.settings-content button')).some(b=>['新建分组','☆ 收藏当前网页'].includes(b.textContent))",
    );
    await root.executeJavaScript(
      "document.querySelector('.side-title button').click()",
    );
    await wait(80);
    const groupsVisible = await root.executeJavaScript(
      "Array.from(document.querySelector('[aria-label=\"收藏分组\"]').options).some(o=>o.value==='常用')",
    );
    await root.executeJavaScript(
      "document.querySelector('.favorite-group-actions button').click()",
    );
    await wait(50);
    root.debugger.attach("1.3");
    for (const [selector, text] of [
      [".favorite-editor input", "测试收藏"],
      [".favorite-editor input[placeholder]", "http://127.0.0.1"],
      ['[aria-label="新分组名称"]', "测试新分组"],
    ]) {
      await root.executeJavaScript(
        "document.querySelector(" + JSON.stringify(selector) + ").select()",
      );
      await root.debugger.sendCommand("Input.insertText", { text });
    }
    root.debugger.detach();
    await root.executeJavaScript(
      "document.querySelector('.favorite-editor').requestSubmit()",
    );
    await wait(350);
    const afterFavorite = await load(),
      newGroupSaved =
        afterFavorite.groups.includes("测试新分组") &&
        afterFavorite.favorites.some((f: any) => f.group === "测试新分组");
    await edit(
      "c.preferences.newPageUrl=" +
        JSON.stringify(base + "/custom") +
        ";c.session.pages[1]=null",
    );
    await root.executeJavaScript(
      "document.querySelector('.pane[data-slot=\"1\"] .web-area button').click()",
    );
    await wait(450);
    const customUrl = (await load()).session.pages[1]?.url === base + "/custom";
    const savedZoom = original.getZoomFactor(),
      savedMute = original.isAudioMuted(),
      windows = BrowserWindow.getAllWindows().length;
    original.focus();
    const enter = async () => {
      await root.executeJavaScript(
        "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
      );
      await wait(120);
    };
    await enter();
    const icons = await root.executeJavaScript(
      "Array.from(document.querySelectorAll('.settings-tabs svg')).map(x=>x.dataset.icon).join(',')==='sliders-horizontal,globe,star,palette,database,info'&&Array.from(document.querySelectorAll('.settings-page svg')).every(x=>x.getAttribute('width')==='16'&&x.getAttribute('stroke-width')==='1.8')",
    );
    root.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    root.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await wait(250);
    const esc = await root.executeJavaScript(
      "!document.querySelector('.settings-page')",
    );
    const preserved =
      original.isFocused() &&
      original.getZoomFactor() === savedZoom &&
      original.isAudioMuted() === savedMute &&
      (await original.executeJavaScript("window.marker")) === identity;
    await enter();
    await root.executeJavaScript(
      "document.querySelector('.settings-back').click()",
    );
    await wait(200);
    const returned = await root.executeJavaScript(
      "!document.querySelector('.settings-page')",
    );
    const sameWindow = BrowserWindow.getAllWindows().length === windows;
    const result = {
      icons,
      esc,
      preserved,
      returned,
      sameWindow,
      removedTools,
      switches,
      editor,
      groupsVisible,
      newGroupSaved,
      customUrl,
      startup,
      appearance,
      scale,
      newDefaults,
      retry,
      intact,
      coordinates,
      clickable,
      popupAppearance,
      cookies,
      cleaned,
      diagnostics,
      importScope,
      categories,
    };
    const pass = Object.values(result).every(Boolean);
    writeFileSync(
      "settings-smoke-results.json",
      JSON.stringify({ ...result, pass }, null, 2),
    );
    console.log(JSON.stringify({ ...result, pass }));
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  } finally {
    server.close();
  }
});
