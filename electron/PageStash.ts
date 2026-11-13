import { BrowserWindow, WebContentsView, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { Config } from "../src/core/model";
import type { Rect } from "../src/core/LayoutManager";

export class PageStash {
  private popup?: BrowserWindow;
  private pending: string[] = [];
  private working = false;
  private disposed = false;
  private probe?: WebContentsView;
  constructor(
    private parent: BrowserWindow,
    private read: () => Config,
    private updateTitle: (id: string, title: string) => void,
    open: (id: string) => boolean,
  ) {
    ipcMain.handle("stash-open", (event, id) => {
      if (
        !this.popup ||
        event.sender !== this.popup.webContents ||
        event.senderFrame !== this.popup.webContents.mainFrame ||
        typeof id !== "string"
      )
        return;
      const opened = open(id);
      this.refresh();
      if (opened) this.popup.hide();
    });
    for (const event of ["move", "resize", "minimize", "hide"] as const)
      parent.on(event as "move", () => this.popup?.hide());
    parent.on("closed", () => {
      this.disposed = true;
      if (this.probe && !this.probe.webContents.isDestroyed())
        this.probe.webContents.close();
    });
  }
  refresh() {
    if (this.popup && !this.popup.isDestroyed())
      this.popup.webContents.send(
        "stash-items",
        this.read().pageStash.map(({ id, title }) => ({ id, title })),
      );
  }
  async show(rect: Rect) {
    if (this.popup && !this.popup.isDestroyed() && this.popup.isVisible()) {
      this.popup.hide();
      return;
    }
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = new BrowserWindow({
        parent: this.parent,
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        width: 300,
        height: 320,
        backgroundColor: "#242424",
        webPreferences: {
          preload: join(__dirname, "stash-preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      this.popup.setMenu(null);
      this.popup.on("blur", () => this.popup?.hide());
      this.popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.popup.webContents.on("will-navigate", (e) => e.preventDefault());
      await this.popup.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<!doctype html><title>页面暂存区</title><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>*{box-sizing:border-box;user-select:none}body{margin:0;padding:10px;background:#242424;color:#ddd;font:14px 'Segoe UI',sans-serif;border:1px solid #444;height:100vh;overflow:auto}p{margin:0 0 8px;color:#aaa;font-size:12px}button{display:block;width:100%;text-align:left;padding:9px;border:0;border-radius:4px;background:transparent;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:inherit}button:hover,button:focus{background:#38404b;outline:none}</style><p>页面暂存区 · 有空位时双击打开</p><div id="list"></div>`,
          ),
      );
    }
    if (this.parent.isDestroyed() || this.popup.isDestroyed()) return;
    const origin = this.parent.getContentBounds(),
      area = screen.getDisplayMatching(origin).workArea;
    const width = 300,
      height = 320;
    this.popup.setBounds({
      x: Math.max(
        area.x,
        Math.min(
          origin.x + rect.x + rect.width - width,
          area.x + area.width - width,
        ),
      ),
      y: Math.max(
        area.y,
        Math.min(
          origin.y + rect.y + rect.height,
          area.y + area.height - height,
        ),
      ),
      width,
      height,
    });
    this.refresh();
    this.popup.show();
  }
  resolveTitle(id: string) {
    this.pending.push(id);
    void this.work();
  }
  private async work() {
    if (this.working || this.disposed) return;
    this.working = true;
    try {
      while (this.pending.length && !this.disposed) {
        const id = this.pending.shift()!,
          item = this.read().pageStash.find((x) => x.id === id);
        if (!item) continue;
        const view = new WebContentsView({
          webPreferences: {
            partition: "persist:multiview",
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        this.probe = view;
        const wc = view.webContents;
        wc.setAudioMuted(true);
        wc.setWindowOpenHandler(() => ({ action: "deny" }));
        for (const event of ["will-navigate", "will-redirect"] as const)
          wc.on(event as "will-navigate", (e, url) => {
            if (!/^https?:\/\//i.test(url)) e.preventDefault();
          });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => resolve(), 12000);
          wc.once("destroyed", () => {
            clearTimeout(timer);
            resolve();
          });
          wc.on("page-title-updated", (_e, title) => {
            // Never use a URL (Chromium's loading fallback) as a display name.
            if (
              title.trim() &&
              !/https?:\/\//i.test(title) &&
              title !== new URL(item.url).hostname
            ) {
              this.updateTitle(id, title.slice(0, 1000));
              this.refresh();
              clearTimeout(timer);
              resolve();
            }
          });
          void wc.loadURL(item.url).catch(() => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (!wc.isDestroyed()) wc.close();
        this.probe = undefined;
      }
    } finally {
      this.working = false;
    }
  }
}
