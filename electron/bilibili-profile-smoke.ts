import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage, type Snapshot } from "../src/core/model";
import { openInEmptySlot } from "../src/core/SlotManager";
app.setPath("userData", app.getPath("temp") + "/mvb-profile-" + Date.now());
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1400, height: 900 });
  const page = newPage("https://live.bilibili.com/21516508");
  page.scale.mode = "responsive";
  let snapshot: Snapshot = {
      layoutId: "test",
      tree: {
        kind: "split",
        axis: "x",
        ratios: [1 / 3, 1 / 3, 1 / 3],
        children: [0, 1, 2].map((slot) => ({ kind: "leaf" as const, slot })),
      },
      pages: [page, null, null],
    },
    ignored = 0;
  const m = new BrowserManager(w, (url) => {
    const next = openInEmptySlot(snapshot, url);
    if (!next) {
      ignored++;
      return;
    }
    snapshot = next;
    m.sync(snapshot);
  });
  try {
    m.sync(snapshot);
    const wc = m.views.get(page.id)!.webContents;
    await new Promise((r) => setTimeout(r, 15000));
    await wc.executeJavaScript("window.profileMarker=Math.random()");
    const marker = await wc.executeJavaScript("window.profileMarker");
    const source = wc.getURL();
    let navigations = 0;
    wc.on("did-navigate", () => navigations++);
    for (const selector of [
      ".initiator-name",
      ".initiator-avatar",
      ".initiator-name",
    ]) {
      await wc.executeJavaScript(
        "(()=>{const el=document.querySelector(" +
          JSON.stringify(selector) +
          ');if(!el)throw Error("profile control unavailable");el.click()})()',
        true,
      );
      await new Promise((r) => setTimeout(r, 1200));
    }
    const result = {
      opened: snapshot.pages.filter(Boolean).length - 1,
      profiles: snapshot.pages
        .slice(1)
        .every((p) => !!p && new URL(p.url).hostname === "space.bilibili.com"),
      ignored,
      sourcePreserved: wc.getURL() === source,
      navigations,
      statePreserved:
        marker === (await wc.executeJavaScript("window.profileMarker")),
    };
    const pass =
      result.opened === 2 &&
      result.profiles &&
      ignored === 1 &&
      result.sourcePreserved &&
      navigations === 0 &&
      result.statePreserved;
    writeFileSync(
      "bilibili-profile-smoke-results.json",
      JSON.stringify({ ...result, pass }, null, 2),
    );
    console.log(JSON.stringify({ ...result, pass }));
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
