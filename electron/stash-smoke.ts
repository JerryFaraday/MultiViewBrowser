import { app, BrowserWindow, webContents } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/mvb-stash-" + Date.now());
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
const server = createServer((q, r) => {
  r.setHeader("Content-Type", "text/html; charset=utf-8");
  r.end(
    q.url === "/untitled"
      ? "<body>无标题</body>"
      : q.url === "/target"
        ? "<title>测试页面名称</title>"
        : '<title>源页面</title><a style="position:fixed;left:10px;top:10px;width:250px;height:40px" href="/target">中键新页面</a>',
  );
});
server.listen(0, "127.0.0.1", async () => {
  const port = (server.address() as any).port;
  const seed = defaults();
  seed.bookmarksBar = true;
  seed.session.tree = { kind: "leaf", slot: 0 };
  seed.session.pages = [newPage("http://127.0.0.1:" + port)];
  seed.session.pages[0]!.scale.mode = "responsive";
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(seed));
  await import("./main");
  await app.whenReady();
  await wait(2200);
  try {
    const w = BrowserWindow.getAllWindows().find(
      (x) => x.webContents.getTitle() === "MultiView Browser",
    )!;
    const root = w.webContents;
    const page = webContents
      .getAllWebContents()
      .find((x) => x.getURL() === "http://127.0.0.1:" + port + "/")!;
    const load = () => root.executeJavaScript("window.browser.load()");
    const middle = async () => {
      // Exercise the authenticated middle-link request route; OS input is a separate check.
      const url = await page.executeJavaScript(
        "document.querySelector('a').href",
      );
      page.ipc.emit(
        "open-middle-link",
        { sender: page, senderFrame: page.mainFrame },
        url,
      );
      await wait(1000);
    };
    await middle();
    await middle();
    let c = await load();
    console.log(
      "stash count",
      c.pageStash.length,
      "pages",
      c.session.pages.length,
    );
    const multiple = c.pageStash.length === 2;
    const titles = c.pageStash.every((x: any) => x.title === "测试页面名称");
    const original = page.getURL() === "http://127.0.0.1:" + port + "/";
    await page.executeJavaScript(
      "document.querySelector('a').href='/untitled'",
    );
    await middle();
    c = await load();
    const fallback =
      c.pageStash.length === 3 && c.pageStash[2].title === c.pageStash[2].url;
    const show = async () => {
      await root.executeJavaScript(
        `(()=>{const r=document.querySelector('.page-stash').getBoundingClientRect();return window.browser.showStash({x:r.x,y:r.y,width:r.width,height:r.height})})()`,
      );
      await wait(150);
    };
    await show();
    const popup = BrowserWindow.getAllWindows().find(
      (x) => x.webContents.getTitle() === "页面暂存区",
    )!;
    const labels = await popup.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('#list button')).map(b=>b.textContent)`,
    );
    await popup.webContents.executeJavaScript(
      `document.querySelector('#list button').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await wait(200);
    const fullKeeps = (await load()).pageStash.length === 3;
    await root.executeJavaScript(
      `window.browser.load().then(c=>{c.session.pages[0]=null;return window.browser.save(c)})`,
    );
    await wait(300);
    await popup.webContents.executeJavaScript(
      `document.querySelector('#list button').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await wait(400);
    c = await load();
    const opened =
      c.pageStash.length === 2 && c.session.pages[0]?.url.endsWith("/target");
    const result = {
      multiple,
      titles,
      original,
      fallback,
      labels: labels.slice(0, 2).every((x: string) => x === "测试页面名称"),
      fullKeeps,
      opened,
    };
    const pass = Object.values(result).every(Boolean);
    writeFileSync(
      "stash-smoke-results.json",
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
