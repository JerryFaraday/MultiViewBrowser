import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage, type Snapshot } from "../src/core/model";
import { swapPages } from "../src/core/AudioManager";
app.setPath("userData", app.getPath("temp") + "/mvb-pagezoom-" + Date.now());
app.whenReady().then(async () => {
  const server = createServer((q, r) => {
    r.setHeader("Content-Type", "text/html");
    r.end(
      q.url === "/frame"
        ? '<button onclick="window.clicked=event.isTrusted">iframe button</button>'
        : '<input value="retained"><canvas width="80" height="80"></canvas><iframe src="/frame"></iframe><script>window.marker=Math.random();document.querySelector("canvas").onclick=e=>window.canvasClicked=e.isTrusted;</script>',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const pages = [0, 1].map(() => newPage("http://127.0.0.1:" + port));
  pages.forEach((p) => (p.scale.mode = "responsive"));
  let snap: Snapshot = {
    layoutId: "test",
    tree: {
      kind: "split",
      axis: "x",
      ratios: [0.5, 0.5],
      children: [
        { kind: "leaf", slot: 0 },
        { kind: "leaf", slot: 1 },
      ],
    },
    pages,
  };
  const w = new BrowserWindow({ show: true, width: 1200, height: 700 });
  const m = new BrowserManager(
    w,
    () => {},
    () => {},
    (id, value) => {
      snap.pages.find((p) => p?.id === id)!.pageZoom = value;
    },
  );
  m.sync(snap);
  const layout = () =>
    m.bounds(
      snap.pages.flatMap((p, i) =>
        p
          ? [
              {
                id: p.id,
                rect: { x: i * 550, y: 0, width: 550, height: 580 },
                scale: p.scale,
              },
            ]
          : [],
      ),
    );
  layout();
  const wait = (n: number) => new Promise((r) => setTimeout(r, n));
  await wait(800);
  try {
    const a = m.views.get(pages[0].id)!,
      b = m.views.get(pages[1].id)!;
    const marker = await a.webContents.executeJavaScript("window.marker");
    const bounds = JSON.stringify([a.getBounds(), b.getBounds()]);
    const initiallyHidden = w
      .getChildWindows()
      .every((child) => !child.isVisible());
    const feedback = () =>
      w.getChildWindows().filter((child) => !child.isDestroyed());
    const label = (child: BrowserWindow) =>
      child.webContents.executeJavaScript(
        "document.getElementById('zoom').textContent",
      );
    const key = async (wc: Electron.WebContents, keyCode: string) => {
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers: ["control"] });
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers: ["control"] });
      await wait(100);
    };
    w.focus();
    a.webContents.focus();
    await key(a.webContents, "+");
    const keyboard =
      a.webContents.getZoomFactor() === 1.1 &&
      b.webContents.getZoomFactor() === 1;
    const aFeedback = feedback().find((child) => child.isVisible())!;
    const actualPercentage =
      (await label(aFeedback)) ===
      Math.round(a.webContents.getZoomFactor() * 100) + "%";
    const focusPreserved =
      a.webContents.isFocused() && !aFeedback.isFocusable();
    await wait(1100);
    // The wheel request is delivered to b while a retains keyboard focus.
    b.webContents.emit("zoom-changed", { preventDefault() {} }, "in");
    await wait(100);
    const wheelRequest =
      b.webContents.getZoomFactor() > 1 &&
      a.webContents.getZoomFactor() === 1.1;
    const bFeedback = feedback().find((child) => child.id !== aFeedback.id)!;
    await wait(1100);
    const independentTimeout = !aFeedback.isVisible() && bFeedback.isVisible();
    await wait(1150);
    const dismissed = !bFeedback.isVisible();
    const zoomContainerStable =
      JSON.stringify([a.getBounds(), b.getBounds()]) === bounds;
    await key(a.webContents, "-");
    const minus = a.webContents.getZoomFactor() === 1;
    await key(a.webContents, "+");
    snap.pages = swapPages(snap.pages, 0, 1);
    m.sync(snap);
    layout();
    const exchanged =
      a.webContents.getZoomFactor() === 1.1 && snap.pages[1]?.pageZoom === 1.1;
    const origin = w.getContentBounds();
    const followsExchange =
      aFeedback.getBounds().x === origin.x + a.getBounds().x + 550 - 80 - 10;
    const unchanged =
      JSON.stringify([a.getBounds(), b.getBounds()]) !== bounds &&
      a.getBounds().width === 550 &&
      b.getBounds().width === 550;
    await key(a.webContents, "0");
    const reset = a.webContents.getZoomFactor() === 1;
    const resetFeedback =
      aFeedback.isVisible() && (await label(aFeedback)) === "100%";
    for (let i = 0; i < 30; i++) m.changePageZoom(pages[0].id, "in");
    const max = Math.abs(a.webContents.getZoomFactor() - 5) < 0.0001;
    for (let i = 0; i < 40; i++) m.changePageZoom(pages[0].id, "out");
    const min = Math.abs(a.webContents.getZoomFactor() - 0.25) < 0.0001;
    await key(a.webContents, "0");
    m.changePageZoom(pages[0].id, "in");
    const points = await a.webContents.executeJavaScript(
      `(()=>{const c=document.querySelector('canvas').getBoundingClientRect(),f=document.querySelector('iframe'),r=f.getBoundingClientRect(),b=f.contentDocument.querySelector('button').getBoundingClientRect();return [{x:c.x+c.width/2,y:c.y+c.height/2},{x:r.x+f.clientLeft+b.x+b.width/2,y:r.y+f.clientTop+b.y+b.height/2}]})()`,
    );
    for (const point of points) {
      for (const type of ["mouseMove", "mouseDown", "mouseUp"])
        a.webContents.sendInputEvent({
          type: type as any,
          x: Math.round(point.x * a.webContents.getZoomFactor()),
          y: Math.round(point.y * a.webContents.getZoomFactor()),
          button: "left",
          clickCount: 1,
        });
      await wait(100);
    }
    const interaction = await a.webContents.executeJavaScript(
      'window.canvasClicked&&document.querySelector("iframe").contentWindow.clicked',
    );
    const preserved =
      marker === (await a.webContents.executeJavaScript("window.marker"));
    const result = {
      initiallyHidden,
      actualPercentage,
      focusPreserved,
      independentTimeout,
      dismissed,
      followsExchange,
      resetFeedback,
      keyboard,
      wheelRequest,
      zoomContainerStable,
      minus,
      exchanged,
      unchanged,
      reset,
      max,
      min,
      interaction,
      preserved,
    };
    const pass = Object.values(result).every(Boolean);
    writeFileSync(
      "page-zoom-smoke-results.json",
      JSON.stringify({ ...result, pass }, null, 2),
    );
    console.log(JSON.stringify({ ...result, pass }));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
