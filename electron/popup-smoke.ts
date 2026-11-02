import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage, type Snapshot } from "../src/core/model";
import { openInEmptySlot } from "../src/core/SlotManager";
app.setPath(
  "userData",
  app.getPath("temp") + "/multiview-popups-" + Date.now(),
);
app.whenReady().then(async () => {
  const server = createServer((_q, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end('<a target="_blank" href="/child">new page</a>');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const port = (server.address() as { port: number }).port,
      w = new BrowserWindow({ show: true }),
      source = newPage(`http://127.0.0.1:${port}/source`);
    let snapshot: Snapshot = {
      pages: [null, source, null],
      layoutId: "test",
      tree: {
        kind: "split",
        axis: "x",
        ratios: [1 / 3, 1 / 3, 1 / 3],
        children: [
          { kind: "leaf", slot: 0 },
          { kind: "leaf", slot: 1 },
          { kind: "leaf", slot: 2 },
        ],
      },
    };
    const m = new BrowserManager(w, (url) => {
      const next = openInEmptySlot(snapshot, url);
      if (next) {
        snapshot = next;
        m.sync(snapshot);
      }
    });
    m.sync(snapshot);
    await new Promise((r) => setTimeout(r, 700));
    const wc = m.views.get(source.id)!.webContents;
    await wc.executeJavaScript('document.querySelector("a").click()');
    await new Promise((r) => setTimeout(r, 300));
    const leftCurrent = wc.getURL().endsWith("/child") && m.views.size === 1;
    await wc.executeJavaScript('window.open("/script")');
    await new Promise((r) => setTimeout(r, 300));
    const scriptCurrent = wc.getURL().endsWith("/script") && m.views.size === 1;
    const middle = async () => {
      m.bounds([
        {
          id: source.id,
          rect: { x: 0, y: 0, width: 600, height: 400 },
          scale: { ...source.scale, mode: "responsive" },
        },
      ]);
      w.focus();
      wc.focus();
      await new Promise((r) => setTimeout(r, 200));
      wc.sendInputEvent({
        type: "mouseDown",
        button: "middle",
        x: 30,
        y: 15,
        clickCount: 1,
      });
      wc.sendInputEvent({
        type: "mouseUp",
        button: "middle",
        x: 30,
        y: 15,
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 350));
    };
    await middle();
    const afterFirst = snapshot.pages.map((p) => p?.url ?? null);
    await middle();
    const beforeFull = JSON.stringify(snapshot);
    await middle();
    const results = {
      leftCurrent,
      scriptCurrent,
      afterFirst,
      afterSecond: snapshot.pages.map((p) => p?.url ?? null),
      fullIgnored: beforeFull === JSON.stringify(snapshot),
      sourcePreserved: wc.getURL().endsWith("/script"),
      pass:
        leftCurrent &&
        scriptCurrent &&
        !!afterFirst[0] &&
        afterFirst[2] === null &&
        !!snapshot.pages[2] &&
        beforeFull === JSON.stringify(snapshot) &&
        wc.getURL().endsWith("/script"),
    };
    writeFileSync("popup-smoke-results.json", JSON.stringify(results, null, 2));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(results.pass ? 0 : 1);
  } catch (e) {
    writeFileSync("popup-smoke-results.json", String(e));
    server.close();
    app.exit(1);
  }
});
