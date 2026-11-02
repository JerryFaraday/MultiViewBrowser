import type { Rect } from "./LayoutManager";
import type { Page } from "./model";
export const resolutions = [
  { width: 1920, height: 1080, label: "1920 × 1080（1080p）" },
  { width: 2560, height: 1440, label: "2560 × 1440（1440p）" },
  { width: 3840, height: 2160, label: "3840 × 2160（4K）" },
] as const;

/** A temporary viewport override; the saved split-view setting stays intact. */
export function displayScale(
  scale: Page["scale"],
  mainMaximized: boolean,
): Page["scale"] {
  return mainMaximized
    ? { ...scale, mode: "auto", width: 2560, height: 1440 }
    : scale;
}

export function fit(container: Rect, scale: Page["scale"]) {
  const factor =
    scale.mode === "auto"
      ? Math.min(container.width / scale.width, container.height / scale.height)
      : scale.factor;
  const width = Math.min(container.width, Math.round(scale.width * factor)),
    height = Math.min(container.height, Math.round(scale.height * factor));
  return {
    factor,
    rect: {
      x: Math.round(container.x + (container.width - width) / 2),
      y: Math.round(container.y + (container.height - height) / 2),
      width: Math.max(1, width),
      height: Math.max(1, height),
    },
  };
}
