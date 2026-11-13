import { parkPage, placeStashed } from "../src/core/PageStash";
import version from "../version.json";
import { PageStash } from "./PageStash";
import {
  OperationLogger,
  setOperationLogger,
  logOperation,
  finishOperationLog,
} from "./OperationLogger";
import { logConfigChanges } from "./config-log";
import { VolumePopup } from "./VolumePopup";
import { ScalePopup } from "./ScalePopup";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { ConfigStore, validateConfig } from "./storage";
import { BrowserManager } from "./BrowserManager";
import { openInEmptySlot } from "../src/core/SlotManager";
import { DragOverlay } from "./DragOverlay";
import { swapPages, setPageVolume } from "../src/core/AudioManager";
import { sanitizeOperation } from "../src/core/OperationLog";
import { normalizeUrl } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
// Preserve the previous packaged profile after changing productName.
if (
  app.isPackaged &&
  app.getPath("userData") === join(app.getPath("appData"), "MultiView Browser")
)
  app.setPath("userData", join(app.getPath("appData"), "MultiViewBrowser"));
let window: BrowserWindow, manager: BrowserManager, store: ConfigStore;
app.whenReady().then(async () => {
  const exeDir = dirname(app.getPath("exe")),
    project = resolve(exeDir, "../..");
  let logFolder = !app.isPackaged
    ? resolve(__dirname, "../logs")
    : join(exeDir, "logs");
  if (app.isPackaged && existsSync(join(project, "package.json")))
    try {
      if (
        JSON.parse(readFileSync(join(project, "package.json"), "utf8")).name ===
        "multiview-browser"
      )
        logFolder = join(project, "logs");
    } catch {}
  try {
    setOperationLogger(new OperationLogger(logFolder, version.version));
  } catch {
    try {
      setOperationLogger(
        new OperationLogger(
          join(app.getPath("userData"), "logs"),
          version.version,
        ),
      );
    } catch {
      console.warn("Operation logging unavailable");
    }
  }
  logOperation("app.ready");
  store = new ConfigStore(app.getPath("userData"));
  window = new BrowserWindow({
    show: false,
    width: 1500,
    height: 950,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#10141d",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.setMenu(null);
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.control && !input.alt && !input.meta) {
      const direction = ["+", "="].includes(input.key)
        ? "in"
        : input.key === "-"
          ? "out"
          : input.key === "0"
            ? "reset"
            : undefined;
      if (direction) {
        event.preventDefault();
        window.webContents.send("page-zoom-shortcut", direction);
        return;
      }
    }
    if (input.key === "F11") {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (input.key === "Escape" && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
    }
  });
  function openRequested(url: string) {
    const c = store.load();
    const updated = openInEmptySlot(c.session, url);
    if (!updated) {
      if (c.pageStash.length >= 5000) return;
      const item = { id: crypto.randomUUID(), url, title: url };
      c.pageStash.push(item);
      logOperation("ui.change", {
        action: "stash.add",
        count: c.pageStash.length,
      });
      store.save(c);
      window.webContents.send("session-update", c.session, c);
      stash.refresh();
      stash.resolveTitle(item.id);
      return;
    }
    c.session = updated;
    store.save(c);
    manager.sync(
      c.session,
      c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
    );
    manager.setVolume(c.masterMuted ? 0 : c.masterVolume);
    window.webContents.send("session-update", c.session, c);
  }
  manager = new BrowserManager(
    window,
    openRequested,
    (id, value) => updatePageVolume(id, value, false),
    (id, value) => {
      const c = store.load(),
        page = c.session.pages.find((p) => p?.id === id);
      if (!page) return;
      page.pageZoom = value;
      store.save(c);
      logOperation("ui.change", {
        action: "page.scale",
        slot: c.session.pages.findIndex((p) => p?.id === id),
        value: Math.round(value * 100),
      });
      window.webContents.send("session-update", c.session, c);
    },
  );
  function updatePageVolume(
    id: string,
    value: import("../src/core/model").Page["volume"],
    userInitiated = true,
  ) {
    const c = store.load();
    logOperation("audio.page_change", {
      slot: c.session.pages.findIndex((p) => p?.id === id),
      value,
    });
    const p = c.session.pages.find((p) => p?.id === id);
    if (!p) return;
    setPageVolume(p, value, userInitiated);
    store.save(c);
    manager.sync(
      c.session,
      c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
    );
    manager.setVolume(c.masterMuted ? 0 : c.masterVolume);
    window.webContents.send("session-update", c.session, c);
  }
  const overlay = new DragOverlay(window, (source, slot) => {
    const c = store.load();
    if (source.startsWith("stash:")) {
      const id = placeStashed(c, source.slice(6), slot);
      if (id) {
        logOperation("ui.change", { action: "stash.open", status: "success" });
        commitStash(c);
        manager.focusAfterExchange(id);
      }
      return;
    }
    if (slot === -1) {
      const p = c.session.pages.find((p) => p?.id === source),
        wc = manager.views.get(source)?.webContents;
      if (p && wc && /^https?:\/\//.test(wc.getURL())) {
        p.url = wc.getURL();
        p.title = wc.getTitle() || p.url;
        manager.requested.set(p.id, p.url);
      }
      if (parkPage(c, source)) {
        logOperation("ui.change", {
          action: "stash.add",
          count: c.pageStash.length,
        });
        commitStash(c);
      }
      return;
    }
    const from = c.session.pages.findIndex((p) => p?.id === source);
    if (from < 0) return;
    logOperation("drag.drop", { from, to: slot, status: "success" });
    exchange(c, from, slot);
  });
  function exchange(
    c: import("../src/core/model").Config,
    from: number,
    slot: number,
  ) {
    const source = c.session.pages[from]?.id;
    if (!source || from === slot) return;
    c.session.pages = swapPages(c.session.pages, from, slot);
    store.save(c);
    manager.sync(
      c.session,
      c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
    );
    manager.setVolume(c.masterMuted ? 0 : c.masterVolume);
    manager.focusAfterExchange(
      (from === 0 || slot === 0 ? c.session.pages[0]?.id : source) ?? source,
    );
    window.webContents.send("session-update", c.session, c);
  }
  const popup = new VolumePopup(window, updatePageVolume);
  const scalePopup = new ScalePopup(window, (id, scale) => {
    const c = store.load();
    const slot = c.session.pages.findIndex((p) => p?.id === id);
    const page = c.session.pages[slot];
    if (!page) return;
    logOperation("ui.change", {
      area: "pane",
      action: "page.scale",
      slot,
      previous: page.scale.width,
      value: scale.width,
      count: scale.height,
      code: ["auto", "manual", "responsive"].indexOf(scale.mode),
    });
    if (page.scale.factor !== scale.factor)
      logOperation("ui.change", {
        area: "pane",
        action: "page.scale",
        control: "range",
        slot,
        previous: Math.round(page.scale.factor * 100),
        value: Math.round(scale.factor * 100),
      });
    page.scale = scale;
    store.save(c);
    manager.sync(
      c.session,
      c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
    );
    scalePopup.update(c);
    window.webContents.send("session-update", c.session, c);
  });
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw Error("拒绝 IPC 来源");
  };
  const stash = new PageStash(
    window,
    () => store.load(),
    (id, title) => {
      const c = store.load(),
        item = c.pageStash.find((x) => x.id === id);
      if (!item) return;
      item.title = title;
      store.save(c);
      window.webContents.send("session-update", c.session, c);
    },
    (id) => {
      const c = store.load();
      const idOpened = placeStashed(c, id);
      logOperation("ui.click", {
        action: "stash.open",
        status: idOpened ? "success" : "cancelled",
      });
      if (!idOpened) return false;
      commitStash(c);
      manager.focusAfterExchange(idOpened);
      return true;
    },
    (id) => window.webContents.send("stash-drag-request", "stash:" + id),
    () => overlay.end(),
  );
  function commitStash(c: import("../src/core/model").Config) {
    for (const p of [...c.session.pages, ...c.pageStash.map((x) => x.page)]) {
      if (!p) continue;
      const wc = manager.views.get(p.id)?.webContents;
      if (wc && !wc.isDestroyed() && /^https?:\/\//.test(wc.getURL())) {
        p.url = wc.getURL();
        p.title = wc.getTitle() || p.url;
        manager.requested.set(p.id, p.url);
      }
    }
    for (const item of c.pageStash)
      if (item.page) {
        item.url = item.page.url;
        item.title = item.page.title;
      }
    store.save(c);
    manager.sync(
      c.session,
      c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
    );
    manager.setVolume(c.masterMuted ? 0 : c.masterVolume);
    stash.refresh();
    window.webContents.send("session-update", c.session, c);
  }
  ipcMain.handle("stash-hide", (e) => {
    trusted(e);
    stash.closeSoon();
  });
  ipcMain.handle("page-new", (e, url) => {
    trusted(e);
    openRequested(normalizeUrl(z.string().max(8192).parse(url)));
  });
  ipcMain.handle("stash-show", (e, raw) => {
    trusted(e);
    logOperation("ui.click", { action: "stash.show" });
    const rect = z
      .object({
        x: z.number().min(0).max(20000),
        y: z.number().min(0).max(20000),
        width: z.number().min(1).max(20000),
        height: z.number().min(1).max(1000),
      })
      .parse(raw);
    return stash.show(rect);
  });
  ipcMain.handle("exchange-pages", (e, raw, from, to) => {
    trusted(e);
    const draft = validateConfig(raw);
    const sourceSlot = z.number().int().min(0).max(8).parse(from);
    const targetSlot = z.number().int().min(0).max(8).parse(to);
    const source = draft.session.pages[sourceSlot]?.id;
    const target = draft.session.pages[targetSlot]?.id;
    const c = store.accept(draft);
    const actualFrom = c.session.pages.findIndex((p) => p?.id === source);
    const actualTo = target
      ? c.session.pages.findIndex((p) => p?.id === target)
      : targetSlot;
    if (
      source &&
      actualFrom >= 0 &&
      actualTo >= 0 &&
      (target || !c.session.pages[actualTo])
    )
      exchange(c, actualFrom, actualTo);
  });
  ipcMain.handle("operation-log", (e, event, details) => {
    trusted(e);
    const parsed = sanitizeOperation(event, details);
    if (parsed) logOperation(parsed.event, parsed.details);
  });
  ipcMain.handle("page-zoom", (e, id, direction) => {
    trusted(e);
    manager.changePageZoom(
      z.string().parse(id),
      z.enum(["in", "out", "reset"]).parse(direction),
    );
  });
  ipcMain.handle("drag-begin", (e, id, raw) => {
    trusted(e);
    const source = z.string().parse(id);
    const targets = z
      .array(
        z.object({
          slot: z.number().int().min(-1).max(8),
          rect: z.object({
            x: z.number().min(0),
            y: z.number().min(0),
            width: z.number().positive(),
            height: z.number().positive(),
          }),
        }),
      )
      .max(10)
      .parse(raw);
    logOperation("drag.begin", {
      slot: store.load().session.pages.findIndex((p) => p?.id === source),
    });
    if (
      manager.views.has(source) ||
      (source.startsWith("stash:") &&
        store.load().pageStash.some((x) => x.id === source.slice(6)))
    ) {
      popup.hide();
      scalePopup.hide();
      return overlay.begin(source, targets);
    }
  });
  ipcMain.handle("drag-end", (e) => {
    trusted(e);
    logOperation("drag.end");
    overlay.end();
  });
  ipcMain.handle("volume-show", (e, id, raw) => {
    trusted(e);
    scalePopup.hide();
    const rect = z
      .object({
        x: z.number().min(0).max(20000),
        y: z.number().min(0).max(20000),
        width: z.number().min(20).max(100),
        height: z.number().min(10).max(100),
      })
      .parse(raw);
    logOperation("audio.popup_open", {
      slot: store.load().session.pages.findIndex((p) => p?.id === id),
    });
    return popup.show(z.string().parse(id), rect, store.load());
  });
  ipcMain.handle("volume-hide", (e) => {
    trusted(e);
    logOperation("audio.popup_close");
    popup.closeSoon();
  });
  ipcMain.handle("scale-show", (e, id, raw, locked) => {
    trusted(e);
    const rect = z
      .object({
        x: z.number().min(0).max(20000),
        y: z.number().min(0).max(20000),
        width: z.number().min(20).max(100),
        height: z.number().min(10).max(100),
      })
      .parse(raw);
    popup.hide();
    logOperation("ui.hover", {
      action: "page.scale",
      status: "requested",
      slot: store.load().session.pages.findIndex((p) => p?.id === id),
    });
    return scalePopup.show(
      z.string().parse(id),
      rect,
      store.load(),
      z.boolean().parse(locked),
    );
  });
  ipcMain.handle("scale-hide", (e) => {
    trusted(e);
    scalePopup.closeSoon();
  });
  let sessionInitialized = false;
  ipcMain.handle("config-load", (e) => {
    trusted(e);
    const c = store.load();
    logOperation("config.load", {
      count: c.session.pages.filter(Boolean).length,
    });
    if (!sessionInitialized) {
      sessionInitialized = true;
      if (!c.restore) {
        c.session = defaults().session;
        store.save(c);
      }
      manager.sync(
        c.session,
        c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
      );
      manager.setVolume(c.masterMuted ? 0 : c.masterVolume);
    }
    return c;
  });
  ipcMain.handle("config-save", (e, raw) => {
    trusted(e);
    const before = store.load();
    const c = store.accept(validateConfig(raw));
    logConfigChanges(before, c);
    logOperation("config.save", {
      count: c.session.pages.filter(Boolean).length,
    });
    manager.sync(
      c.session,
      c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
    );
    manager.setVolume(c.masterMuted ? 0 : c.masterVolume);
    popup.update(c);
    scalePopup.update(c);
    return c;
  });
  ipcMain.handle("bounds", (e, raw) => {
    trusted(e);
    const items = z
      .array(
        z.object({
          id: z.string(),
          rect: z.object({
            x: z.number().min(0),
            y: z.number().min(0),
            width: z.number().positive().max(20000),
            height: z.number().positive().max(20000),
          }),
          scale: z.object({
            mode: z.enum(["auto", "manual", "responsive"]),
            width: z.number().min(320).max(7680),
            height: z.number().min(240).max(4320),
            factor: z.number().min(0.05).max(3),
          }),
        }),
      )
      .max(24)
      .parse(raw);
    manager.bounds(items);
  });
  ipcMain.handle("presentation", (e, value) => {
    trusted(e);
    scalePopup.hide();
    logOperation("layout.presentation", { changed: z.boolean().parse(value) });
    manager.setPresentationMuted(z.boolean().parse(value));
  });
  ipcMain.handle("navigate", (e, id, action, url) => {
    trusted(e);
    manager.navigate(
      z.string().parse(id),
      z.enum(["navigate", "reload", "back", "forward"]).parse(action),
      url === undefined ? undefined : z.string().parse(url),
    );
  });
  ipcMain.handle("transfer", async (e, action) => {
    trusted(e);
    logOperation(action === "export" ? "data.export" : "data.import", {
      status: "requested",
    });
    if (action === "export") {
      const r = await dialog.showSaveDialog(window, {
        defaultPath: "multiview-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (r.filePath)
        writeFileSync(r.filePath, JSON.stringify(store.load(), null, 2));
      logOperation("data.export", {
        status: r.filePath ? "success" : "cancelled",
      });
      return null;
    }
    if (action === "import") {
      const r = await dialog.showOpenDialog(window, {
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (!r.canceled) {
        const c = validateConfig(
          JSON.parse(readFileSync(r.filePaths[0], "utf8")),
        );
        store.save(c);
        manager.sync(
          c.session,
          c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
        );
        logOperation("data.import", { status: "success" });
        return c;
      }
      logOperation("data.import", { status: "cancelled" });
    }
    return null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e) => e.preventDefault());
  window.on("resize", () => manager.hideViews());
  window.on("close", () => logOperation("app.close_requested"));
  for (const [name, event] of [
    ["focus", "app.focus"],
    ["blur", "app.blur"],
    ["resize", "app.resize"],
    ["maximize", "app.maximize"],
    ["unmaximize", "app.restore"],
    ["minimize", "app.minimize"],
    ["enter-full-screen", "app.fullscreen"],
    ["leave-full-screen", "app.fullscreen"],
  ] as const)
    (window as Electron.BrowserWindow).on(name as "focus", () =>
      logOperation(event),
    );
  window.webContents.on("render-process-gone", () =>
    logOperation("app.error", { status: "failed" }),
  );
  window.on("closed", () => {
    logOperation("app.window_closed");
    manager.destroy();
  });
  if (process.env.VITE_DEV_SERVER_URL)
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(join(__dirname, "../dist/index.html"));
  window.maximize();
  window.show();
});
app.on("window-all-closed", () => app.quit());

app.on("will-quit", finishOperationLog);
process.on("exit", finishOperationLog);
process.on("uncaughtExceptionMonitor", () =>
  logOperation("app.error", { status: "failed" }),
);
