export const pageZoomSteps = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
  5,
];
export function nextPageZoom(value: number, direction: "in" | "out" | "reset") {
  if (direction === "reset") return 1;
  return direction === "in"
    ? (pageZoomSteps.find((v) => v > value + 0.0001) ?? 5)
    : ([...pageZoomSteps].reverse().find((v) => v < value - 0.0001) ?? 0.25);
}
