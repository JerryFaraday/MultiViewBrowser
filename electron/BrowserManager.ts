import { logOperation } from "./OperationLogger";
import { sanitizeOperation } from "../src/core/OperationLog";
import { join } from "node:path";
import { BrowserWindow, WebContentsView, session } from "electron";
import type { Snapshot, Page } from "../src/core/model";
import { normalizeUrl } from "../src/core/model";
import { fit } from "../src/core/ScaleManager";
import { isMuted } from "../src/core/AudioManager";
import type { Rect } from "../src/core/LayoutManager";
export class BrowserManager {
  volume = 100;
  presentationMuted = false;
  slots = new Map<string, number>();
  pageVolumes = new Map<string, number>();
  setPresentationMuted(value: boolean) {
    this.presentationMuted = value;
    this.setVolume(this.volume);
  }

  muted = new Map<string, boolean>();
  setVolume(value: number) {
    if (this.volume !== value)
      logOperation("audio.master_change", { previous: this.volume, value });
    this.volume = value;
    for (const [id, view] of this.views) {
      const beforeMuted = view.webContents.isAudioMuted();
      view.webContents.setAudioMuted(
        (this.presentationMuted && this.slots.get(id) !== 0) ||
          value === 0 ||
          !!this.muted.get(id),
      );
      if (beforeMuted !== view.webContents.isAudioMuted())
        logOperation("audio.native_mute", {
          slot: this.slots.get(id),
          muted: view.webContents.isAudioMuted(),
        });
      view.webContents.send("audio-settings", {
        master: value,
        page: this.pageVolumes.get(id) ?? 100,
      });
    }
  }
  views = new Map<string, WebContentsView>();
  requested = new Map<string, string>();
  constructor(
    private window: BrowserWindow,
    private onOpen: (url: string) => void = () => {},
    private onSiteVolume: (
      id: string,
      value: Page["volume"],
    ) => void = () => {},
  ) {
    const shared = session.fromPartition("persist:multiview");
    shared.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );
    shared.setPermissionCheckHandler(() => false);
  }
  sync(snapshot: Snapshot) {
    const ids = new Set(snapshot.pages.flatMap((p) => (p ? [p.id] : [])));
    for (const [id, v] of this.views)
      if (!ids.has(id)) {
        logOperation("web.page_closed", { slot: this.slots.get(id) });
        this.window.contentView.removeChildView(v);
        v.webContents.close();
        this.views.delete(id);
        this.requested.delete(id);
        this.muted.delete(id);
        this.pageVolumes.delete(id);
        this.slots.delete(id);
      }
    snapshot.pages.forEach((p, slot) => {
      if (!p) return;
      this.slots.set(p.id, slot);
      let view = this.views.get(p.id);
      if (!view) {
        logOperation("web.page_created", { slot });
        view = new WebContentsView({
          webPreferences: {
            preload: join(__dirname, "media-preload.cjs"),
            partition: "persist:multiview",
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            backgroundThrottling: false,
            autoplayPolicy: "no-user-gesture-required",
          },
        });
        view.setBackgroundColor("#10141d");
        this.views.set(p.id, view);
        this.window.contentView.addChildView(view);
        view.setVisible(false);
        const wc = view.webContents;
        wc.on("focus", () =>
          logOperation("web.focus", { slot: this.slots.get(p.id) }),
        );
        wc.ipc.on("web-operation", (event, name, details) => {
          if (event.sender !== wc || event.senderFrame !== wc.mainFrame) return;
          const entry = sanitizeOperation(name, details);
          if (entry && entry.event.startsWith("web."))
            logOperation(entry.event, {
              ...entry.details,
              slot: this.slots.get(p.id),
            });
        });
        wc.ipc.on("site-volume", (event, value) => {
          if (
            event.sender !== wc ||
            event.senderFrame !== wc.mainFrame ||
            ![0, 25, 50, 75, 100].includes(value)
          )
            return;
          if (this.pageVolumes.get(p.id) !== value) {
            logOperation("audio.site_sync", {
              slot: this.slots.get(p.id),
              previous: this.pageVolumes.get(p.id),
              value,
            });
            this.pageVolumes.set(p.id, value);
            this.onSiteVolume(p.id, value);
          }
        });
        wc.on("before-input-event", (event, input) => {
          if (input.type !== "keyDown") return;
          if (input.key === "F11") {
            event.preventDefault();
            this.window.setFullScreen(!this.window.isFullScreen());
          } else if (input.key === "Escape" && this.window.isFullScreen()) {
            event.preventDefault();
            this.window.setFullScreen(false);
          }
        });
        let middleUntil = 0;
        wc.on("before-mouse-event", (_event, mouse) => {
          if (mouse.type === "mouseDown")
            middleUntil = mouse.button === "middle" ? Date.now() + 1000 : 0;
        });
        wc.ipc.on("open-middle-link", (event, url) => {
          if (event.sender !== wc || event.senderFrame !== wc.mainFrame) return;
          middleUntil = 0;
          try {
            this.onOpen(normalizeUrl(url));
          } catch {}
        });
        wc.setWindowOpenHandler(({ url }) => {
          try {
            const safe = normalizeUrl(url);
            logOperation("web.new_window", {
              slot: this.slots.get(p.id),
              status: Date.now() < middleUntil ? "middle" : "left",
            });
            if (Date.now() < middleUntil) {
              middleUntil = 0;
              this.onOpen(safe);
            } else void wc.loadURL(safe).catch(() => {});
          } catch {}
          return { action: "deny" };
        });
        wc.on("will-navigate", (event, url) => {
          try {
            normalizeUrl(url);
          } catch {
            event.preventDefault();
          }
        });
        wc.on("will-redirect", (event, url) => {
          try {
            normalizeUrl(url);
          } catch {
            event.preventDefault();
          }
        });
        const publish = () => {
          if (!this.window.isDestroyed())
            this.window.webContents.send("page-event", {
              id: p.id,
              title: wc.getTitle(),
              url: wc.getURL(),
              back: wc.navigationHistory.canGoBack(),
              forward: wc.navigationHistory.canGoForward(),
            });
        };
        wc.on("page-title-updated", publish);
        wc.on("did-navigate", () => {
          logOperation("web.navigation_complete", {
            slot: this.slots.get(p.id),
            status: "success",
          });
          publish();
        });
        wc.on("dom-ready", () =>
          wc.send("audio-settings", {
            master: this.volume,
            page: this.pageVolumes.get(p.id) ?? 100,
          }),
        );
        wc.on("did-navigate-in-page", publish);
        wc.on("did-fail-load", (_e, code, description, _url, main) => {
          if (main && code !== -3)
            logOperation("web.load_failed", {
              slot: this.slots.get(p.id),
              code,
              status: "failed",
            });
          if (main && code !== -3)
            this.window.webContents.send("page-event", {
              id: p.id,
              error: description,
            });
        });
        this.requested.set(p.id, p.url);
        void wc.loadURL(normalizeUrl(p.url)).catch(() => {});
      } else if (this.requested.get(p.id) !== p.url) {
        this.requested.set(p.id, p.url);
        if (view.webContents.getURL() !== p.url)
          void view.webContents.loadURL(normalizeUrl(p.url)).catch(() => {});
      }
      this.pageVolumes.set(p.id, p.volume);
      this.muted.set(p.id, isMuted(p, slot));
      const previousMute = view.webContents.isAudioMuted();
      view.webContents.setAudioMuted(
        (this.presentationMuted && slot !== 0) ||
          this.volume === 0 ||
          isMuted(p, slot),
      );
      if (previousMute !== view.webContents.isAudioMuted())
        logOperation("audio.native_mute", {
          slot,
          muted: view.webContents.isAudioMuted(),
          value: p.volume,
          status: "success",
        });
    });
  }
  bounds(items: { id: string; rect: Rect; scale: Page["scale"] }[]) {
    const visible = new Set(items.map((x) => x.id));
    for (const [id, v] of this.views) if (!visible.has(id)) v.setVisible(false);
    for (const item of items) {
      const v = this.views.get(item.id);
      if (!v) continue;
      if (item.scale.mode === "responsive") {
        v.webContents.disableDeviceEmulation();
        v.setBounds(item.rect);
        v.setVisible(true);
        continue;
      }
      const { rect, factor } = fit(item.rect, item.scale);
      v.setBounds(rect);
      v.webContents.enableDeviceEmulation({
        screenPosition: "desktop",
        viewPosition: { x: 0, y: 0 },
        screenSize: { width: item.scale.width, height: item.scale.height },
        viewSize: { width: item.scale.width, height: item.scale.height },
        deviceScaleFactor: 0,
        scale: factor,
      });
      v.setVisible(true);
    }
  }
  navigate(id: string, action: string, url?: string) {
    const wc = this.views.get(id)?.webContents;
    if (!wc) return;
    logOperation("web.navigate", {
      slot: this.slots.get(id),
      control: "navigation",
      status: "requested",
    });
    if (action === "navigate" && url) {
      const safe = normalizeUrl(url);
      this.requested.set(id, safe);
      void wc.loadURL(safe).catch(() => {});
    }
    if (action === "reload") wc.reload();
    if (action === "back" && wc.navigationHistory.canGoBack())
      wc.navigationHistory.goBack();
    if (action === "forward" && wc.navigationHistory.canGoForward())
      wc.navigationHistory.goForward();
  }
  hideViews() {
    for (const v of this.views.values()) v.setVisible(false);
  }
  destroy() {
    for (const v of this.views.values())
      if (!v.webContents.isDestroyed()) v.webContents.close();
    this.views.clear();
    this.slots.clear();
    this.requested.clear();
    this.muted.clear();
    this.pageVolumes.clear();
  }
}
