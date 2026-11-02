import type { Rect } from "./LayoutManager";

/** Round inward: native child views paint above DOM borders, including at fractional DPI. */
export function viewBounds(
  area: Rect,
  viewport: { width: number; height: number },
  inset = 2,
): Rect | null {
  const x = Math.ceil(Math.max(0, area.x + inset));
  const y = Math.ceil(Math.max(0, area.y + inset));
  const right = Math.floor(
    Math.min(viewport.width, area.x + area.width - inset),
  );
  const bottom = Math.floor(
    Math.min(viewport.height, area.y + area.height - inset),
  );
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}
