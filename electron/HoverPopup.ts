import { BrowserWindow, screen } from "electron";
import type { Rect } from "../src/core/LayoutManager";

/** IPC anchors and screen cursor positions are both Electron DIP coordinates.
 * DOM enter events alone can be stale during native window previews/transitions.
 * Call again after loading, immediately before making the popup visible.
 */
export function canOpenHoverPopup(parent: BrowserWindow, rect: Rect) {
  if (parent.isDestroyed() || !parent.isVisible() || parent.isMinimized())
    return false;
  if (!isHoverPopupOwnerActive(parent)) return false;
  const origin = parent.getContentBounds(),
    cursor = screen.getCursorScreenPoint(),
    x = cursor.x - origin.x,
    y = cursor.y - origin.y;
  return (
    x >= rect.x &&
    x < rect.x + rect.width &&
    y >= rect.y &&
    y < rect.y + rect.height
  );
}

/** Moving focus into an owned popup is still an application interaction. */
export function isHoverPopupOwnerActive(parent: BrowserWindow) {
  let active = BrowserWindow.getFocusedWindow();
  while (active && active !== parent) active = active.getParentWindow() ?? null;
  return active === parent;
}
