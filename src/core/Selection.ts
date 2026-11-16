import type { Snapshot } from "./model";
import { slots } from "./LayoutManager";
export function visibleSelection(
  snapshot: Snapshot,
  requested: number,
  pageId?: string,
  preferActive = false,
) {
  const visible = slots(snapshot.tree);
  const same = pageId
    ? visible.find((i) => snapshot.pages[i]?.id === pageId)
    : undefined;
  if (same !== undefined) return same;
  if (visible.includes(requested) && !pageId && !preferActive) return requested;
  return visible.find((i) => !!snapshot.pages[i]) ?? visible[0] ?? 0;
}
