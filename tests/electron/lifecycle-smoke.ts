import { artifactOutputPath } from "../../scripts/lib/test-artifacts.mjs";
import { app, BrowserWindow, webContents } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "../../electron/BrowserManager";
import { defaults } from "../../src/core/WorkspaceManager";
import { newPage } from "../../src/core/model";
import { until } from "./SmokeDeadline";
app.setPath("userData", app.getPath("temp") + "/mvb-lifecycle-" + Date.now());
app.whenReady().then(async () => {
  const server = createServer((_q, r) => r.end("<p>static</p>"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const w = new BrowserWindow({ show: true }),
    m = new BrowserManager(w),
    c = defaults();
  const cycles = [];
  const initialContents = webContents.getAllWebContents().length;
  try {
    m.setPreferences({
      ...c.preferences,
      autoReleaseStash: true,
      stashReleaseMinutes: 30,
    });
    for (let i = 0; i < 5; i++) {
      const p = newPage(
        "http://127.0.0.1:" + (server.address() as { port: number }).port,
      );
      p.pageZoom = 1.5;
      p.volume = 75;
      m.sync(c.session, [{ ...p, parkedAt: Date.now() - 3600000 }]);
      await until("native-release", async () => !m.views.has(p.id), 3000);
      m.sync(c.session, []);
      const clean = [
        m.views,
        m.slots,
        m.muted,
        m.pageVolumes,
        m.pageZooms,
        m.requested,
      ].every((x) => x.size === 0);
      c.session.pages = [p];
      m.sync(c.session);
      m.setVolume(100);
      const restored =
        m.views.has(p.id) &&
        m.pageZooms.get(p.id) === 1.5 &&
        m.pageVolumes.get(p.id) === 75;
      c.session.pages = [];
      m.sync(c.session, []);
      await until(
        "contents-retired",
        async () => webContents.getAllWebContents().length === initialContents,
      );
      const instancesClean =
        webContents.getAllWebContents().length === initialContents;
      cycles.push({ clean, restored, instancesClean });
    }
    const pass = cycles.every((x) => x.clean && x.restored && x.instancesClean);
    writeFileSync(
      artifactOutputPath("lifecycle-smoke-results.json"),
      JSON.stringify({ cycles, pass }, null, 2),
    );
    console.log(JSON.stringify({ cycles, pass }));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(pass ? 0 : 1);
  } catch (error) {
    console.error(error);
    m.destroy();
    w.destroy();
    server.close();
    app.exit(1);
  }
});
