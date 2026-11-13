import { contextBridge, ipcRenderer, webFrame } from "electron";
type UiRect = { x: number; y: number; width: number; height: number };
const nativeRect = (r: UiRect) => {
  const f = webFrame.getZoomFactor(),
    x = Math.round(r.x * f),
    y = Math.round(r.y * f);
  return {
    x,
    y,
    width: Math.round((r.x + r.width) * f) - x,
    height: Math.round((r.y + r.height) * f) - y,
  };
};
contextBridge.exposeInMainWorld("browser", {
  settingsView: (active: boolean, id?: string) =>
    ipcRenderer.invoke("settings-view", active, id),
  onSettingsEscape: (fn: () => void) => {
    const h = () => fn();
    ipcRenderer.on("settings-escape", h);
    return () => ipcRenderer.removeListener("settings-escape", h);
  },
  settingsAction: (action: string) =>
    ipcRenderer.invoke("settings-action", action),
  onCloseFlush: (fn: () => void) => {
    const h = () => fn();
    ipcRenderer.on("close-flush", h);
    return () => ipcRenderer.removeListener("close-flush", h);
  },
  closeReady: (config: unknown) => ipcRenderer.invoke("close-ready", config),
  hideStash: () => ipcRenderer.invoke("stash-hide"),
  onStashDrag: (fn: (id: string, targets: unknown) => void) => {
    const h = (_e: unknown, id: string, targets: unknown) => {
      const f = webFrame.getZoomFactor();
      fn(
        id,
        (targets as { rect: UiRect }[]).map((t) => ({
          ...t,
          rect: {
            x: t.rect.x / f,
            y: t.rect.y / f,
            width: t.rect.width / f,
            height: t.rect.height / f,
          },
        })),
      );
    };
    ipcRenderer.on("stash-drag-request", h);
    return () => ipcRenderer.removeListener("stash-drag-request", h);
  },
  newPage: (url: string) => ipcRenderer.invoke("page-new", url),
  showStash: (rect: UiRect) =>
    ipcRenderer.invoke("stash-show", nativeRect(rect)),
  zoomPage: (id: string, direction: string) =>
    ipcRenderer.invoke("page-zoom", id, direction),
  onZoomShortcut: (fn: (direction: "in" | "out" | "reset") => void) => {
    const handler = (_e: unknown, direction: "in" | "out" | "reset") =>
      fn(direction);
    ipcRenderer.on("page-zoom-shortcut", handler);
    return () => ipcRenderer.removeListener("page-zoom-shortcut", handler);
  },
  exchange: (config: unknown, from: number, to: number) =>
    ipcRenderer.invoke("exchange-pages", config, from, to),
  onPageFocus: (fn: (id: string) => void) => {
    const handler = (_e: unknown, id: string) => fn(id);
    ipcRenderer.on("page-focus", handler);
    return () => ipcRenderer.removeListener("page-focus", handler);
  },
  showScale: (id: string, rect: unknown, locked: boolean) =>
    ipcRenderer.invoke("scale-show", id, nativeRect(rect as UiRect), locked),
  hideScale: () => ipcRenderer.invoke("scale-hide"),
  log: (event: string, details: unknown) =>
    ipcRenderer.invoke("operation-log", event, details),
  beginDrag: (id: string, targets: { rect: UiRect }[]) =>
    ipcRenderer.invoke(
      "drag-begin",
      id,
      targets.map((t) => ({ ...t, rect: nativeRect(t.rect) })),
    ),
  onDragFinished: (fn: () => void) => {
    const handler = () => fn();
    ipcRenderer.on("drag-finished", handler);
    return () => ipcRenderer.removeListener("drag-finished", handler);
  },
  endDrag: () => ipcRenderer.invoke("drag-end"),
  showVolume: (id: string, rect: unknown) =>
    ipcRenderer.invoke("volume-show", id, nativeRect(rect as UiRect)),
  hideVolume: () => ipcRenderer.invoke("volume-hide"),
  onSession: (fn: (data: unknown, config: unknown) => void) => {
    const handler = (_e: unknown, data: unknown, config: unknown) =>
      fn(data, config);
    ipcRenderer.on("session-update", handler);
    return () => ipcRenderer.removeListener("session-update", handler);
  },
  presentation: (value: boolean) => ipcRenderer.invoke("presentation", value),
  load: () => ipcRenderer.invoke("config-load"),
  save: (config: unknown) => ipcRenderer.invoke("config-save", config),
  bounds: (items: { rect: UiRect }[]) =>
    ipcRenderer.invoke(
      "bounds",
      items.map((t) => ({ ...t, rect: nativeRect(t.rect) })),
    ),
  navigate: (id: string, action: string, url?: string) =>
    ipcRenderer.invoke("navigate", id, action, url),
  transfer: (action: string, scope?: string) =>
    ipcRenderer.invoke("transfer", action, scope),
  onPage: (fn: (event: unknown) => void) => {
    const handler = (_e: unknown, data: unknown) => fn(data);
    ipcRenderer.on("page-event", handler);
    return () => ipcRenderer.removeListener("page-event", handler);
  },
});
