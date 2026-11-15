import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage, type Snapshot } from "../src/core/model";
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-fullscreen-sites-" + Date.now(),
);
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1400, height: 900, show: true }),
    m = new BrowserManager(w);
  w.setMenu(null);
  m.setVolume(0);
  const rows = [];
  const urls = process.env.MVB_TEST_LIVE_ONLY
    ? ["https://live.bilibili.com/35", "https://live.bilibili.com/6"]
    : process.argv.slice(2);
  for (const url of urls.length
    ? urls
    : [
        "https://www.bilibili.com/video/BV1m7WB6mEuM",
        "https://live.bilibili.com/1883358196",
        "https://www.douyu.com/1667826",
      ]) {
    const page = newPage(url),
      snap: Snapshot = {
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
        pages: [page, null],
      };
    m.sync(snap);
    const v = m.views.get(page.id)!;
    const layout = () =>
      m.bounds(
        snap.pages.flatMap((p, i) =>
          p
            ? [
                {
                  id: p.id,
                  rect: { x: i * 650, y: 50, width: 650, height: 700 },
                  scale: p.scale,
                },
              ]
            : [],
        ),
      );
    layout();
    await Promise.race([
      new Promise<void>((r) =>
        v.webContents.once("did-finish-load", () => r()),
      ),
      wait(25000),
    ]);
    await wait(3500);
    try {
      const info = await v.webContents.executeJavaScript(
        '({video:document.querySelectorAll("video").length,playing:[...document.querySelectorAll("video")].some(v=>!v.paused&&!v.ended),frames:document.querySelectorAll("iframe").length})',
      );
      const states = [];
      for (const slot of [0, 1]) {
        snap.pages = slot === 0 ? [page, null] : [null, page];
        m.sync(snap);
        layout();
        w.focus();
        v.webContents.focus();
        await wait(150);
        await v.webContents.executeJavaScript(
          'void (document.querySelector("video")||document.querySelector("[id*=player]" )||document.body).requestFullscreen().catch(()=>{})',
          true,
        );
        await wait(500);
        states.push({
          slot,
          windowFullscreen: w.isFullScreen(),
          visible: v.getVisible(),
          bounds: v.getBounds(),
          html: await v.webContents.executeJavaScript(
            '({active:!!document.fullscreenElement,width:document.fullscreenElement?.getBoundingClientRect().width,inner:innerWidth,videoPlaying:[...document.querySelectorAll("video")].some(v=>!v.paused&&!v.ended)})',
          ),
        });
        await v.webContents.executeJavaScript(
          "document.fullscreenElement&&document.exitFullscreen()",
        );
        await wait(300);
      }
      rows.push({ url, info, states, muted: v.webContents.isAudioMuted() });
      console.log(JSON.stringify(rows.at(-1)));
    } catch {
      rows.push({ url, error: "probe-failed" });
      console.log(JSON.stringify(rows.at(-1)));
    }
  }
  writeFileSync(
    urls.length
      ? "fullscreen-more-sites-results.json"
      : "fullscreen-sites-results.json",
    JSON.stringify(rows, null, 2),
  );
  m.destroy();
  w.destroy();
  app.exit(0);
});
