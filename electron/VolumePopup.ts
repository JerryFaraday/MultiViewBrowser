import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { z } from "zod";
import type { Config, Page } from "../src/core/model";
export class VolumePopup {
  private popup: BrowserWindow | undefined;
  private loading: Promise<void> | undefined;
  private generation = 0;
  private id = "";
  private value = 100;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private parent: BrowserWindow,
    private change: (id: string, value: Page["volume"]) => void,
  ) {
    const trusted = (e: Electron.IpcMainInvokeEvent) => {
      if (
        !this.popup ||
        this.popup.isDestroyed() ||
        e.sender !== this.popup.webContents ||
        e.senderFrame !== this.popup.webContents.mainFrame
      )
        throw Error("拒绝来源");
    };
    ipcMain.handle("volume-popup-state", (e) => {
      trusted(e);
      return this.value;
    });
    ipcMain.handle("volume-popup-hover", (e, inside) => {
      trusted(e);
      if (inside === true) this.cancel();
      else this.closeSoon();
    });
    ipcMain.handle("volume-popup-value", (e, raw) => {
      trusted(e);
      const value = z
        .union([
          z.literal(0),
          z.literal(25),
          z.literal(50),
          z.literal(75),
          z.literal(100),
        ])
        .parse(raw);
      this.value = value;
      this.change(this.id, value);
    });
    parent.on("move", () => this.hide());
    parent.on("resize", () => this.hide());
    parent.on("minimize", () => this.hide());
    parent.on("hide", () => this.hide());
  }
  private create() {
    this.popup = new BrowserWindow({
      parent: this.parent,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      width: 34,
      height: 160,
      backgroundColor: "#242424",
      webPreferences: {
        preload: join(__dirname, "volume-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.popup.setMenu(null);

    const popup = this.popup!;
    popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    popup.webContents.on("will-navigate", (e) => e.preventDefault());
    this.loading = popup.loadFile(join(__dirname, "volume.html"));
    return popup;
  }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
  }
  hide() {
    this.cancel();
    this.generation++;
    this.id = "";
    if (this.popup && !this.popup.isDestroyed()) this.popup.hide();
  }
  closeSoon() {
    this.cancel();
    this.timer = setTimeout(() => this.hide(), 180);
  }
  async show(
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    config: Config,
  ) {
    const page = config.session.pages.find((p) => p?.id === id);
    if (
      !page ||
      this.parent.isDestroyed() ||
      !this.parent.isVisible() ||
      this.parent.isMinimized()
    ) {
      this.hide();
      return;
    }
    this.cancel();
    const generation = ++this.generation;
    this.id = id;
    this.value = page.volume;
    const popup =
      this.popup && !this.popup.isDestroyed() ? this.popup : this.create();
    try {
      await this.loading;
    } catch {
      this.hide();
      return;
    }
    if (
      generation !== this.generation ||
      popup.isDestroyed() ||
      this.parent.isDestroyed() ||
      !this.parent.isVisible() ||
      this.parent.isMinimized()
    )
      return;
    const origin = this.parent.getContentBounds();
    popup.webContents.setZoomMode("isolated");
    popup.webContents.setZoomFactor(config.preferences.uiScale);
    popup.setBounds({
      x: Math.round(origin.x + rect.x),
      y: Math.round(origin.y + rect.y + rect.height),
      width: Math.round(rect.width),
      height: Math.round(160 * config.preferences.uiScale),
    });
    popup.webContents.send("popup-volume", this.value);
    popup.showInactive();
  }
  update(config: Config) {
    const page = config.session.pages.find((p) => p?.id === this.id);
    if (!page) {
      this.hide();
      if (this.popup && !this.popup.isDestroyed()) this.popup.destroy();
      this.popup = undefined;
      this.loading = undefined;
      return;
    }
    this.value = page.volume;
    if (this.popup && !this.popup.isDestroyed())
      this.popup.webContents.send("popup-volume", page.volume);
  }
}
