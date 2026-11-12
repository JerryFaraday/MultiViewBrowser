import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage } from "../src/core/model";
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-interaction-smoke-" + Date.now(),
);
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: true, width: 1450, height: 950 }),
    m = new BrowserManager(w),
    pages = [0, 1].map(() => newPage("https://live.bilibili.com/1883358196"));
  m.sync({
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
  });
  const wait = (n: number) => new Promise((r) => setTimeout(r, n));
  const layout = (
    first: number,
    second: number,
    mode: "auto" | "responsive" = "auto",
  ) =>
    m.bounds(
      pages.map((p, i) => ({
        id: p.id,
        rect: {
          x: i * 700,
          y: 0,
          width: i ? second : first,
          height: ((i ? second : first) * 1080) / 1920,
        },
        scale: { ...p.scale, mode: i ? "auto" : mode },
      })),
    );
  layout(700, 350);
  await wait(18000);
  try {
    const a = m.views.get(pages[0].id)!.webContents,
      b = m.views.get(pages[1].id)!.webContents;
    const read = async (wc: Electron.WebContents) => ({
      factor: wc.getZoomFactor(),
      mode: wc.getZoomMode(),
      ...(await wc.executeJavaScript("({w:innerWidth,h:innerHeight})")),
    });
    const frame = a.mainFrame.framesInSubtree.find((f) =>
      f.url.includes("oss.5eplay.com/nesting_file/"),
    );
    if (!frame) throw Error("5E frame unavailable");
    await a.executeJavaScript("window.stateToken=Math.random()");
    const token = await a.executeJavaScript("window.stateToken");
    layout(480, 960);
    await wait(800);
    const small = await read(a),
      other = await read(b);
    layout(192, 960);
    await wait(500);
    const tiny = await read(a);
    layout(700, 960, "responsive");
    await wait(500);
    const responsive = await read(a),
      otherAfter = await read(b);
    layout(1400, 960);
    await wait(500);
    const restored = await read(a);
    const preserved =
      token === (await a.executeJavaScript("window.stateToken"));
    const pass =
      Math.abs(small.factor - 0.25) < 0.0001 &&
      Math.abs(other.factor - 0.5) < 0.0001 &&
      Math.abs(small.w - 1920) <= 2 &&
      Math.abs(small.h - 1080) <= 2 &&
      responsive.factor === 1 &&
      Math.abs(responsive.w - 700) <= 2 &&
      other.factor === otherAfter.factor &&
      Math.abs(restored.w - 1920) <= 2 &&
      preserved &&
      tiny.factor === 1 &&
      tiny.w === 1920 &&
      tiny.h === 1080;
    const result = {
      tiny,
      small,
      other,
      responsive,
      otherAfter,
      restored,
      preserved,
      pass,
    };
    writeFileSync(
      "interaction-smoke-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    m.destroy();
    w.destroy();
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
