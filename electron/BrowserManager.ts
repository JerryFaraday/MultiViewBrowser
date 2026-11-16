import { logOperation } from "./OperationLogger";
import { themePalettes } from "../src/core/Theme";
import { nextPageZoom } from "../src/core/PageZoom";
import { ZoomFeedback } from "./ZoomFeedback";
import { MediaSuspension } from "./MediaSuspension";
import { StashRelease } from "./StashRelease";
import {
  defaultPreferences,
  allowPermission,
  type Preferences,
} from "../src/core/Preferences";
import { isLiveProfileLink } from "../src/core/NavigationPolicy";
import { sanitizeOperation } from "../src/core/OperationLog";
import { join } from "node:path";
import { BrowserWindow, WebContentsView, session } from "electron";
import type { Snapshot, Page } from "../src/core/model";
import { normalizeUrl } from "../src/core/model";
import { fit } from "../src/core/ScaleManager";
import { isMuted } from "../src/core/AudioManager";
import type { Rect } from "../src/core/LayoutManager";
export class BrowserManager {
  private disposed = false;
  preferences: Preferences = defaultPreferences();
  private retries = new Map<
    string,
    { url: string; count: number; timer?: ReturnType<typeof setTimeout> }
  >();
  setPreferences(prefs: Preferences) {
    if (prefs.theme !== this.preferences.theme)
      for (const view of this.views.values())
        view.setBackgroundColor(themePalettes[prefs.theme].background);
    this.zoomFeedback.setUiScale(prefs.uiScale);
    this.preferences = prefs;
    if (
      this.window.webContents.getBackgroundThrottling() !==
      prefs.backgroundThrottling
    )
      this.window.webContents.setBackgroundThrottling(
        prefs.backgroundThrottling,
      );
    for (const v of this.views.values())
      if (
        v.webContents.getBackgroundThrottling() !== prefs.backgroundThrottling
      )
        v.webContents.setBackgroundThrottling(prefs.backgroundThrottling);
    this.setVolume(this.volume);
    this.applyMediaPolicies();
    this.configureRelease();
    if (prefs.retryCount === 0) {
      for (const item of this.retries.values()) clearTimeout(item.timer);
      this.retries.clear();
    }
  }
  private zoomFeedback: ZoomFeedback;
  pageZooms = new Map<string, number>();
  changePageZoom(id: string, direction: "in" | "out" | "reset") {
    if (!this.views.has(id)) return;
    const value = nextPageZoom(this.pageZooms.get(id) ?? 1, direction);
    this.pageZooms.set(id, value);
    this.bounds(this.visibleBounds);
    this.onPageZoom(id, value);
    const view = this.views.get(id)!;
    if (view.getVisible())
      void this.zoomFeedback.show(
        id,
        view.getBounds(),
        view.webContents.getZoomFactor(),
      );
  }
  private frameZoomPages = new Set<string>();
  private frameZoomFactors = new Map<string, number>();
  private visibleBounds: { id: string; rect: Rect; scale: Page["scale"] }[] =
    [];
  private pendingFocus?: string;
  private htmlFullscreen = new Set<string>();
  private monitorOwner?: string;
  private applicationFullscreen = false;
  private fullscreenMaximized = false;
  private fullscreenFocus?: string;
  toggleApplicationFullscreen() {
    this.applicationFullscreen = !(this.monitorOwner
      ? this.applicationFullscreen
      : this.window.isFullScreen());
    if (!this.monitorOwner)
      this.window.setFullScreen(this.applicationFullscreen);
  }
  exitApplicationFullscreen() {
    this.applicationFullscreen = false;
    if (!this.monitorOwner) this.window.setFullScreen(false);
  }
  hasHtmlFullscreen() {
    return this.htmlFullscreen.size > 0;
  }
  windowState() {
    return {
      ...this.window.getNormalBounds(),
      maximized: this.monitorOwner
        ? this.fullscreenMaximized
        : this.window.isMaximized(),
      fullscreen: this.monitorOwner
        ? this.applicationFullscreen
        : this.window.isFullScreen(),
    };
  }
  private syncFullscreenRole() {
    if (this.disposed) return;
    const owner = [...this.htmlFullscreen].find(
      (id) => this.slots.get(id) === 0 && this.views.has(id),
    );
    if (owner === this.monitorOwner) return;
    if (owner && !this.monitorOwner) {
      this.applicationFullscreen = this.window.isFullScreen();
      this.fullscreenMaximized = this.window.isMaximized();
      this.fullscreenFocus = [...this.views].find(([, v]) =>
        v.webContents.isFocused(),
      )?.[0];
    }
    this.monitorOwner = owner;
    this.window.setFullScreen(!!owner || this.applicationFullscreen);
    if (!owner && this.fullscreenFocus) {
      this.pendingFocus ??= this.fullscreenFocus;
      this.fullscreenFocus = undefined;
    }
    this.bounds(this.visibleBounds);
  }
  focusAfterExchange(id: string) {
    this.pendingFocus = id;
  }
  volume = 100;
  presentationMuted = false;
  slots = new Map<string, number>();
  pageVolumes = new Map<string, number>();
  setPresentationMuted(value: boolean) {
    this.presentationMuted = value;
    this.setVolume(this.volume);
    this.applyMediaPolicies();
  }
  private suspension = new MediaSuspension();
  private release = new StashRelease();
  private retained: { id: string; parkedAt?: number }[] = [];
  private settingsOpen = false;
  setSettingsOpen(active: boolean) {
    this.settingsOpen = active;
    this.applyMediaPolicies();
  }
  private applyMediaPolicies(refresh = false) {
    for (const [id, v] of this.views)
      this.suspension.apply(
        id,
        v.webContents,
        (this.settingsOpen && this.preferences.pauseInSettings) ||
          (this.presentationMuted &&
            this.slots.get(id) !== 0 &&
            this.preferences.pauseOnMaximize),
        refresh,
      );
  }
  private configureRelease() {
    this.release.sync(this.preferences, this.retained, this.views, (id, v) => {
      if (this.views.get(id) !== v) return;
      this.retirePage(id, false);
      this.syncFullscreenRole();
    });
  }

  /** Native-instance retirement also covers IDs whose WebContents was already released. */
  private retirePage(id: string, close: boolean) {
    const view = this.views.get(id);
    clearTimeout(this.retries.get(id)?.timer);
    this.retries.delete(id);
    if (view) {
      this.window.contentView.removeChildView(view);
      if (close && !view.webContents.isDestroyed()) view.webContents.close();
    }
    this.views.delete(id);
    this.requested.delete(id);
    this.slots.delete(id);
    this.pageVolumes.delete(id);
    this.muted.delete(id);
    this.pageZooms.delete(id);
    this.frameZoomPages.delete(id);
    this.frameZoomFactors.delete(id);
    this.sentAudio.delete(id);
    this.htmlFullscreen.delete(id);
    this.emulations.delete(id);
    this.suspension.forget(id);
    this.zoomFeedback.remove(id);
    if (this.pendingFocus === id) this.pendingFocus = undefined;
  }
  muted = new Map<string, boolean>();
  private sentAudio = new Map<string, string>();
  setVolume(value: number) {
    if (this.volume !== value)
      logOperation("audio.master_change", { previous: this.volume, value });
    this.volume = value;
    for (const [id, view] of this.views) {
      const beforeMuted = view.webContents.isAudioMuted();
      const nextMuted =
        (this.presentationMuted &&
          this.preferences.muteOnMaximize &&
          this.slots.get(id) !== 0) ||
        value === 0 ||
        !!this.muted.get(id);
      if (beforeMuted !== nextMuted) view.webContents.setAudioMuted(nextMuted);
      if (beforeMuted !== view.webContents.isAudioMuted())
        logOperation("audio.native_mute", {
          slot: this.slots.get(id),
          muted: view.webContents.isAudioMuted(),
        });
      const settings = {
        master: value,
        page: this.pageVolumes.get(id) ?? 100,
      };
      const key = JSON.stringify(settings);
      if (this.sentAudio.get(id) !== key) {
        this.sentAudio.set(id, key);
        view.webContents.send("audio-settings", settings);
      }
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
    private onPageZoom: (id: string, value: number) => void = () => {},
  ) {
    this.zoomFeedback = new ZoomFeedback(window);
    for (const event of [
      "enter-full-screen",
      "leave-full-screen",
      "resize",
    ] as const)
      window.on(event as "resize", () => {
        if (this.monitorOwner) this.bounds(this.visibleBounds);
      });
    const shared = session.fromPartition("persist:multiview");
    shared.setPermissionRequestHandler((_wc, permission, callback, details) => {
      let origin = "";
      try {
        origin = new URL(details.requestingUrl).origin;
      } catch {}
      callback(
        permission === "fullscreen" ||
          allowPermission(
            this.preferences,
            origin,
            permission,
            "mediaTypes" in details ? details.mediaTypes : [],
          ),
      );
    });
    shared.setPermissionCheckHandler(
      (_wc, permission, origin, details) =>
        permission === "fullscreen" ||
        allowPermission(
          this.preferences,
          origin,
          permission,
          details.mediaType ? [details.mediaType] : [],
        ),
    );
  }
  sync(snapshot: Snapshot, retained: (Page & { parkedAt?: number })[] = []) {
    this.retained = retained;
    const entries = [...snapshot.pages, ...retained];
    const ids = new Set(entries.flatMap((p) => (p ? [p.id] : [])));
    const known = new Set([
      ...this.views.keys(),
      ...this.slots.keys(),
      ...this.pageZooms.keys(),
      ...this.muted.keys(),
      ...this.pageVolumes.keys(),
    ]);
    for (const id of known)
      if (!ids.has(id)) {
        this.retirePage(id, true);
        this.release.reset(id);
      }
    entries.forEach((p, index) => {
      const slot = index < snapshot.pages.length ? index : -1;
      if (!p) return;
      this.slots.set(p.id, slot);
      this.pageZooms.set(p.id, p.pageZoom ?? 1);
      if (slot >= 0) this.release.released.delete(p.id);
      if (slot < 0 && this.release.released.has(p.id)) return;
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
            backgroundThrottling: this.preferences.backgroundThrottling,
            disableHtmlFullscreenWindowResize: true,
            autoplayPolicy: "no-user-gesture-required",
          },
        });
        view.setBackgroundColor(
          themePalettes[this.preferences.theme].background,
        );
        this.views.set(p.id, view);
        this.window.contentView.addChildView(view);
        view.setVisible(false);
        const wc = view.webContents;
        wc.on("enter-html-full-screen", () => {
          this.htmlFullscreen.add(p.id);
          this.syncFullscreenRole();
          this.bounds(this.visibleBounds);
        });
        wc.on("leave-html-full-screen", () => {
          this.htmlFullscreen.delete(p.id);
          this.syncFullscreenRole();
          this.bounds(this.visibleBounds);
        });
        wc.ipc.on("page-dirty", (event) => {
          if (event.sender === wc) this.release.markDirty(p.id);
        });
        wc.on("did-frame-finish-load", () => this.applyMediaPolicies(true));
        wc.on("did-start-navigation", (_event, url, _inPlace, main) => {
          if (main && !_inPlace) {
            this.release.reset(p.id);
            this.emulations.delete(p.id);
            this.htmlFullscreen.delete(p.id);
            this.syncFullscreenRole();
          }
          const state = this.retries.get(p.id);
          if (main && state && state.url !== url) {
            clearTimeout(state.timer);
            this.retries.delete(p.id);
          }
        });
        wc.setZoomMode("isolated");
        wc.on("zoom-changed", (event, direction) => {
          event.preventDefault();
          this.changePageZoom(p.id, direction);
        });
        wc.on("did-frame-finish-load", () => {
          if (wc.isDestroyed() || !this.views.has(p.id)) return;
          const compatible =
            URL.canParse(wc.getURL()) &&
            new URL(wc.getURL()).hostname === "live.bilibili.com" &&
            wc.mainFrame.framesInSubtree.some((frame) => {
              try {
                const url = new URL(frame.url);
                return (
                  url.hostname === "oss.5eplay.com" &&
                  url.pathname.startsWith("/nesting_file/")
                );
              } catch {
                return false;
              }
            });
          const before = this.frameZoomPages.has(p.id);
          if (compatible) this.frameZoomPages.add(p.id);
          else this.frameZoomPages.delete(p.id);
          if (before !== compatible && this.views.get(p.id)?.getVisible())
            this.bounds(this.visibleBounds);
        });
        wc.on("focus", () => {
          logOperation("web.focus", { slot: this.slots.get(p.id) });
          this.window.webContents.send("page-focus", p.id);
        });
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
            this.sentAudio.delete(p.id);
            this.onSiteVolume(p.id, value);
          }
        });
        wc.on("before-input-event", (event, input) => {
          if (input.type !== "keyDown") return;
          if (input.control && !input.alt && !input.meta) {
            const direction =
              ["+", "="].includes(input.key) || input.code === "NumpadAdd"
                ? "in"
                : input.key === "-" || input.code === "NumpadSubtract"
                  ? "out"
                  : input.key === "0" || input.code === "Numpad0"
                    ? "reset"
                    : undefined;
            if (direction) {
              event.preventDefault();
              this.changePageZoom(p.id, direction);
              return;
            }
          }
          if (input.key === "F11") {
            event.preventDefault();
            this.toggleApplicationFullscreen();
          } else if (
            input.key === "Escape" &&
            this.window.isFullScreen() &&
            !this.htmlFullscreen.has(p.id)
          ) {
            event.preventDefault();
            this.exitApplicationFullscreen();
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
            if (
              Date.now() < middleUntil ||
              isLiveProfileLink(wc.getURL(), safe)
            ) {
              middleUntil = 0;
              this.onOpen(safe);
            } else void wc.loadURL(safe).catch(() => {});
          } catch {}
          return { action: "deny" };
        });
        wc.ipc.on("open-profile-link", (event, url) => {
          if (
            event.sender !== wc ||
            event.senderFrame !== wc.mainFrame ||
            typeof url !== "string"
          )
            return;
          if (isLiveProfileLink(wc.getURL(), url))
            this.onOpen(normalizeUrl(url));
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
        let lastPublished = "";
        const publish = () => {
          const payload = {
            id: p.id,
            title: wc.getTitle(),
            url: wc.getURL(),
            back: wc.navigationHistory.canGoBack(),
            forward: wc.navigationHistory.canGoForward(),
          };
          const key = JSON.stringify(payload);
          if (key === lastPublished) return;
          lastPublished = key;
          if (!this.window.isDestroyed())
            this.window.webContents.send("page-event", payload);
        };
        wc.on("page-title-updated", publish);
        wc.on("did-navigate", () => {
          clearTimeout(this.retries.get(p.id)?.timer);
          this.retries.delete(p.id);
          logOperation("web.navigation_complete", {
            slot: this.slots.get(p.id),
            status: "success",
          });
          publish();
          if (!this.window.isDestroyed())
            this.window.webContents.send("page-event", {
              id: p.id,
              loaded: true,
            });
        });
        wc.on("dom-ready", () => {
          const factor =
            this.frameZoomFactors.get(p.id) ?? this.pageZooms.get(p.id) ?? 1;
          wc.setZoomFactor(factor);
          wc.send("audio-settings", {
            master: this.volume,
            page: this.pageVolumes.get(p.id) ?? 100,
          });
          if (this.views.get(p.id)?.getVisible())
            this.bounds(this.visibleBounds);
        });
        wc.on("did-navigate-in-page", publish);
        wc.on("did-fail-load", (_e, code, description, _url, main) => {
          if (main && code === -3 && this.retries.get(p.id)?.url === _url) {
            clearTimeout(this.retries.get(p.id)?.timer);
            this.retries.delete(p.id);
          }
          if (
            main &&
            code !== -3 &&
            /^https?:\/\//.test(_url) &&
            this.preferences.retryCount > 0
          ) {
            let state = this.retries.get(p.id);
            if (!state || state.url !== _url) {
              state = { url: _url, count: 0 };
              this.retries.set(p.id, state);
            }
            clearTimeout(state.timer);
            if (state.count < this.preferences.retryCount) {
              state.count++;
              const attempt = state;
              state.timer = setTimeout(() => {
                if (
                  !wc.isDestroyed() &&
                  this.views.has(p.id) &&
                  this.retries.get(p.id) === attempt &&
                  this.preferences.retryCount > 0
                )
                  void wc.loadURL(attempt.url).catch(() => {});
              }, 1000 * state.count);
            }
          }
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
      this.muted.set(p.id, slot < 0 || isMuted(p, slot));
      const previousMute = view.webContents.isAudioMuted();
      const nextMute =
        (this.presentationMuted &&
          this.preferences.muteOnMaximize &&
          slot !== 0) ||
        this.volume === 0 ||
        slot < 0 ||
        isMuted(p, slot);
      if (previousMute !== nextMute) view.webContents.setAudioMuted(nextMute);
      if (previousMute !== view.webContents.isAudioMuted())
        logOperation("audio.native_mute", {
          slot,
          muted: view.webContents.isAudioMuted(),
          value: p.volume,
          status: "success",
        });
    });
    this.applyMediaPolicies();
    this.configureRelease();
    this.syncFullscreenRole();
  }
  bounds(items: { id: string; rect: Rect; scale: Page["scale"] }[]) {
    if (this.disposed) return;
    this.visibleBounds = items;
    if (this.monitorOwner) {
      const view = this.views.get(this.monitorOwner);
      if (view) {
        const size = this.window.getContentBounds();
        this.prepareFullscreen(this.monitorOwner, view);
        this.setBoundsIfChanged(view, {
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
        });
        for (const [id, v] of this.views) {
          const visible = id === this.monitorOwner;
          if (v.getVisible() !== visible) v.setVisible(visible);
        }
        this.zoomFeedback.hide();
      }
      return;
    }
    const visible = new Set(items.map((x) => x.id));
    for (const [id, v] of this.views)
      if (!visible.has(id) && v.getVisible()) v.setVisible(false);
    for (const item of items) {
      const v = this.views.get(item.id);
      if (!v) continue;
      if (this.htmlFullscreen.has(item.id)) {
        this.prepareFullscreen(item.id, v);
        this.setBoundsIfChanged(v, item.rect);
        if (!v.getVisible()) v.setVisible(true);
        continue;
      }
      const fitted = fit(item.rect, item.scale);
      const pageZoom = this.pageZooms.get(item.id) ?? 1;
      const combinedZoom = fitted.factor * pageZoom;
      const nativeZoom =
        this.frameZoomPages.has(item.id) &&
        item.scale.mode === "auto" &&
        combinedZoom >= 0.25 &&
        combinedZoom <= 5;
      if (!nativeZoom && this.frameZoomFactors.has(item.id)) {
        v.webContents.setZoomFactor(pageZoom);
        this.frameZoomFactors.delete(item.id);
      }
      if (
        !nativeZoom &&
        Math.abs(v.webContents.getZoomFactor() - pageZoom) > 0.0001
      )
        v.webContents.setZoomFactor(pageZoom);
      if (item.scale.mode === "responsive") {
        this.emulate(item.id, undefined);
        this.setBoundsIfChanged(v, item.rect);
        if (!v.getVisible()) v.setVisible(true);
        continue;
      }
      const { rect, factor } = fitted;
      this.setBoundsIfChanged(v, rect);
      if (nativeZoom) {
        this.emulate(item.id, undefined);
        if (!this.frameZoomFactors.has(item.id))
          v.webContents.setZoomMode("isolated");
        if (this.frameZoomFactors.get(item.id) !== combinedZoom) {
          this.frameZoomFactors.set(item.id, combinedZoom);
          v.webContents.setZoomFactor(combinedZoom);
        }
        if (!v.getVisible()) v.setVisible(true);
        continue;
      }
      this.emulate(item.id, {
        screenPosition: "desktop",
        viewPosition: { x: 0, y: 0 },
        screenSize: { width: item.scale.width, height: item.scale.height },
        viewSize: { width: item.scale.width, height: item.scale.height },
        deviceScaleFactor: 0,
        scale: factor,
      });
      if (!v.getVisible()) v.setVisible(true);
    }
    this.zoomFeedback.update(
      items.flatMap(({ id }) => {
        const view = this.views.get(id);
        return view?.getVisible()
          ? [
              {
                id,
                rect: view.getBounds(),
                factor: view.webContents.getZoomFactor(),
              },
            ]
          : [];
      }),
    );
    if (this.pendingFocus) {
      const view = this.views.get(this.pendingFocus);
      if (!view) this.pendingFocus = undefined;
      else if (view.getVisible()) {
        this.pendingFocus = undefined;
        this.window.focus();
        view.webContents.focus();
      }
    }
  }
  private emulations = new Map<string, string>();
  private prepareFullscreen(id: string, view: WebContentsView) {
    this.emulate(id, undefined);
    this.frameZoomFactors.delete(id);
    const zoom = this.pageZooms.get(id) ?? 1;
    if (Math.abs(view.webContents.getZoomFactor() - zoom) > 0.0001)
      view.webContents.setZoomFactor(zoom);
  }
  private emulate(id: string, params: Electron.Parameters | undefined) {
    const v = this.views.get(id);
    if (!v) return;
    const key = JSON.stringify(params ?? null);
    if (this.emulations.get(id) === key) return;
    this.emulations.set(id, key);
    if (params) v.webContents.enableDeviceEmulation(params);
    else v.webContents.disableDeviceEmulation();
  }
  private setBoundsIfChanged(v: WebContentsView, rect: Rect) {
    const before = v.getBounds();
    if (
      before.x !== rect.x ||
      before.y !== rect.y ||
      before.width !== rect.width ||
      before.height !== rect.height
    )
      v.setBounds(rect);
  }
  navigate(id: string, action: string, url?: string) {
    clearTimeout(this.retries.get(id)?.timer);
    this.retries.delete(id);
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
    this.zoomFeedback.hide();
    for (const v of this.views.values())
      if (v.getVisible()) v.setVisible(false);
  }
  destroy() {
    this.disposed = true;
    this.htmlFullscreen.clear();
    this.monitorOwner = undefined;
    this.release.destroy();
    for (const item of this.retries.values()) clearTimeout(item.timer);
    this.retries.clear();
    this.zoomFeedback.destroy();
    for (const v of this.views.values())
      if (!v.webContents.isDestroyed()) v.webContents.close();
    this.views.clear();
    this.slots.clear();
    this.requested.clear();
    this.muted.clear();
    this.pageVolumes.clear();
    this.pageZooms.clear();
    this.frameZoomPages.clear();
    this.frameZoomFactors.clear();
    this.visibleBounds = [];
    this.emulations.clear();
    this.sentAudio.clear();
  }
}
