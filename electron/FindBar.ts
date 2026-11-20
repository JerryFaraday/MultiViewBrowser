import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { WebContentsView } from "electron";
export class FindBar {
  private queries = new Map<string, string>();
  private popup?: BrowserWindow;
  private ready?: Promise<void>;
  private id?: string;
  private query = "";
  private request = 0;
  private generation = 0;
  private listened = new WeakSet<object>();
  private command: (
    event: Electron.IpcMainEvent,
    action: string,
    query: unknown,
  ) => void;
  constructor(
    private parent: BrowserWindow,
    private view: (id: string) => WebContentsView | undefined,
  ) {
    this.command = (event, action, query) => {
      if (
        !this.popup ||
        event.sender !== this.popup.webContents ||
        event.senderFrame !== this.popup.webContents.mainFrame
      )
        return;
      if (action === "close") {
        this.close();
        return;
      }
      if (!["input", "next", "previous"].includes(action)) return;
      if (action === "input") {
        if (typeof query !== "string" || query.length > 2000) return;
        this.query = query;
        if (this.id) this.queries.set(this.id, query);
      }
      this.search(action === "input", action !== "previous");
    };
    ipcMain.on("find-command", this.command);
    for (const name of ["minimize", "hide"] as const)
      parent.on(name as "hide", () => this.close(false));
  }
  get active() {
    return this.id !== undefined;
  }
  async show(id: string) {
    const view = this.view(id);
    if (!view?.getVisible()) return;
    if (this.id !== id) {
      this.close(false);
      this.query = this.queries.get(id) ?? "";
    }
    this.id = id;
    const generation = ++this.generation;
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = new BrowserWindow({
        parent: this.parent,
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        width: 360,
        height: 52,
        webPreferences: {
          preload: join(__dirname, "find-preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      this.popup.setMenu(null);
      this.popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.popup.webContents.on("will-navigate", (e) => e.preventDefault());
      this.ready = this.popup.loadFile(join(__dirname, "find.html"));
    }
    if (!this.listened.has(view.webContents)) {
      this.listened.add(view.webContents);
      view.webContents.on("found-in-page", (_event, result) => {
        if (this.id === id && result.requestId === this.request)
          this.popup?.webContents.send(
            "find-result",
            result.activeMatchOrdinal,
            result.matches,
          );
      });
      view.webContents.on("destroyed", () => {
        this.queries.delete(id);
        if (this.id === id) this.close(false);
      });
      view.webContents.on("did-start-navigation", (_e, _url, inPlace, main) => {
        if (main && !inPlace && this.id === id) this.close(false);
      });
    }
    try {
      await this.ready;
    } catch {
      this.close(false);
      return;
    }
    if (this.id !== id || generation !== this.generation) return;
    this.update();
    if (this.id !== id || generation !== this.generation) return;
    this.popup!.show();
    this.popup!.webContents.send("find-focus", this.query);
    this.search(true, true);
  }
  next(id: string, forward: boolean) {
    if (this.id !== id || !this.query) {
      void this.show(id);
      return;
    }
    this.search(false, forward);
  }
  private search(first: boolean, forward: boolean) {
    const wc = this.id ? this.view(this.id)?.webContents : undefined;
    if (!wc || wc.isDestroyed()) return;
    if (!this.query) {
      wc.stopFindInPage("clearSelection");
      this.popup?.webContents.send("find-result", 0, 0);
      this.request = 0;
      return;
    }
    this.request = wc.findInPage(this.query, { forward, findNext: !first });
  }
  update() {
    if (!this.id) return;
    const v = this.view(this.id);
    if (!v?.getVisible()) {
      this.close(false);
      return;
    }
    if (!this.popup || this.popup.isDestroyed()) return;
    const r = v.getBounds(),
      origin = this.parent.getContentBounds(),
      width = Math.min(
        Math.round(360 * this.popup.webContents.getZoomFactor()),
        r.width,
      ),
      height = Math.min(
        Math.round(52 * this.popup.webContents.getZoomFactor()),
        r.height,
      );
    const rect = {
      x: origin.x + r.x + r.width - width,
      y: origin.y + r.y,
      width,
      height,
    };
    const before = this.popup.getBounds();
    if (
      Object.keys(rect).some(
        (key) =>
          rect[key as keyof typeof rect] !== before[key as keyof typeof rect],
      )
    )
      this.popup.setBounds(rect);
  }
  close(focus = true) {
    const id = this.id;
    this.id = undefined;
    this.generation++;
    this.request = 0;
    const wc = id ? this.view(id)?.webContents : undefined;
    if (wc && !wc.isDestroyed()) wc.stopFindInPage("clearSelection");
    if (this.popup && !this.popup.isDestroyed()) this.popup.hide();
    if (focus && wc && !wc.isDestroyed()) wc.focus();
  }
  destroy() {
    ipcMain.removeListener("find-command", this.command);
    this.close(false);
    if (this.popup && !this.popup.isDestroyed()) this.popup.destroy();
  }
}
