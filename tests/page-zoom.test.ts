import { it, expect } from "vitest";
import { nextPageZoom } from "../src/core/PageZoom";
import { newPage, pageSchema } from "../src/core/model";
import { swapPages } from "../src/core/AudioManager";
it("原生页面缩放遵循常见档位、边界与100%重置", () => {
  expect(nextPageZoom(1, "in")).toBe(1.1);
  expect(nextPageZoom(1.1, "in")).toBe(1.25);
  expect(nextPageZoom(1, "out")).toBe(0.9);
  expect(nextPageZoom(0.25, "out")).toBe(0.25);
  expect(nextPageZoom(5, "in")).toBe(5);
  expect(nextPageZoom(3, "reset")).toBe(1);
});
it("旧配置默认100%，交换页面时保留各自缩放状态", () => {
  const a = newPage("https://example.com"),
    b = newPage("https://example.com");
  const { pageZoom: _zoom, ...legacy } = a;
  expect(pageSchema.parse(legacy).pageZoom).toBe(1);
  a.pageZoom = 1.5;
  b.pageZoom = 0.8;
  const swapped = swapPages([a, b], 0, 1);
  expect(swapped.map((p) => p.pageZoom)).toEqual([0.8, 1.5]);
  expect(() => pageSchema.parse({ ...a, pageZoom: 0 })).toThrow();
});
