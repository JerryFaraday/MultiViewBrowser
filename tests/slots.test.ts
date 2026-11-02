import { it, expect } from "vitest";
import { openInEmptySlot } from "../src/core/SlotManager";
import { snapshotSchema, newPage } from "../src/core/model";
import { swapPages } from "../src/core/AudioManager";
it("空槽位可保存且拖到空槽不会补位", () => {
  const a = newPage("https://a.com"),
    b = newPage("https://b.com");
  const s = snapshotSchema.parse({
    tree: { kind: "leaf", slot: 0 },
    layoutId: "x",
    pages: [a, null, b],
  });
  expect(s.pages[1]).toBeNull();
  const result = swapPages(s.pages, 2, 1);
  expect(result[0]).toBe(s.pages[0]);
  expect(result[1]?.id).toBe(b.id);
  expect(result[2]).toBeNull();
});
it("新窗口按可见槽位顺序填空，满槽不响应，不覆盖旧网页", () => {
  const a = newPage("https://a.com");
  const tree = {
    kind: "split" as const,
    axis: "x" as const,
    ratios: [0.5, 0.5],
    children: [
      { kind: "leaf" as const, slot: 0 },
      { kind: "leaf" as const, slot: 1 },
    ],
  };
  const s = { tree, layoutId: "x", pages: [null, a] };
  const result = openInEmptySlot(s, "https://new.com")!;
  expect(result.pages[0]?.url).toBe("https://new.com/");
  expect(result.pages[1]).toBe(a);
  expect(s.pages[0]).toBeNull();
  expect(openInEmptySlot(result, "https://extra.com")).toBeNull();
});
