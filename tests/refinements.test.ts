import { it, expect } from "vitest";
import {
  swapPages,
  isMuted,
  snapVolume,
  stepVolume,
} from "../src/core/AudioManager";
import { moveItem, moveFavorite } from "../src/core/FavoritesManager";
import { newPage, configSchema } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
it("拖入主窗口清除以前的手动静音，移出后遵循自动策略", () => {
  const pages = [newPage("https://a.com"), newPage("https://b.com")];
  pages[1].audio = "muted";
  const result = swapPages(pages, 1, 0);
  expect(isMuted(result[0], 0)).toBe(false);
  expect(result[0].id).toBe(pages[1].id);
  expect(pages[1].audio).toBe("muted");
  const back = swapPages(result, 1, 0);
  expect(isMuted(back[1], 1)).toBe(true);
  expect(swapPages(pages, 0, 1)[0].audio).toBe("auto");
});
it("吸附附近四个刻度且键盘总是跳至下一个 5 的倍数", () => {
  for (const mark of [25, 50, 75, 100]) {
    expect(snapVolume(mark - 3)).toBe(mark);
    expect(snapVolume(mark + 3)).toBe(mark);
  }
  expect(snapVolume(104)).toBe(104);
  expect(stepVolume(103, 1)).toBe(105);
  expect(stepVolume(103, -1)).toBe(100);
  expect(stepVolume(100, -1)).toBe(95);
  expect(stepVolume(150, 1)).toBe(150);
  expect(stepVolume(0, -1)).toBe(0);
});
it("拖动分组和收藏可以前后排序及跨组移动", () => {
  expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  expect(moveItem(["a", "b", "c"], 0, 2, true)).toEqual(["b", "c", "a"]);
  const f = (id: string, group: string) => ({
    id,
    group,
    name: id,
    url: "https://example.com",
    note: "",
    created: "",
  });
  const items = [f("a", "A"), f("b", "A"), f("c", "B")];
  expect(moveFavorite(items, "b", "A", "a").map((f) => f.id)).toEqual([
    "b",
    "a",
    "c",
  ]);
  const moved = moveFavorite(items, "a", "B", "c", true);
  expect(moved.map((f) => f.id)).toEqual(["b", "c", "a"]);
  expect(moved[2].group).toBe("B");
  expect(items[0].group).toBe("A");
});
it("收藏栏开关和拖动后的顺序可持久化，兼容旧配置", () => {
  const { bookmarksBar, ...legacy } = defaults();
  expect(configSchema.parse(legacy).bookmarksBar).toBe(false);
  const c = defaults();
  c.bookmarksBar = true;
  c.groups = ["B", "A"];
  expect(configSchema.parse(JSON.parse(JSON.stringify(c)))).toEqual(c);
});
