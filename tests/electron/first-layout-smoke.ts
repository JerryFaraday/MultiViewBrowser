import { app, BrowserWindow } from "electron";
import { artifactOutputPath } from "../../scripts/test-artifacts.mjs";
import { createServer } from "node:http";
import { BrowserManager } from "../../electron/BrowserManager";
import { newPage, type Snapshot } from "../../src/core/model";
import { defaultPreferences } from "../../src/core/Preferences";
import { writeFileSync } from "node:fs";
const trace: unknown[] = [];
const start = performance.now();
const record = (event: string, data: object = {}) =>
  trace.push({ ms: Math.round(performance.now() - start), event, ...data });
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-first-layout-" + Date.now(),
);
app.whenReady().then(async () => {
  const server = createServer((_q, r) => {
    r.setHeader("Content-Type", "text/html");
    r.end(
      '<body style="margin:0;background:rgb(19,111,61)">First layout fixture</body>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  const w = new BrowserWindow({ show: true, width: 1000, height: 700 });
  w.setMenu(null);
  const m = new BrowserManager(w);
  m.setPreferences({
    ...defaultPreferences(),
    backgroundThrottling: false,
    autoFetchStashTitle: true,
  });
  m.setVolume(0);
  const p = newPage(url);
  const snap: Snapshot = {
    layoutId: "fixture",
    tree: { kind: "leaf", slot: 0 },
    pages: [p],
  };
  const item = {
    id: p.id,
    rect: { x: 10, y: 40, width: 900, height: 550 },
    scale: p.scale,
  };
  const state = () => {
    const v = m.views.get(p.id);
    return {
      id: p.id,
      slot: m.slots.get(p.id),
      exists: !!v,
      visible: v?.getVisible(),
      bounds: v?.getBounds(),
    };
  };
  record("bounds.before-sync", state());
  m.bounds([item]);
  record("bounds.received", state());
  m.sync(snap);
  record("sync.created", state());
  const v = m.views.get(p.id)!;
  v.webContents.on("dom-ready", () => record("dom-ready", state()));
  v.webContents.on("did-fail-load", (_e, code, _d, _url, main) =>
    record("load-failed", { code, main }),
  );
  const results: Record<string, boolean> = {
    firstLayout: v.getVisible() && v.getBounds().width > 0,
  };
  await new Promise<void>((resolve) =>
    v.webContents.once("did-finish-load", () => {
      record("main-load-success", state());
      resolve();
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    const bitmap = (await v.webContents.capturePage()).toBitmap();
    results.painted = bitmap.some(
      (value, index) => index % 4 === 1 && value === 111,
    );
  } catch {
    record("capture-unavailable");
  }
  // Replaying equal requests must not make native calls.
  let bounds = 0,
    visible = 0,
    emulation = 0;
  const patch = (object: any, key: string, inc: () => void) => {
    const fn = object[key].bind(object);
    object[key] = (...args: unknown[]) => {
      inc();
      return fn(...args);
    };
  };
  patch(v, "setBounds", () => bounds++);
  patch(v, "setVisible", () => visible++);
  patch(v.webContents, "enableDeviceEmulation", () => emulation++);
  for (let i = 0; i < 30; i++) {
    m.sync(snap);
    m.bounds([item]);
  }
  results.noEquivalentCalls = bounds === 0 && visible === 0 && emulation === 0;
  m.setSettingsOpen(true);
  m.bounds([item]);
  m.sync(snap);
  results.settingsHidden = !v.getVisible();
  m.bounds([]);
  m.setSettingsOpen(false);
  results.emptyLayoutHidden = !v.getVisible();
  m.bounds([item]);
  results.restore = v.getVisible();
  const identity = v.webContents.id;
  m.sync({ ...snap, pages: [] }, [p]);
  m.bounds([item]);
  results.stashHidden = !v.getVisible();
  m.sync(snap);
  results.reattached = v.getVisible() && v.webContents.id === identity;
  m.sync({ ...snap, pages: [] });
  m.bounds([item]);
  results.closedNotRecreated = !m.views.has(p.id);
  const q = newPage(url);
  m.sync({ ...snap, pages: [q] });
  const qv = m.views.get(q.id)!;
  m.bounds([{ ...item, id: q.id }]);
  results.syncFirst = qv.getVisible();
  record("complete", {
    ...results,
    nativeCalls: { bounds, visible, emulation },
  });
  writeFileSync(
    artifactOutputPath("first-layout-results.json"),
    JSON.stringify({ results, trace }, null, 2),
  );
  console.log(JSON.stringify({ results, trace }));
  m.destroy();
  w.destroy();
  server.close();
  app.exit(Object.values(results).every(Boolean) ? 0 : 1);
});
