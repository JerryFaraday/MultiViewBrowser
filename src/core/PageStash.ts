import { newPage, type Config } from "./model";
import { slots } from "./LayoutManager";
export function parkPage(c: Config, id: string) {
  const slot = c.session.pages.findIndex((p) => p?.id === id),
    page = c.session.pages[slot];
  if (!page || c.pageStash.length >= 5000) return false;
  c.pageStash.push({
    id: page.id,
    url: page.url,
    title: page.title || page.url,
    page,
  });
  c.session.pages[slot] = null;
  return true;
}
export function placeStashed(c: Config, id: string, target?: number) {
  const index = c.pageStash.findIndex((p) => p.id === id),
    item = c.pageStash[index];
  const slot =
    target ??
    slots(c.session.tree)
      .sort((a, b) => a - b)
      .find((i) => !c.session.pages[i]);
  if (!item || slot === undefined || !slots(c.session.tree).includes(slot))
    return undefined;
  const page = item.page ?? newPage(item.url),
    old = c.session.pages[slot];
  if (slot === 0) {
    page.audio = "auto";
    if (page.volume === 0) page.volume = 100;
  } else page.audio = "auto";
  while (c.session.pages.length <= slot) c.session.pages.push(null);
  c.session.pages[slot] = page;
  if (old)
    c.pageStash[index] = {
      id: old.id,
      url: old.url,
      title: old.title || old.url,
      page: old,
    };
  else c.pageStash.splice(index, 1);
  return page.id;
}
