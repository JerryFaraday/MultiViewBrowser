import { slots } from "./LayoutManager";
import { newPage, type Snapshot } from "./model";
import { newPageDefaults, type Preferences } from "./Preferences";
export function openInEmptySlot(
  snapshot: Snapshot,
  url: string,
  preferences?: Preferences,
): Snapshot | null {
  const slot = slots(snapshot.tree)
    .sort((a, b) => a - b)
    .find((i) => !snapshot.pages[i]);
  if (slot === undefined) return null;
  const pages = [...snapshot.pages];
  while (pages.length <= slot) pages.push(null);
  pages[slot] = preferences
    ? newPageDefaults(newPage(url), preferences)
    : newPage(url);
  return { ...snapshot, pages };
}
