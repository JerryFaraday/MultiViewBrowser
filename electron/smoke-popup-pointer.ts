import { BrowserWindow, screen } from "electron";
import type { Rect } from "../src/core/LayoutManager";

/** Test-only: synthetic DOM input does not move the Windows cursor. Model the
 * matching native DIP position explicitly while testing a normal open path.
 * Native taskbar/Peek verification must be performed separately.
 */
export async function withPopupPointer<T>(
  window: BrowserWindow,
  cssRect: Rect,
  action: () => Promise<T>,
) {
  const original = screen.getCursorScreenPoint;
  screen.getCursorScreenPoint = () => {
    const o = window.getContentBounds(),
      z = window.webContents.getZoomFactor();
    return {
      x: Math.round(o.x + (cssRect.x + cssRect.width / 2) * z),
      y: Math.round(o.y + (cssRect.y + cssRect.height / 2) * z),
    };
  };
  try {
    return await action();
  } finally {
    screen.getCursorScreenPoint = original;
  }
}
