import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { Rect } from "../src/core/LayoutManager";
import { accentPresets, type AccentName } from "../src/core/Accent";
/** Dedicated native drag surface; Chromium child views cannot steal splitter input. */
export class ResizePreview {
  private window?: BrowserWindow;
  private ready?: Promise<void>;
  private generation = 0;
  private active = false;
  constructor(
    private parent: BrowserWindow,
    private accent: () => AccentName,
  ) {
    ipcMain.on("resize-pointer", (event, raw) => {
      if (
        !this.active ||
        !this.window ||
        event.sender !== this.window.webContents ||
        event.senderFrame !== this.window.webContents.mainFrame
      )
        return;
      if (
        !raw ||
        !Number.isFinite(raw.x) ||
        !Number.isFinite(raw.y) ||
        typeof raw.done !== "boolean"
      )
        return;
      const bounds = parent.getContentBounds();
      const x = Math.max(0, Math.min(bounds.width, raw.x)),
        y = Math.max(0, Math.min(bounds.height, raw.y));
      parent.webContents.send("resize-pointer", { x, y, done: raw.done });
      if (raw.done) this.finish();
    });
    for (const event of ["blur", "minimize", "hide", "resize"] as const)
      parent.on(event as "blur", () => this.cancel());
    parent.webContents.on("before-input-event", (event, input) => {
      if (this.active && input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        this.cancel();
      }
    });
  }
  prepare() {
    if (this.window && !this.window.isDestroyed()) return;
    this.window = new BrowserWindow({
      parent: this.parent,
      show: false,
      frame: false,
      transparent: true,
      focusable: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      backgroundColor: "#00000000",
      width: 200,
      height: 200,
      webPreferences: {
        preload: join(__dirname, "resize-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
      },
    });
    this.window.setMenu(null);
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", (event) =>
      event.preventDefault(),
    );
    this.ready = this.window.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'\"><title>分屏线预览</title><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;user-select:none}div{position:absolute;pointer-events:none}</style><div></div>",
        ),
    );
  }
  async begin(axis: "x" | "y") {
    const generation = ++this.generation;
    this.active = true;
    this.prepare();
    try {
      await this.ready;
    } catch {
      this.cancel();
      return;
    }
    if (
      generation !== this.generation ||
      !this.active ||
      this.parent.isDestroyed()
    )
      return;
    this.window!.setBounds(this.parent.getContentBounds());
    this.window!.webContents.send("resize-line", null);
    this.window!.webContents.send(
      "resize-cursor",
      axis === "x" ? "col-resize" : "row-resize",
    );
    this.window!.showInactive();
  }
  show(rect: Rect | null) {
    if (!rect) {
      this.finish();
      return;
    }
    if (!this.active || !this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("resize-line", {
      ...rect,
      color: accentPresets[this.accent()].color,
    });
  }
  private finish() {
    this.active = false;
    this.generation++;
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }
  private cancel() {
    if (this.active && !this.parent.isDestroyed())
      this.parent.webContents.send("resize-pointer", {
        x: 0,
        y: 0,
        done: true,
        cancelled: true,
      });
    this.finish();
  }
}
