import type { BrowserWindow } from "electron";

/** HTML title tooltips are owned by Chromium's native widget, not our popup windows. */
export function installNativeTooltipDismissal(window: BrowserWindow) {
  const dismiss = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    // Invalidate Chromium's native hover target even when Windows sends no mouse move.
    window.webContents.sendInputEvent({ type: "mouseLeave", x: 0, y: 0 });
  };
  for (const event of ["blur", "hide", "minimize"] as const)
    window.on(event as "blur", dismiss);
  window.webContents.on("blur", dismiss);
  window.webContents.on("before-input-event", (_event, input) => {
    if (
      input.type === "keyDown" &&
      (input.key === "Alt" || (input.alt && input.key === "Tab"))
    )
      dismiss();
  });
}
