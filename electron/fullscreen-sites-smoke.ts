import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage, type Snapshot } from "../src/core/model";
import { within, until, exitHtml, focusForInput } from "./SmokeDeadline";
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-fullscreen-sites-" + Date.now(),
);
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1400, height: 900, show: true }),
    m = new BrowserManager(w);
  w.setMenu(null);
  m.setVolume(0);
  const rows: {
    site: number;
    status: "passed" | "failed" | "environment";
    stage: string;
    checks?: boolean[];
    reason?: string;
  }[] = [];
  const args = process.argv.slice(2);
  const urls = process.env.MVB_TEST_LIVE_ONLY
    ? ["https://live.bilibili.com/35", "https://live.bilibili.com/6"]
    : args.length
      ? args
      : [
          "https://www.bilibili.com/video/BV1m7WB6mEuM",
          "https://live.bilibili.com/1883358196",
          "https://www.douyu.com/1667826",
        ];
  try {
    for (const [index, url] of urls.entries()) {
      let stage = "load";
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
      try {
        console.log("site-stage", index, stage);
        await focusForInput(v.webContents);
        await until(
          "site-load",
          async () => !v.webContents.isLoadingMainFrame(),
          15000,
        );
        stage = "player-ready";
        await until(
          stage,
          () =>
            v.webContents.executeJavaScript(
              "document.querySelectorAll('video').length>0",
            ),
          6000,
        );
        let playing = false;
        try {
          await until(
            "playing-media",
            () =>
              v.webContents.executeJavaScript(
                "[...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended)",
              ),
            8000,
          );
          playing = true;
        } catch {}
        if (!playing) {
          rows.push({
            site: index,
            status: "environment",
            stage,
            reason:
              "No playing media within 8s: login, challenge, offline, or autoplay precondition",
          });
          continue;
        }
        const checks: boolean[] = [];
        for (const slot of [0, 1]) {
          stage = "slot-" + slot + "-enter";
          console.log("site-stage", index, stage);
          snap.pages = slot === 0 ? [page, null] : [null, page];
          m.sync(snap);
          layout();
          await within(
            stage,
            v.webContents.executeJavaScript(
              "void document.querySelector('video').requestFullscreen();true",
              true,
            ),
          );
          await until(stage, () =>
            v.webContents.executeJavaScript("!!document.fullscreenElement"),
          );
          await until(
            "native-role",
            async () => w.isFullScreen() === (slot === 0),
          );
          const bounds = v.getBounds();
          const size = w.getContentBounds();
          const html = await within(
            "html-size",
            v.webContents.executeJavaScript(
              "({active:!!document.fullscreenElement,width:document.fullscreenElement?.getBoundingClientRect().width,inner:innerWidth})",
            ),
          );
          checks.push(
            v.getVisible() &&
              html.active &&
              Math.abs(html.width - html.inner) < 2 &&
              (slot === 0
                ? bounds.width === size.width && bounds.height === size.height
                : bounds.width === 650 && bounds.height === 700),
          );
          stage = "slot-" + slot + "-exit";
          await exitHtml(v.webContents);
        }
        rows.push({
          site: index,
          status: checks.every(Boolean) ? "passed" : "failed",
          stage,
          checks,
        });
      } catch (error) {
        rows.push({
          site: index,
          status:
            stage === "load" || stage === "player-ready"
              ? "environment"
              : "failed",
          stage,
          reason: error instanceof Error ? error.message : "probe error",
        });
      } finally {
        await exitHtml(v.webContents).catch(() => {});
        m.sync({ ...snap, pages: [] });
      }
      console.log(JSON.stringify(rows.at(-1)));
    }
  } finally {
    const result = {
      rows,
      focusEmulation: true,
      passed: rows.filter((x) => x.status === "passed").length,
      failed: rows.filter((x) => x.status === "failed").length,
      environment: rows.filter((x) => x.status === "environment").length,
    };
    writeFileSync(
      args.length
        ? "fullscreen-more-sites-results.json"
        : "fullscreen-sites-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    m.destroy();
    w.destroy();
    app.exit(result.failed ? 1 : result.environment ? 2 : 0);
  }
});
