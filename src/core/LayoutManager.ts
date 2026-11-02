import type { Tree } from "./model";
const leaf = (slot: number): Tree => ({ kind: "leaf", slot });
const split = (
  axis: "x" | "y",
  children: Tree[],
  ratios = children.map(() => 1 / children.length),
): Tree => ({ kind: "split", axis, children, ratios });
const row = (...slots: number[]) => split("x", slots.map(leaf));
const col = (...slots: number[]) => split("y", slots.map(leaf));
const grid = (w: number, h: number) =>
  split(
    "y",
    Array.from({ length: h }, (_, y) =>
      row(...Array.from({ length: w }, (_, x) => y * w + x)),
    ),
  );
const trees: Tree[] = [
  leaf(0),
  row(0, 1),
  col(0, 1),
  col(0, 1, 2),
  row(0, 1, 2),
  split("x", [leaf(0), col(1, 2)]),
  split("y", [leaf(0), row(1, 2)]),
  grid(2, 2),
  col(0, 1, 2, 3),
  split("x", [leaf(0), col(1, 2, 3)]),
  split("y", [leaf(0), row(1, 2, 3)]),
  grid(3, 2),
  split("y", [split("x", [leaf(0), col(1, 2)]), row(3, 4, 5)], [2 / 3, 1 / 3]),
  grid(4, 2),
  split(
    "y",
    [split("x", [leaf(0), col(1, 2, 3)], [0.75, 0.25]), row(4, 5, 6, 7)],
    [0.75, 0.25],
  ),
  grid(3, 3),
];
const names = [
  "单窗口",
  "左右双窗口",
  "上下双窗口",
  "上下三窗口",
  "左右三窗口",
  "左大右二",
  "上大下二",
  "四宫格",
  "上下四窗口",
  "左大右三",
  "上大下三",
  "六宫格",
  "六窗口混合",
  "八宫格",
  "八窗口混合",
  "九宫格",
];
export const presets = trees.map((tree, i) => ({
  id: `builtin-${i + 1}`,
  name: names[i],
  tree,
}));
export type Rect = { x: number; y: number; width: number; height: number };
export function slots(tree: Tree): number[] {
  return tree.kind === "leaf" ? [tree.slot] : tree.children.flatMap(slots);
}
export function calculate(
  tree: Tree,
  rect: Rect,
  gap = 4,
): { slot: number; rect: Rect }[] {
  if (tree.kind === "leaf") return [{ slot: tree.slot, rect }];
  let offset = 0;
  const length =
    (tree.axis === "x" ? rect.width : rect.height) -
    gap * (tree.children.length - 1);
  return tree.children.flatMap((child, i) => {
    const size = length * tree.ratios[i];
    const r =
      tree.axis === "x"
        ? { ...rect, x: rect.x + offset, width: size }
        : { ...rect, y: rect.y + offset, height: size };
    offset += size + gap;
    return calculate(child, r, gap);
  });
}
export function resizePair(
  ratios: number[],
  index: number,
  delta: number,
  min: number,
) {
  const result = [...ratios],
    sum = result[index] + result[index + 1];
  const floor = Math.min(min, sum / 2);
  result[index] = Math.max(floor, Math.min(sum - floor, result[index] + delta));
  result[index + 1] = sum - result[index];
  return result;
}
export function swap<T>(items: T[], a: number, b: number) {
  const result = [...items];
  [result[a], result[b]] = [result[b], result[a]];
  return result;
}
export function validTree(t: Tree) {
  const ordered = slots(t).sort((a, b) => a - b);
  return ordered.length <= 9 && ordered.every((slot, index) => slot === index);
}
