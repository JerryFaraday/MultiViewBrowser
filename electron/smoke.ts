import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/multiview-smoke");
app
  .whenReady()
  .then(async () => {
    const server = createServer((_q, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<html><body style="margin:0"><button style="position:absolute;left:900px;top:500px;width:120px;height:80px" onclick="document.title=\'clicked\'">Click</button><input id="entry" style="position:absolute;left:100px;top:100px"><script>document.cookie="shared=yes"</script></body></html>',
      );
    });
    await new Promise<void>((r) => server.listen(18765, "127.0.0.1", r));
    const w = new BrowserWindow({ width: 1250, height: 850, show: true });
    const m = new BrowserManager(w);
    const p = newPage("http://127.0.0.1:18765");
    const q = newPage(p.url);
    m.sync({
      tree: { kind: "leaf", slot: 0 },
      pages: [p, q],
      layoutId: "test",
    });
    const v = m.views.get(p.id)!,
      second = m.views.get(q.id)!;
    await Promise.all(
      [v, second].map(
        (v) =>
          new Promise<void>((r) =>
            v.webContents.isLoading()
              ? v.webContents.once("did-finish-load", () => r())
              : r(),
          ),
      ),
    );
    const results: any = { electron: process.versions.electron };
    for (const width of [960, 480]) {
      m.bounds([
        {
          id: p.id,
          rect: { x: 0, y: 0, width, height: (width * 1080) / 1920 },
          scale: p.scale,
        },
      ]);
      await new Promise((r) => setTimeout(r, 400));
      results["viewport" + width] = await v.webContents.executeJavaScript(
        "({width:innerWidth,height:innerHeight,cookie:document.cookie})",
      );
    }
    const wc = v.webContents;
    w.show();
    w.focus();
    wc.focus();
    await new Promise((r) => setTimeout(r, 600));
    results.focus = wc.isFocused();
    results.bounds = v.getBounds();
    wc.sendInputEvent({ type: "mouseMove", x: 240, y: 135 });
    wc.sendInputEvent({
      type: "mouseDown",
      x: 240,
      y: 135,
      button: "left",
      clickCount: 1,
    });
    wc.sendInputEvent({
      type: "mouseUp",
      x: 240,
      y: 135,
      button: "left",
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 200));
    results.clickTitle = wc.getTitle();
    results.geometry = await wc.executeJavaScript(
      '({rect:JSON.stringify(document.querySelector("button").getBoundingClientRect()),dpr:devicePixelRatio})',
    );
    results.sharedCookie =
      await second.webContents.executeJavaScript("document.cookie");
    results.audio = [wc.isAudioMuted(), second.webContents.isAudioMuted()];
    const original = wc.id;
    m.sync({
      tree: { kind: "leaf", slot: 0 },
      pages: [q, p],
      layoutId: "test",
    });
    results.swapPreserved = original === m.views.get(p.id)!.webContents.id;
    results.audioAfterSwap = [
      wc.isAudioMuted(),
      second.webContents.isAudioMuted(),
    ];
    results.pass =
      results.viewport960.width === 1920 &&
      results.viewport480.width === 1920 &&
      results.clickTitle === "clicked" &&
      results.swapPreserved;
    writeFileSync("smoke-results.json", JSON.stringify(results, null, 2));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(results.pass ? 0 : 1);
  })
  .catch((e) => {
    writeFileSync("smoke-results.json", String(e));
    app.exit(1);
  });
