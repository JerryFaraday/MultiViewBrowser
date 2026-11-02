import { it, expect } from "vitest";
import { viewBounds } from "../src/core/ViewBounds";
it("原生网页向内取整，始终避开工具栏和边界线", () => {
  for (const offset of [0, 0.25, 0.5, 0.75]) {
    const area = {
      x: 10 + offset,
      y: 55 + offset,
      width: 319.5,
      height: 240.75,
    };
    const r = viewBounds(area, { width: 1600, height: 900 })!;
    expect(r.x).toBeGreaterThanOrEqual(area.x + 2);
    expect(r.y).toBeGreaterThanOrEqual(area.y + 2);
    expect(r.x + r.width).toBeLessThanOrEqual(area.x + area.width - 2);
    expect(r.y + r.height).toBeLessThanOrEqual(area.y + area.height - 2);
  }
});
it("窗口裁剪不会创建越界或负尺寸网页", () => {
  expect(
    viewBounds(
      { x: 790, y: 590, width: 40, height: 40 },
      { width: 800, height: 600 },
    ),
  ).toEqual({ x: 792, y: 592, width: 8, height: 8 });
  expect(
    viewBounds(
      { x: 0, y: 0, width: 3, height: 3 },
      { width: 800, height: 600 },
    ),
  ).toBeNull();
  expect(
    viewBounds(
      { x: 850, y: 10, width: 100, height: 100 },
      { width: 800, height: 600 },
    ),
  ).toBeNull();
});
