import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("browser", {
  newPage: (url: string) => ipcRenderer.invoke("page-new", url),
  showStash: (rect: unknown) => ipcRenderer.invoke("stash-show", rect),
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
    ipcRenderer.invoke("scale-show", id, rect, locked),
  hideScale: () => ipcRenderer.invoke("scale-hide"),
  log: (event: string, details: unknown) =>
    ipcRenderer.invoke("operation-log", event, details),
  beginDrag: (id: string, targets: unknown) =>
    ipcRenderer.invoke("drag-begin", id, targets),
  onDragFinished: (fn: () => void) => {
    const handler = () => fn();
    ipcRenderer.on("drag-finished", handler);
    return () => ipcRenderer.removeListener("drag-finished", handler);
  },
  endDrag: () => ipcRenderer.invoke("drag-end"),
  showVolume: (id: string, rect: unknown) =>
    ipcRenderer.invoke("volume-show", id, rect),
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
  bounds: (items: unknown) => ipcRenderer.invoke("bounds", items),
  navigate: (id: string, action: string, url?: string) =>
    ipcRenderer.invoke("navigate", id, action, url),
  transfer: (action: string) => ipcRenderer.invoke("transfer", action),
  onPage: (fn: (event: unknown) => void) => {
    const handler = (_e: unknown, data: unknown) => fn(data);
    ipcRenderer.on("page-event", handler);
    return () => ipcRenderer.removeListener("page-event", handler);
  },
});
