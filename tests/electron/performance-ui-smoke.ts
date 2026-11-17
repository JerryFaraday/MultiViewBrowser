import { artifactOutputPath } from "../../scripts/test-artifacts.mjs";
import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserManager } from "../../electron/BrowserManager";
import { defaults } from "../../src/core/WorkspaceManager";
import { newPage } from "../../src/core/model";
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-performance-ui-" + Date.now(),
);
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
let manager: BrowserManager;
const original = BrowserManager.prototype.sync;
BrowserManager.prototype.sync = function (...args) {
  manager = this;
  return original.apply(this, args);
};
app.whenReady().then(async () => {
  const server = createServer((_q, r) => {
    r.setHeader("Content-Type", "text/html");
    r.end('<title>fixture</title><div style="height:4000px">test</div>');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const c = defaults();
  c.masterMuted = true;
  c.preferences.startupWindow = "normal";
  c.preferences.uiScale = 1.25;
  c.session.pages = Array.from({ length: 4 }, () => newPage(base));
  const file = join(app.getPath("userData"), "config.json");
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(file, JSON.stringify(c));
  await import("../../electron/main");
  await wait(1400);
  const w = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getTitle() === "MultiView Browser",
    )!,
    wc = w.webContents;
  wc.on("console-message", (event) => console.log("uiConsole", event.message));
  const js = (code: string) => wc.executeJavaScript(code),
    results: Record<string, boolean> = {};
  try {
    await js(
      `Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()`,
    );
    await wait(150);
    const tab = async (name: string) => {
      await js(
        `Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent===${JSON.stringify(name)}).click()`,
      );
      await wait(80);
    };
    await tab("性能");
    results.durationHidden = await js(
      `!Array.from(document.querySelectorAll('.setting-row')).some(r=>r.textContent.includes('允许自动释放的暂存时长'))`,
    );
    await js(
      `for(const label of ['允许后台网页节流','自动释放长期暂存网页的内存','自动获取新暂存网址的标题','拖动分屏线时实时调整网页'])document.querySelector('button[aria-label="'+label+'"]').click()`,
    );
    await wait(100);
    results.durationVisible = await js(
      `Array.from(document.querySelectorAll('.setting-row')).some(r=>r.textContent.includes('允许自动释放的暂存时长'))`,
    );
    await js(
      `var select=Array.from(document.querySelectorAll('.setting-row')).find(r=>r.textContent.includes('允许自动释放的暂存时长')).querySelector('select');select.value='120';select.dispatchEvent(new Event('change',{bubbles:true}))`,
    );
    await wait(50);
    await tab("音频与媒体");
    await js(
      `for(const b of document.querySelectorAll('.settings-content button[role=switch]'))b.click()`,
    );
    await wait(50);
    await tab("关于与诊断");
    await js(
      `var select=Array.from(document.querySelectorAll('.setting-row')).find(r=>r.textContent.includes('日志模式')).querySelector('select');select.value='normal';select.dispatchEvent(new Event('change',{bubbles:true}))`,
    );
    await wait(800);
    const expected = {
      backgroundThrottling: false,
      autoReleaseStash: true,
      stashReleaseMinutes: 120,
      autoFetchStashTitle: true,
      liveResize: false,
      muteOnMaximize: false,
      pauseOnMaximize: true,
      pauseInSettings: true,
      logMode: "normal",
    };
    const memory = await js("window.browser.load()"),
      disk = JSON.parse(readFileSync(file, "utf8"));
    results.settingsApplied = Object.entries(expected).every(
      ([key, value]) => memory.preferences[key] === value,
    );
    results.persisted = Object.entries(expected).every(
      ([key, value]) => disk.preferences[key] === value,
    );
    results.throttlingRuntime = [...manager!.views.values()].every(
      (v) => !v.webContents.getBackgroundThrottling(),
    );
    await tab("性能");
    await js(
      `document.querySelector('button[aria-label="自动释放长期暂存网页的内存"]').click()`,
    );
    await wait(100);
    results.hiddenRetainsDuration =
      (await js("window.browser.load()")).preferences.stashReleaseMinutes ===
      120;
    await js(`document.querySelector('.settings-back').click()`);
    await wait(600);
    w.focus();
    wc.focus();
    let bounds = 0;
    for (const v of manager!.views.values()) {
      const original = v.setBounds.bind(v);
      v.setBounds = (r) => {
        bounds++;
        original(r);
      };
    }
    let point = await js(
      `(()=>{const r=document.querySelector('.divider').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),horizontal:r.width>r.height}})()`,
    );
    const before = JSON.stringify(
      (await js("window.browser.load()")).session.tree,
    );
    const mouse = (
      type: "mouseDown" | "mouseUp" | "mouseMove",
      delta: number,
    ) =>
      (type === "mouseDown"
        ? wc
        : (w
            .getChildWindows()
            .find(
              (child) =>
                child.isVisible() &&
                child.webContents.getTitle() === "分屏线预览",
            )?.webContents ?? wc)
      ).sendInputEvent({
        type,
        x: Math.round(
          (point.x + (point.horizontal ? 0 : delta)) * wc.getZoomFactor(),
        ),
        y: Math.round(
          (point.y + (point.horizontal ? delta : 0)) * wc.getZoomFactor(),
        ),
        button: "left",
        clickCount: 1,
      });
    mouse("mouseDown", 0);
    await wait(50);
    for (let i = 1; i <= 20; i++) {
      mouse("mouseMove", i * 4);
      await wait(10);
    }
    await wait(250);
    results.previewNoBounds = bounds === 0;
    results.previewNoSave =
      JSON.stringify((await js("window.browser.load()")).session.tree) ===
      before;
    results.nativePreview = w
      .getChildWindows()
      .some(
        (child) =>
          child.isVisible() &&
          !child.isFocusable() &&
          child.webContents.getTitle() === "分屏线预览",
      );
    mouse("mouseUp", 80);
    await wait(800);
    results.finalLayout =
      bounds > 0 &&
      JSON.stringify((await js("window.browser.load()")).session.tree) !==
        before;
    results.finalDisk =
      JSON.stringify(JSON.parse(readFileSync(file, "utf8")).session.tree) ===
      JSON.stringify((await js("window.browser.load()")).session.tree);
    await js(
      "window.browser.load().then(c=>{c.preferences.liveResize=true;return window.browser.save(c)})",
    );
    wc.reload();
    await wait(600);
    point = await js(
      `(()=>{const r=document.querySelector('.divider').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),horizontal:r.width>r.height}})()`,
    );
    bounds = 0;
    const diskBefore = readFileSync(file, "utf8");
    mouse("mouseDown", 0);
    await wait(80);
    for (let i = 1; i <= 15; i++) {
      mouse("mouseMove", i * 3);
      await wait(15);
    }
    await wait(100);
    results.liveBounds = bounds > 0;
    results.liveNoDisk = readFileSync(file, "utf8") === diskBefore;
    mouse("mouseUp", 45);
    await wait(800);
    results.liveFinalDisk =
      JSON.stringify(JSON.parse(readFileSync(file, "utf8")).session.tree) ===
      JSON.stringify((await js("window.browser.load()")).session.tree);
    const pass = Object.values(results).every(Boolean);
    writeFileSync(
      artifactOutputPath("performance-ui-results.json"),
      JSON.stringify({ ...results, pass }, null, 2),
    );
    console.log(JSON.stringify({ ...results, pass }));
    server.close();
    w.destroy();
    app.exit(pass ? 0 : 1);
  } catch (error) {
    console.error(error);
    server.close();
    w.destroy();
    app.exit(1);
  }
});
