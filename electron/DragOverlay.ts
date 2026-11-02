import { logOperation } from "./OperationLogger";
import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { DragSession } from "../src/core/DragSession";
import type { Rect } from "../src/core/LayoutManager";
export type DropTarget = { slot: number; rect: Rect };
/** A native surface above WebContentsViews; sites never receive the toolbar drag. */
export class DragOverlay {
  private overlay?: BrowserWindow;
  private loading?: Promise<void>;
  private targets: DropTarget[] = [];
  private drag = new DragSession();
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private parent: BrowserWindow,
    private exchange: (source: string, slot: number) => void,
  ) {
    const trusted = (e: Electron.IpcMainInvokeEvent) => {
      if (
        !this.overlay ||
        this.overlay.isDestroyed() ||
        e.sender !== this.overlay.webContents ||
        e.senderFrame !== this.overlay.webContents.mainFrame
      )
        throw Error("拒绝拖放来源");
    };
    ipcMain.handle("overlay-targets", (e) => {
      trusted(e);
      return this.targets;
    });
    ipcMain.handle("overlay-drop", (e, slot) => {
      trusted(e);
      if (!this.overlay?.isVisible()) return;
      if (!this.targets.some((t) => t.slot === slot)) return;
      const source = this.drag.take("slot:" + slot);
      this.hide();
      if (source) this.exchange(source, slot);
    });
    ipcMain.handle("overlay-cancel", (e) => {
      trusted(e);
      logOperation("drag.cancel", { status: "cancelled" });
      this.hide();
    });
    for (const event of ["move", "resize", "minimize", "hide"] as const) {
      const handler = () => this.hide();
      if (event === "move") parent.on("move", handler);
      else if (event === "resize") parent.on("resize", handler);
      else if (event === "minimize") parent.on("minimize", handler);
      else parent.on("hide", handler);
    }
  }
  async begin(source: string, targets: DropTarget[]) {
    this.hide(false);
    this.drag.begin(source);
    this.targets = targets;
    const generation = this.generation;
    if (!this.overlay || this.overlay.isDestroyed()) {
      this.overlay = new BrowserWindow({
        parent: this.parent,
        show: false,
        transparent: true,
        frame: false,
        resizable: false,
        hasShadow: false,
        skipTaskbar: true,
        focusable: false,
        backgroundColor: "#01000000",
        webPreferences: {
          preload: join(__dirname, "drag-preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      this.overlay.setMenu(null);
      this.overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.overlay.webContents.on("will-navigate", (e) => e.preventDefault());
      this.loading = this.overlay.loadFile(join(__dirname, "drag.html"));
    }
    try {
      await this.loading;
    } catch {
      this.hide();
      return;
    }
    if (
      generation !== this.generation ||
      this.parent.isDestroyed() ||
      !this.parent.isVisible()
    )
      return;
    this.overlay.setBounds(this.parent.getContentBounds());
    this.overlay.webContents.send("drag-targets", targets);
    this.overlay.showInactive();
    this.timer = setTimeout(() => this.hide(), 60000);
  }
  end() {
    if (this.timer) clearTimeout(this.timer);
    this.drag.finish();
    this.timer = setTimeout(() => this.hide(), 250);
  }
  hide(notify = true) {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.hide();
    if (notify && !this.parent.isDestroyed())
      this.parent.webContents.send("drag-finished");
  }
}
