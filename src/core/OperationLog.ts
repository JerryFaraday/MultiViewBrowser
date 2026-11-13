/** Shared privacy boundary: callers cannot persist arbitrary strings or payloads. */
export const operationEvents = [
  "session.start",
  "session.end",
  "app.ready",
  "app.close_requested",
  "app.window_closed",
  "app.focus",
  "app.blur",
  "app.resize",
  "app.maximize",
  "app.restore",
  "app.minimize",
  "app.fullscreen",
  "app.error",
  "ui.click",
  "ui.hover",
  "ui.double_click",
  "ui.pointer_down",
  "ui.input",
  "ui.change",
  "ui.submit",
  "ui.key",
  "ui.drag_start",
  "ui.drag_end",
  "ui.drop",
  "web.click",
  "web.middle_click",
  "web.input",
  "web.key",
  "web.scroll",
  "web.focus",
  "web.navigate",
  "web.navigation_complete",
  "web.load_failed",
  "web.new_window",
  "web.new_window_ignored",
  "web.page_created",
  "web.page_closed",
  "config.save",
  "config.load",
  "config.change",
  "data.import",
  "data.export",
  "audio.site_sync",
  "audio.page_change",
  "audio.native_mute",
  "audio.master_change",
  "audio.popup_open",
  "audio.popup_close",
  "drag.begin",
  "drag.end",
  "drag.drop",
  "drag.cancel",
  "layout.presentation",
  "ipc.failed",
] as const;
export type OperationEvent = (typeof operationEvents)[number];
export type LogDetails = {
  action?: string;
  slot?: number;
  from?: number;
  to?: number;
  value?: number;
  previous?: number;
  count?: number;
  muted?: boolean;
  changed?: boolean;
  area?: string;
  control?: string;
  status?: string;
  code?: number;
};
const areas = new Set([
  "toolbar",
  "pane",
  "favorites",
  "bookmarks",
  "dialog",
  "page",
  "window",
  "other",
]);
const controls = new Set([
  "button",
  "range",
  "text",
  "select",
  "checkbox",
  "form",
  "handle",
  "divider",
  "link",
  "video",
  "input",
  "other",
  "layout",
  "workspace",
  "favorite",
  "group",
  "audio",
  "navigation",
]);
const statuses = new Set([
  "requested",
  "success",
  "cancelled",
  "failed",
  "left",
  "middle",
  "right",
  "input",
  "shortcut",
  "other",
  "normal",
  "exit",
]);
const actions = new Set([
  "stash.add",
  "stash.show",
  "stash.open",
  "stash.close",
  "stash.reorder",
  "layout.open",
  "layout.apply",
  "layout.save",
  "layout.reset",
  "favorites.toggle",
  "favorites.add",
  "favorites.open",
  "favorites.edit",
  "favorites.delete",
  "group.add",
  "bookmarks.toggle",
  "page.add",
  "page.close",
  "page.reload",
  "page.back",
  "page.forward",
  "page.scale",
  "page.maximize",
  "page.select",
  "workspace.open",
  "workspace.save",
  "settings.open",
  "settings.change",
  "data.import",
  "data.export",
  "audio.toggle",
  "audio.master",
  "audio.page",
  "dialog.save",
  "dialog.cancel",
  "dialog.close",
  "item.rename",
  "item.delete",
  "item.overwrite",
  "item.apply",
  "text.edit",
  "drag.handle",
  "drag.divider",
]);
export function sanitizeOperation(
  event: unknown,
  raw: unknown,
): { event: OperationEvent; details: LogDetails } | null {
  if (
    typeof event !== "string" ||
    !(operationEvents as readonly string[]).includes(event)
  )
    return null;
  const details: LogDetails = {};
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const key of [
    "slot",
    "from",
    "to",
    "value",
    "previous",
    "count",
    "code",
  ] as const) {
    const value = data[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      Math.abs(value) <= 100000
    )
      details[key] = value;
  }
  for (const key of ["muted", "changed"] as const)
    if (typeof data[key] === "boolean") details[key] = data[key];
  if (typeof data.area === "string" && areas.has(data.area))
    details.area = data.area;
  if (typeof data.control === "string" && controls.has(data.control))
    details.control = data.control;
  if (typeof data.status === "string" && statuses.has(data.status))
    details.status = data.status;
  if (typeof data.action === "string" && actions.has(data.action))
    details.action = data.action;
  return { event: event as OperationEvent, details };
}
