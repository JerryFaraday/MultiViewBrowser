import { slots } from "./LayoutManager";
import { newPage, type Snapshot } from "./model";
export function openInEmptySlot(
  snapshot: Snapshot,
  url: string,
): Snapshot | null {
  const slot = slots(snapshot.tree)
    .sort((a, b) => a - b)
    .find((i) => !snapshot.pages[i]);
  if (slot === undefined) return null;
  const pages = [...snapshot.pages];
  while (pages.length <= slot) pages.push(null);
  pages[slot] = newPage(url);
  return { ...snapshot, pages };
}
