import { BrowserWindow, net, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { Config } from "../src/core/model";
import type { Rect } from "../src/core/LayoutManager";
import type { DropTarget } from "./DragOverlay";
import { z } from "zod";
import { canOpenHoverPopup, isHoverPopupOwnerActive } from "./HoverPopup";

export class PageStash {
  private popup?: BrowserWindow;
  private loading?: Promise<void>;
  private pending: string[] = [];
  private working = false;
  private attempted = new Map<string, string>();
  private disposed = false;
  private request?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private dragging = false;
  private generation = 0;
  hide() {
    this.generation++;
    clearTimeout(this.timer);
    if (this.popup && !this.popup.isDestroyed()) this.popup.hide();
  }
  closeSoon() {
    if (this.dragging) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), 180);
  }
  cancel() {
    clearTimeout(this.timer);
  }
  constructor(
    private parent: BrowserWindow,
    private read: () => Config,
    private updateTitle: (id: string, title: string) => void,
    open: (id: string) => boolean,
    beginDrag: (id: string, targets: DropTarget[]) => void,
    endDrag: () => void,
    close: (id: string) => void,
  ) {
    const trusted = (e: Electron.IpcMainInvokeEvent) =>
      this.popup &&
      e.sender === this.popup.webContents &&
      e.senderFrame === this.popup.webContents.mainFrame;
    ipcMain.handle("stash-hover", (e, inside) => {
      if (trusted(e)) {
        if (inside) this.cancel();
        else this.closeSoon();
      }
    });
    ipcMain.handle("stash-close", (e, id) => {
      if (trusted(e) && typeof id === "string") {
        close(id);
        this.refresh();
      }
    });
    ipcMain.handle("stash-drag", (e, id, raw) => {
      if (
        trusted(e) &&
        typeof id === "string" &&
        this.read().pageStash.some((x) => x.id === id)
      ) {
        this.dragging = true;
        this.cancel();
        const rows = z
          .array(
            z.object({
              id: z.string().max(100),
              rect: z.object({
                x: z.number().finite(),
                y: z.number().finite(),
                width: z.number().positive().max(20000),
                height: z.number().positive().max(1000),
              }),
            }),
          )
          .max(5000)
          .parse(raw);
        const origin = this.parent.getContentBounds(),
          bounds = this.popup!.getBounds();
        const zoom = this.popup!.webContents.getZoomFactor();
        const targets = rows
          .filter((x) => this.read().pageStash.some((i) => i.id === x.id))
          .map((x, i) => ({
            slot: -2 - i,
            stashId: x.id,
            rect: {
              ...x.rect,
              x: x.rect.x * zoom + bounds.x - origin.x,
              y: x.rect.y * zoom + bounds.y - origin.y,
              width: x.rect.width * zoom,
              height: x.rect.height * zoom,
            },
          }));
        beginDrag(id, targets);
      }
    });
    ipcMain.handle("stash-drag-end", (e) => {
      if (trusted(e)) {
        this.dragging = false;
        this.refresh();
        endDrag();
        const p = screen.getCursorScreenPoint(),
          r = this.popup!.getBounds();
        if (
          p.x >= r.x &&
          p.x < r.x + r.width &&
          p.y >= r.y &&
          p.y < r.y + r.height
        )
          this.cancel();
        else this.closeSoon();
      }
    });
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
      if (opened) this.hide();
    });
    for (const event of ["move", "resize", "minimize", "hide"] as const)
      parent.on(event as "move", () => this.hide());
    parent.on("blur", () => {
      if (!isHoverPopupOwnerActive(parent)) this.hide();
    });
    parent.on("closed", () => {
      this.disposed = true;
      this.request?.abort();
    });
  }
  refresh() {
    if (this.dragging) return;
    if (this.popup && !this.popup.isDestroyed())
      this.popup.webContents.send(
        "stash-items",
        this.read().pageStash.map(({ id, title }) => ({ id, title })),
      );
  }
  async show(rect: Rect) {
    if (!canOpenHoverPopup(this.parent, rect)) return;
    this.cancel();
    const generation = ++this.generation;
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
      this.popup.on("blur", () => {
        if (isHoverPopupOwnerActive(this.parent)) this.closeSoon();
        else this.hide();
      });
      this.popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.popup.webContents.on("will-navigate", (e) => e.preventDefault());
      this.loading = this.popup.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<!doctype html><title>页面暂存区</title><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>*{box-sizing:border-box;user-select:none}body{margin:0;padding:10px;background:var(--ui-73,#242424);color:var(--ui-74,#ddd);font:14px 'Segoe UI',sans-serif;border:1px solid var(--ui-75,#444);height:100vh;overflow:auto}p{margin:0 0 8px;color:var(--ui-79,#aaa);font-size:12px}button{display:block;width:100%;text-align:left;padding:9px;border:0;border-radius:4px;background:transparent;color:var(--ui-77,#eee);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:inherit}button:hover,button:focus{background:var(--ui-81,#38404b);outline:none}.stash-row{display:flex;align-items:center;gap:3px}.stash-row>button:not(.stash-close){flex:1;min-width:0}.stash-close{width:22px;flex:0 0 22px;text-align:center;padding:4px;font-size:17px;color:var(--ui-82,#9baac0)}.stash-close:hover{background:var(--ui-83,#55404a);color:var(--ui-27,#fff)}</style><div id="list"></div>`,
          ),
      );
    }
    try {
      await this.loading;
    } catch {
      this.hide();
      return;
    }
    if (
      generation !== this.generation ||
      !canOpenHoverPopup(this.parent, rect) ||
      this.popup.isDestroyed()
    )
      return;
    const origin = this.parent.getContentBounds(),
      area = screen.getDisplayMatching(origin).workArea;
    const width = Math.round(rect.width),
      height = Math.round(320 * this.read().preferences.uiScale);
    this.popup.webContents.setZoomMode("isolated");
    this.popup.webContents.setZoomFactor(this.read().preferences.uiScale);
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
    this.popup.showInactive();
  }
  configure() {
    const ids = new Set(this.read().pageStash.map((x) => x.id));
    for (const id of this.attempted.keys())
      if (!ids.has(id)) this.attempted.delete(id);
    if (!this.read().preferences.autoFetchStashTitle) {
      this.pending = [];
      this.request?.abort();
    }
  }
  resolveTitle(id: string) {
    if (!this.read().preferences.autoFetchStashTitle) return;
    const item = this.read().pageStash.find((x) => x.id === id);
    if (!item || item.page || this.attempted.get(id) === item.url) return;
    this.attempted.set(id, item.url);
    if (!this.pending.includes(id)) this.pending.push(id);
    void this.work();
  }
  private async work() {
    if (this.working || this.disposed) return;
    this.working = true;
    try {
      while (
        this.pending.length &&
        !this.disposed &&
        this.read().preferences.autoFetchStashTitle
      ) {
        const id = this.pending.shift()!,
          item = this.read().pageStash.find((x) => x.id === id);
        if (!item || item.page || !/^https?:\/\//i.test(item.url)) continue;
        const controller = new AbortController();
        this.request = controller;
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await net.fetch(item.url, {
            signal: controller.signal,
            credentials: "omit",
          });
          if (
            !response.ok ||
            !response.headers.get("content-type")?.includes("text/html")
          )
            continue;
          const reader = response.body?.getReader();
          if (!reader) continue;
          const decoder = new TextDecoder();
          let html = "",
            size = 0;
          try {
            while (size < 512 * 1024) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.length;
              html += decoder.decode(chunk.value, { stream: true });
              if (/<\/title\s*>/i.test(html)) break;
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
          const title = html
            .match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i)?.[1]
            ?.replace(/\s+/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim()
            .slice(0, 1000);
          const latest = this.read();
          if (
            title &&
            !controller.signal.aborted &&
            !this.disposed &&
            latest.preferences.autoFetchStashTitle &&
            latest.pageStash.some(
              (x) => x.id === id && x.url === item.url && !x.page,
            )
          ) {
            this.updateTitle(id, title);
            this.refresh();
          }
        } catch {
          /* Best effort, no retries and no page instance. */
        } finally {
          clearTimeout(timer);
          if (this.request === controller) this.request = undefined;
        }
      }
    } finally {
      this.working = false;
    }
  }
}
