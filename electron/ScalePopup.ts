import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import { z } from "zod";
import { displayScale, resolutions } from "../src/core/ScaleManager";
import type { Config, Page } from "../src/core/model";

export class ScalePopup {
  private popup?: BrowserWindow;
  private loading?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private id = "";
  private locked = false;
  private state?: { scale: Page["scale"]; locked: boolean; slot: number };
  constructor(
    private parent: BrowserWindow,
    private change: (id: string, scale: Page["scale"]) => void,
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
    ipcMain.handle("scale-popup-state", (e) => {
      trusted(e);
      return this.state;
    });
    ipcMain.handle("scale-popup-hover", (e, inside) => {
      trusted(e);
      if (inside === true) this.cancel();
      else this.closeSoon();
    });
    ipcMain.handle("scale-popup-change", (e, raw) => {
      trusted(e);
      if (!this.id || this.locked || !this.state) return;
      const patch = z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("mode"),
            value: z.enum(["auto", "manual", "responsive"]),
          }),
          z.object({
            kind: z.literal("resolution"),
            value: z.enum(["1920x1080", "2560x1440", "3840x2160"]),
          }),
          z.object({
            kind: z.literal("factor"),
            value: z.number().min(0.05).max(3),
          }),
        ])
        .parse(raw);
      const scale = { ...this.state.scale };
      if (patch.kind === "resolution") {
        const resolution = resolutions.find(
          (r) => `${r.width}x${r.height}` === patch.value,
        )!;
        scale.width = resolution.width;
        scale.height = resolution.height;
      } else if (patch.kind === "mode") scale.mode = patch.value;
      else scale.factor = patch.value;
      this.state = { ...this.state, scale };
      this.change(this.id, scale);
    });
    for (const event of ["move", "resize", "minimize", "hide"] as const)
      parent.on(event as "move", () => this.hide());
  }
  private create() {
    const popup = new BrowserWindow({
      parent: this.parent,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      width: 300,
      height: 240,
      backgroundColor: "#242424",
      webPreferences: {
        preload: join(__dirname, "scale-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.popup = popup;
    popup.setMenu(null);
    popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    popup.webContents.on("will-navigate", (e) => e.preventDefault());
    popup.on("blur", () => this.closeSoon());
    this.loading = popup.loadFile(join(__dirname, "scale.html"));
    return popup;
  }
  private cancel() {
    if (this.timer) clearTimeout(this.timer);
  }
  hide() {
    this.cancel();
    this.generation++;
    this.id = "";
    this.state = undefined;
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
    locked: boolean,
  ) {
    const slot = config.session.pages.findIndex((p) => p?.id === id),
      page = config.session.pages[slot];
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
    this.locked = locked && slot === 0;
    this.state = {
      scale: displayScale(page.scale, this.locked),
      locked: this.locked,
      slot,
    };
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
    const anchor = { x: origin.x + rect.x, y: origin.y + rect.y };
    const work = screen.getDisplayNearestPoint(anchor).workArea;
    const width = 300,
      height = 240;
    popup.setBounds({
      x: Math.round(
        Math.max(
          work.x,
          Math.min(anchor.x + rect.width - width, work.x + work.width - width),
        ),
      ),
      y: Math.round(
        Math.max(
          work.y,
          Math.min(anchor.y + rect.height, work.y + work.height - height),
        ),
      ),
      width,
      height,
    });
    popup.webContents.send("popup-scale", this.state);
    popup.showInactive();
  }
  update(config: Config) {
    if (!this.id) return;
    const slot = config.session.pages.findIndex((p) => p?.id === this.id),
      page = config.session.pages[slot];
    if (!page || slot !== this.state?.slot) {
      this.hide();
      return;
    }
    this.state = {
      scale: displayScale(page.scale, this.locked),
      locked: this.locked,
      slot,
    };
    if (this.popup && !this.popup.isDestroyed())
      this.popup.webContents.send("popup-scale", this.state);
  }
}
