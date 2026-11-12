import type { Page } from "./model";
import { swap } from "./LayoutManager";
export function isMuted(page: Page, slot: number) {
  return (
    page.volume === 0 ||
    page.audio === "muted" ||
    (page.audio === "auto" && slot !== 0)
  );
}
export function swapPages(pages: Page[], from: number, to: number): Page[];
export function swapPages(
  pages: (Page | null)[],
  from: number,
  to: number,
): (Page | null)[];
export function swapPages(pages: (Page | null)[], from: number, to: number) {
  if (from === to || (!pages[from] && !pages[to])) return pages;
  const padded = [...pages];
  while (padded.length <= Math.max(from, to)) padded.push(null);
  const result = swap(padded, from, to);
  // Promotion resets previous manual mute; subsequent manual choices still work.
  if ((from === 0 || to === 0) && result[0])
    result[0] = {
      ...result[0],
      audio: "auto",
      volume: result[0].volume === 0 ? 100 : result[0].volume,
    };
  // Leaving the main slot resets manual unmute; retain the page's volume value.
  if (from === 0 || to === 0) {
    const secondary = from === 0 ? to : from;
    if (result[secondary])
      result[secondary] = { ...result[secondary], audio: "auto" };
  }
  return result;
}
export function snapVolume(value: number) {
  const clamped = Math.max(0, Math.min(150, value));
  return (
    [25, 50, 75, 100].find((mark) => Math.abs(mark - clamped) <= 3) ?? clamped
  );
}
export function stepVolume(value: number, direction: 1 | -1) {
  return Math.max(
    0,
    Math.min(
      150,
      (direction === 1 ? Math.floor(value / 5) + 1 : Math.ceil(value / 5) - 1) *
        5,
    ),
  );
}

export function effectiveVolume(master: number, page: number) {
  return (master * page) / 100;
}

export function setPageVolume(
  page: Page,
  value: Page["volume"],
  userInitiated: boolean,
) {
  page.volume = value;
  if (userInitiated && value > 0) page.audio = "unmuted";
}
