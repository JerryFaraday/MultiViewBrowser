import { BrowserWindow } from "electron";
import type { Rect } from "../src/core/LayoutManager";

type Feedback = {
  window: BrowserWindow;
  ready: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  generation: number;
  rect: Rect;
  factor: number;
};

/** Native views cover the React surface; these small windows are input-transparent. */
export class ZoomFeedback {
  private entries = new Map<string, Feedback>();
  private uiScale = 1;
  setUiScale(value: number) {
    this.uiScale = value;
    for (const entry of this.entries.values()) this.position(entry);
  }
  constructor(private parent: BrowserWindow) {
    parent.on("move", () => {
      for (const entry of this.entries.values()) this.position(entry);
    });
    for (const event of ["hide", "minimize", "blur"] as const)
      parent.on(event as "hide", () => this.hide());
  }
  private create(rect: Rect, factor: number): Feedback {
    const window = new BrowserWindow({
      parent: this.parent,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      focusable: false,
      resizable: false,
      skipTaskbar: true,
      width: 80,
      height: 40,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    window.setMenu(null);
    window.setIgnoreMouseEvents(true);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
      <title>网页缩放比例</title><style>
      *{box-sizing:border-box;user-select:none;pointer-events:none}
      body{margin:0;background:transparent;overflow:hidden}
      #zoom{height:36px;display:flex;align-items:center;justify-content:center;
      margin:2px;border:1px solid var(--ui-75,#444);border-radius:6px;background:var(--ui-73,#242424);
      color:var(--ui-77,#eee);font:500 14px "Segoe UI",sans-serif;opacity:0;transition:opacity 180ms ease}
      </style><div id="zoom" role="status" aria-label="网页缩放比例"></div></html>`;
    return {
      window,
      ready: window.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      ),
      generation: 0,
      rect,
      factor,
    };
  }
  private position(entry: Feedback) {
    if (entry.window.isDestroyed() || this.parent.isDestroyed()) return;
    const origin = this.parent.getContentBounds();
    const { rect } = entry;
    const width = Math.min(Math.round(80 * this.uiScale), rect.width);
    const height = Math.min(Math.round(40 * this.uiScale), rect.height);
    entry.window.webContents.setZoomMode("isolated");
    entry.window.webContents.setZoomFactor(this.uiScale);
    entry.window.setBounds({
      x: Math.round(
        origin.x +
          rect.x +
          rect.width -
          width -
          Math.min(10, Math.max(0, rect.width - width)),
      ),
      y: Math.round(
        origin.y + rect.y + Math.min(10, Math.max(0, rect.height - height)),
      ),
      width,
      height,
    });
  }
  private paint(entry: Feedback, visible?: boolean) {
    if (entry.window.isDestroyed()) return Promise.resolve();
    return entry.window.webContents
      .executeJavaScript(
        `document.getElementById('zoom').textContent=${JSON.stringify(Math.round(entry.factor * 100) + "%")};${visible === undefined ? "" : `document.getElementById('zoom').style.opacity='${visible ? 1 : 0}'`}`,
      )
      .catch(() => {});
  }
  async show(id: string, rect: Rect, factor: number) {
    if (
      this.parent.isDestroyed() ||
      !this.parent.isVisible() ||
      this.parent.isMinimized()
    )
      return;
    let entry = this.entries.get(id);
    if (!entry) {
      entry = this.create(rect, factor);
      this.entries.set(id, entry);
    }
    clearTimeout(entry.timer);
    const generation = ++entry.generation;
    entry.rect = rect;
    entry.factor = factor;
    try {
      await entry.ready;
    } catch {
      this.remove(id);
      return;
    }
    if (
      entry.generation !== generation ||
      entry.window.isDestroyed() ||
      this.parent.isDestroyed()
    )
      return;
    this.position(entry);
    await this.paint(entry, true);
    if (entry.generation !== generation || entry.window.isDestroyed()) return;
    entry.window.showInactive();
    entry.timer = setTimeout(() => {
      if (entry!.generation !== generation) return;
      void this.paint(entry!, false);
      entry!.timer = setTimeout(() => {
        if (entry!.generation === generation && !entry!.window.isDestroyed())
          entry!.window.hide();
      }, 200);
    }, 2000);
  }
  update(items: { id: string; rect: Rect; factor: number }[]) {
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const [id, entry] of this.entries) {
      const item = byId.get(id);
      if (!item) {
        this.remove(id);
        continue;
      }
      entry.rect = item.rect;
      entry.factor = item.factor;
      this.position(entry);
      // Preserve the original dismissal deadline while following a swapped view.
      if (entry.window.isVisible()) void this.paint(entry);
    }
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.generation++;
    clearTimeout(entry.timer);
    if (!entry.window.isDestroyed()) entry.window.destroy();
    this.entries.delete(id);
  }
  hide() {
    for (const entry of this.entries.values()) {
      entry.generation++;
      clearTimeout(entry.timer);
      if (!entry.window.isDestroyed()) entry.window.hide();
    }
  }
  destroy() {
    for (const id of this.entries.keys()) this.remove(id);
  }
}
