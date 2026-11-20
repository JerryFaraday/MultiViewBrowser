import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaults } from "../../src/core/WorkspaceManager";
import { newPage } from "../../src/core/model";
import { BrowserManager } from "../../electron/BrowserManager";
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
app.setPath("userData", app.getPath("temp") + "/mvb-shortcuts-" + Date.now());
let manager: BrowserManager;
const original = BrowserManager.prototype.sync;
BrowserManager.prototype.sync = function (...args) {
  manager = this;
  return original.apply(this, args);
};
const server = createServer((_q, r) => {
  r.setHeader("Content-Type", "text/html");
  r.end(
    '<body>needle needle<input value="editing"><script>window.identity=Math.random()</script>',
  );
});
server.listen(0, "127.0.0.1", async () => {
  const url = "http://127.0.0.1:" + (server.address() as any).port,
    c = defaults();
  c.masterMuted = true;
  c.preferences.startupWindow = "normal";
  c.session.tree = {
    kind: "split",
    axis: "x",
    ratios: [0.5, 0.5],
    children: [
      { kind: "leaf", slot: 0 },
      { kind: "leaf", slot: 1 },
    ],
  };
  c.session.pages = [newPage(url + "/a"), newPage(url + "/b")];
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(
    join(app.getPath("userData"), "config.json"),
    JSON.stringify(c),
  );
  await import("../../electron/main");
  await app.whenReady();
  await wait(1300);
  const w = BrowserWindow.getAllWindows().find(
      (x) => x.webContents.getTitle() === "MultiView Browser",
    )!,
    root = w.webContents;
  const a = manager!.views.get(c.session.pages[0]!.id)!,
    b = manager!.views.get(c.session.pages[1]!.id)!;
  const js = (code: string) => root.executeJavaScript(code),
    key = async (
      wc: Electron.WebContents,
      keyCode: string,
      modifiers: Electron.KeyboardInputEvent["modifiers"] = [],
    ) => {
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
      await wait(180);
    };
  const results: Record<string, boolean> = {};
  try {
    w.focus();
    b.webContents.focus();
    await wait(100);
    const beforeA = await a.webContents.executeJavaScript("window.identity"),
      beforeB = await b.webContents.executeJavaScript("window.identity");
    await key(b.webContents, "F5");
    results.focusedReload =
      beforeB !== (await b.webContents.executeJavaScript("window.identity")) &&
      beforeA === (await a.webContents.executeJavaScript("window.identity"));
    let hardReloads = 0;
    const reloadHard = b.webContents.reloadIgnoringCache.bind(b.webContents);
    b.webContents.reloadIgnoringCache = () => {
      hardReloads++;
      reloadHard();
    };
    await key(b.webContents, "r", ["control", "shift"]);
    results.hardReload = hardReloads === 1;
    await js(
      `window.browser.navigate(${JSON.stringify(c.session.pages[1]!.id)},"navigate",${JSON.stringify(url + "/second")})`,
    );
    await wait(600);
    b.webContents.focus();
    await key(b.webContents, "Left", ["alt"]);
    await wait(400);
    results.back = b.webContents.getURL().endsWith("/b");
    await key(b.webContents, "Right", ["alt"]);
    await wait(400);
    results.forward = b.webContents.getURL().endsWith("/second");
    await b.webContents.executeJavaScript(
      'document.querySelector("input").focus()',
    );
    b.webContents.focus();
    await wait(100);
    await key(b.webContents, "a", ["control"]);
    b.webContents.selectAll();
    results.editingCommand = await b.webContents.executeJavaScript(
      "document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===7",
    );
    await key(b.webContents, "l", ["control"]);
    results.address = await js(
      `document.activeElement?.name==='url'&&document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length`,
    );
    b.webContents.focus();
    await key(b.webContents, "f", ["control"]);
    await wait(150);
    const find = w
      .getChildWindows()
      .find((x) => x.webContents.getTitle() === "网页查找")!;
    find.webContents.insertText("needle");
    await wait(250);
    results.find = await find.webContents.executeJavaScript(
      'document.querySelector("output").textContent.endsWith("/2")',
    );
    await key(find.webContents, "Escape");
    results.findClosed = !find.isVisible();
    await js(
      `document.querySelector('.pane[data-slot="0"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`,
    );
    root.focus();
    const idA = await a.webContents.executeJavaScript("window.identity");
    await key(root, "r", ["control"]);
    results.toolbarReload =
      idA !== (await a.webContents.executeJavaScript("window.identity"));
    await js(
      `Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()`,
    );
    await wait(100);
    const idB = await b.webContents.executeJavaScript("window.identity");
    await key(root, "F5");
    results.settingsProtected =
      idB === (await b.webContents.executeJavaScript("window.identity"));
    await key(root, "Escape");
    await js("window.browser.load().then(c=>window.browser.exchange(c,1,0))");
    await wait(200);
    await key(b.webContents, "f", ["control"]);
    await wait(100);
    const rect = b.getBounds(),
      origin = w.getContentBounds();
    results.findFollowsExchange =
      Math.abs(
        find.getBounds().x -
          (origin.x + rect.x + rect.width - find.getBounds().width),
      ) < 2;
    const old = await b.webContents.executeJavaScript("window.identity");
    await key(b.webContents, "F5");
    results.exchangeTarget =
      old !== (await b.webContents.executeJavaScript("window.identity"));
    console.log(JSON.stringify(results));
    server.close();
    w.destroy();
    app.exit(Object.values(results).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.error(error);
    server.close();
    w.destroy();
    app.exit(1);
  }
});
