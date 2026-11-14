import { app, BrowserWindow, screen, webContents } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/mvb-hover-smoke-" + Date.now());
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
const server = createServer((_q, r) =>
  r.end(
    "<title>Local popup fixture</title><script>window.marker=Math.random()</script>",
  ),
);
server.listen(0, "127.0.0.1", async () => {
  const c = defaults(),
    base = "http://127.0.0.1:" + (server.address() as any).port;
  c.masterMuted = true;
  c.bookmarksBar = true;
  c.session.pages = [
    newPage(base + "/0"),
    newPage(base + "/1"),
    newPage(base + "/2"),
  ];
  if (process.env.MVB_HOVER_STASH === "1")
    c.pageStash = [
      { id: "fixture", url: base + "/parked", title: "Local parked page" },
    ];
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
  await import("./main");
  await app.whenReady();
  await wait(1400);
  const parent = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getTitle() === "MultiView Browser",
    )!,
    root = parent.webContents;
  root.setBackgroundThrottling(false);
  root.debugger.attach("1.3");
  // Synthetic renderer events do not move the OS pointer. Model that independent
  // native input explicitly; actual taskbar/Peek input needs a separate manual run.
  const readCursor = screen.getCursorScreenPoint;
  let cursor = { x: -100000, y: -100000 };
  screen.getCursorScreenPoint = () => cursor;
  const results: any[] = [];
  const popup = (kind: string) =>
    BrowserWindow.getAllWindows().find(
      (w) =>
        w.webContents.getTitle() ===
        (kind === "scale" ? "网页缩放" : "页面暂存区"),
    );
  const close = async () => {
    await root.executeJavaScript(
      "Promise.all([window.browser.hideScale(),window.browser.hideStash()])",
    );
    await wait(220);
  };
  const button = (kind: string, slot = 0) =>
    kind === "scale"
      ? `.pane[data-slot="${slot}"] button[title="缩放设置"]`
      : ".page-stash";
  const anchor = async (kind: string, slot = 0) => {
    const r = await root.executeJavaScript(
      `(()=>{const r=document.querySelector('${button(kind, slot)}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    const z = root.getZoomFactor(),
      o = parent.getContentBounds();
    cursor = {
      x: o.x + (r.x + r.width / 2) * z,
      y: o.y + (r.y + r.height / 2) * z,
    };
    return r;
  };
  const request = async (kind: string, slot = 0, click = false) => {
    await root.executeJavaScript(
      `document.querySelector('${button(kind, slot)}').${click ? "click()" : "dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:document.body}))"}`,
    );
    await wait(100);
  };
  const other = new BrowserWindow({ show: false, width: 400, height: 200 });
  try {
    parent.focus();
    root.focus();
    await wait(50);
    const before = webContents
      .getAllWebContents()
      .filter((w) => w.getURL().startsWith(base))
      .map((w) => w.id);
    for (const [zoom, width, height, dpi] of [
      [0.9, 1000, 700, 1],
      [1, 1600, 900, 1.5],
      [1.25, 2200, 1200, 2],
    ]) {
      parent.unmaximize();
      parent.setPosition(0, 0);
      parent.setContentSize(width, height);
      await root.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: dpi,
        mobile: false,
      });
      root.setZoomFactor(zoom);
      await wait(80);
      for (const kind of ["scale", "stash"]) {
        await close();
        parent.focus();
        root.focus();
        await wait(30);
        await anchor(kind);
        cursor = {
          x: parent.getBounds().x + 40,
          y: screen.getPrimaryDisplay().workArea.height + 10,
        };
        await request(kind);
        const outside = !popup(kind)?.isVisible();
        other.show();
        other.focus();
        await wait(50);
        await anchor(kind);
        await request(kind);
        const inactive = !popup(kind)?.isVisible();
        other.hide();
        parent.focus();
        root.focus();
        await wait(50);
        await anchor(kind);
        await request(kind, 0, true);
        const click = !!popup(kind)?.isVisible();
        popup(kind)!.focus();
        await wait(50);
        const controls = !!popup(kind)?.isVisible();
        other.show();
        other.focus();
        await wait(50);
        const dismissed = !popup(kind)?.isVisible();
        other.hide();
        parent.focus();
        root.focus();
        await wait(50);
        const noReopen = !popup(kind)?.isVisible();
        await close();
        parent.minimize();
        await wait(50);
        await request(kind);
        const minimized = !popup(kind)?.isVisible();
        parent.restore();
        parent.focus();
        root.focus();
        await wait(80);
        const restored = !popup(kind)?.isVisible();
        await anchor(kind);
        await request(kind);
        const hover = !!popup(kind)?.isVisible();
        await close();
        results.push({
          zoom,
          width,
          height,
          dpi,
          kind,
          outside,
          inactive,
          click,
          controls,
          dismissed,
          noReopen,
          minimized,
          restored,
          hover,
          pass:
            outside &&
            inactive &&
            click &&
            controls &&
            dismissed &&
            noReopen &&
            minimized &&
            restored &&
            hover,
        });
      }
      for (const slot of [0, 1, 2]) {
        parent.focus();
        root.focus();
        await anchor("scale", slot);
        await request("scale", slot, true);
        const state = await popup("scale")!.webContents.executeJavaScript(
          "document.querySelector('#heading').textContent",
        );
        results.push({
          zoom,
          slot,
          target: state,
          pass:
            state ===
            (slot === 0 ? "主窗口" : slot + 1 + "号窗口") + " · 网页缩放",
        });
        await close();
      }
    }
    const after = webContents
      .getAllWebContents()
      .filter((w) => w.getURL().startsWith(base))
      .map((w) => w.id);
    const preserved = JSON.stringify(before) === JSON.stringify(after);
    const pass = results.every((r) => r.pass) && preserved;
    writeFileSync(
      process.env.MVB_HOVER_STASH === "1"
        ? "popup-hover-full-diagnostic.json"
        : "popup-hover-diagnostic.json",
      JSON.stringify({ results, preserved, pass }, null, 2),
    );
    console.log(
      JSON.stringify({
        cases: results.length,
        failed: results.filter((r) => !r.pass),
        preserved,
        pass,
      }),
    );
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(
      "Popup hover smoke failed",
      e instanceof Error ? e.message : "unknown",
    );
    app.exit(1);
  } finally {
    screen.getCursorScreenPoint = readCursor;
    server.close();
  }
});
