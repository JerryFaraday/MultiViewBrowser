import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  presets,
  calculate,
  slots,
  resizePair,
  swap,
  validTree,
} from "../src/core/LayoutManager";
import { isMuted } from "../src/core/AudioManager";
import { fit } from "../src/core/ScaleManager";
import { newPage, normalizeUrl } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
import { ConfigStore, validateConfig } from "../electron/storage";
describe("布局", () => {
  it("16 种布局拥有连续唯一槽位且不重叠", () => {
    expect(presets).toHaveLength(16);
    expect(presets.map((p) => slots(p.tree).length)).toEqual([
      1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 6, 6, 8, 8, 9,
    ]);
    for (const p of presets) {
      expect(validTree(p.tree)).toBe(true);
      const rects = calculate(p.tree, { x: 0, y: 0, width: 1500, height: 900 });
      for (const a of rects) {
        expect(a.rect.width).toBeGreaterThan(0);
        expect(a.rect.height).toBeGreaterThan(0);
        for (const b of rects.filter((b) => b !== a))
          expect(
            a.rect.x + a.rect.width <= b.rect.x + 0.001 ||
              b.rect.x + b.rect.width <= a.rect.x + 0.001 ||
              a.rect.y + a.rect.height <= b.rect.y + 0.001 ||
              b.rect.y + b.rect.height <= a.rect.y + 0.001,
          ).toBe(true);
      }
    }
  });
  it("拖动保留比例总和、相邻项与最小值", () => {
    expect(resizePair([0.2, 0.3, 0.5], 0, 2, 0.1)).toEqual([
      0.4, 0.09999999999999998, 0.5,
    ]);
  });
  it("交换保持对象身份", () => {
    const a = {},
      b = {};
    const result = swap([a, b], 0, 1);
    expect(result[0]).toBe(b);
    expect(result[1]).toBe(a);
  });
});
it("音频手动优先且主窗口由位置决定", () => {
  const p = newPage("https://example.com");
  expect(isMuted(p, 0)).toBe(false);
  expect(isMuted(p, 1)).toBe(true);
  p.audio = "unmuted";
  expect(isMuted(p, 1)).toBe(false);
  p.audio = "muted";
  expect(isMuted(p, 0)).toBe(true);
});
it("contain 保持视口比例且居中", () => {
  const result = fit(
    { x: 0, y: 0, width: 1000, height: 1000 },
    newPage("https://example.com").scale,
  );
  expect(result.factor).toBeCloseTo(1000 / 1920);
  expect(result.rect.height).toBe(563);
  expect(result.rect.y).toBe(219);
});
it("配置写入、恢复及损坏回退", () => {
  const store = new ConfigStore(mkdtempSync(join(tmpdir(), "multiview-"))),
    c = defaults();
  store.save(c);
  c.groups.push("赛事");
  store.save(c);
  expect(store.load().groups).toContain("赛事");
  writeFileSync(store.file, "broken");
  expect(store.load().groups).toEqual(["常用"]);
  expect(() => validateConfig({ ...c, version: 9 })).toThrow();
});
it("拒绝非网页协议及非法分割树", () => {
  expect(() => normalizeUrl("file:///etc/passwd")).toThrow();
  const c = defaults();
  c.session.tree = {
    kind: "split",
    axis: "x",
    ratios: [0.5, 0.5],
    children: [
      { kind: "leaf", slot: 0 },
      { kind: "leaf", slot: 0 },
    ],
  };
  expect(() => validateConfig(c)).toThrow();
});
